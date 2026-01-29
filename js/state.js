// ═══════════════════════════════════════════════════════════════════════════
// VILTRUM FITNESS - STATE MANAGEMENT
// Centralized state management for the application
// ═══════════════════════════════════════════════════════════════════════════

// Workout State
export let workouts = {};
export let selectedWorkout = {};
export let currentStep = 0;
export let interval = null;
export let isPaused = false;
export let savedTimeLeft = null;
export let lastSpeakTime = 0;
export let currentSpeakId = 0;

// Screen Wake Lock
export let wakeLock = null;
export let iosWakeLockVideo = null;

// Training Selector State
export let selectedTrainingType = null;

// Audio State
export let synthVoicesLocked = {};
export let __synthPrimed = false;
export let nextPreviewShown = false;

// Functions to update state
export function setWorkouts(value) { workouts = value; }
export function setSelectedWorkout(value) { selectedWorkout = value; }
export function setCurrentStep(value) { currentStep = value; }
export function setInterval(value) { interval = value; }
export function setIsPaused(value) { isPaused = value; }
export function setSavedTimeLeft(value) { savedTimeLeft = value; }
export function setLastSpeakTime(value) { lastSpeakTime = value; }
export function setCurrentSpeakId(value) { currentSpeakId = value; }
export function setWakeLock(value) { wakeLock = value; }
export function setIOSWakeLockVideo(value) { iosWakeLockVideo = value; }
export function setSelectedTrainingType(value) { selectedTrainingType = value; }
export function setSynthVoicesLocked(value) { synthVoicesLocked = value; }
export function setSynthPrimed(value) { __synthPrimed = value; }
export function setNextPreviewShown(value) { nextPreviewShown = value; }

// Clear interval
export function clearWorkoutInterval() {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
}

// Reset workout state
export function resetWorkoutState() {
  clearWorkoutInterval();
  currentStep = 0;
  isPaused = false;
  savedTimeLeft = null;
  nextPreviewShown = false;
}
