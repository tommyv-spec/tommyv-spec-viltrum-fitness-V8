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
  assert.equal(byZone[1].minSec, 387);
  assert.equal(byZone[1].maxSec, Infinity);
  assert.equal(byZone[2].minSec, 342);
  assert.equal(byZone[2].maxSec, 387);
  assert.equal(byZone[3].minSec, 318);
  assert.equal(byZone[3].maxSec, 342);
  assert.equal(byZone[4].minSec, 300);
  assert.equal(byZone[4].maxSec, 318);
  assert.equal(byZone[5].minSec, 0);
  assert.equal(byZone[5].maxSec, 300);
});

test('bands are contiguous — no gap, no overlap', () => {
  const b = paceZoneBands(300);
  const byZone = Object.fromEntries(b.map((x) => [x.zone, x]));
  assert.equal(byZone[5].maxSec, byZone[4].minSec);
  assert.equal(byZone[4].maxSec, byZone[3].minSec);
  assert.equal(byZone[3].maxSec, byZone[2].minSec);
  assert.equal(byZone[2].maxSec, byZone[1].minSec);
});

// --- classifyPace ---

test('classifyPace boundary rules (T=300)', () => {
  const b = paceZoneBands(300);
  assert.equal(classifyPace(250, b), 5);
  assert.equal(classifyPace(300, b), 5);
  assert.equal(classifyPace(310, b), 4);
  assert.equal(classifyPace(330, b), 3);
  assert.equal(classifyPace(360, b), 2);
  assert.equal(classifyPace(387, b), 2);
  assert.equal(classifyPace(500, b), 1);
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
  assert.equal(parsePace('5:60'), null);
  assert.equal(parsePace('abc'), null);
  assert.equal(parsePace('5:5'), null);
});
