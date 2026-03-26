/**
 * Instant Navigation Handler
 * 
 * Intercepts navigation clicks and shows instant transition overlay
 * to hide browser's native loading bar during page transitions.
 * 
 * This makes the PWA feel like a native app with instant navigation.
 */

(function() {
  'use strict';

  // Create overlay element
  const overlay = document.createElement('div');
  overlay.className = 'nav-transition-overlay';
  overlay.id = 'nav-transition-overlay';
  
  // Add to DOM on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      document.body.appendChild(overlay);
    });
  } else {
    document.body.appendChild(overlay);
  }

  // Intercept all navigation clicks
  document.addEventListener('click', (e) => {
    // Find if click was on a link or inside a link
    const link = e.target.closest('a');
    
    if (!link) return;
    
    const href = link.getAttribute('href');
    
    // Skip if:
    // - No href
    // - External link (contains http)
    // - Anchor link (starts with #)
    // - Opens in new tab
    // - Has download attribute
    if (!href || 
        href.startsWith('http') || 
        href.startsWith('#') || 
        link.target === '_blank' ||
        link.hasAttribute('download')) {
      return;
    }
    
    // Show overlay instantly
    const transitionOverlay = document.getElementById('nav-transition-overlay');
    if (transitionOverlay) {
      transitionOverlay.classList.add('active');
    }
    
    // Let navigation proceed normally - overlay will hide native loading bar
  }, { capture: true, passive: true });

  // Remove overlay when new page loads
  window.addEventListener('pageshow', () => {
    const transitionOverlay = document.getElementById('nav-transition-overlay');
    if (transitionOverlay) {
      // Small delay to ensure content is visible
      setTimeout(() => {
        transitionOverlay.classList.remove('active');
      }, 50);
    }
  });

})();
