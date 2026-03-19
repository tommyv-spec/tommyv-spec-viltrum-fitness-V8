// ═══════════════════════════════════════════════════════════════════════════
// TRAINING SELECTOR - Complete version with all features
// Extracted from workout.js to be used on index.html only
// ═══════════════════════════════════════════════════════════════════════════

let selectedTrainingType = null;

const trainingData = {
  nutrition: {
    title: "NUTRIZIONE",
    description: "Traccia ogni pasto e raggiungi i tuoi obiettivi con precisione",
    icon: "🥗",
    images: [
      {
        url: "https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=800&q=80",
        mainText: "Traccia i tuoi macronutrienti con precisione per risultati ottimali",
        caption: "Traccia Macronutrienti",
        description: "Monitora proteine, carboidrati e grassi in tempo reale. Sistema avanzato di logging alimentare con database completo di oltre 50.000 alimenti."
      },
      {
        url: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&q=80",
        mainText: "Piano alimentare personalizzato basato sui tuoi obiettivi",
        caption: "Piano Personalizzato",
        description: "Ricette e piani pasto generati automaticamente in base ai tuoi obiettivi. Adatta le porzioni e sostituisci ingredienti con un click."
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
    description: "Brucia calorie, aumenta resistenza e migliora la salute cardiovascolare",
    icon: "🏃",
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
    description: "Costruisci forza e massa muscolare con allenamento di resistenza mirato",
    icon: "💪",
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

function initTrainingSelector() {
  const zones = document.querySelectorAll('.training-zone');
  const bottomSheet = document.getElementById('training-bottom-sheet');
  const sheetOverlay = bottomSheet?.querySelector('.bottom-sheet-overlay');
  const sheetTitle = document.getElementById('sheet-title');
  const sheetMainText = document.getElementById('sheet-main-text');
  const startBtn = document.getElementById('sheet-start-btn');
  
  // Carousel elements
  const carouselTrack = document.getElementById('carousel-track');
  const carouselDots = document.getElementById('carousel-dots');
  const prevBtn = document.getElementById('carousel-prev');
  const nextBtn = document.getElementById('carousel-next');
  const carouselTextOverlay = document.getElementById('carousel-text-overlay');
  const overlayText = document.getElementById('overlay-text');
  const detailsSection = document.getElementById('details-section');
  
  let currentSlide = 0;
  let totalSlides = 0;
  let currentImagesData = []; // Store current training images data

  if (!bottomSheet || zones.length === 0) return;

  // Carousel navigation function
  function updateCarousel(index) {
    if (!carouselTrack || totalSlides === 0) return;
    
    currentSlide = Math.max(0, Math.min(index, totalSlides - 1));
    const offset = -currentSlide * 100;
    carouselTrack.style.transform = `translateX(${offset}%)`;
    
    // Update dots
    const dots = carouselDots?.querySelectorAll('.carousel-dot');
    dots?.forEach((dot, i) => {
      dot.classList.toggle('active', i === currentSlide);
    });
    
    // Update button states
    if (prevBtn) prevBtn.disabled = currentSlide === 0;
    if (nextBtn) nextBtn.disabled = currentSlide === totalSlides - 1;
    
    // Update main text and overlay text with current slide data
    if (currentImagesData[currentSlide]) {
      const slideData = currentImagesData[currentSlide];
      
      // Update main text (visible when not expanded)
      if (sheetMainText) {
        sheetMainText.textContent = slideData.mainText;
      }
      
      // Update overlay text (visible when expanded)
      if (overlayText) {
        overlayText.textContent = slideData.mainText;
      }
      
      // Update details section if visible (expanded state)
      if (detailsSection && detailsSection.style.display !== 'none') {
        detailsSection.innerHTML = `
          <div class="detail-item">
            <h4>${slideData.caption}</h4>
            <p>${slideData.description}</p>
          </div>
        `;
      }
    }
  }
  
  // Initialize carousel with images
  function setupCarousel(images) {
    if (!carouselTrack || !carouselDots) return;
    
    // Save images data for text updates
    currentImagesData = images;
    
    // Clear existing content
    carouselTrack.innerHTML = '';
    carouselDots.innerHTML = '';
    currentSlide = 0;
    totalSlides = images.length;
    
    // Create slides
    images.forEach((img, index) => {
      const slide = document.createElement('div');
      slide.className = 'carousel-slide';
      slide.innerHTML = `
        <img src="${img.url}" alt="${img.caption}" loading="lazy">
      `;
      carouselTrack.appendChild(slide);
      
      // Create dot
      const dot = document.createElement('button');
      dot.className = 'carousel-dot';
      dot.setAttribute('aria-label', `Slide ${index + 1}`);
      dot.addEventListener('click', () => updateCarousel(index));
      carouselDots.appendChild(dot);
    });
    
    updateCarousel(0);
  }
  
  // Carousel button handlers
  prevBtn?.addEventListener('click', () => {
    updateCarousel(currentSlide - 1);
  });
  
  nextBtn?.addEventListener('click', () => {
    updateCarousel(currentSlide + 1);
  });
  
  // Touch/swipe support for carousel
  let touchStartX = 0;
  let touchEndX = 0;
  
  carouselTrack?.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
  });
  
  carouselTrack?.addEventListener('touchend', (e) => {
    touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX - touchEndX;
    
    if (Math.abs(diff) > 50) {
      if (diff > 0) {
        // Swipe left - next
        updateCarousel(currentSlide + 1);
      } else {
        // Swipe right - prev
        updateCarousel(currentSlide - 1);
      }
    }
  });

  // Add haptic feedback (if available)
  function vibrate(pattern = 10) {
    if (navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  }

  // Handle zone clicks
  zones.forEach(zone => {
    zone.addEventListener('click', (e) => {
      e.preventDefault();
      const trainingType = zone.dataset.training;
      const data = trainingData[trainingType];
      
      if (!data) return;

      // Haptic feedback
      vibrate(10);

      // Visual feedback
      zone.classList.add('tapped');
      setTimeout(() => zone.classList.remove('tapped'), 600);

      // Store selected training
      selectedTrainingType = trainingType;

      // Update bottom sheet content
      sheetTitle.textContent = data.title;
      
      // Setup carousel with images (will also initialize main text)
      if (data.images && data.images.length > 0) {
        setupCarousel(data.images);
      }

      // Show bottom sheet
      setTimeout(() => {
        bottomSheet.classList.add('active');
        if (typeof updateViewportMetrics === 'function') {
          updateViewportMetrics();
        }
      }, 300);
    });
  });

  // Close bottom sheet
  function closeBottomSheet() {
    bottomSheet.classList.remove('active');
    bottomSheet.classList.remove('details-expanded');
    
    // Reset details section
    const detailsSectionEl = document.getElementById('details-section');
    const detailsToggleBtnEl = document.getElementById('details-toggle-btn');
    const sheetTitleEl = document.getElementById('sheet-title');
    const sheetMainTextEl = document.getElementById('sheet-main-text');
    const carouselTextOverlayEl = document.getElementById('carousel-text-overlay');
    
    if (detailsSectionEl) detailsSectionEl.style.display = 'none';
    if (detailsToggleBtnEl) {
      detailsToggleBtnEl.classList.remove('expanded');
      const toggleIcon = detailsToggleBtnEl.querySelector('.toggle-icon');
      const toggleText = detailsToggleBtnEl.querySelector('span:first-child');
      if (toggleIcon) toggleIcon.textContent = '↓';
      if (toggleText) toggleText.textContent = 'Altri dettagli';
    }
    if (sheetTitleEl) sheetTitleEl.style.display = 'block';
    if (sheetMainTextEl) sheetMainTextEl.style.display = 'block';
    if (carouselTextOverlayEl) carouselTextOverlayEl.style.display = 'none';
    
    vibrate(5);
    if (typeof updateViewportMetrics === 'function') {
      updateViewportMetrics();
    }
  }

  sheetOverlay?.addEventListener('click', closeBottomSheet);

  // Start training button
  startBtn?.addEventListener('click', () => {
    vibrate([10, 50, 10]);
    closeBottomSheet();
    
    // Store training type in sessionStorage
    if (selectedTrainingType) {
      sessionStorage.setItem('selectedTraining', selectedTrainingType);
    }

    // Check if user is logged in and handle accordingly
    const loggedUser = localStorage.getItem('loggedUser');
    
    if (loggedUser) {
      // User is logged in - go to dashboard
      window.location.href = 'pages/dashboard.html';
    } else {
      // User not logged in - open auth modal if available
      if (typeof openAuthModal === 'function') {
        openAuthModal();
      } else {
        // Fallback: scroll to login card
        const loginCard = document.querySelector('.login-card');
        if (loginCard) {
          loginCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
          
          // Optional: highlight login card briefly
          loginCard.style.border = '2px solid var(--color-white)';
          loginCard.style.transition = 'border 0.3s ease';
          setTimeout(() => {
            loginCard.style.border = '';
          }, 1500);
        }
      }
    }
  });

  // Details toggle button
  const detailsToggleBtn = document.getElementById('details-toggle-btn');
  
  detailsToggleBtn?.addEventListener('click', () => {
    const isExpanded = detailsSection.style.display !== 'none';
    
    if (isExpanded) {
      // Collapse
      detailsSection.style.display = 'none';
      detailsToggleBtn.classList.remove('expanded');
      detailsToggleBtn.querySelector('.toggle-icon').textContent = '↓';
      detailsToggleBtn.querySelector('span:first-child').textContent = 'Altri dettagli';
      sheetTitle.style.display = 'block';
      sheetMainText.style.display = 'block';
      carouselTextOverlay.style.display = 'none';
      bottomSheet.classList.remove('details-expanded');
    } else {
      // Expand - show ONLY current slide details
      if (currentImagesData[currentSlide]) {
        const slideData = currentImagesData[currentSlide];
        detailsSection.innerHTML = `
          <div class="detail-item">
            <h4>${slideData.caption}</h4>
            <p>${slideData.description}</p>
          </div>
        `;
      }
      
      detailsSection.style.display = 'block';
      detailsToggleBtn.classList.add('expanded');
      detailsToggleBtn.querySelector('.toggle-icon').textContent = '↑';
      detailsToggleBtn.querySelector('span:first-child').textContent = 'Nascondi dettagli';
      sheetTitle.style.display = 'none';
      sheetMainText.style.display = 'none';
      carouselTextOverlay.style.display = 'flex';
      bottomSheet.classList.add('details-expanded');
    }
    
    vibrate(5);
  });

  // Swipe down to close (mobile gesture)
  let touchStartY = 0;
  const panel = bottomSheet.querySelector('.bottom-sheet-panel');
  
  panel?.addEventListener('touchstart', (e) => {
    touchStartY = e.touches[0].clientY;
  });

  panel?.addEventListener('touchmove', (e) => {
    const touchY = e.touches[0].clientY;
    const diff = touchY - touchStartY;
    
    if (diff > 0) {
      panel.style.transform = `translateY(${diff}px)`;
    }
  });

  panel?.addEventListener('touchend', (e) => {
    const touchY = e.changedTouches[0].clientY;
    const diff = touchY - touchStartY;
    
    if (diff > 100) {
      closeBottomSheet();
    }
    
    panel.style.transform = '';
    touchStartY = 0;
  });
}

// Sequential animation for training zones
function startSequentialAnimation() {
  const zones = document.querySelectorAll('.training-zone');
  if (zones.length === 0) {
    console.warn('No training zones found for animation');
    return;
  }

  
  let currentIndex = 0;
  let animationInterval;
  
  function animateZone(zone) {
    const tapText = zone.querySelector('.tap-text');
    const ripple1 = zone.querySelector('.ripple-1');
    const ripple2 = zone.querySelector('.ripple-2');
    
    
    // Reset animations
    if (tapText) tapText.style.animation = 'none';
    if (ripple1) ripple1.style.animation = 'none';
    if (ripple2) ripple2.style.animation = 'none';
    
    // Force reflow
    void zone.offsetWidth;
    
    // Apply animations using requestAnimationFrame for best mobile support
    requestAnimationFrame(() => {
      zone.classList.add('animating');
      
      if (tapText) {
        tapText.style.animation = 'text-appear 2s ease-out forwards';
      }
      
      if (ripple1) {
        ripple1.style.animation = 'ripple-wave 2s ease-out forwards';
      }
      
      if (ripple2) {
        ripple2.style.animation = 'ripple-wave-delayed 2s ease-out 0.3s forwards';
      }
    });
    
    // Clean up after animation
    setTimeout(() => {
      zone.classList.remove('animating');
      if (tapText) tapText.style.animation = '';
      if (ripple1) ripple1.style.animation = '';
      if (ripple2) ripple2.style.animation = '';
    }, 2100);
  }
  
  function animateNextZone() {
    // Reset all zones
    zones.forEach(z => {
      z.classList.remove('animating');
      const tapText = z.querySelector('.tap-text');
      const ripple1 = z.querySelector('.ripple-1');
      const ripple2 = z.querySelector('.ripple-2');
      if (tapText) tapText.style.animation = '';
      if (ripple1) ripple1.style.animation = '';
      if (ripple2) ripple2.style.animation = '';
    });
    
    // Animate current zone
    if (currentIndex < zones.length) {
      const currentZone = zones[currentIndex];
      animateZone(currentZone);
      currentIndex++;
    } else {
      // Restart from beginning
      currentIndex = 0;
    }
  }
  
  // Touch event for manual trigger
  zones.forEach((zone, index) => {
    zone.addEventListener('touchstart', (e) => {
      animateZone(zone);
    }, { passive: true });
  });
  
  // Start animation loop
  setTimeout(() => {
    animateNextZone();
    animationInterval = setInterval(animateNextZone, 2200);
    window.trainingAnimationInterval = animationInterval;
  }, 500);
}

// Initialize on DOM load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('🎯 Training Selector: Initializing...');
    initTrainingSelector();
    // Small delay to ensure DOM is fully ready
    setTimeout(startSequentialAnimation, 100);
    console.log('✅ Training Selector: Ready!');
  });
} else {
  console.log('🎯 Training Selector: Initializing...');
  initTrainingSelector();
  setTimeout(startSequentialAnimation, 100);
  console.log('✅ Training Selector: Ready!');
}
