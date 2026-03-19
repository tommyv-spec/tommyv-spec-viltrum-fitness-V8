/**
 * Viltrum Fitness - Session Cache Manager V7
 * Centralized data loading and caching system
 * Now with Plans support for combined muscle/run workouts
 */

import { GOOGLE_SCRIPT_URL } from './config.js';

const SessionCache = {
  GOOGLE_SCRIPT_URL: GOOGLE_SCRIPT_URL,
  CACHE_DURATION: 5 * 60 * 1000, // 5 minutes
  
  /**
   * Get all user data (workouts, plans, subscription, nutrition, etc.)
   * Loads once per session, then serves from cache
   */
  async getUserData(forceRefresh = false) {
    const cacheKey = 'viltrum_session_data';
    const timestampKey = 'viltrum_session_timestamp';
    
    // Check session cache first
    if (!forceRefresh) {
      const cached = sessionStorage.getItem(cacheKey);
      const timestamp = sessionStorage.getItem(timestampKey);
      
      if (cached && timestamp) {
        const age = Date.now() - parseInt(timestamp);
        if (age < this.CACHE_DURATION) {
          console.log(`✅ Using session cache (age: ${Math.round(age/1000)}s)`);
          return JSON.parse(cached);
        }
      }
    }
    
    // Fetch fresh data
    console.log('🔄 Loading fresh data from server...');
    try {
      const response = await fetch(this.GOOGLE_SCRIPT_URL);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      
      // Cache in sessionStorage
      sessionStorage.setItem(cacheKey, JSON.stringify(data));
      sessionStorage.setItem(timestampKey, Date.now().toString());
      
      console.log('✅ Data loaded and cached');
      console.log('📊 Plans available:', Object.keys(data.plans || {}).length);
      console.log('🏋️ Muscle workouts:', Object.keys(data.workouts || {}).length);
      console.log('🏃 Run workouts:', Object.keys(data.runWorkouts || {}).length);
      
      return data;
      
    } catch (error) {
      console.error('❌ Failed to load data:', error);
      
      // Try to use stale cache if available
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        console.warn('⚠️ Using stale cache due to network error');
        return JSON.parse(cached);
      }
      
      throw error;
    }
  },
  
  /**
   * Get current user's info (subscription, plans, nutrition, etc.)
   * V7: Now returns plans instead of individual workouts
   */
  async getCurrentUserInfo() {
    const email = localStorage.getItem('loggedUser');
    if (!email) {
      throw new Error('User not logged in');
    }
    
    const data = await this.getUserData();
    const userEmail = email.toLowerCase();
    const userInfo = data.userWorkouts[userEmail];
    
    if (!userInfo) {
      console.warn(`User ${userEmail} not found in data`);
      return {
        email: userEmail,
        fullName: localStorage.getItem('userName') || 'User',
        scadenza: null,
        // V7: Plans structure
        plans: [],
        allPlansData: data.plans || {},
        // Workout libraries
        allWorkoutsData: data.workouts || {},
        runWorkouts: data.runWorkouts || {},
        // Nutrition data
        nutritionPdfUrl: null,
        nutritionScadenza: null
      };
    }
    
    return {
      email: userEmail,
      fullName: userInfo.fullName || localStorage.getItem('userName') || 'User',
      scadenza: userInfo.scadenza,
      // V7: Plans instead of workouts
      plans: userInfo.plans || [],
      allPlansData: data.plans || {},
      // Workout libraries (for looking up workout details)
      allWorkoutsData: data.workouts || {},
      runWorkouts: data.runWorkouts || {},
      // Nutrition data from Google Sheets
      nutritionPdfUrl: userInfo.nutritionPdfUrl || null,
      nutritionScadenza: userInfo.nutritionScadenza || null
    };
  },
  
  /**
   * V7: Get plan details with resolved workout data
   * @param {string} planName - Name of the plan
   * @returns {Object} Plan with full workout details
   */
  async getPlanDetails(planName) {
    const userInfo = await this.getCurrentUserInfo();
    const planData = userInfo.allPlansData[planName];
    
    if (!planData) {
      console.error(`Plan "${planName}" not found`);
      return null;
    }
    
    // Resolve workout details for each workout in the plan
    const workoutsWithDetails = planData.workouts.map(workout => {
      let details = null;
      
      if (workout.type === 'muscle') {
        details = userInfo.allWorkoutsData[workout.name];
      } else if (workout.type === 'run') {
        details = userInfo.runWorkouts[workout.name];
      }
      
      return {
        ...workout,
        details: details || null
      };
    });
    
    return {
      name: planName,
      totalWorkouts: planData.totalWorkouts,
      workouts: workoutsWithDetails
    };
  },
  
  /**
   * V7: Get user's progress for a specific plan
   * @param {string} planName - Name of the plan
   * @returns {Object} Progress data
   */
  async getPlanProgress(planName) {
    const email = localStorage.getItem('loggedUser');
    if (!email) return { lastWorkoutIndex: -1, totalWorkouts: 0 };
    
    // Check local storage first
    const localKey = `viltrum_plan_progress_${planName}`;
    const localProgress = localStorage.getItem(localKey);
    
    if (localProgress) {
      return JSON.parse(localProgress);
    }
    
    // Fetch from cloud
    try {
      const url = `${this.GOOGLE_SCRIPT_URL}?action=getLastWorkout&email=${encodeURIComponent(email)}&planName=${encodeURIComponent(planName)}`;
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.status === 'success') {
        const progress = {
          lastWorkoutIndex: data.lastWorkoutIndex ?? -1,
          totalWorkouts: data.totalWorkouts ?? 0,
          lastUpdated: data.lastUpdated
        };
        
        // Cache locally
        localStorage.setItem(localKey, JSON.stringify(progress));
        return progress;
      }
    } catch (error) {
      console.warn('Failed to fetch plan progress:', error);
    }
    
    return { lastWorkoutIndex: -1, totalWorkouts: 0 };
  },
  
  /**
   * V7: Save user's progress for a specific plan
   * @param {string} planName - Name of the plan
   * @param {number} workoutIndex - Index of completed workout
   * @param {number} totalWorkouts - Total workouts in plan
   */
  async savePlanProgress(planName, workoutIndex, totalWorkouts) {
    const email = localStorage.getItem('loggedUser');
    if (!email) return;
    
    // Save locally first
    const localKey = `viltrum_plan_progress_${planName}`;
    const progress = {
      lastWorkoutIndex: workoutIndex,
      totalWorkouts: totalWorkouts,
      lastUpdated: new Date().toISOString()
    };
    localStorage.setItem(localKey, JSON.stringify(progress));
    
    // Sync to cloud
    try {
      const url = `${this.GOOGLE_SCRIPT_URL}?action=saveLastWorkout&email=${encodeURIComponent(email)}&planName=${encodeURIComponent(planName)}&lastWorkoutIndex=${workoutIndex}&totalWorkouts=${totalWorkouts}`;
      await fetch(url);
      console.log(`✅ Progress saved for ${planName}: ${workoutIndex + 1}/${totalWorkouts}`);
    } catch (error) {
      console.warn('Failed to sync progress to cloud:', error);
    }
  },
  
  /**
   * V7: Get all progress for current user (all plans)
   */
  async getAllPlanProgress() {
    const email = localStorage.getItem('loggedUser');
    if (!email) return {};
    
    try {
      const url = `${this.GOOGLE_SCRIPT_URL}?action=getAllProgress&email=${encodeURIComponent(email)}`;
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.status === 'success') {
        return data.progress || {};
      }
    } catch (error) {
      console.warn('Failed to fetch all progress:', error);
    }
    
    return {};
  },
  
  /**
   * Calculate subscription status
   */
  getSubscriptionStatus(scadenza) {
    if (!scadenza) {
      return {
        status: 'unknown',
        daysRemaining: null,
        isActive: false,
        isTrial: false,
        isExpired: true
      };
    }
    
    const expirationDate = new Date(scadenza);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    expirationDate.setHours(0, 0, 0, 0);
    
    const daysRemaining = Math.ceil((expirationDate - today) / (1000 * 60 * 60 * 24));
    
    return {
      status: daysRemaining < 0 ? 'expired' : (daysRemaining <= 7 ? 'trial' : 'active'),
      daysRemaining: daysRemaining,
      isActive: daysRemaining > 7,
      isTrial: daysRemaining >= 0 && daysRemaining <= 7,
      isExpired: daysRemaining < 0,
      expirationDate: expirationDate
    };
  },
  
  /**
   * Preload images for faster display
   */
  preloadImages(imageUrls) {
    const cacheKey = 'viltrum_preloaded_images';
    const preloaded = sessionStorage.getItem(cacheKey);
    
    if (preloaded) {
      console.log('✅ Images already preloaded in session');
      return Promise.resolve();
    }
    
    console.log(`🖼️ Preloading ${imageUrls.length} images...`);
    
    const promises = imageUrls.map(url => {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve();
        img.onerror = () => resolve();
        img.src = url;
      });
    });
    
    return Promise.all(promises).then(() => {
      sessionStorage.setItem(cacheKey, 'true');
      console.log('✅ All images preloaded');
    });
  },
  
  /**
   * V7: Preload images for all workouts in user's plans
   */
  async preloadPlanImages() {
    try {
      const userInfo = await this.getCurrentUserInfo();
      const imageUrls = [];
      
      // Collect all image URLs from user's plans
      for (const planName of userInfo.plans) {
        const planData = userInfo.allPlansData[planName];
        if (!planData) continue;
        
        for (const workout of planData.workouts) {
          if (workout.type === 'muscle') {
            const workoutData = userInfo.allWorkoutsData[workout.name];
            if (workoutData && workoutData.exercises) {
              workoutData.exercises.forEach(exercise => {
                if (exercise.imageUrl && !imageUrls.includes(exercise.imageUrl)) {
                  imageUrls.push(exercise.imageUrl);
                }
              });
            }
          }
        }
      }
      
      if (imageUrls.length > 0) {
        await this.preloadImages(imageUrls);
      }
      
    } catch (error) {
      console.warn('Failed to preload plan images:', error);
    }
  },
  
  /**
   * Clear session cache (useful for logout or refresh)
   */
  clearCache() {
    sessionStorage.removeItem('viltrum_session_data');
    sessionStorage.removeItem('viltrum_session_timestamp');
    sessionStorage.removeItem('viltrum_preloaded_images');
    console.log('🗑️ Session cache cleared');
  },
  
  /**
   * Initialize session cache on page load
   * V7: Starts preload immediately and continues across page navigation
   */
  async init(options = {}) {
    console.log('🚀 Initializing session cache V7...');
    try {
      const userInfo = await this.getCurrentUserInfo();
      console.log(`✅ Session initialized for ${userInfo.email}`);
      console.log(`📋 ${userInfo.plans.length} plans assigned`);
      
      // Check nutrition availability
      if (userInfo.nutritionPdfUrl) {
        console.log('🥗 Nutrition plan available');
      }
      
      // V7: Start comprehensive offline preload
      // This runs in background and persists across page navigation
      this.startBackgroundPreload(userInfo, options);
      
      return userInfo;
    } catch (error) {
      console.error('❌ Failed to initialize session:', error);
      throw error;
    }
  },
  
  /**
   * V7: Start background preload that persists across pages
   */
  startBackgroundPreload(userInfo, options = {}) {
    if (typeof OfflinePreloader === 'undefined') {
      console.warn('⚠️ OfflinePreloader not available');
      return;
    }
    
    // Check if there's an ongoing preload from another page
    const preloadState = OfflinePreloader.getPreloadState();
    if (preloadState && preloadState.status === 'loading') {
      console.log('📡 Preload in progress from another page, listening for updates...');
      // Just listen for progress updates
      return;
    }
    
    console.log('🔄 Starting background preload...');
    
    // Run preload in background (don't await)
    OfflinePreloader.preloadAll(userInfo, {
      scriptUrl: this.GOOGLE_SCRIPT_URL,
      forceUpdate: options.forceUpdate || false,
      onProgress: (data) => {
        window.dispatchEvent(new CustomEvent('preloadProgress', { detail: data }));
        if (options.onProgress) options.onProgress(data);
      }
    }).then(result => {
      if (result.success && !result.cached) {
        console.log('✅ Background preload complete');
        window.dispatchEvent(new CustomEvent('preloadComplete', { detail: result }));
        if (options.onComplete) options.onComplete(result);
      } else if (result.cached) {
        console.log('✅ Resources already cached');
        window.dispatchEvent(new CustomEvent('preloadComplete', { detail: { cached: true } }));
      }
    }).catch(error => {
      console.error('❌ Background preload failed:', error);
    });
  },

  /**
   * Force refresh all cached data
   */
  async forceRefresh() {
    console.log('🔄 Force refreshing all data...');
    this.clearCache();
    if (typeof OfflinePreloader !== 'undefined') {
      await OfflinePreloader.clearCache();
    }
    return await this.init({ forceUpdate: true });
  }
};

// Auto-initialize on load (unless page explicitly disables it)
if (typeof DISABLE_AUTO_CACHE_INIT === 'undefined' || !DISABLE_AUTO_CACHE_INIT) {
  document.addEventListener('DOMContentLoaded', () => {
    const user = localStorage.getItem('loggedUser');
    if (user) {
      SessionCache.init().catch(error => {
        console.error('Auto-init failed:', error);
      });
    }
  });
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SessionCache;
}

// Expose to global scope (for inline scripts in HTML)
window.SessionCache = SessionCache;
