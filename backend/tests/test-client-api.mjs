// Integration test for js/api.js — imports the REAL module with browser globals
// stubbed, so it exercises actual module resolution and the live apiPost contract.
//
//   Run:  node backend/tests/test-client-api.mjs
//
// Covers what unit-stubbing the backend cannot: that api.js imports cleanly,
// registers window.ViltrumAPI, never puts the token in a URL, never sends an
// `email`, and that the one-shot legacy purge does not eat the new cache.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_PATH = path.join(__dirname, '..', '..', 'js', 'api.js');

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { console.log(`  PASS  ${name}`); pass++; }
  else { console.log(`  FAIL  ${name}${detail ? '\n          -> ' + detail : ''}`); fail++; }
};

// ---- browser global stubs ----------------------------------------------------
const mkStorage = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    _map: m
  };
};

globalThis.localStorage = mkStorage();
globalThis.sessionStorage = mkStorage();
globalThis.window = {};

// Seed the pre-V9 leaked cache so we can prove the purge removes it.
localStorage.setItem('workoutData', JSON.stringify({ userWorkouts: { 'someone@else.com': { fullName: 'Leaked Person' } } }));
localStorage.setItem('workoutDataTimestamp', '123');
sessionStorage.setItem('viltrum_session_data', '{"userWorkouts":{"a@b.com":{}}}');

let lastFetch = null;
globalThis.fetch = async (url, opts) => {
  lastFetch = { url, opts };
  return { ok: true, status: 200, json: async () => ({ status: 'success', echo: JSON.parse(opts.body) }) };
};

console.log('\n--- module import ---');
let api;
try {
  api = await import(pathToFileURL(API_PATH).href);
  check('js/api.js imports cleanly (module graph resolves)', true);
} catch (e) {
  check('js/api.js imports cleanly (module graph resolves)', false, e.message);
  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(1);
}

check('exports apiPost / getAccessToken / AuthError',
  typeof api.apiPost === 'function' && typeof api.getAccessToken === 'function' && typeof api.AuthError === 'function');
check('registers window.ViltrumAPI (index.html + offline-preloader.js depend on this)',
  !!globalThis.window.ViltrumAPI && typeof globalThis.window.ViltrumAPI.apiPost === 'function',
  'window.ViltrumAPI = ' + JSON.stringify(Object.keys(globalThis.window.ViltrumAPI || {})));

console.log('\n--- C1 fallout: leaked cache purged from the device on import ---');
check('pre-V9 localStorage full dump removed', localStorage.getItem('workoutData') === null);
check('pre-V9 timestamp removed', localStorage.getItem('workoutDataTimestamp') === null);
check('pre-V9 sessionStorage dump removed', sessionStorage.getItem('viltrum_session_data') === null);
check('purge flag set', localStorage.getItem('viltrum_v9_legacy_purged') === '1');

console.log('\n--- purge must not eat the NEW cache (same keys are reused) ---');
localStorage.setItem('workoutData', '{"v9":"legit single-user payload"}');
const ranAgain = api.purgeLegacyCaches();
check('second purge is a no-op', ranAgain === false);
check('new cache survives', localStorage.getItem('workoutData') === '{"v9":"legit single-user payload"}',
  'got: ' + localStorage.getItem('workoutData'));
check('forced purge still possible', api.purgeLegacyCaches({ force: true }) === true);

console.log('\n--- getAccessToken ---');
localStorage.removeItem('sb-nvdrvqamxoqezmfrnjcw-auth-token');
check('no session -> null', (await api.getAccessToken()) === null);

localStorage.setItem('sb-nvdrvqamxoqezmfrnjcw-auth-token', JSON.stringify({ access_token: 'persisted-token' }));
check('falls back to persisted supabase session (correct storage key)',
  (await api.getAccessToken()) === 'persisted-token');

globalThis.window.supabase = { auth: { getSession: async () => ({ data: { session: { access_token: 'live-token' } } }) } };
check('prefers live client over persisted (so refresh is honoured)',
  (await api.getAccessToken()) === 'live-token');

console.log('\n--- apiPost request contract ---');
lastFetch = null;
await api.apiPost('getUserData');
const body = JSON.parse(lastFetch.opts.body);
check('POST, not GET', lastFetch.opts.method === 'POST');
check('Content-Type text/plain (CORS simple request, no preflight)',
  /^text\/plain/.test(lastFetch.opts.headers['Content-Type']),
  lastFetch.opts.headers['Content-Type']);
check('no Authorization header (would trigger preflight Apps Script cannot answer)',
  !Object.keys(lastFetch.opts.headers).some((h) => h.toLowerCase() === 'authorization'));
check('token travels in BODY', body.token === 'live-token');
check('token NOT in URL (would leak into logs/history)', !String(lastFetch.url).includes('live-token'));
check('action in body', body.action === 'getUserData');
check('NO email sent — identity is the token, not a caller-supplied string',
  body.email === undefined, 'body keys: ' + Object.keys(body).join(','));
check('targets the configured GAS endpoint', /script\.google\.com\/macros\/s\//.test(lastFetch.url));

lastFetch = null;
await api.apiPost('saveLastWorkout', { planName: 'Plan A', lastWorkoutIndex: 3, totalWorkouts: 12 });
const b2 = JSON.parse(lastFetch.opts.body);
check('payload passes through', b2.planName === 'Plan A' && b2.lastWorkoutIndex === 3 && b2.totalWorkouts === 12);
check('payload cannot override action', b2.action === 'saveLastWorkout');

console.log('\n--- apiPost failure modes ---');
globalThis.window.supabase = { auth: { getSession: async () => ({ data: { session: null } }) } };
localStorage.removeItem('sb-nvdrvqamxoqezmfrnjcw-auth-token');
let threw = null;
try { await api.apiPost('getUserData'); } catch (e) { threw = e; }
check('no session -> throws AuthError', threw instanceof api.AuthError, String(threw));

globalThis.window.supabase = { auth: { getSession: async () => ({ data: { session: { access_token: 't' } } }) } };
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ status: 'error', code: 'unauthorized', message: 'Invalid or expired session' }) });
threw = null;
try { await api.apiPost('getUserData'); } catch (e) { threw = e; }
check('server says unauthorized -> throws AuthError (so callers can bounce to login)',
  threw instanceof api.AuthError, String(threw));

globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
threw = null;
try { await api.apiPost('getUserData'); } catch (e) { threw = e; }
check('HTTP 500 -> throws (not silently treated as success)', threw !== null && !(threw instanceof api.AuthError));

console.log('\n--- apiPostPublic (questionnaire, no session) ---');
globalThis.fetch = async (url, opts) => { lastFetch = { url, opts }; return { ok: true, status: 200, json: async () => ({ status: 'success' }) }; };
await api.apiPostPublic('submitQuestionnaire', { email: 'lead@x.com', fullname: 'X' });
const b3 = JSON.parse(lastFetch.opts.body);
check('public call carries no token', b3.token === undefined);
check('public call keeps its own email field (lead, not identity)', b3.email === 'lead@x.com');

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
