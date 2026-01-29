/**
 * Viltrum Fitness - Global Preload Progress Bar V1.0
 * 
 * A persistent progress bar that:
 * - Shows download progress across ALL pages
 * - Syncs state via localStorage events
 * - Doesn't block navigation
 * - Auto-hides when complete
 */

const GlobalPreloadBar = {
  STORAGE_KEY: 'viltrum_preload_state',
  element: null,
  isInjected: false,
  
  // ═══════════════════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════════════════════════
  
  init() {
    if (this.isInjected) return;
    
    this.injectStyles();
    this.injectHTML();
    this.setupListeners();
    this.checkInitialState();
    this.isInjected = true;
    
    console.log('📊 GlobalPreloadBar initialized');
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
      
      /* Add padding to body when bar is visible */
      body.preload-bar-visible {
        padding-bottom: 60px !important;
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
  // EVENT LISTENERS
  // ═══════════════════════════════════════════════════════════════════════════
  
  setupListeners() {
    // Listen for localStorage changes (cross-tab/page sync)
    window.addEventListener('storage', (e) => {
      if (e.key === this.STORAGE_KEY) {
        const state = e.newValue ? JSON.parse(e.newValue) : null;
        this.handleStateChange(state);
      }
    });
    
    // Listen for custom preload events (same page)
    window.addEventListener('preloadProgress', (e) => {
      this.handleProgress(e.detail);
    });
    
    window.addEventListener('preloadComplete', () => {
      this.handleComplete();
    });
    
    // Listen for preloadStateChange from OfflinePreloader
    window.addEventListener('preloadStateChange', (e) => {
      this.handleStateChange(e.detail);
    });
  },
  
  checkInitialState() {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const state = JSON.parse(stored);
        if (state.status === 'loading') {
          this.handleStateChange(state);
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
    
    if (state.status === 'complete' || state.status === 'error') {
      this.handleComplete(state.status === 'error');
      return;
    }
    
    if (state.status === 'loading') {
      this.show();
      this.updateUI(state);
    }
  },
  
  handleProgress(data) {
    if (!data) return;
    
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
    
    // Hide after delay
    setTimeout(() => {
      this.hide();
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
    
    // Phase names
    const phaseNames = {
      'init': 'Inizializzazione...',
      'images': 'Immagini esercizi',
      'audio': 'Audio guida vocale',
      'nutrition': 'Piano nutrizionale',
      'food-database': 'Database alimenti',
      'user-data': 'Dati utente'
    };
    
    const phaseName = phaseNames[data.phase] || data.phase || 'Preparazione';
    const percent = data.percent || 0;
    const current = data.current || 0;
    const total = data.total || 0;
    
    // Update text
    if (total > 0) {
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
    
    this.element.classList.add('active');
    this.element.classList.remove('hiding');
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
  // MANUAL CONTROL
  // ═══════════════════════════════════════════════════════════════════════════
  
  forceShow(message = 'Caricamento...') {
    this.show();
    const textEl = document.getElementById('global-preload-text');
    if (textEl) textEl.textContent = message;
  },
  
  forceHide() {
    this.hide();
  }
};

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => GlobalPreloadBar.init());
} else {
  GlobalPreloadBar.init();
}

// Export
window.GlobalPreloadBar = GlobalPreloadBar;
