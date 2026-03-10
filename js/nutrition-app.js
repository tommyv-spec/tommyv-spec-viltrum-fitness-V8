// ============================================
// VILTRUM FITNESS - NUTRITION APP
// Main logic for nutrition tracking
// Uses SessionCache for data (loaded once at login)
// ============================================

// AUTH CHECK
if (!localStorage.getItem('loggedUser')) {
  window.location.href = 'index.html';
}

const userEmail = localStorage.getItem('loggedUser');
let userData = null;
let nutritionPlan = null;
let currentMeal = 'colazione';
let selections = {
  colazione: {},
  spuntino1: {},
  pranzo: {},
  cena: {}
};

// ============================================
// LOAD USER DATA + NUTRITION PLAN
// Now using SessionCache instead of separate fetch!
// ============================================

async function loadNutritionData() {
  try {
    // ✅ Wait for SessionCache module to load
    while (typeof window.SessionCache === 'undefined') {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    // ✅ Use SessionCache - data already loaded at login
    // No more fetch to Google Apps Script here!
    console.log('📊 Loading nutrition data from session cache...');
    
    userData = await SessionCache.getCurrentUserInfo();
    
    if (!userData) {
      showError('Utente non trovato');
      return;
    }

    // Update name display
    document.getElementById('user-name-display').textContent = `Piano di ${userData.fullName}`;

    // Check expiration
    const isExpired = checkNutritionExpiration(userData.nutritionScadenza);
    
    if (isExpired) {
      showExpiredBanner();
    }

    // Load nutrition plan JSON (default plan is always available)
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
    // Try to load from localStorage first (cached plan)
    const savedPlan = localStorage.getItem(`nutrition_plan_${userEmail}`);
    
    if (savedPlan) {
      nutritionPlan = JSON.parse(savedPlan);
    } else {
      // Load default plan (in production, you'd fetch from server or parse PDF)
      nutritionPlan = getDefaultPlan();
      // Cache it
      localStorage.setItem(`nutrition_plan_${userEmail}`, JSON.stringify(nutritionPlan));
    }

    // Load saved selections
    const savedSelections = localStorage.getItem(`nutrition_selections_${userEmail}`);
    if (savedSelections) {
      selections = JSON.parse(savedSelections);
    }

    renderApp(isReadOnly);

  } catch (error) {
    console.error('Error loading nutrition plan:', error);
    showError('Errore nel caricamento del piano');
  }
}

function getDefaultPlan() {
  return {
    "meals": {
      "colazione": {
        "proteine": {
          "options": [
            {"id": "yogurt_greco", "name": "Yogurt Greco 0%", "qty": 150, "unit": "g", "inPlan": true},
            {"id": "proteine_polvere", "name": "Proteine in Polvere", "qty": 20, "unit": "g", "inPlan": true},
            {"id": "uovo_albume", "name": "1 uovo + 100ml albume", "qty": 1, "unit": "porzione", "inPlan": true},
            {"id": "albume", "name": "Albume", "qty": 150, "unit": "g", "inPlan": true},
            {"id": "fiocchi_latte", "name": "Fiocchi di Latte", "qty": 150, "unit": "g", "inPlan": true}
          ]
        },
        "carboidrati": {
          "options": [
            {"id": "pane_integrale", "name": "Pane Integrale", "qty": 30, "unit": "g", "visualHelp": "~1 fetta piccola", "inPlan": true},
            {"id": "avena", "name": "Fiocchi d'Avena", "qty": 30, "unit": "g", "inPlan": true},
            {"id": "farro_soffiato", "name": "Farro Soffiato", "qty": 30, "unit": "g", "inPlan": true},
            {"id": "gallette", "name": "Gallette", "qty": 4, "unit": "pezzi", "gramsEquivalent": 28, "inPlan": true},
            {"id": "wasa", "name": "Fette Wasa", "qty": 3, "unit": "pezzi", "gramsEquivalent": 30, "inPlan": true}
          ]
        },
        "grassi": {
          "options": [
            {"id": "burro_arachidi", "name": "Burro di Arachidi", "qty": 20, "unit": "g", "visualHelp": "4 cucchiaini", "inPlan": true},
            {"id": "mandorle", "name": "Mandorle", "qty": 20, "unit": "g", "visualHelp": "~15 mandorle", "inPlan": true},
            {"id": "nocciole", "name": "Nocciole", "qty": 20, "unit": "g", "visualHelp": "~15 nocciole", "inPlan": true},
            {"id": "cioccolato", "name": "Cioccolato Fondente", "qty": 20, "unit": "g", "inPlan": true}
          ]
        }
      },
      "spuntino1": {
        "proteine": {
          "options": [
            {"id": "yogurt_greco", "name": "Yogurt Greco 0%", "qty": 150, "unit": "g", "inPlan": true},
            {"id": "proteine_polvere", "name": "Proteine in Polvere", "qty": 20, "unit": "g", "inPlan": true}
          ]
        },
        "carboidrati": {
          "options": [
            {"id": "frutta", "name": "Frutto Fresco", "qty": 1, "unit": "porzione", "visualHelp": "mela, pera, arancia", "inPlan": true},
            {"id": "wasa", "name": "Fette Wasa", "qty": 2, "unit": "pezzi", "inPlan": true}
          ]
        },
        "grassi": {
          "options": [
            {"id": "mandorle", "name": "Mandorle", "qty": 10, "unit": "g", "visualHelp": "~10 pezzi", "inPlan": true}
          ]
        }
      },
      "pranzo": {
        "proteine": {
          "options": [
            {"id": "pollo", "name": "Petto di Pollo", "qty": 150, "unit": "g", "rawWeight": true, "visualHelp": "1 fetta e mezza", "inPlan": true},
            {"id": "tacchino", "name": "Petto di Tacchino", "qty": 150, "unit": "g", "rawWeight": true, "visualHelp": "1 fetta e mezza", "inPlan": true},
            {"id": "pesce", "name": "Pesce Bianco", "qty": 150, "unit": "g", "rawWeight": true, "inPlan": true},
            {"id": "salmone", "name": "Salmone", "qty": 150, "unit": "g", "rawWeight": true, "inPlan": true},
            {"id": "tonno", "name": "Tonno al Naturale", "qty": 150, "unit": "g", "visualHelp": "~3 scatolette", "inPlan": true},
            {"id": "uova", "name": "Uova", "qty": 2, "unit": "uova", "inPlan": true},
            {"id": "legumi_tonno", "name": "Legumi + Tonno", "qty": 1, "unit": "porzione", "visualHelp": "120g legumi + 52g tonno", "inPlan": true}
          ]
        },
        "carboidrati": {
          "options": [
            {"id": "verdura", "name": "Verdura Libera", "qty": null, "unit": "g", "isLowCarb": true, "inPlan": true},
            {"id": "pasta", "name": "Pasta Integrale", "qty": 80, "unit": "g", "rawWeight": true, "cookedEquivalent": 200, "inPlan": true},
            {"id": "riso", "name": "Riso", "qty": 80, "unit": "g", "rawWeight": true, "cookedEquivalent": 240, "inPlan": true},
            {"id": "quinoa", "name": "Quinoa", "qty": 80, "unit": "g", "rawWeight": true, "cookedEquivalent": 240, "inPlan": true},
            {"id": "patate", "name": "Patate", "qty": 250, "unit": "g", "rawWeight": true, "inPlan": true},
            {"id": "gnocchi", "name": "Gnocchi", "qty": 200, "unit": "g", "inPlan": true},
            {"id": "pane", "name": "Pane Integrale", "qty": 100, "unit": "g", "visualHelp": "3-4 fette", "inPlan": true}
          ]
        },
        "grassi": {
          "options": [
            {"id": "olio_evo", "name": "Olio EVO", "qty": 10, "unit": "g", "visualHelp": "1 cucchiaio", "useRaw": true, "inPlan": true},
            {"id": "parmigiano", "name": "Parmigiano", "qty": 16, "unit": "g", "visualHelp": "2 cucchiai", "inPlan": true}
          ]
        }
      }
    },
    "notes": [
      "Bevi 2 bicchieri di acqua per ogni pasto",
      "Tutti i pesi sono da considerarsi a CRUDO tranne legumi (cotti)",
      "Post-workout: preferisci Pasta/Patate/Gnocchi come carboidrato"
    ]
  };
}

// ============================================
// RENDERING FUNCTIONS
// ============================================

function renderApp(isReadOnly) {
  const container = document.getElementById('app-container');
  
  let html = '';

  // Meal Navigation
  html += '<div class="meal-nav">';
  const meals = ['colazione', 'spuntino1', 'pranzo', 'cena'];
  meals.forEach(meal => {
    if (nutritionPlan.meals[meal]) {
      const isActive = meal === currentMeal ? 'active' : '';
      const label = meal === 'spuntino1' ? 'SPUNTINO' : meal.toUpperCase();
      html += `<button class="meal-nav-btn ${isActive}" onclick="switchMeal('${meal}')">${label}</button>`;
    }
  });
  html += '</div>';

  // Meal Containers
  meals.forEach(meal => {
    if (nutritionPlan.meals[meal]) {
      html += renderMealContainer(meal, isReadOnly);
    }
  });

  container.innerHTML = html;
}

function renderMealContainer(meal, isReadOnly) {
  const mealData = nutritionPlan.meals[meal];
  const isActive = meal === currentMeal ? 'active' : '';
  const mealLabel = meal === 'spuntino1' ? 'SPUNTINO' : meal.toUpperCase();

  let html = `<div class="meal-container ${isActive}" id="meal-${meal}">`;
  html += `<h2>${mealLabel}</h2>`;

  // Render each nutrient slot
  ['proteine', 'carboidrati', 'grassi'].forEach(slotType => {
    if (mealData[slotType]) {
      html += renderNutrientSlot(meal, slotType, mealData[slotType], isReadOnly);
    }
  });

  // Summary
  html += renderMealSummary(meal);

  if (!isReadOnly) {
    html += `<button class="btn btn-save" onclick="saveMeal('${meal}')">SALVA PASTO</button>`;
  }

  html += '</div>';

  return html;
}

function renderNutrientSlot(meal, slotType, slotData, isReadOnly) {
  const slotLabel = slotType.toUpperCase();
  
  let html = `<div class="nutrient-slot">`;
  html += `<div class="slot-header">`;
  html += `<h3>${slotLabel}</h3>`;
  html += `<span class="slot-subtitle">(scegline uno)</span>`;
  html += `</div>`;

  html += `<div class="options-grid">`;
  
  slotData.options.forEach(option => {
    const selected = selections[meal][slotType]?.id === option.id;
    const selectedClass = selected ? 'selected' : '';
    const disabled = isReadOnly ? 'style="pointer-events: none; opacity: 0.7;"' : '';
    
    // Check if has warnings
    const warnings = nutritionEngine.checkWarnings(option.id, option.name);
    const hasWarning = warnings.length > 0 ? 'has-warning' : '';
    
    html += `<div class="food-option ${selectedClass} ${hasWarning}" onclick="selectFood('${meal}', '${slotType}', '${option.id}')" ${disabled}>`;
    html += `<div class="food-name">${option.name}</div>`;
    
    if (option.qty) {
      html += `<div class="food-quantity">${option.qty} ${option.unit}</div>`;
    } else {
      html += `<div class="food-quantity">Libera</div>`;
    }
    
    if (option.visualHelp) {
      html += `<span class="visual-help">${option.visualHelp}</span>`;
    }
    
    // Mostra conversione crudo/cotto direttamente
    if (option.rawWeight && option.cookedEquivalent) {
      html += `<span class="visual-help">📊 = ~${option.cookedEquivalent}g cotto</span>`;
    }
    
    // Mostra conversione pezzi/grammi direttamente
    if (option.unit === 'pezzi' && option.gramsEquivalent) {
      html += `<span class="visual-help">⚖️ = ~${option.gramsEquivalent}g</span>`;
    }
    
    // Badge alternativa
    if (option.isAlternative || !option.inPlan) {
      html += `<span class="badge-alternative">ALTERNATIVA</span>`;
    }
    
    // Badge warning
    if (hasWarning) {
      html += `<span class="warning-badge">⚠️</span>`;
    }
    
    html += `</div>`;
  });
  
  html += `</div>`;
  
  // Pulsante cerca alternativa (solo se non read-only)
  if (!isReadOnly) {
    html += `<button class="btn-find-alternative" onclick="event.stopPropagation(); findAlternative('${meal}', '${slotType}')">🔍 Cerca alternativa fuori piano</button>`;
  }
  
  html += `</div>`;
  
  return html;
}

function renderMealSummary(meal) {
  const mealSelections = selections[meal];
  const foods = [];
  
  Object.entries(mealSelections).forEach(([slotType, food]) => {
    if (food && food.name) {
      const qty = food.qty ? `${food.qty}${food.unit}` : '';
      foods.push(`${food.name}${qty ? ' - ' + qty : ''}`);
    }
  });

  let html = `<div class="meal-summary">`;
  html += `<h3>Riepilogo Pasto</h3>`;
  
  if (foods.length > 0) {
    html += `<div class="summary-foods"><h4>Alimenti selezionati:</h4><ul>`;
    foods.forEach(food => {
      html += `<li>${food}</li>`;
    });
    html += `</ul></div>`;
  } else {
    html += `<p style="text-align: center; color: #B0B0B0;">Nessun alimento selezionato</p>`;
  }
  
  html += `</div>`;
  
  return html;
}

// ============================================
// INTERACTION FUNCTIONS
// ============================================

function switchMeal(meal) {
  currentMeal = meal;
  
  // Update nav buttons
  document.querySelectorAll('.meal-nav-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  event.target.classList.add('active');
  
  // Update meal containers
  document.querySelectorAll('.meal-container').forEach(container => {
    container.classList.remove('active');
  });
  document.getElementById(`meal-${meal}`).classList.add('active');
}

function selectFood(meal, slotType, foodId) {
  const mealData = nutritionPlan.meals[meal];
  const option = mealData[slotType].options.find(opt => opt.id === foodId);
  
  if (!option) return;
  
  // Salva selezione
  selections[meal][slotType] = option;
  
  // Check warnings
  const warnings = nutritionEngine.checkWarnings(foodId, option.name);
  
  if (warnings.length > 0) {
    // Mostra warning immediato
    let warningHtml = '<div class="warning-box">';
    
    warnings.forEach(warning => {
      warningHtml += `<h4>${warning.message}</h4>`;
      
      if (warning.solutions && warning.solutions.length > 0) {
        warningHtml += '<ul>';
        warning.solutions.forEach(solution => {
          warningHtml += `<li>${solution}</li>`;
        });
        warningHtml += '</ul>';
      }
    });
    
    warningHtml += '</div>';
    
    showModal(`
      <h3>⚠️ Attenzione</h3>
      ${warningHtml}
      <button class="btn btn-close-modal" onclick="closeModal()">Ho capito</button>
    `);
  }
  
  // Re-render the meal
  const isExpired = checkNutritionExpiration(userData?.nutritionScadenza);
  renderApp(isExpired);
  
  // Restore active meal
  switchMealWithoutEvent(meal);
}

function switchMealWithoutEvent(meal) {
  currentMeal = meal;
  document.querySelectorAll('.meal-nav-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.meal-nav-btn').forEach(btn => {
    if (btn.textContent.toLowerCase().includes(meal === 'spuntino1' ? 'spuntino' : meal)) {
      btn.classList.add('active');
    }
  });
  document.querySelectorAll('.meal-container').forEach(c => c.classList.remove('active'));
  document.getElementById(`meal-${meal}`).classList.add('active');
}

function saveMeal(meal) {
  const mealData = selections[meal];
  
  if (Object.keys(mealData).length === 0) {
    showModal(`
      <h3>⚠️ Attenzione</h3>
      <p>Seleziona almeno un alimento prima di salvare</p>
      <button class="btn btn-close-modal" onclick="closeModal()">OK</button>
    `);
    return;
  }
  
  // Save to localStorage
  localStorage.setItem(`nutrition_selections_${userEmail}`, JSON.stringify(selections));
  
  // Add to diary
  addToDiary(meal, mealData);
  
  showModal(`
    <h3>✅ Pasto Salvato!</h3>
    <p>Le tue selezioni per <strong>${meal.toUpperCase()}</strong> sono state salvate nel diario.</p>
    <button class="btn btn-close-modal" onclick="closeModal()">OK</button>
  `);
}

function addToDiary(meal, mealData) {
  const diaryKey = `nutrition_diary_${userEmail}`;
  let diary = {};
  
  const savedDiary = localStorage.getItem(diaryKey);
  if (savedDiary) {
    diary = JSON.parse(savedDiary);
  }
  
  const today = new Date().toISOString().split('T')[0];
  
  if (!diary[today]) {
    diary[today] = {};
  }
  
  diary[today][meal] = {
    ...mealData,
    savedAt: new Date().toISOString()
  };
  
  localStorage.setItem(diaryKey, JSON.stringify(diary));
}

function showCookedEquivalent(name, rawGrams, cookedGrams) {
  showModal(`
    <h3>Conversione Crudo → Cotto</h3>
    <p><strong>${name}</strong></p>
    <p style="font-size: 20px; margin: 20px 0; color: #FFD700;">
      ${rawGrams}g crudo = ~${cookedGrams}g cotto
    </p>
    <p style="color: #B0B0B0;">💡 Se pesi dopo la cottura, usa ~${cookedGrams}g come riferimento</p>
    <button class="btn btn-close-modal" onclick="closeModal()">OK</button>
  `);
}

function showPiecesConversion(name, pieces, grams) {
  showModal(`
    <h3>Conversione Pezzi → Grammi</h3>
    <p><strong>${name}</strong></p>
    <p style="font-size: 20px; margin: 20px 0; color: #FFD700;">
      ${pieces} pezzi = ~${grams}g
    </p>
    <p style="color: #B0B0B0;">💡 Se hai una bilancia, pesa ${grams}g invece di contare i pezzi</p>
    <button class="btn btn-close-modal" onclick="closeModal()">OK</button>
  `);
}

function findAlternative(meal, slotType) {
  const categoryMap = {
    'proteine': meal === 'colazione' ? 'proteine_colazione' : 'proteine_principali',
    'carboidrati': meal === 'colazione' ? 'carboidrati_colazione' : 'carboidrati_principali',
    'grassi': meal === 'colazione' ? 'grassi_colazione' : 'grassi_colazione'
  };

  const searchName = prompt(`Che alimento stai cercando per ${slotType.toUpperCase()}?\n\nEsempi: "skyr", "pane kamut", "burro mandorle"`);
  
  if (!searchName || searchName.trim() === '') return;

  const category = categoryMap[slotType];
  const equivalent = nutritionEngine.findEquivalent(category, searchName);

  if (!equivalent) {
    showModal(`
      <h3>❌ Nessuna corrispondenza</h3>
      <p>Non ho trovato "<strong>${searchName}</strong>" nel database delle alternative.</p>
      <p style="color: #B0B0B0; margin-top: 20px;">💡 Prova con:</p>
      <ul style="color: #B0B0B0; text-align: left; margin: 15px 0; padding-left: 20px;">
        <li>Nomi più generici (es. "yogurt" invece di "yogurt greco fage")</li>
        <li>Alimenti simili a quelli nel piano</li>
        <li>Chiedi al nutrizionista di aggiungere l'alimento</li>
      </ul>
      <button class="btn btn-close-modal" onclick="closeModal()">OK</button>
    `);
    return;
  }

  const accuracy = equivalent.accuracy;
  const matchClass = accuracy >= 85 ? 'ottimo' : accuracy >= 70 ? 'buono' : 'accettabile';
  const matchColor = accuracy >= 85 ? '#4CAF50' : accuracy >= 70 ? '#FFD700' : '#FF9800';

  showModal(`
    <h3>✅ Trovato: ${equivalent.name}</h3>
    
    <div style="background: rgba(255,255,255,0.05); border-radius: 10px; padding: 15px; margin: 20px 0;">
      <div style="text-align: center; margin-bottom: 15px;">
        <span style="color: ${matchColor}; font-size: 18px; font-weight: bold;">
          Match: ${matchClass.toUpperCase()} (${accuracy}%)
        </span>
      </div>
      
      <h4 style="color: #FFD700; font-size: 18px; margin: 15px 0;">Quantità suggerita:</h4>
      <p style="font-size: 24px; color: #FFF; text-align: center; margin: 10px 0;">
        ${equivalent.suggestedQty}g
      </p>
      
      <h4 style="color: #B0B0B0; font-size: 16px; margin: 20px 0 10px 0;">Confronto Macro:</h4>
      <table style="width: 100%; color: #FFF; font-size: 14px; border-collapse: collapse;">
        <tr style="border-bottom: 1px solid rgba(255,255,255,0.1);">
          <th style="text-align: left; padding: 8px;"></th>
          <th style="text-align: center; padding: 8px;">Target</th>
          <th style="text-align: center; padding: 8px;">Con ${equivalent.name}</th>
        </tr>
        <tr style="border-bottom: 1px solid rgba(255,255,255,0.1);">
          <td style="padding: 8px;">Calorie</td>
          <td style="text-align: center; padding: 8px;">${equivalent.targetMacros.kcal}</td>
          <td style="text-align: center; padding: 8px; color: #FFD700;">${equivalent.macros.kcal}</td>
        </tr>
        <tr style="border-bottom: 1px solid rgba(255,255,255,0.1);">
          <td style="padding: 8px;">Proteine</td>
          <td style="text-align: center; padding: 8px;">${equivalent.targetMacros.protein}g</td>
          <td style="text-align: center; padding: 8px; color: #FFD700;">${equivalent.macros.protein}g</td>
        </tr>
        <tr style="border-bottom: 1px solid rgba(255,255,255,0.1);">
          <td style="padding: 8px;">Carboidrati</td>
          <td style="text-align: center; padding: 8px;">${equivalent.targetMacros.carbs}g</td>
          <td style="text-align: center; padding: 8px; color: #FFD700;">${equivalent.macros.carbs}g</td>
        </tr>
        <tr>
          <td style="padding: 8px;">Grassi</td>
          <td style="text-align: center; padding: 8px;">${equivalent.targetMacros.fat}g</td>
          <td style="text-align: center; padding: 8px; color: #FFD700;">${equivalent.macros.fat}g</td>
        </tr>
      </table>
      
      ${equivalent.adjustments ? `
        <div style="background: rgba(255, 150, 0, 0.2); border: 1px solid rgba(255, 150, 0, 0.5); border-radius: 8px; padding: 12px; margin-top: 15px;">
          <p style="color: #FFA500; margin: 0;"><strong>⚠️ Attenzione:</strong> ${equivalent.adjustments}</p>
        </div>
      ` : ''}
      
      ${equivalent.note ? `
        <div style="background: rgba(100, 200, 255, 0.1); border: 1px solid rgba(100, 200, 255, 0.3); border-radius: 8px; padding: 12px; margin-top: 15px;">
          <p style="color: #87CEEB; margin: 0;">💡 ${equivalent.note}</p>
        </div>
      ` : ''}
    </div>
    
    <button class="btn" onclick="useAlternative('${meal}', '${slotType}', ${JSON.stringify(equivalent).replace(/"/g, '&quot;')})" style="width: 100%; margin-top: 20px;">
      Usa questa alternativa
    </button>
    <button class="btn btn-close-modal" onclick="closeModal()" style="width: 100%; margin-top: 10px;">
      Annulla
    </button>
  `);
}

function useAlternative(meal, slotType, equivalent) {
  // Aggiungi l'alternativa alle selezioni
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
  
  // Re-render per mostrare la nuova selezione
  const isExpired = checkNutritionExpiration(userData?.nutritionScadenza);
  renderApp(isExpired);
  switchMealWithoutEvent(meal);
  
  // Mostra conferma
  setTimeout(() => {
    showModal(`
      <h3>✅ Alternativa Aggiunta</h3>
      <p><strong>${equivalent.name}</strong> (${equivalent.suggestedQty}g) è stato aggiunto a ${slotType.toUpperCase()}</p>
      <p style="color: #B0B0B0; margin-top: 15px;">Ricorda di salvare il pasto quando hai finito!</p>
      <button class="btn btn-close-modal" onclick="closeModal()">OK</button>
    `);
  }, 300);
}

// ============================================
// UI STATE FUNCTIONS
// ============================================

function showExpiredBanner() {
  const container = document.getElementById('app-container');
  const banner = `
    <div class="expired-banner">
      <h2>⚠️ Piano Scaduto</h2>
      <p>Il tuo piano alimentare è scaduto. Puoi visualizzarlo ma non salvare modifiche.<br>
      Contatta il nutrizionista per rinnovarlo.</p>
    </div>
  `;
  container.insertAdjacentHTML('afterbegin', banner);
}

function showNoPlan() {
  document.getElementById('app-container').innerHTML = `
    <div class="no-plan">
      <h2>📋 Nessun Piano Disponibile</h2>
      <p>Non hai ancora un piano alimentare assegnato.</p>
      <p>Contatta il nutrizionista per ricevere il tuo piano personalizzato.</p>
    </div>
  `;
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

// Close modal on outside click
window.onclick = function(event) {
  const modal = document.getElementById('nutrition-modal');
  if (event.target === modal) {
    closeModal();
  }
}

// ============================================
// INIT
// ============================================

loadNutritionData();