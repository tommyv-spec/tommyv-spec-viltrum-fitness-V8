// ═══════════════════════════════════════════════════════════════════════════
// WELCOME MODAL V2 - Shows on first use AND on version upgrades
// ═══════════════════════════════════════════════════════════════════════════

const APP_VERSION = 'v6.3.21';

function initWelcomeModal() {
  const loggedUser = localStorage.getItem('loggedUser');
  if (!loggedUser) return;

  const storedVersion = localStorage.getItem('app_version');
  const hasSeenWelcome = localStorage.getItem('hasSeenWelcome');
  
  // Determine what to show
  const isFirstTime = !hasSeenWelcome;
  const isVersionUpgrade = storedVersion && storedVersion !== APP_VERSION;
  
  // Log for debugging
  console.log(`📱 App version: ${APP_VERSION}, stored: ${storedVersion || 'none'}`);
  console.log(`   First time: ${isFirstTime}, Upgrade: ${isVersionUpgrade}`);
  
  // Always update stored version
  localStorage.setItem('app_version', APP_VERSION);
  
  // Show modal if first time OR version upgrade
  if (!isFirstTime && !isVersionUpgrade) {
    console.log('✅ No modal needed - same version, not first time');
    return;
  }
  
  // Create modal content based on context
  let headerText, bodyContent;
  
  if (isVersionUpgrade) {
    headerText = `🚀 AGGIORNATO A ${APP_VERSION}`;
    bodyContent = `
      <div class="welcome-section upgrade">
        <h3>✨ NOVITÀ IN QUESTA VERSIONE</h3>
        <ul>
          <li><strong>Totale workout nel cloud:</strong> Il conteggio è sincronizzato su tutti i dispositivi</li>
          <li><strong>Progressi sempre salvati:</strong> I tuoi dati sono al sicuro nel cloud</li>
          <li><strong>Caricamento ottimizzato:</strong> App più veloce e reattiva</li>
        </ul>
      </div>
    `;
  } else {
    headerText = 'BENVENUTO IN VILTRUM FITNESS!';
    bodyContent = `
      <div class="welcome-section">
        <h3>🎯 COME FUNZIONA L'APP</h3>
        <ul>
          <li><strong>Allenamenti:</strong> Scegli il tuo workout dal dashboard e segui le istruzioni vocali</li>
          <li><strong>Timer:</strong> Il timer ti guiderà automaticamente attraverso ogni esercizio</li>
          <li><strong>Audio:</strong> Attiva l'audio per ricevere istruzioni vocali durante l'allenamento</li>
        </ul>
      </div>
      
      <div class="welcome-section warning">
        <h3>⚠️ IMPORTANTE</h3>
        <p>Stai per essere ricontattato dal team Viltrum per verificare i tuoi obiettivi e ottimizzare il tuo percorso di allenamento.</p>
      </div>
    `;
  }
  
  // Create modal HTML
  const modalHTML = `
    <div id="welcome-modal" class="welcome-modal active">
      <div class="welcome-modal-overlay"></div>
      <div class="welcome-modal-content">
        <div class="welcome-header ${isVersionUpgrade ? 'upgrade-header' : ''}">
          <h2>${headerText}</h2>
          <button class="welcome-close" aria-label="Close">×</button>
        </div>
        
        <div class="welcome-body">
          ${bodyContent}
        </div>
        
        <div class="welcome-footer">
          <div class="version-badge">${APP_VERSION}</div>
          <button class="welcome-start-btn">${isVersionUpgrade ? 'SCOPRI ORA!' : 'INIZIA SUBITO!'}</button>
        </div>
      </div>
    </div>
    
    <style>
      .welcome-modal {
        position: fixed;
        inset: 0;
        z-index: 100000;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        visibility: hidden;
        transition: all 0.3s ease;
      }
      
      .welcome-modal.active {
        opacity: 1;
        visibility: visible;
      }
      
      .welcome-modal-overlay {
        position: absolute;
        inset: 0;
        background: rgba(0, 0, 0, 0.85);
      }
      
      .welcome-modal-content {
        position: relative;
        background: #1a1a1a;
        border-radius: 16px;
        max-width: 90%;
        max-height: 85vh;
        width: 420px;
        overflow: hidden;
        animation: modalSlideIn 0.3s ease;
        box-shadow: 0 20px 60px rgba(0,0,0,0.5);
        border: 1px solid #333;
      }
      
      @keyframes modalSlideIn {
        from { transform: translateY(-30px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
      
      .welcome-header {
        background: linear-gradient(135deg, #333, #222);
        padding: 20px 24px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid #444;
      }
      
      .welcome-header.upgrade-header {
        background: linear-gradient(135deg, #2196F3, #1976D2);
      }
      
      .welcome-header h2 {
        margin: 0;
        font-family: 'Staatliches', sans-serif;
        font-size: 22px;
        letter-spacing: 1px;
        color: white;
      }
      
      .welcome-close {
        background: rgba(255,255,255,0.1);
        border: none;
        color: white;
        font-size: 28px;
        cursor: pointer;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        line-height: 1;
        transition: background 0.2s;
      }
      
      .welcome-close:hover {
        background: rgba(255,255,255,0.2);
      }
      
      .welcome-body {
        padding: 24px;
        max-height: 50vh;
        overflow-y: auto;
      }
      
      .welcome-section {
        margin-bottom: 20px;
      }
      
      .welcome-section:last-child {
        margin-bottom: 0;
      }
      
      .welcome-section h3 {
        font-family: 'Staatliches', sans-serif;
        font-size: 16px;
        margin: 0 0 12px 0;
        color: #fff;
        letter-spacing: 1px;
      }
      
      .welcome-section.upgrade h3 {
        color: #2196F3;
      }
      
      .welcome-section ul {
        margin: 0;
        padding-left: 20px;
        color: #ccc;
      }
      
      .welcome-section li {
        margin-bottom: 10px;
        line-height: 1.5;
        font-size: 14px;
      }
      
      .welcome-section li strong {
        color: #fff;
      }
      
      .welcome-section.warning {
        background: rgba(255, 152, 0, 0.1);
        border: 1px solid rgba(255, 152, 0, 0.3);
        border-radius: 8px;
        padding: 16px;
      }
      
      .welcome-section.warning h3 {
        color: #FF9800;
      }
      
      .welcome-section.warning p {
        margin: 0;
        color: #ccc;
        font-size: 14px;
        line-height: 1.5;
      }
      
      .welcome-footer {
        padding: 20px 24px;
        background: #111;
        border-top: 1px solid #333;
        display: flex;
        flex-direction: column;
        gap: 16px;
        align-items: center;
      }
      
      .version-badge {
        background: #333;
        color: #888;
        padding: 4px 12px;
        border-radius: 12px;
        font-size: 12px;
        font-family: 'Staatliches', sans-serif;
        letter-spacing: 1px;
      }
      
      .welcome-start-btn {
        width: 100%;
        padding: 14px 24px;
        background: white;
        color: black;
        border: none;
        border-radius: 8px;
        font-size: 18px;
        font-weight: bold;
        font-family: 'Staatliches', sans-serif;
        cursor: pointer;
        transition: all 0.2s;
        letter-spacing: 2px;
      }
      
      .welcome-start-btn:hover {
        transform: scale(1.02);
        box-shadow: 0 4px 12px rgba(255,255,255,0.2);
      }
    </style>
  `;
  
  // Add modal to page
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  
  // Get modal elements
  const modal = document.getElementById('welcome-modal');
  const closeBtn = modal.querySelector('.welcome-close');
  const startBtn = modal.querySelector('.welcome-start-btn');
  const overlay = modal.querySelector('.welcome-modal-overlay');
  
  // Close modal function
  function closeWelcomeModal() {
    modal.classList.remove('active');
    setTimeout(() => {
      modal.remove();
    }, 300);
    
    // ALWAYS mark as seen after first-time welcome (not for upgrades)
    // This prevents showing the welcome modal repeatedly
    if (isFirstTime) {
      localStorage.setItem('hasSeenWelcome', 'true');
      console.log('✅ Marked as seen - won\'t show welcome again');
    }
  }
  
  // Event listeners
  closeBtn.addEventListener('click', closeWelcomeModal);
  overlay.addEventListener('click', closeWelcomeModal);
  startBtn.addEventListener('click', closeWelcomeModal);
  
  // Escape key to close
  document.addEventListener('keydown', function escapeHandler(e) {
    if (e.key === 'Escape' && modal.classList.contains('active')) {
      closeWelcomeModal();
      document.removeEventListener('keydown', escapeHandler);
    }
  });
  
  console.log(`✅ Welcome modal shown (${isVersionUpgrade ? 'upgrade' : 'first time'})`);
}

// Initialize on dashboard load
const currentPath = window.location.pathname || '';
const currentHref = window.location.href || '';
const isDashboard = currentPath.includes('dashboard') || currentHref.includes('dashboard');

if (isDashboard) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWelcomeModal);
  } else {
    // Small delay to ensure page is ready
    setTimeout(initWelcomeModal, 100);
  }
}

// Export for external use
window.APP_VERSION = APP_VERSION;
