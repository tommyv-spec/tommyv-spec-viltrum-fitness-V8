// Calcola l'altezza reale visibile (anche con barre di Safari) e la salva in --dvh-px
(function () {
  const docEl = document.documentElement;

  function setDvh() {
    const vv = window.visualViewport;
    const height = vv ? vv.height : window.innerHeight;
    // Imposta la variabile CSS globale
    docEl.style.setProperty('--dvh-px', height + 'px');
  }

  // Primo set immediato
  setDvh();

  // Aggiorna su: resize finestra + resize visualViewport (iOS Safari)
  window.addEventListener('resize', setDvh, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', setDvh, { passive: true });
    window.visualViewport.addEventListener('scroll', setDvh, { passive: true });
  }

  // Fix: quando la bottom bar di Safari appare/scompare dopo tap
  document.addEventListener('visibilitychange', setDvh);
})();
