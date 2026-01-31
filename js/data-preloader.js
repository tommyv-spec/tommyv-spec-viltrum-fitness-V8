/**
 * Viltrum Fitness - Data Preloader V8.1
 * 
 * AGGIORNAMENTI V8.1:
 * - Supporto RunWorkouts V2 con struttura 'phases' invece di 'lines'
 * - Auto-tracking per distanza e tempo
 * - Loop groups expansion
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
    
    console.log('🚀 DataPreloader V8.1: caricamento per', userEmail);
    
    // STEP 1: Carica SUBITO da localStorage (instant)
    const cachedData = this._loadFromLocalStorage(userEmail);
    if (cachedData) {
      this._applyData(cachedData, true);
      console.log('⚡ DataPreloader: dati da cache locale (instant)');
    }
    
    // STEP 2: Preload food database in parallel
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
   * Preload food database for nutrition section
   */
  async _preloadFoodDatabase() {
    if (sessionStorage.getItem('viltrum_food_database')) return;
    
    try {
      let response = await fetch('./food-database.json');
      if (!response.ok) {
        response = await fetch('../food-database.json');
      }
      
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
   * V8.1: Supporta sia 'exercises' (muscle) che 'phases' (run)
   */
  getPlanWithDetails(planName) {
    const plan = this._cache.plans?.[planName];
    if (!plan) return null;
    
    const workoutsWithDetails = plan.workouts.map(w => {
      let workoutData = null;
      let workoutType = w.type;
      
      // Try muscle workouts first
      if (workoutType === 'muscle' || workoutType === 'unknown') {
        workoutData = this._cache.workouts?.[w.name];
        if (workoutData) workoutType = 'muscle';
      }
      
      // Try run workouts
      if (!workoutData && (workoutType === 'run' || workoutType === 'unknown')) {
        workoutData = this._cache.runWorkouts?.[w.name];
        if (workoutData) workoutType = 'run';
      }
      
      // Build details object for preview rendering
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
          // V8.1: Run workouts now use 'phases' structure
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
        ...w,
        type: workoutType,
        details,
        previewInfo,
        // Legacy support
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
  
  /**
   * V8.1: Get run workout with expanded phases (loops unrolled)
   */
  getRunWorkoutExpanded(name) {
    const workout = this._cache.runWorkouts?.[name];
    if (!workout?.phases) return null;
    
    const expanded = this._expandPhases(workout.phases);
    
    return {
      ...workout,
      expandedPhases: expanded,
      totalExpandedPhases: expanded.length
    };
  },
  
  /**
   * Expand phases by unrolling loops
   */
  _expandPhases(phases) {
    const expanded = [];
    let i = 0;
    
    while (i < phases.length) {
      const phase = phases[i];
      
      if (phase.loopGroup) {
        // Collect all phases in this loop group
        const loopPhases = [];
        const loopGroup = phase.loopGroup;
        const loopCount = phase.loopCount || 1;
        
        while (i < phases.length && phases[i].loopGroup === loopGroup) {
          loopPhases.push(phases[i]);
          i++;
        }
        
        // Expand the loop
        for (let rep = 1; rep <= loopCount; rep++) {
          loopPhases.forEach(lp => {
            expanded.push({
              ...lp,
              _loopRep: rep,
              _loopTotal: loopCount,
              _loopSize: loopPhases.length
            });
          });
        }
      } else {
        expanded.push({ ...phase, _loopRep: null, _loopTotal: null });
        i++;
      }
    }
    
    return expanded;
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PROGRESS TRACKING
  // ═══════════════════════════════════════════════════════════════════════════
  getAllProgress() { return this._cache.userProgress || {}; },
  getPlanProgress(planName) { 
    return this._cache.userProgress?.[planName] || { lastWorkoutIndex: -1, totalWorkouts: 0 }; 
  },
  
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
  
  /**
   * Save plan progress locally and sync to cloud
   */
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