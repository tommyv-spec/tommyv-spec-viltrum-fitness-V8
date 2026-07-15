# Friel Running Pace Zones — Design Spec

**Date:** 2026-07-15
**App:** Viltrum Fitness V8
**Status:** Approved design, ready for implementation plan

## Goal

Show Friel-based **running pace targets (min/km)** alongside the existing numeric
training zones during endurance workouts. Runner sees the target pace band for the
current zone, sees their live GPS pace colored by whether they are on target, and
hears the pace band in the phase-start voice cue.

Feature is **purely additive**: if the runner has not set a threshold pace, the app
behaves exactly as it does today.

## Decisions locked during brainstorming

| Decision | Choice |
|---|---|
| Pace anchor source | Manual — user types Threshold Pace |
| Anchor storage | Same infra as massimali (Supabase `user_metadata` + localStorage cache) |
| Zone model | Keep existing **5 zones**; merge Friel 5a/5b/5c into Z5 |
| Surfaces | (1) phase-card target, (2) live GPS pace vs target, (3) voice cue |
| NOT in scope | Profile reference table, HR/LTHR zones, 7-zone split, coach-side entry |
| Zone table source | Friel's own running pace table (verified, see below) |

## Zone table (verified)

Source: Joe Friel's Quick Guide to Setting Zones (TrainingPeaks). Running **pace**
zones as % of Functional Threshold Pace (FTPa). Note 129% = *slower* than threshold
(pace, not power — bigger % = slower).

Friel's published running pace bands:

```
Zone 1   slower than 129% of FTPa
Zone 2   114% – 129%
Zone 3   106% – 113%
Zone 4    99% – 105%
Zone 5a   97% – 100%
Zone 5b   90% –  96%
Zone 5c  faster than 90%
```

**Problem:** the published bands have gaps (113→114, 105→106) and an overlap
(Z4 99–105 vs 5a 97–100). Fine on paper, fatal for live in/out-of-zone coloring —
some paces would fall in no zone. We snap boundaries into a **contiguous ladder** and
merge 5a/5b/5c into Z5 (all "at or faster than threshold"):

| App zone | % of FTPa (contiguous) | pace = FTPa × % (slower = bigger seconds) |
|---|---|---|
| Z1 recupero | slower than 129% | `sec > 1.29·T` |
| Z2 aerobico | 114% – 129% | `1.14·T ≤ sec ≤ 1.29·T` |
| Z3 moderato | 106% – 114% | `1.06·T ≤ sec < 1.14·T` |
| Z4 soglia   | 100% – 106% | `1.00·T ≤ sec < 1.06·T` |
| Z5 massimo  | faster than 100% | `sec < 1.00·T` |

Boundary snapping: each zone's fast edge = the next zone's slow edge (no dead band,
no overlap). Every pace classifies into exactly one of the 5 zones.

**Worked example — FTPa = 5:00/km (300 s/km):**

| Zone | Band |
|---|---|
| Z1 | slower than 6:27 /km |
| Z2 | 5:42 – 6:27 /km |
| Z3 | 5:18 – 5:42 /km |
| Z4 | 5:00 – 5:18 /km |
| Z5 | faster than 5:00 /km |

## Components

### 1. Data — threshold pace anchor

Mirror the massimali pattern in `js/profile-manager.js`.

- Storage: Supabase `user_metadata.thresholdPace` = integer **seconds per km**
  (e.g. `300` for 5:00/km). localStorage cache key `viltrum_threshold_pace`.
- Stored as seconds (not "5:00" string) so all zone math is pure arithmetic; UI
  converts to/from `mm:ss`.
- Two new exported functions, copy-shaped from `getUserMaxes` / `saveUserMaxes`
  (same cache-first read, same localStorage-immediate + Supabase-sync write, same
  `{ success, warning }` fallback when Supabase write fails):
  - `getThresholdPace()` → `Promise<number|null>` (seconds, or null if unset)
  - `saveThresholdPace(seconds)` → `Promise<{success, warning?}>`

**Interface contract:** input is seconds (int). Consumers never see the storage
shape. `null` means "not set" everywhere downstream.

### 2. UI — profile input

New card in `pages/profile.html`, directly under the massimali `maxes-form`.

- One masked `mm:ss` text input, label "Passo Soglia (test 30 min)".
- Helper text: "Ritmo medio su 30 min a tutto. Usato per le zone di corsa."
- Save button; reuses the maxes success/error message elements + styling pattern.
- On load: `getThresholdPace()` → render seconds as `mm:ss` (blank if null).
- On save: parse `mm:ss` → seconds, validate, call `saveThresholdPace`.
- Validation: format must be `m:ss` / `mm:ss`; sane range **2:00–12:00** per km.
  Reject outside range with an error message; do not write.

### 3. Zone math — pure module

New file `js/pace-zones.js`. No DOM, no storage, no async — pure functions, unit-
testable in isolation.

- `paceZoneBands(thresholdSec)` → `Array<{zone, minSec, maxSec}>` (length 5) or
  `null` when `thresholdSec` is null/invalid.
  - Convention: `minSec` = fastest edge (smaller seconds), `maxSec` = slowest edge
    (bigger seconds). Z5 has no fast bound (`minSec = 0`); Z1 has no slow bound
    (`maxSec = Infinity`).
- `classifyPace(currentSec, bands)` → zone number `1..5` the pace falls in, or `null`
  if bands is null or currentSec invalid.
- `formatPace(sec)` → `"m:ss"` string. `parsePace("m:ss")` → seconds int or null.

**Test cases (pure, must pass):** exactly 100% of T → Z4/Z5 boundary lands in Z5;
exactly 129% → Z1/Z2 boundary lands in Z2; faster than Z5 floor → Z5; slower than
Z1 → Z1; null threshold → null bands; malformed `mm:ss` → null.

### 4. Workout surfaces — `pages/endurance.html`

All three read bands once per workout: on load, call `getThresholdPace()` →
`paceZoneBands()`, hold in a module-level `paceBands` (may be null).

**(1) Phase-card target** — in `renderCurrentPhase` (~L1164). After the zone badge,
render the band for `phase.zone`: e.g. `6:00 – 6:30 /km`. New DOM node near
`phase-target`. If `paceBands` is null → node hidden, nothing shown. Z1 renders as
"più lento di 6:27 /km", Z5 as "più veloce di 5:00 /km" (open-ended bands).

**(2) Live pace vs target** — in the `watchPosition` handler (~L1325).

- **Smoothing (required):** raw GPS instantaneous pace is noise. Keep a rolling
  window of recent fixes (~15–20 s or ~30 m of travel). Live pace =
  windowDistance / windowTime. Discard any fix with `accuracy > 25 m`. Show
  `--:--` until the window has enough data.
- Big live-pace readout on the card, `mm:ss /km`.
- Color: green when `classifyPace(livePace, paceBands) === phase.zone`, amber
  otherwise. Reuse existing `--zone-color` CSS custom properties.
- If `paceBands` null or GPS unavailable → readout hidden / `--:--`; no crash.

**(3) Voice cue** — in `announcePhaseStart` (~L800).

- Only the **TTS/synth path** (`mode === 'voice'`) appends the pace phrase:
  `"Zona 2, 3 chilometri, passo 6:00 a 6:30"`.
- The **ElevenLabs path** (`mode === 'eleven'`) is left unchanged. Pre-recorded
  clips have no pace-number audio, so it silently omits pace. Documented
  limitation, not a bug. (Future: could record pace-digit clips.)
- If `paceBands` null → no pace phrase appended, cue identical to today.

### 5. Failure / edge handling

| Condition | Behavior |
|---|---|
| No threshold set | All 3 surfaces silent; workout identical to today |
| GPS denied / weak | Live pace `--:--`; target band + voice still work (no GPS needed) |
| Window not yet filled | Live pace `--:--` until enough fixes |
| Low-accuracy fix (>25 m) | Fix discarded from smoothing window |
| Nonsense threshold | Blocked at input by 2:00–12:00 range validation |
| ElevenLabs voice mode | Pace omitted from cue (no recorded clips) — by design |

## Files touched

| File | Change |
|---|---|
| `js/pace-zones.js` | **New.** Pure zone math + format/parse helpers |
| `js/profile-manager.js` | Add `getThresholdPace` / `saveThresholdPace` |
| `pages/profile.html` | New threshold-pace input card + save handler |
| `pages/endurance.html` | Load bands; phase-card target; live pace + color; voice cue |

## Out of scope (explicit)

- Profile-page read-only zone reference table
- Heart-rate / LTHR zones (app has no HR sensor)
- Splitting into full 7 Friel zones (5a/5b/5c)
- Coach-side threshold entry via Google Sheet backend
- Pre-recorded ElevenLabs pace-number audio

## Deploy note

Per project discipline: deploy via `.\deploy.ps1` (bumps sw.js version + BUILD_HASH),
never a bare git commit — otherwise PWA users stay on stale cache and never get the
update banner.
