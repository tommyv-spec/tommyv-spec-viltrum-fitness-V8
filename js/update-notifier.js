// ═══════════════════════════════════════════════════════════════════════════
// VILTRUM FITNESS - UPDATE NOTIFIER
// Detects new service worker updates and prompts users to reload
// FAST: checks immediately on load + every 30s for first 2min, then every 2min
// ═══════════════════════════════════════════════════════════════════════════

class UpdateNotifier {
  constructor() {
    this.hasShownNotification = false;
    this.init();
  }

  init() {
    if (!('serviceWorker' in navigator)) return;

    const isInPages = window.location.pathname.includes('/pages/');
    const swPath = isInPages ? '../sw.js' : './sw.js';

    navigator.serviceWorker.getRegistration(swPath).then(existingReg => {
      const regPromise = existingReg 
        ? Promise.resolve(existingReg) 
        : navigator.serviceWorker.register(swPath);

      return regPromise.then(registration => {
        console.log('✅ [UpdateNotifier] Using SW registration');

        // If there's already a waiting worker, show update immediately
        if (registration.waiting) {
          this.showUpdateNotification(registration);
          return;
        }

        // Force check immediately on every page load
        registration.update().catch(() => {});

        // Aggressive checks: every 30s for first 2 minutes
        let fastChecks = 0;
        const fastInterval = setInterval(() => {
          fastChecks++;
          registration.update().catch(() => {});
          if (fastChecks >= 4) clearInterval(fastInterval); // 4 x 30s = 2min
        }, 30 * 1000);

        // Then regular checks every 2 minutes
        setTimeout(() => {
          setInterval(() => {
            registration.update().catch(() => {});
          }, 2 * 60 * 1000);
        }, 2 * 60 * 1000);

        // Listen for new worker installing
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              this.showUpdateNotification(registration);
            }
          });
        });

        // Handle controller change (when new SW takes over)
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (this.hasShownNotification) {
            window.location.reload();
          }
        });
      });
    }).catch(err => {
      console.warn('[UpdateNotifier] SW error:', err);
    });
  }

  showUpdateNotification(registration) {
    if (this.hasShownNotification) return;
    this.hasShownNotification = true;

    const existing = document.getElementById('update-notification');
    if (existing) existing.remove();

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

    document.getElementById('update-btn').addEventListener('click', () => {
      const btn = document.getElementById('update-btn');
      btn.textContent = 'AGGIORNAMENTO...';
      btn.style.opacity = '0.7';

      if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }

      setTimeout(() => {
        window.location.reload();
      }, 2000);
    });

    document.getElementById('update-close').addEventListener('click', () => {
      banner.style.animation = 'slideDown 0.3s ease reverse';
      setTimeout(() => banner.remove(), 300);
      this.hasShownNotification = false;
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.updateNotifier = new UpdateNotifier();
  });
} else {
  window.updateNotifier = new UpdateNotifier();
}

console.log('📱 Viltrum Fitness - Update checker active');
