// ═══════════════════════════════════════════════════════════════════════════
// TRAINING SELECTOR - Interactive training zone selection
// ═══════════════════════════════════════════════════════════════════════════

// Training data for each type
const trainingData = {
  nutrition: {
    title: "NUTRIZIONE",
    mainText: "L'allenamento senza una corretta alimentazione non porta risultati. Che tu voglia vederti meglio allo specchio o migliorare le performance questo tassello è fondamentale.",
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
        caption: "Piano Nutrizionale Su Misura"
      },
      {
        url: "https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=800&q=80",
        mainText: "Impara a mangiare bene senza rinunce",
        caption: "Educazione Alimentare"
      },
      {
        url: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800&q=80",
        mainText: "Analizza i progressi e migliora costantemente le tue abitudini",
        caption: "Progressi Visibili"
      }
    ]
  },
  
  aerobic: {
    title: "ALLENAMENTO AEROBICO",
    mainText: "L'allenamento aerobico è uno dei pilastri che ti permetteranno di trasformare il tuo corpo e rimanere in salute nel tempo. Scegli il piano di corsa più adatto alle tue esigenze.",
    action: {
      type: "external_link",
      url: "https://www.42klab.com/category/allenamenti-generici-corsa"
    },
    buttonText: "SCOPRI I PIANI",
    images: [
      {
        url: "https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?w=800&q=80",
        mainText: "Brucia calorie e migliora la resistenza cardiovascolare",
        caption: "Cardio ad Alta Intensità"
      },
      {
        url: "https://images.unsplash.com/photo-1483721310020-03333e577078?w=800&q=80",
        mainText: "Programmi adattati al tuo livello di fitness attuale",
        caption: "Allenamenti Personalizzati"
      },
      {
        url: "https://images.unsplash.com/photo-1434596922112-19c563067271?w=800&q=80",
        mainText: "Traccia distanza, tempo, calorie e miglioramento costante",
        caption: "Monitora i Progressi"
      }
    ]
  },
  
  muscle: {
    title: "PIÙ MUSCOLI",
    mainText: "Abbiamo mixato Body Building, allenamento funzionale e circuiti training creando un metodo di allenamento che ti permetterà di trasformare il tuo corpo e prepararti alle sfide più dure. Accedi e ricevi una settimana di prova gratuita.",
    action: {
      type: "dashboard",
      target: "workouts"
    },
    buttonText: "INIZIA ORA",
    images: [
      {
        url: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&q=80",
        mainText: "Costruisci forza e massa muscolare con allenamento di resistenza mirato",
        caption: "Esercizi Fondamentali"
      },
      {
        url: "https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=800&q=80",
        mainText: "Aumenta carichi gradualmente con progressione intelligente",
        caption: "Progressione Intelligente"
      },
      {
        url: "https://images.unsplash.com/photo-1541534741688-6078c6bfb5c5?w=800&q=80",
        mainText: "Esecuzione perfetta per massimi risultati e sicurezza",
        caption: "Tecnica Perfetta"
      }
    ]
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// RIPPLE ANIMATION SYSTEM - FIX
// ═══════════════════════════════════════════════════════════════════════════

let isAnimating = false;
let animationQueue = [];

// Start ripple animation for a zone
function startRippleAnimation(zone) {
  if (zone.classList.contains('animating')) return;
  
  console.log('🌊 Starting ripple animation for zone:', zone.dataset.training);
  
  // Add animating class (this triggers CSS animation)
  zone.classList.add('animating');
  
  // Remove class after animation completes
  setTimeout(() => {
    zone.classList.remove('animating');
    console.log('✅ Ripple animation complete');
  }, 2300); // 2s animation + 300ms buffer
}

// Sequential animation manager
function startSequentialAnimation() {
  if (isAnimating) return;
  
  isAnimating = true;
  const zones = document.querySelectorAll('.training-zone');
  
  console.log('🎬 Starting sequential zone animations');
  
  zones.forEach((zone, index) => {
    setTimeout(() => {
      startRippleAnimation(zone);
      if (index === zones.length - 1) {
        setTimeout(() => {
          isAnimating = false;
        }, 2500);
      }
    }, index * 800); // Stagger animations by 800ms
  });
}

// Trigger animation on page load
function initPageAnimations() {
  setTimeout(() => {
    startSequentialAnimation();
  }, 500); // Start after page settles
  
  // Restart animations every 15 seconds
  setInterval(() => {
    if (!isAnimating) {
      startSequentialAnimation();
    }
  }, 15000);
}

// ═══════════════════════════════════════════════════════════════════════════
// TRAINING SELECTOR INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

// Initialize training selector on page load
document.addEventListener('DOMContentLoaded', () => {
  console.log('🎯 Training Selector: Initializing...');
  
  const trainingZones = document.querySelectorAll('.training-zone');
  const bottomSheet = document.getElementById('training-bottom-sheet');
  const overlay = bottomSheet?.querySelector('.bottom-sheet-overlay');
  const sheetTitle = document.getElementById('sheet-title');
  const sheetMainText = document.getElementById('sheet-main-text');
  const carouselTrack = document.getElementById('carousel-track');
  const carouselDots = document.getElementById('carousel-dots');
  const prevBtn = document.getElementById('carousel-prev');
  const nextBtn = document.getElementById('carousel-next');
  const startBtn = document.getElementById('sheet-start-btn');
  
  let currentIndex = 0;
  let currentTraining = null;
  
  // Initialize animations
  initPageAnimations();
  
  // Add click handlers to training zones
  trainingZones.forEach(zone => {
    zone.addEventListener('click', (e) => {
      e.preventDefault();
      const trainingType = zone.dataset.training;
      
      console.log('🎯 Training zone clicked:', trainingType);
      
      // Add click effect with ripple
      zone.style.transform = 'scale(0.95)';
      startRippleAnimation(zone);
      
      setTimeout(() => {
        zone.style.transform = '';
      }, 150);
      
      openBottomSheet(trainingType);
    });
    
    // Add hover effect
    zone.addEventListener('mouseenter', () => {
      if (!zone.classList.contains('animating')) {
        zone.style.transform = 'scale(1.05)';
      }
    });
    
    zone.addEventListener('mouseleave', () => {
      if (!zone.classList.contains('animating')) {
        zone.style.transform = '';
      }
    });
    
    // Add touch feedback
    zone.addEventListener('touchstart', () => {
      startRippleAnimation(zone);
    }, { passive: true });
  });
  
  // Function to open bottom sheet
  function openBottomSheet(trainingType) {
    currentTraining = trainingType;
    const data = trainingData[trainingType];
    
    if (!data) {
      console.error('❌ Training data not found for:', trainingType);
      return;
    }
    
    // Update content
    sheetTitle.textContent = data.title;
    sheetMainText.textContent = data.mainText;
    startBtn.textContent = data.buttonText;
    
    // Build carousel
    carouselTrack.innerHTML = '';
    carouselDots.innerHTML = '';
    
    data.images.forEach((img, index) => {
      // Create slide
      const slide = document.createElement('div');
      slide.className = 'carousel-slide';
      slide.innerHTML = `
        <img src="${img.url}" alt="${img.caption}" loading="lazy">
        <div class="carousel-caption">${img.caption}</div>
      `;
      carouselTrack.appendChild(slide);
      
      // Create dot
      const dot = document.createElement('button');
      dot.className = 'carousel-dot' + (index === 0 ? ' active' : '');
      dot.setAttribute('aria-label', `Go to slide ${index + 1}`);
      dot.addEventListener('click', () => goToSlide(index));
      carouselDots.appendChild(dot);
    });
    
    currentIndex = 0;
    updateCarousel();
    
    // Store selection
    sessionStorage.setItem('selectedTraining', trainingType);
    
    // Show bottom sheet with animation
    setTimeout(() => {
      bottomSheet.classList.add('active');
    }, 50);
  }
  
  // Close bottom sheet
  function closeBottomSheet() {
    bottomSheet.classList.remove('active');
  }
  
  // Overlay click closes sheet
  overlay?.addEventListener('click', closeBottomSheet);
  
  // Carousel navigation
  function goToSlide(index) {
    const data = trainingData[currentTraining];
    if (!data) return;
    
    currentIndex = index;
    if (currentIndex < 0) currentIndex = data.images.length - 1;
    if (currentIndex >= data.images.length) currentIndex = 0;
    
    updateCarousel();
  }
  
  function updateCarousel() {
    const data = trainingData[currentTraining];
    if (!data) return;
    
    // Move track
    carouselTrack.style.transform = `translateX(-${currentIndex * 100}%)`;
    
    // Update dots
    const dots = carouselDots.querySelectorAll('.carousel-dot');
    dots.forEach((dot, index) => {
      dot.classList.toggle('active', index === currentIndex);
    });
    
    // Update main text
    sheetMainText.textContent = data.images[currentIndex].mainText;
  }
  
  prevBtn?.addEventListener('click', () => goToSlide(currentIndex - 1));
  nextBtn?.addEventListener('click', () => goToSlide(currentIndex + 1));
  
  // Start button action
  startBtn?.addEventListener('click', () => {
    const data = trainingData[currentTraining];
    if (!data) return;
    
    closeBottomSheet();
    
    // Handle action based on type
    switch (data.action.type) {
      case 'whatsapp':
        const message = encodeURIComponent(data.action.message);
        window.open(`https://wa.me/${data.action.phone}?text=${message}`, '_blank');
        break;
        
      case 'external_link':
        window.open(data.action.url, '_blank');
        break;
        
      case 'dashboard':
        // Check if logged in
        if (localStorage.getItem('loggedUser')) {
          window.location.href = 'pages/dashboard.html';
        } else {
          // Open auth modal
          if (typeof openAuthModal === 'function') {
            openAuthModal();
          } else {
            window.location.href = 'pages/dashboard.html';
          }
        }
        break;
    }
  });
  
  console.log('✅ Training Selector: Ready!');
  console.log('✅ Ripple Animations: Active!');
});
