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
  if (!Array.isArray(bands) || currentSec === null || currentSec === undefined) {
    return null;
  }
  const s = Number(currentSec);
  if (!Number.isFinite(s)) return null;
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
