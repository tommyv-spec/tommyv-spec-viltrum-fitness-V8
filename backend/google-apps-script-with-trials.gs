// Google Apps Script - With Nutrition Support + Weights Sync + Last Workout Sync
// Version 6.3.19 - Added totalWorkouts to cloud sync

function doGet(e) {
  Logger.log("=== doGet called ===");
  
  if (!e || !e.parameter) {
    Logger.log("No parameters received, returning workout data");
  }
  
  // Check if this is an action request
  if (e && e.parameter && e.parameter.action === 'addTrialUser') {
    return addTrialUser({ email: e.parameter.email, name: e.parameter.name });
  }
  
  if (e && e.parameter && e.parameter.action === 'saveWeights') {
    return saveUserWeights(e.parameter);
  }
  
  if (e && e.parameter && e.parameter.action === 'getWeights') {
    return getUserWeights(e.parameter);
  }
  
  // Handle last workout sync actions
  if (e && e.parameter && e.parameter.action === 'saveLastWorkout') {
    Logger.log(">>> saveLastWorkout: email=" + e.parameter.email + ", index=" + e.parameter.lastWorkoutIndex + ", total=" + e.parameter.totalWorkouts);
    return saveLastWorkout(e.parameter);
  }
  
  if (e && e.parameter && e.parameter.action === 'getLastWorkout') {
    return getLastWorkout(e.parameter);
  }
  
  // Otherwise, return workout data + nutrition data as usual
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // --- LOAD EXERCISES LIBRARY ---
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

  // --- LOAD WORKOUTS ---
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

  // --- INSTRUCTIONS ---
  const instructionSheet = ss.getSheetByName("Instructions");
  const instructionData = instructionSheet.getDataRange().getValues();
  for (let j = 1; j < instructionData.length; j++) {
    const [name, instruction] = instructionData[j];
    if (workouts[name]) {
      workouts[name].instructions = instruction;
    }
  }

  // --- USERS (WITH NUTRITION) ---
  const userSheet = ss.getSheetByName("Users");
  const userData = userSheet.getDataRange().getValues();
  const userWorkouts = {};
  const headers = userData[0];
  
  let nameCol = 0, emailCol = 1, nutritionPdfCol = 2, nutritionScadenzaCol = 3, scadenzaCol = 4, firstWorkoutCol = 5;
  
  for (let h = 0; h < headers.length; h++) {
    const header = (headers[h] || "").toString().toLowerCase().trim();
    if (header === "utente" || header === "nome" || header === "name") nameCol = h;
    else if (header === "email" || header === "e-mail") emailCol = h;
    else if (header.includes("nutrition") && header.includes("pdf")) nutritionPdfCol = h;
    else if (header.includes("nutrition") && header.includes("scadenza")) nutritionScadenzaCol = h;
    else if (header === "scadenza" || header === "expiration" || header === "expires") {
      scadenzaCol = h;
      firstWorkoutCol = h + 1;
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
    
    userWorkouts[userEmail] = {
      fullName: fullName,
      scadenza: scadenza,
      nutritionPdfUrl: nutritionPdfUrl,
      nutritionScadenza: nutritionScadenza,
      workouts: []
    };
    
    for (let col = firstWorkoutCol; col < row.length; col++) {
      const workout = (row[col] || "").toString().trim();
      if (workout && !isDate(workout) && workout.length < 50) {
        userWorkouts[userEmail].workouts.push(workout);
      }
    }
  }

  return ContentService
    .createTextOutput(JSON.stringify({ workouts: workouts, userWorkouts: userWorkouts }))
    .setMimeType(ContentService.MimeType.JSON);
}

function isDate(value) {
  if (!value) return false;
  if (value instanceof Date) return true;
  const str = value.toString();
  return str.match(/^\d{1,2}\/\d{1,2}\/\d{4}/) || str.match(/\d{4}-\d{2}-\d{2}/) || str.toLowerCase().includes('gmt');
}

// ═══════════════════════════════════════════════════════════════════════════
// EXERCISE WEIGHTS SYNC
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
// LAST WORKOUT SYNC (v6.3.19 - with totalWorkouts)
// ═══════════════════════════════════════════════════════════════════════════

function getProgressSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("UserProgress");
  
  if (!sheet) {
    sheet = ss.insertSheet("UserProgress");
    sheet.getRange(1, 1, 1, 5).setValues([["Email", "LastWorkoutIndex", "LastWorkoutName", "TotalWorkouts", "LastUpdated"]]);
    Logger.log("Created UserProgress sheet with TotalWorkouts");
  } else {
    // Check if TotalWorkouts column exists
    const headers = sheet.getRange(1, 1, 1, 10).getValues()[0];
    const hasTotal = headers.some(h => h && h.toString().toLowerCase().includes('total'));
    if (!hasTotal && headers[3] !== "TotalWorkouts") {
      // Need to add TotalWorkouts column
      const numRows = sheet.getLastRow();
      if (numRows > 0) {
        sheet.insertColumnAfter(3);
        sheet.getRange(1, 4).setValue("TotalWorkouts");
        Logger.log("Added TotalWorkouts column");
      }
    }
  }
  
  return sheet;
}

function saveLastWorkout(params) {
  try {
    const email = (params.email || "").trim().toLowerCase();
    const lastWorkoutIndex = parseInt(params.lastWorkoutIndex) || 0;
    const lastWorkoutName = (params.lastWorkoutName || "").trim();
    const totalWorkouts = parseInt(params.totalWorkouts) || (lastWorkoutIndex + 1);
    
    Logger.log("saveLastWorkout: " + email + ", index=" + lastWorkoutIndex + ", name=" + lastWorkoutName + ", total=" + totalWorkouts);
    
    if (!email || !email.includes('@')) {
      return createResponse({ status: 'error', message: 'Invalid email' });
    }
    
    const sheet = getProgressSheet();
    const data = sheet.getDataRange().getValues();
    
    let rowIndex = -1;
    let existingTotal = 0;
    for (let i = 1; i < data.length; i++) {
      if ((data[i][0] || "").toString().trim().toLowerCase() === email) {
        rowIndex = i + 1;
        existingTotal = parseInt(data[i][3]) || 0;
        break;
      }
    }
    
    // Use higher value between existing and new total
    const finalTotal = Math.max(existingTotal, totalWorkouts);
    const now = new Date().toISOString();
    
    if (rowIndex > 0) {
      sheet.getRange(rowIndex, 2).setValue(lastWorkoutIndex);
      sheet.getRange(rowIndex, 3).setValue(lastWorkoutName);
      sheet.getRange(rowIndex, 4).setValue(finalTotal);
      sheet.getRange(rowIndex, 5).setValue(now);
    } else {
      sheet.appendRow([email, lastWorkoutIndex, lastWorkoutName, finalTotal, now]);
    }
    
    Logger.log("SUCCESS: saved for " + email + ", total=" + finalTotal);
    
    return createResponse({ 
      status: 'success', 
      lastWorkoutIndex: lastWorkoutIndex,
      lastWorkoutName: lastWorkoutName,
      totalWorkouts: finalTotal
    });
  } catch (error) {
    Logger.log("ERROR: " + error.toString());
    return createResponse({ status: 'error', message: error.toString() });
  }
}

function getLastWorkout(params) {
  try {
    const email = (params.email || "").trim().toLowerCase();
    if (!email || !email.includes('@')) {
      return createResponse({ status: 'error', message: 'Invalid email' });
    }
    
    const sheet = getProgressSheet();
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if ((data[i][0] || "").toString().trim().toLowerCase() === email) {
        const lastWorkoutIndex = parseInt(data[i][1]) || 0;
        const lastWorkoutName = (data[i][2] || "").toString();
        const totalWorkouts = parseInt(data[i][3]) || (lastWorkoutIndex + 1);
        const lastUpdated = data[i][4] || null;
        
        Logger.log("Found progress for " + email + ": index=" + lastWorkoutIndex + ", total=" + totalWorkouts);
        
        return createResponse({ 
          status: 'success', 
          lastWorkoutIndex: lastWorkoutIndex,
          lastWorkoutName: lastWorkoutName,
          totalWorkouts: totalWorkouts,
          lastUpdated: lastUpdated
        });
      }
    }
    
    return createResponse({ 
      status: 'success', 
      lastWorkoutIndex: -1,
      lastWorkoutName: '',
      totalWorkouts: 0,
      message: 'No progress found'
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
  
  userSheet.appendRow([name, email, "", "", trialEndDate, "A1", "A2"]);
  
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
  
  userSheet.appendRow([email, email, "", "", newExpiration, "A1", "A2", "A3", "A4"]);
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
      lastWorkoutIndex: data[i][1],
      lastWorkoutName: data[i][2],
      totalWorkouts: data[i][3],
      lastUpdated: data[i][4]
    });
  }
  Logger.log(JSON.stringify(progress));
  return progress;
}
