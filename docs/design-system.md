# Viltrum Design System (UI-SPEC)

Fonte di verità del look: l'app **MoreMuscle** di Giuseppe (github.com/bepsmarzano/MoreMuscle, `src/shared/ui.jsx`), estratta 1:1 il 2026-08-18. I token vivono in `css/design-system.css` (UNICO definitore). Questo documento è il contratto che ogni wave del restyle implementa.

## Token (condensato — valori esatti in css/design-system.css)

| Gruppo | Valori |
|---|---|
| Superfici | canvas `#0d0d0d` · sunken `#0f0f0f` · blocco `#141414` · **card `#151515`** · modale `#161616` · controllo `#1a1a1a` · void `#000` |
| Bordi (SEMPRE 1px) | hair `#1f1f1f` · inner `#222` · **card `#232323`** · modale `#2a2a2a` · campo `#2e2e2e` · interattivo `#333` · dashed `#3a3a3a` |
| Testo | `#fff` max · `#f2f2f2` body · `#ddd` · `#ccc` · `#bbb` · `#999` label · `#888` muted · `#777` faint |
| Accent | `#C1FF72` (hover `#AEEB5C`) — **foreground su accent SEMPRE `#0d0d0d`, mai bianco** |
| Riposo (blu) | testo `#7fb0ff` · ring `#3b82f6` · sub `#cdddf5` · pill `#12233b`/`#223344` · stage `radial #1a2c4a→#05070d` |
| Semantici | danger `#f87171` · success `#4ade80` · warn `#f0b155`/`#3b2a12` · ok `#5fd88f`/`#12331f` |
| Zone corsa (Viltrum) | Z1 `#3498db` Z2 `#27ae60` Z3 `#f1c40f` Z4 `#e67e22` Z5 `#e74c3c` — semantiche, mai sostituire con accent; presentate con bordo 1px + sfondo alpha |
| Raggi | input 8 · bottone 9-11 · riga 10 · card 12-13 · modale 16 · hero 18 · pill 20 · cerchi 50% |
| Profondità | **niente box-shadow** (unica eccezione: disco timer player `0 8px 30px rgba(0,0,0,.5)`) · niente glow bianchi · blur(4/6px) solo su overlay player |
| Tipografia | Staatliches (delta Viltrum, scelta del proprietario) · pesi 600 label / 700 titoli / 800 eyebrow · letter-spacing solo su maiuscole eyebrow (1–3px) · text-shadow solo sopra video |
| z-scale | header 10 · overlay player 3 · modale 50 · player 200 |

## Ricette componenti (classi `ds-*` in design-system.css)

- **Primario** `.ds-btn-primary` — pieno accent, testo scuro, radius 11, peso 700. MAI bianco pieno, MAI grigio `#4D4D4D`, MAI gradienti.
- **Ghost** `.ds-btn-ghost` — trasparente, bordo 1px `#333`, testo `#bbb`; hover bordo accent.
- **Icona** `.ds-btn-icon` — 36×36, `#1a1a1a`, bordo `#2a2a2a`, radius 8.
- **Card** `.ds-card` — `#151515`, bordo 1px `#232323`, radius 13, padding 16/18.
- **Modale** `.ds-modal(-backdrop)` — backdrop `rgba(0,0,0,.7)`; pannello `#161616`, bordo `#2a2a2a`, radius 16, max-width 420, max-height 88vh.
- **Campo** `.ds-field` + `.ds-field-label` — sfondo `#0d0d0d`, bordo `#2e2e2e`, focus bordo accent.
- **Eyebrow blocco** `.ds-block-label` — 12px/800, tracking 1px, accent, maiuscolo.
- **Pill** `.ds-pill` (+ `--rest/--warn/--ok`).
- **Progresso** `.ds-progress-track/-fill` — track `#333`, fill accent.
- **Focus ring** (delta Viltrum, fix a11y): `:focus-visible` outline 2px accent, offset 2px, su tutti i componenti interattivi.

## Regole operative

1. **Conflitti**: le skill di design (frontend-design, web-design-guidelines, redesign-existing-projects) guidano il mestiere (spaziatura, a11y, gerarchia); **questo token sheet decide il look**.
2. Ogni wave: la pulizia dei selettori (collasso definizioni duplicate in main.css, strip `!important`, cancellazione regole inline concorrenti) viaggia NELLO STESSO commit del restyle di quel selettore.
3. Cache: ogni modifica a un CSS bumpa `?v=` in TUTTE le pagine che lo linkano + in `sw.js` urlsToCache (Cache API è query-sensitive).
4. MAI toccare gli attributi `style="display:…"` gestiti da JS (11 selettori `[style*=…]` in main.css + workout.js li leggono).
5. `--footer-total` / `--main-app-visible-height` sono letti da JS (workout.js, global-preload-bar.js): mai eliminarli, definirli una volta sola.
6. Il blocco "EXPERT UI HIERARCHY SYSTEM" (main.css) è la spec del VECCHIO linguaggio: si cancella solo L2493–2797, la coda (footer/main-app/token) è load-bearing.
7. Rosso errori unificato: `#f87171` (via `--ds-danger`); i 4 rossi legacy (`#f44336/#F44336/#ff6b6b/#e74c3c`) spariscono wave per wave.

## Stato wave

- [x] Phase 0 — token + cache-busting (v8.2.58, zero visual)
- [x] Wave 1 — dashboard polish, banner unificati, preload surfaces, residui player (v8.2.59)
- [x] Wave 2 — plan-view, completion, settings popup, profile, questionario, nutrition (v8.2.60)
- [ ] Wave 3 — index (login/auth/selector/sheet), workout setup, endurance, delete hierarchy L2493–2797
- [ ] Final — gsd-ui-review audit + web-perf + pagina Artifact per Giuseppe

Nota cache: nutrition.css v8.2.62 è cambiato senza bump ?v= (solo fix minori) — bumpare al prossimo deploy che tocca CSS.
