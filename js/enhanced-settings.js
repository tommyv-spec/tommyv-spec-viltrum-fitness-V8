// ═══════════════════════════════════════════════════════════════════════════
// VILTRUM FITNESS - ENHANCED SETTINGS MODAL
// Settings popup with volume control and +10s button
// ═══════════════════════════════════════════════════════════════════════════

import { getUserSettings, setAudioVolume, getAudioVolume, add10Seconds, getExtraTime } from './profile-manager.js';

/**
 * Show enhanced settings modal
 */
export function showEnhancedSettings() {
  // Remove existing modal if any
  const existing = document.querySelector('.enhanced-settings-modal');
  if (existing) {
    existing.remove();
  }

  const modal = createSettingsModal();
  document.body.appendChild(modal);
  
  // Initialize values
  updateSettingsValues();
  
  // Show modal with animation
  setTimeout(() => {
    modal.classList.add('show');
  }, 100);
}

/**
 * Create settings modal element
 * @returns {HTMLElement} Modal element
 */
function createSettingsModal() {
  const modal = document.createElement('div');
  modal.className = 'enhanced-settings-modal';
  modal.innerHTML = `
    <div class="settings-modal-overlay" onclick="closeEnhancedSettings()"></div>
    <div class="settings-modal-content">
      <div class="settings-header">
        <h2>⚙️ Impostazioni</h2>
        <button class="settings-close" onclick="closeEnhancedSettings()">✕</button>
      </div>
      
      <div class="settings-body">
        <!-- Sound Mode -->
        <div class="setting-group">
          <label class="setting-label">
            <span class="setting-icon">🔊</span>
            Modalità Audio
          </label>
          <select id="soundMode-enhanced" class="setting-select" onchange="updateSoundMode(this.value)">
            <option value="voice">Voice (Cloud TTS)</option>
            <option value="synth">Synth (Browser)</option>
            <option value="bip">Solo Beep</option>
            <option value="none">Nessun Audio</option>
          </select>
        </div>

        <!-- Volume Control -->
        <div class="setting-group">
          <label class="setting-label">
            <span class="setting-icon">🎚️</span>
            Volume Audio
            <span class="volume-value" id="volume-display">100%</span>
          </label>
          <div class="volume-control">
            <button class="volume-btn" onclick="adjustVolume(-0.1)">🔉</button>
            <input 
              type="range" 
              id="volume-slider" 
              class="volume-slider"
              min="0"
              max="100"
              step="5"
              value="100"
              oninput="updateVolume(this.value)"
            >
            <button class="volume-btn" onclick="adjustVolume(0.1)">🔊</button>
          </div>
        </div>

        <!-- Extra Time -->
        <div class="setting-group">
          <label class="setting-label">
            <span class="setting-icon">⏱️</span>
            Tempo Extra per Esercizio
            <span class="extra-time-value" id="extra-time-display">0s</span>
          </label>
          <div class="extra-time-control">
            <button class="extra-time-btn" onclick="add10SecondsToSetting()">
              +10s
            </button>
            <button class="extra-time-btn secondary" onclick="resetExtraTime()">
              Reset
            </button>
          </div>
          <p class="setting-hint">Aggiunge tempo extra a ogni esercizio</p>
        </div>

        <!-- Current Workout Info (if in workout) -->
        <div class="setting-group" id="workout-info-group" style="display: none;">
          <label class="setting-label">
            <span class="setting-icon">💪</span>
            Workout Attuale
          </label>
          <div class="workout-info">
            <p id="current-workout-name">Nessun workout attivo</p>
            <p id="current-exercise-info">--</p>
          </div>
        </div>
      </div>

      <div class="settings-footer">
        <button class="settings-btn primary" onclick="closeEnhancedSettings()">
          Salva e Chiudi
        </button>
      </div>
    </div>
  `;

  return modal;
}

/**
 * Update settings values from storage
 */
function updateSettingsValues() {
  const settings = getUserSettings();
  
  // Update sound mode
  const soundModeSelect = document.getElementById('soundMode-enhanced');
  if (soundModeSelect) {
    soundModeSelect.value = settings.soundMode || 'voice';
  }
  
  // Update volume
  const volume = getAudioVolume();
  const volumeSlider = document.getElementById('volume-slider');
  const volumeDisplay = document.getElementById('volume-display');
  
  if (volumeSlider && volumeDisplay) {
    volumeSlider.value = Math.round(volume * 100);
    volumeDisplay.textContent = Math.round(volume * 100) + '%';
  }
  
  // Update extra time
  const extraTime = getExtraTime();
  const extraTimeDisplay = document.getElementById('extra-time-display');
  
  if (extraTimeDisplay) {
    extraTimeDisplay.textContent = extraTime + 's';
  }
}

/**
 * Update sound mode
 */
window.updateSoundMode = function(mode) {
  // Update both sound mode selects if they exist
  const mainSelect = document.getElementById('soundMode');
  const setupSelect = document.getElementById('soundMode-setup');
  
  if (mainSelect) mainSelect.value = mode;
  if (setupSelect) setupSelect.value = mode;
  
  // Save to settings
  import('./profile-manager.js').then(module => {
    module.updateUserSettings({ soundMode: mode });
  });
};

/**
 * Update volume
 */
window.updateVolume = function(value) {
  const volume = parseInt(value) / 100;
  setAudioVolume(volume);
  
  const volumeDisplay = document.getElementById('volume-display');
  if (volumeDisplay) {
    volumeDisplay.textContent = Math.round(volume * 100) + '%';
  }
};

/**
 * Adjust volume by increment
 */
window.adjustVolume = function(increment) {
  const currentVolume = getAudioVolume();
  const newVolume = Math.max(0, Math.min(1, currentVolume + increment));
  setAudioVolume(newVolume);
  
  const volumeSlider = document.getElementById('volume-slider');
  const volumeDisplay = document.getElementById('volume-display');
  
  if (volumeSlider) {
    volumeSlider.value = Math.round(newVolume * 100);
  }
  
  if (volumeDisplay) {
    volumeDisplay.textContent = Math.round(newVolume * 100) + '%';
  }
};

/**
 * Add 10 seconds to extra time
 */
window.add10SecondsToSetting = function() {
  add10Seconds();
  
  const extraTime = getExtraTime();
  const extraTimeDisplay = document.getElementById('extra-time-display');
  
  if (extraTimeDisplay) {
    extraTimeDisplay.textContent = extraTime + 's';
  }
  
  // Show feedback
  const btn = event.target;
  btn.textContent = '✓ +10s';
  setTimeout(() => {
    btn.textContent = '+10s';
  }, 1000);
};

/**
 * Reset extra time
 */
window.resetExtraTime = function() {
  import('./profile-manager.js').then(module => {
    module.setExtraTime(0);
    
    const extraTimeDisplay = document.getElementById('extra-time-display');
    if (extraTimeDisplay) {
      extraTimeDisplay.textContent = '0s';
    }
  });
};

/**
 * Close settings modal
 */
window.closeEnhancedSettings = function() {
  const modal = document.querySelector('.enhanced-settings-modal');
  if (modal) {
    modal.classList.remove('show');
    setTimeout(() => {
      modal.remove();
    }, 300);
  }
};

/**
 * Add enhanced settings styles
 */
export function addEnhancedSettingsStyles() {
  if (document.getElementById('enhanced-settings-styles')) {
    return;
  }

  const style = document.createElement('style');
  style.id = 'enhanced-settings-styles';
  style.textContent = `
    .enhanced-settings-modal {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 0.3s ease;
      padding: 1rem;
    }

    .enhanced-settings-modal.show {
      opacity: 1;
    }

    .settings-modal-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.8);
      backdrop-filter: blur(5px);
    }

    .settings-modal-content {
      position: relative;
      background: linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%);
      border-radius: 20px;
      max-width: 500px;
      width: 100%;
      max-height: 90vh;
      overflow-y: auto;
      border: 1px solid rgba(255, 255, 255, 0.2);
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8);
    }

    .settings-header {
      padding: 1.5rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .settings-header h2 {
      font-family: 'Staatliches', sans-serif;
      font-size: 1.5rem;
      color: #fff;
      margin: 0;
    }

    .settings-close {
      background: rgba(255, 255, 255, 0.1);
      border: none;
      color: #fff;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      font-size: 1.5rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s ease;
    }

    .settings-close:hover {
      background: rgba(255, 255, 255, 0.2);
    }

    .settings-body {
      padding: 1.5rem;
    }

    .setting-group {
      margin-bottom: 2rem;
    }

    .setting-label {
      display: flex;
      align-items: center;
      justify-content: space-between;
      color: #fff;
      font-weight: bold;
      margin-bottom: 0.75rem;
      font-size: 1rem;
    }

    .setting-icon {
      font-size: 1.25rem;
      margin-right: 0.5rem;
    }

    .volume-value, .extra-time-value {
      color: #4CAF50;
      font-size: 0.875rem;
    }

    .setting-select {
      width: 100%;
      padding: 0.75rem;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 10px;
      color: #fff;
      font-size: 1rem;
      cursor: pointer;
    }

    .volume-control {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .volume-btn {
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: #fff;
      width: 40px;
      height: 40px;
      border-radius: 8px;
      font-size: 1.25rem;
      cursor: pointer;
      transition: background 0.2s ease;
    }

    .volume-btn:active {
      background: rgba(255, 255, 255, 0.2);
    }

    .volume-slider {
      flex: 1;
      height: 6px;
      border-radius: 3px;
      background: rgba(255, 255, 255, 0.2);
      outline: none;
      -webkit-appearance: none;
    }

    .volume-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: #4CAF50;
      cursor: pointer;
    }

    .volume-slider::-moz-range-thumb {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: #4CAF50;
      cursor: pointer;
      border: none;
    }

    .extra-time-control {
      display: flex;
      gap: 0.75rem;
    }

    .extra-time-btn {
      flex: 1;
      padding: 1rem;
      background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
      border: none;
      border-radius: 10px;
      color: #fff;
      font-size: 1.125rem;
      font-weight: bold;
      cursor: pointer;
      font-family: 'Staatliches', sans-serif;
      transition: transform 0.2s ease;
    }

    .extra-time-btn.secondary {
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
    }

    .extra-time-btn:active {
      transform: scale(0.98);
    }

    .setting-hint {
      margin-top: 0.5rem;
      font-size: 0.875rem;
      color: #999;
    }

    .workout-info {
      background: rgba(255, 255, 255, 0.05);
      padding: 1rem;
      border-radius: 10px;
    }

    .workout-info p {
      color: #ccc;
      margin: 0.25rem 0;
    }

    .settings-footer {
      padding: 1.5rem;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
    }

    .settings-btn {
      width: 100%;
      padding: 1rem;
      border-radius: 10px;
      font-size: 1rem;
      font-weight: bold;
      cursor: pointer;
      font-family: 'Staatliches', sans-serif;
      text-transform: uppercase;
      letter-spacing: 1px;
      border: none;
      transition: transform 0.2s ease;
    }

    .settings-btn.primary {
      background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
      color: #fff;
    }

    .settings-btn:active {
      transform: scale(0.98);
    }
  `;

  document.head.appendChild(style);
}

/**
 * Initialize enhanced settings (call this on page load)
 */
export function initEnhancedSettings() {
  addEnhancedSettingsStyles();
}
