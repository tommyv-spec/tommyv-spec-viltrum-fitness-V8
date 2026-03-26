// ============================================
// NUTRITION ENGINE - V1.6 (with preload support)
// Conversioni, equivalenze e validazioni
// ============================================

class NutritionEngine {
  constructor() {
    this.foodDatabase = null;
    this.initialized = false;
  }

  async init() {
    try {
      // V8: First try to use preloaded database from sessionStorage
      const cached = sessionStorage.getItem('viltrum_food_database');
      if (cached) {
        this.foodDatabase = JSON.parse(cached);
        this.initialized = true;
        console.log('✅ Nutrition Engine initialized (from preloaded cache)');
        return true;
      }
      
      // Fallback: fetch from file
      // Fix path - page is in /pages/ so we need to go up one level
      const response = await fetch('../food-database.json');
      this.foodDatabase = await response.json();
      this.initialized = true;
      
      // Cache for future use
      try {
        sessionStorage.setItem('viltrum_food_database', JSON.stringify(this.foodDatabase));
      } catch (e) {
        // sessionStorage might be full, ignore
      }
      
      console.log('✅ Nutrition Engine initialized (fetched)');
      return true;
    } catch (error) {
      console.error('❌ Error loading food database:', error);
      this.foodDatabase = this.getMinimalDatabase();
      this.initialized = true;
      return false;
    }
  }

  getMinimalDatabase() {
    return {
      "conversions": {
        "rawToCooked": {
          "pasta": { "multiplier": 2.5, "reverse": 0.4 },
          "riso": { "multiplier": 3, "reverse": 0.33 },
          "carne": { "multiplier": 0.75, "reverse": 1.33 },
          "pesce": { "multiplier": 0.8, "reverse": 1.25 }
        }
      }
    };
  }

  piecesToGrams(foodType, pieces) {
    if (!this.foodDatabase?.conversions?.pieceToGrams) return null;
    const conversion = this.foodDatabase.conversions.pieceToGrams[foodType];
    if (!conversion) return null;
    const grams = Math.round(pieces * conversion.unitWeight);
    return { grams, pieces, description: `${pieces} ${conversion.description} = ~${grams}g`, visual: conversion.visual || '' };
  }

  gramsToPieces(foodType, grams) {
    if (!this.foodDatabase?.conversions?.pieceToGrams) return null;
    const conversion = this.foodDatabase.conversions.pieceToGrams[foodType];
    if (!conversion) return null;
    const pieces = Math.round(grams / conversion.unitWeight);
    return { grams, pieces, description: `${grams}g = ~${pieces} ${conversion.description}`, visual: conversion.visual || '' };
  }

  convertRawToCooked(foodType, rawGrams) {
    if (!this.foodDatabase?.conversions?.rawToCooked) return null;
    const conversion = this.foodDatabase.conversions.rawToCooked[foodType];
    if (!conversion) return null;
    const cookedGrams = Math.round(rawGrams * conversion.multiplier);
    return { rawGrams, cookedGrams, multiplier: conversion.multiplier, description: conversion.description || '', formula: `${rawGrams}g crudo × ${conversion.multiplier} = ~${cookedGrams}g cotto` };
  }

  convertCookedToRaw(foodType, cookedGrams) {
    if (!this.foodDatabase?.conversions?.rawToCooked) return null;
    const conversion = this.foodDatabase.conversions.rawToCooked[foodType];
    if (!conversion) return null;
    const rawGrams = Math.round(cookedGrams * conversion.reverse);
    return { cookedGrams, rawGrams, multiplier: conversion.reverse, formula: `${cookedGrams}g cotto × ${conversion.reverse} = ~${rawGrams}g crudo` };
  }

  findEquivalent(category, searchName) {
    if (!this.foodDatabase?.equivalents) return null;
    const group = this.foodDatabase.equivalents[category];
    if (!group) return null;
    const searchLower = searchName.toLowerCase();
    const found = group.alternatives.find(alt => alt.name.toLowerCase().includes(searchLower) || alt.id.toLowerCase().includes(searchLower));
    if (!found) return null;
    const foodMacros = this.calculateMacros(found.per100g, found.suggestedQty);
    const accuracy = this.calculateMacroAccuracy(group.baseProfile, foodMacros);
    return { ...found, accuracy, macros: foodMacros, targetMacros: group.baseProfile, matchQuality: accuracy >= 85 ? 'ottimo' : accuracy >= 70 ? 'buono' : 'accettabile' };
  }

  calculateMacros(per100g, quantity) {
    const factor = quantity / 100;
    return { kcal: Math.round(per100g.kcal * factor), protein: Math.round(per100g.protein * factor * 10) / 10, carbs: Math.round(per100g.carbs * factor * 10) / 10, fat: Math.round(per100g.fat * factor * 10) / 10 };
  }

  calculateMacroAccuracy(target, actual) {
    const weights = { kcal: 0.3, protein: 0.4, carbs: 0.2, fat: 0.1 };
    let totalDiff = 0;
    Object.keys(weights).forEach(key => {
      const targetValue = target[key] || 0.1;
      const actualValue = actual[key] || 0;
      const diff = Math.abs(targetValue - actualValue) / Math.max(targetValue, 1);
      totalDiff += diff * weights[key];
    });
    return Math.round((1 - totalDiff) * 100);
  }

  checkWarnings(foodId, foodName) {
    if (!this.foodDatabase?.warnings) return [];
    const warnings = [];
    const searchText = `${foodId} ${foodName}`.toLowerCase();
    Object.entries(this.foodDatabase.warnings).forEach(([key, warning]) => {
      const triggers = Array.isArray(warning.trigger) ? warning.trigger : [warning.trigger];
      const matches = triggers.some(trigger => searchText.includes(trigger.toLowerCase()));
      if (matches) warnings.push({ ...warning, key });
    });
    return warnings;
  }

  getVisualMeasure(grams, foodType = null) {
    if (!this.foodDatabase?.visualMeasures) return null;
    const hands = this.foodDatabase.visualMeasures.hands;
    if (grams >= 100 && grams <= 130 && (!foodType || foodType.includes('carne') || foodType.includes('pesce'))) {
      return { type: 'hand', measure: 'palmo', ...hands.palmo, grams };
    }
    if (grams >= 140 && grams <= 170 && foodType && (foodType.includes('pasta') || foodType.includes('patate'))) {
      return { type: 'hand', measure: 'pugno', ...hands.pugno, grams };
    }
    return null;
  }
}

const nutritionEngine = new NutritionEngine();
document.addEventListener('DOMContentLoaded', () => { nutritionEngine.init(); });
