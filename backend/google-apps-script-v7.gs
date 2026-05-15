// Google Apps Script - Viltrum Fitness V7
// Version 7.0.0 - Plans System + Combined Muscle/Run Workouts
// 
// STRUTTURA FOGLI RICHIESTI:
// - Exercises: libreria esercizi con immagini e audio
// - Workouts: definizione workout forza (muscle)
// - Instructions: istruzioni per workout forza
// - RunWorkouts: definizione workout corsa (run)
// - Plans: definizione piani (PlanName | Workout1 | Workout2 | ...)
// - Users: utenti con piani assegnati (Utente | Email | NutritionPDF | NutritionScadenza | Scadenza | Plan1 | Plan2 | ...)
// - UserWeights: pesi salvati per esercizi
// - UserProgress: progresso per piano (Email | PlanName | LastWorkoutIndex | TotalWorkouts | LastUpdated)

function doGet(e) {
  Logger.log("=== doGet called V7 ===");
  
  // Check if this is an action request
  if (e && e.parameter) {
    const action = e.parameter.action;
    
    if (action === 'addTrialUser') {
      return addTrialUser({ email: e.parameter.email, name: e.parameter.name });
    }
    
    if (action === 'saveWeights') {
      return saveUserWeights(e.parameter);
    }
    
    if (action === 'getWeights') {
      return getUserWeights(e.parameter);
    }
    
    // V7: Progress now includes planName
    if (action === 'saveLastWorkout') {
      Logger.log(">>> saveLastWorkout: email=" + e.parameter.email + ", plan=" + e.parameter.planName + ", index=" + e.parameter.lastWorkoutIndex);
      return saveLastWorkout(e.parameter);
    }
    
    if (action === 'getLastWorkout') {
      return getLastWorkout(e.parameter);
    }
    
    // V7: Get all progress for a user (all plans)
    if (action === 'getAllProgress') {
      return getAllUserProgress(e.parameter);
    }
    
    // V7.1: Get only data for specific user (FAST endpoint)
    if (action === 'getUserData') {
      return getUserDataFast(e.parameter);
    }
    
    // V8.2: Light endpoint — user info, plan names, progress only (dashboard)
    if (action === 'getUserInfo') {
      return getUserInfoLight(e.parameter);
    }
    
    // V8.2: Heavy endpoint — exercises, workouts, instructions (training)
    if (action === 'getWorkoutData') {
      return getWorkoutDataHeavy(e.parameter);
    }
  }
  
  // Otherwise, return all data
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // ═══════════════════════════════════════════════════════════════════════════
  // LOAD EXERCISES LIBRARY
  // ═══════════════════════════════════════════════════════════════════════════
  const exerciseSheet = ss.getSheetByName("Exercises");
  const exerciseData = exerciseSheet.getDataRange().getValues();
  const exerciseLibrary = {};

  for (let i = 1; i < exerciseData.length; i++) {
    const exerciseName = (exerciseData[i][0] || "").toString().trim();
    if (!exerciseName) continue;
    exerciseLibrary[exerciseName] = {
      imageUrl: exerciseData[i][5] || "",
      audio: exerciseData[i][8] || "",
      audioCambio: exerciseData[i][9] || ""
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LOAD MUSCLE WORKOUTS
  // ═══════════════════════════════════════════════════════════════════════════
  const workoutSheet = ss.getSheetByName("Workouts");
  const workoutData = workoutSheet.getDataRange().getValues();
  const workouts = {};

  for (let i = 1; i < workoutData.length; i++) {
    const row = workoutData[i];
    const workoutName = (row[0] || "").toString().trim();
    const block = (row[1] || "").toString().trim();
    const exercise = (row[2] || "").toString().trim();
    const fullDur = parseInt(row[3]) || 0;
    const tipoDiPeso = (row[4] || "").toString().trim();
    const rounds = parseInt(row[5]) || 1;
    const reps = (row[6] || "").toString().trim();

    if (!workoutName || !exercise || isNaN(fullDur)) continue;

    if (!workouts[workoutName]) {
      workouts[workoutName] = { exercises: [], instructions: "" };
    }

    const exerciseInfo = exerciseLibrary[exercise] || {};
    workouts[workoutName].exercises.push({
      name: exercise,
      duration: fullDur,
      imageUrl: exerciseInfo.imageUrl || "",
      block: block,
      tipoDiPeso: tipoDiPeso,
      rounds: rounds,
      reps: reps,
      audio: exerciseInfo.audio || "",
      audioCambio: exerciseInfo.audioCambio || ""
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LOAD INSTRUCTIONS FOR MUSCLE WORKOUTS
  // ═══════════════════════════════════════════════════════════════════════════
  const instructionSheet = ss.getSheetByName("Instructions");
  if (instructionSheet) {
    const instructionData = instructionSheet.getDataRange().getValues();
    for (let j = 1; j < instructionData.length; j++) {
      const [name, instruction] = instructionData[j];
      if (workouts[name]) {
        workouts[name].instructions = instruction;
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LOAD RUN WORKOUTS
  // ═══════════════════════════════════════════════════════════════════════════
  const runSheet = ss.getSheetByName("RunWorkouts");
  const runWorkouts = {};

  if (runSheet) {
    const runData = runSheet.getDataRange().getValues();
    // Headers: WorkoutName | LineIndex | LineText | Section | AudioKey
    for (let i = 1; i < runData.length; i++) {
      const row = runData[i];
      const workoutName = (row[0] || "").toString().trim();
      const lineIndex = parseInt(row[1]) || 0;
      const lineText = (row[2] || "").toString().trim();
      const section = (row[3] || "").toString().trim();
      const audioKey = (row[4] || "").toString().trim();

      if (!workoutName || !lineText) continue;

      if (!runWorkouts[workoutName]) {
        runWorkouts[workoutName] = { lines: [] };
      }

      runWorkouts[workoutName].lines.push({
        index: lineIndex,
        text: lineText,
        section: section,
        audioKey: audioKey
      });
    }

    // Sort lines by LineIndex
    Object.keys(runWorkouts).forEach(name => {
      runWorkouts[name].lines.sort((a, b) => (a.index || 0) - (b.index || 0));
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LOAD PLANS (V7 NEW)
  // ═══════════════════════════════════════════════════════════════════════════
  const plansSheet = ss.getSheetByName("Plans");
  const plans = {};

  if (plansSheet) {
    const plansData = plansSheet.getDataRange().getValues();
    // Headers: PlanName | Workout1 | Workout2 | Workout3 | ...
    
    for (let i = 1; i < plansData.length; i++) {
      const row = plansData[i];
      const planName = (row[0] || "").toString().trim();
      
      if (!planName) continue;
      
      const planWorkouts = [];
      
      // Read all workout columns (starting from column 1)
      for (let col = 1; col < row.length; col++) {
        const workoutName = (row[col] || "").toString().trim();
        
        // Skip empty cells and date-like values
        if (!workoutName || isDate(workoutName)) continue;
        
        // Determine workout type by checking which library contains it
        let workoutType = null;
        if (workouts[workoutName]) {
          workoutType = "muscle";
        } else if (runWorkouts[workoutName]) {
          workoutType = "run";
        } else {
          // Unknown workout - log warning but still include
          Logger.log("WARNING: Workout '" + workoutName + "' in plan '" + planName + "' not found in Workouts or RunWorkouts");
          workoutType = "unknown";
        }
        
        planWorkouts.push({
          index: planWorkouts.length + 1,
          name: workoutName,
          type: workoutType
        });
      }
      
      plans[planName] = {
        workouts: planWorkouts,
        totalWorkouts: planWorkouts.length
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LOAD USERS (V7 MODIFIED - reads plans instead of workouts)
  // ═══════════════════════════════════════════════════════════════════════════
  const userSheet = ss.getSheetByName("Users");
  const userData = userSheet.getDataRange().getValues();
  const userWorkouts = {};
  const headers = userData[0];
  
  // Find column indices
  let nameCol = 0, emailCol = 1, nutritionPdfCol = 2, nutritionScadenzaCol = 3, scadenzaCol = 4, firstPlanCol = 5;
  
  for (let h = 0; h < headers.length; h++) {
    const header = (headers[h] || "").toString().toLowerCase().trim();
    if (header === "utente" || header === "nome" || header === "name") nameCol = h;
    else if (header === "email" || header === "e-mail") emailCol = h;
    else if (header.includes("nutrition") && header.includes("pdf")) nutritionPdfCol = h;
    else if (header.includes("nutrition") && header.includes("scadenza")) nutritionScadenzaCol = h;
    else if (header === "scadenza" || header === "expiration" || header === "expires") {
      scadenzaCol = h;
      firstPlanCol = h + 1;
    }
  }

  for (let k = 1; k < userData.length; k++) {
    const row = userData[k];
    const fullName = (row[nameCol] || "").toString().trim();
    const userEmail = (row[emailCol] || "").toString().trim().toLowerCase();
    const nutritionPdfUrl = (row[nutritionPdfCol] || "").toString().trim();
    const nutritionScadenza = row[nutritionScadenzaCol] || "";
    const scadenza = row[scadenzaCol] || "";
    
    if (!userEmail) continue;
    
    // V7: Read plans instead of individual workouts
    const userPlans = [];
    for (let col = firstPlanCol; col < row.length; col++) {
      const planName = (row[col] || "").toString().trim();
      // Only add if it's a valid plan name (exists in plans object)
      if (planName && !isDate(planName) && plans[planName]) {
        userPlans.push(planName);
      }
    }
    
    userWorkouts[userEmail] = {
      fullName: fullName,
      scadenza: scadenza,
      nutritionPdfUrl: nutritionPdfUrl,
      nutritionScadenza: nutritionScadenza,
      plans: userPlans  // V7: Changed from 'workouts' to 'plans'
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RETURN ALL DATA
  // ═══════════════════════════════════════════════════════════════════════════
  return ContentService
    .createTextOutput(JSON.stringify({ 
      workouts: workouts,           // Muscle workout definitions
      runWorkouts: runWorkouts,     // Run workout definitions
      plans: plans,                 // Plan definitions with workout sequences
      userWorkouts: userWorkouts    // User data with assigned plans
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

function isDate(value) {
  if (!value) return false;
  if (value instanceof Date) return true;
  const str = value.toString();
  return str.match(/^\d{1,2}\/\d{1,2}\/\d{4}/) || str.match(/\d{4}-\d{2}-\d{2}/) || str.toLowerCase().includes('gmt');
}

// ═══════════════════════════════════════════════════════════════════════════
// FAST USER DATA ENDPOINT (V7.1)
// Returns only data for a specific user - much faster than loading everything
// ═══════════════════════════════════════════════════════════════════════════

function getUserDataFast(params) {
  const startTime = new Date();
  const email = (params.email || "").trim().toLowerCase();
  
  if (!email || !email.includes('@')) {
    return createResponse({ status: 'error', message: 'Invalid email' });
  }
  
  Logger.log("getUserDataFast for: " + email);
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. Get user info
  const userSheet = ss.getSheetByName("Users");
  const userData = userSheet.getDataRange().getValues();
  const headers = userData[0];
  
  // Find column indices
  let nameCol = 0, emailCol = 1, nutritionPdfCol = 2, nutritionScadenzaCol = 3, scadenzaCol = 4, firstPlanCol = 5;
  
  for (let h = 0; h < headers.length; h++) {
    const header = (headers[h] || "").toString().toLowerCase().trim();
    if (header === "utente" || header === "nome" || header === "name") nameCol = h;
    else if (header === "email" || header === "e-mail") emailCol = h;
    else if (header.includes("nutrition") && header.includes("pdf")) nutritionPdfCol = h;
    else if (header.includes("nutrition") && header.includes("scadenza")) nutritionScadenzaCol = h;
    else if (header === "scadenza" || header === "expiration" || header === "expires") {
      scadenzaCol = h;
      firstPlanCol = h + 1;
    }
  }
  
  // Find user row
  let userInfo = null;
  let userPlanNames = [];
  
  for (let k = 1; k < userData.length; k++) {
    const row = userData[k];
    const rowEmail = (row[emailCol] || "").toString().trim().toLowerCase();
    
    if (rowEmail === email) {
      userInfo = {
        fullName: (row[nameCol] || "").toString().trim(),
        scadenza: row[scadenzaCol] || "",
        nutritionPdfUrl: (row[nutritionPdfCol] || "").toString().trim(),
        nutritionScadenza: row[nutritionScadenzaCol] || ""
      };
      
      // Get user's plan names
      for (let col = firstPlanCol; col < row.length; col++) {
        const planName = (row[col] || "").toString().trim();
        if (planName && !isDate(planName)) {
          userPlanNames.push(planName);
        }
      }
      break;
    }
  }
  
  if (!userInfo) {
    return createResponse({ status: 'error', message: 'User not found' });
  }
  
  // 2. Load Plans sheet to get workout sequences for user's plans
  const plansSheet = ss.getSheetByName("Plans");
  const plans = {};
  
  if (plansSheet && userPlanNames.length > 0) {
    const plansData = plansSheet.getDataRange().getValues();
    
    for (let i = 1; i < plansData.length; i++) {
      const row = plansData[i];
      const planName = (row[0] || "").toString().trim();
      
      // Only load plans assigned to this user
      if (!planName || !userPlanNames.includes(planName)) continue;
      
      const planWorkouts = [];
      for (let col = 1; col < row.length; col++) {
        const workoutName = (row[col] || "").toString().trim();
        if (!workoutName || isDate(workoutName)) continue;
        
        planWorkouts.push({
          index: planWorkouts.length + 1,
          name: workoutName,
          type: "unknown" // Will be determined when loading workout
        });
      }
      
      plans[planName] = {
        workouts: planWorkouts,
        totalWorkouts: planWorkouts.length
      };
    }
  }
  
  // 3. Get list of all workout names needed
  const neededWorkouts = new Set();
  for (const planName in plans) {
    plans[planName].workouts.forEach(w => neededWorkouts.add(w.name));
  }
  
  // 4. Load only needed muscle workouts
  const workouts = {};
  const exerciseLibrary = loadExerciseLibrary(ss);
  
  if (neededWorkouts.size > 0) {
    const workoutSheet = ss.getSheetByName("Workouts");
    const workoutData = workoutSheet.getDataRange().getValues();
    
    for (let i = 1; i < workoutData.length; i++) {
      const row = workoutData[i];
      const workoutName = (row[0] || "").toString().trim();
      
      if (!neededWorkouts.has(workoutName)) continue;
      
      const block = (row[1] || "").toString().trim();
      const exercise = (row[2] || "").toString().trim();
      const fullDur = parseInt(row[3]) || 0;
      const tipoDiPeso = (row[4] || "").toString().trim();
      const rounds = parseInt(row[5]) || 1;
      const reps = (row[6] || "").toString().trim();
      
      if (!workoutName || !exercise || isNaN(fullDur)) continue;
      
      if (!workouts[workoutName]) {
        workouts[workoutName] = { exercises: [], instructions: "" };
      }
      
      const exerciseInfo = exerciseLibrary[exercise] || {};
      workouts[workoutName].exercises.push({
        name: exercise,
        duration: fullDur,
        imageUrl: exerciseInfo.imageUrl || "",
        block: block,
        tipoDiPeso: tipoDiPeso,
        rounds: rounds,
        reps: reps,
        audio: exerciseInfo.audio || "",
        audioCambio: exerciseInfo.audioCambio || ""
      });
    }
    
    // Load instructions for these workouts
    const instructionSheet = ss.getSheetByName("Instructions");
    if (instructionSheet) {
      const instructionData = instructionSheet.getDataRange().getValues();
      for (let j = 1; j < instructionData.length; j++) {
        const [name, instruction] = instructionData[j];
        if (workouts[name]) {
          workouts[name].instructions = instruction;
        }
      }
    }
  }
  
  // 5. Load only needed run workouts
  const runWorkouts = {};
  const runSheet = ss.getSheetByName("RunWorkouts");
  
  if (runSheet && neededWorkouts.size > 0) {
    const runData = runSheet.getDataRange().getValues();
    
    for (let i = 1; i < runData.length; i++) {
      const row = runData[i];
      const workoutName = (row[0] || "").toString().trim();
      
      if (!neededWorkouts.has(workoutName)) continue;
      
      const lineIndex = parseInt(row[1]) || 0;
      const lineText = (row[2] || "").toString().trim();
      const section = (row[3] || "").toString().trim();
      const audioKey = (row[4] || "").toString().trim();
      
      if (!workoutName || !lineText) continue;
      
      if (!runWorkouts[workoutName]) {
        runWorkouts[workoutName] = { lines: [] };
      }
      
      runWorkouts[workoutName].lines.push({
        index: lineIndex,
        text: lineText,
        section: section,
        audioKey: audioKey
      });
    }
    
    // Sort lines
    Object.keys(runWorkouts).forEach(name => {
      runWorkouts[name].lines.sort((a, b) => (a.index || 0) - (b.index || 0));
    });
  }
  
  // 6. Update workout types in plans
  for (const planName in plans) {
    plans[planName].workouts.forEach(w => {
      if (workouts[w.name]) w.type = "muscle";
      else if (runWorkouts[w.name]) w.type = "run";
    });
  }
  
  // 7. Get user progress
  const progressSheet = ss.getSheetByName("UserProgress");
  const userProgress = {};
  
  if (progressSheet) {
    const progressData = progressSheet.getDataRange().getValues();
    for (let i = 1; i < progressData.length; i++) {
      const rowEmail = (progressData[i][0] || "").toString().trim().toLowerCase();
      if (rowEmail === email) {
        const planName = (progressData[i][1] || "").toString().trim();
        userProgress[planName] = {
          lastWorkoutIndex: parseInt(progressData[i][2]) || 0,
          totalWorkouts: parseInt(progressData[i][3]) || 0,
          lastUpdated: progressData[i][4] || null
        };
      }
    }
  }
  
  const duration = new Date() - startTime;
  Logger.log("getUserDataFast completed in " + duration + "ms");
  
  return ContentService
    .createTextOutput(JSON.stringify({
      status: 'success',
      user: {
        email: email,
        fullName: userInfo.fullName,
        scadenza: userInfo.scadenza,
        nutritionPdfUrl: userInfo.nutritionPdfUrl,
        nutritionScadenza: userInfo.nutritionScadenza,
        plans: userPlanNames
      },
      plans: plans,
      workouts: workouts,
      runWorkouts: runWorkouts,
      progress: userProgress,
      loadTime: duration
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

// Helper function to load exercise library
function loadExerciseLibrary(ss) {
  const exerciseSheet = ss.getSheetByName("Exercises");
  const exerciseData = exerciseSheet.getDataRange().getValues();
  const exerciseLibrary = {};
  
  for (let i = 1; i < exerciseData.length; i++) {
    const exerciseName = (exerciseData[i][0] || "").toString().trim();
    if (!exerciseName) continue;
    exerciseLibrary[exerciseName] = {
      imageUrl: exerciseData[i][5] || "",
      audio: exerciseData[i][8] || "",
      audioCambio: exerciseData[i][9] || ""
    };
  }
  
  return exerciseLibrary;
}

// ═══════════════════════════════════════════════════════════════════════════
// V8.2: SPLIT ENDPOINTS — Light (dashboard) + Heavy (training)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Helper: reads Users sheet and returns user info + plan names.
 * Shared by getUserInfoLight and getWorkoutDataHeavy.
 */
function _readUserRow(ss, email) {
  const userSheet = ss.getSheetByName("Users");
  const userData = userSheet.getDataRange().getValues();
  const headers = userData[0];

  let nameCol = 0, emailCol = 1, nutritionPdfCol = 2, nutritionScadenzaCol = 3, scadenzaCol = 4, firstPlanCol = 5;

  for (let h = 0; h < headers.length; h++) {
    const header = (headers[h] || "").toString().toLowerCase().trim();
    if (header === "utente" || header === "nome" || header === "name") nameCol = h;
    else if (header === "email" || header === "e-mail") emailCol = h;
    else if (header.includes("nutrition") && header.includes("pdf")) nutritionPdfCol = h;
    else if (header.includes("nutrition") && header.includes("scadenza")) nutritionScadenzaCol = h;
    else if (header === "scadenza" || header === "expiration" || header === "expires") {
      scadenzaCol = h;
      firstPlanCol = h + 1;
    }
  }

  for (let k = 1; k < userData.length; k++) {
    const row = userData[k];
    if ((row[emailCol] || "").toString().trim().toLowerCase() === email) {
      const userPlanNames = [];
      for (let col = firstPlanCol; col < row.length; col++) {
        const planName = (row[col] || "").toString().trim();
        if (planName && !isDate(planName)) userPlanNames.push(planName);
      }
      return {
        info: {
          fullName: (row[nameCol] || "").toString().trim(),
          scadenza: row[scadenzaCol] || "",
          nutritionPdfUrl: (row[nutritionPdfCol] || "").toString().trim(),
          nutritionScadenza: row[nutritionScadenzaCol] || ""
        },
        planNames: userPlanNames
      };
    }
  }
  return null;
}

/**
 * V8.2 LIGHT: User info + plan workout names + progress.
 * Reads only: Users, Plans, UserProgress (3 small sheets).
 * Dashboard needs nothing more.
 */
function getUserInfoLight(params) {
  const startTime = new Date();
  const email = (params.email || "").trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return createResponse({ status: 'error', message: 'Invalid email' });
  }

  Logger.log("getUserInfoLight for: " + email);
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. User row
  const userRow = _readUserRow(ss, email);
  if (!userRow) return createResponse({ status: 'error', message: 'User not found' });

  // 2. Plans — workout names + counts (no exercise details)
  const plans = {};
  const plansSheet = ss.getSheetByName("Plans");
  if (plansSheet && userRow.planNames.length > 0) {
    const plansData = plansSheet.getDataRange().getValues();
    for (let i = 1; i < plansData.length; i++) {
      const planName = (plansData[i][0] || "").toString().trim();
      if (!planName || !userRow.planNames.includes(planName)) continue;
      const planWorkouts = [];
      for (let col = 1; col < plansData[i].length; col++) {
        const wn = (plansData[i][col] || "").toString().trim();
        if (!wn || isDate(wn)) continue;
        planWorkouts.push({ index: planWorkouts.length + 1, name: wn, type: "unknown" });
      }
      plans[planName] = { workouts: planWorkouts, totalWorkouts: planWorkouts.length };
    }
  }

  // 3. Progress
  const userProgress = {};
  const progressSheet = ss.getSheetByName("UserProgress");
  if (progressSheet) {
    const progressData = progressSheet.getDataRange().getValues();
    for (let i = 1; i < progressData.length; i++) {
      if ((progressData[i][0] || "").toString().trim().toLowerCase() === email) {
        const pn = (progressData[i][1] || "").toString().trim();
        userProgress[pn] = {
          lastWorkoutIndex: parseInt(progressData[i][2]) || 0,
          totalWorkouts: parseInt(progressData[i][3]) || 0,
          lastUpdated: progressData[i][4] || null
        };
      }
    }
  }

  const duration = new Date() - startTime;
  Logger.log("getUserInfoLight completed in " + duration + "ms");

  return ContentService
    .createTextOutput(JSON.stringify({
      status: 'success',
      user: {
        email: email,
        fullName: userRow.info.fullName,
        scadenza: userRow.info.scadenza,
        nutritionPdfUrl: userRow.info.nutritionPdfUrl,
        nutritionScadenza: userRow.info.nutritionScadenza,
        plans: userRow.planNames
      },
      plans: plans,
      progress: userProgress,
      loadTime: duration
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * V8.2 HEAVY: Full workout definitions (exercises, images, audio, instructions, runs).
 * Reads: Exercises, Workouts, Instructions, RunWorkouts.
 * Called in background after dashboard is already visible.
 */
function getWorkoutDataHeavy(params) {
  const startTime = new Date();
  const email = (params.email || "").trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return createResponse({ status: 'error', message: 'Invalid email' });
  }

  Logger.log("getWorkoutDataHeavy for: " + email);
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. Re-read user to get plan names (cheap, ~200ms)
  const userRow = _readUserRow(ss, email);
  if (!userRow) return createResponse({ status: 'error', message: 'User not found' });

  // 2. Get workout names from Plans sheet
  const neededWorkouts = new Set();
  const plans = {};
  const plansSheet = ss.getSheetByName("Plans");
  if (plansSheet && userRow.planNames.length > 0) {
    const plansData = plansSheet.getDataRange().getValues();
    for (let i = 1; i < plansData.length; i++) {
      const planName = (plansData[i][0] || "").toString().trim();
      if (!planName || !userRow.planNames.includes(planName)) continue;
      const planWorkouts = [];
      for (let col = 1; col < plansData[i].length; col++) {
        const wn = (plansData[i][col] || "").toString().trim();
        if (!wn || isDate(wn)) continue;
        planWorkouts.push({ index: planWorkouts.length + 1, name: wn, type: "unknown" });
        neededWorkouts.add(wn);
      }
      plans[planName] = { workouts: planWorkouts, totalWorkouts: planWorkouts.length };
    }
  }

  // 3. Exercise library
  const exerciseLibrary = loadExerciseLibrary(ss);

  // 4. Muscle workouts
  const workouts = {};
  if (neededWorkouts.size > 0) {
    const workoutSheet = ss.getSheetByName("Workouts");
    const workoutData = workoutSheet.getDataRange().getValues();
    for (let i = 1; i < workoutData.length; i++) {
      const row = workoutData[i];
      const workoutName = (row[0] || "").toString().trim();
      if (!neededWorkouts.has(workoutName)) continue;
      const exercise = (row[2] || "").toString().trim();
      const fullDur = parseInt(row[3]) || 0;
      if (!workoutName || !exercise || isNaN(fullDur)) continue;
      if (!workouts[workoutName]) workouts[workoutName] = { exercises: [], instructions: "" };
      const exerciseInfo = exerciseLibrary[exercise] || {};
      workouts[workoutName].exercises.push({
        name: exercise,
        duration: fullDur,
        imageUrl: exerciseInfo.imageUrl || "",
        block: (row[1] || "").toString().trim(),
        tipoDiPeso: (row[4] || "").toString().trim(),
        rounds: parseInt(row[5]) || 1,
        reps: (row[6] || "").toString().trim(),
        audio: exerciseInfo.audio || "",
        audioCambio: exerciseInfo.audioCambio || ""
      });
    }

    const instructionSheet = ss.getSheetByName("Instructions");
    if (instructionSheet) {
      const instructionData = instructionSheet.getDataRange().getValues();
      for (let j = 1; j < instructionData.length; j++) {
        const [name, instruction] = instructionData[j];
        if (workouts[name]) workouts[name].instructions = instruction;
      }
    }
  }

  // 5. Run workouts
  const runWorkouts = {};
  const runSheet = ss.getSheetByName("RunWorkouts");
  if (runSheet && neededWorkouts.size > 0) {
    const runData = runSheet.getDataRange().getValues();
    for (let i = 1; i < runData.length; i++) {
      const row = runData[i];
      const workoutName = (row[0] || "").toString().trim();
      if (!neededWorkouts.has(workoutName)) continue;
      const lineText = (row[2] || "").toString().trim();
      if (!workoutName || !lineText) continue;
      if (!runWorkouts[workoutName]) runWorkouts[workoutName] = { lines: [] };
      runWorkouts[workoutName].lines.push({
        index: parseInt(row[1]) || 0,
        text: lineText,
        section: (row[3] || "").toString().trim(),
        audioKey: (row[4] || "").toString().trim()
      });
    }
    Object.keys(runWorkouts).forEach(name => {
      runWorkouts[name].lines.sort((a, b) => (a.index || 0) - (b.index || 0));
    });
  }

  // 6. Set workout types in plans
  for (const planName in plans) {
    plans[planName].workouts.forEach(w => {
      if (workouts[w.name]) w.type = "muscle";
      else if (runWorkouts[w.name]) w.type = "run";
    });
  }

  const duration = new Date() - startTime;
  Logger.log("getWorkoutDataHeavy completed in " + duration + "ms");

  return ContentService
    .createTextOutput(JSON.stringify({
      status: 'success',
      plans: plans,
      workouts: workouts,
      runWorkouts: runWorkouts,
      loadTime: duration
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ═══════════════════════════════════════════════════════════════════════════
// EXERCISE WEIGHTS SYNC (unchanged)
// ═══════════════════════════════════════════════════════════════════════════

function getWeightsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("UserWeights");
  if (!sheet) {
    sheet = ss.insertSheet("UserWeights");
    sheet.getRange(1, 1, 1, 3).setValues([["Email", "Weights", "LastUpdated"]]);
  }
  return sheet;
}

function saveUserWeights(params) {
  try {
    const email = (params.email || "").trim().toLowerCase();
    const weightsJson = params.weights || "{}";
    
    if (!email || !email.includes('@')) {
      return createResponse({ status: 'error', message: 'Invalid email' });
    }
    
    const sheet = getWeightsSheet();
    const data = sheet.getDataRange().getValues();
    
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if ((data[i][0] || "").toString().trim().toLowerCase() === email) {
        rowIndex = i + 1;
        break;
      }
    }
    
    const now = new Date().toISOString();
    
    if (rowIndex > 0) {
      sheet.getRange(rowIndex, 2).setValue(weightsJson);
      sheet.getRange(rowIndex, 3).setValue(now);
    } else {
      sheet.appendRow([email, weightsJson, now]);
    }
    
    return createResponse({ status: 'success', message: 'Weights saved' });
  } catch (error) {
    return createResponse({ status: 'error', message: error.toString() });
  }
}

function getUserWeights(params) {
  try {
    const email = (params.email || "").trim().toLowerCase();
    if (!email || !email.includes('@')) {
      return createResponse({ status: 'error', message: 'Invalid email' });
    }
    
    const sheet = getWeightsSheet();
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if ((data[i][0] || "").toString().trim().toLowerCase() === email) {
        const weights = JSON.parse(data[i][1] || "{}");
        return createResponse({ status: 'success', weights: weights, lastUpdated: data[i][2] });
      }
    }
    
    return createResponse({ status: 'success', weights: {}, message: 'No weights found' });
  } catch (error) {
    return createResponse({ status: 'error', message: error.toString() });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// USER PROGRESS SYNC (V7 - Per Plan Tracking)
// ═══════════════════════════════════════════════════════════════════════════

function getProgressSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("UserProgress");
  
  if (!sheet) {
    // V7: New structure with PlanName column
    sheet = ss.insertSheet("UserProgress");
    sheet.getRange(1, 1, 1, 5).setValues([["Email", "PlanName", "LastWorkoutIndex", "TotalWorkouts", "LastUpdated"]]);
    Logger.log("Created UserProgress sheet V7 with PlanName");
  } else {
    // Check if PlanName column exists (migration from V6)
    const headers = sheet.getRange(1, 1, 1, 10).getValues()[0];
    const hasPlanName = headers.some(h => h && h.toString().toLowerCase() === 'planname');
    
    if (!hasPlanName) {
      // V6 -> V7 migration: need to restructure
      // For now, just recreate with new structure
      // Old data will be lost but this is expected for major version upgrade
      Logger.log("Migrating UserProgress to V7 structure");
      sheet.clear();
      sheet.getRange(1, 1, 1, 5).setValues([["Email", "PlanName", "LastWorkoutIndex", "TotalWorkouts", "LastUpdated"]]);
    }
  }
  
  return sheet;
}

function saveLastWorkout(params) {
  try {
    const email = (params.email || "").trim().toLowerCase();
    const planName = (params.planName || "").trim();
    const lastWorkoutIndex = parseInt(params.lastWorkoutIndex) || 0;
    const lastWorkoutName = (params.lastWorkoutName || "").trim();
    const totalWorkouts = parseInt(params.totalWorkouts) || (lastWorkoutIndex + 1);
    
    Logger.log("saveLastWorkout V7: " + email + ", plan=" + planName + ", index=" + lastWorkoutIndex + ", total=" + totalWorkouts);
    
    if (!email || !email.includes('@')) {
      return createResponse({ status: 'error', message: 'Invalid email' });
    }
    
    if (!planName) {
      return createResponse({ status: 'error', message: 'Plan name required' });
    }
    
    const sheet = getProgressSheet();
    const data = sheet.getDataRange().getValues();
    
    // V7: Find row by email AND planName combination
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      const rowEmail = (data[i][0] || "").toString().trim().toLowerCase();
      const rowPlan = (data[i][1] || "").toString().trim();
      if (rowEmail === email && rowPlan === planName) {
        rowIndex = i + 1;
        break;
      }
    }
    
    const now = new Date().toISOString();
    
    if (rowIndex > 0) {
      // Update existing row
      sheet.getRange(rowIndex, 3).setValue(lastWorkoutIndex);
      sheet.getRange(rowIndex, 4).setValue(totalWorkouts);
      sheet.getRange(rowIndex, 5).setValue(now);
    } else {
      // Create new row for this email+plan combination
      sheet.appendRow([email, planName, lastWorkoutIndex, totalWorkouts, now]);
    }
    
    Logger.log("SUCCESS: saved progress for " + email + " / " + planName);
    
    return createResponse({ 
      status: 'success', 
      planName: planName,
      lastWorkoutIndex: lastWorkoutIndex,
      totalWorkouts: totalWorkouts
    });
  } catch (error) {
    Logger.log("ERROR: " + error.toString());
    return createResponse({ status: 'error', message: error.toString() });
  }
}

function getLastWorkout(params) {
  try {
    const email = (params.email || "").trim().toLowerCase();
    const planName = (params.planName || "").trim();
    
    if (!email || !email.includes('@')) {
      return createResponse({ status: 'error', message: 'Invalid email' });
    }
    
    if (!planName) {
      return createResponse({ status: 'error', message: 'Plan name required' });
    }
    
    const sheet = getProgressSheet();
    const data = sheet.getDataRange().getValues();
    
    // V7: Find by email AND planName
    for (let i = 1; i < data.length; i++) {
      const rowEmail = (data[i][0] || "").toString().trim().toLowerCase();
      const rowPlan = (data[i][1] || "").toString().trim();
      
      if (rowEmail === email && rowPlan === planName) {
        const lastWorkoutIndex = parseInt(data[i][2]) || 0;
        const totalWorkouts = parseInt(data[i][3]) || (lastWorkoutIndex + 1);
        const lastUpdated = data[i][4] || null;
        
        Logger.log("Found progress for " + email + " / " + planName + ": index=" + lastWorkoutIndex);
        
        return createResponse({ 
          status: 'success', 
          planName: planName,
          lastWorkoutIndex: lastWorkoutIndex,
          totalWorkouts: totalWorkouts,
          lastUpdated: lastUpdated
        });
      }
    }
    
    // No progress found for this plan
    return createResponse({ 
      status: 'success', 
      planName: planName,
      lastWorkoutIndex: -1,
      totalWorkouts: 0,
      message: 'No progress found for this plan'
    });
  } catch (error) {
    return createResponse({ status: 'error', message: error.toString() });
  }
}

// V7 NEW: Get all progress for a user (all plans)
function getAllUserProgress(params) {
  try {
    const email = (params.email || "").trim().toLowerCase();
    
    if (!email || !email.includes('@')) {
      return createResponse({ status: 'error', message: 'Invalid email' });
    }
    
    const sheet = getProgressSheet();
    const data = sheet.getDataRange().getValues();
    
    const allProgress = {};
    
    for (let i = 1; i < data.length; i++) {
      const rowEmail = (data[i][0] || "").toString().trim().toLowerCase();
      
      if (rowEmail === email) {
        const planName = (data[i][1] || "").toString().trim();
        const lastWorkoutIndex = parseInt(data[i][2]) || 0;
        const totalWorkouts = parseInt(data[i][3]) || (lastWorkoutIndex + 1);
        const lastUpdated = data[i][4] || null;
        
        allProgress[planName] = {
          lastWorkoutIndex: lastWorkoutIndex,
          totalWorkouts: totalWorkouts,
          lastUpdated: lastUpdated
        };
      }
    }
    
    return createResponse({ 
      status: 'success', 
      progress: allProgress
    });
  } catch (error) {
    return createResponse({ status: 'error', message: error.toString() });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// POST REQUESTS & USER MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.action === 'addTrialUser') return addTrialUser(data);
    if (data.action === 'updateSubscription') return updateSubscription(data);
    if (data.action === 'saveLastWorkout') return saveLastWorkout(data);
    if (data.action === 'addPlanToUser') return addPlanToUser(data);
    if (data.action === 'list-users') return syncListUsers(data);
    if (data.action === 're-add-user') return syncReAddUser(data);
    if (data.action === 'delete-user') return syncDeleteUser(data);
    return createResponse({ status: 'error', message: 'Unknown action' });
  } catch (error) {
    return createResponse({ status: 'error', message: error.toString() });
  }
}

function addTrialUser(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const userSheet = ss.getSheetByName("Users");
  
  const email = (data.email || "").trim().toLowerCase();
  const name = data.name || "";
  const defaultPlan = data.defaultPlan || "Trial Plan";  // V7: Assign a default plan for trial users
  
  if (!email || !email.includes('@')) {
    return createResponse({ status: 'error', message: 'Invalid email' });
  }
  
  const userData = userSheet.getDataRange().getValues();
  for (let i = 1; i < userData.length; i++) {
    if ((userData[i][1] || "").toString().trim().toLowerCase() === email) {
      return createResponse({ status: 'info', message: 'User exists', email: email });
    }
  }
  
  const trialEndDate = new Date();
  trialEndDate.setDate(trialEndDate.getDate() + 7);
  
  // V7: Add plan name instead of individual workouts
  userSheet.appendRow([name, email, "", "", trialEndDate, defaultPlan]);
  
  return createResponse({ status: 'success', message: 'Trial activated', email: email });
}

function updateSubscription(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const userSheet = ss.getSheetByName("Users");
  
  const email = (data.email || "").trim().toLowerCase();
  const planType = data.planType;
  
  if (!email) return createResponse({ status: 'error', message: 'Email required' });
  
  const today = new Date();
  let newExpiration = new Date(today);
  
  if (planType === 'quarterly') newExpiration.setMonth(newExpiration.getMonth() + 3);
  else if (planType === 'annual') newExpiration.setFullYear(newExpiration.getFullYear() + 1);
  else newExpiration.setMonth(newExpiration.getMonth() + 1);
  
  const userData = userSheet.getDataRange().getValues();
  for (let i = 1; i < userData.length; i++) {
    if ((userData[i][1] || "").toString().trim().toLowerCase() === email) {
      userSheet.getRange(i + 1, 5).setValue(newExpiration);
      return createResponse({ status: 'success', newExpiration: newExpiration });
    }
  }
  
  // V7: New user gets default plan
  userSheet.appendRow([email, email, "", "", newExpiration, "Default Plan"]);
  return createResponse({ status: 'success', newExpiration: newExpiration });
}

function createResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function viewAllUserProgress() {
  const sheet = getProgressSheet();
  const data = sheet.getDataRange().getValues();
  const progress = [];
  for (let i = 1; i < data.length; i++) {
    progress.push({
      email: data[i][0],
      planName: data[i][1],
      lastWorkoutIndex: data[i][2],
      totalWorkouts: data[i][3],
      lastUpdated: data[i][4]
    });
  }
  Logger.log(JSON.stringify(progress, null, 2));
  return progress;
}

function viewAllPlans() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const plansSheet = ss.getSheetByName("Plans");
  
  if (!plansSheet) {
    Logger.log("Plans sheet not found");
    return null;
  }
  
  const data = plansSheet.getDataRange().getValues();
  const plans = {};
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const planName = (row[0] || "").toString().trim();
    if (!planName) continue;
    
    const workouts = [];
    for (let col = 1; col < row.length; col++) {
      const workoutName = (row[col] || "").toString().trim();
      if (workoutName && !isDate(workoutName)) {
        workouts.push(workoutName);
      }
    }
    
    plans[planName] = workouts;
  }
  
  Logger.log(JSON.stringify(plans, null, 2));
  return plans;
}

// Test function to verify V7 data structure
function testV7DataStructure() {
  const result = doGet({ parameter: {} });
  const data = JSON.parse(result.getContent());
  
  Logger.log("=== V7 Data Structure Test ===");
  Logger.log("Muscle Workouts: " + Object.keys(data.workouts).length);
  Logger.log("Run Workouts: " + Object.keys(data.runWorkouts).length);
  Logger.log("Plans: " + Object.keys(data.plans).length);
  Logger.log("Users: " + Object.keys(data.userWorkouts).length);
  
  // Log first plan details
  const firstPlanName = Object.keys(data.plans)[0];
  if (firstPlanName) {
    Logger.log("\nFirst Plan: " + firstPlanName);
    Logger.log("Workouts in plan: " + JSON.stringify(data.plans[firstPlanName].workouts));
  }
  
  // Log first user details
  const firstUserEmail = Object.keys(data.userWorkouts)[0];
  if (firstUserEmail) {
    Logger.log("\nFirst User: " + firstUserEmail);
    Logger.log("Assigned Plans: " + JSON.stringify(data.userWorkouts[firstUserEmail].plans));
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// SHOPIFY INTEGRATION - Add plan to user
// Called by Supabase Edge Function when a Shopify order is completed
// ═══════════════════════════════════════════════════════════════════════════

function addPlanToUser(data) {
  try {
    const email = (data.email || "").trim().toLowerCase();
    const planName = (data.planName || "").trim();
    const fullName = (data.fullName || "").trim();
    
    Logger.log("=== addPlanToUser called ===");
    Logger.log("email: " + email);
    Logger.log("planName: " + planName);
    Logger.log("fullName: " + fullName);
    Logger.log("isNewUser: " + data.isNewUser);
    Logger.log("tempPassword present: " + (!!data.tempPassword));
    Logger.log("Raw data keys: " + Object.keys(data).join(", "));
    
    if (!email || !email.includes('@')) {
      return createResponse({ status: 'error', message: 'Invalid email' });
    }
    if (!planName) {
      return createResponse({ status: 'error', message: 'Plan name required' });
    }
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const userSheet = ss.getSheetByName("Users");
    const userData = userSheet.getDataRange().getValues();
    const headers = userData[0];
    
    // Find column indices
    let nameCol = 0, emailCol = 1, nutritionPdfCol = 2, nutritionScadenzaCol = 3, scadenzaCol = 4, firstPlanCol = 5;
    for (let h = 0; h < headers.length; h++) {
      const header = (headers[h] || "").toString().toLowerCase().trim();
      if (header === "utente" || header === "nome" || header === "name") nameCol = h;
      else if (header === "email" || header === "e-mail") emailCol = h;
      else if (header === "scadenza" || header === "expiration" || header === "expires") {
        scadenzaCol = h;
        firstPlanCol = h + 1;
      }
    }
    
    // Check if user already exists
    let userRowIndex = -1;
    for (let i = 1; i < userData.length; i++) {
      if ((userData[i][emailCol] || "").toString().trim().toLowerCase() === email) {
        userRowIndex = i + 1; // 1-indexed for Sheets
        break;
      }
    }
    
    if (userRowIndex > 0) {
      // ── USER EXISTS → check if plan already assigned, if not add it ──
      const row = userData[userRowIndex - 1];
      
      // Check existing plans
      const existingPlans = [];
      for (let col = firstPlanCol; col < row.length; col++) {
        const val = (row[col] || "").toString().trim();
        if (val) existingPlans.push(val);
      }
      
      if (existingPlans.includes(planName)) {
        return createResponse({ 
          status: 'info', 
          message: 'User already has this plan', 
          email: email, 
          planName: planName 
        });
      }
      
      // Add plan in the next available column after existing plans
      const nextCol = firstPlanCol + existingPlans.length + 1; // +1 for 1-indexed
      userSheet.getRange(userRowIndex, nextCol).setValue(planName);
      
      Logger.log("Added plan '" + planName + "' to existing user: " + email);
      
      return createResponse({ 
        status: 'success', 
        message: 'Plan added to existing user', 
        email: email, 
        planName: planName,
        isNewUser: false 
      });
      
    } else {
      // ── NEW USER → create row with no scadenza ──
      const displayName = fullName || email.split('@')[0];
      
      // Row: [name, email, nutritionPdf, nutritionScadenza, scadenza, plan]
      // scadenza left empty = no expiration
      userSheet.appendRow([displayName, email, "", "", "", planName]);
      
      Logger.log("Created new user: " + email + " with plan: " + planName);
      
      // Send welcome email if tempPassword was provided
      if (data.tempPassword) {
        sendWelcomeEmail(email, displayName, planName, data.tempPassword);
        Logger.log("Welcome email sent to: " + email);
      } else {
        Logger.log("No tempPassword provided, skipping welcome email");
      }
      
      return createResponse({ 
        status: 'success', 
        message: 'New user created with plan', 
        email: email, 
        planName: planName,
        isNewUser: true 
      });
    }
    
  } catch (error) {
    Logger.log("addPlanToUser error: " + error.toString());
    return createResponse({ status: 'error', message: error.toString() });
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// WELCOME EMAIL - Send credentials to new Shopify users
// ═══════════════════════════════════════════════════════════════════════════

function sendWelcomeEmail(email, name, planName, tempPassword) {
  try {
    const subject = "🏋️ Benvenuto in Viltrum Fitness!";
    
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #000; color: #fff; padding: 40px; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="font-size: 28px; margin: 0; letter-spacing: 2px;">VILTRUM FITNESS</h1>
          <p style="color: #888; font-size: 12px; margin-top: 5px;">NO SHORTCUTS. ALL SWEAT. NO TALKS, JUST REPS.</p>
        </div>
        
        <h2 style="color: #4CAF50; margin-bottom: 20px;">Ciao ${name}! 💪</h2>
        
        <p style="font-size: 16px; line-height: 1.6;">
          Il tuo piano <strong style="color: #4CAF50;">${planName}</strong> è stato attivato con successo!
        </p>
        
        <div style="background: #111; border: 1px solid #333; border-radius: 8px; padding: 20px; margin: 25px 0;">
          <h3 style="color: #4CAF50; margin-top: 0;">Le tue credenziali:</h3>
          <p style="margin: 8px 0;"><strong>Email:</strong> ${email}</p>
          <p style="margin: 8px 0;"><strong>Password temporanea:</strong> <code style="background: #222; padding: 4px 8px; border-radius: 4px; color: #4CAF50;">${tempPassword}</code></p>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="https://tommyv-spec.github.io/tommyv-spec-viltrum-fitness-V8/" 
             style="display: inline-block; background: #4CAF50; color: #fff; padding: 14px 40px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px; letter-spacing: 1px;">
            APRI VILTRUM FITNESS
          </a>
        </div>
        
        <p style="font-size: 14px; color: #888; line-height: 1.6;">
          Ti consigliamo di cambiare la password al primo accesso dalle impostazioni del profilo.
        </p>
        
        <hr style="border: none; border-top: 1px solid #333; margin: 30px 0;">
        
        <p style="font-size: 12px; color: #666; text-align: center;">
          Viltrum Fitness — Il tuo percorso inizia ora.
        </p>
      </div>
    `;
    
    GmailApp.sendEmail(email, subject, "", { htmlBody: htmlBody });

    Logger.log("Welcome email sent to: " + email);

  } catch (error) {
    Logger.log("Failed to send welcome email: " + error.toString());
    // Don't throw - email failure shouldn't break the flow
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SUPABASE <-> SHEET SYNC ENDPOINTS
// Token-gated. Set SYNC_TOKEN in Script Properties: Settings -> Script Properties.
// ═══════════════════════════════════════════════════════════════════════════

function _checkSyncToken(data) {
  const expected = PropertiesService.getScriptProperties().getProperty('SYNC_TOKEN');
  if (!expected) {
    return { ok: false, response: createResponse({ status: 'error', message: 'SYNC_TOKEN not configured in Script Properties' }) };
  }
  if (!data.token || data.token !== expected) {
    return { ok: false, response: createResponse({ status: 'error', message: 'Unauthorized' }) };
  }
  return { ok: true };
}

function syncListUsers(data) {
  const auth = _checkSyncToken(data);
  if (!auth.ok) return auth.response;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const userSheet = ss.getSheetByName('Users');
  const rows = userSheet.getDataRange().getValues();
  const users = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const email = (r[1] || '').toString().trim().toLowerCase();
    if (!email) continue;
    users.push({
      name: r[0] || '',
      email: email,
      scadenza: r[4] ? new Date(r[4]).toISOString() : null,
      plan: r[5] || ''
    });
  }
  return createResponse({ status: 'success', users: users, count: users.length });
}

function syncReAddUser(data) {
  const auth = _checkSyncToken(data);
  if (!auth.ok) return auth.response;

  const email = (data.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return createResponse({ status: 'error', message: 'Invalid email' });
  }
  const name = data.name || '';
  const plan = data.plan || 'Trial Plan';
  let scadenza = data.scadenza ? new Date(data.scadenza) : null;
  if (!scadenza || isNaN(scadenza.getTime())) {
    scadenza = new Date();
    scadenza.setDate(scadenza.getDate() + 7);
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const userSheet = ss.getSheetByName('Users');
  const rows = userSheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if ((rows[i][1] || '').toString().trim().toLowerCase() === email) {
      userSheet.getRange(i + 1, 1).setValue(name);
      userSheet.getRange(i + 1, 5).setValue(scadenza);
      userSheet.getRange(i + 1, 6).setValue(plan);
      return createResponse({ status: 'success', mode: 'updated', email: email });
    }
  }
  userSheet.appendRow([name, email, '', '', scadenza, plan]);
  return createResponse({ status: 'success', mode: 'inserted', email: email });
}

function syncDeleteUser(data) {
  const auth = _checkSyncToken(data);
  if (!auth.ok) return auth.response;

  const email = (data.email || '').trim().toLowerCase();
  if (!email) return createResponse({ status: 'error', message: 'Email required' });

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const userSheet = ss.getSheetByName('Users');
  const rows = userSheet.getDataRange().getValues();
  for (let i = rows.length - 1; i >= 1; i--) {
    if ((rows[i][1] || '').toString().trim().toLowerCase() === email) {
      userSheet.deleteRow(i + 1);
      return createResponse({ status: 'success', mode: 'deleted', email: email });
    }
  }
  return createResponse({ status: 'info', mode: 'not-found', email: email });
}
