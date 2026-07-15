# Friel Running Pace Zones Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show Friel-based running pace targets (min/km) during endurance workouts — phase-card target band, live GPS pace colored by on/off target, and a voice cue — anchored on a user-entered threshold pace.

**Architecture:** One pure, unit-tested math module (`js/pace-zones.js`) computes the 5 contiguous pace bands from a threshold-pace anchor. The anchor is stored with the same Supabase-`user_metadata` + localStorage pattern as the existing massimali. Three read-only consumers in `pages/endurance.html` render the bands. Feature is purely additive: no anchor → app behaves exactly as today.

**Tech Stack:** Vanilla ES modules (no bundler), browser `<script type="module">`, Supabase auth `user_metadata`, `node --test` for the pure module.

**Spec:** `docs/superpowers/specs/2026-07-15-friel-running-pace-zones-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `package.json` | **New.** Minimal `{"type":"module"}` so Node runs the ESM `.js` under test. Browser + deploy.ps1 ignore it. |
| `js/pace-zones.js` | **New.** Pure math: bands from threshold, classify a pace, format/parse `mm:ss`. No DOM/storage/async. |
| `tests/pace-zones.test.mjs` | **New.** `node --test` unit tests for `pace-zones.js`. |
| `js/profile-manager.js` | Add `getThresholdPace` / `saveThresholdPace` (copy massimali pattern). |
| `pages/profile.html` | New threshold-pace input card under massimali + save handler. |
| `pages/endurance.html` | Load bands; phase-card target; live GPS pace + color; voice-cue pace phrase. |

---

## Task 1: Pure pace-zone math module

**Files:**
- Create: `package.json`
- Create: `js/pace-zones.js`
- Test: `tests/pace-zones.test.mjs`

- [ ] **Step 1: Create the Node ESM marker**

Create `package.json` at the V8 repo root (`viltrum-fitness-V8/package.json`):

```json
{
  "name": "viltrum-fitness-v8",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test"
  }
}
```

- [ ] **Step 2: Write the failing test**

Create `tests/pace-zones.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  paceZoneBands,
  classifyPace,
  formatPace,
  parsePace,
} from '../js/pace-zones.js';

// --- paceZoneBands ---

test('null / invalid threshold yields null bands', () => {
  assert.equal(paceZoneBands(null), null);
  assert.equal(paceZoneBands(0), null);
  assert.equal(paceZoneBands(-5), null);
  assert.equal(paceZoneBands('x'), null);
});

test('bands for FTPa 5:00/km (300s) match Friel worked example', () => {
  const b = paceZoneBands(300);
  assert.equal(b.length, 5);
  const byZone = Object.fromEntries(b.map((x) => [x.zone, x]));
  // Z1: slower than 6:27 (387s), no slow bound
  assert.equal(byZone[1].minSec, 387);
  assert.equal(byZone[1].maxSec, Infinity);
  // Z2: 5:42 (342) - 6:27 (387)
  assert.equal(byZone[2].minSec, 342);
  assert.equal(byZone[2].maxSec, 387);
  // Z3: 5:18 (318) - 5:42 (342)
  assert.equal(byZone[3].minSec, 318);
  assert.equal(byZone[3].maxSec, 342);
  // Z4: 5:00 (300) - 5:18 (318)
  assert.equal(byZone[4].minSec, 300);
  assert.equal(byZone[4].maxSec, 318);
  // Z5: faster than 5:00, no fast bound
  assert.equal(byZone[5].minSec, 0);
  assert.equal(byZone[5].maxSec, 300);
});

test('bands are contiguous — no gap, no overlap', () => {
  const b = paceZoneBands(300);
  const byZone = Object.fromEntries(b.map((x) => [x.zone, x]));
  // each zone's slow edge equals the next slower zone's fast edge
  assert.equal(byZone[5].maxSec, byZone[4].minSec);
  assert.equal(byZone[4].maxSec, byZone[3].minSec);
  assert.equal(byZone[3].maxSec, byZone[2].minSec);
  assert.equal(byZone[2].maxSec, byZone[1].minSec);
});

// --- classifyPace ---

test('classifyPace boundary rules (T=300)', () => {
  const b = paceZoneBands(300);
  assert.equal(classifyPace(250, b), 5); // faster than threshold
  assert.equal(classifyPace(300, b), 5); // exactly 100% -> Z5 (fast edge wins)
  assert.equal(classifyPace(310, b), 4);
  assert.equal(classifyPace(330, b), 3);
  assert.equal(classifyPace(360, b), 2);
  assert.equal(classifyPace(387, b), 2); // exactly 129% -> Z2
  assert.equal(classifyPace(500, b), 1); // very slow
});

test('classifyPace null-safe', () => {
  assert.equal(classifyPace(300, null), null);
  assert.equal(classifyPace(null, paceZoneBands(300)), null);
  assert.equal(classifyPace('x', paceZoneBands(300)), null);
});

// --- formatPace / parsePace ---

test('formatPace seconds to m:ss', () => {
  assert.equal(formatPace(300), '5:00');
  assert.equal(formatPace(387), '6:27');
  assert.equal(formatPace(65), '1:05');
});

test('parsePace m:ss to seconds', () => {
  assert.equal(parsePace('5:00'), 300);
  assert.equal(parsePace('6:27'), 387);
  assert.equal(parsePace('1:05'), 65);
});

test('parsePace rejects malformed input', () => {
  assert.equal(parsePace(''), null);
  assert.equal(parsePace('5'), null);
  assert.equal(parsePace('5:60'), null); // seconds must be < 60
  assert.equal(parsePace('abc'), null);
  assert.equal(parsePace('5:5'), null); // seconds must be two digits
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd viltrum-fitness-V8 && node --test`
Expected: FAIL — `Cannot find module '.../js/pace-zones.js'`.

- [ ] **Step 4: Write the module**

Create `js/pace-zones.js`:

```javascript
// ═══════════════════════════════════════════════════════════════════════════
// VILTRUM FITNESS - PACE ZONES (Joe Friel running pace zones)
// Pure math. No DOM, no storage, no async. Unit-tested via `node --test`.
//
// Anchor: Functional Threshold Pace (FTPa) in seconds per km.
// Friel running pace bands (% of FTPa; bigger % = slower pace) merged to 5 zones
// and snapped contiguous so every pace classifies into exactly one zone:
//   Z1 slower than 129%   Z2 114-129%   Z3 106-114%   Z4 100-106%   Z5 faster than 100%
// ═══════════════════════════════════════════════════════════════════════════

// Fast edge (smaller % = faster) of each zone, as a multiplier of threshold seconds.
// Ordered slow -> fast. Z1 has no slow bound; Z5 has no fast bound.
const ZONE_FAST_EDGE = {
  1: 1.29, // Z1 begins slower than 1.29x threshold
  2: 1.14,
  3: 1.06,
  4: 1.00,
  5: 0.0, // Z5 = anything faster than threshold
};

/**
 * Compute the 5 contiguous pace bands from a threshold pace.
 * @param {number} thresholdSec - FTPa in seconds per km
 * @returns {Array<{zone:number,minSec:number,maxSec:number}>|null}
 *          minSec = fastest edge (smaller seconds), maxSec = slowest edge.
 *          null when thresholdSec is not a positive finite number.
 */
export function paceZoneBands(thresholdSec) {
  const t = Number(thresholdSec);
  if (!Number.isFinite(t) || t <= 0) return null;

  const edge = (z) => Math.round(ZONE_FAST_EDGE[z] * t);

  return [
    { zone: 1, minSec: edge(1), maxSec: Infinity },
    { zone: 2, minSec: edge(2), maxSec: edge(1) },
    { zone: 3, minSec: edge(3), maxSec: edge(2) },
    { zone: 4, minSec: edge(4), maxSec: edge(3) },
    { zone: 5, minSec: 0, maxSec: edge(4) },
  ];
}

/**
 * Which zone a pace falls in. Fast edge wins on a boundary
 * (e.g. exactly threshold -> Z5), matching the spec.
 * @param {number} currentSec - pace in seconds per km
 * @param {Array|null} bands - output of paceZoneBands
 * @returns {number|null} zone 1..5, or null on bad input
 */
export function classifyPace(currentSec, bands) {
  const s = Number(currentSec);
  if (!Array.isArray(bands) || !Number.isFinite(s)) return null;
  // Check fastest zone first so a boundary value lands in the faster zone.
  for (let zone = 5; zone >= 1; zone--) {
    const band = bands.find((b) => b.zone === zone);
    if (s <= band.maxSec) return zone;
  }
  return 1;
}

/**
 * @param {number} sec - seconds per km
 * @returns {string} "m:ss"
 */
export function formatPace(sec) {
  const s = Math.round(Number(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, '0')}`;
}

/**
 * @param {string} str - "m:ss" or "mm:ss"
 * @returns {number|null} seconds, or null if malformed / seconds >= 60
 */
export function parsePace(str) {
  if (typeof str !== 'string') return null;
  const m = str.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const seconds = parseInt(m[2], 10);
  if (seconds >= 60) return null;
  return parseInt(m[1], 10) * 60 + seconds;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd viltrum-fitness-V8 && node --test`
Expected: PASS — all tests, `# pass 9` (or all green).

- [ ] **Step 6: Commit**

```bash
git add package.json js/pace-zones.js tests/pace-zones.test.mjs
git commit -m "feat: pace-zones pure module (Friel running pace bands)"
```

---

## Task 2: Threshold-pace storage in profile-manager

**Files:**
- Modify: `js/profile-manager.js` (add after `saveUserMaxes`, ~line 353)

Note: this talks to Supabase and localStorage, so it is verified by manual browser
check, not `node --test`. Copy the exact shape of `getUserMaxes` / `saveUserMaxes`.

- [ ] **Step 1: Add the cache key + two functions**

In `js/profile-manager.js`, after the `saveUserMaxes` function (right before the
`calculateWeightFromMax` doc comment at ~line 355), insert:

```javascript
// ═══════════════════════════════════════════════════════════════════════════
// THRESHOLD PACE (Friel running pace zones anchor)
// ═══════════════════════════════════════════════════════════════════════════

const THRESHOLD_PACE_CACHE_KEY = 'viltrum_threshold_pace';

/**
 * Get user threshold pace (FTPa) from cache or Supabase.
 * @returns {Promise<number|null>} seconds per km, or null if unset
 */
export async function getThresholdPace() {
  try {
    const cached = localStorage.getItem(THRESHOLD_PACE_CACHE_KEY);
    if (cached !== null) {
      const n = parseInt(cached, 10);
      return Number.isFinite(n) && n > 0 ? n : null;
    }

    if (supabase) {
      const { data: { user } } = await supabase.auth.getUser();
      const sec = user?.user_metadata?.thresholdPace;
      if (Number.isFinite(sec) && sec > 0) {
        localStorage.setItem(THRESHOLD_PACE_CACHE_KEY, String(sec));
        console.log('[Profile Manager] Threshold pace loaded from Supabase');
        return sec;
      }
    }

    return null;
  } catch (error) {
    console.error('[Profile Manager] Error getting threshold pace:', error);
    return null;
  }
}

/**
 * Save user threshold pace to localStorage + Supabase.
 * @param {number} seconds - FTPa in seconds per km
 * @returns {Promise<{success:boolean, warning?:string, error?:string}>}
 */
export async function saveThresholdPace(seconds) {
  try {
    const sec = parseInt(seconds, 10);
    if (!Number.isFinite(sec) || sec <= 0) {
      return { success: false, error: 'Valore non valido' };
    }

    localStorage.setItem(THRESHOLD_PACE_CACHE_KEY, String(sec));
    console.log('[Profile Manager] Threshold pace saved to localStorage:', sec);

    if (supabase) {
      try {
        const { error } = await supabase.auth.updateUser({
          data: { thresholdPace: sec },
        });
        if (error) {
          console.error('[Profile Manager] Supabase error saving threshold pace:', error);
          return { success: true, warning: 'Salvato localmente, sync cloud fallito' };
        }
        console.log('[Profile Manager] Threshold pace synced to Supabase');
        return { success: true };
      } catch (supabaseError) {
        console.error('[Profile Manager] Supabase save failed:', supabaseError);
        return { success: true, warning: 'Salvato localmente' };
      }
    }

    return { success: true };
  } catch (error) {
    console.error('[Profile Manager] Error saving threshold pace:', error);
    return { success: false, error: 'Errore durante il salvataggio' };
  }
}
```

- [ ] **Step 2: Verify the file still parses as a module**

Run: `cd viltrum-fitness-V8 && node --check js/profile-manager.js`
Expected: no output, exit 0 (syntax OK). If it errors on `import`/`export`, that is
expected only when run without the `package.json` type marker — the marker from Task 1
makes `node --check` pass.

- [ ] **Step 3: Commit**

```bash
git add js/profile-manager.js
git commit -m "feat: getThresholdPace/saveThresholdPace in profile-manager"
```

---

## Task 3: Threshold-pace input card in profile

**Files:**
- Modify: `pages/profile.html` (markup after the `maxes-form` card; import + handler in the module script)

- [ ] **Step 1: Add the import**

In `pages/profile.html`, extend the existing profile-manager import (~line 245) to
add the two new functions and the pace helpers:

```html
    import { getUserProfile, updateUsername, updateEmail, getSubscriptionMessage, formatExpiryDate, getUserMaxes, saveUserMaxes, AVAILABLE_MAXES, getThresholdPace, saveThresholdPace } from '../js/profile-manager.js';
    import { formatPace, parsePace } from '../js/pace-zones.js';
```

- [ ] **Step 2: Add the card markup**

Immediately after the closing `</form>`/card wrapper of `maxes-form` (the massimali
card, whose helper text is `Usati per calcolare i pesi nei workout`, ~after line 227),
insert a sibling card. Match the surrounding card/form class names already used on the
page:

```html
    <div class="settings-section">
      <h2 class="section-title">Passo Soglia</h2>
      <div class="success-message" id="threshold-success"></div>
      <div class="error-message" id="threshold-error"></div>
      <form id="threshold-form">
        <div class="form-group">
          <label for="threshold-pace">Passo Soglia (test 30 min)</label>
          <input type="text" id="threshold-pace" inputmode="numeric"
                 placeholder="mm:ss" pattern="\d{1,2}:\d{2}">
        </div>
        <p class="maxes-info">Ritmo medio su 30 min a tutto. Usato per le zone di corsa (min/km).</p>
        <button type="submit" class="save-btn">Salva</button>
      </form>
    </div>
```

Note: if the massimali card uses different wrapper/button class names than
`settings-section` / `section-title` / `save-btn`, copy whatever the massimali card
actually uses so styling matches. Check the massimali card markup first.

- [ ] **Step 3: Load current value on page init**

Find the block that populates the maxes inputs (~line 367, `const maxes = await getUserMaxes();`).
Immediately after that loop finishes, add:

```javascript
      // Load threshold pace
      const tSec = await getThresholdPace();
      if (tSec) {
        document.getElementById('threshold-pace').value = formatPace(tSec);
      }
```

- [ ] **Step 4: Add the save handler**

After the existing `maxes-form` submit listener (the block ending around line 391's
`saveUserMaxes(maxes)` handler), add:

```javascript
    document.getElementById('threshold-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const successMsg = document.getElementById('threshold-success');
      const errorMsg = document.getElementById('threshold-error');
      successMsg.textContent = '';
      errorMsg.textContent = '';

      const raw = document.getElementById('threshold-pace').value.trim();
      const sec = parsePace(raw);
      if (sec === null || sec < 120 || sec > 720) {
        errorMsg.textContent = 'Inserisci un passo valido tra 2:00 e 12:00 (mm:ss).';
        return;
      }

      const result = await saveThresholdPace(sec);
      if (result.success) {
        successMsg.textContent = result.warning || 'Passo soglia salvato!';
      } else {
        errorMsg.textContent = result.error || 'Errore durante il salvataggio.';
      }
    });
```

- [ ] **Step 5: Manual verification**

Serve the app locally (or deploy to staging) and:
1. Open Profile. The "Passo Soglia" card appears under massimali.
2. Enter `5:00`, Save → success message shows.
3. Reload the page → field repopulates with `5:00`.
4. Enter `1:30` → error "tra 2:00 e 12:00". Enter `abc` → same error, nothing saved.
5. In devtools: `localStorage.getItem('viltrum_threshold_pace')` returns `"300"`.

Expected: all 5 behaviors as described.

- [ ] **Step 6: Commit**

```bash
git add pages/profile.html
git commit -m "feat: threshold-pace input card on profile"
```

---

## Task 4: Phase-card pace target on endurance workout

**Files:**
- Modify: `pages/endurance.html` (import; module-level `paceBands`; load on init; render in `renderCurrentPhase` ~L1164)

- [ ] **Step 1: Import the pace module + threshold getter**

In the `pages/endurance.html` module script, alongside the existing
`import DataPreloader ...` / `import { GOOGLE_SCRIPT_URL } ...` (~line 437), add:

```javascript
    import { paceZoneBands, classifyPace, formatPace } from '../js/pace-zones.js';
    import { getThresholdPace } from '../js/profile-manager.js';
```

- [ ] **Step 2: Add a module-level bands holder + a band-label helper**

Near the other top-level `let`/`const` state in the script, add:

```javascript
    let paceBands = null; // Array from paceZoneBands, or null if no threshold set

    // Human label for a zone's pace band, e.g. "5:42 – 6:27 /km".
    // Open-ended zones (Z1 slow, Z5 fast) render one-sided.
    function paceBandLabel(zone) {
      if (!paceBands) return '';
      const b = paceBands.find((x) => x.zone === zone);
      if (!b) return '';
      if (b.maxSec === Infinity) return `più lento di ${formatPace(b.minSec)} /km`;
      if (b.minSec === 0) return `più veloce di ${formatPace(b.maxSec)} /km`;
      return `${formatPace(b.minSec)} – ${formatPace(b.maxSec)} /km`;
    }
```

- [ ] **Step 3: Load bands once at workout init**

Find where the workout data is first loaded/initialized (the async init that runs on
page load — near the DataPreloader usage). Add, inside that async init before the first
`renderCurrentPhase` call:

```javascript
      // Load Friel pace bands (null if user has no threshold pace set)
      const thresholdSec = await getThresholdPace();
      paceBands = paceZoneBands(thresholdSec);
```

If there is no single obvious init function, add it at the top of the `startWorkout`
(or equivalent) flow that runs before the first phase renders. The only requirement:
`paceBands` is set before `renderCurrentPhase` first runs.

- [ ] **Step 4: Add the target DOM node**

In the phase-card markup, directly under the element with id `phase-target`
(the "target" text, ~near line 372-402 phase-card block), add a sibling:

```html
          <div id="phase-pace-target" class="phase-pace-target" style="display:none;"></div>
```

Add minimal styling in the page `<style>` (near the `.zone-badge` rules):

```css
    .phase-pace-target { font-size: 15px; opacity: 0.85; margin-top: 4px; color: var(--zone-color, #FFF); }
```

- [ ] **Step 5: Render the band in renderCurrentPhase**

In `renderCurrentPhase` (~line 1164), after the line that sets `phase-target`
(`document.getElementById('phase-target').textContent = targetText;`), add:

```javascript
      const paceTargetEl = document.getElementById('phase-pace-target');
      const label = paceBandLabel(phase.zone);
      if (label) {
        paceTargetEl.textContent = `🎯 ${label}`;
        paceTargetEl.style.display = 'block';
      } else {
        paceTargetEl.style.display = 'none';
      }
```

- [ ] **Step 6: Manual verification**

1. With threshold `5:00` set (from Task 3), open an endurance workout.
2. On a Z2 phase, the card shows `🎯 5:42 – 6:27 /km`.
3. On a Z1 phase → `🎯 più lento di 6:27 /km`; Z5 → `🎯 più veloce di 5:00 /km`.
4. Clear threshold (`localStorage.removeItem('viltrum_threshold_pace')`, and clear in
   Supabase or use a fresh account), reopen workout → no pace target shown, workout
   otherwise unchanged.

Expected: bands shown only when threshold set; correct band per zone.

- [ ] **Step 7: Commit**

```bash
git add pages/endurance.html
git commit -m "feat: phase-card pace target on endurance workout"
```

---

## Task 5: Live GPS pace vs target (smoothed + colored)

**Files:**
- Modify: `pages/endurance.html` (smoothing state; window update in `watchPosition` handler ~L1325; live readout DOM + render)

- [ ] **Step 1: Add smoothing state**

Near the other GPS/tracking state variables in the script, add:

```javascript
    // Rolling window for smoothed live pace. Each entry: {t: ms, lat, lon}.
    let paceWindow = [];
    const PACE_WINDOW_MS = 18000;   // ~18s of history
    const PACE_MIN_MS = 8000;       // need >=8s before showing a pace
    const GPS_ACCURACY_MAX_M = 25;  // discard fuzzier fixes
```

- [ ] **Step 2: Add a haversine helper (if not already present)**

Search the file for an existing distance function used by the GPS handler
(the code that computes `totalDistance` from coords, ~line 1325-1372). If one already
exists, reuse it and skip this step. Otherwise add:

```javascript
    function metersBetween(lat1, lon1, lat2, lon2) {
      const R = 6371000;
      const toRad = (d) => (d * Math.PI) / 180;
      const dLat = toRad(lat2 - lat1);
      const dLon = toRad(lon2 - lon1);
      const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
      return 2 * R * Math.asin(Math.sqrt(a));
    }
```

- [ ] **Step 3: Add the live-pace readout DOM node**

In the phase-card markup, near the GPS distance readout (`gps-distance`, ~line 356) or
under `phase-pace-target`, add:

```html
          <div id="live-pace" class="live-pace" style="display:none;">
            <span id="live-pace-value">--:--</span> <span class="live-pace-unit">/km</span>
          </div>
```

Styling in `<style>`:

```css
    .live-pace { font-size: 34px; font-weight: 700; margin-top: 8px; transition: color 0.3s; }
    .live-pace-unit { font-size: 16px; font-weight: 400; opacity: 0.7; }
    .live-pace.on-target { color: #27ae60; }
    .live-pace.off-target { color: #e67e22; }
```

- [ ] **Step 4: Update the window + render inside the position handler**

Inside the `watchPosition` success callback, after the existing block that reads
`const { latitude, longitude, accuracy } = position.coords;` and updates
`totalDistance` (~line 1325-1372), add:

```javascript
        updateLivePace(latitude, longitude, accuracy);
```

Then add the function itself (top-level in the script):

```javascript
    function updateLivePace(lat, lon, accuracy) {
      const el = document.getElementById('live-pace');
      const valEl = document.getElementById('live-pace-value');

      // No bands -> feature off. Keep readout hidden.
      if (!paceBands) { el.style.display = 'none'; return; }
      el.style.display = 'block';

      const now = Date.now();
      if (typeof accuracy !== 'number' || accuracy <= GPS_ACCURACY_MAX_M) {
        paceWindow.push({ t: now, lat, lon });
      }
      // Drop stale fixes outside the window.
      paceWindow = paceWindow.filter((p) => now - p.t <= PACE_WINDOW_MS);

      const span = paceWindow.length >= 2
        ? now - paceWindow[0].t
        : 0;
      if (span < PACE_MIN_MS) {
        valEl.textContent = '--:--';
        el.classList.remove('on-target', 'off-target');
        return;
      }

      // Distance travelled across the window.
      let meters = 0;
      for (let i = 1; i < paceWindow.length; i++) {
        meters += metersBetween(
          paceWindow[i - 1].lat, paceWindow[i - 1].lon,
          paceWindow[i].lat, paceWindow[i].lon
        );
      }
      if (meters < 1) { valEl.textContent = '--:--'; return; }

      // Pace = seconds per km.
      const secPerKm = (span / 1000) / (meters / 1000);
      valEl.textContent = formatPace(secPerKm);

      // Color vs the current phase's target zone.
      const phase = expandedPhases[currentPhaseIndex];
      const inZone = phase && classifyPace(secPerKm, paceBands) === phase.zone;
      el.classList.toggle('on-target', inZone);
      el.classList.toggle('off-target', !inZone);
    }
```

Note: `expandedPhases` and `currentPhaseIndex` are the existing phase-state variables
used by `renderCurrentPhase`. Confirm those exact names in the file and match them.

- [ ] **Step 5: Reset the window on phase change**

In `renderCurrentPhase` (~line 1164), where phase state resets (near
`phaseDistance = 0;`), add:

```javascript
      paceWindow = [];
      const lp = document.getElementById('live-pace');
      if (lp) { document.getElementById('live-pace-value').textContent = '--:--'; lp.classList.remove('on-target','off-target'); }
```

- [ ] **Step 6: Manual verification (field test — requires real movement)**

1. Threshold set. Start an endurance workout outdoors (or GPS-simulated moving fixes).
2. Live pace shows `--:--` for the first ~8s, then a smoothed `mm:ss /km`.
3. When actual pace is within the current phase's zone band → green; outside → amber.
4. Deny GPS permission → live pace stays hidden/`--:--`, target band + workout still work.
5. No threshold set → live pace never appears.

Expected: smoothed pace after warm-up window; correct color; graceful with no GPS/threshold.

- [ ] **Step 7: Commit**

```bash
git add pages/endurance.html
git commit -m "feat: smoothed live GPS pace vs target zone coloring"
```

---

## Task 6: Pace phrase in the phase-start voice cue

**Files:**
- Modify: `pages/endurance.html` (`announcePhaseStart`, TTS/synth path ~L800)

- [ ] **Step 1: Append pace to the synth/voice text only**

In `announcePhaseStart` (~line 800), locate the `else` branch that builds the dynamic
TTS string (`let text = \`Zona ${phase.zone}\`;` ... `await speak(text);`). That is the
`mode === 'voice'` / synth path. Just before `await speak(text);`, add:

```javascript
        // Friel pace band (voice/synth path only — ElevenLabs has no pace-number clips)
        if (paceBands && !short) {
          const b = paceBands.find((x) => x.zone === phase.zone);
          if (b) {
            if (b.maxSec === Infinity) {
              text += `, passo più lento di ${speakPace(b.minSec)}`;
            } else if (b.minSec === 0) {
              text += `, passo più veloce di ${speakPace(b.maxSec)}`;
            } else {
              text += `, passo ${speakPace(b.minSec)} a ${speakPace(b.maxSec)}`;
            }
          }
        }
```

- [ ] **Step 2: Add a spoken-pace helper**

Italian TTS reads "5:00" poorly. Convert to words. Add top-level:

```javascript
    // "5:42" -> "cinque e quarantadue" style is overkill; keep it simple and clear.
    function speakPace(sec) {
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      if (s === 0) return `${m} minuti al chilometro`;
      return `${m} minuti e ${s} al chilometro`;
    }
```

- [ ] **Step 3: Confirm the ElevenLabs path is untouched**

Verify the `if (mode === 'eleven')` block (~line 782-793, the `sequence` array of
pre-recorded keys) has NOT been modified. It must omit pace by design. Add a one-line
comment there for the next reader:

```javascript
        // NOTE: pace band intentionally omitted here — no pre-recorded pace-number
        // clips exist. Pace is spoken only in the synth/voice path below.
```

- [ ] **Step 4: Manual verification**

1. Threshold set. Set announcement mode to voice/synth (not ElevenLabs, not bip/none).
2. Advance to a Z2 phase → cue says e.g. "Zona 2, 3 chilometri, passo 5 minuti e 42 a 6 minuti e 27".
3. Switch to ElevenLabs mode → cue plays as before, no pace (no error/gap).
4. Clear threshold → voice cue identical to today (no pace phrase).

Expected: pace spoken only in synth mode with threshold set; ElevenLabs + no-threshold unchanged.

- [ ] **Step 5: Commit**

```bash
git add pages/endurance.html
git commit -m "feat: speak pace band in phase-start voice cue (synth path)"
```

---

## Task 7: Deploy

- [ ] **Step 1: Full pure-module test run**

Run: `cd viltrum-fitness-V8 && node --test`
Expected: all pace-zones tests PASS.

- [ ] **Step 2: Syntax check the touched modules**

Run: `cd viltrum-fitness-V8 && node --check js/pace-zones.js && node --check js/profile-manager.js`
Expected: exit 0, no output.

- [ ] **Step 3: Deploy via the mandatory script**

Per project discipline, NEVER a bare git commit for a PWA change — it leaves users on
stale cache with no update banner. Use:

Run: `cd viltrum-fitness-V8 && .\deploy.ps1 -Message "Friel running pace zones"`
Expected: sw.js version bumped + BUILD_HASH injected, committed, pushed.

- [ ] **Step 4: Post-deploy smoke check**

Wait ~2-3 min for the deploy, then on a real device:
1. Update banner appears (confirms sw.js bumped).
2. Profile → set threshold pace → persists across reload.
3. Endurance workout → phase pace target visible; voice cue speaks pace (synth mode).

---

## Self-Review

**Spec coverage:**
- Data anchor (Supabase user_metadata + localStorage) → Task 2 ✓
- Profile mm:ss input + 2:00–12:00 validation → Task 3 ✓
- Pure zone math + contiguous boundary fix + classify/format/parse → Task 1 ✓
- Surface 1 phase-card target → Task 4 ✓
- Surface 2 live smoothed GPS pace + color → Task 5 ✓
- Surface 3 voice cue synth-only, ElevenLabs untouched → Task 6 ✓
- No-threshold / GPS-denied graceful degradation → Tasks 4-6 verification steps ✓
- Deploy via deploy.ps1 → Task 7 ✓

**Type consistency:** `paceZoneBands`, `classifyPace`, `formatPace`, `parsePace`,
`getThresholdPace`, `saveThresholdPace`, `paceBands`, `paceBandLabel`, `paceWindow`,
`updateLivePace`, `speakPace` — names used identically across all tasks. Band shape
`{zone, minSec, maxSec}` consistent. Threshold stored as integer seconds everywhere.

**Placeholders:** none — all code steps show full code; verification steps list exact
expected behavior.

**Codebase-fit caveats flagged for the executor:** class names on the profile card
(Task 3 Step 2) and the exact phase-state variable names / init function
(Task 4 Step 3, Task 5 Step 4) must be confirmed against the actual file, since those
were read at a summary level — the plan says so at each such step.
