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
