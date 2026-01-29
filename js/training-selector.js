// ═══════════════════════════════════════════════════════════════════════════
// TRAINING SELECTOR - Complete version with all features
// Extracted from workout.js to be used on index.html only
// ═══════════════════════════════════════════════════════════════════════════

let selectedTrainingType = null;

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
    icon: "🥗",
    images: [
      {
        url: "https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=800&q=80",
        mainText: "Nutrizione personalizzata per i tuoi obiettivi",
        caption: "Piano Nutrizionale Su Misura",
        description: "Consulenza personalizzata per creare un piano alimentare adatto ai tuoi obiettivi specifici."
      },
      {
        url: "https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=800&q=80",
        mainText: "Impara a mangiare bene senza rinunce",
        caption: "Educazione Alimentare",
        description: "Scopri come bilanciare la tua alimentazione per ottenere risultati duraturi."
      },
      {
        url: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800&q=80",
        mainText: "Analizza i progressi e migliora le tue abitudini",
        caption: "Progressi Visibili",
        description: "Monitora i tuoi risultati e ottimizza costantemente il tuo approccio nutrizionale."
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
    icon: "🏃",
    images: [
      {
        url: "https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?w=800&q=80",
        mainText: "Brucia calorie e migliora la resistenza cardiovascolare",
        caption: "Cardio ad Alta Intensità",
        description: "Allenamenti aerobici progettati per massimizzare la perdita di grasso e migliorare la salute cardiovascolare."
      },
      {
        url: "https://images.unsplash.com/photo-1483721310020-03333e577078?w=800&q=80",
        mainText: "Programmi adattati al tuo livello di fitness",
        caption: "Allenamenti Personalizzati",
        description: "Piani di corsa su misura per ogni livello, dal principiante all'atleta avanzato."
      },
      {
        url: "https://images.unsplash.com/photo-1434596922112-19c563067271?w=800&q=80",
        mainText: "Traccia distanza, tempo e miglioramento costante",
        caption: "Monitora i Progressi",
        description: "Segui i tuoi miglioramenti e raggiungi nuovi obiettivi settimana dopo settimana."
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
    icon: "💪",
    images: [
      {
        url: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&q=80",
        mainText: "Costruisci forza e massa muscolare con allenamento mirato",
        caption: "Esercizi Fondamentali",
        description: "Movimenti composti per crescita massima e risultati rapidi."
      },
      {
        url: "https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=800&q=80",
        mainText: "Aumenta carichi gradualmente con progressione intelligente",
        caption: "Progressione Intelligente",
        description: "Sistema di sovraccarico progressivo per risultati costanti nel tempo."
      },
      {
        url: "https://images.unsplash.com/photo-1541534741688-6078c6bfb5c5?w=800&q=80",
        mainText: "Esecuzione perfetta per massimi risultati e sicurezza",
        caption: "Tecnica Perfetta",
        description: "Impara la forma corretta per prevenire infortuni e massimizzare i risultati."
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
    
    // Update details section if visible (expanded state)
    if (currentImagesData[currentSlide]) {
      const slideData = currentImagesData[currentSlide];
      
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

      // Update bottom sheet content with TOP-LEVEL mainText
      sheetTitle.textContent = data.title;
      sheetMainText.textContent = data.mainText; // Use the primary description
      
      // Setup carousel with images
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
    
    // Get the action for the selected training type
    const data = trainingData[selectedTrainingType];
    if (!data || !data.action) return;
    
    // Store training type in sessionStorage
    sessionStorage.setItem('selectedTraining', selectedTrainingType);
    
    // Handle action based on type
    switch (data.action.type) {
      case 'whatsapp':
        // Open WhatsApp with pre-filled message
        const message = encodeURIComponent(data.action.message);
        window.open(`https://wa.me/${data.action.phone}?text=${message}`, '_blank');
        break;
        
      case 'external_link':
        // Open external link in new tab
        window.open(data.action.url, '_blank');
        break;
        
      case 'dashboard':
        // Check if user is logged in
        const loggedUser = localStorage.getItem('loggedUser');
        
        if (loggedUser) {
          // User is logged in - go to dashboard
          window.location.href = 'pages/dashboard-v7.html';
        } else {
          // User not logged in - open auth modal
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
        break;
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
