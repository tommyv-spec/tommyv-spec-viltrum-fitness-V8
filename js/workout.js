/* ============================================================
   Workout App — Unified Script (Audio-First, End-to-End Hooks)
   Date: 2025-11-07
   Updated: Added support for new userWorkouts format with scadenza
   Notes:
   - Contains the complete, working audio layer (Cloud TTS, Synth TTS,
     Beppe pre-recorded, Beep/Transition SFX) + iOS unlock.
   - Includes playExercise/startExerciseTimer/resumeTimer and essential
     app wiring to ensure audio cues fire at 60s/30s/10s/5s and boundaries.
   - UPDATED: Now handles userWorkouts format: { scadenza, workouts: [...] }
   ============================================================ */

// Import configuration
import { GOOGLE_SCRIPT_URL } from './config.js';

// Import workout history functions
import { getExerciseWeight, syncLastWorkoutToCloud, setLastWorkoutIndexLocal } from './workout-history.js';

// V7.1: Import DataPreloader for plan-based workout loading
import DataPreloader from './data-preloader.js';

/* -------------------- ElevenLabs HD Audio Configuration -------------------- */
const ELEVEN_BASE_URL = 'https://github.com/tommyv-spec/workout-audio/raw/main/docs/elevenlabs_muscle';

// Map of fixed phrases to pre-recorded ElevenLabs audio files
const ELEVEN_AUDIO_MAP = {
  // Transitions
  'prossimo esercizio': 'prossimo-esercizio',
  'prossimo esercizio:': 'prossimo-esercizio',
  'ultimo esercizio': 'ultimo-esercizio',
  'preparati': 'preparati',
  'inizia': 'inizia',
  'cambio': 'cambio',
  
  // Blocks
  'riscaldamento': 'riscaldamento',
  'primo blocco': 'primo-blocco',
  'secondo blocco': 'secondo-blocco',
  'terzo blocco': 'terzo-blocco',
  'quarto blocco': 'quarto-blocco',
  
  // Completion
  'ottimo lavoro': 'ottimo-lavoro',
  'ottimo lavoro!': 'ottimo-lavoro',
  'complimenti': 'complimenti',
  'workout completato': 'workout-completato',
  'workout completato!': 'workout-completato',
  
  // Pause/Recovery
  'pausa': 'pausa',
  'recupero': 'recupero',
  'rest': 'rest',
  
  // English phrases
  'good job': 'good-job',
  'are you ready?': 'are-you-ready',
  
  // Time warnings (reuse from run audio)
  'mancano 60 secondi': 'mancano-60-secondi',
  'mancano 30 secondi': 'mancano-30-secondi',
  'mancano 10 secondi': 'mancano-10-secondi',
  'mancano 5 secondi': 'mancano-5-secondi',
  
  // Numbers
  '1': 'num-1', '2': 'num-2', '3': 'num-3', '4': 'num-4', '5': 'num-5',
  '6': 'num-6', '7': 'num-7', '8': 'num-8', '9': 'num-9', '10': 'num-10',
  '11': 'num-11', '12': 'num-12', '13': 'num-13', '14': 'num-14', '15': 'num-15',
  '16': 'num-16', '17': 'num-17', '18': 'num-18', '19': 'num-19', '20': 'num-20',
  '21': 'num-21', '22': 'num-22', '23': 'num-23', '24': 'num-24', '25': 'num-25',
  '30': 'num-30', '35': 'num-35', '40': 'num-40', '45': 'num-45',
  '50': 'num-50', '60': 'num-60', '90': 'num-90', '120': 'num-120',
  
  // Rep words
  'ripetizioni': 'ripetizioni',
  'ripetizione': 'ripetizione',
  'serie': 'serie',
  
  // Series combinations
  'serie 1 di 2': 'serie-1-di-2', 'serie 2 di 2': 'serie-2-di-2',
  'serie 1 di 3': 'serie-1-di-3', 'serie 2 di 3': 'serie-2-di-3', 'serie 3 di 3': 'serie-3-di-3',
  'serie 1 di 4': 'serie-1-di-4', 'serie 2 di 4': 'serie-2-di-4', 'serie 3 di 4': 'serie-3-di-4', 'serie 4 di 4': 'serie-4-di-4',
  'serie 1 di 5': 'serie-1-di-5', 'serie 2 di 5': 'serie-2-di-5', 'serie 3 di 5': 'serie-3-di-5', 'serie 4 di 5': 'serie-4-di-5', 'serie 5 di 5': 'serie-5-di-5',
};

// Map exercise names to audio file keys
const ELEVEN_EXERCISE_MAP = {
  'air squat': 'air-squat',
  'air squat no lockout': 'air-squat-no-lockout',
  'alternated v up': 'alternated-v-up',
  'alternating bent over rows': 'alternating-bent-over-rows',
  'alternating curl and press': 'alternating-curl-and-press',
  'alternating shoulder press': 'alternating-shoulder-press',
  'banded bicep curl': 'banded-bicep-curl',
  'banded external rotation': 'banded-external-rotation',
  'banded face pull': 'banded-face-pull',
  'banded pull apart': 'banded-pull-apart',
  'banded pulley': 'banded-pulley',
  'banded side walk': 'banded-side-walk',
  'banded upright rows': 'banded-upright-rows',
  'bench dips': 'bench-dips',
  'bench hop over': 'bench-hop-over',
  'bench press': 'bench-press',
  'bench press inclined': 'bench-press-inclined',
  'bench tricep press': 'bench-tricep-press',
  'weighted step up destra': 'weighted-step-up-destra',
  'weighted step up sinistra': 'weighted-step-up-sinistra',
  'bird dog destra': 'bird-dog-destra',
  'bird dog sinistra': 'bird-dog-sinistra',
  'bottom up kettlebell arnold press destra': 'bottom-up-kettlebell-arnold-press-destra',
  'bottom up kettlebell arnold press sinistra': 'bottom-up-kettlebell-arnold-press-sinistra',
  'bottom up kettlebell hold destra': 'bottom-up-kettlebell-hold-destra',
  'bottom up kettlebell hold sinistra': 'bottom-up-kettlebell-hold-sinistra',
  'bottom up kettlebell press destra': 'bottom-up-kettlebell-press-destra',
  'bottom up kettlebell press sinistra': 'bottom-up-kettlebell-press-sinistra',
  'bulgarian split squat destra': 'bulgarian-split-squat-destra',
  'bulgarian split squat sinistra': 'bulgarian-split-squat-sinistra',
  'burpees': 'burpees',
  'cheater curl': 'cheater-curl',
  'chest opener': 'chest-opener',
  'clamshell': 'clamshell',
  'crush grip bent over hold': 'crush-grip-bent-over-hold',
  'crush grip bent over rows': 'crush-grip-bent-over-rows',
  'crush grip bicep curl': 'crush-grip-bicep-curl',
  'crush grip standing shoulder press': 'crush-grip-standing-shoulder-press',
  'crush grip thruster': 'crush-grip-thruster',
  'cuban press': 'cuban-press',
  'cyclist crunch': 'cyclist-crunch',
  'deadbug pulse': 'deadbug-pulse',
  'diamond push up': 'diamond-push-up',
  'doppio dumbbell alternating shoulder press': 'doppio-dumbbell-alternating-shoulder-press',
  'doppio dumbbell bent over rows': 'doppio-dumbbell-bent-over-rows',
  'doppio dumbbell curl': 'doppio-dumbbell-curl',
  'doppio dumbbell curl & press': 'doppio-dumbbell-curl-and-press',
  'doppio dumbbell curl hold': 'doppio-dumbbell-curl-hold',
  'doppio dumbbell deadlift': 'doppio-dumbbell-deadlift',
  'doppio dumbbell hang muscle clean': 'doppio-dumbbell-hang-muscle-clean',
  'doppio dumbbell overhead lunges': 'doppio-dumbbell-overhead-lunges',
  'doppio dumbbell push press': 'doppio-dumbbell-push-press',
  'doppio dumbbell reverse lunges': 'doppio-dumbbell-reverse-lunges',
  'doppio dumbbell shoulder press': 'doppio-dumbbell-shoulder-press',
  'doppio dumbbell sumo deadlift': 'doppio-dumbbell-sumo-deadlift',
  'doppio dumbbell thruster': 'doppio-dumbbell-thruster',
  'doppio kettlebell deadlift': 'doppio-kettlebell-deadlift',
  'doppio kettlebell sumo deadlift': 'doppio-kettlebell-sumo-deadlift',
  'doppio kettlebell swing': 'doppio-kettlebell-swing',
  'due push up burpees': 'due-push-up-burpees',
  'dumbbell clean': 'dumbbell-clean',
  'dumbbell hang snatch': 'dumbbell-hang-snatch',
  'dumbbell mufasa hold': 'dumbbell-mufasa-hold',
  'dumbbell rows destra': 'dumbbell-rows-destra',
  'dumbbell rows sinistra': 'dumbbell-rows-sinistra',
  'dumbbell snatch': 'dumbbell-snatch',
  'external rotation': 'external-rotation',
  'flutterkicks': 'flutterkicks',
  'frontal raises': 'frontal-raises',
  'front rack dumbbell curtsy squat': 'front-rack-dumbbell-curtsy-squat',
  'front rack lunges': 'front-rack-lunges',
  'goblet squat pulse': 'goblet-squat-pulse',
  'gorilla rows': 'gorilla-rows',
  'halo': 'halo',
  'hang clean': 'hang-clean',
  'hip thrust': 'hip-thrust',
  'incline bench reverse fly': 'incline-bench-reverse-fly',
  'istruzioni': 'istruzioni',
  'jm press': 'jm-press',
  'jumping lunges': 'jumping-lunges',
  'kettlebell deadlift': 'kettlebell-deadlift',
  'kettlebell goblet squat': 'kettlebell-goblet-squat',
  'kettlebell horn curl': 'kettlebell-horn-curl',
  'kettlebell muscle clean': 'kettlebell-muscle-clean',
  'kettlebell one leg deadlift': 'kettlebell-one-leg-deadlift',
  'kettlebell sumo squat': 'kettlebell-sumo-squat',
  'kettlebell swing': 'kettlebell-swing',
  'lateral heel touch': 'lateral-heel-touch',
  'lateral raises': 'lateral-raises',
  'lento avanti': 'lento-avanti',
  'monster twist': 'monster-twist',
  'mountain climber': 'mountain-climber',
  'mufasa con dumbbell': 'mufasa-con-dumbbell',
  'one arm bench press destra': 'one-arm-bench-press-destra',
  'one arm bench press sinistra': 'one-arm-bench-press-sinistra',
  'plank hold': 'plank-hold',
  'plank pull through': 'plank-pull-through',
  'plank push through': 'plank-push-through',
  'plank shoulder tap': 'plank-shoulder-tap',
  'pullover': 'pullover',
  'push up': 'push-up',
  'quad push up': 'quad-push-up',
  'rear delt swing': 'rear-delt-swing',
  'reverse fly': 'reverse-fly',
  'reverse lunges': 'reverse-lunges',
  'romanian deadlift': 'romanian-deadlift',
  'rowing snatch destra': 'rowing-snatch-destra',
  'rowing snatch sinistra': 'rowing-snatch-sinistra',
  'russian sit up': 'russian-sit-up',
  'russian twist': 'russian-twist',
  'seated arnold press': 'seated-arnold-press',
  'seated bicep curl': 'seated-bicep-curl',
  'seated crush grip shoulder press': 'seated-crush-grip-shoulder-press',
  'seated lateral raises': 'seated-lateral-raises',
  'seated overhead tricep extension': 'seated-overhead-tricep-extension',
  'seated snatch': 'seated-snatch',
  'side plank reach destra': 'side-plank-reach-destra',
  'side plank reach sinistra': 'side-plank-reach-sinistra',
  'sigsaw rows': 'sigsaw-rows',
  'single dumbbell overhead lunges destra': 'single-dumbbell-overhead-lunges-destra',
  'single dumbbell overhead lunges sinistra': 'single-dumbbell-overhead-lunges-sinistra',
  'single dumbbell thruster destra': 'single-dumbbell-thruster-destra',
  'single dumbbell thruster sinistra': 'single-dumbbell-thruster-sinistra',
  'sit up on bench': 'sit-up-on-bench',
  'squat jump': 'squat-jump',
  'squat pulse': 'squat-pulse',
  'staggered stance deadlift destra': 'staggered-stance-deadlift-destra',
  'staggered stance deadlift sinistra': 'staggered-stance-deadlift-sinistra',
  'standing alternated arnold press': 'standing-alternated-arnold-press',
  'standing alternated bicep curl': 'standing-alternated-bicep-curl',
  'standing overhead tricep extension': 'standing-overhead-tricep-extension',
  'step up': 'step-up',
  'straight leg deadlift': 'straight-leg-deadlift',
  'suitcase reverse lunges': 'suitcase-reverse-lunges',
  'supine delt raise': 'supine-delt-raise',
  'tate press': 'tate-press',
  'tricep kick back destra': 'tricep-kick-back-destra',
  'tricep kick back sinistra': 'tricep-kick-back-sinistra',
  'tricep push up': 'tricep-push-up',
  'tuck up': 'tuck-up',
  'turkish sit up': 'turkish-sit-up',
  'v up': 'v-up',
  'viltrum complex': 'viltrum-complex',
  'weighted deadbug pulse': 'weighted-deadbug-pulse',
  'weighted v up': 'weighted-v-up',
  'windmill destra': 'windmill-destra',
  'windmill sinistra': 'windmill-sinistra',
  'bottom squat hold': 'bottom-squat-hold',
  'dumbbell front squat': 'dumbbell-front-squat',
  'cossack squat': 'cossack-squat',
  'cossack switch': 'cossack-switch',
  'goblet cossack squat': 'goblet-cossack-squat',
  'tricep extension pulse': 'tricep-extension-pulse',
  'man maker': 'man-maker',
  'renegade rows': 'renegade-rows',
  'kot lunges destra': 'kot-lunges-destra',
  'kot lunges sinistra': 'kot-lunges-sinistra',
  'walkout': 'walkout',
  'reverse walkout': 'reverse-walkout',
  'hamstring plank': 'hamstring-plank',
  'down dog to updog': 'down-dog-to-updog',
  'pinwheel': 'pinwheel',
  'pvc prone btn flow': 'pvc-prone-btn-flow',
  'prone snowangel': 'prone-snowangel',
  'banded kettlebell press destra': 'banded-kettlebell-press-destra',
  'banded kettlebell press sinistra': 'banded-kettlebell-press-sinistra',
  'banded kettlebell oh hold destra': 'banded-kettlebell-oh-hold-destra',
  'banded kettlebell oh hold sinistra': 'banded-kettlebell-oh-hold-sinistra',
  'banded goodmorning': 'banded-goodmorning',
  'kettlebell gorilla rows': 'kettlebell-gorilla-rows',
  'kettlebell shot through': 'kettlebell-shot-through',
  'crush grip bench': 'crush-grip-bench',
  'crush grip skull crush': 'crush-grip-skull-crush',
  'crush grip tricep extension': 'crush-grip-tricep-extension',
  'hip extension on bench': 'hip-extension-on-bench',
  'hip extension hold on bench': 'hip-extension-hold-on-bench',
  'banded one hamstring hold destra': 'banded-one-hamstring-hold-destra',
  'banded one hamstring hold sinistra': 'banded-one-hamstring-hold-sinistra',
  'banded one hamstring curl destra': 'banded-one-hamstring-curl-destra',
  'banded one hamstring curl sinistra': 'banded-one-hamstring-curl-sinistra',
  'banded one hamstring pump destra': 'banded-one-hamstring-pump-destra',
  'banded one hamstring pump sinistra': 'banded-one-hamstring-pump-sinistra',
  'doppio dumbbell lunges destra': 'doppio-dumbbell-lunges-destra',
  'doppio dumbbell lunges sinistra': 'doppio-dumbbell-lunges-sinistra',
  'lateral swing destra': 'lateral-swing-destra',
  'lateral swing sinistra': 'lateral-swing-sinistra',
  'doppio dumbbell clean & press': 'doppio-dumbbell-clean-and-press',
  'wood chop destra': 'wood-chop-destra',
  'wood chop sinistra': 'wood-chop-sinistra',
  'tall kneeling around the world orario': 'tall-kneeling-around-the-world-orario',
  'tall kneeling around the world antiorario': 'tall-kneeling-around-the-world-antiorario',
  'goblet squat no lockout': 'goblet-squat-no-lockout',
  'bench back extension': 'bench-back-extension',
  'bench back extension hold': 'bench-back-extension-hold',
  'suitcase march dx': 'suitcase-march-dx',
  'suitcase march sx': 'suitcase-march-sx',
  'crush grip frontal raise': 'crush-grip-frontal-raise',
  'crush grip overhead hold': 'crush-grip-overhead-hold',
  'crossbody march destra su': 'crossbody-march-destra-su',
  'crossbody march sinistra su': 'crossbody-march-sinistra-su',
  'crush grip press': 'crush-grip-press',
  'one arm swing & pull destra': 'one-arm-swing-and-pull-destra',
  'one arm swing & pull sinistra': 'one-arm-swing-and-pull-sinistra',
  'farmer march': 'farmer-march',
  'elevated hip tilt destra': 'elevated-hip-tilt-destra',
  'elevated hip tilt sinistra': 'elevated-hip-tilt-sinistra',
  'standing upright rows': 'standing-upright-rows',
  'single leg elevated hip extension destra': 'single-leg-elevated-hip-extension-destra',
  'single leg elevated hip extension sinistra': 'single-leg-elevated-hip-extension-sinistra',
  'alternate bench press': 'alternate-bench-press',
  'tall kneeling alt twist & press': 'tall-kneeling-alt-twist-and-press',
  'rnt reverse lunges destra': 'rnt-reverse-lunges-destra',
  'rnt reverse lunges sinistra': 'rnt-reverse-lunges-sinistra',
  'one arm kettlebell swing destra': 'one-arm-kettlebell-swing-destra',
  'one arm kettlebell swing sinistra': 'one-arm-kettlebell-swing-sinistra',
  'filly march destra su': 'filly-march-destra-su',
  'filly march sinistra su': 'filly-march-sinistra-su',
  'copenaghen side plank destra': 'copenaghen-side-plank-destra',
  'copenaghen side plank sinistra': 'copenaghen-side-plank-sinistra',
  'curl & press destra': 'curl-and-press-destra',
  'curl & press sinistra': 'curl-and-press-sinistra',
  'crush grip curl hold': 'crush-grip-curl-hold',
};

/**
 * Play ElevenLabs pre-recorded audio
 * @param {string} audioKey - Key for the audio file (without extension)
 * @returns {Promise<boolean>} - True if played successfully
 */
async function playElevenAudio(audioKey) {
  const url = `${ELEVEN_BASE_URL}/${audioKey}.mp3`;
  try {
    await ensureAudioUnlocked();
    await playAudioUrl(url);
    console.log(`🎙️ ElevenLabs audio played: ${audioKey}`);
    return true;
  } catch (err) {
    console.warn(`⚠️ ElevenLabs audio failed for ${audioKey}:`, err);
    return false;
  }
}

/**
 * Speak using ElevenLabs HD audio with Cloud TTS fallback
 * @param {string} text - Text to speak
 * @param {string} lang - Language code
 */
async function speakEleven(text, lang = "it-IT") {
  const normalizedText = text.toLowerCase().trim();
  
  // Check fixed phrases first
  if (ELEVEN_AUDIO_MAP[normalizedText]) {
    const played = await playElevenAudio(ELEVEN_AUDIO_MAP[normalizedText]);
    if (played) return;
  }
  
  // Check exercise names
  if (ELEVEN_EXERCISE_MAP[normalizedText]) {
    const played = await playElevenAudio(ELEVEN_EXERCISE_MAP[normalizedText]);
    if (played) return;
  }
  
  // Fallback to Cloud TTS for dynamic content
  console.log(`🔄 ElevenLabs fallback to Cloud TTS for: "${text}"`);
  try {
    await speakCloud(text, lang);
  } catch (err) {
    console.warn(`⚠️ Cloud TTS fallback failed, trying synth...`);
    try {
      await speakSynth(text, lang);
    } catch (synthErr) {
      console.error(`❌ All audio methods failed for: "${text}"`);
    }
  }
}

/* -------------------- Cached Image Loading -------------------- */
/**
 * Load image from offline cache if available, otherwise use network
 * Adds loading state and proper error handling
 */
async function loadCachedImage(imageElement, url) {
  if (!url || !imageElement) {
    console.warn('⚠️ loadCachedImage called with invalid parameters');
    return;
  }
  
  // Set loading state
  imageElement.style.opacity = '0.3';
  imageElement.style.transition = 'opacity 0.3s ease';
  
  // Try to get from offline cache
  if (typeof OfflinePreloader !== 'undefined') {
    try {
      const cachedUrl = await OfflinePreloader.getCachedImage(url);
      if (cachedUrl) {
        console.log(`✅ Using cached image: ${url.substring(40, 60)}...`);
        imageElement.src = cachedUrl;
        imageElement.style.opacity = '1';
        return;
      } else {
        console.log(`⚠️ Image not in cache, loading from network: ${url.substring(40, 60)}...`);
      }
    } catch (error) {
      console.warn('❌ Failed to load cached image:', error);
    }
  } else {
    console.warn('⚠️ OfflinePreloader not available');
  }
  
  // Fallback to network
  imageElement.src = url;
  imageElement.onload = () => {
    imageElement.style.opacity = '1';
  };
  imageElement.onerror = () => {
    console.error(`❌ Failed to load image from network: ${url.substring(40, 60)}...`);
    imageElement.style.opacity = '0.5';
  };
}

/* -------------------- Global State -------------------- */
let workouts = {};
let selectedWorkout = {};
let currentStep = 0;
let interval = null;
let isPaused = false;
let savedTimeLeft = null;
let lastSpeakTime = 0;
let currentSpeakId = 0;
let wakeLock = null; // Screen wake lock to keep screen on during workout
let currentTimerEndTime = null; // For +10s button functionality
let isWorkoutActive = false; // Track if workout is running
let currentVolume = 1.0; // Global volume control (0.0 to 1.0)
let workoutStartTime = null; // Track when workout started for duration calculation
let currentWorkoutIndex = 0; // Track which workout (session) is currently selected
let totalUserWorkouts = 0; // Track total number of workouts available to user

/* -------------------- Configuration Constants -------------------- */
// Viewport metric update delays (iOS Safari needs multiple passes for accurate measurements)
const VIEWPORT_UPDATE_DELAYS = {
  FIRST: 250,   // First retry after initial calculation
  SECOND: 750   // Second retry to ensure stability
};

// Carousel configuration
const CAROUSEL_CONFIG = {
  MIN_HEIGHT: 140,           // Minimum carousel height in pixels
  MAX_HEIGHT: 280,           // Maximum carousel height in pixels
  HEIGHT_PERCENTAGE: 0.45    // Percentage of sheet height for carousel (45%)
};

// Training selector configuration
const TRAINING_CONFIG = {
  IMAGE_HEIGHT_PERCENTAGE: 0.42  // Hero image takes 42% of visible height
};

// Audio timing thresholds
const AUDIO_CUES = {
  LONG_WARNING: 60,    // Long exercises get cue at 60 seconds
  MEDIUM_WARNING: 30,  // Medium exercises get cue at 30 seconds
  SHORT_WARNING: 10,   // Short warning at 10 seconds
  FINAL_WARNING: 5     // Final countdown at 5 seconds
};

/* Singletons */
const ttsAudio = new Audio();
ttsAudio.id = "tts-audio";
ttsAudio.preload = "auto";
ttsAudio.playsInline = true;
ttsAudio.setAttribute("playsinline", "");
ttsAudio.setAttribute("webkit-playsinline", "");
document.body.appendChild(ttsAudio);

/* -------------------- Wake Lock (Keep Screen On) -------------------- */
/**
 * Request screen wake lock to prevent screen from turning off during workout
 */
async function requestWakeLock() {
  try {
    // Check if Wake Lock API is supported
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      
      // Listen for wake lock release
      wakeLock.addEventListener('release', () => {
      });
    } else {
      // Fallback: iOS Safari doesn't support Wake Lock API
      // But we can use a video element trick
      enableIOSScreenWakeLock();
    }
  } catch (err) {
    console.error('❌ Failed to activate wake lock:', err);
    // Try iOS fallback
    enableIOSScreenWakeLock();
  }
}

/**
 * Release the wake lock (allow screen to turn off normally)
 */
async function releaseWakeLock() {
  if (wakeLock !== null) {
    try {
      await wakeLock.release();
      wakeLock = null;
    } catch (err) {
      console.error('❌ Failed to release wake lock:', err);
    }
  }
  // Also disable iOS fallback
  disableIOSScreenWakeLock();
}

/**
 * iOS Safari fallback: Use a tiny looping video to keep screen awake
 */
let iosWakeLockVideo = null;
function enableIOSScreenWakeLock() {
  if (!iosWakeLockVideo) {
    // Create a 1x1 transparent video that loops
    iosWakeLockVideo = document.createElement('video');
    iosWakeLockVideo.setAttribute('muted', '');
    iosWakeLockVideo.setAttribute('playsinline', '');
    iosWakeLockVideo.setAttribute('loop', '');
    iosWakeLockVideo.style.position = 'fixed';
    iosWakeLockVideo.style.opacity = '0';
    iosWakeLockVideo.style.width = '1px';
    iosWakeLockVideo.style.height = '1px';
    iosWakeLockVideo.style.pointerEvents = 'none';
    
    // Tiny base64 video (1 frame, transparent)
    iosWakeLockVideo.src = 'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAAu1tZGF0AAACrQYF//+p3EXpvebZSLeWLNgg2SPu73gyNjQgLSBjb3JlIDE0OCByMjYwMSBhMGIxMGMxIC0gSC4yNjQvTVBFRy00IEFWQyBjb2RlYyAtIENvcHlsZWZ0IDIwMDMtMjAxNSAtIGh0dHA6Ly93d3cudmlkZW9sYW4ub3JnL3gyNjQuaHRtbCAtIG9wdGlvbnM6IGNhYmFjPTEgcmVmPTMgZGVibG9jaz0xOjA6MCBhbmFseXNlPTB4MzoweDExMyBtZT1oZXggc3VibWU9NyBwc3k9MSBwc3lfcmQ9MS4wMDowLjAwIG1peGVkX3JlZj0xIG1lX3JhbmdlPTE2IGNocm9tYV9tZT0xIHRyZWxsaXM9MSA4eDhkY3Q9MSBjcW09MCBkZWFkem9uZT0yMSwxMSBmYXN0X3Bza2lwPTEgY2hyb21hX3FwX29mZnNldD0tMiB0aHJlYWRzPTEgbG9va2FoZWFkX3RocmVhZHM9MSBzbGljZWRfdGhyZWFkcz0wIG5yPTAgZGVjaW1hdGU9MSBpbnRlcmxhY2VkPTAgYmx1cmF5X2NvbXBhdD0wIGNvbnN0cmFpbmVkX2ludHJhPTAgYmZyYW1lcz0zIGJfcHlyYW1pZD0yIGJfYWRhcHQ9MSBiX2JpYXM9MCBkaXJlY3Q9MSB3ZWlnaHRiPTEgb3Blbl9nb3A9MCB3ZWlnaHRwPTIga2V5aW50PTI1MCBrZXlpbnRfbWluPTI1IHNjZW5lY3V0PTQwIGludHJhX3JlZnJlc2g9MCByY19sb29rYWhlYWQ9NDAgcmM9Y3JmIG1idHJlZT0xIGNyZj0yMy4wIHFjb21wPTAuNjAgcXBtaW49MCBxcG1heD02OSBxcHN0ZXA9NCBpcF9yYXRpbz0xLjQwIGFxPTE6MS4wMACAAAAAD2WIhAAR//73n74i1R7AYWvoAAADAAADAAADAAADAAADAAAGKjAAH//73n74i1R7AYWvoAAAAwAAAwAAAwAAAwAAAwAABiowAB//+95++ItUewGFr6AAAAMAAAMAAAMAAAMAAAMAAAYqMAA==';
    
    document.body.appendChild(iosWakeLockVideo);
  }
  
  // Start playing the video
  iosWakeLockVideo.play().catch(err => {
  });
  
}

function disableIOSScreenWakeLock() {
  if (iosWakeLockVideo) {
    iosWakeLockVideo.pause();
    iosWakeLockVideo.currentTime = 0;
  }
}

/* -------------------- Viewport Metrics (iOS Safari toolbars) -------------------- */
const VIEWPORT_VAR_ROOT = document.documentElement;

function updateViewportMetrics() {
  const viewport = window.visualViewport;
  const height = viewport ? viewport.height : window.innerHeight || 0;
  const width = viewport ? viewport.width : window.innerWidth || 0;

  const computed = getComputedStyle(VIEWPORT_VAR_ROOT);
  const safeTop = parseFloat(computed.getPropertyValue('--safe-area-top')) || 0;
  const safeBottom = parseFloat(computed.getPropertyValue('--safe-area-bottom')) || 0;
  
  // CRITICAL: Subtract safe areas from visible height for iOS
  const adjustedHeight = Math.max(0, height - safeTop - safeBottom);

  if (adjustedHeight > 0) {
    VIEWPORT_VAR_ROOT.style.setProperty('--visible-vh', `${adjustedHeight}px`);
  }
  if (width) {
    VIEWPORT_VAR_ROOT.style.setProperty('--visible-vw', `${width}px`);
  }

  const header = document.querySelector('header');
  const headerHeight = header ? header.getBoundingClientRect().height : 0;

  const footerTotal = parseFloat(computed.getPropertyValue('--footer-total')) || 0;
  const loginGap = parseFloat(computed.getPropertyValue('--login-gap')) || 0;

  const loginAvailable = Math.max(0, adjustedHeight - headerHeight);
  VIEWPORT_VAR_ROOT.style.setProperty('--login-screen-height-js', `${loginAvailable}px`);

  const mainAvailable = Math.max(0, adjustedHeight - headerHeight - footerTotal);
  VIEWPORT_VAR_ROOT.style.setProperty('--main-app-visible-height', `${mainAvailable}px`);

  const loginCard = document.querySelector('#login-screen .login-card');
  const cardHeight = loginCard ? loginCard.getBoundingClientRect().height : 0;
  const selectorAvailable = Math.max(0, loginAvailable - cardHeight - loginGap);

  if (selectorAvailable > 0) {
    VIEWPORT_VAR_ROOT.style.setProperty('--training-selector-js-height', `${selectorAvailable}px`);
  } else {
    VIEWPORT_VAR_ROOT.style.removeProperty('--training-selector-js-height');
  }

  const sheetAvailable = Math.max(0, adjustedHeight - 24);
  if (sheetAvailable > 0) {
    VIEWPORT_VAR_ROOT.style.setProperty('--bottom-sheet-max-height', `${sheetAvailable}px`);
    const carouselHeight = Math.max(
      CAROUSEL_CONFIG.MIN_HEIGHT, 
      Math.min(sheetAvailable * CAROUSEL_CONFIG.HEIGHT_PERCENTAGE, CAROUSEL_CONFIG.MAX_HEIGHT)
    );
    VIEWPORT_VAR_ROOT.style.setProperty('--bottom-sheet-carousel-height', `${carouselHeight}px`);
  } else {
    VIEWPORT_VAR_ROOT.style.removeProperty('--bottom-sheet-max-height');
    VIEWPORT_VAR_ROOT.style.removeProperty('--bottom-sheet-carousel-height');
  }
}

function initViewportMetrics() {
  updateViewportMetrics();
  setTimeout(updateViewportMetrics, VIEWPORT_UPDATE_DELAYS.FIRST);
  setTimeout(updateViewportMetrics, VIEWPORT_UPDATE_DELAYS.SECOND);

  window.addEventListener('resize', updateViewportMetrics, { passive: true });
  window.addEventListener('orientationchange', () => {
    setTimeout(updateViewportMetrics, 150);
  }, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', updateViewportMetrics, { passive: true });
    window.visualViewport.addEventListener('scroll', updateViewportMetrics, { passive: true });
  }
}

window.refreshViewportMetrics = updateViewportMetrics;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initViewportMetrics, { once: true });
} else {
  initViewportMetrics();
}

/* === LOGIN SCREEN: VISIBLE HEIGHT + NO SCROLL LOCK === */

/* Reuse existing root and function if present; otherwise define safely */
const __ROOT__ = document.documentElement;

function __updateLoginViewportVars() {
  const vv = window.visualViewport;
  const vh = vv ? vv.height : window.innerHeight || 0;
  const header = document.querySelector('header');
  const headerH = header ? header.getBoundingClientRect().height : 0;

  // Safe area bottom from CSS var
  const cs = getComputedStyle(__ROOT__);
  const safeBottom = parseFloat(cs.getPropertyValue('--safe-area-bottom')) || 0;

  // Visible height available for the login screen
  const loginAvailable = Math.max(0, vh - headerH - safeBottom);
  __ROOT__.style.setProperty('--login-screen-height-js', `${loginAvailable}px`);
}

/* Add/remove a no-scroll lock while #login-screen is visible */
function __applyLoginScrollLock() {
  const login = document.getElementById('login-screen');
  const isVisible = !!login && getComputedStyle(login).display !== 'none';
  document.documentElement.classList.toggle('no-scroll', isVisible);
  document.body.classList.toggle('no-scroll', isVisible);
}

/* Hook up events */
function __bindLoginViewportHandlers() {
  __updateLoginViewportVars();
  __applyLoginScrollLock();

  // Recalculate on viewport changes (iOS toolbars, rotate, resize)
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
      __updateLoginViewportVars();
      __applyLoginScrollLock();
    });
    window.visualViewport.addEventListener('scroll', () => {
      __updateLoginViewportVars();
      __applyLoginScrollLock();
    });
  }
  window.addEventListener('resize', () => {
    __updateLoginViewportVars();
    __applyLoginScrollLock();
  });

  // A couple of delayed passes help on iOS after load
  setTimeout(__updateLoginViewportVars, 250);
  setTimeout(__updateLoginViewportVars, 750);
}

document.addEventListener('DOMContentLoaded', __bindLoginViewportHandlers);

window.__audioCtx = new (window.AudioContext || window.webkitAudioContext)();

let nextPreviewShown = false;   // controls the 10s preview (fires once per exercise)

function setSoundMode(value) {
  const a = document.getElementById("soundMode");
  const b = document.getElementById("soundMode-setup");
  if (a) a.value = value;
  if (b) b.value = value;
}
function getPreferredVoice() {
  const list = (speechSynthesis.getVoices && speechSynthesis.getVoices()) || [];
  // prefer Google voices first
  const googleIt = list.find(v => /google/i.test(v.name||"") && /^it(-|_)/i.test(v.lang||""));
  if (googleIt) return googleIt;
  const googleEn = list.find(v => /google/i.test(v.name||"") && /^en(-|_)/i.test(v.lang||""));
  if (googleEn) return googleEn;
  // then any Italian / English
  const anyIt = list.find(v => /^it(-|_)/i.test(v.lang||""));
  if (anyIt) return anyIt;
  const anyEn = list.find(v => /^en(-|_)/i.test(v.lang||""));
  if (anyEn) return anyEn;
  // fallback: first Google, else first voice
  const anyGoogle = list.find(v => /google/i.test(v.name||""));
  return anyGoogle || list[0] || null;
}
try {
  const __ctx = new (window.AudioContext || window.webkitAudioContext)();
  window.__audioCtx = __ctx;
  setInterval(() => {
    if (__ctx.state === "suspended") { __ctx.resume().catch(()=>{}); }
  }, 1500);
} catch {}

  
// keep a shared AudioContext alive on Android

/* Pre-recorded (Beppe) player */
let beppePlayer = new Audio();
beppePlayer.preload = "auto";

/* Warm-up Render TTS (optional) */
function warmUpServer() {
  fetch("https://google-tts-server.onrender.com")
    .then(() => console.log("✅ TTS server attivo"))
    .catch(() => console.warn("⚠️ Server TTS non raggiungibile"));
}

/* -------------------- Synth Voice Lock -------------------- */
// --- Synth voices lock (Android-safe) ---
const SYNTH_PREFS = {
  "it-IT": ["Siri Voice 4","Siri Voice 3","Google italiano","Microsoft Elsa","Microsoft Lucia"],
  "en-US": ["Siri Voice 3","Siri Voice 2","Google US English","Microsoft Aria","Microsoft Jenny"]
};

const synthVoicesLocked = {}; // per lingua → voce scelta

function pickVoice(lang) {
  const all = (speechSynthesis.getVoices && speechSynthesis.getVoices()) || [];
  const want = (lang || "").toLowerCase();

  // Prefer Google voices on Android if present
  const googleFirst = all.find(v =>
    (v.lang || "").toLowerCase().startsWith(want) &&
    /google/i.test(v.name || "")
  );
  if (googleFirst) return googleFirst;

  // Your existing preferences still apply
  for (const name of (SYNTH_PREFS[lang] || [])) {
    const v = all.find(v =>
      (v.lang || "").toLowerCase().startsWith(want) &&
      (v.name || "").includes(name)
    );
    if (v) return v;
  }

  const same = all.filter(v => (v.lang || "").toLowerCase().startsWith(want));
  if (same.length) return same[0];

  return all[0] || null;
}

function lockSynthVoices() {
  try {
    synthVoicesLocked["it-IT"] = pickVoice("it-IT");
    synthVoicesLocked["en-US"] = pickVoice("en-US");
  } catch {}
}

/**
 * Wait until voices are actually available.
 * Android often never fires onvoiceschanged; we poll with a timeout fallback.
 */
function waitForVoices(timeoutMs = 1500) {
  return new Promise(resolve => {
    const done = () => resolve();
    if ((speechSynthesis.getVoices() || []).length) return done();

    let settled = false;
    const finish = () => { if (!settled) { settled = true; done(); } };

    const prev = speechSynthesis.onvoiceschanged;
    speechSynthesis.onvoiceschanged = () => { speechSynthesis.onvoiceschanged = prev || null; finish(); };

    const start = Date.now();
    const poll = setInterval(() => {
      const vs = speechSynthesis.getVoices() || [];
      if (vs.length || Date.now() - start >= timeoutMs) { clearInterval(poll); finish(); }
    }, 100);
    setTimeout(() => { clearInterval(poll); finish(); }, timeoutMs + 200);
  });
}

/* ---------- Android Synth Primer (user-gesture + resume) ---------- */
let __synthPrimed = false;

function primeSynth() {
  if (__synthPrimed || !('speechSynthesis' in window)) return;
  try {
    // Make sure voices are actually loaded (poll fallback)
    const ensureVoices = new Promise((resolve) => {
      const have = () => (speechSynthesis.getVoices() || []).length > 0;
      if (have()) return resolve();
      const start = Date.now();
      const t = setInterval(() => {
        if (have() || Date.now() - start > 1500) {
          clearInterval(t);
          resolve();
        }
      }, 100);
    });

    ensureVoices.then(() => {
      try { speechSynthesis.resume(); } catch {}

      const u = new SpeechSynthesisUtterance(" "); // silent kick
      u.volume = 0;      // inaudible
      u.rate = 1;
      u.pitch = 1;
      // If Android never fires events, just mark as primed after a moment
      const watchdog = setTimeout(() => { __synthPrimed = true; }, 250);
      u.onstart = () => { clearTimeout(watchdog); __synthPrimed = true; };
      u.onerror = () => { clearTimeout(watchdog); __synthPrimed = true; };
      speechSynthesis.speak(u);
    });
  } catch {
    __synthPrimed = true;
  }
}

// Prime on the first real user gesture
document.addEventListener('touchstart', primeSynth, { once: true, passive: true });
document.addEventListener('click',      primeSynth, { once: true });

/* -------------------- iOS Audio Unlock -------------------- */
function unlockAllAudio() {
  if (window.__audioUnlocked) return;

  try {
    // Unlock ttsAudio
    ttsAudio.src = "data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAADhACA";
    ttsAudio.volume = 0.01;
    ttsAudio.play().then(() => {
      ttsAudio.volume = 1.0;
    }).catch(() => {});

    // Unlock beppePlayer
    beppePlayer.src = "data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAADhACA";
    beppePlayer.volume = 0.01;
    beppePlayer.play().then(() => {
      beppePlayer.volume = 1.0;
    }).catch(() => {});

    // REMOVE the whole block that does beepEl.play() at 0.01 and transitionEl.play() at 0.01
    // REPLACE it with this:

    // Reset (do NOT play here)
    const beepEl = document.getElementById("beep-sound");
    if (beepEl) {
      beepEl.pause();
      beepEl.currentTime = 0;
      beepEl.volume = 1.0;
      beepEl.muted = false;
    }

    const transitionEl = document.getElementById("transition-sound");
    if (transitionEl) {
      transitionEl.pause();
      transitionEl.currentTime = 0;
      transitionEl.volume = 1.0;
      transitionEl.muted = false;
    }

    window.__audioUnlocked = true;
  } catch (error) {
    console.error("❌ Audio unlock error:", error);
  }
}

document.addEventListener("touchstart", unlockAllAudio, { once: true, passive: true });
document.addEventListener("click", unlockAllAudio, { once: true });

/* Safe one-time unlock fallback */
document.addEventListener("touchend", ensureAudioUnlocked, { once: true });
document.addEventListener("click", () => {
  if (!window.__audioUnlocked) {
    beppePlayer.src = "data:audio/mp3;base64,//uQxAAAAAA==";
    beppePlayer.play().then(() => {
      window.__audioUnlocked = true;
    }).catch(() => console.warn("⚠️ Impossibile sbloccare audio su iOS"));
  }
}, { once: true });

/* -------------------- Pre-Recorded (Beppe) + SFX -------------------- */
const beppeSounds = {
  s60: "https://github.com/tommyv-spec/workout-audio/raw/refs/heads/main/docs/mancano%2060%20secondi.mp3",
  s30: "https://github.com/tommyv-spec/workout-audio/raw/refs/heads/main/docs/mancano%2030%20secondi.mp3",
  countdown5: "https://github.com/tommyv-spec/workout-audio/raw/refs/heads/main/docs/count%20down%20pi%C3%B9%20veloce.MP3",
  prossimo: "https://github.com/tommyv-spec/workout-audio/raw/refs/heads/main/docs/Prossimo%20esercizio.MP3"
};

function convertGoogleDriveToDirect(link) { return link; }

async function playBeppeAudio(url) {
  if (!url) return;
  
  // Extract the audio name from the URL for cache lookup
  const urlMatch = url.match(/([^\/]+)\.MP3$/i);
  const audioName = urlMatch ? decodeURIComponent(urlMatch[1]) : null;
  
  // Check offline cache first
  if (audioName && typeof OfflinePreloader !== 'undefined') {
    const cacheKey = `beppe_${audioName}`;
    const cachedUrl = await OfflinePreloader.getCachedAudio(cacheKey);
    
    if (cachedUrl) {
      console.log(`✅ Using cached Beppe audio: ${audioName}`);
      beppePlayer.src = cachedUrl;
      beppePlayer.play().catch((e) => console.warn("❌ Errore audio:", e));
      return;
    }
  }
  
  // Fallback to network
  beppePlayer.src = convertGoogleDriveToDirect(url);
  beppePlayer.play().catch((e) => console.warn("❌ Errore audio:", e));
}

async function playBeppeAudioSequence(urls) {
  for (const url of urls) {
    if (!url) continue;
    
    // Extract the audio name from the URL for cache lookup
    const urlMatch = url.match(/([^\/]+)\.MP3$/i);
    const audioName = urlMatch ? decodeURIComponent(urlMatch[1]) : null;
    
    // Check offline cache first
    let finalUrl = convertGoogleDriveToDirect(url);
    if (audioName && typeof OfflinePreloader !== 'undefined') {
      const cacheKey = `beppe_${audioName}`;
      const cachedUrl = await OfflinePreloader.getCachedAudio(cacheKey);
      
      if (cachedUrl) {
        console.log(`✅ Using cached Beppe audio: ${audioName}`);
        finalUrl = cachedUrl;
      }
    }
    
    beppePlayer.src = finalUrl;
    await new Promise((resolve) => {
      beppePlayer.onended = resolve;
      beppePlayer.onerror = resolve;
      beppePlayer.play().catch(resolve);
    });
  }
}

function preloadAudio(urls) {
  urls.forEach(url => {
    const audio = new Audio();
    audio.src = convertGoogleDriveToDirect(url);
    audio.preload = "auto";
  });
}

function preloadWorkoutAudios() {
  const audioUrls = [];
  Object.values(workouts).forEach(workout => {
    (workout.exercises || []).forEach(ex => {
      if (ex.audio) audioUrls.push(ex.audio);
      if (ex.audioCambio) audioUrls.push(ex.audioCambio);
    });
  });
  preloadAudio(audioUrls);
}

function playBeep() {
  // Only care in Beep mode; do nothing otherwise (keeps modes separate)
  const mode = document.getElementById("soundMode")?.value
            || document.getElementById("soundMode-setup")?.value;
  if (mode !== "bip") return;

  const base = document.getElementById("beep-sound");
  if (!base || !base.src) return;

  // Stop any lingering playback on the base element
  try { base.pause(); base.currentTime = 0; } catch {}

  // Use a fresh element each time to avoid any residual quiet state
  const clone = new Audio(base.src);
  clone.preload = "auto";
  clone.playsInline = true;
  clone.setAttribute("playsinline", "");
  clone.setAttribute("webkit-playsinline", "");
  clone.volume = 1.0;
  clone.muted = false;
  // Important on some Android devices to avoid latency/ducking:
  clone.playbackRate = 1.0;

  // Fire and forget
  clone.play().catch(()=>{});
  // Cleanup when done
  clone.onended = () => { try { clone.src = ""; } catch {} };
  clone.onerror = () => { try { clone.src = ""; } catch {} };
}

function playTransition() {
  const transition = document.getElementById("transition-sound");
  if (transition) transition.play();
}

/* -------------------- Cloud TTS + Synth TTS -------------------- */
function detectLang(text) {
  const italianIndicators = /[àèéìòù]|mancano|secondi|esercizio|istruz|riposo|pausa/i;
  if (italianIndicators.test(text)) return "it-IT";
  return "en-US";
}

const GOOGLE_TTS_URL = "https://google-tts-server.onrender.com/speak";
const TTS_TIMEOUT_MS = 9000;
const TTS_RETRIES = 2;

async function ensureAudioUnlocked() {
  if (window.__audioUnlocked) return;
  let ctx;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { window.__audioUnlocked = true; return; }
    ctx = new AC();
    if (ctx.state === "suspended") await ctx.resume();
    const src = ctx.createBufferSource();
    src.buffer = ctx.createBuffer(1, 1, 22050);
    src.connect(ctx.destination);
    src.start(0);
    window.__audioUnlocked = true;
  } catch (e) {
    console.warn("Unable to unlock audio:", e);
  }
}

async function playAudioUrl(url) {
  let el = document.getElementById("tts-audio");
  if (!el) {
    el = new Audio();
    el.id = "tts-audio";
    el.preload = "auto";
    el.playsInline = true;
    el.setAttribute("playsinline", "");
    el.setAttribute("webkit-playsinline", "");
    el.autoplay = false;
    el.muted = false;
    el.crossOrigin = "anonymous";
    document.body.appendChild(el);
  }

  const isBlob = typeof url === "string" && url.startsWith("blob:");
  const src = isBlob ? url : url + (url.includes("?") ? "&" : "?") + "t=" + Date.now();

  el.pause();
  el.src = src;
  el.currentTime = 0;
  el.load();

  try { await (window.__audioCtx?.resume?.() || Promise.resolve()); } catch (_) {}

  // ===== AMPLIFICAZIONE VOLUME CON WEB AUDIO API =====
  // Crea AudioContext se non esiste
  if (!window.__audioCtx) {
    window.__audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  
  // Crea o riusa MediaElementSource e GainNode
  if (!window.__ttsSource) {
    window.__ttsSource = window.__audioCtx.createMediaElementSource(el);
    window.__ttsGainNode = window.__audioCtx.createGain();
    
    // IMPOSTA IL VOLUME AMPLIFICATO QUI
    // 1.0 = volume normale
    // 2.0 = volume raddoppiato
    // 3.0 = volume triplicato
    window.__ttsGainNode.gain.value = 2.5; // ← AUMENTA QUESTO VALORE PER PIÙ VOLUME
    
    // Connetti: Audio Element → GainNode → Speakers
    window.__ttsSource.connect(window.__ttsGainNode);
    window.__ttsGainNode.connect(window.__audioCtx.destination);
    
    console.log("🔊 Audio amplification enabled with gain:", window.__ttsGainNode.gain.value);
  }
  
  await new Promise((resolve, reject) => {
    const cleanup = () => {
      el.onended = null;
      el.onerror = null;
      if (isBlob) { try { URL.revokeObjectURL(url); } catch {} }
    };
    el.onended = () => { cleanup(); resolve(); };
    el.onerror = (e) => { cleanup(); reject(e); };
    const p = el.play();
    if (p && typeof p.then === "function") p.catch(reject);
  });
}

async function fetchTTS(text, lang) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TTS_TIMEOUT_MS);

  const res = await fetch(GOOGLE_TTS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, lang }),
    signal: controller.signal
  }).catch(e => { throw new Error("Failed to fetch TTS: " + e.message); });

  clearTimeout(timeoutId);

  if (!res.ok) throw new Error(`TTS ${res.status} ${res.statusText}`);

  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

async function tryGoogleTTS(text, lang) {
  let lastErr;
  for (let attempt = 0; attempt <= TTS_RETRIES; attempt++) {
    try {
      const audioUrl = await fetchTTS(text, lang);
      await playAudioUrl(audioUrl);
      return;
    } catch (e) {
      lastErr = e;
      await new Promise(r => setTimeout(r, 350 * (attempt + 1)));
    }
  }
  throw lastErr;
}

async function speakCloud(text, lang = "it-IT") {
  try {
    await ensureAudioUnlocked();
    
    // Check offline cache first
    if (typeof OfflinePreloader !== 'undefined') {
      const cacheKey = `tts_${lang}_${text}`;
      const cachedUrl = await OfflinePreloader.getCachedAudio(cacheKey);
      
      if (cachedUrl) {
        console.log(`✅ Using cached TTS: "${text.substring(0, 30)}..."`);
        await playAudioUrl(cachedUrl);
        return;
      }
    }
    
    // Optional explicit voice mapping
    const voice = lang === "it-IT" ? "it-IT-Wavenet-C" : "en-US-Wavenet-D";
    
    console.log(`🗣️ Attempting Google Cloud TTS: "${text}" (${lang})`);
    
    const res = await fetch("https://google-tts-server.onrender.com/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, lang, voice }),
    });
    
    if (!res.ok) {
      const errorText = await res.text().catch(() => "No error details");
      throw new Error(`TTS Server Error ${res.status}: ${errorText}`);
    }
    
    const blob = await res.blob();
    if (blob.size === 0) throw new Error("Audio vuoto - server returned empty audio");

    const audioUrl = URL.createObjectURL(blob);
    await playAudioUrl(audioUrl);
    
    console.log(`✅ Google Cloud TTS success`);
  } catch (err) {
    console.error("❌ Cloud TTS failed:", err.message || err);
    console.error("Full error:", err);
    throw err; // Re-throw so speak() can handle fallback
  }
}

async function webSpeechSpeak(text, lang) {
  // Make sure voices exist (Android may not fire onvoiceschanged)
  try {
    const t0 = Date.now();
    while (((speechSynthesis.getVoices?.()||[]).length === 0) && (Date.now() - t0 < 1500)) {
      await new Promise(r => setTimeout(r, 100));
    }
  } catch {}

  // Cancel pending + resume engine (Android often paused)
  try { speechSynthesis.cancel(); } catch {}
  try { speechSynthesis.resume(); } catch {}

  const voice = getPreferredVoice();
  const utter = new SpeechSynthesisUtterance(text);
  if (voice) utter.voice = voice;
  utter.lang   = (voice && voice.lang) || (lang || "it-IT");
  utter.rate   = 1.0;
  utter.pitch  = 1.0;
  utter.volume = currentVolume; // Use global volume setting

  // Tiny delay helps some Android builds
  await new Promise(r => setTimeout(r, 60));

  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (ok, err) => { if (done) return; done = true; ok ? resolve() : reject(err||new Error("speak failed")); };

    const watchdog = setTimeout(() => finish(true), 3000); // some Androids never fire events

    utter.onstart = () => { try { clearTimeout(watchdog); } catch {} };
    utter.onend   = () => { try { clearTimeout(watchdog); } catch {}; finish(true); };
    utter.onerror = (e)  => { try { clearTimeout(watchdog); } catch {};
                              if (e && e.error === "interrupted") return finish(true);
                              finish(false, e); };

    try {
      // resume again right before talking
      try { speechSynthesis.resume(); } catch {}
      speechSynthesis.speak(utter);
    } catch (err) {
      try { clearTimeout(watchdog); } catch {}
      finish(false, err);
    }
  });
}

async function speakSynth(text, lang = "it-IT") {
  return webSpeechSpeak(text, lang);
}

/* Router: With automatic fallback from voice to synth */
async function speak(text, lang = "it-IT") {
  const mode = document.getElementById("soundMode")?.value
            || document.getElementById("soundMode-setup")?.value
            || "none";
  
  // ElevenLabs HD mode (with Cloud TTS fallback)
  if (mode === "eleven") {
    return await speakEleven(text, lang);
  }
  
  if (mode === "voice") {
    try {
      return await speakCloud(text, lang);
    } catch (err) {
      console.warn("⚠️ Voice mode failed, falling back to synth...");
      console.error("Voice error details:", err);
      // Automatic fallback to synth
      try {
        return await speakSynth(text, lang);
      } catch (synthErr) {
        console.error("❌ Synth fallback also failed:", synthErr);
      }
    }
  }
  
  if (mode === "synth") return speakSynth(text, lang);
  // other modes: no-op
}

/* Helper sequences */
async function speakSequence(segments) {
  for (const segment of segments) {
    await speak(segment.text, segment.lang);
  }
}

async function announceNextExerciseWith(speakerFn, nextExercise) {
  await speakerFn("prossimo esercizio:", "it-IT");
  await speakerFn(nextExercise.name, detectLang(nextExercise.name));
}

/* Back-compat alias */
async function announceNextExercise(nextExercise) {
  return announceNextExerciseWith(speak, nextExercise);
}

/* -------------------- Workout Sequencing -------------------- */
let fullWorkoutSequence = [];

function buildFullWorkoutSequence(workout, includeWarmup = true) {
  const sequence = [];
  if (!workout || !Array.isArray(workout.exercises) || workout.exercises.length === 0) {
    console.error("❌ No valid workout data");
    return sequence;
  }

  const isBlockMarker = (ex) => {
    const nameLower = (ex.name || "").toLowerCase();
    const blockLower = (ex.block || "").toLowerCase();
    return nameLower.includes("blocco") || nameLower.includes("block") ||
           nameLower === blockLower || (ex.duration || 0) <= 5;
  };

  if (includeWarmup) {
    const uniqueExercises = [];
    const seenNames = new Set();

    workout.exercises.forEach(ex => {
      if (ex.block && !seenNames.has(ex.name) && !isBlockMarker(ex)) {
        seenNames.add(ex.name);
        uniqueExercises.push(ex);
      }
    });

    if (uniqueExercises.length > 0) {
      sequence.push({
        name: "Riscaldamento",
        duration: 5,
        imageUrl: "https://lh3.googleusercontent.com/d/1Ee4DY-EGnTI9YPrIB0wj6v8pX7KW8Hpt",
        isLabel: true
      });

      uniqueExercises.forEach(ex => {
        const warmupDuration = 25; // Always 25 seconds for warm-up exercises
        sequence.push({
          name: ex.name,
          duration: warmupDuration,
          imageUrl: ex.imageUrl,
          reps: ex.reps,
          block: ex.block,
          tipoDiPeso: ex.tipoDiPeso,
          audio: ex.audio,
          audioCambio: ex.audioCambio,
          isWarmup: true,
          blockNumber: null,
          totalBlocks: null,
          roundNumber: null,
          totalRounds: null,
          exerciseNumber: null,
          totalExercises: null
        });
      });

      sequence.push({
        name: "Are you ready?",
        duration: 15,
        imageUrl: "https://lh3.googleusercontent.com/d/1FS2HKfaJ6MIfpyzJirU6dWQ7K-5kbC9j",
        isLabel: true
      });
    }
  }

  const blockGroups = {};
  workout.exercises.forEach(ex => {
    if (ex.block && !isBlockMarker(ex)) {
      if (!blockGroups[ex.block]) blockGroups[ex.block] = [];
      blockGroups[ex.block].push(ex);
    }
  });

  const blockNames = Object.keys(blockGroups);
  const totalBlocks = blockNames.length;
  let blockNumber = 0;

  blockNames.forEach(blockName => {
    const exercises = blockGroups[blockName];
    if (exercises.length === 0) return;
    blockNumber++;
    const rounds = exercises[0]?.rounds || 1;

    for (let round = 0; round < rounds; round++) {
      let exerciseNumber = 0;
      exercises.forEach(ex => {
        exerciseNumber++;
        const exDuration = ex.duration || 30;
        sequence.push({
          name: ex.name,
          duration: exDuration,
          imageUrl: ex.imageUrl,
          reps: ex.reps,
          block: ex.block,
          tipoDiPeso: ex.tipoDiPeso,
          audio: ex.audio,
          audioCambio: ex.audioCambio,
          isWarmup: false,
          blockNumber: blockNumber,
          totalBlocks: totalBlocks,
          roundNumber: round + 1,
          totalRounds: rounds,
          exerciseNumber: exerciseNumber,
          totalExercises: exercises.length
        });
      });
    }

    // --- REST 60s tra blocchi ---
    if (blockNumber < totalBlocks) {
      sequence.push({
        name: "REST",
        duration: 60,
        imageUrl: convertGoogleDriveToDirect("https://lh3.googleusercontent.com/d/1bibXbdrcXdh3vgNHp2Teby3ClS3VqZmb"),
        isLabel: true
      });
    }
  });

  sequence.push({
    name: "Good Job",
    duration: 20,
    imageUrl: "https://lh3.googleusercontent.com/d/1Vs1-VgiJi8rTbssSj-2ThcyDraRoTE2g",
    isLabel: true
  });

  return sequence;
}

function updateProgressBar() {
  if (!fullWorkoutSequence || fullWorkoutSequence.length === 0) return;
  const currentExercise = fullWorkoutSequence[currentStep];
  if (!currentExercise) return;

  const totalSteps = fullWorkoutSequence.length;
  const progressPercent = Math.round(((currentStep + 1) / totalSteps) * 100);

  const progressFill = document.getElementById("progress-fill");
  const progressPercentage = document.getElementById("progress-percentage");
  if (progressFill) progressFill.style.width = progressPercent + "%";
  if (progressPercentage) progressPercentage.textContent = progressPercent + "%";

  const progressBlock = document.getElementById("progress-block");
  const progressRound = document.getElementById("progress-round");
  const progressExercise = document.getElementById("progress-exercise");

  if (currentExercise.isWarmup) {
    if (progressBlock) progressBlock.textContent = "Warm-up";
    if (progressRound) progressRound.textContent = "";
    if (progressExercise) progressExercise.textContent = "";
  } else if (currentExercise.isLabel) {
    if (progressBlock) progressBlock.textContent = currentExercise.name;
    if (progressRound) progressRound.textContent = "";
    if (progressExercise) progressExercise.textContent = "";
  } else {
    if (progressBlock && currentExercise.blockNumber) {
      progressBlock.textContent = `Block ${currentExercise.blockNumber}/${currentExercise.totalBlocks}`;
    }
    if (progressRound && currentExercise.roundNumber) {
      progressRound.textContent = `Round ${currentExercise.roundNumber}/${currentExercise.totalRounds}`;
    }
    if (progressExercise && currentExercise.exerciseNumber) {
      progressExercise.textContent = `Exercise ${currentExercise.exerciseNumber}/${currentExercise.totalExercises}`;
    }
  }
}

/* -------------------- Session Controls -------------------- */
function exitWorkout() {
  if (interval) { clearInterval(interval); interval = null; }
  isPaused = false;
  savedTimeLeft = null;
  currentStep = 0;

  // Release wake lock - allow screen to turn off
  releaseWakeLock();

  const settingsPopup = document.getElementById("settings-popup");
  if (settingsPopup) settingsPopup.style.display = "none";

  document.body.style.overflow = "";
  document.body.style.position = "";
  document.body.style.width = "";
  document.body.style.height = "";

  // Remove class to show header again
  document.body.classList.remove('workout-active');

  const header = document.querySelector("header");
  const setup = document.getElementById("setup-screen");
  const startBtn = document.getElementById("start-button-bottom");
  const exerciseContainer = document.getElementById("exercise-container");
  const topbarSelect = document.getElementById("topbar-select");
  const setupGear = document.getElementById("setup-settings-button");
  const bottomButtonsContainer = document.getElementById("bottom-buttons-container");

  if (exerciseContainer) exerciseContainer.style.display = "none";
  if (header) header.style.display = "";
  if (setup) setup.style.display = "";
  if (startBtn) startBtn.style.display = "";
  if (bottomButtonsContainer) bottomButtonsContainer.style.display = "";
  if (topbarSelect) topbarSelect.style.display = "block";
  if (setupGear) setupGear.style.display = "block";
}

function startWorkout() {
  if (!selectedWorkout || !Array.isArray(selectedWorkout.exercises) || selectedWorkout.exercises.length === 0) {
    alert("Nessun workout valido selezionato.");
    return;
  }

  const warmupEnabled = document.getElementById("warmup-toggle")?.checked ?? true;
  fullWorkoutSequence = buildFullWorkoutSequence(selectedWorkout, warmupEnabled);
  if (fullWorkoutSequence.length === 0) {
    alert("Impossibile costruire la sequenza di allenamento.");
    return;
  }

  const setup = document.getElementById("setup-screen");
  const header = document.querySelector("header");
  const startBtn = document.getElementById("start-button-bottom");
  const exerciseContainer = document.getElementById("exercise-container");
  const bottomButtonsContainer = document.getElementById("bottom-buttons-container");
  const topbarSelect = document.getElementById("topbar-select");
  const setupGear = document.getElementById("setup-settings-button");

  if (topbarSelect) topbarSelect.style.display = "none";
  if (setupGear) setupGear.style.display = "none";

  const previewMaybe = document.getElementById("workout-preview");
  if (previewMaybe) previewMaybe.style.display = "none";

  if (setup) setup.style.display = "none";
  if (header) header.style.display = "none";
  if (startBtn) startBtn.style.display = "none";
  if (bottomButtonsContainer) bottomButtonsContainer.style.display = "none";
  if (exerciseContainer) exerciseContainer.style.display = "flex";

  document.body.style.overflow = "hidden";
  document.body.style.position = "fixed";
  document.body.style.width = "100%";
  document.body.style.height = "100%";

  // Add class to hide header during workout
  document.body.classList.add('workout-active');

  // Keep screen on during workout
  requestWakeLock();

  let startIndex = 0;
  const phaseSelect = document.getElementById("start-phase-select");
  const roundSelect = document.getElementById("start-round-select");
  const exerciseSelect = document.getElementById("start-exercise-select");

  if (phaseSelect && phaseSelect.value !== "0") {
    if (exerciseSelect?.value && exerciseSelect.value !== "") {
      startIndex = parseInt(exerciseSelect.value);
    } else if (roundSelect?.value && roundSelect.value !== "") {
      startIndex = parseInt(roundSelect.value);
    } else {
      startIndex = parseInt(phaseSelect.value);
    }
  }

  currentStep = startIndex;
  savedTimeLeft = null;
  isWorkoutActive = true; // Mark workout as active
  workoutStartTime = Date.now(); // Record workout start time
  playExercise(currentStep, fullWorkoutSequence);

  const setupMode = document.getElementById("soundMode-setup");
  const liveMode = document.getElementById("soundMode");
  if (setupMode && liveMode) liveMode.value = setupMode.value;
}

async function playExercise(index, exercises, resumeTime = null) {
  // reset the 10s preview trigger for this exercise
  nextPreviewShown = false;

  if (index >= exercises.length) {
    console.log('🎉 Workout Complete! Redirecting to completion page...');
    console.log('Index:', index, 'Exercises length:', exercises.length);
    
    isWorkoutActive = false; // Mark workout as complete
    
    // Calculate workout duration
    const workoutDuration = Math.floor((Date.now() - workoutStartTime) / 1000);
    console.log('Workout duration:', workoutDuration, 'seconds');
    
    // Get the workout display name from the dropdown
    const workoutSelect = document.getElementById('workoutSelect');
    const workoutDisplayName = workoutSelect ? workoutSelect.options[workoutSelect.selectedIndex]?.textContent : 'Workout';
    
    // ═══════════════════════════════════════════════════════════════════════
    // SAVE LAST WORKOUT (NEW in v6.3.15)
    // Save the completed workout index so next time we auto-select the next one
    // ═══════════════════════════════════════════════════════════════════════
    console.log('📤 Saving last workout index:', currentWorkoutIndex, '(', workoutDisplayName, ')');
    
    // Save locally immediately
    setLastWorkoutIndexLocal(currentWorkoutIndex);
    
    // Save to sessionStorage for completion page to sync
    sessionStorage.setItem('completedWorkoutIndex', currentWorkoutIndex.toString());
    sessionStorage.setItem('totalUserWorkouts', totalUserWorkouts.toString());
    
    // Sync to cloud (non-blocking, will complete in background)
    syncLastWorkoutToCloud(currentWorkoutIndex, workoutDisplayName).then(success => {
      if (success) {
        console.log('✅ Last workout synced to cloud');
      } else {
        console.log('⚠️ Last workout sync to cloud failed (saved locally)');
      }
    }).catch(err => {
      console.warn('⚠️ Last workout cloud sync error:', err);
    });
    // ═══════════════════════════════════════════════════════════════════════
    
    // Save workout data to sessionStorage for completion page
    sessionStorage.setItem('completedWorkout', workoutDisplayName);
    sessionStorage.setItem('workoutDuration', workoutDuration);
    sessionStorage.setItem('exerciseCount', exercises.filter(e => !e.isLabel && !e.name.toLowerCase().includes('istruz')).length);
    
    // Save exercise list (only exercises with weights/equipment)
    const exercisesWithWeights = exercises.filter(e => 
      !e.isLabel && 
      !e.name.toLowerCase().includes('istruz') && 
      e.tipoDiPeso
    );
    sessionStorage.setItem('workoutExercises', JSON.stringify(exercisesWithWeights));
    
    // ═══════════════════════════════════════════════════════════════════════════
    // V7: SAVE PLAN PROGRESS IF COMING FROM PLAN-VIEW
    // ═══════════════════════════════════════════════════════════════════════════
    if (window.v7PlanInfo) {
      const planInfo = window.v7PlanInfo;
      console.log('📋 V7: Saving plan progress for:', planInfo.planName);
      
      // Save to localStorage
      const progressKey = `viltrum_plan_progress_${planInfo.planName}`;
      const progress = {
        lastWorkoutIndex: planInfo.workoutIndex,
        totalWorkouts: planInfo.totalWorkouts,
        lastUpdated: new Date().toISOString()
      };
      localStorage.setItem(progressKey, JSON.stringify(progress));
      
      // Store V7 info for completion page
      sessionStorage.setItem('v7PlanInfo', JSON.stringify(planInfo));
      
      // Sync to cloud (non-blocking)
      const email = localStorage.getItem('loggedUser');
      if (email) {
        import('./config.js').then(({ GOOGLE_SCRIPT_URL }) => {
          const url = `${GOOGLE_SCRIPT_URL}?action=saveLastWorkout&email=${encodeURIComponent(email)}&planName=${encodeURIComponent(planInfo.planName)}&lastWorkoutIndex=${planInfo.workoutIndex}&totalWorkouts=${planInfo.totalWorkouts}`;
          fetch(url).catch(e => console.warn('V7 cloud sync failed:', e));
        });
      }
      
      // Clear the currentWorkout so we don't reload it
      sessionStorage.removeItem('currentWorkout');
    }
    // ═══════════════════════════════════════════════════════════════════════════
    
    console.log('SessionStorage data saved, redirecting...');
    
    // Redirect to completion page
    window.location.href = './workout-completion.html';
    return;
  }

  const exercise = exercises[index];
  const nextExercise = exercises[index + 1];

  const hasReps = exercise.reps && !exercise.name.toLowerCase().includes("istruz");
  const hasEquipment = exercise.tipoDiPeso && !exercise.name.toLowerCase().includes("istruz") && !exercise.isLabel;

  let infoText = "";
  if (hasReps && hasEquipment) infoText = `${exercise.reps} reps | ${exercise.tipoDiPeso}`;
  else if (hasReps)           infoText = `${exercise.reps} reps`;
  else if (hasEquipment)      infoText = exercise.tipoDiPeso;

  const currentInfo = infoText
    ? `<div style="font-size:16px;font-weight:600;margin-top:8px;color:#B0B0B0;">${infoText}</div>`
    : "";

  // --- CURRENT EXERCISE DISPLAY ---
  const hasDuration = exercise.duration && !exercise.isLabel;

  const parts = [];
  if (hasEquipment) parts.push(exercise.tipoDiPeso);
  if (hasReps) parts.push(`${exercise.reps} REPS`);
  if (hasDuration) parts.push(`${exercise.duration}S`);

  // --- 10-SECOND PREVIEW DISPLAY ---
  const hasNextReps = nextExercise && nextExercise.reps && !nextExercise.name.toLowerCase().includes("istruz");
  const hasNextEquipment = nextExercise && nextExercise.tipoDiPeso && !nextExercise.name.toLowerCase().includes("istruz") && !nextExercise.isLabel;
  const hasNextDuration = nextExercise && nextExercise.duration && !nextExercise.isLabel;

  const partsNext = [];
  if (hasNextEquipment) partsNext.push(nextExercise.tipoDiPeso);
  if (hasNextReps) partsNext.push(`${nextExercise.reps} REPS`);
  if (hasNextDuration) partsNext.push(`${nextExercise.duration}S`);
  const infoNext = partsNext.join(" | ");

  // Check for last used weight for this exercise
  const lastUsedWeight = getExerciseWeight(exercise.name);
  const weightDisplay = lastUsedWeight ? `<div style="font-size:13px;font-weight:700;color:#6AB04C;margin-top:3px;">ULTIMO: ${lastUsedWeight}</div>` : '';

  document.getElementById("exercise-name").innerHTML = `
    <div style="font-size:22px;font-weight:800;letter-spacing:.5px;">${exercise.name}</div>
    <div style="font-size:15px;font-weight:600;color:#B0B0B0;margin-top:4px;">${infoText}</div>
    ${weightDisplay}
  `;

  // Load image from cache if available
  const exerciseImg = document.getElementById("exercise-gif");
  loadCachedImage(exerciseImg, exercise.imageUrl);
  
  const nextPrev = document.getElementById("next-exercise-preview");
  if (nextPrev) nextPrev.style.display = "none";

  const timerEl = document.getElementById("timer");
  const gifEl = document.getElementById("exercise-gif");
  const exerciseNameBar = document.getElementById("exercise-name");
  timerEl.classList.remove("warning-10", "warning-6", "warning-3");
  gifEl.classList.remove("gif-glow");
  exerciseNameBar.classList.remove("next-preview-active");

  const duration = resumeTime !== null ? resumeTime : savedTimeLeft ?? parseInt(exercise.duration);
  savedTimeLeft = null;

  timerEl.textContent = duration;
  updateProgressBar();

  const mode = document.getElementById("soundMode").value;

  // start the countdown immediately
  startExerciseTimer(duration, exercise, nextExercise);

  // say the exercise name without blocking the timer
  // Use speak() which has automatic fallback
  if (mode !== "none" && mode !== "bip") {
    const guard = new Promise(res => setTimeout(res, 2500));
    Promise.race([
      speak(exercise.name, detectLang(exercise.name)),
      guard
    ]).catch(err => {
      console.warn("⚠️ Failed to announce exercise name:", err);
    });
  }

}

function resumeTimer() {
  clearInterval(interval);

  // if we didn't capture on pause, read what's on screen
  if (savedTimeLeft == null || savedTimeLeft <= 0) {
    const onScreen = parseInt(document.getElementById("timer").textContent, 10);
    savedTimeLeft = Number.isFinite(onScreen) ? onScreen : 0;
  }

  const currentExercise = fullWorkoutSequence[currentStep];
  const nextExercise = fullWorkoutSequence[currentStep + 1];

  isPaused = false;
  startExerciseTimer(savedTimeLeft, currentExercise, nextExercise);
}

async function startExerciseTimer(initialSeconds, exercise, nextExercise) {
  clearInterval(interval);

  const timerEl = document.getElementById("timer");
  const gifEl = document.getElementById("exercise-gif");
  const exerciseNameBar = document.getElementById("exercise-name");

  // show immediately
  timerEl.textContent = Math.max(0, Math.ceil(initialSeconds));

  // set an absolute end time to avoid drift & off-by-one
  currentTimerEndTime = Date.now() + (initialSeconds * 1000);

  // helper so pause stores the same value we display
  const getRemaining = () => Math.max(0, Math.ceil((currentTimerEndTime - Date.now()) / 1000));
  let lastSecond = -1; // 🔒 run second-based actions once per displayed second

  // 🔒 dedupe: ricorda i secondi già gestiti in QUESTO esercizio
  const fired = new Set();

  interval = setInterval(async () => {
    // Esegui una sola volta quando il timer mostra esattamente "sec"
    function once(sec, cb) {
      if (remaining === sec && !fired.has(sec)) {
        fired.add(sec);
        try { cb(); } catch (e) { console.warn('once('+sec+') error:', e); }
      }
    }

    // paused? save & stop the ticking loop
    if (isPaused) {
      savedTimeLeft = getRemaining();
      clearInterval(interval);
      return;
    }

    const remaining = getRemaining();
    timerEl.textContent = remaining;

    // read mode (kept separate)
    const mode = document.getElementById("soundMode").value;
    const useBip = mode === "bip";

    // milestones & UI cues — run once per displayed second
    if (remaining !== lastSecond) {
      lastSecond = remaining;

      once(60, () => {
        if (mode === "voice" || mode === "synth") {
          speak("mancano sessanta secondi", "it-IT").catch(() => {});
        }
        if (mode === "beppe") playBeppeAudio(beppeSounds.s60);
      });

      once(30, () => {
        if (mode === "voice" || mode === "synth") {
          speak("mancano trenta secondi", "it-IT").catch(() => {});
        }
        if (mode === "beppe") playBeppeAudio(beppeSounds.s30);
      });

      // 10s preview (fire once per exercise)
      once(10, async () => {
        if (!nextPreviewShown) {
          nextPreviewShown = true;

        timerEl.classList.add("warning-10");
        gifEl.classList.add("gif-glow");
        exerciseNameBar.classList.add("next-preview-active");

        if (nextExercise) {
          const nxHasReps = nextExercise.reps && !nextExercise.name.toLowerCase().includes("istruz");
          const nxHasEqp  = nextExercise.tipoDiPeso && !nextExercise.name.toLowerCase().includes("istruz") && !nextExercise.isLabel;
          const nxHasDur  = nextExercise.duration && !nextExercise.isLabel;

          const nxParts = [];
          if (nxHasEqp) nxParts.push(nextExercise.tipoDiPeso);
          if (nxHasReps) nxParts.push(`${nextExercise.reps} REPS`);
          if (nxHasDur) nxParts.push(`${nextExercise.duration}S`);
          const nxInfo = nxParts.join(" | ");

          // swap preview UI
          document.getElementById("exercise-name").innerHTML = `
            <div style="font-size:14px;opacity:.8;margin-bottom:4px;">PROSSIMO ESERCIZIO:</div>
            <div style="font-size:22px;font-weight:800;letter-spacing:.5px;">${nextExercise.name}</div>
            <div style="font-size:15px;font-weight:600;margin-top:4px;">${nxInfo}</div>
          `;
          // Load next exercise image from cache if available
          const nextExerciseImg = document.getElementById("exercise-gif");
          loadCachedImage(nextExerciseImg, nextExercise.imageUrl);

          // preview voice strictly per mode
          if (mode === "beppe") {
            const urls = [beppeSounds.prossimo];
            if (nextExercise.audio) urls.push(nextExercise.audio);
            playBeppeAudioSequence(urls);
          } else if (mode === "voice" || mode === "synth") {
            // Use speak() with automatic fallback
            try {
              await speak("prossimo esercizio:", "it-IT");
              await speak(nextExercise.name, detectLang(nextExercise.name));
            } catch (err) {
              console.warn("⚠️ Failed to announce next exercise:", err);
            }
          }
        }

        if (useBip) playBeep();
        }
      });

      // color changes
      once(6, () => {
        timerEl.classList.remove("warning-10");
        timerEl.classList.add("warning-6");
      });

      once(3, () => {
        timerEl.classList.remove("warning-6");
        timerEl.classList.add("warning-3");
      });

      // 5s countdown — runs once (no more stutter)
      once(5, () => {
        if (mode === "voice" || mode === "synth") {
          speak("cinque, quattro, tre, due, uno", "it-IT").catch(() => {});
        }
        if (mode === "beppe") playBeppeAudio(beppeSounds.countdown5);
      });
    }

    // done → next
    if (remaining <= 0) {
      clearInterval(interval);

      // cleanup visuals
      timerEl.classList.remove("warning-10", "warning-6", "warning-3");
      gifEl.classList.remove("gif-glow");
      exerciseNameBar.classList.remove("next-preview-active");

      currentStep++;
      const upcoming = fullWorkoutSequence[currentStep];

      // change cue
      if (mode === "beppe") {
        const seq = [];
        if (upcoming?.audioCambio) seq.push(upcoming.audioCambio);
        if (seq.length) playBeppeAudioSequence(seq);
      }
      if (useBip) playTransition();

      document.getElementById("next-exercise-preview").style.display = "none";
      savedTimeLeft = null;

      setTimeout(() => playExercise(currentStep, fullWorkoutSequence), 300);
    }
  }, 200); // 5× per second → smooth and exact
}

/* -------------------- UI / App Wiring -------------------- */
function login() {
  warmUpServer();
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();
  const errorBox = document.getElementById("login-error");

  if (!username || !password) {
    if (errorBox) {
      errorBox.textContent = "Inserisci username e password.";
      errorBox.style.display = "block";
    }
    return;
  }

  fetch(`${GOOGLE_SCRIPT_URL}?username=${username}&password=${password}`)
    .then(res => res.json())
    .then(data => {
      if (data.status === "success") {
        localStorage.setItem("loggedUser", username);
        
        // Hide login UI (works for both index.html and other pages)
        const loginScreen = document.getElementById("login-screen");
        const loginModal = document.getElementById("login-modal");
        const mainApp = document.getElementById("main-app");
        const trainingSelector = document.getElementById("training-selector");
        const headerLoginBtn = document.getElementById("header-login-btn");
        const headerDashboardBtn = document.getElementById("header-dashboard-btn");
        
        if (loginScreen) loginScreen.style.display = "none";
        if (loginModal) loginModal.classList.remove("active");
        if (mainApp) mainApp.style.display = "block";
        if (trainingSelector) trainingSelector.style.display = "block";
        
        // Switch header buttons: hide login, show dashboard
        if (headerLoginBtn) headerLoginBtn.style.display = "none";
        if (headerDashboardBtn) headerDashboardBtn.style.display = "flex";
        
        loadUserData(username);
      } else {
        if (errorBox) {
          errorBox.textContent = data.message;
          errorBox.style.display = "block";
        }
      }
    })
    .catch(err => {
      console.error("Login error", err);
      if (errorBox) {
        errorBox.textContent = "Errore durante il login.";
        errorBox.style.display = "block";
      }
    });
}

function logout() {
  localStorage.removeItem("loggedUser");
  // Use setTimeout to ensure localStorage is cleared before redirect
  setTimeout(() => {
    window.location.href = "index.html";
  }, 100);
}

function loadUserData(username) {
  // ═══════════════════════════════════════════════════════════════════════════
  // V7: CHECK IF COMING FROM PLAN-VIEW WITH SPECIFIC WORKOUT
  // ═══════════════════════════════════════════════════════════════════════════
  const planWorkout = sessionStorage.getItem('currentWorkout');
  if (planWorkout) {
    try {
      const workoutInfo = JSON.parse(planWorkout);
      console.log('🎯 V7: Loading specific workout from plan-view:', workoutInfo);
      
      // Store plan info for completion
      window.v7PlanInfo = workoutInfo;
      
      // Load workout directly without dropdown
      loadWorkoutFromPlan(username, workoutInfo);
      return;
    } catch (e) {
      console.warn('Failed to parse plan workout info:', e);
      // Continue with normal flow
    }
  }
  // ═══════════════════════════════════════════════════════════════════════════
  
  // ⚡ INSTANT: Use cached data from localStorage (set by dashboard)
  const cachedData = localStorage.getItem('workoutData');
  
  if (cachedData) {
    try {
      const data = JSON.parse(cachedData);
      console.log('⚡ Using cached workout data (instant load)');
      populateWorkoutSelector(username, data);
      return;
    } catch (e) {
      console.warn("Failed to parse cached data:", e);
    }
  }
  
  // 🚀 V7: Check sessionStorage (set by DataPreloader at login)
  const sessionData = sessionStorage.getItem('viltrum_session_data');
  if (sessionData) {
    try {
      const data = JSON.parse(sessionData);
      console.log('⚡ Using session cache from DataPreloader (instant load)');
      populateWorkoutSelector(username, data);
      return;
    } catch (e) {
      console.warn("Failed to parse session data:", e);
    }
  }
  
  // Only fetch if NO cache exists at all
  console.log('🔄 No cache found, fetching from server...');
  fetch(GOOGLE_SCRIPT_URL)
    .then(res => {
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      return res.json();
    })
    .then(data => {
      // Save to localStorage
      try {
        const dataStr = JSON.stringify(data);
        localStorage.setItem('workoutData', dataStr);
        localStorage.setItem('workoutDataTimestamp', Date.now().toString());
        sessionStorage.setItem('viltrum_session_data', dataStr);
        console.log('✅ Workout data cached');
      } catch (e) {
        console.warn("Failed to cache workout data:", e);
      }
      
      populateWorkoutSelector(username, data);
    })
    .catch(error => {
      console.error("❌ Error loading user data:", error);
      alert(`Failed to load workout data: ${error.message}\n\nPlease check your internet connection and try refreshing the page.`);
    });
}

function populateWorkoutSelector(username, data) {
  workouts = data.workouts;
  
  // ✅ UPDATED: Handle new userWorkouts structure with scadenza and workouts array
  const userData = data.userWorkouts[username] || { scadenza: "", workouts: [] };
  const userWorkouts = userData.workouts || [];
  const scadenza = userData.scadenza || "";
  
  // Store total workouts count for progress tracking
  totalUserWorkouts = userWorkouts.length;
  
  // ⚠️ SUBSCRIPTION VALIDATION - Block expired users
  if (scadenza) {
    const expiryDate = new Date(scadenza);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    expiryDate.setHours(0, 0, 0, 0);
    
    if (expiryDate < today) {
      alert('⚠️ Il tuo abbonamento è scaduto il ' + expiryDate.toLocaleDateString('it-IT') + '.\n\nRinnova per continuare ad allenarti!');
      window.location.href = 'dashboard-v7.html';
      return;
    }
  }
  
  const select = document.getElementById("workoutSelect");
  if (!select) {
    console.error("❌ workoutSelect element not found!");
    return;
  }
  
  select.innerHTML = "";

  userWorkouts.forEach((name, i) => {
    const option = document.createElement("option");
    option.value = name;                  // keep internal key (A1, A2, …)
    option.dataset.realName = name;       // keep original if you ever need it
    option.dataset.index = i;             // store the index for tracking
    option.textContent = `Sesh ${i + 1}`;  // what the user sees (sesh1, sesh2, …)
    select.appendChild(option);
  });

  if (select.options.length > 0) {
    // ═══════════════════════════════════════════════════════════════════════
    // AUTO-SELECT NEXT WORKOUT - Uses localStorage only (instant)
    // ═══════════════════════════════════════════════════════════════════════
    
    // Get local last workout index immediately (no async, no cloud calls)
    let nextWorkoutIndex = 0;
    const localLastIndex = localStorage.getItem('viltrum_last_workout_index');
    if (localLastIndex !== null) {
      const lastIndex = parseInt(localLastIndex);
      nextWorkoutIndex = lastIndex + 1;
      console.log('📊 Last completed: Sesh', lastIndex + 1, '→ selecting: Sesh', nextWorkoutIndex + 1);
    } else {
      console.log('📊 No previous workout found → starting with Sesh 1');
    }
    
    // Wrap to beginning if we've completed all workouts
    if (nextWorkoutIndex >= userWorkouts.length) {
      console.log('🔄 Completed all workouts! Wrapping back to Sesh 1');
      nextWorkoutIndex = 0;
    }
    
    // Set selection immediately
    select.selectedIndex = nextWorkoutIndex;
    currentWorkoutIndex = nextWorkoutIndex;
    selectedWorkout = workouts[select.value];
    
    console.log(`✅ Selected: Sesh ${nextWorkoutIndex + 1}`);
    // ═══════════════════════════════════════════════════════════════════════
    
    const __topStart2 = document.getElementById("start-button"); 
    if (__topStart2) __topStart2.disabled = false;
    const __bottomStart2 = document.getElementById("start-button-bottom"); 
    if (__bottomStart2) __bottomStart2.disabled = false;
    
    // ═══════════════════════════════════════════════════════════════════════
    // LOAD WEIGHTS FROM localStorage (instant, no cloud calls)
    // ═══════════════════════════════════════════════════════════════════════
    console.log('🏋️ Loading weights from cache...');
    updateWorkoutPreview();
  } else {
    console.warn("⚠️ No workouts found for user");
  }

  // Remove any existing listener before adding new one
  const savedSelectedIndex = select.selectedIndex; // Save before clone!
  const newSelect = select.cloneNode(true);
  select.parentNode.replaceChild(newSelect, select);
  
  // Restore selectedIndex (cloneNode doesn't preserve it!)
  newSelect.selectedIndex = savedSelectedIndex;
  console.log('🔄 Restored dropdown selection to index:', savedSelectedIndex, '(Sesh', savedSelectedIndex + 1, ')');
  
  newSelect.addEventListener("change", () => {
    selectedWorkout = workouts[newSelect.value] || {};
    // Update currentWorkoutIndex when user manually changes selection
    currentWorkoutIndex = newSelect.selectedIndex;
    console.log('👆 User selected workout index:', currentWorkoutIndex, '(Sesh', currentWorkoutIndex + 1, ')');
    updateWorkoutPreview();
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// V7.1: LOAD WORKOUT FROM PLAN (called when coming from plan-view)
// Uses DataPreloader instead of session storage
// ═══════════════════════════════════════════════════════════════════════════
async function loadWorkoutFromPlan(username, workoutInfo) {
  console.log('🎯 V7.1: Loading workout from plan:', workoutInfo.workoutName);
  
  try {
    // V7.1: Get workout data from DataPreloader
    const email = localStorage.getItem('loggedUser');
    if (!email) {
      throw new Error('No logged user');
    }
    
    // Ensure data is loaded
    await DataPreloader.loadAll(email);
    
    // Get the workout from cache
    const workoutName = workoutInfo.workoutName;
    let workoutData = null;
    
    if (workoutInfo.workoutType === 'muscle') {
      workoutData = DataPreloader.getMuscleWorkout(workoutName);
    } else if (workoutInfo.workoutType === 'run') {
      workoutData = DataPreloader.getRunWorkout(workoutName);
    }
    
    // Fallback: try both
    if (!workoutData) {
      workoutData = DataPreloader.getMuscleWorkout(workoutName) || DataPreloader.getRunWorkout(workoutName);
    }
    
    if (!workoutData) {
      console.error('❌ Workout not found in DataPreloader:', workoutName);
      
      // Last resort: try session storage (backward compatibility)
      const sessionData = sessionStorage.getItem('viltrum_session_data');
      if (sessionData) {
        const data = JSON.parse(sessionData);
        workoutData = data.workouts?.[workoutName];
      }
    }
    
    if (!workoutData) {
      throw new Error(`Workout "${workoutName}" not found`);
    }
    
    // Set workout data
    workouts = { [workoutName]: workoutData };
    selectedWorkout = workoutData;
    
    // Set global state
    currentWorkoutIndex = workoutInfo.workoutIndex;
    totalUserWorkouts = workoutInfo.totalWorkouts;
    
    // Hide dropdown (not needed when coming from plan-view)
    const topbarSelect = document.getElementById('topbar-select');
    if (topbarSelect) {
      topbarSelect.style.display = 'none';
    }
    
    // Add a back button to plan-view (V7.1 - usa struttura unificata)
    const headerLeft = document.getElementById('header-left');
    if (headerLeft && !document.getElementById('back-to-plan-btn')) {
      const backBtn = document.createElement('a');
      backBtn.id = 'back-to-plan-btn';
      backBtn.href = 'plan-view.html';
      backBtn.className = 'header-back-btn';
      backBtn.innerHTML = '← PIANO';
      backBtn.onclick = (e) => {
        e.preventDefault();
        sessionStorage.removeItem('currentWorkout');
        window.location.href = 'plan-view.html';
      };
      headerLeft.appendChild(backBtn);
    }
    
    console.log('✅ V7.1: Workout loaded from DataPreloader:', workoutName);
    console.log('   Plan:', workoutInfo.planName);
    console.log('   Index:', workoutInfo.workoutIndex + 1, '/', workoutInfo.totalWorkouts);
    
    // Update preview
    updateWorkoutPreview();
    
    // Enable start buttons
    const startBtn = document.getElementById("start-button");
    const startBtnBottom = document.getElementById("start-button-bottom");
    if (startBtn) startBtn.disabled = false;
    if (startBtnBottom) startBtnBottom.disabled = false;
    
  } catch (error) {
    console.error('❌ Failed to load workout:', error);
    alert('Errore: dati non trovati. Torna alla dashboard.');
    window.location.href = 'dashboard-v7.html';
  }
}

function updateWorkoutPreview() {
  const preview = document.getElementById("workout-preview");
  const previewTitle = document.getElementById("workout-preview-title");
  const list = document.getElementById("exercise-list");
  const visuals = document.getElementById("exercise-visuals");
  const instructionsSection = document.getElementById("instructions-section");
  const instructionsText = document.getElementById("instructions-text");
  const instructionsImage = document.getElementById("instructions-image");
  const materialeSection = document.getElementById("materiale-section");
  const materialeList = document.getElementById("materiale-list");

  if (list) list.innerHTML = "";
  const __grid = document.getElementById("exercise-grid"); if (__grid) __grid.innerHTML = "";
  if (materialeList) materialeList.innerHTML = "";

  const workout = selectedWorkout;
  if (!workout || !workout.exercises?.length) {
    if (preview) preview.style.display = "none";
    if (previewTitle) previewTitle.style.display = "none";
    if (visuals) visuals.style.display = "none";
    if (instructionsSection) instructionsSection.style.display = "none";
    if (materialeSection) materialeSection.style.display = "none";
    return;
  }

  if (instructionsSection) instructionsSection.style.display = "block";
  
  // Default image if instructions are empty
  const defaultInstructionsImage = "https://lh3.googleusercontent.com/d/1z6cFnovuxN6SL5DWYaa8RdE3TA4dd0R6";

  // Helper function to detect if string is a URL
  function isImageUrl(str) {
    if (!str) return false;
    const trimmed = str.trim();
    // Check if it starts with http:// or https://
    return trimmed.startsWith('http://') || trimmed.startsWith('https://');
  }

  // Helper function to convert Google Drive sharing links to direct image links
  // Uses lh3.googleusercontent.com format to avoid CORS issues
  function convertGoogleDriveUrl(url) {
    // Handle Google Drive sharing URLs: https://drive.google.com/file/d/FILE_ID/view?usp=sharing
    const driveMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (driveMatch && driveMatch[1]) {
      return `https://lh3.googleusercontent.com/d/${driveMatch[1]}`;
    }
    // If already a direct link or different format, return as-is
    return url;
  }

  // Process instructions: can be text, image URL, or empty
  if (workout.instructions && workout.instructions.trim()) {
    const instructions = workout.instructions.trim();
    
    if (isImageUrl(instructions)) {
      // It's an image URL - display as image
      const imageUrl = convertGoogleDriveUrl(instructions);
      if (instructionsImage) {
        // Load from cache if available
        loadCachedImage(instructionsImage, imageUrl);
        instructionsImage.style.display = "block";
      }
      if (instructionsText) instructionsText.style.display = "none";
    } else {
      // It's text - display as text
      if (instructionsText) {
        instructionsText.textContent = instructions;
        instructionsText.style.display = "block";
      }
      if (instructionsImage) instructionsImage.style.display = "none";
    }
  } else {
    // Empty - use default image
    if (instructionsImage) {
      instructionsImage.src = defaultInstructionsImage;
      instructionsImage.style.display = "block";
    }
    if (instructionsText) instructionsText.style.display = "none";
  }

  // === HANDLE MATERIALE (Consolidated equipment: prefer 2 DB/KB over 1) ===
  function consolidateMateriale(exercises) {
    const bestByKey = new Map(); // key = `${GEAR}|${LEVEL}`
    const otherSet = new Set();  // non-DB/KB strings kept unique

    const normSpaces = s => (s || "").toUpperCase().replace(/\s+/g, " ").trim();
    const normalizeLevel = (raw) => {
      let t = normSpaces(raw);
      // unify singular→plural
      t = t
        .replace(/\bMEDIO\b/g, "MEDI")
        .replace(/\bMEDIA\b/g, "MEDI")
        .replace(/\bLEGGERO\b/g, "LEGGERI")
        .replace(/\bLEGGERA\b/g, "LEGGERI")
        .replace(/\bPESANTE\b/g, "PESANTI");
      return t;
    };

    for (const ex of (exercises || [])) {
      const tp = (ex.tipoDiPeso || "").trim();
      if (!tp) continue;

      // match "1 DB MEDIO", "2 KB PESANTI", etc.
      const m = tp.match(/^\s*(\d+)\s*(DB|KB)\b\s*(.*)$/i);
      if (m) {
        const count = parseInt(m[1], 10) || 0;
        const gear  = m[2].toUpperCase();         // DB or KB
        const level = normalizeLevel(m[3] || ""); // MEDI, PESANTI, LEGGERI, etc.
        const key = `${gear}|${level}`;
        const prev = bestByKey.get(key);
        if (!prev || count > prev.count) bestByKey.set(key, { count, gear, level });
      } else {
        // non-DB/KB items: keep unique as-is (uppercased for dedupe)
        otherSet.add(normSpaces(tp));
      }
    }

    const consolidated = [];
    for (const { count, gear, level } of bestByKey.values()) {
      consolidated.push(`${count} ${gear} ${level}`);
    }
    for (const item of otherSet) consolidated.push(item);
    return consolidated;
  }

  const materiale = consolidateMateriale(workout.exercises);

  if (materiale.length > 0) {
    if (materialeSection) materialeSection.style.display = "block";
    materiale.forEach(item => {
      const materialeItem = document.createElement("div");
      materialeItem.className = "materiale-item";
      materialeItem.textContent = item;
      materialeList.appendChild(materialeItem);
    });
  } else {
    if (materialeSection) materialeSection.style.display = "none";
  }

  const sections = { blocco1: [], blocco2: [], blocco3: [] };
  workout.exercises.forEach(ex => {
    if (ex.block) {
      const blockLower = ex.block.toLowerCase();
      if (blockLower.includes('block 1') || blockLower.includes('blocco 1')) sections.blocco1.push(ex);
      else if (blockLower.includes('block 2') || blockLower.includes('blocco 2')) sections.blocco2.push(ex);
      else if (blockLower.includes('block 3') || blockLower.includes('blocco 3')) sections.blocco3.push(ex);
    }
  });

  const grid = document.getElementById("exercise-grid");
  const sectionConfigs = [
    { key: 'blocco1', title: 'BLOCCO 1', color: '#7D7D7D', icon: '' },
    { key: 'blocco2', title: 'BLOCCO 2', color: '#7D7D7D', icon: '' },
    { key: 'blocco3', title: 'BLOCCO 3', color: '#7D7D7D', icon: '' }
  ];

  sectionConfigs.forEach(config => {
    const exercises = sections[config.key];
    if (exercises.length === 0) return;

    const uniqueExercises = [];
    const seen = new Set();
    exercises.forEach(ex => {
      if (!seen.has(ex.name)) { seen.add(ex.name); uniqueExercises.push(ex); }
    });

    const rounds = exercises[0]?.rounds || 0;

    const section = document.createElement('div');
    section.className = 'workout-section';

    const header = document.createElement('div');
    header.className = 'section-header';
    header.style.background = `linear-gradient(135deg, ${config.color}, ${config.color}dd)`;
    header.innerHTML = `
      <span class="section-icon">${config.icon}</span>
      <span class="section-title">${config.title}</span>
      <span class="section-count">${uniqueExercises.length} es. | ${rounds} round</span>
    `;
    section.appendChild(header);

    const cardsGrid = document.createElement('div');
    cardsGrid.className = 'section-cards-grid';

    uniqueExercises.forEach(ex => {
      const card = document.createElement("div");
      card.className = "exercise-card";

      const img = document.createElement("img");
      // Load from cache if available
      loadCachedImage(img, ex.imageUrl);
      img.alt = ex.name;

      const name = document.createElement("div");
      name.textContent = ex.name;
      name.className = "exercise-name";

      const details = document.createElement("div");
      details.className = "exercise-details";

      // DURATION (if exists)
      if (ex.duration || ex.reps) {
        const durationDiv = document.createElement("div");
        durationDiv.className = "exercise-info-item";
        const timeValue = ex.reps || (ex.duration ? `${ex.duration}s` : '');
        durationDiv.textContent = timeValue;
        details.appendChild(durationDiv);
      }

      // WEIGHT/EQUIPMENT (if exists)
      if (ex.tipoDiPeso) {
        const equipmentDiv = document.createElement("div");
        equipmentDiv.className = "exercise-info-item";
        equipmentDiv.textContent = ex.tipoDiPeso;
        details.appendChild(equipmentDiv);
      }

      // LAST WEIGHT USED (if exists in history)
      const lastWeight = getExerciseWeight(ex.name);
      if (lastWeight) {
        const weightDiv = document.createElement("div");
        weightDiv.className = "exercise-info-item exercise-last-weight";
        weightDiv.textContent = `Last: ${lastWeight}`;
        details.appendChild(weightDiv);
      }

      card.appendChild(img);
      card.appendChild(name);
      card.appendChild(details);
      cardsGrid.appendChild(card);
    });

    section.appendChild(cardsGrid);
    if (grid) grid.appendChild(section);
  });

  if (preview) preview.style.display = "block";
  if (previewTitle) previewTitle.style.display = "block";
  if (visuals) visuals.style.display = "block";

  buildStartPointSelector();
}

function buildStartPointSelector() {
  const selector = document.getElementById("start-point-selector");
  const phaseSelect = document.getElementById("start-phase-select");
  const roundContainer = document.getElementById("start-round-container");
  const roundSelect = document.getElementById("start-round-select");
  const exerciseContainer = document.getElementById("start-exercise-container");
  const exerciseSelect = document.getElementById("start-exercise-select");

  if (!selector || !phaseSelect || !selectedWorkout) return;
  selector.style.display = "block";

  const warmupEnabled = document.getElementById("warmup-toggle")?.checked ?? true;
  const tempSequence = buildFullWorkoutSequence(selectedWorkout, warmupEnabled);
  if (tempSequence.length === 0) return;

  phaseSelect.innerHTML = '<option value="0">Inizio workout (con riscaldamento)</option>';
  roundSelect.innerHTML = '';
  exerciseSelect.innerHTML = '';

  const mainWorkoutExercises = tempSequence.filter(ex =>
    !ex.isWarmup && ex.block && !ex.isLabel
  );
  if (mainWorkoutExercises.length === 0) return;

  const blocks = [];
  let currentBlock = null;
  let blockStartIndex = -1;
  const exerciseSeenInCurrentBlock = new Map();

  mainWorkoutExercises.forEach((ex, relativeIndex) => {
    const originalIndex = tempSequence.indexOf(ex);

    if (ex.block !== currentBlock) {
      currentBlock = ex.block;
      blockStartIndex = relativeIndex;
      exerciseSeenInCurrentBlock.clear();

      blocks.push({
        name: ex.block,
        index: originalIndex,
        startRelativeIndex: relativeIndex,
        rounds: [],
        uniqueExercises: []
      });
    }

    const block = blocks[blocks.length - 1];
    if (!block.uniqueExercises.includes(ex.name)) {
      block.uniqueExercises.push(ex.name);
    }

    const firstOccurrenceIndex = exerciseSeenInCurrentBlock.get(ex.name);
    if (firstOccurrenceIndex === undefined) {
      exerciseSeenInCurrentBlock.set(ex.name, relativeIndex);
      let round = block.rounds.find(r => r.number === 1);
      if (!round) {
        round = { number: 1, firstExerciseIndex: originalIndex, exercises: [] };
        block.rounds.push(round);
      }
      round.exercises.push({ name: ex.name, index: originalIndex });
    } else {
      const positionInBlock = relativeIndex - blockStartIndex;
      const uniqueCount = block.uniqueExercises.length;
      const roundNumber = Math.floor(positionInBlock / uniqueCount) + 1;

      let round = block.rounds.find(r => r.number === roundNumber);
      if (!round) {
        round = { number: roundNumber, firstExerciseIndex: originalIndex, exercises: [] };
        block.rounds.push(round);
      }
      round.exercises.push({ name: ex.name, index: originalIndex });
    }
  });

  blocks.forEach((block, idx) => {
    const option = document.createElement('option');
    option.value = block.index;              // keep internal A1, A2, etc.
    option.dataset.realName = block.name;    // store the original
    option.textContent = `Blocco ${idx + 1}`;   // display block number
    phaseSelect.appendChild(option);
  });

  const newPhaseSelect = phaseSelect.cloneNode(true);
  phaseSelect.parentNode.replaceChild(newPhaseSelect, phaseSelect);
  const newRoundSelect = roundSelect.cloneNode(true);
  roundSelect.parentNode.replaceChild(newRoundSelect, roundSelect);

  const phaseSelectFinal = document.getElementById("start-phase-select");
  const roundSelectFinal = document.getElementById("start-round-select");
  const exerciseSelectFinal = document.getElementById("start-exercise-select");

  phaseSelectFinal.addEventListener('change', function() {
    const selectedIndex = parseInt(this.value);
    if (selectedIndex === 0 || isNaN(selectedIndex)) {
      if (roundContainer) roundContainer.style.display = 'none';
      if (exerciseContainer) exerciseContainer.style.display = 'none';
      return;
    }
    const block = blocks.find(b => b.index === selectedIndex);
    if (!block || block.rounds.length === 0) {
      if (roundContainer) roundContainer.style.display = 'none';
      if (exerciseContainer) exerciseContainer.style.display = 'none';
      return;
    }

    if (roundContainer) roundContainer.style.display = 'block';
    if (exerciseContainer) exerciseContainer.style.display = 'none';
    roundSelectFinal.innerHTML = '<option value="">Inizio blocco (Round 1)</option>';

    block.rounds.forEach((round) => {
      const option = document.createElement('option');
      option.value = round.firstExerciseIndex;
      option.textContent = `Round ${round.number}`;
      option.dataset.roundNumber = round.number;
      roundSelectFinal.appendChild(option);
    });
  });

  roundSelectFinal.addEventListener('change', function() {
    const selectedBlockIndex = parseInt(phaseSelectFinal.value);
    const selectedRoundFirstIndex = parseInt(this.value);

    if (isNaN(selectedBlockIndex) || selectedBlockIndex === 0) {
      if (exerciseContainer) exerciseContainer.style.display = 'none';
      return;
    }
    const block = blocks.find(b => b.index === selectedBlockIndex);
    if (!block) {
      if (exerciseContainer) exerciseContainer.style.display = 'none';
      return;
    }
    if (isNaN(selectedRoundFirstIndex) || this.value === "") {
      if (exerciseContainer) exerciseContainer.style.display = 'none';
      return;
    }
    const round = block.rounds.find(r => r.firstExerciseIndex === selectedRoundFirstIndex);
    if (!round || round.exercises.length === 0) {
      if (exerciseContainer) exerciseContainer.style.display = 'none';
      return;
    }

    if (exerciseContainer) exerciseContainer.style.display = 'block';
    exerciseSelectFinal.innerHTML = '<option value="">Inizio round</option>';
    round.exercises.forEach((ex, idx) => {
      const option = document.createElement('option');
      option.value = ex.index;
      option.textContent = `${idx + 1}. ${ex.name}`;
      exerciseSelectFinal.appendChild(option);
    });
  });

  const resetBtn = document.getElementById('reset-start-point');
  if (resetBtn) {
    resetBtn.addEventListener('click', function() {
      phaseSelectFinal.value = '0';
      if (roundContainer) roundContainer.style.display = 'none';
      if (exerciseContainer) exerciseContainer.style.display = 'none';
      localStorage.removeItem('workoutStartIndex');
    });
  }
}

/* -------------------- DOM Ready -------------------- */
document.addEventListener("DOMContentLoaded", async () => {
  // ===== LOAD LOGO FROM CACHE FIRST =====
  // Load header logo from offline cache if available, BEFORE network request
  const headerLogo = document.getElementById('header-logo') || document.querySelector('header img');
  if (headerLogo) {
    const logoUrl = headerLogo.getAttribute('data-src') || headerLogo.src;
    if (logoUrl && logoUrl !== window.location.href) {
      // Wait for OfflinePreloader
      let attempts = 0;
      while (typeof OfflinePreloader === 'undefined' && attempts < 30) {
        await new Promise(resolve => setTimeout(resolve, 50));
        attempts++;
      }
      
      if (typeof OfflinePreloader !== 'undefined') {
        try {
          const cachedLogoUrl = await OfflinePreloader.getCachedImage(logoUrl);
          if (cachedLogoUrl) {
            console.log('✅ Using cached logo');
            headerLogo.src = cachedLogoUrl;
            headerLogo.style.opacity = '1';
          } else {
            // No cache, use network
            console.log('⚠️ Logo not in cache, loading from network');
            headerLogo.src = logoUrl;
            headerLogo.style.opacity = '1';
          }
        } catch (error) {
          console.warn('⚠️ Failed to load cached logo:', error);
          headerLogo.src = logoUrl;
          headerLogo.style.opacity = '1';
        }
      } else {
        // OfflinePreloader not available, load from network
        headerLogo.src = logoUrl;
        headerLogo.style.opacity = '1';
      }
    }
  }

  // ===== AUDIO INITIALIZATION =====
  setSoundMode("synth"); // force synth on start for debugging
  
  // Setup both sound mode selectors with bidirectional sync
  const soundModeWorkout = document.getElementById("soundMode");
  const soundModeSetup = document.getElementById("soundMode-setup");
  
  // Function to sync both selectors
  function syncSoundModeSelectors(value) {
    if (soundModeWorkout) soundModeWorkout.value = value;
    if (soundModeSetup) soundModeSetup.value = value;
    setSoundMode(value);
  }
  
  // Add change listeners to both selectors
  if (soundModeWorkout) {
    soundModeWorkout.addEventListener("change", e => syncSoundModeSelectors(e.target.value));
  }
  if (soundModeSetup) {
    soundModeSetup.addEventListener("change", e => syncSoundModeSelectors(e.target.value));
  }

  warmUpServer();
  speechSynthesis.getVoices(); // trigger voices load
  waitForVoices(1500).then(lockSynthVoices).catch(()=>{});

  preloadAudio(Object.values(beppeSounds));
  preloadWorkoutAudios();

  // ===== WARMUP TOGGLE =====
  // Warmup toggle - restore saved preference from localStorage
  const savedWarmupPref = localStorage.getItem("warmupEnabled");
  const warmupToggle = document.getElementById("warmup-toggle");
  
  if (warmupToggle) {
    // Restore saved preference (default to true if not set)
    if (savedWarmupPref !== null) {
      warmupToggle.checked = savedWarmupPref === "true";
    }
    
    // Save preference when changed
    warmupToggle.addEventListener("change", (e) => {
      localStorage.setItem("warmupEnabled", e.target.checked.toString());
    });
  }

  // ===== LOGIN & USER STATE =====
  const headerLoginBtn = document.getElementById("header-login-btn");
  const headerDashboardBtn = document.getElementById("header-dashboard-btn");
  
  const savedUser = localStorage.getItem("loggedUser");
  
  if (savedUser) {
    // User is logged in
    
    // If on index.html and logged in, redirect to dashboard
    const trainingSelector = document.getElementById("training-selector");
    if (trainingSelector) {
      // We're on index.html, redirect to dashboard
      window.location.href = "dashboard-v7.html";
      return; // Stop execution
    }
    
    const loginScreen = document.getElementById("login-screen");
    const loginModal = document.getElementById("login-modal");
    const mainApp = document.getElementById("main-app");
    
    if (loginScreen) loginScreen.style.display = "none";
    if (loginModal) loginModal.classList.remove("active");
    if (mainApp) mainApp.style.display = "block";
    
    // Show dashboard button, hide login button
    if (headerLoginBtn) headerLoginBtn.style.display = "none";
    if (headerDashboardBtn) headerDashboardBtn.style.display = "flex";
    
    loadUserData(savedUser);
  } else {
    // User is NOT logged in
    const loginScreen = document.getElementById("login-screen");
    const loginModal = document.getElementById("login-modal");
    const mainApp = document.getElementById("main-app");
    const trainingSelector = document.getElementById("training-selector");
    
    if (loginScreen) loginScreen.style.display = "block";
    if (loginModal) loginModal.classList.remove("active"); // Don't show modal by default
    if (mainApp) mainApp.style.display = "none";
    if (trainingSelector) trainingSelector.style.display = "block"; // Show training selector on index.html
    
    // Show login button, hide dashboard button
    if (headerLoginBtn) {
      headerLoginBtn.style.display = "flex";
    }
    if (headerDashboardBtn) {
      headerDashboardBtn.style.display = "none";
    }
  }

  // ===== LOGIN/LOGOUT BUTTONS =====
  const loginBtn = document.getElementById("login-button");
  if (loginBtn) loginBtn.addEventListener("click", login);
  
  // Use headerLoginBtn and headerDashboardBtn already declared above
  if (headerLoginBtn) {
    headerLoginBtn.addEventListener("click", () => {
      const loginModal = document.getElementById("login-modal");
      if (loginModal) loginModal.classList.add("active");
    });
  }
  
  const loginModalClose = document.getElementById("login-modal-close");
  if (loginModalClose) {
    loginModalClose.addEventListener("click", () => {
      const loginModal = document.getElementById("login-modal");
      if (loginModal) loginModal.classList.remove("active");
    });
  }
  
  // Close modal when clicking outside (on backdrop)
  const loginModal = document.getElementById("login-modal");
  if (loginModal) {
    loginModal.addEventListener("click", (e) => {
      if (e.target === loginModal) {
        loginModal.classList.remove("active");
      }
    });
  }
  
  const logoutBtn = document.getElementById("logout-button");
  if (logoutBtn) logoutBtn.addEventListener("click", logout);

  // ===== WORKOUT START BUTTONS =====
  const topStart = document.getElementById("start-button");
  if (topStart) topStart.addEventListener("click", startWorkout);
  const bottomStart = document.getElementById("start-button-bottom");
  if (bottomStart) bottomStart.addEventListener("click", startWorkout);

  // ===== WORKOUT CONTROL BUTTONS =====

  // ===== WORKOUT CONTROL BUTTONS =====
  const pauseBtn = document.getElementById("pause-button");
  if (pauseBtn) {
    pauseBtn.addEventListener("click", () => {
      isPaused = !isPaused;
      const btn = document.getElementById("pause-button");
      if (isPaused) {
        btn.textContent = "▶️ Riprendi";
        // the loop will capture savedTimeLeft and stop itself
      } else {
        btn.textContent = "⏸ Pausa";
        resumeTimer();
      }
    });
  }

  // ===== FOOTER OFFSET SYNC =====
  // Footer offset sync - runs on page load and resize events
  (function footerOffsetSync(){
    const root = document.documentElement;
    const footer = document.getElementById('bottom-buttons-container');

    function sync(){
      if (!footer) return;
      // measure the *real* rendered height (includes padding + safe-area)
      const h = footer.offsetHeight || 0;
      root.style.setProperty('--bottom-bar-offset', h + 'px');
    }

    // Add listeners for when layout changes
    window.addEventListener('load', sync);
    window.addEventListener('resize', sync);
    window.addEventListener('orientationchange', sync);
    // some mobile browsers fire layout changes on visibility toggles
    document.addEventListener('visibilitychange', sync);

    // call once immediately since we're already in DOMContentLoaded
    sync();
  })();

  // ===== EXERCISE NAVIGATION BUTTONS =====
  const prevBtn = document.getElementById("prev-exercise-button");
  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      if (currentStep > 0) {
        clearInterval(interval);
        currentStep--;
        savedTimeLeft = null;
        isPaused = false;
        const pauseBtn = document.getElementById("pause-button");
        if (pauseBtn) pauseBtn.textContent = "⏸ Pausa";
        playExercise(currentStep, fullWorkoutSequence);
      }
    });
  }

  const nextBtn = document.getElementById("next-exercise-button");
  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      if (currentStep < fullWorkoutSequence.length - 1) {
        clearInterval(interval);
        currentStep++;
        savedTimeLeft = null;
        isPaused = false;
        const pauseBtn = document.getElementById("pause-button");
        if (pauseBtn) pauseBtn.textContent = "⏸ Pausa";
        playExercise(currentStep, fullWorkoutSequence);
      }
    });
  }

  // ===== SETTINGS POPUP (DURING WORKOUT) =====
  const settingsBtn = document.getElementById("settings-button");
  if (settingsBtn) {
    settingsBtn.addEventListener("click", () => {
      const pop = document.getElementById("settings-popup");
      if (pop) pop.style.display = "flex";
    });
  }

  const closeSettings = document.getElementById("close-settings");
  if (closeSettings) {
    closeSettings.addEventListener("click", () => {
      const pop = document.getElementById("settings-popup");
      if (pop) pop.style.display = "none";
    });
  }

  const exitBtn = document.getElementById("exit-workout-button");
  if (exitBtn) {
    exitBtn.addEventListener("click", () => {
      if (confirm("Sei sicuro di voler terminare l'allenamento?")) {
        exitWorkout();
      }
    });
  }

  const settingsPopup = document.getElementById("settings-popup");
  if (settingsPopup) {
    settingsPopup.addEventListener("click", (e) => {
      if (e.target.id === "settings-popup") settingsPopup.style.display = "none";
    });
  }

  // ===== VOLUME SLIDER =====
  const volumeSlider = document.getElementById("volume-slider");
  const volumeValue = document.getElementById("volume-value");
  
  // Load saved volume or default to 100
  const savedVolume = localStorage.getItem('viltrum_volume') || '100';
  if (volumeSlider && volumeValue) {
    volumeSlider.value = savedVolume;
    volumeValue.textContent = savedVolume;
    
    // Apply saved volume immediately to all audio elements
    const applyVolumeToAll = (volumePercent) => {
      const volume = parseInt(volumePercent) / 100;
      
      // Store in global variable for synth and future audio
      currentVolume = volume;
      
      // Apply to beep sounds
      const beepSound = document.getElementById("beep-sound");
      const transitionSound = document.getElementById("transition-sound");
      if (beepSound) beepSound.volume = volume;
      if (transitionSound) transitionSound.volume = volume;
      
      // Apply to TTS audio
      if (ttsAudio) ttsAudio.volume = volume;
      
      // Apply to beppePlayer
      if (beppePlayer) beppePlayer.volume = volume;
      
      // Apply to any other audio elements
      document.querySelectorAll('audio').forEach(audio => {
        audio.volume = volume;
      });
      
      console.log('[Volume] Applied to all audio sources:', volume);
    };
    
    // Apply saved volume on load
    applyVolumeToAll(savedVolume);
    
    // Update volume when slider changes
    volumeSlider.addEventListener('input', (e) => {
      const newVolume = e.target.value;
      volumeValue.textContent = newVolume;
      
      // Apply to all audio elements
      applyVolumeToAll(newVolume);
      
      // Save to localStorage
      localStorage.setItem('viltrum_volume', newVolume);
      
      console.log('[Volume] Set to:', newVolume + '%');
    });
  }

  // ===== ADD 10 SECONDS BUTTON =====
  const add10sBtn = document.getElementById("add-10s-button");
  if (add10sBtn) {
    console.log("[+10s] Button found and event listener attached");
    add10sBtn.addEventListener("click", () => {
      console.log("[+10s] Button clicked! isWorkoutActive:", isWorkoutActive, "isPaused:", isPaused);
      
      if (!isWorkoutActive) {
        console.log("[+10s] Workout not active, ignoring click");
        return; // Silently ignore if workout not active
      }
      
      if (isPaused) {
        // If paused, add to savedTimeLeft
        if (savedTimeLeft !== null) {
          savedTimeLeft += 10;
          console.log("[+10s] Added 10 seconds to paused time:", savedTimeLeft);
          
          // Update timer display
          const timerEl = document.getElementById("timer");
          if (timerEl) {
            timerEl.textContent = savedTimeLeft;
            timerEl.style.color = "#4CAF50";
            setTimeout(() => {
              timerEl.style.color = "";
            }, 500);
          }
        } else {
          console.log("[+10s] Warning: savedTimeLeft is null while paused");
        }
      } else {
        // If running, add to currentTimerEndTime
        if (currentTimerEndTime !== null) {
          currentTimerEndTime += 10000; // Add 10 seconds in milliseconds
          console.log("[+10s] Added 10 seconds to active timer, new end time:", currentTimerEndTime);
          
          // Show visual feedback
          const timerEl = document.getElementById("timer");
          if (timerEl) {
            timerEl.style.color = "#4CAF50";
            setTimeout(() => {
              timerEl.style.color = "";
            }, 500);
          }
        } else {
          console.log("[+10s] Warning: currentTimerEndTime is null while running");
        }
      }
    });
  } else {
    console.error("[+10s] Button not found in DOM!");
  }

  // ===== FAB MENU TOGGLE =====
  const fabBtn = document.getElementById("fab-menu-toggle");
  const controlsContainer = document.getElementById("controls-container");
  const controlsOverlay = document.getElementById("controls-overlay");

  if (fabBtn && controlsContainer && controlsOverlay) {
    // Toggle menu on FAB click
    fabBtn.addEventListener("click", () => {
      const isHidden = controlsContainer.classList.contains("controls-hidden");
      
      if (isHidden) {
        // Open menu
        controlsContainer.classList.remove("controls-hidden");
        controlsContainer.classList.add("controls-visible");
        controlsOverlay.classList.remove("controls-overlay-hidden");
        controlsOverlay.classList.add("controls-overlay-visible");
        fabBtn.classList.add("active");
      } else {
        // Close menu
        controlsContainer.classList.remove("controls-visible");
        controlsContainer.classList.add("controls-hidden");
        controlsOverlay.classList.remove("controls-overlay-visible");
        controlsOverlay.classList.add("controls-overlay-hidden");
        fabBtn.classList.remove("active");
      }
    });

    // Close menu on overlay click
    controlsOverlay.addEventListener("click", () => {
      controlsContainer.classList.remove("controls-visible");
      controlsContainer.classList.add("controls-hidden");
      controlsOverlay.classList.remove("controls-overlay-visible");
      controlsOverlay.classList.add("controls-overlay-hidden");
      fabBtn.classList.remove("active");
    });
  }

  // ===== SETUP SETTINGS POPUP (BEFORE WORKOUT) =====
  const setupSettingsBtn = document.getElementById("setup-settings-button");
  if (setupSettingsBtn) {
    setupSettingsBtn.addEventListener("click", () => {
      const pop = document.getElementById("setup-settings-popup");
      if (pop) pop.style.display = "flex";
    });
  }

  const closeSetupSettings = document.getElementById("close-setup-settings");
  if (closeSetupSettings) {
    closeSetupSettings.addEventListener("click", () => {
      const pop = document.getElementById("setup-settings-popup");
      if (pop) pop.style.display = "none";
    });
  }

  const setupSettingsPopup = document.getElementById("setup-settings-popup");
  if (setupSettingsPopup) {
    setupSettingsPopup.addEventListener("click", (e) => {
      if (e.target.id === "setup-settings-popup") setupSettingsPopup.style.display = "none";
    });
  }

  // ===== INSTRUCTIONS COLLAPSIBLE =====
  const instrHeader = document.getElementById("instructions-header");
  if (instrHeader) {
    instrHeader.addEventListener("click", () => {
      const header = document.getElementById("instructions-header");
      const content = document.getElementById("instructions-content");
      const icon = document.getElementById("instructions-collapse-icon");
      if (header) header.classList.toggle("collapsed");
      if (content) content.classList.toggle("collapsed");
    });
  }

  // ===== KEYBOARD SHORTCUTS =====

  document.addEventListener("keydown", (e) => {
    const exerciseContainer = document.getElementById("exercise-container");
    if (!exerciseContainer || exerciseContainer.style.display === "none") return;

    if (e.key === "ArrowLeft") {
      e.preventDefault();
      document.getElementById("prev-exercise-button")?.click();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      document.getElementById("next-exercise-button")?.click();
    } else if (e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      document.getElementById("pause-button")?.click();
    }
  });

  // ===== DYNAMIC BOTTOM SHEET OFFSET =====
  // Update CSS variable for bottom sheet height to prevent content from going behind Safari toolbar
  function updateSheetInset(selector = '.bottom-sheet-panel') {
    const el = document.querySelector(selector);
    const h = el ? el.offsetHeight : 0;
    document.documentElement.style.setProperty('--sheet-visible', h ? `${h}px` : '0px');
  }

  // Call on load, resize, and visualViewport changes
  updateSheetInset();
  
  window.addEventListener('resize', () => updateSheetInset());
  
  if (window.visualViewport) {
    visualViewport.addEventListener('resize', () => updateSheetInset());
    visualViewport.addEventListener('scroll', () => updateSheetInset());
  }

  // Update when bottom sheet opens/closes
  const bottomSheet = document.getElementById('training-bottom-sheet');
  if (bottomSheet) {
    const observer = new MutationObserver(() => updateSheetInset());
    observer.observe(bottomSheet, { attributes: true, attributeFilter: ['class'] });
  }
});

// Release wake lock when page is hidden or closed
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    releaseWakeLock();
  }
});

// Release wake lock on page unload (backup)
window.addEventListener('beforeunload', () => {
  releaseWakeLock();
});