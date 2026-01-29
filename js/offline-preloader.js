/**
 * Viltrum Fitness - Comprehensive Offline Preloader V7
 * Loads and caches ALL resources at login for complete offline functionality
 * 
 * V7 Features:
 * - Supports Plans structure (combined muscle + run workouts)
 * - Persistent preload state across page navigation
 * - Auto-resumes interrupted preloads
 * - Progress synced via localStorage events
 */

const OfflinePreloader = {
  DB_NAME: 'ViltrumOfflineDB',
  DB_VERSION: 3, // Incrementato per V7 - aggiunge PLANS_DATA store
  db: null,
  isPreloading: false,

  STORES: {
    METADATA: 'metadata',
    WORKOUT_DATA: 'workoutData',
    PLANS_DATA: 'plansData',
    IMAGES: 'images',
    AUDIO: 'audio',
    NUTRITION: 'nutrition',
    PROGRESS: 'userProgress'
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // DATABASE OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  async initDB() {
    if (this.db) return this.db;
    
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        Object.values(this.STORES).forEach(storeName => {
          if (!db.objectStoreNames.contains(storeName)) {
            const keyPath = storeName === 'images' ? 'url' : 
                           storeName === 'audio' ? 'key' :
                           storeName === 'nutrition' ? 'email' :
                           storeName === 'userProgress' ? 'id' : 'key';
            db.createObjectStore(storeName, { keyPath });
          }
        });
        
        console.log('📦 IndexedDB V7 initialized');
      };
    });
  },

  async getFromDB(storeName, key) {
    if (!this.db) await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async putInDB(storeName, data) {
    if (!this.db) await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(data);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async getAllFromDB(storeName) {
    if (!this.db) await this.initDB();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PRELOAD STATE MANAGEMENT (Persists across page navigation)
  // ═══════════════════════════════════════════════════════════════════════════

  getPreloadState() {
    try {
      const state = localStorage.getItem('viltrum_preload_state');
      return state ? JSON.parse(state) : null;
    } catch (e) {
      return null;
    }
  },

  setPreloadState(state) {
    localStorage.setItem('viltrum_preload_state', JSON.stringify({
      ...state,
      timestamp: Date.now()
    }));
    // Dispatch event so other tabs/pages can react
    window.dispatchEvent(new CustomEvent('preloadStateChange', { detail: state }));
  },

  clearPreloadState() {
    localStorage.removeItem('viltrum_preload_state');
  },

  // Broadcast progress to all pages
  broadcastProgress(data) {
    this.setPreloadState({
      status: 'loading',
      ...data
    });
    window.dispatchEvent(new CustomEvent('preloadProgress', { detail: data }));
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CHECK IF UPDATE NEEDED
  // ═══════════════════════════════════════════════════════════════════════════

  async needsUpdate(email) {
    const metadata = await this.getFromDB(this.STORES.METADATA, 'lastUpdate');
    const cachedUser = await this.getFromDB(this.STORES.METADATA, 'cachedUser');
    const preloadComplete = await this.getFromDB(this.STORES.METADATA, 'preloadComplete');
    
    // Check for interrupted preload in localStorage
    const preloadState = this.getPreloadState();
    if (preloadState && preloadState.status === 'loading') {
      console.log('🔄 Found interrupted preload, resuming...');
      return { needsUpdate: true, reason: 'interrupted', resumeFrom: preloadState };
    }
    
    if (!cachedUser || cachedUser.value !== email) {
      console.log('🔄 Different user, full reload needed');
      await this.putInDB(this.STORES.METADATA, { key: 'preloadComplete', value: false });
      return { needsUpdate: true, reason: 'user_changed' };
    }
    
    if (!preloadComplete || preloadComplete.value !== true) {
      console.log('🔄 Preload incomplete, resuming...');
      return { needsUpdate: true, reason: 'incomplete' };
    }

    if (metadata && metadata.value) {
      const hoursSinceUpdate = (Date.now() - metadata.value) / (1000 * 60 * 60);
      if (hoursSinceUpdate < 24) {
        console.log(`✅ Cache fresh (${hoursSinceUpdate.toFixed(1)}h old)`);
        return { needsUpdate: false };
      }
    }

    return { needsUpdate: true, reason: 'stale_cache' };
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // V7: COLLECT ALL RESOURCES FROM PLANS
  // ═══════════════════════════════════════════════════════════════════════════

  collectResourcesFromPlans(userInfo) {
    const imageUrls = new Set();
    const audioTexts = new Map();
    
    // Common app images
    imageUrls.add('https://lh3.googleusercontent.com/d/1va6OkGp9yAHDJBfeDM3npwqlJJoLUh5C'); // Logo
    imageUrls.add('https://lh3.googleusercontent.com/d/1Ee4DY-EGnTI9YPrIB0wj6v8pX7KW8Hpt'); // Warmup
    imageUrls.add('https://lh3.googleusercontent.com/d/1FS2HKfaJ6MIfpyzJirU6dWQ7K-5kbC9j'); // Ready
    imageUrls.add('https://lh3.googleusercontent.com/d/1bibXbdrcXdh3vgNHp2Teby3ClS3VqZmb'); // Rest
    imageUrls.add('https://lh3.googleusercontent.com/d/1Vs1-VgiJi8rTbssSj-2ThcyDraRoTE2g'); // Good Job
    
    // Get user's plans
    const plans = userInfo.plans || [];
    const allPlansData = userInfo.allPlansData || {};
    const allWorkoutsData = userInfo.allWorkoutsData || {};
    const runWorkouts = userInfo.runWorkouts || {};
    
    // Iterate through each plan
    plans.forEach(planName => {
      const plan = allPlansData[planName];
      if (!plan || !plan.workouts) return;
      
      plan.workouts.forEach(workout => {
        if (workout.type === 'muscle') {
          // Muscle workout - get images and audio texts
          const workoutData = allWorkoutsData[workout.name];
          if (workoutData && workoutData.exercises) {
            workoutData.exercises.forEach(exercise => {
              // Images
              if (exercise.imageUrl) {
                imageUrls.add(exercise.imageUrl);
              }
              
              // Audio texts
              if (exercise.name) {
                const normalized = exercise.name.trim().replace(/\s+/g, ' ');
                audioTexts.set(normalized, normalized);
              }
            });
          }
        } else if (workout.type === 'run') {
          // Run workout - mainly text-based, collect any audio keys
          const runData = runWorkouts[workout.name];
          if (runData && runData.lines) {
            runData.lines.forEach(line => {
              if (line.audioKey) {
                audioTexts.set(line.audioKey, line.audioKey);
              }
            });
          }
        }
      });
    });
    
    // Add common workout cues
    ['Mancano 60 secondi', 'Mancano 30 secondi', 'Mancano 10 secondi', 
     '5', '4', '3', '2', '1', 'Prossimo esercizio', 'Ottimo lavoro'].forEach(text => {
      audioTexts.set(text, text);
    });
    
    return {
      imageUrls: Array.from(imageUrls),
      audioTexts: Array.from(audioTexts.values())
    };
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PRELOAD IMAGES
  // ═══════════════════════════════════════════════════════════════════════════

  async preloadImages(imageUrls, startIndex = 0) {
    console.log(`🖼️ Preloading ${imageUrls.length} images (starting from ${startIndex})...`);
    
    for (let i = startIndex; i < imageUrls.length; i++) {
      const url = imageUrls[i];
      
      try {
        // Check if already cached
        const cached = await this.getFromDB(this.STORES.IMAGES, url);
        if (cached && cached.blob) {
          this.broadcastProgress({ 
            phase: 'images', 
            current: i + 1, 
            total: imageUrls.length,
            percent: Math.round(((i + 1) / imageUrls.length) * 100)
          });
          continue;
        }

        // Fetch and cache
        const response = await fetch(url);
        const blob = await response.blob();
        
        await this.putInDB(this.STORES.IMAGES, {
          url: url,
          blob: blob,
          timestamp: Date.now()
        });

        this.broadcastProgress({ 
          phase: 'images', 
          current: i + 1, 
          total: imageUrls.length,
          percent: Math.round(((i + 1) / imageUrls.length) * 100)
        });

      } catch (error) {
        console.warn(`⚠️ Failed to cache image: ${url.substring(0, 50)}...`);
      }
      
      // Small delay to not block UI
      if (i % 5 === 0) {
        await new Promise(r => setTimeout(r, 10));
      }
    }

    console.log(`✅ Images preloaded`);
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PRELOAD TTS AUDIO
  // ═══════════════════════════════════════════════════════════════════════════

  async preloadTTSAudio(audioTexts, startIndex = 0) {
    const TTS_URL = "https://google-tts-server.onrender.com/speak";
    console.log(`🔊 Preloading ${audioTexts.length} TTS audio files (starting from ${startIndex})...`);
    
    for (let i = startIndex; i < audioTexts.length; i++) {
      const text = audioTexts[i];
      const key = `tts_${text}`;
      
      try {
        // Check if already cached
        const cached = await this.getFromDB(this.STORES.AUDIO, key);
        if (cached && cached.blob) {
          this.broadcastProgress({ 
            phase: 'audio', 
            current: i + 1, 
            total: audioTexts.length,
            percent: Math.round(((i + 1) / audioTexts.length) * 100)
          });
          continue;
        }

        // Fetch from TTS server (POST request)
        const response = await fetch(TTS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: text, lang: 'it-IT' })
        });
        
        if (response.ok) {
          const blob = await response.blob();
          await this.putInDB(this.STORES.AUDIO, {
            key: key,
            text: text,
            blob: blob,
            timestamp: Date.now()
          });
        }

        this.broadcastProgress({ 
          phase: 'audio', 
          current: i + 1, 
          total: audioTexts.length,
          percent: Math.round(((i + 1) / audioTexts.length) * 100)
        });

      } catch (error) {
        // Skip TTS errors silently - will use fallback synth voice
      }
      
      // Rate limit TTS requests
      if (i % 3 === 0) {
        await new Promise(r => setTimeout(r, 100));
      }
    }

    console.log(`✅ TTS audio preloaded`);
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PRELOAD NUTRITION PDF
  // ═══════════════════════════════════════════════════════════════════════════

  async preloadNutrition(nutritionPdfUrl, email) {
    if (!nutritionPdfUrl) {
      console.log('ℹ️ No nutrition plan to preload');
      return;
    }

    try {
      // Check if already cached
      const cached = await this.getFromDB(this.STORES.NUTRITION, email);
      if (cached && cached.blob && cached.url === nutritionPdfUrl) {
        console.log('✅ Nutrition PDF already cached');
        return;
      }

      console.log('🥗 Preloading nutrition PDF...');
      this.broadcastProgress({ phase: 'nutrition', current: 0, total: 1, percent: 0 });
      
      const response = await fetch(nutritionPdfUrl);
      const blob = await response.blob();
      
      await this.putInDB(this.STORES.NUTRITION, {
        email: email,
        url: nutritionPdfUrl,
        blob: blob,
        timestamp: Date.now()
      });

      this.broadcastProgress({ phase: 'nutrition', current: 1, total: 1, percent: 100 });
      console.log('✅ Nutrition PDF preloaded');

    } catch (error) {
      console.warn('⚠️ Failed to cache nutrition PDF:', error);
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PRELOAD USER PROGRESS FROM CLOUD
  // ═══════════════════════════════════════════════════════════════════════════

  async preloadUserProgress(email, scriptUrl) {
    try {
      console.log('📊 Syncing user progress from cloud...');
      
      const url = `${scriptUrl}?action=getAllProgress&email=${encodeURIComponent(email)}`;
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.status === 'success' && data.progress) {
        await this.putInDB(this.STORES.PROGRESS, {
          id: email,
          progress: data.progress,
          timestamp: Date.now()
        });
        
        // Also save to localStorage for quick access
        Object.entries(data.progress).forEach(([planName, progress]) => {
          localStorage.setItem(`viltrum_plan_progress_${planName}`, JSON.stringify(progress));
        });
        
        console.log('✅ User progress synced');
      }
    } catch (error) {
      console.warn('⚠️ Failed to sync progress:', error);
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN PRELOAD FUNCTION
  // ═══════════════════════════════════════════════════════════════════════════

  async preloadAll(userInfo, options = {}) {
    if (this.isPreloading) {
      console.log('⏭️ Preload already in progress');
      return { success: true, cached: true, skipped: true };
    }

    const { onProgress = null, forceUpdate = false } = options;

    try {
      this.isPreloading = true;
      console.log('🚀 Starting V7.1 offline preload...');
      
      await this.initDB();

      // ═══════════════════════════════════════════════════════════════════════
      // V7.1: Check Service Worker cache first (persisted across sessions)
      // ═══════════════════════════════════════════════════════════════════════
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        const swStatus = await this.checkServiceWorkerCache(userInfo.email);
        if (swStatus.complete && !forceUpdate) {
          console.log(`✅ Service Worker cache complete (${swStatus.ageInDays} days old)`);
          console.log(`   📸 ${swStatus.imagesLoaded} images, 🔊 ${swStatus.audioLoaded} audio cached`);
          
          // Still check IndexedDB for user data
          await this.ensureUserDataCached(userInfo, options);
          
          window.dispatchEvent(new CustomEvent('preloadProgress', { detail: { status: 'complete' } }));
          window.dispatchEvent(new CustomEvent('preloadComplete'));
          this.isPreloading = false;
          return { success: true, cached: true, fromServiceWorker: true };
        }
      }

      // Check IndexedDB cache
      const updateCheck = await this.needsUpdate(userInfo.email);
      if (!updateCheck.needsUpdate && !forceUpdate) {
        console.log('✅ All data already cached in IndexedDB');
        this.clearPreloadState();
        this.isPreloading = false;
        return { success: true, cached: true };
      }

      const startTime = Date.now();
      
      // Mark as in-progress
      await this.putInDB(this.STORES.METADATA, { key: 'preloadComplete', value: false });
      this.setPreloadState({ status: 'loading', phase: 'init' });

      // 1. Cache user data
      console.log('📊 Caching user data...');
      await this.putInDB(this.STORES.WORKOUT_DATA, {
        key: 'current_user',
        email: userInfo.email,
        data: userInfo,
        timestamp: Date.now()
      });

      // 2. Cache plans data
      await this.putInDB(this.STORES.PLANS_DATA, {
        key: 'plans',
        plans: userInfo.allPlansData || {},
        timestamp: Date.now()
      });

      // 3. Collect resources from plans
      const { imageUrls, audioTexts } = this.collectResourcesFromPlans(userInfo);
      console.log(`📦 Found ${imageUrls.length} images, ${audioTexts.length} audio texts`);

      // ═══════════════════════════════════════════════════════════════════════
      // V7.1: Delegate heavy lifting to Service Worker (continues in background)
      // ═══════════════════════════════════════════════════════════════════════
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        console.log('📡 Delegating preload to Service Worker (will continue in background)');
        
        navigator.serviceWorker.controller.postMessage({
          type: 'START_PRELOAD',
          data: {
            email: userInfo.email,
            imageUrls: imageUrls,
            audioTexts: audioTexts,
            ttsUrl: 'https://google-tts-server.onrender.com/speak'
          }
        });
        
        // Listen for progress updates from Service Worker
        this.setupServiceWorkerListeners();
        
        // Sync user progress from cloud
        if (options.scriptUrl) {
          await this.preloadUserProgress(userInfo.email, options.scriptUrl);
        }
        
        // Mark IndexedDB as complete (SW handles the rest)
        await this.putInDB(this.STORES.METADATA, { key: 'lastUpdate', value: Date.now() });
        await this.putInDB(this.STORES.METADATA, { key: 'cachedUser', value: userInfo.email });
        await this.putInDB(this.STORES.METADATA, { key: 'preloadComplete', value: true });
        
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`✅ V7.1 Preload delegated to SW in ${duration}s`);
        
        return { 
          success: true, 
          delegatedToSW: true,
          stats: { images: imageUrls.length, audio: audioTexts.length, duration }
        };
      }

      // ═══════════════════════════════════════════════════════════════════════
      // Fallback: No Service Worker, do everything in main thread
      // ═══════════════════════════════════════════════════════════════════════
      console.log('⚠️ No Service Worker, preloading in main thread');

      // 4. Preload images
      this.setPreloadState({ status: 'loading', phase: 'images', total: imageUrls.length });
      await this.preloadImages(imageUrls);

      // 5. Preload TTS audio
      this.setPreloadState({ status: 'loading', phase: 'audio', total: audioTexts.length });
      await this.preloadTTSAudio(audioTexts);

      // 6. Preload nutrition
      if (userInfo.nutritionPdfUrl) {
        this.setPreloadState({ status: 'loading', phase: 'nutrition' });
        await this.preloadNutrition(userInfo.nutritionPdfUrl, userInfo.email);
      }

      // 7. Sync user progress from cloud
      if (options.scriptUrl) {
        await this.preloadUserProgress(userInfo.email, options.scriptUrl);
      }

      // 8. Mark complete
      await this.putInDB(this.STORES.METADATA, { key: 'lastUpdate', value: Date.now() });
      await this.putInDB(this.STORES.METADATA, { key: 'cachedUser', value: userInfo.email });
      await this.putInDB(this.STORES.METADATA, { key: 'preloadComplete', value: true });
      
      this.setPreloadState({ status: 'complete' });
      this.clearPreloadState();
      
      // Broadcast completion event to hide progress bar
      window.dispatchEvent(new CustomEvent('preloadProgress', { detail: { status: 'complete' } }));
      window.dispatchEvent(new CustomEvent('preloadComplete'));

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`✅ V7.1 Preload complete in ${duration}s`);

      return { 
        success: true, 
        stats: { images: imageUrls.length, audio: audioTexts.length, duration }
      };

    } catch (error) {
      console.error('❌ Preload failed:', error);
      this.setPreloadState({ status: 'error', error: error.message });
      return { success: false, error: error.message };
    } finally {
      this.isPreloading = false;
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // V7.1: SERVICE WORKER COMMUNICATION
  // ═══════════════════════════════════════════════════════════════════════════

  async checkServiceWorkerCache(email) {
    return new Promise((resolve) => {
      if (!navigator.serviceWorker || !navigator.serviceWorker.controller) {
        resolve({ complete: false, reason: 'no_sw' });
        return;
      }
      
      const timeout = setTimeout(() => {
        resolve({ complete: false, reason: 'timeout' });
      }, 3000);
      
      const messageHandler = (event) => {
        if (event.data && event.data.type === 'PRELOAD_STATUS') {
          clearTimeout(timeout);
          navigator.serviceWorker.removeEventListener('message', messageHandler);
          resolve(event.data);
        }
      };
      
      navigator.serviceWorker.addEventListener('message', messageHandler);
      navigator.serviceWorker.controller.postMessage({
        type: 'CHECK_PRELOAD_STATUS',
        data: { email }
      });
    });
  },

  setupServiceWorkerListeners() {
    if (this._swListenersSetup) return;
    this._swListenersSetup = true;
    
    navigator.serviceWorker.addEventListener('message', (event) => {
      const { type, phase, current, total, percent } = event.data || {};
      
      if (type === 'PRELOAD_PROGRESS') {
        this.broadcastProgress({ phase, current, total, percent });
      }
      
      if (type === 'PRELOAD_COMPLETE' || type === 'PRELOAD_ALREADY_COMPLETE') {
        console.log('✅ Service Worker preload complete');
        window.dispatchEvent(new CustomEvent('preloadProgress', { detail: { status: 'complete' } }));
        window.dispatchEvent(new CustomEvent('preloadComplete'));
      }
      
      if (type === 'PRELOAD_ERROR') {
        console.error('❌ Service Worker preload error:', event.data.error);
        window.dispatchEvent(new CustomEvent('preloadProgress', { detail: { status: 'error' } }));
      }
    });
  },

  async ensureUserDataCached(userInfo, options) {
    // Make sure IndexedDB has user data even if SW has images/audio
    await this.putInDB(this.STORES.WORKOUT_DATA, {
      key: 'current_user',
      email: userInfo.email,
      data: userInfo,
      timestamp: Date.now()
    });
    
    await this.putInDB(this.STORES.PLANS_DATA, {
      key: 'plans',
      plans: userInfo.allPlansData || {},
      timestamp: Date.now()
    });
    
    await this.putInDB(this.STORES.METADATA, { key: 'lastUpdate', value: Date.now() });
    await this.putInDB(this.STORES.METADATA, { key: 'cachedUser', value: userInfo.email });
    await this.putInDB(this.STORES.METADATA, { key: 'preloadComplete', value: true });
    
    // Sync progress if needed
    if (options.scriptUrl) {
      await this.preloadUserProgress(userInfo.email, options.scriptUrl);
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CACHE GETTERS
  // ═══════════════════════════════════════════════════════════════════════════

  async getCachedImage(url) {
    // V7.1: First check Service Worker cache
    if ('caches' in window) {
      try {
        const cache = await caches.open('viltrum-preload-v7.1.0');
        const response = await cache.match(url);
        if (response) {
          const blob = await response.blob();
          return URL.createObjectURL(blob);
        }
      } catch (e) {}
    }
    
    // Fallback to IndexedDB
    try {
      const cached = await this.getFromDB(this.STORES.IMAGES, url);
      if (cached && cached.blob) {
        return URL.createObjectURL(cached.blob);
      }
    } catch (e) {}
    return null;
  },

  async getCachedAudio(key) {
    try {
      const cached = await this.getFromDB(this.STORES.AUDIO, key);
      if (cached && cached.blob) {
        return URL.createObjectURL(cached.blob);
      }
    } catch (e) {}
    return null;
  },

  async getCachedTTS(text) {
    // V7.1: First check Service Worker cache
    if ('caches' in window) {
      try {
        const cache = await caches.open('viltrum-preload-v7.1.0');
        const response = await cache.match(`tts:${text}`);
        if (response) {
          const blob = await response.blob();
          return URL.createObjectURL(blob);
        }
      } catch (e) {}
    }
    
    // Fallback to IndexedDB
    return this.getCachedAudio(`tts_${text}`);
  },

  async getCachedNutrition(email) {
    try {
      const cached = await this.getFromDB(this.STORES.NUTRITION, email);
      if (cached && cached.blob) {
        return URL.createObjectURL(cached.blob);
      }
    } catch (e) {}
    return null;
  },

  async getCachedUserData() {
    try {
      const cached = await this.getFromDB(this.STORES.WORKOUT_DATA, 'current_user');
      return cached ? cached.data : null;
    } catch (e) {}
    return null;;
  },

  async getCachedPlans() {
    try {
      const cached = await this.getFromDB(this.STORES.PLANS_DATA, 'plans');
      return cached ? cached.plans : null;
    } catch (e) {}
    return null;
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CLEAR CACHE
  // ═══════════════════════════════════════════════════════════════════════════

  async clearCache() {
    try {
      if (!this.db) await this.initDB();
      
      for (const storeName of Object.values(this.STORES)) {
        const transaction = this.db.transaction([storeName], 'readwrite');
        await transaction.objectStore(storeName).clear();
      }
      
      this.clearPreloadState();
      console.log('🗑️ All offline cache cleared');
      return { success: true };
    } catch (error) {
      console.error('Failed to clear cache:', error);
      return { success: false, error: error.message };
    }
  }
};

// Listen for preload state changes from other pages
window.addEventListener('storage', (e) => {
  if (e.key === 'viltrum_preload_state') {
    const state = e.newValue ? JSON.parse(e.newValue) : null;
    if (state) {
      window.dispatchEvent(new CustomEvent('preloadProgress', { detail: state }));
    }
  }
});

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = OfflinePreloader;
}

window.OfflinePreloader = OfflinePreloader;