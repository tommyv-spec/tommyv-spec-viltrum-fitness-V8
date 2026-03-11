// ═══════════════════════════════════════════════════════════════════════════
// VILTRUM FITNESS - UPDATED TRAINING DATA
// Training selector data with nutrition, aerobic, and muscle sections
// ═══════════════════════════════════════════════════════════════════════════

export const updatedTrainingData = {
  nutrition: {
    title: "NUTRIZIONE",
    description: "L'allenamento senza una corretta alimentazione non porta risultati. Che tu voglia vederti meglio allo specchio o migliorare le performance questo tassello è fondamentale.",
    icon: "🍎",
    action: {
      type: "whatsapp",
      phone: "393381590917",
      message: "Ciao! Vorrei fissare una call per parlare di nutrizione 🍎"
    },
    buttonText: "FISSA UNA CALL",
    images: [
      {
        url: "https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=800&q=80",
        mainText: "Nutrizione personalizzata per i tuoi obiettivi",
        caption: "Piano Nutrizionale Su Misura",
        description: "Ricevi un piano alimentare creato specificamente per te, basato sui tuoi obiettivi, stile di vita e preferenze alimentari."
      },
      {
        url: "https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=800&q=80",
        mainText: "Impara a mangiare bene senza rinunce",
        caption: "Educazione Alimentare",
        description: "Scopri come bilanciare i macronutrienti, quando mangiare e come ottimizzare la tua dieta per massimi risultati."
      },
      {
        url: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800&q=80",
        mainText: "Analizza i progressi e migliora costantemente le tue abitudini",
        caption: "Progressi Visibili",
        description: "Grafici dettagliati delle tue abitudini alimentari. Identifica pattern e ottimizza la tua dieta settimana dopo settimana."
      }
    ]
  },
  
  aerobic: {
    title: "ALLENAMENTO AEROBICO",
    description: "L'allenamento aerobico è uno dei pilastri che ti permetteranno di trasformare il tuo corpo e rimanere in salute nel tempo. Scegli il piano di corsa più adatto alle tue esigenze.",
    icon: "🏃",
    action: {
      type: "external_link",
      url: "https://www.42klab.com/category/allenamenti-generici-corsa"
    },
    buttonText: "SCOPRI I PIANI",
    images: [
      {
        url: "https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?w=800&q=80",
        mainText: "Brucia calorie e migliora la resistenza cardiovascolare",
        caption: "Cardio ad Alta Intensità",
        description: "HIIT, corsa e ciclismo per massimizzare la perdita di grasso. Allenamenti da 20-45 minuti che stimolano il metabolismo per ore."
      },
      {
        url: "https://images.unsplash.com/photo-1483721310020-03333e577078?w=800&q=80",
        mainText: "Programmi adattati al tuo livello di fitness attuale",
        caption: "Allenamenti Personalizzati",
        description: "Dal principiante all'atleta avanzato. Progressione automatica basata sulle tue performance e frequenza cardiaca."
      },
      {
        url: "https://images.unsplash.com/photo-1434596922112-19c563067271?w=800&q=80",
        mainText: "Traccia distanza, tempo, calorie e miglioramento costante",
        caption: "Monitora i Progressi",
        description: "Sincronizzazione con smartwatch e fitness tracker. Visualizza statistiche dettagliate e raggiungi nuovi record personali."
      }
    ]
  },
  
  muscle: {
    title: "PIÙ MUSCOLI",
    description: "Abbiamo mixato Body Building, allenamento funzionale e circuiti training creando un metodo di allenamento che ti permetterà di trasformare il tuo corpo e prepararti alle sfide più dure. Accedi e ricevi una settimana di prova gratuita.",
    icon: "💪",
    action: {
      type: "dashboard",
      target: "workouts"
    },
    buttonText: "INIZIA ORA",
    images: [
      {
        url: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&q=80",
        mainText: "Costruisci forza e massa muscolare con allenamento di resistenza mirato",
        caption: "Esercizi Fondamentali",
        description: "Squat, panca, stacco e movimenti composti per crescita massima. Focus sui grandi gruppi muscolari per risultati rapidi e duraturi."
      },
      {
        url: "https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=800&q=80",
        mainText: "Aumenta carichi gradualmente con progressione intelligente",
        caption: "Progressione Intelligente",
        description: "Sistema di sovraccarico progressivo scientificamente provato. Calcolo automatico dei carichi basato sulle tue performance settimanali."
      },
      {
        url: "https://images.unsplash.com/photo-1541534741688-6078c6bfb5c5?w=800&q=80",
        mainText: "Esecuzione perfetta per massimi risultati e sicurezza",
        caption: "Tecnica Perfetta",
        description: "Video guide dettagliate e correzioni in tempo reale. Impara la forma corretta per prevenire infortuni e ottimizzare ogni ripetizione."
      }
    ]
  }
};

/**
 * Handle training zone action
 * @param {string} zoneType - Type of training zone (nutrition, aerobic, muscle)
 * @param {Object} actionData - Action configuration
 */
export function handleTrainingAction(zoneType, actionData) {
  switch (actionData.type) {
    case 'whatsapp':
      openWhatsApp(actionData.phone, actionData.message);
      break;
    
    case 'external_link':
      window.open(actionData.url, '_blank');
      break;
    
    case 'dashboard':
      if (actionData.target === 'workouts') {
        // Scroll to workouts section or navigate to workouts
        const workoutsSection = document.getElementById('workout-list');
        if (workoutsSection) {
          workoutsSection.scrollIntoView({ behavior: 'smooth' });
        }
      }
      break;
    
    default:
      console.warn('Unknown action type:', actionData.type);
  }
}

/**
 * Open WhatsApp with pre-filled message
 * @param {string} phone - Phone number (with country code)
 * @param {string} message - Pre-filled message
 */
function openWhatsApp(phone, message) {
  const encodedMessage = encodeURIComponent(message);
  const whatsappUrl = `https://wa.me/${phone}?text=${encodedMessage}`;
  window.open(whatsappUrl, '_blank');
}

/**
 * Get all training data (including existing + new sections)
 * @returns {Object} Complete training data
 */
export function getAllTrainingData() {
  // This combines the new sections with any existing ones
  return {
    ...updatedTrainingData,
    // Add any other existing training types here
  };
}
