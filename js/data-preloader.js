/**
 * Viltrum Fitness - Data Preloader V8
 * 
 * OTTIMIZZAZIONI V8:
 * 1. Usa endpoint veloce getUserData (carica solo dati dell'utente)
 * 2. Mostra UI subito da cache localStorage
 * 3. Aggiorna in background senza bloccare
 * 4. Precarica anche food-database.json per nutrizione
 * 5. Coordinato con OfflinePreloader per download completo
 */

import { GOOGLE_SCRIPT_URL } from './config.js';

const CACHE_KEY = 'viltrum_user_cache';
const CACHE_MAX_AGE = 10 * 60 * 1000; // 10 minuti

const DataPreloader = {
  _cache: {
    userData: null,
    plans: null,
    workouts: null,
    runWorkouts: null,
    userProgress: null,
    isLoaded: false,
    isLoading: false,
    fromCache: false
  },
  
  /**
   * Carica dati ISTANTANEAMENTE da cache, poi aggiorna in background.
   * Non blocca mai l'UI.
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
    
    console.log('🚀 DataPreloader V8: caricamento per', userEmail);
    
    // STEP 1: Carica SUBITO da localStorage (instant)
    const cachedData = this._loadFromLocalStorage(userEmail);
    if (cachedData) {
      this._applyData(cachedData, true);
      console.log('⚡ DataPreloader: dati da cache locale (instant)');
    }
    
    // STEP 2: Preload food database in parallel (for nutrition section)
    this._preloadFoodDatabase();
    
    // STEP 3: Fetch in background dal server (non blocca)
    this._cache.isLoading = true;
    this._fetchUserData(userEmail)
      .then(freshData => {
        if (freshData) {
          this._applyData(freshData, false);
          this._saveToLocalStorage(userEmail, freshData);
          console.log('🔄 DataPreloader: dati aggiornati dal server');
          
          window.dispatchEvent(new CustomEvent('dataRefreshed', { 
            detail: { userData: this._cache.userData }
          }));
        }
      })
      .catch(err => {
        console.warn('⚠️ DataPreloader: fetch fallito, usando cache', err);
      })
      .finally(() => {
        this._cache.isLoading = false;
      });
    
    if (cachedData) {
      return this._cache;
    }
    
    return this.waitForLoad();
  },
  
  /**
   * V8: Preload food database for nutrition section
   */
  async _preloadFoodDatabase() {
    // Check if already cached
    if (sessionStorage.getItem('viltrum_food_database')) {
      return;
    }
    
    try {
      // Try root path first (for index.html context)
      let response = await fetch('./food-database.json');
      if (!response.ok) {
        // Try pages path (for pages/*.html context)
        response = await fetch('../food-database.json');
      }
      
      if (response.ok) {
        const data = await response.json();
        sessionStorage.setItem('viltrum_food_database', JSON.stringify(data));
        console.log('✅ Food database preloaded');
        
        // Dispatch event for nutrition section
        window.dispatchEvent(new CustomEvent('foodDatabaseReady'));
      }
    } catch (e) {
      console.warn('⚠️ Could not preload food database:', e);
    }
  },
  
  async forceRefresh(email) {
    const userEmail = email.toLowerCase();
    console.log('🔄 DataPreloader: force refresh per', userEmail);
    
    this._cache.isLoading = true;
    
    try {
      const freshData = await this._fetchUserData(userEmail);
      if (freshData) {
        this._applyData(freshData, false);
        this._saveToLocalStorage(userEmail, freshData);
      }
      return this._cache;
    } finally {
      this._cache.isLoading = false;
    }
  },
  
  async _fetchUserData(email) {
    const url = `${GOOGLE_SCRIPT_URL}?action=getUserData&email=${encodeURIComponent(email)}`;
    console.log('🌐 DataPreloader: fetch veloce per utente...');
    
    const startTime = Date.now();
    
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const data = await response.json();
      
      if (data.status === 'error') {
        throw new Error(data.message || 'Server error');
      }
      
      const duration = Date.now() - startTime;
      console.log(`📡 DataPreloader: risposta in ${duration}ms (server: ${data.loadTime}ms)`);
      
      return data;
    } catch (error) {
      console.error('❌ DataPreloader: fetch fallito:', error);
      throw error;
    }
  },
  
  _loadFromLocalStorage(email) {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      
      const cached = JSON.parse(raw);
      
      if (cached.user?.email !== email) return null;
      
      const age = Date.now() - (cached._timestamp || 0);
      if (age > CACHE_MAX_AGE) {
        console.log('📦 Cache scaduta, ricarico dal server');
        return null;
      }
      
      console.log(`📦 Cache valida (${Math.round(age/1000)}s fa)`);
      return cached;
    } catch (e) {
      return null;
    }
  },
  
  _saveToLocalStorage(email, data) {
    try {
      data._timestamp = Date.now();
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('Failed to save cache:', e);
    }
  },
  
  _applyData(data, fromCache) {
    this._cache.userData = {
      email: data.user?.email,
      fullName: data.user?.fullName || localStorage.getItem('userName') || 'User',
      scadenza: data.user?.scadenza,
      plans: data.user?.plans || [],
      nutritionPdfUrl: data.user?.nutritionPdfUrl,
      nutritionScadenza: data.user?.nutritionScadenza
    };
    
    this._cache.plans = data.plans || {};
    this._cache.workouts = data.workouts || {};
    this._cache.runWorkouts = data.runWorkouts || {};
    this._cache.userProgress = data.progress || {};
    this._cache.isLoaded = true;
    this._cache.fromCache = fromCache;
    
    sessionStorage.setItem('viltrum_user_email', data.user?.email);
  },
  
  async waitForLoad() {
    while (this._cache.isLoading && !this._cache.isLoaded) {
      await new Promise(r => setTimeout(r, 50));
    }
    return this._cache;
  },
  
  isReady() { return this._cache.isLoaded; },
  isFromCache() { return this._cache.fromCache; },
  getUserData() { return this._cache.userData; },
  getPlans() { return this._cache.plans || {}; },
  getPlan(planName) { return this._cache.plans?.[planName] || null; },
  
  /**
   * Restituisce un piano con tutti i dettagli dei workout espansi.
   * Usato da plan-view.html per mostrare la lista workout.
   */
  getPlanWithDetails(planName) {
    const plan = this._cache.plans?.[planName];
    if (!plan) return null;
    
    // Espandi i workout con i loro dettagli
    const workoutsWithDetails = plan.workouts.map(w => {
      let workoutData = null;
      
      if (w.type === 'muscle' || w.type === 'unknown') {
        workoutData = this._cache.workouts?.[w.name];
      }
      if (!workoutData && (w.type === 'run' || w.type === 'unknown')) {
        workoutData = this._cache.runWorkouts?.[w.name];
        if (workoutData) w.type = 'run';
      }
      if (workoutData && w.type === 'unknown') {
        w.type = 'muscle';
      }
      
      return {
        ...w,
        exercises: workoutData?.exercises || workoutData?.lines || [],
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
  
  getAllMuscleWorkouts() { return this._cache.workouts || {}; },
  getMuscleWorkout(name) { return this._cache.workouts?.[name] || null; },
  getAllRunWorkouts() { return this._cache.runWorkouts || {}; },
  getRunWorkout(name) { return this._cache.runWorkouts?.[name] || null; },
  getAllProgress() { return this._cache.userProgress || {}; },
  getPlanProgress(planName) { return this._cache.userProgress?.[planName] || { lastWorkoutIndex: -1, totalWorkouts: 0 }; },
  
  updateLocalProgress(planName, lastWorkoutIndex, totalWorkouts) {
    if (!this._cache.userProgress) this._cache.userProgress = {};
    
    this._cache.userProgress[planName] = {
      lastWorkoutIndex,
      totalWorkouts,
      lastUpdated: new Date().toISOString()
    };
    
    const email = this._cache.userData?.email;
    if (email) {
      try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (raw) {
          const cached = JSON.parse(raw);
          if (!cached.progress) cached.progress = {};
          cached.progress[planName] = this._cache.userProgress[planName];
          localStorage.setItem(CACHE_KEY, JSON.stringify(cached));
        }
      } catch (e) {}
    }
    
    localStorage.setItem(`viltrum_plan_progress_${planName}`, JSON.stringify({
      lastWorkoutIndex,
      totalWorkouts
    }));
  },
  
  clearCache() {
    this._cache = {
      userData: null,
      plans: null,
      workouts: null,
      runWorkouts: null,
      userProgress: null,
      isLoaded: false,
      isLoading: false,
      fromCache: false
    };
    localStorage.removeItem(CACHE_KEY);
    sessionStorage.removeItem('viltrum_session_data');
    sessionStorage.removeItem('viltrum_user_email');
  }
};

export default DataPreloader;