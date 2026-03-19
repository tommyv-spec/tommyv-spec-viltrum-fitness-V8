/**
 * Viltrum Fitness - Data Preloader V8.2
 * 
 * V8.2: Split loading — dashboard renders after light fetch (~700ms),
 * workout data loads in background (~2500ms).
 * Cached users still get instant loads from localStorage.
 */

import { GOOGLE_SCRIPT_URL } from './config.js';

const CACHE_KEY_USER = 'viltrum_user_info';
const CACHE_KEY_WORKOUTS = 'viltrum_workout_data';
const CACHE_MAX_AGE_USER = 24 * 60 * 60 * 1000;     // 24 hours — plan assignments rarely change
const CACHE_MAX_AGE_WORKOUTS = 24 * 60 * 60 * 1000;  // 24 hours — workout definitions rarely change

const DataPreloader = {
  _cache: {
    userData: null,
    plans: null,
    workouts: null,
    runWorkouts: null,
    userProgress: null,
    isLoaded: false,       // user info ready (dashboard can render)
    isLoading: false,
    workoutsReady: false,  // workout details ready (training can start)
    _workoutsLoading: false,
    fromCache: false
  },
  
  /**
   * Load user info fast. Workout data follows in background.
   * Returns as soon as dashboard can render.
   */
  async loadAll(email) {
    const userEmail = email.toLowerCase();
    
    if (this._cache.isLoading) {
      console.log('⏳ DataPreloader: già in caricamento...');
      return this.waitForLoad();
    }
    
    if (this._cache.isLoaded && this._cache.userData?.email === userEmail) {
      console.log('✅ DataPreloader: dati già in memoria');
      return this._cache;
    }
    
    console.log('🚀 DataPreloader V8.2: caricamento per', userEmail);
    this._cache.isLoading = true;
    
    // STEP 1: Try new localStorage caches, then migrate old cache if needed
    let cachedUser = this._loadCache(CACHE_KEY_USER, CACHE_MAX_AGE_USER, userEmail);
    let cachedWorkouts = this._loadCache(CACHE_KEY_WORKOUTS, CACHE_MAX_AGE_WORKOUTS, userEmail);
    
    // Migrate old monolithic cache if new ones are empty
    if (!cachedUser) {
      const oldCache = this._migrateOldCache(userEmail);
      if (oldCache) {
        cachedUser = oldCache;
        cachedWorkouts = oldCache; // old cache has everything
      }
    }
    
    // Check for pre-fetched data from login page (sessionStorage)
    if (!cachedUser) {
      const prefetch = this._consumePrefetch(userEmail);
      if (prefetch) {
        cachedUser = prefetch;
        cachedWorkouts = prefetch;
      }
    }
    
    if (cachedUser) {
      this._applyUserInfo(cachedUser, true, userEmail);
      console.log('⚡ DataPreloader: user info da cache (instant)');
    }
    
    if (cachedWorkouts) {
      this._applyWorkoutData(cachedWorkouts);
      console.log('⚡ DataPreloader: workout data da cache (instant)');
    }
    
    // STEP 2: Preload food database in parallel
    this._preloadFoodDatabase();
    
    // STEP 3: If we had cached user info, we're done for the dashboard
    if (cachedUser) {
      this._cache.isLoading = false;
      
      // Background refresh user info
      this._fetchUserInfo(userEmail).then(fresh => {
        if (fresh) {
          this._applyUserInfo(fresh, false, userEmail);
          this._saveCache(CACHE_KEY_USER, fresh, userEmail);
          // If legacy fallback returned full data, apply workouts too
          if (fresh.workouts) {
            this._applyWorkoutData(fresh);
            this._saveCache(CACHE_KEY_WORKOUTS, {
              plans: fresh.plans, workouts: fresh.workouts, runWorkouts: fresh.runWorkouts
            }, userEmail);
            window.dispatchEvent(new CustomEvent('workoutDataReady'));
          }
          window.dispatchEvent(new CustomEvent('dataRefreshed', { 
            detail: { userData: this._cache.userData }
          }));
        }
      }).catch(err => console.warn('⚠️ Background user refresh failed:', err));
      
      // Background refresh workout data (always, to pick up sheet changes)
      this._loadWorkoutsBackground(userEmail);
      
      return this._cache;
    }
    
    // STEP 4: No user cache — fetch light endpoint (blocks, but fast ~700ms)
    // Falls back to legacy getUserData if new endpoint not deployed yet
    try {
      const freshUser = await this._fetchUserInfo(userEmail);
      if (freshUser) {
        this._applyUserInfo(freshUser, false, userEmail);
        this._saveCache(CACHE_KEY_USER, freshUser, userEmail);
        console.log('🔄 DataPreloader: user info dal server');
        
        // If legacy fallback returned full data (has workouts), use it all
        if (freshUser.workouts) {
          this._applyWorkoutData(freshUser);
          this._saveCache(CACHE_KEY_WORKOUTS, {
            plans: freshUser.plans, workouts: freshUser.workouts, runWorkouts: freshUser.runWorkouts
          }, userEmail);
          cachedWorkouts = true; // skip background fetch
          console.log('🔄 DataPreloader: full data from legacy endpoint');
        }
      } else {
        throw new Error('Empty response');
      }
    } catch (err) {
      console.error('❌ DataPreloader: fetch fallito:', err);
      this._cache.isLoading = false;
      throw err;
    }
    
    this._cache.isLoading = false;
    
    // STEP 5: Kick off heavy workout data in background (skip if already loaded)
    if (!cachedWorkouts) {
      this._loadWorkoutsBackground(userEmail);
    }
    
    return this._cache;
  },
  
  /**
   * Background-fetch workout data and merge into cache.
   */
  async _loadWorkoutsBackground(email) {
    if (this._cache._workoutsLoading) return;
    this._cache._workoutsLoading = true;
    
    try {
      const data = await this._fetchWorkoutData(email);
      if (data) {
        this._applyWorkoutData(data);
        this._saveCache(CACHE_KEY_WORKOUTS, data, email);
        console.log('🔄 DataPreloader: workout data aggiornati dal server');
        window.dispatchEvent(new CustomEvent('workoutDataReady'));
      }
    } catch (err) {
      console.warn('⚠️ DataPreloader: workout fetch fallito:', err);
    } finally {
      this._cache._workoutsLoading = false;
    }
  },
  
  /**
   * Wait until workout details are available.
   * Used by plan-view.html and workout.js before accessing exercise data.
   */
  async waitForWorkouts() {
    if (this._cache.workoutsReady) return this._cache;
    
    const timeout = Date.now() + 20000;
    return new Promise((resolve, reject) => {
      const check = () => {
        if (this._cache.workoutsReady) { resolve(this._cache); return; }
        if (Date.now() > timeout) {
          console.error('⏰ DataPreloader: waitForWorkouts timeout after 20s');
          reject(new Error('Workout data timeout'));
          return;
        }
        setTimeout(check, 50);
      };
      check();
    });
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // FETCH ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════════════
  
  async _fetchUserInfo(email) {
    const startTime = Date.now();
    
    // Try new light endpoint first
    try {
      const url = `${GOOGLE_SCRIPT_URL}?action=getUserInfo&email=${encodeURIComponent(email)}`;
      console.log('🌐 DataPreloader: fetching user info (light)...');
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      // Check if we got a valid split response (has user.plans)
      if (data.status === 'success' && data.user) {
        console.log(`📡 DataPreloader: user info in ${Date.now() - startTime}ms (server: ${data.loadTime}ms)`);
        return data;
      }
      // GAS returned something unexpected (old version?) — fall through
      console.log('⚠️ getUserInfo returned unexpected format, falling back to getUserData');
    } catch (err) {
      console.warn('⚠️ getUserInfo failed, falling back to getUserData:', err.message);
    }
    
    // Fallback: use old monolithic endpoint
    const data = await this._fetchUserDataLegacy(email);
    console.log(`📡 DataPreloader: user info via legacy in ${Date.now() - startTime}ms`);
    return data;
  },
  
  async _fetchWorkoutData(email) {
    const startTime = Date.now();
    
    // Try new heavy endpoint first
    try {
      const url = `${GOOGLE_SCRIPT_URL}?action=getWorkoutData&email=${encodeURIComponent(email)}`;
      console.log('🌐 DataPreloader: fetching workout data (heavy)...');
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (data.status === 'success' && data.workouts) {
        console.log(`📡 DataPreloader: workout data in ${Date.now() - startTime}ms (server: ${data.loadTime}ms)`);
        return data;
      }
      console.log('⚠️ getWorkoutData returned unexpected format, falling back to getUserData');
    } catch (err) {
      console.warn('⚠️ getWorkoutData failed, falling back to getUserData:', err.message);
    }
    
    // Fallback: use old monolithic endpoint
    const data = await this._fetchUserDataLegacy(email);
    console.log(`📡 DataPreloader: workout data via legacy in ${Date.now() - startTime}ms`);
    return data;
  },

  async _fetchUserDataLegacy(email) {
    const url = `${GOOGLE_SCRIPT_URL}?action=getUserData&email=${encodeURIComponent(email)}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (data.status === 'error') throw new Error(data.message || 'Server error');
    return data;
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CACHE (localStorage)
  // ═══════════════════════════════════════════════════════════════════════════
  
  _loadCache(key, maxAge, email) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const cached = JSON.parse(raw);
      if (cached._email !== email) return null;
      const age = Date.now() - (cached._timestamp || 0);
      cached._isStale = age > maxAge;
      if (cached._isStale) {
        console.log(`📦 Cache ${key} scaduta ma usabile (${Math.round(age/1000)}s fa)`);
      } else {
        console.log(`📦 Cache ${key} valida (${Math.round(age/1000)}s fa)`);
      }
      return cached;
    } catch (e) { return null; }
  },
  
  _saveCache(key, data, email) {
    try {
      data._email = email;
      data._timestamp = Date.now();
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
      console.warn('Failed to save cache ' + key + ':', e);
    }
  },
  
  /**
   * Migrate from old monolithic cache (viltrum_user_cache) to new split caches.
   * Returns the old data if valid, null otherwise.
   */
  _migrateOldCache(email) {
    try {
      const raw = localStorage.getItem('viltrum_user_cache');
      if (!raw) return null;
      const cached = JSON.parse(raw);
      
      // Old cache used cached.user?.email for identity
      if (cached.user?.email !== email) return null;
      
      const age = Date.now() - (cached._timestamp || 0);
      if (age > CACHE_MAX_AGE_WORKOUTS) return null; // too old
      
      console.log(`📦 Migrating old cache (${Math.round(age/1000)}s ago)`);
      
      // Save into new split caches
      this._saveCache(CACHE_KEY_USER, {
        user: cached.user, plans: cached.plans, progress: cached.progress
      }, email);
      this._saveCache(CACHE_KEY_WORKOUTS, {
        plans: cached.plans, workouts: cached.workouts, runWorkouts: cached.runWorkouts
      }, email);
      
      // Clean up old key
      localStorage.removeItem('viltrum_user_cache');
      
      return cached;
    } catch (e) { return null; }
  },
  
  /**
   * Consume pre-fetched data from login page (stored in sessionStorage).
   * Saves into proper localStorage caches and returns the data.
   */
  _consumePrefetch(email) {
    try {
      const raw = sessionStorage.getItem('viltrum_prefetch');
      if (!raw) return null;
      sessionStorage.removeItem('viltrum_prefetch');
      const data = JSON.parse(raw);
      if (data.user?.email?.toLowerCase() !== email) return null;
      
      this._saveCache(CACHE_KEY_USER, {
        user: data.user, plans: data.plans, progress: data.progress
      }, email);
      this._saveCache(CACHE_KEY_WORKOUTS, {
        plans: data.plans, workouts: data.workouts, runWorkouts: data.runWorkouts
      }, email);
      
      console.log('⚡ DataPreloader: using pre-fetched data from login');
      return data;
    } catch (e) { return null; }
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // APPLY DATA
  // ═══════════════════════════════════════════════════════════════════════════
  
  _applyUserInfo(data, fromCache, fallbackEmail = '') {
    this._cache.userData = {
      email: data.user?.email || fallbackEmail,
      fullName: data.user?.fullName || localStorage.getItem('userName') || 'User',
      scadenza: data.user?.scadenza,
      plans: data.user?.plans || [],
      nutritionPdfUrl: data.user?.nutritionPdfUrl,
      nutritionScadenza: data.user?.nutritionScadenza
    };
    if (data.plans) this._cache.plans = data.plans;
    if (data.progress) this._cache.userProgress = data.progress;
    this._cache.isLoaded = true;
    this._cache.fromCache = fromCache;
    sessionStorage.setItem('viltrum_user_email', this._cache.userData.email);
  },
  
  _applyWorkoutData(data) {
    if (data.workouts) this._cache.workouts = data.workouts;
    if (data.runWorkouts) this._cache.runWorkouts = data.runWorkouts;
    if (data.plans) this._cache.plans = data.plans;
    this._cache.workoutsReady = true;
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // FOOD DATABASE
  // ═══════════════════════════════════════════════════════════════════════════
  
  async _preloadFoodDatabase() {
    if (sessionStorage.getItem('viltrum_food_database')) return;
    try {
      let response = await fetch('./food-database.json');
      if (!response.ok) response = await fetch('../food-database.json');
      if (response.ok) {
        const data = await response.json();
        sessionStorage.setItem('viltrum_food_database', JSON.stringify(data));
        console.log('✅ Food database preloaded');
        window.dispatchEvent(new CustomEvent('foodDatabaseReady'));
      }
    } catch (e) {
      console.warn('⚠️ Could not preload food database:', e);
    }
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // FORCE REFRESH
  // ═══════════════════════════════════════════════════════════════════════════
  
  async forceRefresh(email) {
    const userEmail = email.toLowerCase();
    console.log('🔄 DataPreloader: force refresh per', userEmail);
    this._cache.isLoading = true;
    try {
      const freshData = await this._fetchUserDataLegacy(userEmail);
      if (freshData) {
        this._applyUserInfo(freshData, false, userEmail);
        this._applyWorkoutData(freshData);
        this._saveCache(CACHE_KEY_USER, {
          user: freshData.user, plans: freshData.plans, progress: freshData.progress
        }, userEmail);
        this._saveCache(CACHE_KEY_WORKOUTS, {
          plans: freshData.plans, workouts: freshData.workouts, runWorkouts: freshData.runWorkouts
        }, userEmail);
      }
      return this._cache;
    } finally {
      this._cache.isLoading = false;
    }
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // WAIT / STATUS
  // ═══════════════════════════════════════════════════════════════════════════
  
  async waitForLoad() {
    const timeout = Date.now() + 15000;
    while (this._cache.isLoading && !this._cache.isLoaded) {
      if (Date.now() > timeout) {
        console.error('⏰ DataPreloader: waitForLoad timeout after 15s');
        this._cache.isLoading = false;
        break;
      }
      await new Promise(r => setTimeout(r, 50));
    }
    return this._cache;
  },
  
  isReady() { return this._cache.isLoaded; },
  isWorkoutsReady() { return this._cache.workoutsReady; },
  isFromCache() { return this._cache.fromCache; },
  getUserData() { return this._cache.userData; },
  getPlans() { return this._cache.plans || {}; },
  getPlan(planName) { return this._cache.plans?.[planName] || null; },
  
  getPlanWithDetails(planName) {
    const plan = this._cache.plans?.[planName];
    if (!plan) return null;
    
    const workoutsWithDetails = plan.workouts.map(w => {
      let workoutData = null;
      let workoutType = w.type;
      
      if (workoutType === 'muscle' || workoutType === 'unknown') {
        workoutData = this._cache.workouts?.[w.name];
        if (workoutData) workoutType = 'muscle';
      }
      if (!workoutData && (workoutType === 'run' || workoutType === 'unknown')) {
        workoutData = this._cache.runWorkouts?.[w.name];
        if (workoutData) workoutType = 'run';
      }
      
      let details = null;
      let previewInfo = '';
      
      if (workoutData) {
        if (workoutType === 'muscle') {
          details = {
            exercises: workoutData.exercises || [],
            instructions: workoutData.instructions || '',
            materiale: workoutData.materiale || []
          };
          previewInfo = `${workoutData.exercises?.length || 0} esercizi`;
        } else if (workoutType === 'run') {
          details = {
            phases: workoutData.phases || [],
            totalPhases: workoutData.totalPhases || workoutData.phases?.length || 0,
            estimatedDistance: workoutData.estimatedDistance,
            estimatedTime: workoutData.estimatedTime
          };
          previewInfo = workoutData.estimatedDistance || 
                        workoutData.estimatedTime || 
                        `${workoutData.phases?.length || 0} fasi`;
        }
      }
      
      return {
        ...w, type: workoutType, details, previewInfo,
        exercises: workoutData?.exercises || [],
        phases: workoutData?.phases || [],
        instructions: workoutData?.instructions || '',
        data: workoutData
      };
    });
    
    return {
      name: planName,
      workouts: workoutsWithDetails,
      totalWorkouts: plan.totalWorkouts || workoutsWithDetails.length
    };
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // MUSCLE WORKOUTS
  // ═══════════════════════════════════════════════════════════════════════════
  getAllMuscleWorkouts() { return this._cache.workouts || {}; },
  getMuscleWorkout(name) { return this._cache.workouts?.[name] || null; },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // RUN WORKOUTS V2 (Phase-based)
  // ═══════════════════════════════════════════════════════════════════════════
  getAllRunWorkouts() { return this._cache.runWorkouts || {}; },
  getRunWorkout(name) { return this._cache.runWorkouts?.[name] || null; },
  
  getRunWorkoutExpanded(name) {
    const workout = this._cache.runWorkouts?.[name];
    if (!workout?.phases) return null;
    const expanded = this._expandPhases(workout.phases);
    return { ...workout, expandedPhases: expanded, totalExpandedPhases: expanded.length };
  },
  
  _expandPhases(phases) {
    const expanded = [];
    let i = 0;
    while (i < phases.length) {
      const phase = phases[i];
      if (phase.loopGroup) {
        const loopPhases = [];
        const loopGroup = phase.loopGroup;
        const loopCount = phase.loopCount || 1;
        while (i < phases.length && phases[i].loopGroup === loopGroup) {
          loopPhases.push(phases[i]); i++;
        }
        for (let rep = 1; rep <= loopCount; rep++) {
          loopPhases.forEach(lp => {
            expanded.push({ ...lp, _loopRep: rep, _loopTotal: loopCount, _loopSize: loopPhases.length });
          });
        }
      } else {
        expanded.push({ ...phase, _loopRep: null, _loopTotal: null }); i++;
      }
    }
    return expanded;
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PROGRESS TRACKING
  // ═══════════════════════════════════════════════════════════════════════════
  getAllProgress() {
    const progress = { ...(this._cache.userProgress || {}) };
    
    // Merge any localStorage progress that workout.js saved directly
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('viltrum_plan_progress_')) {
          const planName = key.replace('viltrum_plan_progress_', '');
          const local = JSON.parse(localStorage.getItem(key));
          if (!progress[planName] || (local.lastWorkoutIndex ?? -1) > (progress[planName]?.lastWorkoutIndex ?? -1)) {
            progress[planName] = { ...progress[planName], ...local };
          }
        }
      }
    } catch (e) {}
    
    return progress;
  },
  getPlanProgress(planName) { 
    const cached = this._cache.userProgress?.[planName] || { lastWorkoutIndex: -1, totalWorkouts: 0 };
    
    // Also check localStorage (workout.js saves here directly on completion)
    try {
      const localRaw = localStorage.getItem(`viltrum_plan_progress_${planName}`);
      if (localRaw) {
        const local = JSON.parse(localRaw);
        // Use whichever has higher progress (more recent completion)
        if ((local.lastWorkoutIndex ?? -1) > cached.lastWorkoutIndex) {
          return { ...cached, ...local };
        }
      }
    } catch (e) {}
    
    return cached;
  },
  
  updateLocalProgress(planName, lastWorkoutIndex, totalWorkouts) {
    if (!this._cache.userProgress) this._cache.userProgress = {};
    this._cache.userProgress[planName] = {
      lastWorkoutIndex, totalWorkouts, lastUpdated: new Date().toISOString()
    };
    const email = this._cache.userData?.email;
    if (email) {
      try {
        const raw = localStorage.getItem(CACHE_KEY_USER);
        if (raw) {
          const cached = JSON.parse(raw);
          if (!cached.progress) cached.progress = {};
          cached.progress[planName] = this._cache.userProgress[planName];
          localStorage.setItem(CACHE_KEY_USER, JSON.stringify(cached));
        }
      } catch (e) {}
    }
    localStorage.setItem(`viltrum_plan_progress_${planName}`, JSON.stringify({
      lastWorkoutIndex, totalWorkouts
    }));
  },
  
  async savePlanProgress(planName, lastWorkoutIndex, totalWorkouts) {
    this.updateLocalProgress(planName, lastWorkoutIndex, totalWorkouts);
    const email = this._cache.userData?.email || localStorage.getItem('loggedUser');
    if (email) {
      try {
        const url = `${GOOGLE_SCRIPT_URL}?action=saveLastWorkout&email=${encodeURIComponent(email)}&planName=${encodeURIComponent(planName)}&lastWorkoutIndex=${lastWorkoutIndex}&totalWorkouts=${totalWorkouts}`;
        fetch(url).catch(err => console.warn('⚠️ Failed to sync progress to cloud:', err));
      } catch (e) {
        console.warn('⚠️ Failed to sync progress:', e);
      }
    }
  },
  
  clearCache() {
    this._cache = {
      userData: null, plans: null, workouts: null, runWorkouts: null,
      userProgress: null, isLoaded: false, isLoading: false,
      workoutsReady: false, _workoutsLoading: false, fromCache: false
    };
    localStorage.removeItem(CACHE_KEY_USER);
    localStorage.removeItem(CACHE_KEY_WORKOUTS);
    localStorage.removeItem('viltrum_user_cache');
    sessionStorage.removeItem('viltrum_session_data');
    sessionStorage.removeItem('viltrum_user_email');
  }
};

export default DataPreloader;
