// ═══════════════════════════════════════════════════════════════════════════
// VILTRUM FITNESS - CONFIGURATION
// Centralized configuration constants for the application
// ═══════════════════════════════════════════════════════════════════════════

// Supabase Configuration
export const SUPABASE_URL = 'https://nvdrvqamxoqezmfrnjcw.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im52ZHJ2cWFteG9xZXptZnJuamN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI2NDA3NjIsImV4cCI6MjA3ODIxNjc2Mn0.xyxX2L2mDto9hyWBsEGOqL1Ip73thC8E81V54UAKNEg';

// Google Apps Script URL
// ⚠️ SINGLE SOURCE OF TRUTH - Change this URL here and it updates everywhere
export const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxTRdahX5GlIigMfrqIQyxnn198K5-oi69m30aMI6zrCV9yeC70wjHB5x_aqZm4g4L6DA/exec';

// TTS Server Configuration
export const TTS_SERVER_URL = 'https://google-tts-server.onrender.com';

// Viewport Configuration (iOS Safari optimization)
export const VIEWPORT_CONFIG = {
  UPDATE_DELAYS: {
    FIRST: 250,
    SECOND: 750
  },
  CAROUSEL: {
    MIN_HEIGHT: 140,
    MAX_HEIGHT: 280,
    HEIGHT_PERCENTAGE: 0.45
  },
  TRAINING: {
    IMAGE_HEIGHT_PERCENTAGE: 0.42
  }
};

// Audio Timing Configuration
export const AUDIO_CUES = {
  LONG_WARNING: 60,
  MEDIUM_WARNING: 30,
  SHORT_WARNING: 10,
  FINAL_WARNING: 5
};

// Access Level Configuration
export const ACCESS_LEVELS = {
  NO_ACCESS: 'no_access',
  TRIAL: 'trial',
  EXPIRED: 'expired',
  ACTIVE: 'active'
};

export const TRIAL_DURATION_DAYS = 7;

// Synth Voice Preferences
export const SYNTH_PREFS = {
  "it-IT": ["Siri Voice 4", "Siri Voice 3", "Google italiano", "Microsoft Elsa", "Microsoft Lucia"],
  "en-US": ["Siri Voice 3", "Siri Voice 2", "Google US English", "Microsoft Aria", "Microsoft Jenny"]
};

// Bepe Audio Links
export const BEPE_SOUNDS = {
  "10 secondi": "https://drive.google.com/uc?export=download&id=1-2dqINBt35N2IhG3eMcaB0hBMExzQW9x",
  "30 secondi": "https://drive.google.com/uc?export=download&id=1-2sB5wZtT5HoWrO70FVvN0n2Gd7xhO05",
  "60 secondi": "https://drive.google.com/uc?export=download&id=1-31UkKwvGfKUv8FkBW0oeqHSa-z8wnq-",
  "5 secondi": "https://drive.google.com/uc?export=download&id=1-7b8x0kl61S4hZd1WhSXeW6gKz68W0S3",
  "ancora 10 secondi": "https://drive.google.com/uc?export=download&id=1-8_LY7-YmaDxiZHI6jgKALr3nO7N1e2M",
  "ancora 30 secondi": "https://drive.google.com/uc?export=download&id=1-BQF0f5z_y0Lnr3NxQCaCjhGOLsyqAMZ",
  "ancora 5 secondi": "https://drive.google.com/uc?export=download&id=1-DH6xGJN5e7G2Gzp3_Mn8YL8nJ2EBjAY",
  "fai 10 ripetizioni": "https://drive.google.com/uc?export=download&id=1-ENYiDyWuHqD0_6yOHoI7-IXmyC1VvAD",
  "fai 12 ripetizioni": "https://drive.google.com/uc?export=download&id=1-F_w2UlFaM3LbGuH5SRr8NXh1b8YIDwA",
  "fai 15 ripetizioni": "https://drive.google.com/uc?export=download&id=1-FpwqyG3Sk6KF6xBl3bkLJfYbA-DGBQP",
  "fai 20 ripetizioni": "https://drive.google.com/uc?export=download&id=1-G2wq9HK9bL_Q0YhORXB9-BZqVoGYVHb",
  "fai 3 serie": "https://drive.google.com/uc?export=download&id=1-GJj_MxXfkZF6bGvLNhZbKWxnM8t8c3G",
  "fai 5 ripetizioni": "https://drive.google.com/uc?export=download&id=1-GLiuR6QWjBKtx5TajT8d5yv-u8MYEy0",
  "fai 6 ripetizioni": "https://drive.google.com/uc?export=download&id=1-GigjMR7PmGCqw3P2W3qUK7CYM6-pEhA",
  "fai 8 ripetizioni": "https://drive.google.com/uc?export=download&id=1-Gy4YEtFNsV2r0qZ8vqICjlVIpOtQ3MZ",
  "ottimo lavoro": "https://drive.google.com/uc?export=download&id=1-HxBR4O0J2CjcTvCt_qRzLR2Bb3ePn67",
  "preparati": "https://drive.google.com/uc?export=download&id=1-I0qCjnx5L2q3R4YZ5sVLK8dMxPnQhxq",
  "prossimo esercizio": "https://drive.google.com/uc?export=download&id=1-I2YBjE6T7S8uJvW0xZAaLZcN9qTmRpz"
};