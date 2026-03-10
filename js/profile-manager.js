// ═══════════════════════════════════════════════════════════════════════════
// VILTRUM FITNESS - PROFILE MANAGER
// Manage user profile, settings, and subscription information
// ═══════════════════════════════════════════════════════════════════════════

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

// Initialize Supabase client
let supabase = null;
try {
  if (window.supabase && typeof window.supabase.createClient === 'function') {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('[Profile Manager] Supabase initialized successfully');
  } else {
    console.warn('[Profile Manager] Supabase client not available');
  }
} catch (error) {
  console.error('[Profile Manager] Error initializing Supabase:', error);
}

// ═══════════════════════════════════════════════════════════════════════════
// PROFILE INFORMATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get user profile
 * @returns {Promise<Object>} User profile data
 */
export async function getUserProfile() {
  try {
    const email = localStorage.getItem('loggedUser');
    const username = localStorage.getItem('userName');
    const fullName = localStorage.getItem('userFullName');
    
    // Get subscription info from access control
    const subscriptionInfo = await getSubscriptionInfo();
    
    return {
      email,
      username,
      fullName,
      subscription: subscriptionInfo
    };
  } catch (error) {
    console.error('Error getting user profile:', error);
    return null;
  }
}

/**
 * Get subscription information
 * @returns {Promise<Object>} Subscription info
 */
async function getSubscriptionInfo() {
  try {
    // This should be imported from access-control.js
    // For now, we'll get it from the allUserWorkouts
    const email = localStorage.getItem('loggedUser');
    
    if (!email || !window.allUserWorkouts) {
      return { status: 'unknown', expiryDate: null };
    }
    
    const userData = window.allUserWorkouts[email];
    if (!userData) {
      return { status: 'no_access', expiryDate: null };
    }
    
    const expiryDate = userData.scadenza ? new Date(userData.scadenza) : null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (!expiryDate) {
      return { status: 'trial', expiryDate: null };
    }
    
    expiryDate.setHours(0, 0, 0, 0);
    const daysUntilExpiry = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
    
    if (expiryDate < today) {
      return {
        status: 'expired',
        expiryDate,
        daysExpired: Math.abs(daysUntilExpiry)
      };
    }
    
    return {
      status: 'active',
      expiryDate,
      daysRemaining: daysUntilExpiry
    };
  } catch (error) {
    console.error('Error getting subscription info:', error);
    return { status: 'error', expiryDate: null };
  }
}

/**
 * Update username
 * @param {string} newUsername - New username
 * @returns {Promise<Object>} Result object
 */
export async function updateUsername(newUsername) {
  try {
    console.log('[Profile Manager] Updating username to:', newUsername);
    
    if (!newUsername || newUsername.trim().length < 2) {
      return { success: false, error: 'Username troppo corto (minimo 2 caratteri)' };
    }
    
    // Always update localStorage first
    localStorage.setItem('userName', newUsername.trim());
    console.log('[Profile Manager] Username saved to localStorage');
    
    if (!supabase) {
      console.warn('[Profile Manager] Supabase not available, using localStorage only');
      return { success: true };
    }
    
    // Try to update in Supabase
    try {
      const { data, error } = await supabase.auth.updateUser({
        data: { username: newUsername.trim() }
      });
      
      if (error) {
        console.error('[Profile Manager] Supabase error updating username:', error);
        // Still return success since localStorage was updated
        return { success: true, warning: 'Salvato localmente, sync cloud fallito' };
      }
      
      console.log('[Profile Manager] Username updated in Supabase successfully');
      return { success: true, data };
    } catch (supabaseError) {
      console.error('[Profile Manager] Supabase update failed:', supabaseError);
      // Still return success since localStorage was updated
      return { success: true, warning: 'Salvato localmente' };
    }
  } catch (error) {
    console.error('[Profile Manager] Error updating username:', error);
    return { success: false, error: 'Errore durante l\'aggiornamento' };
  }
}

/**
 * Update email
 * @param {string} newEmail - New email address
 * @param {string} password - Current password for verification
 * @returns {Promise<Object>} Result object
 */
export async function updateEmail(newEmail, password) {
  try {
    console.log('[Profile Manager] Updating email to:', newEmail);
    
    if (!newEmail || !newEmail.includes('@')) {
      return { success: false, error: 'Email non valida' };
    }
    
    if (!password || password.length < 6) {
      return { success: false, error: 'Password richiesta per conferma' };
    }
    
    if (!supabase) {
      console.warn('[Profile Manager] Supabase not available');
      return { success: false, error: 'Supabase non disponibile. Contatta l\'amministratore.' };
    }
    
    // Verify current password first
    const currentEmail = localStorage.getItem('loggedUser');
    console.log('[Profile Manager] Verifying password for:', currentEmail);
    
    try {
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: currentEmail,
        password: password
      });
      
      if (verifyError) {
        console.error('[Profile Manager] Password verification failed:', verifyError);
        return { success: false, error: 'Password non corretta' };
      }
      
      console.log('[Profile Manager] Password verified, updating email...');
      
      // Update email
      const { data, error } = await supabase.auth.updateUser({
        email: newEmail.trim().toLowerCase()
      });
      
      if (error) {
        console.error('[Profile Manager] Error updating email:', error);
        return { success: false, error: error.message };
      }
      
      // Update localStorage
      localStorage.setItem('loggedUser', newEmail.trim().toLowerCase());
      console.log('[Profile Manager] Email updated successfully');
      
      return { 
        success: true, 
        data,
        message: 'Email aggiornata! Controlla la tua casella per confermare.'
      };
    } catch (supabaseError) {
      console.error('[Profile Manager] Supabase operation failed:', supabaseError);
      return { success: false, error: 'Errore di connessione. Riprova.' };
    }
  } catch (error) {
    console.error('[Profile Manager] Error updating email:', error);
    return { success: false, error: 'Errore durante l\'aggiornamento' };
  }
}

/**
 * Format subscription expiry date
 * @param {Date} expiryDate - Expiry date
 * @returns {string} Formatted date string
 */
export function formatExpiryDate(expiryDate) {
  if (!expiryDate) return 'N/A';
  
  const date = new Date(expiryDate);
  const options = { year: 'numeric', month: 'long', day: 'numeric' };
  return date.toLocaleDateString('it-IT', options);
}

/**
 * Get days until expiry message
 * @param {Object} subscription - Subscription object
 * @returns {string} Message about subscription status
 */
export function getSubscriptionMessage(subscription) {
  if (!subscription) return 'Stato sconosciuto';
  
  switch (subscription.status) {
    case 'active':
      if (subscription.daysRemaining <= 7) {
        return `⚠️ Scade tra ${subscription.daysRemaining} giorni`;
      }
      return `✅ Attivo fino al ${formatExpiryDate(subscription.expiryDate)}`;
    
    case 'trial':
      return '🎉 Prova gratuita attiva';
    
    case 'expired':
      return `❌ Scaduto da ${subscription.daysExpired} giorni`;
    
    case 'no_access':
      return '❌ Nessun abbonamento attivo';
    
    default:
      return 'Stato sconosciuto';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// USER MAXES (Massimali)
// Saved in Supabase user_metadata + localStorage cache
// ═══════════════════════════════════════════════════════════════════════════

const MAXES_CACHE_KEY = 'viltrum_user_maxes';

// Available maxes definitions
export const AVAILABLE_MAXES = [
  { id: 'front_squat', label: 'Front Squat', unit: 'kg' },
  { id: 'back_squat', label: 'Back Squat', unit: 'kg' },
  { id: 'deadlift', label: 'Deadlift', unit: 'kg' },
  { id: 'bench_press', label: 'Panca Piana', unit: 'kg' }
];

/**
 * Get user maxes from cache or Supabase
 * @returns {Promise<Object>} User maxes { front_squat: 100, back_squat: 120, ... }
 */
export async function getUserMaxes() {
  try {
    // Try localStorage cache first
    const cached = localStorage.getItem(MAXES_CACHE_KEY);
    if (cached) {
      console.log('[Profile Manager] Maxes loaded from cache');
      return JSON.parse(cached);
    }

    // Try Supabase
    if (supabase) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.user_metadata?.maxes) {
        const maxes = user.user_metadata.maxes;
        localStorage.setItem(MAXES_CACHE_KEY, JSON.stringify(maxes));
        console.log('[Profile Manager] Maxes loaded from Supabase');
        return maxes;
      }
    }

    return {};
  } catch (error) {
    console.error('[Profile Manager] Error getting maxes:', error);
    return {};
  }
}

/**
 * Save user maxes to Supabase + localStorage
 * @param {Object} maxes - { front_squat: 100, back_squat: 120, ... }
 * @returns {Promise<Object>} Result
 */
export async function saveUserMaxes(maxes) {
  try {
    console.log('[Profile Manager] Saving maxes:', maxes);

    // Clean values: remove empty/zero, keep only valid numbers
    const cleanMaxes = {};
    for (const [key, value] of Object.entries(maxes)) {
      const num = parseFloat(value);
      if (!isNaN(num) && num > 0) {
        cleanMaxes[key] = num;
      }
    }

    // Save to localStorage immediately
    localStorage.setItem(MAXES_CACHE_KEY, JSON.stringify(cleanMaxes));
    console.log('[Profile Manager] Maxes saved to localStorage');

    // Save to Supabase for cross-device sync
    if (supabase) {
      try {
        const { error } = await supabase.auth.updateUser({
          data: { maxes: cleanMaxes }
        });

        if (error) {
          console.error('[Profile Manager] Supabase error saving maxes:', error);
          return { success: true, warning: 'Salvato localmente, sync cloud fallito' };
        }

        console.log('[Profile Manager] Maxes synced to Supabase');
        return { success: true };
      } catch (supabaseError) {
        console.error('[Profile Manager] Supabase save failed:', supabaseError);
        return { success: true, warning: 'Salvato localmente' };
      }
    }

    return { success: true };
  } catch (error) {
    console.error('[Profile Manager] Error saving maxes:', error);
    return { success: false, error: 'Errore durante il salvataggio' };
  }
}

/**
 * Calculate weight from percentage of a max
 * Used during workouts when tipoDiPeso is like "70% BackSquat"
 * @param {string} tipoDiPeso - e.g. "70% BackSquat", "80% Panca"
 * @returns {Object|null} { kg: 63, percentage: 70, maxName: 'Back Squat', maxValue: 90 } or null
 */
export function calculateWeightFromMax(tipoDiPeso) {
  if (!tipoDiPeso || typeof tipoDiPeso !== 'string') return null;

  // Pattern: "XX% MaxName"
  const match = tipoDiPeso.match(/^(\d+(?:\.\d+)?)\s*%\s*(.+)$/i);
  if (!match) return null;

  const percentage = parseFloat(match[1]);
  const maxRef = match[2].trim().toLowerCase();

  // Map common references to max IDs
  const maxMapping = {
    'frontsquat': 'front_squat',
    'front squat': 'front_squat',
    'backsquat': 'back_squat',
    'back squat': 'back_squat',
    'squat': 'back_squat',
    'deadlift': 'deadlift',
    'stacco': 'deadlift',
    'panca': 'bench_press',
    'bench': 'bench_press',
    'bench press': 'bench_press',
    'benchpress': 'bench_press',
    'panca piana': 'bench_press'
  };

  const maxId = maxMapping[maxRef];
  if (!maxId) return null;

  // Get cached maxes
  try {
    const cached = localStorage.getItem(MAXES_CACHE_KEY);
    if (!cached) return null;

    const maxes = JSON.parse(cached);
    const maxValue = maxes[maxId];
    if (!maxValue || maxValue <= 0) return null;

    const calculatedKg = Math.round((percentage / 100) * maxValue * 2) / 2; // Round to nearest 0.5

    const maxLabel = AVAILABLE_MAXES.find(m => m.id === maxId)?.label || maxRef;

    return {
      kg: calculatedKg,
      percentage,
      maxName: maxLabel,
      maxValue
    };
  } catch (error) {
    console.error('[Profile Manager] Error calculating weight from max:', error);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════════════════════════════

const SETTINGS_KEY = 'viltrum_user_settings';

/**
 * Get user settings
 * @returns {Object} User settings
 */
export function getUserSettings() {
  try {
    const settings = localStorage.getItem(SETTINGS_KEY);
    return settings ? JSON.parse(settings) : getDefaultSettings();
  } catch (error) {
    console.error('Error loading settings:', error);
    return getDefaultSettings();
  }
}

/**
 * Get default settings
 * @returns {Object} Default settings
 */
function getDefaultSettings() {
  return {
    audioVolume: 1.0,
    extraTime: 0, // Extra seconds to add to exercises
    soundMode: 'eleven', // eleven, voice, synth, bip, none
    notifications: true,
    darkMode: true
  };
}

/**
 * Update user settings
 * @param {Object} newSettings - New settings to merge
 * @returns {Object} Updated settings
 */
export function updateUserSettings(newSettings) {
  try {
    const currentSettings = getUserSettings();
    const updatedSettings = { ...currentSettings, ...newSettings };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(updatedSettings));
    return updatedSettings;
  } catch (error) {
    console.error('Error updating settings:', error);
    return currentSettings;
  }
}

/**
 * Reset settings to default
 */
export function resetSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(getDefaultSettings()));
}

// ═══════════════════════════════════════════════════════════════════════════
// VOLUME CONTROL
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Set audio volume
 * @param {number} volume - Volume level (0.0 to 1.0)
 */
export function setAudioVolume(volume) {
  const clampedVolume = Math.max(0, Math.min(1, volume));
  updateUserSettings({ audioVolume: clampedVolume });
  
  // Update all audio elements
  const audioElements = document.querySelectorAll('audio');
  audioElements.forEach(audio => {
    audio.volume = clampedVolume;
  });
  
  // Update TTS audio if exists
  const ttsAudio = document.getElementById('tts-audio');
  if (ttsAudio) {
    ttsAudio.volume = clampedVolume;
  }
}

/**
 * Get current audio volume
 * @returns {number} Current volume (0.0 to 1.0)
 */
export function getAudioVolume() {
  const settings = getUserSettings();
  return settings.audioVolume;
}

// ═══════════════════════════════════════════════════════════════════════════
// EXTRA TIME
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Set extra time for exercises
 * @param {number} seconds - Extra seconds to add
 */
export function setExtraTime(seconds) {
  updateUserSettings({ extraTime: Math.max(0, seconds) });
}

/**
 * Get extra time setting
 * @returns {number} Extra seconds
 */
export function getExtraTime() {
  const settings = getUserSettings();
  return settings.extraTime || 0;
}

/**
 * Add 10 seconds to extra time
 */
export function add10Seconds() {
  const currentExtra = getExtraTime();
  setExtraTime(currentExtra + 10);
}