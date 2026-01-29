// ═══════════════════════════════════════════════════════════════════════════
// VILTRUM FITNESS - UPDATE NOTIFIER
// Detects new service worker updates and prompts users to reload
// Version display is handled by welcome-modal-v2.js
// ═══════════════════════════════════════════════════════════════════════════

class UpdateNotifier {
  constructor() {
    this.hasShownNotification = false;
    this.init();
  }

  init() {
    // Check for service worker updates
    if ('serviceWorker' in navigator) {
      // Determine correct path based on current page location
      const isInPages = window.location.pathname.includes('/pages/');
      const swPath = isInPages ? '../sw.js' : './sw.js';
      
      navigator.serviceWorker.register(swPath).then(registration => {
        console.log('✅ Service Worker registered');
        
        // Check for updates every 5 minutes
        setInterval(() => {
          registration.update();
        }, 5 * 60 * 1000);

        // Listen for updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New service worker available!
              this.showUpdateNotification(registration);
            }
          });
        });

        // Handle controller change (when new SW takes over)
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (!this.hasShownNotification) {
            window.location.reload();
          }
        });
      }).catch(err => {
        console.warn('Service Worker registration failed:', err);
      });
    }
  }

  showUpdateNotification(registration) {
    if (this.hasShownNotification) return;
    this.hasShownNotification = true;

    // Create notification banner
    const banner = document.createElement('div');
    banner.id = 'update-notification';
    banner.innerHTML = `
      <div style="
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        background: linear-gradient(135deg, #4CAF50, #45a049);
        color: white;
        padding: 16px 20px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 99999;
        font-family: 'Staatliches', sans-serif;
        animation: slideDown 0.3s ease;
      ">
        <div style="flex: 1;">
          <div style="font-size: 18px; font-weight: bold; margin-bottom: 4px;">
            🎉 Nuova versione disponibile!
          </div>
          <div style="font-size: 14px; opacity: 0.9;">
            Clicca "Aggiorna" per ottenere le ultime funzionalità
          </div>
        </div>
        <button id="update-btn" style="
          padding: 10px 24px;
          background: white;
          color: #4CAF50;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          font-weight: bold;
          font-family: 'Staatliches', sans-serif;
          cursor: pointer;
          transition: all 0.3s;
          letter-spacing: 1px;
          margin-left: 15px;
        ">
          AGGIORNA ORA
        </button>
        <button id="update-close" style="
          padding: 8px;
          background: transparent;
          color: white;
          border: 1px solid rgba(255,255,255,0.5);
          border-radius: 6px;
          font-size: 20px;
          cursor: pointer;
          margin-left: 10px;
          width: 36px;
          height: 36px;
          line-height: 1;
        ">
          ×
        </button>
      </div>
      <style>
        @keyframes slideDown {
          from { transform: translateY(-100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        #update-btn:hover {
          transform: scale(1.05);
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        }
        #update-close:hover {
          background: rgba(255,255,255,0.2);
        }
      </style>
    `;

    document.body.appendChild(banner);

    // Update button - reload the app
    document.getElementById('update-btn').addEventListener('click', () => {
      // Tell the new service worker to take control immediately
      if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
      // Reload after a short delay
      setTimeout(() => {
        window.location.reload();
      }, 100);
    });

    // Close button - dismiss for this session
    document.getElementById('update-close').addEventListener('click', () => {
      banner.style.animation = 'slideDown 0.3s ease reverse';
      setTimeout(() => banner.remove(), 300);
    });
  }
}

// Initialize on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.updateNotifier = new UpdateNotifier();
  });
} else {
  window.updateNotifier = new UpdateNotifier();
}

console.log('📱 Viltrum Fitness - Update checker active');
