/**
 * Viltrum Fitness - Offline Preload Progress Modal
 * Shows loading progress during initial data preload
 */

const PreloadModal = {
  modal: null,
  progressBar: null,
  statusText: null,
  detailsText: null,

  /**
   * Create and show the preload modal
   */
  show() {
    // Create modal HTML
    const modalHTML = `
      <div id="preload-modal" class="preload-modal-overlay">
        <div class="preload-modal-content">
          <div class="preload-logo">
            <h1>VILTRUM</h1>
            <p>FITNESS</p>
          </div>
          
          <div class="preload-status">
            <h2>Preparazione contenuti offline...</h2>
            <p id="preload-status-text">Inizializzazione...</p>
          </div>

          <div class="preload-progress">
            <div class="preload-progress-bar">
              <div id="preload-progress-fill" class="preload-progress-fill"></div>
            </div>
            <div id="preload-details" class="preload-details"></div>
          </div>

          <div class="preload-info">
            <p>Stiamo preparando tutti i contenuti per l'uso offline.</p>
            <p>Questo processo avviene solo una volta e permette di usare l'app anche senza connessione.</p>
          </div>
        </div>
      </div>
    `;

    // Add to body
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Get references
    this.modal = document.getElementById('preload-modal');
    this.progressBar = document.getElementById('preload-progress-fill');
    this.statusText = document.getElementById('preload-status-text');
    this.detailsText = document.getElementById('preload-details');

    // Add styles
    this.addStyles();
  },

  /**
   * Update progress
   */
  updateProgress(data) {
    if (!this.modal) return;

    const { type, loaded, total } = data;
    const percentage = total > 0 ? (loaded / total) * 100 : 0;

    // Update based on type
    let statusMessage = '';
    let details = '';

    switch (type) {
      case 'image':
        statusMessage = 'Caricamento immagini...';
        details = `${loaded} / ${total} immagini`;
        break;
      case 'audio':
        statusMessage = 'Caricamento audio guida vocale...';
        details = `${loaded} / ${total} file audio`;
        break;
      case 'beppe':
        statusMessage = 'Caricamento audio Beppe...';
        details = `${loaded} / ${total} file audio`;
        break;
      case 'nutrition':
        statusMessage = 'Caricamento piano nutrizionale...';
        details = 'PDF nutrizionale';
        break;
      default:
        statusMessage = 'Caricamento...';
        details = `${loaded} / ${total}`;
    }

    if (this.statusText) this.statusText.textContent = statusMessage;
    if (this.detailsText) this.detailsText.textContent = details;
    if (this.progressBar) this.progressBar.style.width = `${percentage}%`;
  },

  /**
   * Hide the modal
   */
  hide() {
    if (this.modal) {
      this.modal.style.opacity = '0';
      setTimeout(() => {
        if (this.modal && this.modal.parentNode) {
          this.modal.parentNode.removeChild(this.modal);
        }
        this.modal = null;
      }, 300);
    }
  },

  /**
   * Add CSS styles
   */
  addStyles() {
    if (document.getElementById('preload-modal-styles')) return;

    const styles = `
      <style id="preload-modal-styles">
        .preload-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.95);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
          opacity: 1;
          transition: opacity 0.3s ease;
        }

        .preload-modal-content {
          max-width: 500px;
          width: 90%;
          padding: 2rem;
          text-align: center;
          color: white;
        }

        .preload-logo h1 {
          font-family: 'Staatliches', cursive;
          font-size: 3rem;
          margin: 0;
          color: white;
          letter-spacing: 2px;
        }

        .preload-logo p {
          font-family: 'Staatliches', cursive;
          font-size: 1.5rem;
          margin: 0;
          color: white;
          opacity: 0.8;
        }

        .preload-status {
          margin: 2rem 0;
        }

        .preload-status h2 {
          font-family: 'Staatliches', cursive;
          font-size: 1.5rem;
          margin: 0 0 0.5rem 0;
          color: white;
        }

        .preload-status p {
          font-size: 1rem;
          margin: 0;
          color: rgba(255, 255, 255, 0.7);
        }

        .preload-progress {
          margin: 2rem 0;
        }

        .preload-progress-bar {
          width: 100%;
          height: 8px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 4px;
          overflow: hidden;
        }

        .preload-progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #fff, #ccc);
          width: 0%;
          transition: width 0.3s ease;
        }

        .preload-details {
          margin-top: 1rem;
          font-size: 0.9rem;
          color: rgba(255, 255, 255, 0.6);
          min-height: 1.5rem;
        }

        .preload-info {
          margin-top: 2rem;
          padding-top: 2rem;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
        }

        .preload-info p {
          font-size: 0.85rem;
          color: rgba(255, 255, 255, 0.5);
          margin: 0.5rem 0;
        }
      </style>
    `;

    document.head.insertAdjacentHTML('beforeend', styles);
  }
};

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PreloadModal;
}
