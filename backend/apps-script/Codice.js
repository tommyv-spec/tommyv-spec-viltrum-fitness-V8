// Google Apps Script - Viltrum Fitness V8
// Version 8.0.0 - Mesociclo-based Plans System
//
// STRUTTURA FOGLI:
// - Exercises:    libreria esercizi (col 0=Name, 5=ImageURL, 8=Audio, 9=AudioCambio)
// - Workouts:     col 0=Mesociclo, 1=Timing, 2=Name, 3=Block, 4=Exercise, 5=FullDur, 6=TipoDiPeso, 7=Rounds, 8=Reps
// - Instructions: col 0=WorkoutName, 1=Instructions
// - RunWorkouts:  col 0=WorkoutName, 1=PhaseOrder, 2=LoopGroup, 3=LoopCount, 4=Value, 5=Unit, 6=Zone, 7=Section, 8=Description
// - Plans:        col 0=PlanName, 1=Mesociclo1, 2=Mesociclo2, ... (mesociclo names, not individual workouts)
// - Users:        col 0=utente, 1=email, 2=nutrition_pdf_url, 3=nutrition_scadenza, 4=scadenza, 5+=Plan names
// - UserWeights:  col 0=Email, 1=Weights(JSON), 2=LastUpdated
// - UserProgress: col 0=Email, 1=PlanName, 2=LastWorkoutIndex, 3=TotalWorkouts, 4=LastUpdated

function doGet(e) {
  Logger.log("=== doGet called V8 ===");

  if (e && e.parameter) {
    const action = e.parameter.action;

    if (action === 'addTrialUser')    return addTrialUser({ email: e.parameter.email, name: e.parameter.name });
    if (action === 'saveWeights')     return saveUserWeights(e.parameter);
    if (action === 'getWeights')      return getUserWeights(e.parameter);
    if (action === 'saveLastWorkout') return saveLastWorkout(e.parameter);
    if (action === 'getLastWorkout')  return getLastWorkout(e.parameter);
    if (action === 'getAllProgress')  return getAllUserProgress(e.parameter);
    if (action === 'getUserData')     return getUserDataCached(e.parameter);
    if (action === 'addPlanToUser')   return addPlanToUser(e.parameter);

    // V8.2: Split endpoints for fast dashboard loading
    if (action === 'getUserInfo')     return getUserInfoCached(e.parameter);
    if (action === 'getWorkoutData')  return getWorkoutDataCached(e.parameter);
    if (action === 'bustCache')       return bustAllCache(e.parameter);
  }

  // Full data load
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const exerciseLibrary = loadExerciseLibrary(ss);
  const workouts        = loadAllMuscleWorkouts(ss, exerciseLibrary);
  const runWorkouts     = loadAllRunWorkouts(ss);
  const plans           = loadAllPlans(ss, workouts, runWorkouts);
  const userWorkouts    = loadAllUsers(ss, plans);

  return ContentService
    .createTextOutput(JSON.stringify({ workouts, runWorkouts, plans, userWorkouts }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// V8.3: SHARED DATA CACHE (CacheService)
//
// SHARED (identical for all users, cached 1 hour):
//   - Exercise library, all workouts, run workouts, meso index, instructions
// PER-USER (3 tiny sheet reads ~1s):
//   - User info, plan mesocicli, progress
//
// First call: ~7s (builds shared cache). Subsequent: ~1s.
// ═══════════════════════════════════════════════════════════════════════════

var SHARED_TTL = 3600;
var USER_RESP_TTL = 300;

function _getSharedData(ss) {
  var cache = CacheService.getScriptCache();
  var keys = ['s_exercises', 's_workouts', 's_runs', 's_meso_index'];
  var cached = cache.getAll(keys);
  
  if (cached['s_exercises'] && cached['s_workouts'] && cached['s_runs'] && cached['s_meso_index']) {
    Logger.log("⚡ Shared data ALL CACHE HIT");
    return {
      exerciseLib: JSON.parse(cached['s_exercises']),
      allWorkouts: JSON.parse(cached['s_workouts']),
      allRunWorkouts: JSON.parse(cached['s_runs']),
      mesoIndex: JSON.parse(cached['s_meso_index'])
    };
  }
  
  Logger.log("🔄 Shared data CACHE MISS — reading sheets...");
  var startTime = new Date();
  var exerciseLib = loadExerciseLibrary(ss);
  
  var allWorkouts = {};
  var mesoTimingMap = {};
  var workoutData = ss.getSheetByName("Workouts").getDataRange().getValues();
  for (var i = 1; i < workoutData.length; i++) {
    var row = workoutData[i];
    var mesociclo = (row[0] || "").toString().trim();
    var timing = (row[1] || "").toString().trim();
    var wName = (row[2] || "").toString().trim();
    var block = (row[3] || "").toString().trim();
    var exercise = (row[4] || "").toString().trim();
    var fullDur = parseInt(row[5]) || 0;
    if (!wName || !exercise) continue;
    if (mesociclo) {
      if (!mesoTimingMap[mesociclo]) mesoTimingMap[mesociclo] = {};
      mesoTimingMap[mesociclo][wName] = timing;
    }
    if (!allWorkouts[wName]) allWorkouts[wName] = { exercises: [], instructions: "" };
    var info = exerciseLib[exercise] || {};
    allWorkouts[wName].exercises.push({
      name: exercise, duration: fullDur, imageUrl: info.imageUrl || "",
      block: block, tipoDiPeso: normalizeTipoDiPeso(row[6], exercise),
      rounds: normalizeRounds(row[7]), reps: normalizeReps(row[8]),
      audio: info.audio || "", audioCambio: info.audioCambio || ""
    });
  }
  
  var instrSheet = ss.getSheetByName("Instructions");
  if (instrSheet) {
    var instrData = instrSheet.getDataRange().getValues();
    for (var j = 1; j < instrData.length; j++) {
      var n = (instrData[j][0] || "").toString().trim();
      if (allWorkouts[n]) allWorkouts[n].instructions = instrData[j][1] || "";
    }
  }
  
  var allRunWorkouts = {};
  var runMesoMap = {};
  var runSheet = ss.getSheetByName("RunWorkouts");
  if (runSheet) {
    var runData = runSheet.getDataRange().getValues();
    var _crn = null, _crm = null;
    for (var i = 1; i < runData.length; i++) {
      var row = runData[i];
      var c0 = (row[0] || "").toString().trim();
      var c1 = (row[1] || "").toString().trim();
      var c2 = (row[2] || "").toString().trim();
      var wM, wN, off;
      if (c0 && !c0.includes(" - ")) {
        off = 3;
        if (c1) { wM = c0; wN = (c2 && c2.includes(" - ")) ? c2 : (c0 + " - " + c1); _crm = wM; _crn = wN; }
        else if (_crn && _crm === c0) { wM = _crm; wN = _crn; }
        else continue;
      } else if (c0 && c0.includes(" - ")) {
        off = 1; wM = c0.split(" - ")[0].trim(); wN = c0; _crn = wN; _crm = wM;
      } else continue;
      if (!wN || !wM) continue;
      if (!runMesoMap[wM]) runMesoMap[wM] = [];
      if (!runMesoMap[wM].includes(wN)) runMesoMap[wM].push(wN);
      if (!allRunWorkouts[wN]) allRunWorkouts[wN] = { phases: [] };
      allRunWorkouts[wN].phases.push({
        index: parseInt(row[off]) || 0, loopGroup: row[off+1] || null,
        loopCount: parseInt(row[off+2]) || 1, value: row[off+3] || null,
        unit: (row[off+4] || "").toString().trim(), zone: row[off+5] || null,
        section: (row[off+6] || "").toString().trim(), description: (row[off+7] || "").toString().trim()
      });
    }
    Object.keys(allRunWorkouts).forEach(function(n) { allRunWorkouts[n].phases.sort(function(a,b) { return (a.index||0) - (b.index||0); }); });
  }
  
  Logger.log("📊 Shared data built in " + (new Date() - startTime) + "ms");
  
  try {
    var toCache = {};
    var exerciseStr = JSON.stringify(exerciseLib);
    var workoutStr = JSON.stringify(allWorkouts);
    var runStr = JSON.stringify(allRunWorkouts);
    var indexStr = JSON.stringify({ mesoTimingMap: mesoTimingMap, runMesoMap: runMesoMap });
    if (exerciseStr.length < 100000) toCache['s_exercises'] = exerciseStr;
    if (workoutStr.length < 100000) toCache['s_workouts'] = workoutStr;
    if (runStr.length < 100000) toCache['s_runs'] = runStr;
    if (indexStr.length < 100000) toCache['s_meso_index'] = indexStr;
    if (Object.keys(toCache).length > 0) {
      cache.putAll(toCache, SHARED_TTL);
      Logger.log("💾 Shared data cached: " + Object.keys(toCache).length + " keys");
    }
  } catch (e) { Logger.log("⚠️ Cache store failed: " + e.toString()); }
  
  return { exerciseLib: exerciseLib, allWorkouts: allWorkouts, allRunWorkouts: allRunWorkouts, mesoIndex: { mesoTimingMap: mesoTimingMap, runMesoMap: runMesoMap } };
}

function getUserDataCached(params) {
  var email = (params.email || "").trim().toLowerCase();
  if (!email || !email.includes('@')) return createResponse({ status: 'error', message: 'Invalid email' });
  var cache = CacheService.getScriptCache();
  var cacheKey = 'ud_' + email.replace(/[^a-z0-9]/g, '_');
  var cached = cache.get(cacheKey);
  if (cached) { Logger.log("⚡ getUserData CACHE HIT"); return ContentService.createTextOutput(cached).setMimeType(ContentService.MimeType.JSON); }
  var response = getUserDataFromShared(params);
  try { var s = response.getContent(); if (s.length < 100000) cache.put(cacheKey, s, USER_RESP_TTL); } catch(e) {}
  return response;
}

function getUserDataFromShared(params) {
  var startTime = new Date();
  var email = (params.email || "").trim().toLowerCase();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var shared = _getSharedData(ss);
  
  var userSheet = ss.getSheetByName("Users");
  var userData = userSheet.getDataRange().getValues();
  var cols = parseUserHeaders(userData[0]);
  var userInfo = null, userPlanNames = [];
  for (var k = 1; k < userData.length; k++) {
    var row = userData[k];
    if ((row[cols.email] || "").toString().trim().toLowerCase() !== email) continue;
    userInfo = { fullName: (row[cols.name]||"").toString().trim(), scadenza: row[cols.scadenza]||"", nutritionPdfUrl: (row[cols.nutritionPdf]||"").toString().trim(), nutritionScadenza: row[cols.nutritionScadenza]||"" };
    for (var col = cols.firstPlan; col < row.length; col++) { var pn = (row[col]||"").toString().trim(); if (pn && !isDate(pn)) userPlanNames.push(pn); }
    break;
  }
  if (!userInfo) return createResponse({ status: 'error', message: 'User not found' });
  
  var plans = {}, neededMesos = {};
  var plansSheet = ss.getSheetByName("Plans");
  if (plansSheet && userPlanNames.length > 0) {
    var plansData = plansSheet.getDataRange().getValues();
    for (var i = 1; i < plansData.length; i++) {
      var planName = (plansData[i][0]||"").toString().trim();
      if (!planName || userPlanNames.indexOf(planName) === -1) continue;
      var planMesos = [];
      for (var col = 1; col < plansData[i].length; col++) { var m = (plansData[i][col]||"").toString().trim(); if (m && !isDate(m)) { planMesos.push(m); neededMesos[m] = true; } }
      plans[planName] = { mesocicli: planMesos, workouts: [], totalWorkouts: 0 };
    }
  }
  
  var workouts = {}, runWorkouts = {};
  var mesoTimingMap = shared.mesoIndex.mesoTimingMap;
  var runMesoMap = shared.mesoIndex.runMesoMap;
  
  for (var meso in neededMesos) {
    var tm = mesoTimingMap[meso] || {};
    for (var wn in tm) { if (shared.allWorkouts[wn]) workouts[wn] = shared.allWorkouts[wn]; }
    (runMesoMap[meso] || []).forEach(function(wn) { if (shared.allRunWorkouts[wn]) runWorkouts[wn] = shared.allRunWorkouts[wn]; });
  }
  
  for (var planName in plans) {
    var pw = [];
    plans[planName].mesocicli.forEach(function(meso) {
      var tm = mesoTimingMap[meso] || {};
      var entries = Object.entries(tm); entries.sort(function(a,b) { return sortTiming(a[1], b[1]); });
      entries.forEach(function(e) { pw.push({ index: pw.length + 1, name: e[0], type: "muscle" }); });
      (runMesoMap[meso] || []).forEach(function(wn) { pw.push({ index: pw.length + 1, name: wn, type: "run" }); });
    });
    plans[planName].workouts = pw; plans[planName].totalWorkouts = pw.length; delete plans[planName].mesocicli;
  }
  
  var userProgress = {};
  var progressSheet = ss.getSheetByName("UserProgress");
  if (progressSheet) {
    var progressData = progressSheet.getDataRange().getValues();
    for (var i = 1; i < progressData.length; i++) {
      if ((progressData[i][0]||"").toString().trim().toLowerCase() !== email) continue;
      var pn = (progressData[i][1]||"").toString().trim();
      userProgress[pn] = { lastWorkoutIndex: parseInt(progressData[i][2])||0, totalWorkouts: parseInt(progressData[i][3])||0, lastUpdated: progressData[i][4]||null };
    }
  }
  
  var duration = new Date() - startTime;
  Logger.log("getUserDataFromShared completed in " + duration + "ms");
  return ContentService.createTextOutput(JSON.stringify({ status:'success', user:{ email:email, fullName:userInfo.fullName, scadenza:userInfo.scadenza, nutritionPdfUrl:userInfo.nutritionPdfUrl, nutritionScadenza:userInfo.nutritionScadenza, plans:userPlanNames }, plans:plans, workouts:workouts, runWorkouts:runWorkouts, progress:userProgress, loadTime:duration })).setMimeType(ContentService.MimeType.JSON);
}

function getUserInfoCached(params) {
  var email = (params.email || "").trim().toLowerCase();
  if (!email || !email.includes('@')) return createResponse({ status: 'error', message: 'Invalid email' });
  var cache = CacheService.getScriptCache();
  var cacheKey = 'ui_' + email.replace(/[^a-z0-9]/g, '_');
  var cached = cache.get(cacheKey);
  if (cached) { Logger.log("⚡ getUserInfo CACHE HIT"); return ContentService.createTextOutput(cached).setMimeType(ContentService.MimeType.JSON); }
  var response = getUserInfoLight(params);
  try { var s = response.getContent(); if (s.length < 100000) cache.put(cacheKey, s, USER_RESP_TTL); } catch(e) {}
  return response;
}

function getWorkoutDataCached(params) {
  var email = (params.email || "").trim().toLowerCase();
  if (!email || !email.includes('@')) return createResponse({ status: 'error', message: 'Invalid email' });
  var cache = CacheService.getScriptCache();
  var cacheKey = 'wd_' + email.replace(/[^a-z0-9]/g, '_');
  var cached = cache.get(cacheKey);
  if (cached) { Logger.log("⚡ getWorkoutData CACHE HIT"); return ContentService.createTextOutput(cached).setMimeType(ContentService.MimeType.JSON); }
  var response = getWorkoutDataHeavy(params);
  try { var s = response.getContent(); if (s.length < 100000) cache.put(cacheKey, s, USER_RESP_TTL); } catch(e) {}
  return response;
}

function bustUserCache(email) {
  var cache = CacheService.getScriptCache();
  var safe = email.replace(/[^a-z0-9]/g, '_');
  cache.removeAll(['ud_' + safe, 'ui_' + safe, 'wd_' + safe]);
  Logger.log("🗑️ Cache busted for: " + email);
}

function bustAllCache(params) {
  var cache = CacheService.getScriptCache();
  cache.removeAll(['s_exercises', 's_workouts', 's_runs', 's_meso_index']);
  var email = (params && params.email || "").trim().toLowerCase();
  if (email) bustUserCache(email);
  Logger.log("🗑️ All caches busted" + (email ? " + user: " + email : ""));
  return createResponse({ status: 'success', message: 'Cache busted' });
}

// CORE LOADERS
// ═══════════════════════════════════════════════════════════════════════════

// Returns { exerciseName: { imageUrl, audio, audioCambio } }
function loadExerciseLibrary(ss) {
  const data = ss.getSheetByName("Exercises").getDataRange().getValues();
  const lib  = {};
  for (let i = 1; i < data.length; i++) {
    const name = (data[i][0] || "").toString().trim();
    if (!name) continue;
    lib[name] = {
      imageUrl:    data[i][5] || "",
      audio:       data[i][8] || "",
      audioCambio: data[i][9] || ""
    };
  }
  return lib;
}

// Returns { workoutName: { exercises: [...], instructions: "" } }
// V8: Workouts sheet now has Mesociclo(0) | Timing(1) | Name(2) | Block(3) | Exercise(4) | FullDur(5) | TipoDiPeso(6) | Rounds(7) | Reps(8)
function loadAllMuscleWorkouts(ss, exerciseLibrary) {
  const data     = ss.getSheetByName("Workouts").getDataRange().getValues();
  const workouts = {};

  for (let i = 1; i < data.length; i++) {
    const row          = data[i];
    const workoutName  = (row[2] || "").toString().trim();   // col C = Name (Mesociclo + Timing combined)
    const block        = (row[3] || "").toString().trim();   // col D = Block
    const exercise     = (row[4] || "").toString().trim();   // col E = Exercise
    const fullDur      = parseInt(row[5]) || 0;              // col F = Full Dur
    const tipoDiPeso   = normalizeTipoDiPeso(row[6], exercise);   // col G = Tipo di peso
    const rounds       = normalizeRounds(row[7]);              // col H = Rounds
    const reps         = normalizeReps(row[8]);   // col I = Reps

    if (!workoutName || !exercise) continue;

    if (!workouts[workoutName]) {
      workouts[workoutName] = { exercises: [], instructions: "" };
    }

    const info = exerciseLibrary[exercise] || {};
    workouts[workoutName].exercises.push({
      name:        exercise,
      duration:    fullDur,
      imageUrl:    info.imageUrl    || "",
      block:       block,
      tipoDiPeso:  tipoDiPeso,
      rounds:      rounds,
      reps:        reps,
      audio:       info.audio       || "",
      audioCambio: info.audioCambio || ""
    });
  }

  // Load instructions
  const instrSheet = ss.getSheetByName("Instructions");
  if (instrSheet) {
    const instrData = instrSheet.getDataRange().getValues();
    for (let j = 1; j < instrData.length; j++) {
      const name = (instrData[j][0] || "").toString().trim();
      if (workouts[name]) workouts[name].instructions = instrData[j][1] || "";
    }
  }

  return workouts;
}

// Returns { workoutName: { mesociclo, lines: [...] } }
// V8 headers: Mesociclo(0) | WorkoutName(1) | WorkoutName full(2) | PhaseOrder(3) | LoopGroup(4) | LoopCount(5) | Value(6) | Unit(7) | Zone(8) | Section(9) | Description(10)
function loadAllRunWorkouts(ss) {
  const sheet = ss.getSheetByName("RunWorkouts");
  if (!sheet) return {};

  const data        = sheet.getDataRange().getValues();
  const runWorkouts = {};

  let _currentWorkoutName = null; // tracks current workout across rows (new format)
  let _currentMesociclo   = null;

  for (let i = 1; i < data.length; i++) {
    const row  = data[i];
    const col0 = (row[0] || "").toString().trim();
    const col1 = (row[1] || "").toString().trim();
    const col2 = (row[2] || "").toString().trim();

    let mesociclo, workoutName, offset;

    if (col0 && !col0.includes(" - ")) {
      // NEW FORMAT: col0=Mesociclo (e.g. "RUN B1"), col3=PhaseOrder
      offset = 3;
      if (col1) {
        // First row of this workout — col1 = short name
        mesociclo        = col0;
        workoutName      = col2 && col2.includes(" - ") ? col2 : (col0 + " - " + col1);
        _currentMesociclo   = mesociclo;
        _currentWorkoutName = workoutName;
      } else if (_currentWorkoutName) {
        // Continuation row — reuse tracked name
        mesociclo   = _currentMesociclo;
        workoutName = _currentWorkoutName;
      } else {
        continue; // can't determine workout name
      }
    } else if (col0 && col0.includes(" - ")) {
      // LEGACY FORMAT: col0=FullWorkoutName (e.g. "RUN B1 - LENTO 4K")
      offset      = 1;
      mesociclo   = col0.split(" - ")[0].trim();
      workoutName = col0;
      _currentWorkoutName = workoutName;
      _currentMesociclo   = mesociclo;
    } else {
      continue; // empty row
    }

    if (!workoutName) continue;

    if (!runWorkouts[workoutName]) {
      runWorkouts[workoutName] = { mesociclo: mesociclo, phases: [] };
    }

    runWorkouts[workoutName].phases.push({
      index:       parseInt(row[offset])     || 0,
      loopGroup:   row[offset + 1]           || null,
      loopCount:   parseInt(row[offset + 2]) || 1,
      value:       row[offset + 3]           || null,
      unit:        (row[offset + 4] || "").toString().trim(),
      zone:        row[offset + 5]           || null,
      section:     (row[offset + 6] || "").toString().trim(),
      description: (row[offset + 7] || "").toString().trim()
    });
  }

  // Sort by PhaseOrder
  Object.keys(runWorkouts).forEach(name => {
    runWorkouts[name].phases.sort((a, b) => (a.index || 0) - (b.index || 0));
  });

  return runWorkouts;
}

// V8: Plans sheet has PlanName | Mesociclo1 | Mesociclo2 | ...
// Each mesociclo expands to all workouts that start with that mesociclo name, sorted by Timing
function loadAllPlans(ss, workouts, runWorkouts) {
  const plansSheet = ss.getSheetByName("Plans");
  if (!plansSheet) return {};

  const plansData = plansSheet.getDataRange().getValues();
  const plans     = {};

  // Build mesociclo → sorted workout names index for fast lookup
  const mesocicloIndex = buildMesocicloIndex(workouts, runWorkouts);

  for (let i = 1; i < plansData.length; i++) {
    const row      = plansData[i];
    const planName = (row[0] || "").toString().trim();
    if (!planName) continue;

    const planWorkouts = [];

    // Read mesociclo columns (starting col 1)
    for (let col = 1; col < row.length; col++) {
      const mesociclo = (row[col] || "").toString().trim();
      if (!mesociclo || isDate(mesociclo)) continue;

      // Expand mesociclo → ordered list of workouts
      const expanded = mesocicloIndex[mesociclo] || [];
      if (expanded.length === 0) {
        Logger.log("WARNING: Mesociclo '" + mesociclo + "' in plan '" + planName + "' has no workouts");
      }

      expanded.forEach(w => {
        planWorkouts.push({
          index: planWorkouts.length + 1,
          name:  w.name,
          type:  w.type
        });
      });
    }

    plans[planName] = {
      workouts:      planWorkouts,
      totalWorkouts: planWorkouts.length
    };
  }

  return plans;
}

// Build index: mesocicloName → [ { name, type }, ... ] sorted by timing
function buildMesocicloIndex(workouts, runWorkouts) {
  const index = {};

  const ss           = SpreadsheetApp.getActiveSpreadsheet();
  const workoutSheet = ss.getSheetByName("Workouts");
  const data         = workoutSheet.getDataRange().getValues();

  // mesociclo → { workoutName → timing string } to sort
  const mesoMap = {};

  for (let i = 1; i < data.length; i++) {
    const row         = data[i];
    const mesociclo   = (row[0] || "").toString().trim();
    const timing      = (row[1] || "").toString().trim();
    const workoutName = (row[2] || "").toString().trim();
    if (!mesociclo || !workoutName) continue;

    if (!mesoMap[mesociclo]) mesoMap[mesociclo] = {};
    mesoMap[mesociclo][workoutName] = timing;
  }

  // Build sorted arrays for each mesociclo
  for (const mesociclo in mesoMap) {
    const entries = Object.entries(mesoMap[mesociclo]);
    entries.sort((a, b) => sortTiming(a[1], b[1]));

    index[mesociclo] = entries.map(([name]) => ({
      name: name,
      type: workouts[name] ? "muscle" : (runWorkouts && runWorkouts[name] ? "run" : "unknown")
    }));
  }

  // Also index run workouts by their mesociclo column
  if (runWorkouts) {
    const runMesoMap = {};
    const runSheet   = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("RunWorkouts");
    if (runSheet) {
      const runData = runSheet.getDataRange().getValues();
      for (let i = 1; i < runData.length; i++) {
        const row  = runData[i];
        const col0 = (row[0] || "").toString().trim();
        const col1 = (row[1] || "").toString().trim();
        const col2 = (row[2] || "").toString().trim();
        const meso = col0;
        const name = (col2 && col2.includes(" - ")) ? col2 : (col0 && col1 && !col0.includes(" - ") ? col0 + " - " + col1 : col0);
        if (!meso || !name || name === meso) continue;
        if (!runMesoMap[meso]) runMesoMap[meso] = [];
        if (!runMesoMap[meso].includes(name)) runMesoMap[meso].push(name);
      }
    }
    for (const meso in runMesoMap) {
      if (!index[meso]) index[meso] = [];
      runMesoMap[meso].forEach(name => {
        index[meso].push({ name: name, type: "run" });
      });
    }
  }

  return index;
}

// Sort timing strings like "wk1 day1", "wk2 d1", "1 wk1 d1" etc.
function sortTiming(a, b) {
  const nums = s => (s || "").replace(/[^\d ]/g, " ").trim().split(/\s+/).map(Number);
  const an = nums(a);
  const bn = nums(b);
  for (let i = 0; i < Math.max(an.length, bn.length); i++) {
    const diff = (an[i] || 0) - (bn[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

// Returns { email: { fullName, scadenza, nutritionPdfUrl, nutritionScadenza, plans: [...] } }
function loadAllUsers(ss, plans) {
  const sheet    = ss.getSheetByName("Users");
  const data     = sheet.getDataRange().getValues();
  const headers  = data[0];
  const userMap  = {};

  const cols = parseUserHeaders(headers);

  for (let k = 1; k < data.length; k++) {
    const row       = data[k];
    const userEmail = (row[cols.email] || "").toString().trim().toLowerCase();
    if (!userEmail) continue;

    const userPlans = [];
    for (let col = cols.firstPlan; col < row.length; col++) {
      const planName = (row[col] || "").toString().trim();
      if (planName && !isDate(planName) && plans[planName]) {
        userPlans.push(planName);
      }
    }

    userMap[userEmail] = {
      fullName:         (row[cols.name] || "").toString().trim(),
      scadenza:         row[cols.scadenza] || "",
      nutritionPdfUrl:  (row[cols.nutritionPdf] || "").toString().trim(),
      nutritionScadenza: row[cols.nutritionScadenza] || "",
      plans:            userPlans
    };
  }

  return userMap;
}

// Parse Users sheet headers to get column indices
function parseUserHeaders(headers) {
  let name = 0, email = 1, nutritionPdf = 2, nutritionScadenza = 3, scadenza = 4, firstPlan = 5;
  for (let h = 0; h < headers.length; h++) {
    const hdr = (headers[h] || "").toString().toLowerCase().trim();
    if (hdr === "utente" || hdr === "nome" || hdr === "name")                         name = h;
    else if (hdr === "email" || hdr === "e-mail")                                     email = h;
    else if (hdr.includes("nutrition") && hdr.includes("pdf"))                        nutritionPdf = h;
    else if (hdr.includes("nutrition") && hdr.includes("scadenza"))                   nutritionScadenza = h;
    else if (hdr === "scadenza" || hdr === "expiration" || hdr === "expires") {
      scadenza  = h;
      firstPlan = h + 1;
    }
  }
  return { name, email, nutritionPdf, nutritionScadenza, scadenza, firstPlan };
}

// ═══════════════════════════════════════════════════════════════════════════
// FAST USER DATA ENDPOINT (V8)
// Returns only data needed for a specific user
// ═══════════════════════════════════════════════════════════════════════════

function getUserDataFast(params) {
  const startTime = new Date();
  const email     = (params.email || "").trim().toLowerCase();

  if (!email || !email.includes('@')) {
    return createResponse({ status: 'error', message: 'Invalid email' });
  }

  Logger.log("getUserDataFast V8 for: " + email);
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. Find user & their plan names
  const userSheet  = ss.getSheetByName("Users");
  const userData   = userSheet.getDataRange().getValues();
  const cols       = parseUserHeaders(userData[0]);

  let userInfo     = null;
  let userPlanNames = [];

  for (let k = 1; k < userData.length; k++) {
    const row      = userData[k];
    const rowEmail = (row[cols.email] || "").toString().trim().toLowerCase();
    if (rowEmail !== email) continue;

    userInfo = {
      fullName:          (row[cols.name] || "").toString().trim(),
      scadenza:          row[cols.scadenza] || "",
      nutritionPdfUrl:   (row[cols.nutritionPdf] || "").toString().trim(),
      nutritionScadenza: row[cols.nutritionScadenza] || ""
    };

    for (let col = cols.firstPlan; col < row.length; col++) {
      const planName = (row[col] || "").toString().trim();
      if (planName && !isDate(planName)) userPlanNames.push(planName);
    }
    break;
  }

  if (!userInfo) return createResponse({ status: 'error', message: 'User not found' });

  // 2. Load plans for this user + get needed mesocicli
  const plansSheet  = ss.getSheetByName("Plans");
  const plans       = {};
  const neededMesos = new Set();

  if (plansSheet && userPlanNames.length > 0) {
    const plansData = plansSheet.getDataRange().getValues();
    for (let i = 1; i < plansData.length; i++) {
      const row      = plansData[i];
      const planName = (row[0] || "").toString().trim();
      if (!planName || !userPlanNames.includes(planName)) continue;

      // Collect mesocicli for this plan
      const planMesos = [];
      for (let col = 1; col < row.length; col++) {
        const meso = (row[col] || "").toString().trim();
        if (!meso || isDate(meso)) continue;
        planMesos.push(meso);
        neededMesos.add(meso);
      }
      plans[planName] = { mesocicli: planMesos, workouts: [], totalWorkouts: 0 };
    }
  }

  // 3. Load only needed workout rows (filtered by mesociclo)
  const exerciseLibrary = loadExerciseLibrary(ss);
  const workouts        = {};
  const mesoTimingMap   = {}; // mesociclo → { workoutName → timing }

  if (neededMesos.size > 0) {
    const workoutData = ss.getSheetByName("Workouts").getDataRange().getValues();

    for (let i = 1; i < workoutData.length; i++) {
      const row         = workoutData[i];
      const mesociclo   = (row[0] || "").toString().trim();
      const timing      = (row[1] || "").toString().trim();
      const workoutName = (row[2] || "").toString().trim();
      const exercise    = (row[4] || "").toString().trim();
      const fullDur     = parseInt(row[5]) || 0;
      const tipoDiPeso  = normalizeTipoDiPeso(row[6], exercise);
      const rounds      = normalizeRounds(row[7]);
      const reps        = normalizeReps(row[8]);
      const block       = (row[3] || "").toString().trim();

      if (!neededMesos.has(mesociclo) || !workoutName || !exercise) continue;

      // Track timing for sorting
      if (!mesoTimingMap[mesociclo]) mesoTimingMap[mesociclo] = {};
      mesoTimingMap[mesociclo][workoutName] = timing;

      if (!workouts[workoutName]) workouts[workoutName] = { exercises: [], instructions: "" };

      const info = exerciseLibrary[exercise] || {};
      workouts[workoutName].exercises.push({
        name:        exercise,
        duration:    fullDur,
        imageUrl:    info.imageUrl    || "",
        block:       block,
        tipoDiPeso:  tipoDiPeso,
        rounds:      rounds,
        reps:        reps,
        audio:       info.audio       || "",
        audioCambio: info.audioCambio || ""
      });
    }

    // Load instructions
    const instrSheet = ss.getSheetByName("Instructions");
    if (instrSheet) {
      const instrData = instrSheet.getDataRange().getValues();
      for (let j = 1; j < instrData.length; j++) {
        const name = (instrData[j][0] || "").toString().trim();
        if (workouts[name]) workouts[name].instructions = instrData[j][1] || "";
      }
    }
  }

  // 4. Load needed run workouts
  const runWorkouts = {};
  const runMesoMap  = {}; // mesociclo → [workoutName, ...] in sheet order
  const runSheet    = ss.getSheetByName("RunWorkouts");

  if (runSheet && neededMesos.size > 0) {
    const runData = runSheet.getDataRange().getValues();
    let _curRunName = null, _curRunMeso = null;
    for (let i = 1; i < runData.length; i++) {
      const row  = runData[i];
      const col0 = (row[0] || "").toString().trim();
      const col1r = (row[1] || "").toString().trim();
      const col2 = (row[2] || "").toString().trim();

      let wMeso, wName, offset;

      if (col0 && !col0.includes(" - ")) {
        offset = 3;
        if (col1r) {
          wMeso = col0;
          wName = (col2 && col2.includes(" - ")) ? col2 : (col0 + " - " + col1r);
          _curRunMeso = wMeso; _curRunName = wName;
        } else if (_curRunName && _curRunMeso === col0) {
          wMeso = _curRunMeso; wName = _curRunName;
        } else {
          continue;
        }
      } else if (col0 && col0.includes(" - ")) {
        offset = 1;
        wMeso = col0.split(" - ")[0].trim(); wName = col0;
        _curRunName = wName; _curRunMeso = wMeso;
      } else {
        continue;
      }

      if (!wName || !wMeso) continue;
      if (!neededMesos.has(wMeso)) continue;

      if (!runMesoMap[wMeso]) runMesoMap[wMeso] = [];
      if (!runMesoMap[wMeso].includes(wName)) runMesoMap[wMeso].push(wName);

      if (!runWorkouts[wName]) runWorkouts[wName] = { phases: [] };
      runWorkouts[wName].phases.push({
        index:       parseInt(row[offset])     || 0,
        loopGroup:   row[offset + 1]           || null,
        loopCount:   parseInt(row[offset + 2]) || 1,
        value:       row[offset + 3]           || null,
        unit:        (row[offset + 4] || "").toString().trim(),
        zone:        row[offset + 5]           || null,
        section:     (row[offset + 6] || "").toString().trim(),
        description: (row[offset + 7] || "").toString().trim()
      });
    }
    Object.keys(runWorkouts).forEach(n => {
      runWorkouts[n].phases.sort((a, b) => (a.index || 0) - (b.index || 0));
    });
  }

  // 5. Expand plans: mesociclo → sorted workout list
  for (const planName in plans) {
    const planWorkouts = [];
    plans[planName].mesocicli.forEach(meso => {
      // Muscle workouts
      const timingMap = mesoTimingMap[meso] || {};
      const entries   = Object.entries(timingMap);
      entries.sort((a, b) => sortTiming(a[1], b[1]));
      entries.forEach(([wName]) => {
        planWorkouts.push({ index: planWorkouts.length + 1, name: wName, type: "muscle" });
      });
      // Run workouts
      (runMesoMap[meso] || []).forEach(wName => {
        planWorkouts.push({ index: planWorkouts.length + 1, name: wName, type: "run" });
      });
    });
    plans[planName].workouts      = planWorkouts;
    plans[planName].totalWorkouts = planWorkouts.length;
    delete plans[planName].mesocicli;
  }

  // 6. Load user progress
  const progressSheet = ss.getSheetByName("UserProgress");
  const userProgress  = {};
  if (progressSheet) {
    const progressData = progressSheet.getDataRange().getValues();
    for (let i = 1; i < progressData.length; i++) {
      const rowEmail = (progressData[i][0] || "").toString().trim().toLowerCase();
      if (rowEmail !== email) continue;
      const planName = (progressData[i][1] || "").toString().trim();
      userProgress[planName] = {
        lastWorkoutIndex: parseInt(progressData[i][2]) || 0,
        totalWorkouts:    parseInt(progressData[i][3]) || 0,
        lastUpdated:      progressData[i][4] || null
      };
    }
  }

  const duration = new Date() - startTime;
  Logger.log("getUserDataFast V8 completed in " + duration + "ms");

  return ContentService
    .createTextOutput(JSON.stringify({
      status: 'success',
      user: {
        email,
        fullName:          userInfo.fullName,
        scadenza:          userInfo.scadenza,
        nutritionPdfUrl:   userInfo.nutritionPdfUrl,
        nutritionScadenza: userInfo.nutritionScadenza,
        plans:             userPlanNames
      },
      plans,
      workouts,
      runWorkouts,
      progress: userProgress,
      loadTime: duration
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ═══════════════════════════════════════════════════════════════════════════
// V8.2: SPLIT ENDPOINTS — Light (dashboard) + Heavy (training)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * V8.2 LIGHT: User info + plan names + progress only.
 * Reads: Users, Plans (names only, no mesociclo expansion), UserProgress.
 * Dashboard needs nothing more. ~700ms instead of ~3500ms.
 */
function getUserInfoLight(params) {
  const startTime = new Date();
  const email     = (params.email || "").trim().toLowerCase();
  if (!email || !email.includes('@')) return createResponse({ status: 'error', message: 'Invalid email' });

  Logger.log("getUserInfoLight V8 for: " + email);
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. Find user
  const userSheet = ss.getSheetByName("Users");
  const userData  = userSheet.getDataRange().getValues();
  const cols      = parseUserHeaders(userData[0]);

  let userInfo = null;
  let userPlanNames = [];

  for (let k = 1; k < userData.length; k++) {
    const row = userData[k];
    if ((row[cols.email] || "").toString().trim().toLowerCase() !== email) continue;
    userInfo = {
      fullName:          (row[cols.name] || "").toString().trim(),
      scadenza:          row[cols.scadenza] || "",
      nutritionPdfUrl:   (row[cols.nutritionPdf] || "").toString().trim(),
      nutritionScadenza: row[cols.nutritionScadenza] || ""
    };
    for (let col = cols.firstPlan; col < row.length; col++) {
      const pn = (row[col] || "").toString().trim();
      if (pn && !isDate(pn)) userPlanNames.push(pn);
    }
    break;
  }

  if (!userInfo) return createResponse({ status: 'error', message: 'User not found' });

  // 2. Plans — just names, no mesociclo expansion (lightweight)
  const plans = {};
  const plansSheet = ss.getSheetByName("Plans");
  if (plansSheet && userPlanNames.length > 0) {
    const plansData = plansSheet.getDataRange().getValues();
    for (let i = 1; i < plansData.length; i++) {
      const planName = (plansData[i][0] || "").toString().trim();
      if (!planName || !userPlanNames.includes(planName)) continue;
      // Just store mesociclo names — no workout expansion needed for dashboard
      const mesoNames = [];
      for (let col = 1; col < plansData[i].length; col++) {
        const m = (plansData[i][col] || "").toString().trim();
        if (m && !isDate(m)) mesoNames.push(m);
      }
      plans[planName] = { workouts: [], totalWorkouts: 0, mesocicli: mesoNames };
    }
  }

  // 3. Progress
  const userProgress = {};
  const progressSheet = ss.getSheetByName("UserProgress");
  if (progressSheet) {
    const progressData = progressSheet.getDataRange().getValues();
    for (let i = 1; i < progressData.length; i++) {
      if ((progressData[i][0] || "").toString().trim().toLowerCase() !== email) continue;
      const pn = (progressData[i][1] || "").toString().trim();
      userProgress[pn] = {
        lastWorkoutIndex: parseInt(progressData[i][2]) || 0,
        totalWorkouts:    parseInt(progressData[i][3]) || 0,
        lastUpdated:      progressData[i][4] || null
      };
    }
  }

  const duration = new Date() - startTime;
  Logger.log("getUserInfoLight V8 completed in " + duration + "ms");

  return ContentService
    .createTextOutput(JSON.stringify({
      status: 'success',
      user: { email, fullName: userInfo.fullName, scadenza: userInfo.scadenza,
              nutritionPdfUrl: userInfo.nutritionPdfUrl, nutritionScadenza: userInfo.nutritionScadenza,
              plans: userPlanNames },
      plans: plans,
      progress: userProgress,
      loadTime: duration
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * V8.2 HEAVY: Full workout data — exercises, images, audio, run phases.
 * Identical logic to getUserDataFast but called separately in background.
 * Returns plans (with expanded mesocicli), workouts, runWorkouts.
 */
function getWorkoutDataHeavy(params) {
  const startTime = new Date();
  const email     = (params.email || "").trim().toLowerCase();
  if (!email || !email.includes('@')) return createResponse({ status: 'error', message: 'Invalid email' });

  Logger.log("getWorkoutDataHeavy V8 for: " + email);
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. Find user's plan names
  const userSheet = ss.getSheetByName("Users");
  const userData  = userSheet.getDataRange().getValues();
  const cols      = parseUserHeaders(userData[0]);
  let userPlanNames = [];
  for (let k = 1; k < userData.length; k++) {
    if ((userData[k][cols.email] || "").toString().trim().toLowerCase() !== email) continue;
    for (let col = cols.firstPlan; col < userData[k].length; col++) {
      const pn = (userData[k][col] || "").toString().trim();
      if (pn && !isDate(pn)) userPlanNames.push(pn);
    }
    break;
  }
  if (userPlanNames.length === 0) return createResponse({ status: 'success', plans: {}, workouts: {}, runWorkouts: {}, loadTime: 0 });

  // 2. Get mesocicli from Plans sheet
  const plansSheet = ss.getSheetByName("Plans");
  const plans = {};
  const neededMesos = new Set();
  if (plansSheet) {
    const plansData = plansSheet.getDataRange().getValues();
    for (let i = 1; i < plansData.length; i++) {
      const planName = (plansData[i][0] || "").toString().trim();
      if (!planName || !userPlanNames.includes(planName)) continue;
      const planMesos = [];
      for (let col = 1; col < plansData[i].length; col++) {
        const m = (plansData[i][col] || "").toString().trim();
        if (m && !isDate(m)) { planMesos.push(m); neededMesos.add(m); }
      }
      plans[planName] = { mesocicli: planMesos, workouts: [], totalWorkouts: 0 };
    }
  }

  // 3. Load exercises + filtered workouts
  const exerciseLibrary = loadExerciseLibrary(ss);
  const workouts = {};
  const mesoTimingMap = {};

  if (neededMesos.size > 0) {
    const workoutData = ss.getSheetByName("Workouts").getDataRange().getValues();
    for (let i = 1; i < workoutData.length; i++) {
      const row       = workoutData[i];
      const mesociclo = (row[0] || "").toString().trim();
      const timing    = (row[1] || "").toString().trim();
      const wName     = (row[2] || "").toString().trim();
      const exercise  = (row[4] || "").toString().trim();
      const fullDur   = parseInt(row[5]) || 0;
      const block     = (row[3] || "").toString().trim();
      if (!neededMesos.has(mesociclo) || !wName || !exercise) continue;

      if (!mesoTimingMap[mesociclo]) mesoTimingMap[mesociclo] = {};
      mesoTimingMap[mesociclo][wName] = timing;

      if (!workouts[wName]) workouts[wName] = { exercises: [], instructions: "" };
      const info = exerciseLibrary[exercise] || {};
      workouts[wName].exercises.push({
        name: exercise, duration: fullDur, imageUrl: info.imageUrl || "",
        block: block, tipoDiPeso: normalizeTipoDiPeso(row[6], exercise),
        rounds: normalizeRounds(row[7]), reps: normalizeReps(row[8]),
        audio: info.audio || "", audioCambio: info.audioCambio || ""
      });
    }

    const instrSheet = ss.getSheetByName("Instructions");
    if (instrSheet) {
      const instrData = instrSheet.getDataRange().getValues();
      for (let j = 1; j < instrData.length; j++) {
        const n = (instrData[j][0] || "").toString().trim();
        if (workouts[n]) workouts[n].instructions = instrData[j][1] || "";
      }
    }
  }

  // 4. Run workouts
  const runWorkouts = {};
  const runMesoMap = {};
  const runSheet = ss.getSheetByName("RunWorkouts");
  if (runSheet && neededMesos.size > 0) {
    const runData = runSheet.getDataRange().getValues();
    let _crn = null, _crm = null;
    for (let i = 1; i < runData.length; i++) {
      const row = runData[i];
      const c0 = (row[0] || "").toString().trim();
      const c1 = (row[1] || "").toString().trim();
      const c2 = (row[2] || "").toString().trim();
      let wM, wN, off;
      if (c0 && !c0.includes(" - ")) {
        off = 3;
        if (c1) { wM = c0; wN = (c2 && c2.includes(" - ")) ? c2 : (c0 + " - " + c1); _crm = wM; _crn = wN; }
        else if (_crn && _crm === c0) { wM = _crm; wN = _crn; }
        else continue;
      } else if (c0 && c0.includes(" - ")) {
        off = 1; wM = c0.split(" - ")[0].trim(); wN = c0; _crn = wN; _crm = wM;
      } else continue;
      if (!wN || !wM || !neededMesos.has(wM)) continue;
      if (!runMesoMap[wM]) runMesoMap[wM] = [];
      if (!runMesoMap[wM].includes(wN)) runMesoMap[wM].push(wN);
      if (!runWorkouts[wN]) runWorkouts[wN] = { phases: [] };
      runWorkouts[wN].phases.push({
        index: parseInt(row[off]) || 0, loopGroup: row[off+1] || null,
        loopCount: parseInt(row[off+2]) || 1, value: row[off+3] || null,
        unit: (row[off+4] || "").toString().trim(), zone: row[off+5] || null,
        section: (row[off+6] || "").toString().trim(), description: (row[off+7] || "").toString().trim()
      });
    }
    Object.keys(runWorkouts).forEach(n => runWorkouts[n].phases.sort((a,b) => (a.index||0) - (b.index||0)));
  }

  // 5. Expand plans
  for (const planName in plans) {
    const pw = [];
    plans[planName].mesocicli.forEach(meso => {
      const tm = mesoTimingMap[meso] || {};
      const entries = Object.entries(tm);
      entries.sort((a, b) => sortTiming(a[1], b[1]));
      entries.forEach(([wn]) => pw.push({ index: pw.length + 1, name: wn, type: "muscle" }));
      (runMesoMap[meso] || []).forEach(wn => pw.push({ index: pw.length + 1, name: wn, type: "run" }));
    });
    plans[planName].workouts = pw;
    plans[planName].totalWorkouts = pw.length;
    delete plans[planName].mesocicli;
  }

  const duration = new Date() - startTime;
  Logger.log("getWorkoutDataHeavy V8 completed in " + duration + "ms");

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
// USER WEIGHTS
// ═══════════════════════════════════════════════════════════════════════════

function getWeightsSheet() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  let   sheet = ss.getSheetByName("UserWeights");
  if (!sheet) {
    sheet = ss.insertSheet("UserWeights");
    sheet.getRange(1, 1, 1, 3).setValues([["Email", "Weights", "LastUpdated"]]);
  }
  return sheet;
}

function saveUserWeights(params) {
  try {
    const email       = (params.email || "").trim().toLowerCase();
    const weightsJson = params.weights || "{}";
    if (!email || !email.includes('@')) return createResponse({ status: 'error', message: 'Invalid email' });

    const sheet = getWeightsSheet();
    const data  = sheet.getDataRange().getValues();
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if ((data[i][0] || "").toString().trim().toLowerCase() === email) { rowIndex = i + 1; break; }
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
    if (!email || !email.includes('@')) return createResponse({ status: 'error', message: 'Invalid email' });

    const sheet = getWeightsSheet();
    const data  = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if ((data[i][0] || "").toString().trim().toLowerCase() === email) {
        return createResponse({ status: 'success', weights: JSON.parse(data[i][1] || "{}"), lastUpdated: data[i][2] });
      }
    }
    return createResponse({ status: 'success', weights: {}, message: 'No weights found' });
  } catch (error) {
    return createResponse({ status: 'error', message: error.toString() });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// USER PROGRESS
// ═══════════════════════════════════════════════════════════════════════════

function getProgressSheet() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  let   sheet = ss.getSheetByName("UserProgress");
  if (!sheet) {
    sheet = ss.insertSheet("UserProgress");
    sheet.getRange(1, 1, 1, 5).setValues([["Email", "PlanName", "LastWorkoutIndex", "TotalWorkouts", "LastUpdated"]]);
  }
  return sheet;
}

function saveLastWorkout(params) {
  try {
    const email            = (params.email || "").trim().toLowerCase();
    const planName         = (params.planName || "").trim();
    const lastWorkoutIndex = parseInt(params.lastWorkoutIndex) || 0;
    const totalWorkouts    = parseInt(params.totalWorkouts) || (lastWorkoutIndex + 1);

    if (!email || !email.includes('@')) return createResponse({ status: 'error', message: 'Invalid email' });
    if (!planName)                       return createResponse({ status: 'error', message: 'Plan name required' });

    const sheet = getProgressSheet();
    const data  = sheet.getDataRange().getValues();
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if ((data[i][0] || "").toString().trim().toLowerCase() === email &&
          (data[i][1] || "").toString().trim() === planName) {
        rowIndex = i + 1; break;
      }
    }
    const now = new Date().toISOString();
    if (rowIndex > 0) {
      sheet.getRange(rowIndex, 3).setValue(lastWorkoutIndex);
      sheet.getRange(rowIndex, 4).setValue(totalWorkouts);
      sheet.getRange(rowIndex, 5).setValue(now);
    } else {
      sheet.appendRow([email, planName, lastWorkoutIndex, totalWorkouts, now]);
    }
    bustUserCache(email);
    return createResponse({ status: 'success', planName, lastWorkoutIndex, totalWorkouts });
  } catch (error) {
    return createResponse({ status: 'error', message: error.toString() });
  }
}

function getLastWorkout(params) {
  try {
    const email    = (params.email || "").trim().toLowerCase();
    const planName = (params.planName || "").trim();
    if (!email || !email.includes('@')) return createResponse({ status: 'error', message: 'Invalid email' });
    if (!planName)                       return createResponse({ status: 'error', message: 'Plan name required' });

    const sheet = getProgressSheet();
    const data  = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if ((data[i][0] || "").toString().trim().toLowerCase() === email &&
          (data[i][1] || "").toString().trim() === planName) {
        return createResponse({
          status: 'success', planName,
          lastWorkoutIndex: parseInt(data[i][2]) || 0,
          totalWorkouts:    parseInt(data[i][3]) || 0,
          lastUpdated:      data[i][4] || null
        });
      }
    }
    return createResponse({ status: 'success', planName, lastWorkoutIndex: -1, totalWorkouts: 0, message: 'No progress found' });
  } catch (error) {
    return createResponse({ status: 'error', message: error.toString() });
  }
}

function getAllUserProgress(params) {
  try {
    const email = (params.email || "").trim().toLowerCase();
    if (!email || !email.includes('@')) return createResponse({ status: 'error', message: 'Invalid email' });

    const sheet       = getProgressSheet();
    const data        = sheet.getDataRange().getValues();
    const allProgress = {};
    for (let i = 1; i < data.length; i++) {
      if ((data[i][0] || "").toString().trim().toLowerCase() !== email) continue;
      const planName = (data[i][1] || "").toString().trim();
      allProgress[planName] = {
        lastWorkoutIndex: parseInt(data[i][2]) || 0,
        totalWorkouts:    parseInt(data[i][3]) || 0,
        lastUpdated:      data[i][4] || null
      };
    }
    return createResponse({ status: 'success', progress: allProgress });
  } catch (error) {
    return createResponse({ status: 'error', message: error.toString() });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// POST / USER MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.action === 'addTrialUser')      return addTrialUser(data);
    if (data.action === 'updateSubscription') return updateSubscription(data);
    if (data.action === 'saveLastWorkout')   return saveLastWorkout(data);
    if (data.action === 'addPlanToUser')     return addPlanToUser(data);
    if (data.action === 'list-users')        return syncListUsers(data);
    if (data.action === 're-add-user')       return syncReAddUser(data);
    if (data.action === 'delete-user')       return syncDeleteUser(data);
    if (data.action === 'ensureUserInSheet') return ensureUserInSheet(data);
    if (data.action === 'list-plans')        return syncListPlans(data);
    if (data.action === 'submitQuestionnaire') return submitQuestionnaire(data);
    return createResponse({ status: 'error', message: 'Unknown action' });
  } catch (error) {
    return createResponse({ status: 'error', message: error.toString() });
  }
}

function addTrialUser(data) {
  const ss          = SpreadsheetApp.getActiveSpreadsheet();
  const userSheet   = ss.getSheetByName("Users");
  const email       = (data.email || "").trim().toLowerCase();
  const name        = data.name || "";
  const defaultPlan = data.defaultPlan || "Free Trial";

  if (!email || !email.includes('@')) return createResponse({ status: 'error', message: 'Invalid email' });

  const userData = userSheet.getDataRange().getValues();
  for (let i = 1; i < userData.length; i++) {
    if ((userData[i][1] || "").toString().trim().toLowerCase() === email) {
      return createResponse({ status: 'info', message: 'User exists', email });
    }
  }

  const trialEndDate = new Date();
  trialEndDate.setDate(trialEndDate.getDate() + 7);
  userSheet.appendRow([name, email, "", "", trialEndDate, defaultPlan]);
  return createResponse({ status: 'success', message: 'Trial activated', email });
}

function updateSubscription(data) {
  const ss        = SpreadsheetApp.getActiveSpreadsheet();
  const userSheet = ss.getSheetByName("Users");
  const email     = (data.email || "").trim().toLowerCase();
  const planType  = data.planType;
  if (!email) return createResponse({ status: 'error', message: 'Email required' });

  const today         = new Date();
  let   newExpiration = new Date(today);
  if (planType === 'quarterly') newExpiration.setMonth(newExpiration.getMonth() + 3);
  else if (planType === 'annual') newExpiration.setFullYear(newExpiration.getFullYear() + 1);
  else newExpiration.setMonth(newExpiration.getMonth() + 1);

  const userData = userSheet.getDataRange().getValues();
  for (let i = 1; i < userData.length; i++) {
    if ((userData[i][1] || "").toString().trim().toLowerCase() === email) {
      userSheet.getRange(i + 1, 5).setValue(newExpiration);
      return createResponse({ status: 'success', newExpiration });
    }
  }
  userSheet.appendRow([email, email, "", "", newExpiration, "Free Trial"]);
  return createResponse({ status: 'success', newExpiration });
}

// ═══════════════════════════════════════════════════════════════════════════
// SHOPIFY INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════

function addPlanToUser(data) {
  try {
    const email    = (data.email || "").trim().toLowerCase();
    const planName = (data.planName || "").trim();
    const fullName = (data.fullName || "").trim();

    Logger.log("addPlanToUser V8: email=" + email + " plan=" + planName);

    if (!email || !email.includes('@')) return createResponse({ status: 'error', message: 'Invalid email' });
    if (!planName)                       return createResponse({ status: 'error', message: 'Plan name required' });

    const ss        = SpreadsheetApp.getActiveSpreadsheet();
    const userSheet = ss.getSheetByName("Users");
    const userData  = userSheet.getDataRange().getValues();
    const cols      = parseUserHeaders(userData[0]);

    let userRowIndex = -1;
    for (let i = 1; i < userData.length; i++) {
      if ((userData[i][cols.email] || "").toString().trim().toLowerCase() === email) {
        userRowIndex = i + 1; break;
      }
    }

    if (userRowIndex > 0) {
      const row           = userData[userRowIndex - 1];
      const existingPlans = [];
      for (let col = cols.firstPlan; col < row.length; col++) {
        const val = (row[col] || "").toString().trim();
        if (val) existingPlans.push(val);
      }
      if (existingPlans.includes(planName)) {
        return createResponse({ status: 'info', message: 'User already has this plan', email, planName });
      }
      userSheet.getRange(userRowIndex, cols.firstPlan + existingPlans.length + 1).setValue(planName);
      bustUserCache(email);
      return createResponse({ status: 'success', message: 'Plan added to existing user', email, planName, isNewUser: false });
    } else {
      const displayName = fullName || email.split('@')[0];
      userSheet.appendRow([displayName, email, "", "", "", planName]);
      if (data.tempPassword) sendWelcomeEmail(email, displayName, planName, data.tempPassword);
      return createResponse({ status: 'success', message: 'New user created with plan', email, planName, isNewUser: true });
      bustUserCache(email);
    }
  } catch (error) {
    return createResponse({ status: 'error', message: error.toString() });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// WELCOME EMAIL
// ═══════════════════════════════════════════════════════════════════════════

function sendWelcomeEmail(email, name, planName, tempPassword) {
  try {
    const qUrl = 'https://viltrumfitness.com/pages/questionario.html?email=' + encodeURIComponent(email);
    const appUrl = 'https://viltrumfitness.com/';
    const htmlBody = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#000;color:#fff;padding:40px;border-radius:12px;">
        <div style="text-align:center;margin-bottom:30px;">
          <h1 style="font-size:28px;margin:0;letter-spacing:2px;">VILTRUM FITNESS</h1>
          <p style="color:#888;font-size:12px;margin-top:5px;">NO SHORTCUTS. ALL SWEAT. NO TALKS, JUST REPS.</p>
        </div>
        <h2 style="color:#4CAF50;">Ciao ${name}! 💪</h2>
        <p>Grazie per aver acquistato <strong style="color:#4CAF50;">${planName}</strong>.</p>

        <div style="background:#111;border:1px solid #333;border-radius:8px;padding:20px;margin:25px 0;">
          <h3 style="color:#FFD700;margin-top:0;">⚡ Step 1 — Personalizza il tuo piano</h3>
          <p>Compila il questionario per ricevere un piano cucito su di te. Il coach lo rivede entro 24h.</p>
          <div style="text-align:center;margin:15px 0;">
            <a href="${qUrl}" style="display:inline-block;background:#FFD700;color:#000;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;">
              COMPILA QUESTIONARIO →
            </a>
          </div>
        </div>

        <div style="background:#111;border:1px solid #333;border-radius:8px;padding:20px;margin:25px 0;">
          <h3 style="color:#4CAF50;margin-top:0;">⚡ Step 2 — Accedi all'app</h3>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Password temporanea:</strong> <code style="background:#222;padding:4px 8px;border-radius:4px;color:#4CAF50;">${tempPassword}</code></p>
          <div style="text-align:center;margin:15px 0;">
            <a href="${appUrl}" style="display:inline-block;background:#4CAF50;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;">
              APRI VILTRUM FITNESS
            </a>
          </div>
          <p style="font-size:12px;color:#888;text-align:center;margin-top:10px;">I workout appariranno appena il coach attiva il tuo piano personalizzato.</p>
        </div>

        <p style="font-size:12px;color:#666;text-align:center;">Viltrum Fitness — Il tuo percorso inizia ora.</p>
      </div>`;
    GmailApp.sendEmail(email, "🏋️ Benvenuto in Viltrum Fitness — Step 1: questionario", "", { htmlBody });
  } catch (error) {
    Logger.log("Failed to send welcome email: " + error.toString());
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function isDate(value) {
  if (!value) return false;
  if (value instanceof Date) return true;
  const str = value.toString();
  return str.match(/^\d{1,2}\/\d{1,2}\/\d{4}/) ||
         str.match(/\d{4}-\d{2}-\d{2}/) ||
         str.toLowerCase().includes('gmt');
}

function createResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Normalize tipoDiPeso: Google Sheets stores "60%" as 0.6 (number).
 * Converts to "60% ExerciseName" so frontend can calculate weight from user maxes.
 */
function normalizeTipoDiPeso(raw, exerciseName) {
  if (raw === null || raw === undefined || raw === "") return "";
  
  // Number between 0 and 1 → percentage from Sheets (0.6 = 60%)
  if (typeof raw === 'number' && raw > 0 && raw <= 1) {
    var pct = Math.round(raw * 100);
    var maxName = _exerciseToMaxName(exerciseName);
    return maxName ? (pct + "% " + maxName) : (pct + "%");
  }
  
  var str = raw.toString().trim();
  
  // Already has "XX% SomeName" → return as is
  if (str.match(/^\d+(?:\.\d+)?\s*%\s*.+$/)) return str;
  
  // Just "XX%" without name → add exercise name
  var pctOnly = str.match(/^(\d+(?:\.\d+)?)\s*%$/);
  if (pctOnly) {
    var maxName = _exerciseToMaxName(exerciseName);
    return maxName ? (pctOnly[1] + "% " + maxName) : str;
  }
  
  return str;
}

function _exerciseToMaxName(name) {
  if (!name) return null;
  var n = name.toString().toLowerCase().trim();
  if (n.includes('bench press') || n === 'bench press') return 'Bench Press';
  if (n.includes('back squat') || n === 'back squat') return 'Back Squat';
  if (n.includes('front squat') || n === 'front squat') return 'Front Squat';
  if (n.includes('deadlift') || n === 'deadlift') return 'Deadlift';
  if (n.includes('strict press') || n === 'strict press') return 'Bench Press';
  if (n.includes('push press') || n === 'push press') return 'Bench Press';
  return null;
}

/**
 * Normalize rounds: Sheets may store 6 as 0.06 if column has percentage format.
 * Also handles string "6", etc.
 */
function normalizeRounds(raw) {
  if (raw === null || raw === undefined || raw === "") return 1;
  
  var num = typeof raw === 'number' ? raw : parseFloat(raw);
  if (isNaN(num) || num <= 0) return 1;
  
  // If between 0 and 1 (exclusive), likely percentage-formatted: 0.03 = 3, 0.06 = 6
  if (num > 0 && num < 1) {
    var recovered = Math.round(num * 100);
    if (recovered >= 1 && recovered <= 20) return recovered; // reasonable rounds range
  }
  
  return Math.round(num) || 1;
}

/**
 * Normalize reps: Sheets may store "10" as number, "10 - 8 - 6" as string, or "Max" as string.
 * Also handles percentage-formatted numbers (0.1 → "10", 0.06 → "6").
 */
function normalizeReps(raw) {
  if (raw === null || raw === undefined || raw === "") return "";
  
  // If it's a number between 0 and 1, might be percentage-formatted
  if (typeof raw === 'number' && raw > 0 && raw < 1) {
    return Math.round(raw * 100).toString();
  }
  
  return raw.toString().trim();
}

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN / DEBUG
// ═══════════════════════════════════════════════════════════════════════════

function testV8DataStructure() {
  const ss              = SpreadsheetApp.getActiveSpreadsheet();
  const exerciseLibrary = loadExerciseLibrary(ss);
  const workouts        = loadAllMuscleWorkouts(ss, exerciseLibrary);
  const runWorkouts     = loadAllRunWorkouts(ss);
  const plans           = loadAllPlans(ss, workouts, runWorkouts);
  const users           = loadAllUsers(ss, plans);

  Logger.log("=== V8 Data Structure Test ===");
  Logger.log("Muscle Workouts: " + Object.keys(workouts).length);
  Logger.log("Run Workouts:    " + Object.keys(runWorkouts).length);
  Logger.log("Plans:           " + Object.keys(plans).length);
  Logger.log("Users:           " + Object.keys(users).length);

  for (const planName in plans) {
    Logger.log("\nPlan: " + planName + " → " + plans[planName].totalWorkouts + " workouts");
    plans[planName].workouts.slice(0, 3).forEach(w => Logger.log("  " + w.index + ". " + w.name + " [" + w.type + "]"));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SELETTORE — AGGIUNGI BLOCCO
// ═══════════════════════════════════════════════════════════════════════════

function aggiungiBloccoDaSelettore() {
  const ss          = SpreadsheetApp.getActiveSpreadsheet();
  const selSheet    = ss.getSheetByName("Selettore");
  const workoutsSheet = ss.getSheetByName("Workouts");

  if (!selSheet || !workoutsSheet) {
    SpreadsheetApp.getUi().alert("❌ Sheets non trovati. Controlla i nomi: Selettore, Workouts.");
    return;
  }

  // Read inputs
  const mesociclo   = (selSheet.getRange("B5").getValue() || "").toString().trim();
  const timing      = (selSheet.getRange("B6").getValue() || "").toString().trim();
  const workoutName = (selSheet.getRange("B7").getValue() || "").toString().trim();
  const blockRaw    = selSheet.getRange("B8").getValue();
  const blockNum    = blockRaw ? blockRaw.toString().trim() : "";

  if (!mesociclo) { SpreadsheetApp.getUi().alert("⚠️ Inserisci il Mesociclo in B5."); return; }
  if (!timing)    { SpreadsheetApp.getUi().alert("⚠️ Inserisci il Timing in B6."); return; }
  if (!blockNum)  { SpreadsheetApp.getUi().alert("⚠️ Seleziona o inserisci un Block in B8."); return; }

  // Read exercises directly from the Selettore "BLOCCHI DISPONIBILI" section (row 11+)
  // Columns: A=BlockNum | B=Exercise | C=Duration | D=TipoDiPeso | E=Rounds
  const selData = selSheet.getDataRange().getValues();
  const toAdd = [];

  for (let i = 10; i < selData.length; i++) { // row 11 = index 10
    const row = selData[i];
    const rowBlockNum = (row[0] || "").toString().trim();
    const esercizio   = (row[1] || "").toString().trim();
    if (rowBlockNum !== blockNum || !esercizio) continue;

    const tempo  = parseInt(row[2]) || 0;
    const peso   = (row[3] || "").toString().trim();
    const rounds = parseInt(row[4]) || 3;

    toAdd.push({ esercizio, tempo, peso, rounds });
  }

  if (toAdd.length === 0) {
    SpreadsheetApp.getUi().alert("⚠️ Nessun esercizio trovato per il blocco " + blockNum + " nel Selettore.");
    return;
  }

  // Find next sequential block number for this workout
  // Use column A (Mesociclo) to find real last row — column C has ARRAYFORMULA that fills empty rows
  const colA = workoutsSheet.getRange("A:A").getValues();
  let lastRealRow = 1;
  for (let i = colA.length - 1; i >= 1; i--) {
    if ((colA[i][0] || "").toString().trim() !== "") { lastRealRow = i + 1; break; }
  }
  const workoutsData = workoutsSheet.getRange(1, 1, lastRealRow, 9).getValues();
  let maxBlockNum = 0;
  for (let i = 1; i < workoutsData.length; i++) {
    if ((workoutsData[i][2] || "").toString().trim().toLowerCase() !== workoutName.toLowerCase()) continue;
    const blockStr = (workoutsData[i][3] || "").toString().trim();
    const match = blockStr.match(/Block\s+(\d+)/i);
    if (match) maxBlockNum = Math.max(maxBlockNum, parseInt(match[1]));
  }
  const nextBlockNum = maxBlockNum + 1;
  const blockLabel = "Block " + nextBlockNum;

  // Check if this block already exists
  const alreadyExists = workoutsData.some((row, idx) => {
    if (idx === 0) return false;
    return (row[2] || "").toString().trim().toLowerCase() === workoutName.toLowerCase() &&
           (row[3] || "").toString().trim().toLowerCase() === blockLabel.toLowerCase();
  });

  if (alreadyExists) {
    const ui = SpreadsheetApp.getUi();
    const response = ui.alert("⚠️ Blocco già presente",
      blockLabel + " esiste già nel workout \"" + workoutName + "\".\nVuoi aggiungerlo comunque?",
      ui.ButtonSet.YES_NO);
    if (response !== ui.Button.YES) return;
  }

  // Build rows — skip column C (Name) which has an ARRAYFORMULA
  const rowsAB = toAdd.map(ex => [mesociclo, timing]);  // Columns A-B
  const rowsDI = toAdd.map(ex => [blockLabel, ex.esercizio, ex.tempo, ex.peso, ex.rounds, ""]);  // Columns D-I

  // Find where to insert: after the last row of same mesociclo/timing
  let insertAfterRow = workoutsData.length; // default: after last data row
  
  // Look for last row with same mesociclo + timing (same workout) — case insensitive
  let found = false;
  for (let i = workoutsData.length - 1; i >= 1; i--) {
    const rowMeso   = (workoutsData[i][0] || "").toString().trim().toLowerCase();
    const rowTiming = (workoutsData[i][1] || "").toString().trim().toLowerCase();
    if (rowMeso === mesociclo.toLowerCase() && rowTiming === timing.toLowerCase()) {
      insertAfterRow = i + 1; // i is 0-indexed, sheet is 1-indexed
      found = true;
      break;
    }
  }
  
  // If not found, look for last row with same mesociclo
  if (!found) {
    for (let i = workoutsData.length - 1; i >= 1; i--) {
      if ((workoutsData[i][0] || "").toString().trim().toLowerCase() === mesociclo.toLowerCase()) {
        insertAfterRow = i + 1;
        break;
      }
    }
  }
  
  // Insert rows and write data (skip column C to preserve ARRAYFORMULA)
  // No gap when adding blocks to same workout (same meso+timing found)
  // 2 empty rows gap when adding a new workout (under same meso or at end)
  const needsGap = !found; // found = same meso+timing exists
  const gapRows = needsGap ? 2 : 0;
  const totalInsert = rowsAB.length + gapRows;
  workoutsSheet.insertRowsAfter(insertAfterRow, totalInsert);
  const insertAt = insertAfterRow + 1 + gapRows; // skip gap rows
  workoutsSheet.getRange(insertAt, 1, rowsAB.length, 2).setValues(rowsAB);  // A-B
  workoutsSheet.getRange(insertAt, 4, rowsDI.length, 6).setValues(rowsDI);  // D-I

  // Bust cache so changes are visible immediately
  try { bustAllCache({}); } catch(e) {}

  SpreadsheetApp.getUi().alert("✅ Aggiunto!\n\nWorkout: " + workoutName + "\n" + blockLabel + " (Builder #" + blockNum + ")\nEsercizi aggiunti: " + rowsAB.length);
}

// ═══════════════════════════════════════════════════════════════════════════
// V8.3: AUTOMATIC CACHE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * AUTO-BUST: Runs automatically when any cell is edited in the spreadsheet.
 * Uses an installable onEdit trigger (simple onEdit can't access CacheService).
 * Only busts cache for sheets that matter (ignores UserWeights, UserProgress edits).
 */
function onSheetEdit(e) {
  try {
    var sheetName = e.source.getActiveSheet().getName();
    var cache = CacheService.getScriptCache();
    
    // Sheets that affect shared data → bust shared cache
    var sharedSheets = ['Exercises', 'Workouts', 'Instructions', 'RunWorkouts', 'Selettore'];
    if (sharedSheets.indexOf(sheetName) !== -1) {
      cache.removeAll(['s_exercises', 's_workouts', 's_runs', 's_meso_index']);
      Logger.log("🗑️ AUTO-BUST: shared cache (edit in " + sheetName + ")");
      // Also bust all user response caches (they reference shared data)
      // Can't enumerate all user keys, so we clear everything
      // User caches will rebuild in ~1s on next request
    }
    
    // Sheets that affect per-user data → bust user caches
    var userSheets = ['Users', 'Plans', 'UserProgress'];
    if (userSheets.indexOf(sheetName) !== -1 || sharedSheets.indexOf(sheetName) !== -1) {
      // Bust the edited user's cache if we can identify them
      if (sheetName === 'Users' || sheetName === 'UserProgress') {
        var row = e.range.getRow();
        var sheet = e.source.getActiveSheet();
        var email = '';
        if (sheetName === 'Users') {
          email = (sheet.getRange(row, 2).getValue() || "").toString().trim().toLowerCase();
        } else if (sheetName === 'UserProgress') {
          email = (sheet.getRange(row, 1).getValue() || "").toString().trim().toLowerCase();
        }
        if (email && email.includes('@')) {
          bustUserCache(email);
          Logger.log("🗑️ AUTO-BUST: user cache for " + email + " (edit in " + sheetName + ")");
        }
      }
      // For Plans/shared sheets, we can't know which users are affected
      // Their per-user response caches (5 min TTL) will expire naturally
      Logger.log("🗑️ AUTO-BUST: triggered by edit in " + sheetName);
    }
  } catch (err) {
    Logger.log("⚠️ onSheetEdit error: " + err.toString());
  }
}

/**
 * WARM-UP: Pre-builds the shared data cache so no user ever hits a cold start.
 * Runs every 50 minutes via time-based trigger (shared cache TTL = 1 hour).
 */
function warmUpCache() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var startTime = new Date();
    
    // Force rebuild by clearing first
    var cache = CacheService.getScriptCache();
    cache.removeAll(['s_exercises', 's_workouts', 's_runs', 's_meso_index']);
    
    // Rebuild
    _getSharedData(ss);
    
    var duration = new Date() - startTime;
    Logger.log("🔥 Cache warm-up completed in " + duration + "ms");
  } catch (err) {
    Logger.log("⚠️ Cache warm-up failed: " + err.toString());
  }
}

/**
 * ONE-TIME SETUP: Run this function ONCE manually to install the automatic triggers.
 * Go to: Run → setupTriggers
 * 
 * Installs:
 * 1. onSheetEdit — fires when any cell is edited (auto-busts cache)
 * 2. warmUpCache — runs every 50 minutes (keeps shared cache hot)
 */
function setupTriggers() {
  // Remove any existing triggers to avoid duplicates
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(trigger) {
    var handler = trigger.getHandlerFunction();
    if (handler === 'onSheetEdit' || handler === 'warmUpCache') {
      ScriptApp.deleteTrigger(trigger);
      Logger.log("Removed old trigger: " + handler);
    }
  });
  
  // 1. Installable onEdit trigger (can access CacheService, unlike simple onEdit)
  ScriptApp.newTrigger('onSheetEdit')
    .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
    .onEdit()
    .create();
  Logger.log("✅ Installed: onSheetEdit trigger");
  
  // 2. Time-based trigger: every 50 minutes
  ScriptApp.newTrigger('warmUpCache')
    .timeBased()
    .everyMinutes(30)
    .create();
  Logger.log("✅ Installed: warmUpCache trigger (every 30 min)");
  
  Logger.log("🎉 All triggers installed! Cache will stay warm automatically.");
}

// ═══════════════════════════════════════════════════════════════════════════
// SUPABASE <-> SHEET SYNC ENDPOINTS
// Token-gated. Set SYNC_TOKEN in Script Properties: Project Settings -> Script Properties.
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

// ═══════════════════════════════════════════════════════════════════════════
// LEADS — Questionnaire submissions stored in "Leads" tab
// Public endpoint; data is self-declared by user. Coach reviews via Admin menu.
// ═══════════════════════════════════════════════════════════════════════════

const LEAD_COLS = [
  'submitted_at', 'fullname', 'email', 'phone', 'age', 'gender', 'city',
  'experience', 'km_week', 'pace', 'best_times', 'injuries',
  'goal', 'race', 'days', 'gym', 'other_sports',
  'conditions', 'medical',
  'consent_data', 'consent_medical',
  'status', 'assigned_plan', 'coach_notes'
];

function _ensureLeadsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Leads');
  if (!sheet) {
    sheet = ss.insertSheet('Leads');
    sheet.appendRow(LEAD_COLS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function submitQuestionnaire(data) {
  const email = (data.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return createResponse({ status: 'error', message: 'Email non valida' });
  }
  if (!data.fullname || !data.phone) {
    return createResponse({ status: 'error', message: 'Nome e telefono obbligatori' });
  }
  if (!data.consent_data || !data.consent_medical) {
    return createResponse({ status: 'error', message: 'Consensi obbligatori non spuntati' });
  }

  const sheet = _ensureLeadsSheet();
  const row = LEAD_COLS.map(col => {
    if (col === 'status') return 'new';
    if (col === 'assigned_plan') return '';
    if (col === 'coach_notes') return '';
    return (data[col] != null) ? data[col].toString() : '';
  });
  sheet.appendRow(row);

  return createResponse({ status: 'success', email: email, mode: 'submitted' });
}

function adminListLeads() {
  // For Admin UI dialog — returns rows in reverse chronological order
  const sheet = _ensureLeadsSheet();
  const rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return [];
  const header = rows[0];
  const out = [];
  for (let i = rows.length - 1; i >= 1; i--) {
    const r = rows[i];
    const obj = {};
    header.forEach((col, idx) => { obj[col] = r[idx]; });
    obj._row = i + 1;
    out.push(obj);
  }
  return out;
}

function adminUpdateLeadStatus(payload) {
  // payload: { rowIndex, status?, assigned_plan?, coach_notes? }
  const sheet = _ensureLeadsSheet();
  const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const colMap = {};
  header.forEach((h, idx) => { colMap[h] = idx + 1; });

  if (!payload.rowIndex || payload.rowIndex < 2) throw new Error('Riga non valida');

  if (payload.status != null && colMap.status) {
    sheet.getRange(payload.rowIndex, colMap.status).setValue(payload.status);
  }
  if (payload.assigned_plan != null && colMap.assigned_plan) {
    sheet.getRange(payload.rowIndex, colMap.assigned_plan).setValue(payload.assigned_plan);
  }
  if (payload.coach_notes != null && colMap.coach_notes) {
    sheet.getRange(payload.rowIndex, colMap.coach_notes).setValue(payload.coach_notes);
  }
  return { ok: true };
}

function syncListPlans(data) {
  // Public: plan names are non-sensitive (already visible to logged-in users via DataPreloader)
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const plansSheet = ss.getSheetByName('Plans');
  if (!plansSheet) return createResponse({ status: 'error', message: 'No "Plans" sheet found' });
  const rows = plansSheet.getDataRange().getValues();
  const header = rows[0] || [];
  const names = [];
  for (let i = 1; i < rows.length; i++) {
    const name = (rows[i][0] || '').toString().trim();
    if (name) names.push(name);
  }
  return createResponse({ status: 'success', header: header, planNames: names, count: names.length });
}

function ensureUserInSheet(data) {
  // Called from client JS on every login. Idempotent.
  // No token check: client is already Supabase-authenticated; worst case = empty rows (no plan = no access).
  const email = (data.email || '').toString().trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return createResponse({ status: 'error', message: 'Invalid email' });
  }
  const name = (data.name || '').toString().trim();

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const userSheet = ss.getSheetByName('Users');
  const rows = userSheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if ((rows[i][1] || '').toString().trim().toLowerCase() === email) {
      return createResponse({ status: 'success', mode: 'exists', email: email });
    }
  }
  // Empty plan + empty scadenza on purpose: admin assigns plan later
  userSheet.appendRow([name, email, '', '', '', '']);
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

// Alias per il bottone "AGGIUNGI" nel foglio Selettore
function aggiungiBlocko() { aggiungiBloccoDaSelettore(); }

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN UI — Custom menu + dialogs for non-technical operators
// Runs inside the Sheet (no token needed — authenticated session)
// ═══════════════════════════════════════════════════════════════════════════

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Admin Sync')
    .addItem('Lista utenti (audit)', 'adminShowAuditDialog')
    .addItem('Aggiungi / Riallinea utente', 'adminShowReAddDialog')
    .addItem('Elimina utente dal foglio', 'adminShowDeleteDialog')
    .addSeparator()
    .addItem('Lead / Questionari', 'adminShowLeadsDialog')
    .addToUi();
}

function adminShowLeadsDialog() {
  const html = HtmlService.createHtmlOutputFromFile('AdminLeads')
    .setWidth(900).setHeight(600);
  SpreadsheetApp.getUi().showModalDialog(html, 'Lead / Questionari');
}

function adminShowAuditDialog() {
  const html = HtmlService.createHtmlOutputFromFile('AdminAudit')
    .setWidth(600).setHeight(500);
  SpreadsheetApp.getUi().showModalDialog(html, 'Audit utenti');
}

function adminShowReAddDialog() {
  const html = HtmlService.createHtmlOutputFromFile('AdminReAdd')
    .setWidth(500).setHeight(450);
  SpreadsheetApp.getUi().showModalDialog(html, 'Aggiungi / Riallinea utente');
}

function adminShowDeleteDialog() {
  const html = HtmlService.createHtmlOutputFromFile('AdminDelete')
    .setWidth(500).setHeight(300);
  SpreadsheetApp.getUi().showModalDialog(html, 'Elimina utente dal foglio');
}

// Internal helpers (no token gate — only callable from same-script UI / scheduled tasks)

function adminListSheetUsers() {
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
      scadenza: r[4] ? Utilities.formatDate(new Date(r[4]), Session.getScriptTimeZone(), 'yyyy-MM-dd') : '',
      plan: r[5] || ''
    });
  }
  return users;
}

function _adminFetchSupabaseUsers() {
  const props = PropertiesService.getScriptProperties();
  const url = props.getProperty('SUPABASE_URL');
  const key = props.getProperty('SUPABASE_SERVICE_ROLE');
  if (!url || !key) {
    throw new Error('Manca SUPABASE_URL o SUPABASE_SERVICE_ROLE in Script Properties (Project Settings -> Script Properties)');
  }
  const res = UrlFetchApp.fetch(url + '/auth/v1/admin/users?per_page=1000', {
    method: 'get',
    headers: { apikey: key, Authorization: 'Bearer ' + key },
    muteHttpExceptions: true
  });
  const code = res.getResponseCode();
  const body = res.getContentText();
  if (code !== 200) {
    throw new Error('Supabase ' + code + ': ' + body.slice(0, 200));
  }
  const data = JSON.parse(body);
  const list = Array.isArray(data) ? data : (data.users || []);
  return list.map(function(u) {
    return {
      id: u.id,
      email: (u.email || '').toLowerCase(),
      created_at: u.created_at || ''
    };
  }).filter(function(u) { return u.email; });
}

function adminAuditMismatch() {
  const sheetUsers = adminListSheetUsers();
  const supabaseUsers = _adminFetchSupabaseUsers();

  const sheetMap = {};
  sheetUsers.forEach(function(u) { sheetMap[u.email] = u; });
  const supMap = {};
  supabaseUsers.forEach(function(u) { supMap[u.email] = u; });

  const onlyInSheet = sheetUsers.filter(function(u) { return !supMap[u.email]; });
  const onlyInSupabase = supabaseUsers.filter(function(u) { return !sheetMap[u.email]; });
  const inBoth = sheetUsers.filter(function(u) { return supMap[u.email]; });

  return {
    counts: {
      sheet: sheetUsers.length,
      supabase: supabaseUsers.length,
      in_both: inBoth.length,
      only_in_sheet: onlyInSheet.length,
      only_in_supabase: onlyInSupabase.length
    },
    only_in_sheet: onlyInSheet,
    only_in_supabase: onlyInSupabase
  };
}

function adminReAddUser(payload) {
  const email = (payload.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) throw new Error('Email non valida');
  const name = payload.name || '';
  const plan = payload.plan || 'Trial Plan';
  let scadenza = payload.scadenza ? new Date(payload.scadenza) : null;
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
      return { mode: 'updated', email: email };
    }
  }
  userSheet.appendRow([name, email, '', '', scadenza, plan]);
  return { mode: 'inserted', email: email };
}

function adminDeleteUser(email) {
  email = (email || '').trim().toLowerCase();
  if (!email) throw new Error('Email mancante');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const userSheet = ss.getSheetByName('Users');
  const rows = userSheet.getDataRange().getValues();
  for (let i = rows.length - 1; i >= 1; i--) {
    if ((rows[i][1] || '').toString().trim().toLowerCase() === email) {
      userSheet.deleteRow(i + 1);
      return { mode: 'deleted', email: email };
    }
  }
  return { mode: 'not-found', email: email };
}
