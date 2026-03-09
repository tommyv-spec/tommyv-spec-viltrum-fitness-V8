/**
 * Viltrum Fitness - Global Preload Progress Bar V2.0
 * 
 * A persistent progress bar that:
 * - Shows download progress across ALL pages
 * - Uses polling to sync state (storage events don't work same-tab)
 * - Doesn't block navigation
 * - Auto-hides when complete
 * 
 * FIXES V2:
 * - Added polling mechanism for same-tab navigation
 * - Better initial state detection
 * - Handles page visibility changes
 */

const GlobalPreloadBar = {
  STORAGE_KEY: 'viltrum_preload_state',
  element: null,
  isInjected: false,
  pollInterval: null,
  lastState: null,
  
  // ═══════════════════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════════════════════════
  
  init() {
    if (this.isInjected) return;
    
    this.injectStyles();
    this.injectHTML();
    this.setupListeners();
    this.checkInitialState();
    this.startPolling();
    this.isInjected = true;
    
    console.log('📊 GlobalPreloadBar V2 initialized');
  },
  
  injectStyles() {
    if (document.getElementById('global-preload-bar-styles')) return;
    
    const styles = document.createElement('style');
    styles.id = 'global-preload-bar-styles';
    styles.textContent = `
      .global-preload-bar {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        background: rgba(0, 0, 0, 0.95);
        border-top: 1px solid rgba(255, 255, 255, 0.1);
        padding: 12px 20px;
        padding-bottom: calc(12px + env(safe-area-inset-bottom));
        z-index: 9999;
        display: none;
        flex-direction: column;
        gap: 8px;
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        transform: translateY(100%);
        transition: transform 0.3s ease, opacity 0.3s ease;
        opacity: 0;
      }
      
      .global-preload-bar.active {
        display: flex;
        transform: translateY(0);
        opacity: 1;
      }
      
      .global-preload-bar.hiding {
        transform: translateY(100%);
        opacity: 0;
      }
      
      .global-preload-bar-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      
      .global-preload-bar-text {
        font-family: 'Staatliches', sans-serif;
        font-size: 14px;
        color: #B0B0B0;
        letter-spacing: 1px;
      }
      
      .global-preload-bar-percent {
        font-family: 'Staatliches', sans-serif;
        font-size: 14px;
        color: #FFFFFF;
        letter-spacing: 1px;
      }
      
      .global-preload-bar-track {
        width: 100%;
        height: 4px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 2px;
        overflow: hidden;
      }
      
      .global-preload-bar-fill {
        height: 100%;
        background: linear-gradient(90deg, #FFFFFF 0%, #B0B0B0 100%);
        width: 0%;
        border-radius: 2px;
        transition: width 0.3s ease;
        box-shadow: 0 0 10px rgba(255, 255, 255, 0.3);
      }
      
      /* Ensure bar doesn't block content */
      .global-preload-bar {
        pointer-events: none;
      }
    `;
    document.head.appendChild(styles);
  },
  
  injectHTML() {
    if (document.getElementById('global-preload-bar')) return;
    
    const bar = document.createElement('div');
    bar.id = 'global-preload-bar';
    bar.className = 'global-preload-bar';
    bar.innerHTML = `
      <div class="global-preload-bar-header">
        <span class="global-preload-bar-text" id="global-preload-text">Preparazione offline...</span>
        <span class="global-preload-bar-percent" id="global-preload-percent">0%</span>
      </div>
      <div class="global-preload-bar-track">
        <div class="global-preload-bar-fill" id="global-preload-fill"></div>
      </div>
    `;
    document.body.appendChild(bar);
    this.element = bar;
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // POLLING MECHANISM (V2 - fixes cross-page sync)
  // ═══════════════════════════════════════════════════════════════════════════
  
  startPolling() {
    // Poll every 500ms to check for state changes
    // This is needed because storage events don't fire in the same tab
    this.pollInterval = setInterval(() => {
      this.pollState();
    }, 500);
    
    // Also poll on visibility change (when user returns to tab)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.pollState();
      }
    });
  },
  
  stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  },
  
  pollState() {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (!stored) {
        // No state - hide bar if it was showing
        if (this.lastState && this.lastState.status === 'loading') {
          this.hide();
        }
        this.lastState = null;
        return;
      }
      
      const state = JSON.parse(stored);
      
      // Check if state changed (compare timestamps or key values)
      if (this.hasStateChanged(state)) {
        this.lastState = state;
        this.handleStateChange(state);
      }
    } catch (e) {
      // Ignore parse errors
    }
  },
  
  hasStateChanged(newState) {
    if (!this.lastState) return true;
    if (!newState) return this.lastState !== null;
    
    // Compare key fields
    return (
      this.lastState.status !== newState.status ||
      this.lastState.phase !== newState.phase ||
      this.lastState.percent !== newState.percent ||
      this.lastState.current !== newState.current ||
      this.lastState.timestamp !== newState.timestamp
    );
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // EVENT LISTENERS
  // ═══════════════════════════════════════════════════════════════════════════
  
  setupListeners() {
    // Listen for localStorage changes (cross-tab sync - still useful for other tabs)
    window.addEventListener('storage', (e) => {
      if (e.key === this.STORAGE_KEY) {
        const state = e.newValue ? JSON.parse(e.newValue) : null;
        this.lastState = state;
        this.handleStateChange(state);
      }
    });
    
    // Listen for custom preload events (same page - from OfflinePreloader)
    window.addEventListener('preloadProgress', (e) => {
      this.handleProgress(e.detail);
    });
    
    window.addEventListener('preloadComplete', () => {
      this.handleComplete();
    });
    
    // Listen for preloadStateChange from OfflinePreloader
    window.addEventListener('preloadStateChange', (e) => {
      this.lastState = e.detail;
      this.handleStateChange(e.detail);
    });
    
    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
      this.stopPolling();
    });
  },
  
  checkInitialState() {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const state = JSON.parse(stored);
        this.lastState = state;
        
        // Check if preload is actually still running (not stale state)
        const stateAge = Date.now() - (state.timestamp || 0);
        const isStale = stateAge > 30000; // 30 seconds = stale
        
        if (state.status === 'loading' && !isStale) {
          console.log('📊 Resuming preload progress display...');
          this.handleStateChange(state);
        } else if (state.status === 'complete') {
          // Already complete, ensure bar is hidden
          this.hide();
        } else if (isStale && state.status === 'loading') {
          // Stale loading state - might be from crashed preload
          console.log('📊 Found stale preload state, clearing...');
          localStorage.removeItem(this.STORAGE_KEY);
        }
      }
    } catch (e) {
      console.warn('Failed to check initial preload state:', e);
    }
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STATE HANDLING
  // ═══════════════════════════════════════════════════════════════════════════
  
  handleStateChange(state) {
    if (!state) {
      this.hide();
      return;
    }
    
    if (state.status === 'complete') {
      this.handleComplete(false);
      return;
    }
    
    if (state.status === 'error') {
      this.handleComplete(true);
      return;
    }
    
    if (state.status === 'loading') {
      this.show();
      this.updateUI(state);
    }
  },
  
  handleProgress(data) {
    if (!data) return;
    
    // Update lastState
    this.lastState = { ...this.lastState, ...data };
    
    // Handle completion
    if (data.status === 'complete') {
      this.handleComplete();
      return;
    }
    
    if (data.status === 'error') {
      this.handleComplete(true);
      return;
    }
    
    this.show();
    this.updateUI(data);
  },
  
  handleComplete(isError = false) {
    const textEl = document.getElementById('global-preload-text');
    const fillEl = document.getElementById('global-preload-fill');
    const percentEl = document.getElementById('global-preload-percent');
    
    if (textEl) {
      textEl.textContent = isError ? '⚠️ Errore download' : '✓ Pronto per offline!';
    }
    if (fillEl) fillEl.style.width = '100%';
    if (percentEl) percentEl.textContent = '100%';
    
    // Clear state
    this.lastState = null;
    
    // Hide after delay
    setTimeout(() => {
      this.hide();
      // Clear localStorage state after hiding
      localStorage.removeItem(this.STORAGE_KEY);
    }, isError ? 3000 : 2000);
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // UI UPDATES
  // ═══════════════════════════════════════════════════════════════════════════
  
  updateUI(data) {
    const textEl = document.getElementById('global-preload-text');
    const fillEl = document.getElementById('global-preload-fill');
    const percentEl = document.getElementById('global-preload-percent');
    
    if (!textEl || !fillEl || !percentEl) return;
    
    // Phase names in Italian
    const phaseNames = {
      'init': 'Inizializzazione...',
      'checking': 'Verifica cache...',
      'images': 'Immagini esercizi',
      'audio': 'Audio guida vocale',
      'nutrition': 'Piano nutrizionale',
      'food-database': 'Database alimenti',
      'user-data': 'Dati utente',
      'workouts': 'Dati allenamenti',
      'plans': 'Piani allenamento'
    };
    
    const phaseName = phaseNames[data.phase] || data.phase || 'Preparazione';
    const percent = Math.min(100, Math.max(0, data.percent || 0));
    const current = data.current || 0;
    const total = data.total || 0;
    
    // Update text
    if (total > 0 && current > 0) {
      textEl.textContent = `${phaseName} (${current}/${total})`;
    } else {
      textEl.textContent = phaseName;
    }
    
    // Update progress bar
    fillEl.style.width = `${percent}%`;
    percentEl.textContent = `${Math.round(percent)}%`;
  },
  
  show() {
    if (!this.element) return;
    
    // Force reflow before adding active class for animation
    this.element.offsetHeight;
    
    this.element.classList.remove('hiding');
    this.element.classList.add('active');
    document.body.classList.add('preload-bar-visible');
  },
  
  hide() {
    if (!this.element) return;
    
    this.element.classList.add('hiding');
    document.body.classList.remove('preload-bar-visible');
    
    setTimeout(() => {
      if (this.element) {
        this.element.classList.remove('active', 'hiding');
      }
    }, 300);
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // MANUAL CONTROL (for debugging or external use)
  // ═══════════════════════════════════════════════════════════════════════════
  
  forceShow(message = 'Caricamento...') {
    this.show();
    const textEl = document.getElementById('global-preload-text');
    if (textEl) textEl.textContent = message;
  },
  
  forceHide() {
    this.hide();
    this.lastState = null;
  },
  
  // Check if preload is currently in progress
  isPreloading() {
    const state = this.lastState || this.getStoredState();
    return state && state.status === 'loading';
  },
  
  getStoredState() {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch (e) {
      return null;
    }
  }
};

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => GlobalPreloadBar.init());
} else {
  // DOM already loaded, init immediately
  GlobalPreloadBar.init();
}

// Export
window.GlobalPreloadBar = GlobalPreloadBar;