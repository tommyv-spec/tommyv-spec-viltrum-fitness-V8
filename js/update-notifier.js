// ═══════════════════════════════════════════════════════════════════════════
// VILTRUM FITNESS - AUTO UPDATER (v10.2)
// Niente più banner "Aggiorna": il service worker nuovo si attiva da solo
// (skipWaiting in sw.js) e questa pagina si ricarica UNA volta, in silenzio,
// così l'utente è sempre sull'ultima versione deployata.
//
// Regole:
// - MAI ricaricare durante un workout o una corsa (pagine workout/endurance):
//   lì il nuovo SW resta attivo in background e la nuova UI arriva alla
//   prossima navigazione. Un reload a metà sessione è inaccettabile.
// - Guardia anti-loop: massimo un reload ogni 10 secondi (sessionStorage).
// - Vecchi client con un SW "waiting" in coda: gli mandiamo comunque
//   SKIP_WAITING così saltano dritti all'ultima versione senza tap.
// ═══════════════════════════════════════════════════════════════════════════

class UpdateNotifier {
  constructor() {
    this.reloading = false;
    this.init();
  }

  // Pagine dove un reload automatico può interrompere una sessione attiva.
  isSessionPage() {
    return /workout\.html|endurance\.html|workout-completion\.html/.test(window.location.pathname);
  }

  activate(registration) {
    // Copre i client rimasti con un worker in waiting installato PRIMA che
    // skipWaiting entrasse in sw.js.
    if (registration.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  }

  // Ricarica SENZA che l'utente se ne accorga.
  //
  // Un reload è invisibile in due momenti: mentre la pagina si sta ancora
  // aprendo, e mentre l'app è in background. Ricaricare una pagina che
  // qualcuno sta GUARDANDO è esattamente ciò che faceva sembrare rotta la
  // dashboard dopo ogni deploy: la card "LA TUA PROSSIMA SESSIONE" compariva,
  // spariva e ricompariva, perché il self-heal ricaricava dopo 8 secondi.
  //
  // Se non siamo più in fase di apertura, il reload viene rimandato a quando
  // l'app passa in background. Non si perde nulla: il nuovo SW ha già il
  // controllo, quindi qualsiasi navigazione dell'utente serve comunque la
  // build nuova.
  //
  // @param {string} reason - per il log
  // @param {Function} [beforeReload] - eseguita subito prima del reload
  //        (es. cancellare le cache), MAI in anticipo: svuotare le cache di
  //        una pagina ancora viva la lascerebbe senza asset.
  reloadWhenUnwatched(reason, beforeReload) {
    if (this.reloading) return;

    const go = async () => {
      if (this.reloading || this.isSessionPage()) return;
      this.reloading = true;
      if (beforeReload) { try { await beforeReload(); } catch (e) {} }
      console.log(`[UpdateNotifier] reload (${reason})`);
      window.location.reload();
    };

    // La pagina si sta ancora aprendo: nessuno vede niente.
    const msOnScreen = (typeof performance !== 'undefined' && performance.now)
      ? performance.now() : Infinity;
    if (msOnScreen < 2500) { go(); return; }

    console.log(`[UpdateNotifier] reload rimandato (${reason}) — pagina in uso`);
    const onHide = () => {
      if (!document.hidden) return;
      document.removeEventListener('visibilitychange', onHide);
      go();
    };
    document.addEventListener('visibilitychange', onHide);
  }

  // v10.3 SELF-HEAL (iOS): confronta la versione IN ESECUZIONE (version.js
  // locale, incluso in ogni pagina) con quella VERA sul server (fetch
  // no-store). Se non coincidono: forza l'update del SW e, se la pagina resta
  // vecchia, cancella le cache versionate e ricarica.
  // È la via d'uscita deterministica dalle build stantie delle PWA iOS.
  //
  // L'attesa era 8 SECONDI. Troppo tardi: la dashboard era già disegnata e
  // l'utente vedeva la pagina ricaricarsi in faccia (bug "la card compare,
  // sparisce e ricompare", 2026-08-22). Ora l'attesa è breve — quel tanto che
  // basta perché il percorso normale (skipWaiting -> controllerchange) vinca
  // la corsa, e `this.reloading` fa da dedup se ci arriva prima — e il reload
  // passa da reloadWhenUnwatched, che ricarica solo quando non si vede.
  async selfHeal(registration, isInPages) {
    try {
      const localV = window.VILTRUM_VERSION || null;
      if (!localV) return;
      const url = (isInPages ? '../' : './') + 'js/version.js?heal=' + Date.now();
      const txt = await (await fetch(url, { cache: 'no-store' })).text();
      const m = txt.match(/v[\d.]+/);
      if (!m || m[0] === localV) return;
      console.warn(`[UpdateNotifier] build stantia: locale ${localV}, live ${m[0]} — self-heal`);
      try { await registration.update(); } catch (e) {}
      this.activate(registration);
      setTimeout(() => {
        if (this.isSessionPage() || this.reloading) return;
        const last = parseInt(sessionStorage.getItem('viltrum_selfheal_ts') || '0', 10);
        if (Date.now() - last < 30000) return; // anti-loop
        sessionStorage.setItem('viltrum_selfheal_ts', String(Date.now()));
        this.reloadWhenUnwatched('self-heal', async () => {
          const names = await caches.keys();
          await Promise.all(names
            .filter(n => n.startsWith('viltrum-fitness-') || n.startsWith('viltrum-runtime-'))
            .map(n => caches.delete(n)));
        });
      }, 1200);
    } catch (e) {}
  }

  init() {
    if (!('serviceWorker' in navigator)) return;

    const isInPages = window.location.pathname.includes('/pages/');
    const swPath = isInPages ? '../sw.js' : './sw.js';

    navigator.serviceWorker.getRegistration(swPath).then(existingReg => {
      const regPromise = existingReg
        ? Promise.resolve(existingReg)
        : navigator.serviceWorker.register(swPath);

      return regPromise.then(registration => {
        console.log('✅ [UpdateNotifier] auto-update mode');

        this.activate(registration);

        // Check subito + ogni 2 minuti (il check su navigazione lo fa già il browser)
        registration.update().catch(() => {});
        setInterval(() => { registration.update().catch(() => {}); }, 2 * 60 * 1000);
        this.selfHeal(registration, isInPages);

        // v10.3 iOS: le PWA standalone RIPRENDONO dalla memoria (niente load,
        // timer sospesi in background) — il momento giusto per il check è il
        // ritorno in foreground.
        document.addEventListener('visibilitychange', () => {
          if (!document.hidden) {
            registration.update().catch(() => {});
            this.selfHeal(registration, isInPages);
          }
        });

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed') this.activate(registration);
          });
        });

        // Il nuovo SW ha preso il controllo → un solo reload silenzioso,
        // mai sulle pagine di sessione.
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (this.reloading) return;
          if (this.isSessionPage()) {
            console.log('[UpdateNotifier] nuovo SW attivo — reload rinviato (sessione)');
            return;
          }
          const last = parseInt(sessionStorage.getItem('viltrum_auto_reload_ts') || '0', 10);
          if (Date.now() - last < 10000) return; // anti-loop
          sessionStorage.setItem('viltrum_auto_reload_ts', String(Date.now()));
          // Stessa regola del self-heal: mai ricaricare sotto gli occhi
          // dell'utente. Se il SW cambia mentre la dashboard è già a schermo,
          // il reload aspetta il background.
          this.reloadWhenUnwatched('nuovo SW attivo');
        });
      });
    }).catch(err => {
      console.warn('[UpdateNotifier] SW error:', err);
    });
  }
}

new UpdateNotifier();
