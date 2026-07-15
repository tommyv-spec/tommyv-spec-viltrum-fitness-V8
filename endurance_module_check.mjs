
    import DataPreloader from '../js/data-preloader.js';
    import { GOOGLE_SCRIPT_URL } from '../js/config.js';
    import { paceZoneBands, classifyPace, formatPace } from '../js/pace-zones.js';
    import { getThresholdPace } from '../js/profile-manager.js';

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════════════════════
    const TTS_SERVER_URL = 'https://google-tts-server.onrender.com/speak';
    
    // ElevenLabs Audio (pre-generated, hosted on GitHub)
    const ELEVEN_BASE_URL = 'https://github.com/tommyv-spec/viltrum-audio-istruttore/raw/main/elevenlabs';
    const ELEVEN_AUDIO = {
      // Zone
      'zona-1': 'zona-1.mp3', 'zona-2': 'zona-2.mp3', 'zona-3': 'zona-3.mp3',
      'zona-4': 'zona-4.mp3', 'zona-5': 'zona-5.mp3',
      // Numeri
      'num-1': 'num-1.mp3', 'num-2': 'num-2.mp3', 'num-3': 'num-3.mp3',
      'num-4': 'num-4.mp3', 'num-5': 'num-5.mp3', 'num-6': 'num-6.mp3',
      'num-7': 'num-7.mp3', 'num-8': 'num-8.mp3', 'num-9': 'num-9.mp3',
      'num-10': 'num-10.mp3', 'num-15': 'num-15.mp3', 'num-20': 'num-20.mp3',
      'num-30': 'num-30.mp3', 'num-45': 'num-45.mp3', 'num-50': 'num-50.mp3',
      'num-60': 'num-60.mp3', 'num-100': 'num-100.mp3', 'num-200': 'num-200.mp3',
      'num-500': 'num-500.mp3', 'num-800': 'num-800.mp3',
      // Unità
      'chilometro': 'chilometro.mp3', 'chilometri': 'chilometri.mp3',
      'metro': 'metro.mp3', 'metri': 'metri.mp3',
      'minuto': 'minuto.mp3', 'minuti': 'minuti.mp3',
      'secondo': 'secondo.mp3', 'secondi': 'secondi.mp3',
      // Warning distanza
      'mancano-500-metri': 'mancano-500-metri.mp3',
      'mancano-200-metri': 'mancano-200-metri.mp3',
      'mancano-100-metri': 'mancano-100-metri.mp3',
      'mancano-50-metri': 'mancano-50-metri.mp3',
      // Warning tempo
      'mancano-60-secondi': 'mancano-60-secondi.mp3',
      'mancano-30-secondi': 'mancano-30-secondi.mp3',
      'mancano-10-secondi': 'mancano-10-secondi.mp3',
      'mancano-5-secondi': 'mancano-5-secondi.mp3',
      // Countdown & frasi
      'countdown-5': 'countdown-5.mp3',
      'prossima-fase': 'prossima-fase.mp3', 'preparati': 'preparati.mp3',
      'ottimo-lavoro': 'ottimo-lavoro.mp3', 'workout-completato': 'workout-completato.mp3',
      'ultima-fase': 'ultima-fase.mp3',
      // Descrizioni
      'recupero': 'recupero.mp3', 'corsa-lenta': 'corsa-lenta.mp3',
      'ritmo-moderato': 'ritmo-moderato.mp3', 'ritmo-sostenuto': 'ritmo-sostenuto.mp3',
      'ritmo-veloce': 'ritmo-veloce.mp3', 'massimo-sforzo': 'massimo-sforzo.mp3',
      'camminata': 'camminata.mp3', 'aerobico': 'aerobico.mp3',
      'soglia': 'soglia.mp3', 'vo2-max': 'vo2-max.mp3', 'sprint': 'sprint.mp3',
      // Prossima zona
      'prossima-zona-1': 'prossima-zona-1.mp3', 'prossima-zona-2': 'prossima-zona-2.mp3',
      'prossima-zona-3': 'prossima-zona-3.mp3', 'prossima-zona-4': 'prossima-zona-4.mp3',
      'prossima-zona-5': 'prossima-zona-5.mp3',
      // Ripetizioni
      'ripetizione-1-di-2': 'ripetizione-1-di-2.mp3', 'ripetizione-2-di-2': 'ripetizione-2-di-2.mp3',
      'ripetizione-1-di-3': 'ripetizione-1-di-3.mp3', 'ripetizione-2-di-3': 'ripetizione-2-di-3.mp3',
      'ripetizione-3-di-3': 'ripetizione-3-di-3.mp3',
      'ripetizione-1-di-4': 'ripetizione-1-di-4.mp3', 'ripetizione-2-di-4': 'ripetizione-2-di-4.mp3',
      'ripetizione-3-di-4': 'ripetizione-3-di-4.mp3', 'ripetizione-4-di-4': 'ripetizione-4-di-4.mp3',
      'ripetizione-1-di-5': 'ripetizione-1-di-5.mp3', 'ripetizione-2-di-5': 'ripetizione-2-di-5.mp3',
      'ripetizione-5-di-5': 'ripetizione-5-di-5.mp3',
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════════════════════
    let runWorkouts = {};
    let currentWorkout = null;
    let currentWorkoutName = '';
    let expandedPhases = [];
    let currentPhaseIndex = 0;
    let isPaused = false;
    let v7PlanInfo = null;
    let paceBands = null; // Array from paceZoneBands, or null if no threshold set

    // Rolling window for smoothed live pace. Each entry: {t: ms, lat, lon}.
    let paceWindow = [];
    const PACE_WINDOW_MS = 18000;   // ~18s of history
    const PACE_MIN_MS = 8000;       // need >=8s before showing a pace
    const GPS_ACCURACY_MAX_M = 25;  // discard fuzzier fixes

    // Human label for a zone's pace band, e.g. "5:42 – 6:27 /km".
    // Open-ended zones (Z1 slow, Z5 fast) render one-sided.
    function paceBandLabel(zone) {
      if (!paceBands) return '';
      const b = paceBands.find((x) => x.zone === zone);
      if (!b) return '';
      if (b.maxSec === Infinity) return `più lento di ${formatPace(b.minSec)} /km`;
      if (b.minSec === 0) return `più veloce di ${formatPace(b.maxSec)} /km`;
      return `${formatPace(b.minSec)} – ${formatPace(b.maxSec)} /km`;
    }

    // "5:42" spoken. Italian TTS reads "5:42" poorly, so convert to words.
    function speakPace(sec) {
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      if (s === 0) return `${m} minuti al chilometro`;
      return `${m} minuti e ${s} al chilometro`;
    }

    // GPS State
    let gpsWatchId = null;
    let gpsPositions = [];
    let totalDistance = 0;
    let phaseDistance = 0;
    let startTime = null;
    let phaseStartTime = null;
    let timerInterval = null;
    let countdownInterval = null;
    let phaseTimeRemaining = 0;
    let wakeLock = null;

    // Audio State
    let audioUnlocked = false;
    let lastAnnouncedWarning = {};  // Track announced warnings per phase

    // ═══════════════════════════════════════════════════════════════════════════
    // AUDIO SYSTEM
    // ═══════════════════════════════════════════════════════════════════════════
    
    function getSoundMode() {
      return document.getElementById('soundMode')?.value || 'none';
    }

    async function ensureAudioUnlocked() {
      if (audioUnlocked) return;
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { audioUnlocked = true; return; }
        const ctx = new AC();
        if (ctx.state === 'suspended') {
          // iOS Safari: ctx.resume() hangs forever without user gesture
          // Use a timeout to prevent blocking
          await Promise.race([
            ctx.resume(),
            new Promise(r => setTimeout(r, 1000))
          ]);
        }
        if (ctx.state === 'running') {
          const src = ctx.createBufferSource();
          src.buffer = ctx.createBuffer(1, 1, 22050);
          src.connect(ctx.destination);
          src.start(0);
        }
        audioUnlocked = true;
        console.log('🔊 Audio unlocked (state: ' + ctx.state + ')');
      } catch (e) {
        audioUnlocked = true; // Don't block workout even if audio fails
        console.warn('Unable to unlock audio:', e);
      }
    }

    async function playAudioUrl(url) {
      const el = document.getElementById('tts-audio');
      if (!el) return;
      
      return Promise.race([
        new Promise((resolve, reject) => {
          el.src = url;
          el.onended = () => { try { URL.revokeObjectURL(url); } catch(e){} resolve(); };
          el.onerror = (e) => { try { URL.revokeObjectURL(url); } catch(e2){} reject(e); };
          el.play().catch(reject);
        }),
        new Promise(r => setTimeout(r, 10000)) // 10s max per audio
      ]);
    }

    // Cloud TTS
    async function speakCloud(text, lang = 'it-IT') {
      try {
        await ensureAudioUnlocked();
        
        const voice = lang === 'it-IT' ? 'it-IT-Wavenet-C' : 'en-US-Wavenet-D';
        console.log(`🗣️ Cloud TTS: "${text}"`);
        
        const res = await fetch(TTS_SERVER_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, lang, voice })
        });
        
        if (!res.ok) throw new Error(`TTS Error ${res.status}`);
        
        const blob = await res.blob();
        if (blob.size < 100) throw new Error('Empty audio');
        
        const audioUrl = URL.createObjectURL(blob);
        await playAudioUrl(audioUrl);
        
      } catch (err) {
        console.warn('❌ Cloud TTS failed:', err.message);
        throw err;
      }
    }

    // Synth TTS (Web Speech API)
    async function speakSynth(text, lang = 'it-IT') {
      await ensureAudioUnlocked();
      
      return new Promise((resolve, reject) => {
        try { speechSynthesis.cancel(); } catch {}
        try { speechSynthesis.resume(); } catch {}
        
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = lang;
        utter.rate = 1.0;
        utter.pitch = 1.0;
        utter.volume = 1.0;
        
        const timeout = setTimeout(() => resolve(), 5000);
        
        utter.onend = () => { clearTimeout(timeout); resolve(); };
        utter.onerror = (e) => { 
          clearTimeout(timeout); 
          if (e.error === 'interrupted') resolve();
          else reject(e);
        };
        
        speechSynthesis.speak(utter);
      });
    }

    // Main speak function with fallback
    async function speak(text, lang = 'it-IT') {
      const mode = getSoundMode();
      if (mode === 'none' || mode === 'bip') return;
      
      if (mode === 'voice') {
        try {
          return await speakCloud(text, lang);
        } catch (err) {
          console.warn('⚠️ Voice failed, fallback to synth');
          try {
            return await speakSynth(text, lang);
          } catch (synthErr) {
            console.error('❌ Synth also failed:', synthErr);
          }
        }
      }
      
      if (mode === 'synth') {
        return speakSynth(text, lang);
      }
    }

    function playBeep() {
      const mode = getSoundMode();
      if (mode === 'none') return;
      
      try {
        const beep = document.getElementById('beep-sound');
        if (beep) {
          beep.currentTime = 0;
          beep.play().catch(() => {});
        }
      } catch (e) {}
    }

    function playTransition() {
      const mode = getSoundMode();
      if (mode === 'none') return;
      
      try {
        const trans = document.getElementById('transition-sound');
        if (trans) {
          trans.currentTime = 0;
          trans.play().catch(() => {});
        }
      } catch (e) {}
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ELEVENLABS AUDIO PLAYER
    // ═══════════════════════════════════════════════════════════════════════════
    
    async function playElevenAudio(key) {
      if (!ELEVEN_AUDIO[key]) {
        console.warn(`⚠️ ElevenLabs audio not found: ${key}`);
        return;
      }
      
      await ensureAudioUnlocked();
      const url = `${ELEVEN_BASE_URL}/${ELEVEN_AUDIO[key]}`;
      const audio = document.getElementById('tts-audio');
      
      return Promise.race([
        new Promise((resolve) => {
          audio.src = url;
          audio.onended = resolve;
          audio.onerror = () => { console.warn(`❌ Failed: ${key}`); resolve(); };
          audio.play().catch(() => resolve());
        }),
        new Promise(r => setTimeout(r, 5000)) // 5s max per clip
      ]);
    }
    
    async function playElevenSequence(keys) {
      for (const key of keys) {
        if (key) await playElevenAudio(key);
      }
    }
    
    // Helper: get number key for ElevenLabs
    function getNumKey(num) {
      const available = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 30, 45, 50, 60, 100, 200, 500, 800];
      return available.includes(num) ? `num-${num}` : null;
    }
    
    // Helper: get unit key for ElevenLabs
    function getUnitKey(unit, value) {
      if (unit === 'km') return value === 1 ? 'chilometro' : 'chilometri';
      if (unit === 'm') return 'metri';
      if (unit === 'min') return value === 1 ? 'minuto' : 'minuti';
      if (unit === 'sec') return 'secondi';
      return null;
    }
    
    // Helper: get description key for ElevenLabs
    function getDescKey(desc) {
      if (!desc) return null;
      const d = desc.toLowerCase();
      if (d.includes('camminat')) return 'camminata';
      if (d.includes('recupero')) return 'recupero';
      if (d.includes('lenta') || d.includes('aerobic')) return 'corsa-lenta';
      if (d.includes('moderat')) return 'ritmo-moderato';
      if (d.includes('sostenut') || d.includes('soglia')) return 'ritmo-sostenuto';
      if (d.includes('veloce') || d.includes('vo2')) return 'ritmo-veloce';
      if (d.includes('sprint') || d.includes('massim')) return 'massimo-sforzo';
      return null;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // RUNWORKOUT ANNOUNCEMENTS
    // ═══════════════════════════════════════════════════════════════════════════
    
    function getZoneName(zone) {
      const names = { 1: 'recupero', 2: 'aerobico', 3: 'moderato', 4: 'soglia', 5: 'massimo' };
      return names[zone] || '';
    }

    function getUnitName(unit, value) {
      if (unit === 'km') return value === 1 ? 'chilometro' : 'chilometri';
      if (unit === 'm') return 'metri';
      if (unit === 'min') return value === 1 ? 'minuto' : 'minuti';
      if (unit === 'sec') return 'secondi';
      return unit;
    }

    function isShortPhase(phase) {
      if (phase.unit === 'sec') return phase.value < 30;
      if (phase.unit === 'min') return phase.value < 0.5;
      if (phase.unit === 'm') return phase.value < 500;
      if (phase.unit === 'km') return phase.value < 0.5;
      return false;
    }

    // Announce phase start
    async function announcePhaseStart(phase) {
      const mode = getSoundMode();
      if (mode === 'none') return;
      
      playBeep();
      vibrate();
      
      if (mode === 'bip') return;
      
      // Reset warnings for new phase
      lastAnnouncedWarning = {};
      
      const short = isShortPhase(phase);
      
      if (mode === 'eleven') {
        // ElevenLabs: play pre-recorded audio sequence
        // NOTE: pace band intentionally omitted here — no pre-recorded pace-number
        // clips exist. Pace is spoken only in the synth/voice path below.
        const sequence = [`zona-${phase.zone}`];
        const numKey = getNumKey(phase.value);
        if (numKey) sequence.push(numKey);
        sequence.push(getUnitKey(phase.unit, phase.value));
        if (!short) {
          const descKey = getDescKey(phase.description);
          if (descKey) sequence.push(descKey);
        }
        await playElevenSequence(sequence.filter(k => k));
      } else {
        // Voice/Synth: dynamic TTS
        let text = `Zona ${phase.zone}`;
        if (!short) {
          text += `, ${phase.value} ${getUnitName(phase.unit, phase.value)}`;
          if (phase.description) text += `, ${phase.description}`;
        } else {
          text += `, ${phase.value} ${getUnitName(phase.unit, phase.value)}`;
        }
        // Friel pace band (voice/synth path only — ElevenLabs has no pace-number clips)
        if (paceBands && !short) {
          const b = paceBands.find((x) => x.zone === phase.zone);
          if (b) {
            if (b.maxSec === Infinity) {
              text += `, passo più lento di ${speakPace(b.minSec)}`;
            } else if (b.minSec === 0) {
              text += `, passo più veloce di ${speakPace(b.maxSec)}`;
            } else {
              text += `, passo ${speakPace(b.minSec)} a ${speakPace(b.maxSec)}`;
            }
          }
        }
        await speak(text);
      }
    }

    // Announce loop repetition
    async function announceLoopRep(rep, total) {
      const mode = getSoundMode();
      if (mode === 'none' || mode === 'bip') return;
      
      if (rep > 1) {
        if (mode === 'eleven') {
          const key = `ripetizione-${rep}-di-${total}`;
          if (ELEVEN_AUDIO[key]) await playElevenAudio(key);
        } else {
          await speak(`Ripetizione ${rep} di ${total}`);
        }
      }
    }

    // Announce time warning (for time-based phases)
    async function announceTimeWarning(remaining, phase) {
      const mode = getSoundMode();
      if (mode === 'none') return;
      
      const short = isShortPhase(phase);
      const key = `time_${remaining}`;
      
      if (lastAnnouncedWarning[key]) return;
      lastAnnouncedWarning[key] = true;
      
      // Long phases: warn at 30s, 10s, 5s countdown
      // Short phases: only 5s countdown
      
      if (!short && remaining === 30) {
        if (mode === 'bip') { playBeep(); return; }
        if (mode === 'eleven') {
          await playElevenAudio('mancano-30-secondi');
        } else {
          await speak('mancano trenta secondi');
        }
      }
      
      if (!short && remaining === 10) {
        if (mode === 'bip') { playBeep(); return; }
        const nextPhase = expandedPhases[currentPhaseIndex + 1];
        if (nextPhase) {
          if (mode === 'eleven') {
            await playElevenAudio(`prossima-zona-${nextPhase.zone}`);
          } else {
            await speak(`Prossima fase: Zona ${nextPhase.zone}, ${nextPhase.value} ${getUnitName(nextPhase.unit, nextPhase.value)}`);
          }
        }
      }
      
      if (remaining === 5) {
        if (mode === 'bip') { playBeep(); return; }
        if (mode === 'eleven') {
          await playElevenAudio('countdown-5');
        } else {
          await speak('cinque, quattro, tre, due, uno');
        }
      }
    }

    // Announce distance warning (for distance-based phases)
    async function announceDistanceWarning(remainingMeters, phase) {
      const mode = getSoundMode();
      if (mode === 'none') return;
      
      const short = isShortPhase(phase);
      
      // Long phases: warn at 500m, 200m, 100m
      // Short phases: only at 50m (as beep)
      
      if (!short) {
        if (remainingMeters <= 500 && remainingMeters > 450 && !lastAnnouncedWarning['dist_500']) {
          lastAnnouncedWarning['dist_500'] = true;
          if (mode === 'bip') { playBeep(); return; }
          if (mode === 'eleven') {
            await playElevenAudio('mancano-500-metri');
          } else {
            await speak('mancano 500 metri');
          }
        }
        
        if (remainingMeters <= 200 && remainingMeters > 150 && !lastAnnouncedWarning['dist_200']) {
          lastAnnouncedWarning['dist_200'] = true;
          if (mode === 'bip') { playBeep(); return; }
          if (mode === 'eleven') {
            await playElevenAudio('mancano-200-metri');
            const nextPhase = expandedPhases[currentPhaseIndex + 1];
            if (nextPhase) await playElevenAudio(`prossima-zona-${nextPhase.zone}`);
          } else {
            await speak('mancano 200 metri');
            const nextPhase = expandedPhases[currentPhaseIndex + 1];
            if (nextPhase) {
              await speak(`Prossima: Zona ${nextPhase.zone}, ${nextPhase.value} ${getUnitName(nextPhase.unit, nextPhase.value)}`);
            }
          }
        }
        
        if (remainingMeters <= 100 && remainingMeters > 50 && !lastAnnouncedWarning['dist_100']) {
          lastAnnouncedWarning['dist_100'] = true;
          if (mode === 'bip') { playBeep(); return; }
          if (mode === 'eleven') {
            await playElevenAudio('mancano-100-metri');
          } else {
            await speak('mancano 100 metri');
          }
        }
      } else {
        // Short phase: just beep at 50m
        if (remainingMeters <= 50 && !lastAnnouncedWarning['dist_50']) {
          lastAnnouncedWarning['dist_50'] = true;
          playBeep();
        }
      }
    }

    // Announce workout completion
    async function announceCompletion() {
      const mode = getSoundMode();
      playBeep();
      vibrate([200, 100, 200]);
      
      if (mode === 'none' || mode === 'bip') return;
      
      if (mode === 'eleven') {
        await playElevenSequence(['ottimo-lavoro', 'workout-completato']);
      } else {
        await speak('Ottimo lavoro! Workout completato.');
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INITIALIZATION
    // ═══════════════════════════════════════════════════════════════════════════
    const dbg = (msg) => { 
      const el = document.getElementById('debug-status'); 
      if (el) el.textContent = msg; 
      console.log('🏃 DBG:', msg); 
    };

    async function init() {
      dbg('init() chiamata');
      
      // Load saved sound mode
      const savedMode = localStorage.getItem('viltrum_run_soundMode');
      if (savedMode) {
        document.getElementById('soundMode').value = savedMode;
      }
      
      // Save sound mode on change
      document.getElementById('soundMode').addEventListener('change', (e) => {
        localStorage.setItem('viltrum_run_soundMode', e.target.value);
        if (e.target.value !== 'none') {
          ensureAudioUnlocked();
          playBeep();
        }
      });
      
      try {
        const loggedUser = localStorage.getItem('loggedUser');
        if (!loggedUser) {
          dbg('Nessun utente loggato, redirect...');
          window.location.href = '../index.html';
          return;
        }
        dbg('Utente: ' + loggedUser + ' - caricamento dati...');

        await DataPreloader.loadAll(loggedUser);
        dbg('DataPreloader caricato');
        
        runWorkouts = DataPreloader.getAllRunWorkouts();
        dbg('RunWorkouts: ' + Object.keys(runWorkouts).length + ' trovati');
        
        // Check if coming from plan-view
        const planWorkout = sessionStorage.getItem('currentWorkout');
        if (planWorkout) {
          try {
            const info = JSON.parse(planWorkout);
            if (info.workoutType === 'run') {
              dbg('Da plan-view: ' + info.workoutName);
              v7PlanInfo = info;
              
              if (!runWorkouts[info.workoutName]) {
                dbg('Workout non in cache, forceRefresh...');
                await DataPreloader.forceRefresh(loggedUser);
                runWorkouts = DataPreloader.getAllRunWorkouts();
                dbg('Dopo refresh: ' + Object.keys(runWorkouts).length + ' workouts');
              }
              
              if (!runWorkouts[info.workoutName]) {
                dbg('❌ Workout non trovato: ' + info.workoutName);
                sessionStorage.removeItem('currentWorkout');
                showView('selector-view');
                renderWorkoutList();
                return;
              }
              
              // Show ready screen - user tap will unlock audio on iOS
              document.getElementById('ready-workout-name').textContent = info.workoutName;
              showView('ready-view');
              document.getElementById('ready-start-btn').onclick = async function() {
                await ensureAudioUnlocked();
                await startWorkout(info.workoutName);
              };
              return;
            }
          } catch (e) {
            dbg('Errore parse plan: ' + e.message);
          }
        }

        dbg('Mostra lista workouts');
        showView('selector-view');
        renderWorkoutList();
        
      } catch (error) {
        dbg('❌ Init fallita: ' + error.message);
        showView('selector-view');
        document.getElementById('no-workouts').style.display = 'flex';
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW MANAGEMENT
    // ═══════════════════════════════════════════════════════════════════════════
    function showView(viewId) {
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      document.getElementById(viewId)?.classList.add('active');
    }

    function renderWorkoutList() {
      const list = document.getElementById('workout-list');
      const workoutNames = Object.keys(runWorkouts);
      
      if (workoutNames.length === 0) {
        document.getElementById('no-workouts').style.display = 'flex';
        return;
      }

      list.innerHTML = workoutNames.map(name => {
        const w = runWorkouts[name];
        const est = w.estimatedDistance || w.estimatedTime || `${w.phases?.length || 0} fasi`;
        return `
          <div class="workout-card" onclick="window.startWorkout('${name.replace(/'/g, "\\'")}')">
            <div class="workout-icon">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="3"/><path d="M12 8v8"/><path d="M8 21l4-5 4 5"/></svg>
            </div>
            <div class="workout-info">
              <h3>${name}</h3>
              <p>${est}</p>
            </div>
            <span class="workout-arrow">→</span>
          </div>
        `;
      }).join('');
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // START WORKOUT
    // ═══════════════════════════════════════════════════════════════════════════
    window.startWorkout = async function(name) {
      currentWorkout = runWorkouts[name];
      currentWorkoutName = name;
      
      if (!currentWorkout?.phases?.length) {
        console.error('❌ Workout non valido o senza fasi:', name);
        showView('selector-view');
        renderWorkoutList();
        return;
      }

      // Unlock audio (should already be unlocked from user tap)
      await ensureAudioUnlocked();

      // Expand phases (handle loops)
      expandedPhases = expandPhases(currentWorkout.phases);
      currentPhaseIndex = 0;
      
      // Reset stats
      totalDistance = 0;
      phaseDistance = 0;
      startTime = Date.now();
      phaseStartTime = Date.now();
      isPaused = false;
      lastAnnouncedWarning = {};

      // Load Friel pace bands (null if user has no threshold pace set)
      const thresholdSec = await getThresholdPace();
      paceBands = paceZoneBands(thresholdSec);

      // Show workout UI
      document.getElementById('workout-name').textContent = name;
      showView('workout-view');
      renderCurrentPhase();
      
      // Start GPS tracking
      startGPS();
      
      // Start global timer
      if (timerInterval) clearInterval(timerInterval);
      timerInterval = setInterval(updateGlobalTimer, 1000);
      
      // Announce first phase
      const firstPhase = expandedPhases[0];
      if (firstPhase._loopRep) {
        await announceLoopRep(firstPhase._loopRep, firstPhase._loopTotal);
      }
      await announcePhaseStart(firstPhase);
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // EXPAND PHASES (Handle Loops)
    // ═══════════════════════════════════════════════════════════════════════════
    function expandPhases(phases) {
      const expanded = [];
      let i = 0;
      
      while (i < phases.length) {
        const phase = phases[i];
        
        if (phase.loopGroup) {
          const loopPhases = [];
          const loopGroup = phase.loopGroup;
          const loopCount = phase.loopCount || 1;
          
          while (i < phases.length && phases[i].loopGroup === loopGroup) {
            loopPhases.push(phases[i]);
            i++;
          }
          
          for (let rep = 1; rep <= loopCount; rep++) {
            loopPhases.forEach(lp => {
              expanded.push({
                ...lp,
                _loopRep: rep,
                _loopTotal: loopCount,
                _loopSize: loopPhases.length
              });
            });
          }
        } else {
          expanded.push({ ...phase, _loopRep: null, _loopTotal: null });
          i++;
        }
      }
      
      return expanded;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // RENDER CURRENT PHASE
    // ═══════════════════════════════════════════════════════════════════════════
    function renderCurrentPhase() {
      const phase = expandedPhases[currentPhaseIndex];
      if (!phase) return;

      document.getElementById('phase-counter').textContent = `${currentPhaseIndex + 1} / ${expandedPhases.length}`;
      
      const totalProgress = ((currentPhaseIndex) / expandedPhases.length) * 100;
      document.getElementById('total-progress-fill').style.width = `${totalProgress}%`;

      const sectionLabels = { warmup: '🔥 WARMUP', main: '💪 MAIN', cooldown: '❄️ COOLDOWN' };
      document.getElementById('section-label').textContent = sectionLabels[phase.section] || phase.section?.toUpperCase() || 'MAIN';

      const card = document.getElementById('phase-card');
      card.className = `phase-card zone-${phase.zone}`;
      document.getElementById('zone-badge').textContent = `ZONA ${phase.zone}`;

      const unitLabels = { km: 'chilometri', m: 'metri', min: 'minuti', sec: 'secondi' };
      document.getElementById('phase-value').textContent = phase.value;
      document.getElementById('phase-unit').textContent = unitLabels[phase.unit] || phase.unit;
      document.getElementById('phase-description').textContent = phase.description || getZoneDescription(phase.zone);

      const loopIndicator = document.getElementById('loop-indicator');
      if (phase._loopRep) {
        loopIndicator.style.display = 'flex';
        document.getElementById('loop-text').textContent = `Ripetizione ${phase._loopRep}/${phase._loopTotal}`;
        
        const dotsContainer = document.getElementById('loop-dots');
        dotsContainer.innerHTML = '';
        for (let d = 1; d <= phase._loopTotal; d++) {
          const dot = document.createElement('div');
          dot.className = 'loop-dot' + (d < phase._loopRep ? ' completed' : d === phase._loopRep ? ' active' : '');
          dotsContainer.appendChild(dot);
        }
      } else {
        loopIndicator.style.display = 'none';
      }

      phaseDistance = 0;
      paceWindow = [];
      const lp = document.getElementById('live-pace');
      if (lp) { document.getElementById('live-pace-value').textContent = '--:--'; lp.classList.remove('on-target','off-target'); }
      document.getElementById('phase-progress-fill').style.width = '0%';
      document.getElementById('phase-current').textContent = '0';
      
      const targetText = phase.unit === 'km' ? `${phase.value} km` : 
                         phase.unit === 'm' ? `${phase.value} m` :
                         phase.unit === 'min' ? `${phase.value}:00` :
                         `${phase.value} sec`;
      document.getElementById('phase-target').textContent = targetText;

      const paceTargetEl = document.getElementById('phase-pace-target');
      const paceLabel = paceBandLabel(phase.zone);
      if (paceLabel) {
        paceTargetEl.textContent = `🎯 ${paceLabel}`;
        paceTargetEl.style.display = 'block';
      } else {
        paceTargetEl.style.display = 'none';
      }

      if (countdownInterval) clearInterval(countdownInterval);
      
      if (phase.unit === 'min' || phase.unit === 'sec') {
        phaseTimeRemaining = phase.unit === 'min' ? phase.value * 60 : phase.value;
        phaseStartTime = Date.now();
        countdownInterval = setInterval(updatePhaseCountdown, 1000);
        updatePhaseCountdown();
      }

      updateNextPreview();
      updateNextButton();
    }

    function getZoneDescription(zone) {
      const descriptions = {
        1: 'Recupero / Camminata',
        2: 'Corsa lenta - Aerobico',
        3: 'Ritmo moderato',
        4: 'Ritmo sostenuto - Soglia',
        5: 'Molto forte - VO2max'
      };
      return descriptions[zone] || '';
    }

    function updateNextPreview() {
      const nextIndex = currentPhaseIndex + 1;
      const previewEl = document.getElementById('next-preview-content');
      
      if (nextIndex >= expandedPhases.length) {
        previewEl.textContent = '🏁 Fine workout';
        return;
      }

      const next = expandedPhases[nextIndex];
      let preview = `${next.value} ${next.unit} Z${next.zone}`;
      if (next.description) preview += ` - ${next.description}`;
      if (next._loopRep === 1) preview = `🔄 Loop: ${preview}`;
      
      previewEl.textContent = preview;
    }

    function updateNextButton() {
      const btn = document.getElementById('next-btn');
      if (currentPhaseIndex >= expandedPhases.length - 1) {
        btn.textContent = 'COMPLETA ✓';
        btn.className = 'ctrl-btn complete';
      } else {
        btn.textContent = 'NEXT →';
        btn.className = 'ctrl-btn primary';
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE NAVIGATION
    // ═══════════════════════════════════════════════════════════════════════════
    window.nextPhase = async function() {
      if (currentPhaseIndex >= expandedPhases.length - 1) {
        completeWorkout();
        return;
      }
      
      currentPhaseIndex++;
      phaseStartTime = Date.now();
      lastAnnouncedWarning = {};
      
      renderCurrentPhase();
      
      // Announce new phase
      const phase = expandedPhases[currentPhaseIndex];
      if (phase._loopRep && phase._loopRep > 1) {
        await announceLoopRep(phase._loopRep, phase._loopTotal);
      }
      await announcePhaseStart(phase);
    };

    window.prevPhase = function() {
      if (currentPhaseIndex > 0) {
        currentPhaseIndex--;
        phaseStartTime = Date.now();
        lastAnnouncedWarning = {};
        renderCurrentPhase();
        playBeep();
      }
    };

    window.togglePause = function() {
      isPaused = !isPaused;
      const btn = document.getElementById('pause-btn');
      btn.textContent = isPaused ? '▶️ RIPRENDI' : '⏸️ PAUSA';
      btn.className = isPaused ? 'ctrl-btn primary' : 'ctrl-btn pause';
      
      if (!isPaused) {
        // Resume: adjust phaseStartTime
        phaseStartTime = Date.now() - ((expandedPhases[currentPhaseIndex]?.unit === 'min' ? 
          expandedPhases[currentPhaseIndex].value * 60 : 
          expandedPhases[currentPhaseIndex]?.value || 0) - phaseTimeRemaining) * 1000;
      }
    };

    window.toggleSettings = function() {
      // Future: settings modal
      alert(`Modalità audio: ${getSoundMode()}`);
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // GPS TRACKING
    // ═══════════════════════════════════════════════════════════════════════════
    function startGPS() {
      if (!navigator.geolocation) {
        console.warn('GPS not available');
        return;
      }

      updateGPSStatus('searching');
      
      gpsWatchId = navigator.geolocation.watchPosition(
        handleGPSPosition,
        handleGPSError,
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );

      requestWakeLock();
    }

    function handleGPSPosition(position) {
      if (isPaused) return;
      
      const { latitude, longitude, accuracy } = position.coords;
      updateGPSStatus('active');

      if (accuracy > 50) return;

      if (gpsPositions.length > 0) {
        const last = gpsPositions[gpsPositions.length - 1];
        const dist = calcDistance(last.latitude, last.longitude, latitude, longitude);
        
        if (dist > 1 && dist < 100) {
          totalDistance += dist;
          phaseDistance += dist;
          updateDistanceDisplays();
          checkPhaseCompletion();
        }
      }

      gpsPositions.push({ latitude, longitude, accuracy, timestamp: Date.now() });
      updatePace();
      updateLivePace(latitude, longitude, accuracy);
    }

    function updateLivePace(lat, lon, accuracy) {
      const el = document.getElementById('live-pace');
      const valEl = document.getElementById('live-pace-value');
      if (!el || !valEl) return;

      // No bands -> feature off. Keep readout hidden.
      if (!paceBands) { el.style.display = 'none'; return; }
      el.style.display = 'block';

      const now = Date.now();
      if (typeof accuracy !== 'number' || accuracy <= GPS_ACCURACY_MAX_M) {
        paceWindow.push({ t: now, lat, lon });
      }
      // Drop stale fixes outside the window.
      paceWindow = paceWindow.filter((p) => now - p.t <= PACE_WINDOW_MS);

      const span = paceWindow.length >= 2 ? now - paceWindow[0].t : 0;
      if (span < PACE_MIN_MS) {
        valEl.textContent = '--:--';
        el.classList.remove('on-target', 'off-target');
        return;
      }

      // Distance travelled across the window.
      let meters = 0;
      for (let i = 1; i < paceWindow.length; i++) {
        meters += calcDistance(
          paceWindow[i - 1].lat, paceWindow[i - 1].lon,
          paceWindow[i].lat, paceWindow[i].lon
        );
      }
      if (meters < 1) { valEl.textContent = '--:--'; return; }

      // Pace = seconds per km.
      const secPerKm = (span / 1000) / (meters / 1000);
      valEl.textContent = formatPace(secPerKm);

      // Color vs the current phase's target zone.
      const phase = expandedPhases[currentPhaseIndex];
      const inZone = phase && classifyPace(secPerKm, paceBands) === phase.zone;
      el.classList.toggle('on-target', inZone);
      el.classList.toggle('off-target', !inZone);
    }

    function handleGPSError(error) {
      console.warn('GPS Error:', error.message);
      updateGPSStatus('error');
    }

    function updateGPSStatus(status) {
      const dot = document.getElementById('gps-dot');
      const text = document.getElementById('gps-status-text');
      
      dot.className = 'gps-dot ' + status;
      text.textContent = status === 'active' ? 'GPS ATTIVO' : 
                         status === 'searching' ? 'RICERCA...' : 
                         status === 'error' ? 'ERRORE GPS' : 'GPS OFF';
    }

    function calcDistance(lat1, lon1, lat2, lon2) {
      const R = 6371000;
      const φ1 = lat1 * Math.PI / 180;
      const φ2 = lat2 * Math.PI / 180;
      const Δφ = (lat2 - lat1) * Math.PI / 180;
      const Δλ = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(Δφ/2)**2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2)**2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }

    function updateDistanceDisplays() {
      document.getElementById('gps-distance').textContent = (totalDistance / 1000).toFixed(2);
      
      const phase = expandedPhases[currentPhaseIndex];
      if (phase && (phase.unit === 'km' || phase.unit === 'm')) {
        const targetMeters = phase.unit === 'km' ? phase.value * 1000 : phase.value;
        const progress = Math.min((phaseDistance / targetMeters) * 100, 100);
        const remaining = Math.max(0, targetMeters - phaseDistance);
        
        document.getElementById('phase-progress-fill').style.width = `${progress}%`;
        document.getElementById('phase-current').textContent = 
          phase.unit === 'km' ? (phaseDistance / 1000).toFixed(2) + ' km' : Math.round(phaseDistance) + ' m';
        
        // Announce distance warnings
        announceDistanceWarning(remaining, phase);
      }
    }

    function updatePace() {
      if (!startTime || totalDistance < 100) return;
      
      const elapsedMin = (Date.now() - startTime) / 60000;
      const distKm = totalDistance / 1000;
      
      if (distKm > 0) {
        const pace = elapsedMin / distKm;
        const min = Math.floor(pace);
        const sec = Math.floor((pace % 1) * 60);
        if (min < 30) {
          document.getElementById('gps-pace').textContent = `${min}:${sec.toString().padStart(2, '0')}`;
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // TIMERS
    // ═══════════════════════════════════════════════════════════════════════════
    function updateGlobalTimer() {
      if (isPaused || !startTime) return;
      
      const elapsed = Date.now() - startTime;
      const min = Math.floor(elapsed / 60000);
      const sec = Math.floor((elapsed % 60000) / 1000);
      document.getElementById('gps-time').textContent = 
        `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    }

    function updatePhaseCountdown() {
      if (isPaused) return;
      
      const phase = expandedPhases[currentPhaseIndex];
      if (!phase || (phase.unit !== 'min' && phase.unit !== 'sec')) return;

      const elapsed = Math.floor((Date.now() - phaseStartTime) / 1000);
      const totalSec = phase.unit === 'min' ? phase.value * 60 : phase.value;
      const remaining = Math.max(0, totalSec - elapsed);
      
      phaseTimeRemaining = remaining;
      
      const min = Math.floor(remaining / 60);
      const sec = remaining % 60;
      document.getElementById('phase-current').textContent = 
        `${min}:${sec.toString().padStart(2, '0')}`;
      
      const progress = ((totalSec - remaining) / totalSec) * 100;
      document.getElementById('phase-progress-fill').style.width = `${progress}%`;
      
      // Announce time warnings
      announceTimeWarning(remaining, phase);
      
      if (remaining <= 0) {
        clearInterval(countdownInterval);
        playTransition();
        vibrate();
        
        setTimeout(() => {
          if (!isPaused && currentPhaseIndex < expandedPhases.length - 1) {
            nextPhase();
          } else if (currentPhaseIndex >= expandedPhases.length - 1) {
            completeWorkout();
          }
        }, 500);
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE COMPLETION CHECK
    // ═══════════════════════════════════════════════════════════════════════════
    function checkPhaseCompletion() {
      const phase = expandedPhases[currentPhaseIndex];
      if (!phase || isPaused) return;

      if (phase.unit === 'km' || phase.unit === 'm') {
        const targetMeters = phase.unit === 'km' ? phase.value * 1000 : phase.value;
        
        if (phaseDistance >= targetMeters) {
          playTransition();
          vibrate();
          
          setTimeout(() => {
            if (!isPaused && currentPhaseIndex < expandedPhases.length - 1) {
              nextPhase();
            } else if (currentPhaseIndex >= expandedPhases.length - 1) {
              completeWorkout();
            }
          }, 500);
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // WORKOUT COMPLETION
    // ═══════════════════════════════════════════════════════════════════════════
    async function completeWorkout() {
      if (gpsWatchId) {
        navigator.geolocation.clearWatch(gpsWatchId);
        gpsWatchId = null;
      }
      if (timerInterval) clearInterval(timerInterval);
      if (countdownInterval) clearInterval(countdownInterval);
      if (wakeLock) { wakeLock.release(); wakeLock = null; }

      document.getElementById('final-distance').textContent = (totalDistance / 1000).toFixed(2) + ' km';
      
      if (startTime) {
        const elapsed = Date.now() - startTime;
        const min = Math.floor(elapsed / 60000);
        const sec = Math.floor((elapsed % 60000) / 1000);
        document.getElementById('final-time').textContent = 
          `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
      }

      if (v7PlanInfo) {
        savePlanProgress();
      }

      showView('completion-view');
      await announceCompletion();
    }

    function savePlanProgress() {
      const progressKey = `viltrum_plan_progress_${v7PlanInfo.planName}`;
      const progress = {
        lastWorkoutIndex: v7PlanInfo.workoutIndex,
        totalWorkouts: v7PlanInfo.totalWorkouts,
        lastUpdated: new Date().toISOString()
      };
      localStorage.setItem(progressKey, JSON.stringify(progress));

      const email = localStorage.getItem('loggedUser');
      if (email) {
        const url = `${GOOGLE_SCRIPT_URL}?action=saveLastWorkout&email=${encodeURIComponent(email)}&planName=${encodeURIComponent(v7PlanInfo.planName)}&lastWorkoutIndex=${v7PlanInfo.workoutIndex}&totalWorkouts=${v7PlanInfo.totalWorkouts}`;
        fetch(url).catch(e => console.warn('Cloud sync failed:', e));
      }

      sessionStorage.removeItem('currentWorkout');
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // NAVIGATION
    // ═══════════════════════════════════════════════════════════════════════════
    window.goBack = function() {
      const workoutView = document.getElementById('workout-view');
      
      if (workoutView.classList.contains('active')) {
        if (confirm('Vuoi uscire dal workout?')) {
          cleanup();
          if (v7PlanInfo) {
            sessionStorage.removeItem('currentWorkout');
            window.location.href = 'plan-view.html';
          } else {
            showView('selector-view');
          }
        }
      } else {
        window.location.href = 'dashboard-v7.html';
      }
    };

    window.goBackToDashboard = function() {
      cleanup();
      if (v7PlanInfo) {
        window.location.href = 'plan-view.html';
      } else {
        window.location.href = 'dashboard-v7.html';
      }
    };

    function cleanup() {
      if (gpsWatchId) { navigator.geolocation.clearWatch(gpsWatchId); gpsWatchId = null; }
      if (timerInterval) clearInterval(timerInterval);
      if (countdownInterval) clearInterval(countdownInterval);
      if (wakeLock) { wakeLock.release(); wakeLock = null; }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // UTILITIES
    // ═══════════════════════════════════════════════════════════════════════════
    function vibrate(pattern = 200) {
      if (navigator.vibrate) navigator.vibrate(pattern);
    }

    async function requestWakeLock() {
      if ('wakeLock' in navigator) {
        try {
          wakeLock = await navigator.wakeLock.request('screen');
        } catch (e) {
          console.warn('Wake lock failed:', e);
        }
      }
    }

    // Keyboard controls
    document.addEventListener('keydown', (e) => {
      if (!currentWorkout) return;
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') { e.preventDefault(); nextPhase(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); prevPhase(); }
      else if (e.key === 'p') { togglePause(); }
      else if (e.key === 'Escape') { goBack(); }
    });

    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState === 'visible' && currentWorkout && !isPaused) {
        requestWakeLock();
      }
    });

    // Initialize - handle case where DOMContentLoaded already fired (module scripts are deferred)
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  