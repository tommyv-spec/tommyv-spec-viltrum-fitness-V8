// ============================================
// VILTRUM FITNESS - NUTRITION APP V2
// Adaptive macro tracking - adjusts remaining meals
// based on what you've already eaten
// ============================================

// AUTH CHECK
if (!localStorage.getItem('loggedUser')) {
  window.location.href = '../index.html';
}

const userEmail = localStorage.getItem('loggedUser');
let userData = null;
let nutritionPlan = null;
let currentMeal = 'colazione';
let selections = {
  colazione: {},
  spuntino1: {},
  pranzo: {},
  spuntino2: {},
  cena: {}
};

// Daily macro targets (will be calculated from plan)
let dailyTargets = {
  kcal: 0,
  protein: 0,
  carbs: 0,
  fat: 0
};

// ============================================
// LOAD USER DATA + NUTRITION PLAN
// ============================================

async function loadNutritionData() {
  try {
    while (typeof window.SessionCache === 'undefined') {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    console.log('📊 Loading nutrition data from session cache...');
    userData = await SessionCache.getCurrentUserInfo();
    
    if (!userData) {
      showError('Utente non trovato');
      return;
    }

    document.getElementById('user-name-display').textContent = `Piano di ${userData.fullName}`;

    const isExpired = checkNutritionExpiration(userData.nutritionScadenza);
    
    if (isExpired) {
      showExpiredBanner();
    }

    await loadNutritionPlan(userData.nutritionPdfUrl, isExpired);

  } catch (error) {
    console.error('Error loading nutrition data:', error);
    showError('Errore nel caricamento dei dati');
  }
}

function checkNutritionExpiration(scadenza) {
  if (!scadenza) return false;
  const expiryDate = new Date(scadenza);
  const today = new Date();
  return today > expiryDate;
}

async function loadNutritionPlan(pdfUrl, isReadOnly) {
  try {
    const savedPlan = localStorage.getItem(`nutrition_plan_${userEmail}`);
    
    if (savedPlan) {
      nutritionPlan = JSON.parse(savedPlan);
    } else {
      nutritionPlan = getDefaultPlan();
      localStorage.setItem(`nutrition_plan_${userEmail}`, JSON.stringify(nutritionPlan));
    }

    // Load today's selections (reset each day)
    const today = new Date().toDateString();
    const savedDate = localStorage.getItem(`nutrition_date_${userEmail}`);
    
    if (savedDate === today) {
      const savedSelections = localStorage.getItem(`nutrition_selections_${userEmail}`);
      if (savedSelections) {
        selections = JSON.parse(savedSelections);
      }
    } else {
      // New day - reset selections
      localStorage.setItem(`nutrition_date_${userEmail}`, today);
      selections = { colazione: {}, spuntino1: {}, pranzo: {}, spuntino2: {}, cena: {} };
      localStorage.setItem(`nutrition_selections_${userEmail}`, JSON.stringify(selections));
    }

    // Calculate daily targets from plan
    calculateDailyTargets();

    renderApp(isReadOnly, pdfUrl);

  } catch (error) {
    console.error('Error loading nutrition plan:', error);
    showError('Errore nel caricamento del piano');
  }
}

function calculateDailyTargets() {
  // Sum up all macro targets from the plan
  dailyTargets = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  
  if (!nutritionPlan?.meals) return;
  
  // Use the dailyTargets from plan if available, otherwise calculate from meals
  if (nutritionPlan.dailyTargets) {
    dailyTargets = { ...nutritionPlan.dailyTargets };
    return;
  }
  
  // Fallback: estimate from meal slots
  Object.keys(nutritionPlan.meals).forEach(mealKey => {
    const meal = nutritionPlan.meals[mealKey];
    Object.keys(meal).forEach(slotKey => {
      const slot = meal[slotKey];
      if (slot.options && slot.options.length > 0) {
        // Use first option as reference for macro estimate
        const firstOption = slot.options[0];
        if (firstOption.macros) {
          dailyTargets.kcal += firstOption.macros.kcal || 0;
          dailyTargets.protein += firstOption.macros.protein || 0;
          dailyTargets.carbs += firstOption.macros.carbs || 0;
          dailyTargets.fat += firstOption.macros.fat || 0;
        }
      }
    });
  });
  
  // If still zero, use sensible defaults
  if (dailyTargets.kcal === 0) {
    dailyTargets = { kcal: 2000, protein: 150, carbs: 200, fat: 70 };
  }
}

function getDefaultPlan() {
  return {
    "dailyTargets": {
      "kcal": 2200,
      "protein": 160,
      "carbs": 220,
      "fat": 75
    },
    "meals": {
      "colazione": {
        "proteine": {
          "targetMacros": { "kcal": 90, "protein": 18, "carbs": 5, "fat": 0 },
          "options": [
            {"id": "yogurt_greco", "name": "Yogurt Greco 0%", "qty": 150, "unit": "g", "inPlan": true, "macros": {"kcal": 88, "protein": 15, "carbs": 6, "fat": 0}},
            {"id": "proteine_polvere", "name": "Proteine in Polvere", "qty": 25, "unit": "g", "inPlan": true, "macros": {"kcal": 100, "protein": 20, "carbs": 2, "fat": 1}},
            {"id": "uovo_albume", "name": "1 uovo + 100ml albume", "qty": 1, "unit": "porzione", "inPlan": true, "macros": {"kcal": 95, "protein": 17, "carbs": 1, "fat": 3}},
            {"id": "albume", "name": "Albume", "qty": 150, "unit": "g", "inPlan": true, "macros": {"kcal": 78, "protein": 16, "carbs": 1, "fat": 0}},
            {"id": "fiocchi_latte", "name": "Fiocchi di Latte", "qty": 150, "unit": "g", "inPlan": true, "macros": {"kcal": 147, "protein": 17, "carbs": 6, "fat": 6}}
          ]
        },
        "carboidrati": {
          "targetMacros": { "kcal": 100, "protein": 3, "carbs": 20, "fat": 1 },
          "options": [
            {"id": "pane_integrale", "name": "Pane Integrale", "qty": 40, "unit": "g", "visualHelp": "~1.5 fette", "inPlan": true, "macros": {"kcal": 99, "protein": 3, "carbs": 19, "fat": 1}},
            {"id": "avena", "name": "Fiocchi d'Avena", "qty": 30, "unit": "g", "inPlan": true, "macros": {"kcal": 113, "protein": 4, "carbs": 20, "fat": 2}},
            {"id": "farro_soffiato", "name": "Farro Soffiato", "qty": 30, "unit": "g", "inPlan": true, "macros": {"kcal": 105, "protein": 4, "carbs": 21, "fat": 1}},
            {"id": "gallette", "name": "Gallette di Riso", "qty": 4, "unit": "pezzi", "gramsEquivalent": 28, "inPlan": true, "macros": {"kcal": 104, "protein": 2, "carbs": 23, "fat": 0}},
            {"id": "wasa", "name": "Fette Wasa", "qty": 3, "unit": "pezzi", "gramsEquivalent": 30, "inPlan": true, "macros": {"kcal": 105, "protein": 3, "carbs": 21, "fat": 1}}
          ]
        },
        "grassi": {
          "targetMacros": { "kcal": 120, "protein": 3, "carbs": 3, "fat": 12 },
          "options": [
            {"id": "burro_arachidi", "name": "Burro di Arachidi", "qty": 20, "unit": "g", "visualHelp": "4 cucchiaini", "inPlan": true, "macros": {"kcal": 118, "protein": 5, "carbs": 4, "fat": 10}},
            {"id": "mandorle", "name": "Mandorle", "qty": 20, "unit": "g", "visualHelp": "~15 mandorle", "inPlan": true, "macros": {"kcal": 116, "protein": 4, "carbs": 4, "fat": 10}},
            {"id": "nocciole", "name": "Nocciole", "qty": 20, "unit": "g", "visualHelp": "~15 nocciole", "inPlan": true, "macros": {"kcal": 126, "protein": 3, "carbs": 3, "fat": 12}},
            {"id": "cioccolato", "name": "Cioccolato Fondente 85%", "qty": 20, "unit": "g", "inPlan": true, "macros": {"kcal": 114, "protein": 2, "carbs": 4, "fat": 10}}
          ]
        }
      },
      "spuntino1": {
        "proteine": {
          "targetMacros": { "kcal": 60, "protein": 12, "carbs": 3, "fat": 0 },
          "options": [
            {"id": "yogurt_greco", "name": "Yogurt Greco 0%", "qty": 125, "unit": "g", "inPlan": true, "macros": {"kcal": 73, "protein": 13, "carbs": 5, "fat": 0}},
            {"id": "proteine_polvere", "name": "Proteine in Polvere", "qty": 15, "unit": "g", "inPlan": true, "macros": {"kcal": 60, "protein": 12, "carbs": 1, "fat": 1}}
          ]
        },
        "carboidrati": {
          "targetMacros": { "kcal": 60, "protein": 1, "carbs": 15, "fat": 0 },
          "options": [
            {"id": "frutta", "name": "Frutto Fresco", "qty": 150, "unit": "g", "visualHelp": "mela, pera, arancia", "inPlan": true, "macros": {"kcal": 65, "protein": 1, "carbs": 15, "fat": 0}},
            {"id": "banana", "name": "Banana", "qty": 100, "unit": "g", "visualHelp": "1 banana media", "inPlan": true, "macros": {"kcal": 89, "protein": 1, "carbs": 23, "fat": 0}}
          ]
        }
      },
      "pranzo": {
        "proteine": {
          "targetMacros": { "kcal": 165, "protein": 35, "carbs": 0, "fat": 3 },
          "options": [
            {"id": "pollo", "name": "Petto di Pollo", "qty": 150, "unit": "g", "rawWeight": true, "visualHelp": "peso a crudo", "inPlan": true, "macros": {"kcal": 165, "protein": 31, "carbs": 0, "fat": 4}},
            {"id": "tacchino", "name": "Petto di Tacchino", "qty": 150, "unit": "g", "rawWeight": true, "inPlan": true, "macros": {"kcal": 157, "protein": 29, "carbs": 0, "fat": 4}},
            {"id": "pesce_bianco", "name": "Pesce Bianco", "qty": 180, "unit": "g", "rawWeight": true, "inPlan": true, "macros": {"kcal": 144, "protein": 32, "carbs": 0, "fat": 2}},
            {"id": "salmone", "name": "Salmone", "qty": 130, "unit": "g", "rawWeight": true, "inPlan": true, "macros": {"kcal": 234, "protein": 26, "carbs": 0, "fat": 14}},
            {"id": "tonno", "name": "Tonno al Naturale", "qty": 150, "unit": "g", "visualHelp": "~3 scatolette sgocciolate", "inPlan": true, "macros": {"kcal": 165, "protein": 36, "carbs": 0, "fat": 2}},
            {"id": "uova", "name": "Uova Intere", "qty": 3, "unit": "uova", "inPlan": true, "macros": {"kcal": 210, "protein": 18, "carbs": 2, "fat": 15}}
          ]
        },
        "carboidrati": {
          "targetMacros": { "kcal": 280, "protein": 8, "carbs": 56, "fat": 2 },
          "options": [
            {"id": "pasta", "name": "Pasta Integrale", "qty": 80, "unit": "g", "rawWeight": true, "cookedEquivalent": 200, "inPlan": true, "macros": {"kcal": 280, "protein": 10, "carbs": 55, "fat": 2}},
            {"id": "riso", "name": "Riso", "qty": 80, "unit": "g", "rawWeight": true, "cookedEquivalent": 240, "inPlan": true, "macros": {"kcal": 288, "protein": 6, "carbs": 64, "fat": 1}},
            {"id": "patate", "name": "Patate", "qty": 300, "unit": "g", "rawWeight": true, "inPlan": true, "macros": {"kcal": 258, "protein": 6, "carbs": 57, "fat": 0}},
            {"id": "quinoa", "name": "Quinoa", "qty": 80, "unit": "g", "rawWeight": true, "cookedEquivalent": 240, "inPlan": true, "macros": {"kcal": 288, "protein": 11, "carbs": 52, "fat": 5}},
            {"id": "pane", "name": "Pane Integrale", "qty": 120, "unit": "g", "visualHelp": "4-5 fette", "inPlan": true, "macros": {"kcal": 296, "protein": 10, "carbs": 56, "fat": 3}}
          ]
        },
        "grassi": {
          "targetMacros": { "kcal": 90, "protein": 0, "carbs": 0, "fat": 10 },
          "options": [
            {"id": "olio_evo", "name": "Olio EVO", "qty": 10, "unit": "g", "visualHelp": "1 cucchiaio", "inPlan": true, "macros": {"kcal": 90, "protein": 0, "carbs": 0, "fat": 10}},
            {"id": "parmigiano", "name": "Parmigiano", "qty": 20, "unit": "g", "visualHelp": "2 cucchiai", "inPlan": true, "macros": {"kcal": 80, "protein": 7, "carbs": 0, "fat": 6}}
          ]
        },
        "verdure": {
          "targetMacros": { "kcal": 50, "protein": 2, "carbs": 10, "fat": 0 },
          "options": [
            {"id": "verdura_libera", "name": "Verdura a Piacere", "qty": null, "unit": "libera", "visualHelp": "insalata, zucchine, spinaci, broccoli...", "inPlan": true, "macros": {"kcal": 50, "protein": 3, "carbs": 8, "fat": 0}, "isLowCarb": true}
          ]
        }
      },
      "spuntino2": {
        "proteine": {
          "targetMacros": { "kcal": 60, "protein": 12, "carbs": 3, "fat": 0 },
          "options": [
            {"id": "yogurt_greco", "name": "Yogurt Greco 0%", "qty": 125, "unit": "g", "inPlan": true, "macros": {"kcal": 73, "protein": 13, "carbs": 5, "fat": 0}},
            {"id": "proteine_polvere", "name": "Proteine in Polvere", "qty": 15, "unit": "g", "inPlan": true, "macros": {"kcal": 60, "protein": 12, "carbs": 1, "fat": 1}},
            {"id": "affettato_magro", "name": "Affettato Magro", "qty": 50, "unit": "g", "visualHelp": "bresaola, tacchino", "inPlan": true, "macros": {"kcal": 60, "protein": 12, "carbs": 0, "fat": 1}}
          ]
        },
        "grassi": {
          "targetMacros": { "kcal": 60, "protein": 2, "carbs": 2, "fat": 6 },
          "options": [
            {"id": "mandorle", "name": "Mandorle", "qty": 10, "unit": "g", "visualHelp": "~8 mandorle", "inPlan": true, "macros": {"kcal": 58, "protein": 2, "carbs": 2, "fat": 5}},
            {"id": "noci", "name": "Noci", "qty": 10, "unit": "g", "visualHelp": "2 noci", "inPlan": true, "macros": {"kcal": 65, "protein": 2, "carbs": 1, "fat": 7}}
          ]
        }
      },
      "cena": {
        "proteine": {
          "targetMacros": { "kcal": 165, "protein": 35, "carbs": 0, "fat": 3 },
          "options": [
            {"id": "pollo", "name": "Petto di Pollo", "qty": 150, "unit": "g", "rawWeight": true, "inPlan": true, "macros": {"kcal": 165, "protein": 31, "carbs": 0, "fat": 4}},
            {"id": "tacchino", "name": "Petto di Tacchino", "qty": 150, "unit": "g", "rawWeight": true, "inPlan": true, "macros": {"kcal": 157, "protein": 29, "carbs": 0, "fat": 4}},
            {"id": "pesce_bianco", "name": "Pesce Bianco", "qty": 180, "unit": "g", "rawWeight": true, "inPlan": true, "macros": {"kcal": 144, "protein": 32, "carbs": 0, "fat": 2}},
            {"id": "salmone", "name": "Salmone", "qty": 130, "unit": "g", "rawWeight": true, "inPlan": true, "macros": {"kcal": 234, "protein": 26, "carbs": 0, "fat": 14}},
            {"id": "uova", "name": "Uova Intere", "qty": 2, "unit": "uova", "inPlan": true, "macros": {"kcal": 140, "protein": 12, "carbs": 1, "fat": 10}},
            {"id": "legumi", "name": "Legumi", "qty": 150, "unit": "g", "visualHelp": "cotti - ceci, lenticchie, fagioli", "inPlan": true, "macros": {"kcal": 150, "protein": 10, "carbs": 20, "fat": 2}}
          ]
        },
        "carboidrati": {
          "targetMacros": { "kcal": 150, "protein": 4, "carbs": 30, "fat": 1 },
          "options": [
            {"id": "pane", "name": "Pane Integrale", "qty": 60, "unit": "g", "visualHelp": "2 fette", "inPlan": true, "macros": {"kcal": 148, "protein": 5, "carbs": 28, "fat": 2}},
            {"id": "patate", "name": "Patate", "qty": 180, "unit": "g", "rawWeight": true, "inPlan": true, "macros": {"kcal": 155, "protein": 4, "carbs": 34, "fat": 0}},
            {"id": "riso", "name": "Riso", "qty": 50, "unit": "g", "rawWeight": true, "cookedEquivalent": 150, "inPlan": true, "macros": {"kcal": 180, "protein": 4, "carbs": 40, "fat": 1}}
          ]
        },
        "grassi": {
          "targetMacros": { "kcal": 90, "protein": 0, "carbs": 0, "fat": 10 },
          "options": [
            {"id": "olio_evo", "name": "Olio EVO", "qty": 10, "unit": "g", "visualHelp": "1 cucchiaio", "inPlan": true, "macros": {"kcal": 90, "protein": 0, "carbs": 0, "fat": 10}}
          ]
        },
        "verdure": {
          "targetMacros": { "kcal": 50, "protein": 2, "carbs": 10, "fat": 0 },
          "options": [
            {"id": "verdura_libera", "name": "Verdura a Piacere", "qty": null, "unit": "libera", "visualHelp": "insalata, zucchine, spinaci, broccoli...", "inPlan": true, "macros": {"kcal": 50, "protein": 3, "carbs": 8, "fat": 0}, "isLowCarb": true}
          ]
        }
      }
    },
    "notes": [
      "Bevi 2 bicchieri di acqua per ogni pasto",
      "Tutti i pesi sono da considerarsi a CRUDO tranne legumi (cotti)",
      "Post-workout: preferisci Pasta/Patate come carboidrato"
    ]
  };
}

// ============================================
// MACRO CALCULATIONS
// ============================================

function getConsumedMacros() {
  let consumed = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  
  Object.keys(selections).forEach(mealKey => {
    const mealSelections = selections[mealKey];
    Object.keys(mealSelections).forEach(slotKey => {
      const selection = mealSelections[slotKey];
      if (selection && selection.macros) {
        consumed.kcal += selection.macros.kcal || 0;
        consumed.protein += selection.macros.protein || 0;
        consumed.carbs += selection.macros.carbs || 0;
        consumed.fat += selection.macros.fat || 0;
      }
    });
  });
  
  return consumed;
}

function getRemainingMacros() {
  const consumed = getConsumedMacros();
  return {
    kcal: Math.max(0, dailyTargets.kcal - consumed.kcal),
    protein: Math.max(0, dailyTargets.protein - consumed.protein),
    carbs: Math.max(0, dailyTargets.carbs - consumed.carbs),
    fat: Math.max(0, dailyTargets.fat - consumed.fat)
  };
}

function getMealStatus(mealKey) {
  const mealSelections = selections[mealKey] || {};
  const meal = nutritionPlan?.meals?.[mealKey];
  if (!meal) return { complete: false, slots: 0, filled: 0 };
  
  const totalSlots = Object.keys(meal).length;
  const filledSlots = Object.keys(mealSelections).filter(k => mealSelections[k]?.id).length;
  
  return {
    complete: filledSlots === totalSlots,
    slots: totalSlots,
    filled: filledSlots
  };
}

// ============================================
// RENDERING
// ============================================

function renderApp(isReadOnly, pdfUrl) {
  const container = document.getElementById('app-container');
  
  let html = '';
  
  // PDF Viewer Button (if user has a PDF plan)
  if (pdfUrl) {
    html += `
      <div class="pdf-viewer-banner">
        <div class="pdf-info">
          <span class="pdf-icon">📄</span>
          <span>Hai un piano alimentare PDF assegnato</span>
        </div>
        <button class="btn btn-pdf" onclick="openPdfViewer('${pdfUrl}')">
          Visualizza PDF
        </button>
      </div>
    `;
  }
  
  // Daily Progress Summary
  html += renderDailyProgress();
  
  // Meal Navigation
  html += renderMealNav();
  
  // Meal Containers
  const meals = ['colazione', 'spuntino1', 'pranzo', 'spuntino2', 'cena'];
  meals.forEach(meal => {
    if (nutritionPlan?.meals?.[meal]) {
      html += renderMealContainer(meal, isReadOnly);
    }
  });
  
  // Notes
  if (nutritionPlan?.notes?.length > 0) {
    html += `
      <div class="notes-section">
        <h3>📝 Note Importanti</h3>
        <ul>
          ${nutritionPlan.notes.map(note => `<li>${note}</li>`).join('')}
        </ul>
      </div>
    `;
  }
  
  container.innerHTML = html;
  
  // Activate first incomplete meal or current meal
  const firstIncompleteMeal = meals.find(m => !getMealStatus(m).complete) || currentMeal;
  switchMeal(firstIncompleteMeal);
}

function renderDailyProgress() {
  const consumed = getConsumedMacros();
  const remaining = getRemainingMacros();
  
  const kcalPercent = Math.min(100, (consumed.kcal / dailyTargets.kcal) * 100);
  const proteinPercent = Math.min(100, (consumed.protein / dailyTargets.protein) * 100);
  const carbsPercent = Math.min(100, (consumed.carbs / dailyTargets.carbs) * 100);
  const fatPercent = Math.min(100, (consumed.fat / dailyTargets.fat) * 100);
  
  return `
    <div class="daily-progress">
      <div class="progress-header">
        <h2>📊 Oggi</h2>
        <button class="btn-reset" onclick="resetDay()">🔄 Reset Giornata</button>
      </div>
      
      <div class="macro-bars">
        <div class="macro-bar">
          <div class="macro-label">
            <span>🔥 Calorie</span>
            <span class="macro-values">${Math.round(consumed.kcal)} / ${dailyTargets.kcal}</span>
          </div>
          <div class="bar-bg">
            <div class="bar-fill kcal" style="width: ${kcalPercent}%"></div>
          </div>
          <span class="remaining">Rimangono: ${Math.round(remaining.kcal)}</span>
        </div>
        
        <div class="macro-bar">
          <div class="macro-label">
            <span>💪 Proteine</span>
            <span class="macro-values">${Math.round(consumed.protein)}g / ${dailyTargets.protein}g</span>
          </div>
          <div class="bar-bg">
            <div class="bar-fill protein" style="width: ${proteinPercent}%"></div>
          </div>
          <span class="remaining">Rimangono: ${Math.round(remaining.protein)}g</span>
        </div>
        
        <div class="macro-bar">
          <div class="macro-label">
            <span>🍞 Carboidrati</span>
            <span class="macro-values">${Math.round(consumed.carbs)}g / ${dailyTargets.carbs}g</span>
          </div>
          <div class="bar-bg">
            <div class="bar-fill carbs" style="width: ${carbsPercent}%"></div>
          </div>
          <span class="remaining">Rimangono: ${Math.round(remaining.carbs)}g</span>
        </div>
        
        <div class="macro-bar">
          <div class="macro-label">
            <span>🥑 Grassi</span>
            <span class="macro-values">${Math.round(consumed.fat)}g / ${dailyTargets.fat}g</span>
          </div>
          <div class="bar-bg">
            <div class="bar-fill fat" style="width: ${fatPercent}%"></div>
          </div>
          <span class="remaining">Rimangono: ${Math.round(remaining.fat)}g</span>
        </div>
      </div>
    </div>
  `;
}

function renderMealNav() {
  const mealNames = {
    colazione: '🌅 Colazione',
    spuntino1: '🍎 Spuntino',
    pranzo: '🍝 Pranzo',
    spuntino2: '🥜 Merenda',
    cena: '🌙 Cena'
  };
  
  let html = '<div class="meal-nav">';
  
  Object.keys(mealNames).forEach(meal => {
    if (nutritionPlan?.meals?.[meal]) {
      const status = getMealStatus(meal);
      const statusIcon = status.complete ? '✅' : `${status.filled}/${status.slots}`;
      const activeClass = meal === currentMeal ? 'active' : '';
      const completeClass = status.complete ? 'complete' : '';
      
      html += `
        <button class="meal-nav-btn ${activeClass} ${completeClass}" onclick="switchMeal('${meal}')">
          ${mealNames[meal]}
          <span class="meal-status">${statusIcon}</span>
        </button>
      `;
    }
  });
  
  html += '</div>';
  return html;
}

function renderMealContainer(mealKey, isReadOnly) {
  const meal = nutritionPlan.meals[mealKey];
  const mealSelections = selections[mealKey] || {};
  
  const mealNames = {
    colazione: 'COLAZIONE',
    spuntino1: 'SPUNTINO MATTINA',
    pranzo: 'PRANZO',
    spuntino2: 'SPUNTINO POMERIGGIO',
    cena: 'CENA'
  };
  
  let html = `<div id="meal-${mealKey}" class="meal-container">`;
  html += `<h2>${mealNames[mealKey]}</h2>`;
  
  // Render each nutrient slot
  Object.keys(meal).forEach(slotKey => {
    const slot = meal[slotKey];
    const currentSelection = mealSelections[slotKey];
    
    const slotNames = {
      proteine: '💪 PROTEINE',
      carboidrati: '🍞 CARBOIDRATI',
      grassi: '🥑 GRASSI',
      verdure: '🥗 VERDURE'
    };
    
    html += `
      <div class="nutrient-slot ${currentSelection?.id ? 'has-selection' : ''}">
        <div class="slot-header">
          <div>
            <h3>${slotNames[slotKey] || slotKey.toUpperCase()}</h3>
            ${slot.targetMacros ? `<span class="slot-target">Target: ${slot.targetMacros.kcal}kcal | ${slot.targetMacros.protein}P | ${slot.targetMacros.carbs}C | ${slot.targetMacros.fat}G</span>` : ''}
          </div>
          <button class="btn-find-alt" onclick="findAlternative('${mealKey}', '${slotKey}')">🔍 Cerca alternativa</button>
        </div>
        
        <div class="options-grid">
    `;
    
    slot.options.forEach(option => {
      const isSelected = currentSelection?.id === option.id;
      const macroInfo = option.macros ? `${option.macros.kcal}kcal | ${option.macros.protein}P` : '';
      
      html += `
        <div class="food-option ${isSelected ? 'selected' : ''}" onclick="selectFood('${mealKey}', '${slotKey}', '${option.id}')">
          <div class="food-name">${option.name}</div>
          <div class="food-quantity">${option.qty !== null ? option.qty + ' ' + option.unit : 'Libera'}</div>
          ${option.visualHelp ? `<span class="visual-help">📏 ${option.visualHelp}</span>` : ''}
          ${macroInfo ? `<span class="macro-info">${macroInfo}</span>` : ''}
          ${option.rawWeight ? `<span class="raw-badge">CRUDO</span>` : ''}
        </div>
      `;
    });
    
    html += `
        </div>
        ${currentSelection?.id ? `
          <div class="selection-summary">
            ✅ Selezionato: <strong>${currentSelection.name}</strong> 
            ${currentSelection.macros ? `(${currentSelection.macros.kcal}kcal, ${currentSelection.macros.protein}g P)` : ''}
            <button class="btn-clear-slot" onclick="clearSlot('${mealKey}', '${slotKey}')">✕</button>
          </div>
        ` : ''}
      </div>
    `;
  });
  
  html += '</div>';
  return html;
}

// ============================================
// INTERACTIONS
// ============================================

function switchMeal(mealKey) {
  currentMeal = mealKey;
  
  // Update nav buttons
  document.querySelectorAll('.meal-nav-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.onclick.toString().includes(mealKey)) {
      btn.classList.add('active');
    }
  });
  
  // Show/hide meal containers
  document.querySelectorAll('.meal-container').forEach(container => {
    container.classList.remove('active');
  });
  
  const activeContainer = document.getElementById(`meal-${mealKey}`);
  if (activeContainer) {
    activeContainer.classList.add('active');
  }
}

function selectFood(mealKey, slotKey, foodId) {
  const meal = nutritionPlan?.meals?.[mealKey];
  const slot = meal?.[slotKey];
  if (!slot) return;
  
  const food = slot.options.find(o => o.id === foodId);
  if (!food) return;
  
  // Toggle selection
  if (selections[mealKey]?.[slotKey]?.id === foodId) {
    // Deselect
    delete selections[mealKey][slotKey];
  } else {
    // Select
    if (!selections[mealKey]) selections[mealKey] = {};
    selections[mealKey][slotKey] = {
      id: food.id,
      name: food.name,
      qty: food.qty,
      unit: food.unit,
      macros: food.macros || null
    };
  }
  
  // Save and re-render
  saveSelections();
  const isExpired = checkNutritionExpiration(userData?.nutritionScadenza);
  renderApp(isExpired, userData?.nutritionPdfUrl);
  switchMeal(mealKey);
}

function clearSlot(mealKey, slotKey) {
  if (selections[mealKey]?.[slotKey]) {
    delete selections[mealKey][slotKey];
    saveSelections();
    const isExpired = checkNutritionExpiration(userData?.nutritionScadenza);
    renderApp(isExpired, userData?.nutritionPdfUrl);
    switchMeal(mealKey);
  }
}

function resetDay() {
  if (confirm('Vuoi resettare tutte le selezioni di oggi?')) {
    selections = { colazione: {}, spuntino1: {}, pranzo: {}, spuntino2: {}, cena: {} };
    saveSelections();
    const isExpired = checkNutritionExpiration(userData?.nutritionScadenza);
    renderApp(isExpired, userData?.nutritionPdfUrl);
  }
}

function saveSelections() {
  localStorage.setItem(`nutrition_selections_${userEmail}`, JSON.stringify(selections));
  localStorage.setItem(`nutrition_date_${userEmail}`, new Date().toDateString());
}

// ============================================
// PDF VIEWER
// ============================================

function openPdfViewer(pdfUrl) {
  // Convert Google Drive link to embeddable format if needed
  let embedUrl = pdfUrl;
  
  if (pdfUrl.includes('drive.google.com')) {
    // Extract file ID from various Google Drive URL formats
    const match = pdfUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (match) {
      embedUrl = `https://drive.google.com/file/d/${match[1]}/preview`;
    }
  }
  
  showModal(`
    <div class="pdf-modal-header">
      <h3>📄 Il Tuo Piano Alimentare</h3>
      <a href="${pdfUrl}" target="_blank" class="btn btn-download">⬇️ Scarica PDF</a>
    </div>
    <div class="pdf-iframe-container">
      <iframe src="${embedUrl}" width="100%" height="500" frameborder="0" allowfullscreen></iframe>
    </div>
    <button class="btn btn-close-modal" onclick="closeModal()">Chiudi</button>
  `);
}

// ============================================
// ALTERNATIVES FINDER
// ============================================

function findAlternative(meal, slotType) {
  const searchName = prompt(`Che alimento stai cercando per ${slotType.toUpperCase()}?\n\nEsempi: "skyr", "pane kamut", "tofu"`);
  
  if (!searchName || searchName.trim() === '') return;

  // Wait for nutrition engine
  if (typeof nutritionEngine === 'undefined' || !nutritionEngine.initialized) {
    showModal(`
      <h3>⏳ Caricamento...</h3>
      <p>Il database degli alimenti sta caricando. Riprova tra qualche secondo.</p>
      <button class="btn btn-close-modal" onclick="closeModal()">OK</button>
    `);
    return;
  }

  const categoryMap = {
    'proteine': meal === 'colazione' || meal === 'spuntino1' || meal === 'spuntino2' ? 'proteine_colazione' : 'proteine_principali',
    'carboidrati': meal === 'colazione' ? 'carboidrati_colazione' : 'carboidrati_principali',
    'grassi': 'grassi_colazione'
  };

  const category = categoryMap[slotType];
  const equivalent = nutritionEngine.findEquivalent(category, searchName);

  if (!equivalent) {
    showModal(`
      <h3>❌ Non Trovato</h3>
      <p>Non ho trovato "<strong>${searchName}</strong>" nel database.</p>
      <p style="color: #B0B0B0; margin-top: 15px;">💡 Prova con nomi più generici o alimenti simili.</p>
      <button class="btn btn-close-modal" onclick="closeModal()">OK</button>
    `);
    return;
  }

  const matchColor = equivalent.accuracy >= 85 ? '#4CAF50' : equivalent.accuracy >= 70 ? '#FFD700' : '#FF9800';

  showModal(`
    <h3>✅ Trovato: ${equivalent.name}</h3>
    
    <div style="text-align: center; margin: 15px 0; color: ${matchColor}; font-size: 18px;">
      Match: ${equivalent.accuracy}%
    </div>
    
    <div style="background: rgba(255,255,255,0.05); border-radius: 10px; padding: 15px; margin: 15px 0;">
      <h4 style="color: #FFD700;">Quantità suggerita: ${equivalent.suggestedQty}g</h4>
      
      <div style="margin-top: 15px; font-size: 14px; color: #B0B0B0;">
        <div>Calorie: ${equivalent.macros.kcal}</div>
        <div>Proteine: ${equivalent.macros.protein}g</div>
        <div>Carbs: ${equivalent.macros.carbs}g</div>
        <div>Grassi: ${equivalent.macros.fat}g</div>
      </div>
      
      ${equivalent.adjustments ? `<p style="color: #FFA500; margin-top: 15px;">⚠️ ${equivalent.adjustments}</p>` : ''}
      ${equivalent.note ? `<p style="color: #87CEEB; margin-top: 10px;">💡 ${equivalent.note}</p>` : ''}
    </div>
    
    <button class="btn" onclick="useAlternative('${meal}', '${slotType}', ${JSON.stringify(equivalent).replace(/"/g, '&quot;')})" style="width: 100%;">
      Usa questa alternativa
    </button>
    <button class="btn btn-close-modal" onclick="closeModal()" style="width: 100%; margin-top: 10px;">
      Annulla
    </button>
  `);
}

function useAlternative(meal, slotType, equivalent) {
  if (!selections[meal]) selections[meal] = {};
  
  selections[meal][slotType] = {
    id: equivalent.id,
    name: equivalent.name,
    qty: equivalent.suggestedQty,
    unit: 'g',
    inPlan: false,
    isAlternative: true,
    macros: equivalent.macros
  };

  closeModal();
  saveSelections();
  
  const isExpired = checkNutritionExpiration(userData?.nutritionScadenza);
  renderApp(isExpired, userData?.nutritionPdfUrl);
  switchMeal(meal);
}

// ============================================
// UI HELPERS
// ============================================

function showExpiredBanner() {
  const container = document.getElementById('app-container');
  const banner = `
    <div class="expired-banner">
      <h2>⚠️ Piano Scaduto</h2>
      <p>Il tuo piano alimentare è scaduto. Puoi visualizzarlo ma contatta il nutrizionista per rinnovarlo.</p>
    </div>
  `;
  container.insertAdjacentHTML('afterbegin', banner);
}

function showError(message) {
  document.getElementById('app-container').innerHTML = `
    <div class="no-plan">
      <h2>❌ Errore</h2>
      <p>${message}</p>
    </div>
  `;
}

function showModal(content) {
  const modal = document.getElementById('nutrition-modal');
  modal.querySelector('.modal-content').innerHTML = content;
  modal.style.display = 'block';
}

function closeModal() {
  document.getElementById('nutrition-modal').style.display = 'none';
}

window.onclick = function(event) {
  const modal = document.getElementById('nutrition-modal');
  if (event.target === modal) {
    closeModal();
  }
}

// Make functions globally accessible
window.switchMeal = switchMeal;
window.selectFood = selectFood;
window.clearSlot = clearSlot;
window.resetDay = resetDay;
window.openPdfViewer = openPdfViewer;
window.findAlternative = findAlternative;
window.useAlternative = useAlternative;
window.closeModal = closeModal;

// ============================================
// INIT
// ============================================

loadNutritionData();
