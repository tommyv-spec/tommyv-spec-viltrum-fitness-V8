// ═══════════════════════════════════════════════════════════════════════════
// VILTRUM FITNESS - WELCOME MODAL
// First-time user welcome and instructions
// ═══════════════════════════════════════════════════════════════════════════

import { isFirstTimeUser, markUserAsNotFirstTime } from './workout-history.js';

/**
 * Show welcome modal for first-time users
 */
export function showWelcomeModal() {
  if (!isFirstTimeUser()) {
    return;
  }

  const modal = createWelcomeModal();
  document.body.appendChild(modal);
  
  // Show modal with animation
  setTimeout(() => {
    modal.classList.add('show');
  }, 100);
}

/**
 * Create welcome modal element
 * @returns {HTMLElement} Modal element
 */
function createWelcomeModal() {
  const modal = document.createElement('div');
  modal.className = 'welcome-modal';
  modal.innerHTML = `
    <div class="welcome-modal-overlay"></div>
    <div class="welcome-modal-content">
      <div class="welcome-header">
        <h2>👋 Benvenuto su Viltrum Fitness!</h2>
        <p>Ecco tutto quello che devi sapere per iniziare</p>
      </div>
      
      <div class="welcome-body">
        <div class="welcome-section">
          <div class="welcome-icon">🎯</div>
          <h3>Come Funziona</h3>
          <ul>
            <li>Scegli un programma di allenamento dalla dashboard</li>
            <li>Segui gli esercizi con guida audio in tempo reale</li>
            <li>Completa i workout e registra i tuoi progressi</li>
          </ul>
        </div>

        <div class="welcome-section">
          <div class="welcome-icon">🔊</div>
          <h3>Audio & Guida</h3>
          <ul>
            <li><strong>Modalità Voice:</strong> Guida vocale professionale (Cloud TTS)</li>
            <li><strong>Modalità Synth:</strong> Sintesi vocale del browser</li>
            <li><strong>Modalità Beep:</strong> Solo segnali acustici</li>
            <li>Cambia modalità nelle impostazioni durante l'allenamento</li>
          </ul>
        </div>

        <div class="welcome-section">
          <div class="welcome-icon">⚙️</div>
          <h3>Impostazioni Utili</h3>
          <ul>
            <li>Usa il pulsante <strong>+10s</strong> per aggiungere tempo extra</li>
            <li>Regola il volume audio con lo slider</li>
            <li>Lo schermo rimane acceso durante gli allenamenti</li>
          </ul>
        </div>

        <div class="welcome-section">
          <div class="welcome-icon">📱</div>
          <h3>Installazione PWA</h3>
          <ul>
            <li><strong>iOS:</strong> Safari → Condividi → "Aggiungi a Home"</li>
            <li><strong>Android:</strong> Chrome → Menu → "Installa app"</li>
            <li>Funziona anche offline!</li>
          </ul>
        </div>

        <div class="welcome-section">
          <div class="welcome-icon">💪</div>
          <h3>Progressi & Cronologia</h3>
          <ul>
            <li>Registra i pesi usati dopo ogni workout</li>
            <li>Aggiungi workout ai preferiti con la stella ⭐</li>
            <li>Visualizza la cronologia nella dashboard</li>
          </ul>
        </div>

        <div class="welcome-section">
          <div class="welcome-icon">🍎</div>
          <h3>Nutrizione</h3>
          <ul>
            <li>Accedi ai piani nutrizionali personalizzati</li>
            <li>Sostituisci ingredienti facilmente</li>
            <li>Converti quantità e ricevi consigli</li>
          </ul>
        </div>

        <div class="welcome-important">
          <strong>⚠️ IMPORTANTE:</strong> Verrai ricontattato dal team per attivare il tuo account e assegnare i workout personalizzati. Controlla la tua email!
        </div>
      </div>

      <div class="welcome-footer">
        <label class="welcome-checkbox">
          <input type="checkbox" id="dont-show-again">
          <span>Non mostrare più questo messaggio</span>
        </label>
        <button class="welcome-button" onclick="closeWelcomeModal()">
          Inizia ad Allenarti! 💪
        </button>
      </div>
    </div>
  `;

  return modal;
}

/**
 * Close welcome modal
 */
window.closeWelcomeModal = function() {
  const checkbox = document.getElementById('dont-show-again');
  if (checkbox && checkbox.checked) {
    markUserAsNotFirstTime();
  }

  const modal = document.querySelector('.welcome-modal');
  if (modal) {
    modal.classList.remove('show');
    setTimeout(() => {
      modal.remove();
    }, 300);
  }
};

/**
 * Add welcome modal styles to document
 */
export function addWelcomeModalStyles() {
  if (document.getElementById('welcome-modal-styles')) {
    return;
  }

  const style = document.createElement('style');
  style.id = 'welcome-modal-styles';
  style.textContent = `
    .welcome-modal {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 0.3s ease;
      padding: 1rem;
    }

    .welcome-modal.show {
      opacity: 1;
    }

    .welcome-modal-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.9);
      backdrop-filter: blur(5px);
    }

    .welcome-modal-content {
      position: relative;
      background: linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%);
      border-radius: 20px;
      max-width: 600px;
      max-height: 90vh;
      overflow-y: auto;
      border: 1px solid rgba(76, 175, 80, 0.3);
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8);
    }

    .welcome-header {
      padding: 2rem;
      text-align: center;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      background: linear-gradient(135deg, rgba(76, 175, 80, 0.1) 0%, rgba(69, 160, 73, 0.1) 100%);
    }

    .welcome-header h2 {
      font-family: 'Staatliches', sans-serif;
      font-size: 2rem;
      color: #fff;
      margin-bottom: 0.5rem;
    }

    .welcome-header p {
      color: #4CAF50;
      font-size: 1.125rem;
    }

    .welcome-body {
      padding: 2rem;
    }

    .welcome-section {
      margin-bottom: 2rem;
    }

    .welcome-icon {
      font-size: 2rem;
      margin-bottom: 0.5rem;
    }

    .welcome-section h3 {
      font-family: 'Staatliches', sans-serif;
      font-size: 1.25rem;
      color: #4CAF50;
      margin-bottom: 0.75rem;
    }

    .welcome-section ul {
      list-style: none;
      padding: 0;
      margin: 0;
    }

    .welcome-section li {
      color: #ccc;
      padding: 0.5rem 0;
      padding-left: 1.5rem;
      position: relative;
      line-height: 1.5;
    }

    .welcome-section li::before {
      content: "→";
      position: absolute;
      left: 0;
      color: #4CAF50;
    }

    .welcome-important {
      background: rgba(255, 152, 0, 0.1);
      border: 1px solid rgba(255, 152, 0, 0.3);
      border-radius: 10px;
      padding: 1rem;
      color: #FF9800;
      margin-top: 1.5rem;
    }

    .welcome-footer {
      padding: 2rem;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      text-align: center;
    }

    .welcome-checkbox {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      color: #999;
      margin-bottom: 1.5rem;
      cursor: pointer;
    }

    .welcome-checkbox input {
      cursor: pointer;
    }

    .welcome-button {
      background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
      color: #fff;
      border: none;
      padding: 1rem 2rem;
      border-radius: 10px;
      font-size: 1.125rem;
      font-weight: bold;
      cursor: pointer;
      font-family: 'Staatliches', sans-serif;
      text-transform: uppercase;
      letter-spacing: 1px;
      transition: transform 0.2s ease;
    }

    .welcome-button:active {
      transform: scale(0.98);
    }

    @media (max-width: 768px) {
      .welcome-modal-content {
        max-height: 95vh;
      }

      .welcome-header h2 {
        font-size: 1.5rem;
      }

      .welcome-body {
        padding: 1.5rem;
      }
    }
  `;

  document.head.appendChild(style);
}

/**
 * Initialize welcome modal (call this on page load)
 */
export function initWelcomeModal() {
  addWelcomeModalStyles();
  
  // Show modal after a short delay for better UX
  setTimeout(() => {
    showWelcomeModal();
  }, 500);
}
