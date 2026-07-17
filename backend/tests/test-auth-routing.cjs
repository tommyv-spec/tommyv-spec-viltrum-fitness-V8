// Exercises the V9 doPost/doGet auth routing in Codice.js against stubbed
// Apps Script globals. Proves the load-bearing claim: a caller-supplied email
// is discarded and replaced with the Supabase-verified one.
//   Run:  node backend/tests/test-auth-routing.cjs
//   (.cjs because package.json sets "type": "module")
//
//   Lives OUTSIDE backend/apps-script/ on purpose: that directory is clasp's
//   rootDir and everything in it gets pushed to the live Apps Script project.
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const SRC = path.join(__dirname, '..', 'apps-script', 'Codice.js');

// --- controllable stub state -------------------------------------------------
let fetchImpl = () => ({ code: 200, body: '{}' });
const cacheStore = new Map();

const sandbox = {
  console,
  Logger: { log: () => {} },
  ContentService: {
    MimeType: { JSON: 'json' },
    createTextOutput: (s) => ({ _content: s, setMimeType() { return this; }, getContent() { return this._content; } })
  },
  Utilities: {
    DigestAlgorithm: { SHA_256: 'sha256' },
    computeDigest: (_alg, s) => Array.from(Buffer.from(String(s))),
    base64EncodeWebSafe: (bytes) => Buffer.from(bytes).toString('base64url')
  },
  CacheService: {
    getScriptCache: () => ({
      get: (k) => (cacheStore.has(k) ? cacheStore.get(k) : null),
      put: (k, v) => cacheStore.set(k, v),
      removeAll: (ks) => ks.forEach((k) => cacheStore.delete(k))
    })
  },
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: (k) => ({
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_ANON_KEY: 'anon-key',
        SYNC_TOKEN: 'the-real-sync-secret'
      }[k] || null),
      setProperty: () => {}
    })
  },
  UrlFetchApp: {
    fetch: (url, opts) => {
      const r = fetchImpl(url, opts);
      return { getResponseCode: () => r.code, getContentText: () => r.body };
    }
  },
  SpreadsheetApp: { getActiveSpreadsheet: () => { throw new Error('handler should not run in these tests'); } },
  ScriptApp: {}, SpreadsheetApp_: {}, MailApp: {}, GmailApp: {}, Session: {}, HtmlService: {}, UrlFetchApp_: {}
};

const bridge = `
  globalThis.__doPost = doPost;
  globalThis.__doGet = doGet;
  globalThis.__tables = { PUBLIC_ACTIONS, SYNC_ACTIONS, USER_ACTIONS };
  globalThis._cacheIfSuccess = _cacheIfSuccess;
`;

const context = vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(SRC, 'utf8') + bridge, context, { filename: 'Codice.js' });

const { __doPost: doPost, __doGet: doGet, __tables: tables } = sandbox;
const parse = (res) => JSON.parse(res.getContent ? res.getContent() : res._content);
const post = (payload) => parse(doPost({ postData: { contents: JSON.stringify(payload) } }));

// Swap real handlers for spies (const binding, mutable object).
let seen = null;
const spy = (name) => (data) => { seen = { handler: name, data: JSON.parse(JSON.stringify(data)) };
  return sandbox.ContentService.createTextOutput(JSON.stringify({ status: 'success', handler: name })); };
for (const k of Object.keys(tables.USER_ACTIONS)) tables.USER_ACTIONS[k] = spy(k);
for (const k of Object.keys(tables.SYNC_ACTIONS)) tables.SYNC_ACTIONS[k] = spy(k);
for (const k of Object.keys(tables.PUBLIC_ACTIONS)) tables.PUBLIC_ACTIONS[k] = spy(k);

// --- tests -------------------------------------------------------------------
let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { console.log(`  PASS  ${name}`); pass++; }
  else { console.log(`  FAIL  ${name}${detail ? '\n          -> ' + detail : ''}`); fail++; }
};

const validToken = (email) => (url, opts) => {
  if (!/\/auth\/v1\/user$/.test(url)) return { code: 404, body: '{}' };
  if (opts.headers.Authorization !== 'Bearer good-token') return { code: 401, body: '{"msg":"bad jwt"}' };
  return { code: 200, body: JSON.stringify({ email }) };
};

console.log('\nC2/C3 — IDOR: caller-supplied email must be discarded');
cacheStore.clear(); seen = null;
fetchImpl = validToken('victim-is-not-me@real.com');
let r = post({ action: 'getUserData', token: 'good-token', email: 'victim@someone-else.com' });
check('verified email overwrites attacker-supplied email',
  seen && seen.data.email === 'victim-is-not-me@real.com',
  seen ? `handler saw email=${seen.data.email}` : 'handler never ran');
check('attacker email is gone entirely',
  seen && seen.data.email !== 'victim@someone-else.com');

console.log('\nC2 — write path is identically gated');
cacheStore.clear(); seen = null;
fetchImpl = validToken('owner@real.com');
post({ action: 'saveWeights', token: 'good-token', email: 'victim@someone-else.com', weights: '{"squat":200}' });
check('saveWeights writes to token owner, not target',
  seen && seen.data.email === 'owner@real.com',
  seen ? `handler saw email=${seen.data.email}` : 'handler never ran');

console.log('\nAuth rejection paths');
cacheStore.clear(); seen = null;
r = post({ action: 'getUserData', email: 'victim@someone-else.com' });
check('no token -> unauthorized', r.code === 'unauthorized', JSON.stringify(r));
check('no token -> handler never ran', seen === null);

cacheStore.clear(); seen = null;
fetchImpl = validToken('owner@real.com');
r = post({ action: 'getUserData', token: 'forged-token' });
check('forged token -> unauthorized', r.code === 'unauthorized', JSON.stringify(r));
check('forged token -> handler never ran', seen === null);

// Supabase answers a bad JWT with 403 "bad_jwt", NOT 401 (verified against the
// live project). Any non-200 must be treated as a rejection.
for (const code of [400, 401, 403, 429, 500]) {
  cacheStore.clear(); seen = null;
  fetchImpl = () => ({ code, body: '{"code":' + code + ',"error_code":"bad_jwt"}' });
  r = post({ action: 'getUserData', token: 'whatever' });
  check(`verifier HTTP ${code} -> unauthorized`, r.code === 'unauthorized' && seen === null, JSON.stringify(r));
}

// A 200 with no email must NOT be treated as authenticated.
cacheStore.clear(); seen = null;
fetchImpl = () => ({ code: 200, body: '{"id":"abc","email":null}' });
r = post({ action: 'getUserData', token: 'whatever' });
check('verifier 200 but no email -> unauthorized', r.code === 'unauthorized' && seen === null, JSON.stringify(r));

// Malformed JSON from the verifier must not authenticate anyone.
cacheStore.clear(); seen = null;
fetchImpl = () => ({ code: 200, body: 'not json at all' });
r = post({ action: 'getUserData', token: 'whatever' });
check('verifier returns garbage -> unauthorized', r.code === 'unauthorized' && seen === null, JSON.stringify(r));

cacheStore.clear(); seen = null;
fetchImpl = () => { throw new Error('network down'); };
r = post({ action: 'getUserData', token: 'good-token' });
check('verifier network failure -> fails CLOSED', r.code === 'unauthorized', JSON.stringify(r));
check('network failure -> handler never ran', seen === null);

console.log('\nC3 — revenue: addPlanToUser must reject a user JWT');
cacheStore.clear(); seen = null;
fetchImpl = validToken('freeloader@real.com');
r = post({ action: 'addPlanToUser', token: 'good-token', email: 'freeloader@real.com', planName: 'Annual', durationMonths: 99 });
check('user token cannot grant a plan', r.status === 'error' && seen === null, JSON.stringify(r));

cacheStore.clear(); seen = null;
r = post({ action: 'addPlanToUser', token: 'the-real-sync-secret', email: 'buyer@real.com', planName: 'Annual', durationMonths: 4 });
check('sync token DOES grant a plan (Shopify flow intact)',
  seen && seen.handler === 'addPlanToUser' && seen.data.email === 'buyer@real.com',
  seen ? `saw ${seen.handler} email=${seen.data.email}` : 'handler never ran: ' + JSON.stringify(r));

console.log('\nSync/admin endpoints');
for (const a of ['list-users', 'list-email-log', 'bustCache', 'delete-user']) {
  cacheStore.clear(); seen = null;
  r = post({ action: a });
  check(`${a} without token -> rejected`, r.status === 'error' && seen === null, JSON.stringify(r));
}

console.log('\nPublic endpoints still open');
cacheStore.clear(); seen = null;
r = post({ action: 'submitQuestionnaire', fullname: 'X', email: 'lead@x.com', phone: '1' });
check('submitQuestionnaire works with no token', seen && seen.handler === 'submitQuestionnaire');

console.log('\nC1 — full dump is gone');
r = parse(doGet({ parameter: {} }));
check('bare doGet returns no data', r.status === 'error' && !r.userWorkouts, JSON.stringify(r).slice(0, 90));
r = parse(doGet({ parameter: { action: 'getUserData', email: 'victim@x.com' } }));
check('legacy GET action returns no data', r.status === 'error' && !r.user, JSON.stringify(r).slice(0, 90));

console.log('\nUnknown action');
r = post({ action: 'somethingNew' });
check('unlisted action denied by default', r.status === 'error' && /Unknown action/.test(r.message));

console.log('\nPer-user response cache must never cache a miss');
{
  // Regression: caching {"status":"error","message":"User not found"} for 5 min
  // meant a new signup saw an empty dashboard long after their row existed.
  const mkResp = (obj) => sandbox.ContentService.createTextOutput(JSON.stringify(obj));
  const store = new Map();
  const fakeCache = { get: (k) => (store.has(k) ? store.get(k) : null), put: (k, v) => store.set(k, v) };
  const cacheIfSuccess = vm.runInContext('_cacheIfSuccess', context);

  store.clear();
  cacheIfSuccess(fakeCache, 'k', mkResp({ status: 'error', message: 'User not found' }), 300);
  check('an error response is NOT cached', store.size === 0, [...store.values()].join(''));

  store.clear();
  cacheIfSuccess(fakeCache, 'k', mkResp({ status: 'success', user: { email: 'a@b.com' } }), 300);
  check('a success response IS cached', store.size === 1);

  store.clear();
  cacheIfSuccess(fakeCache, 'k', sandbox.ContentService.createTextOutput('not json'), 300);
  check('an unparseable response is NOT cached', store.size === 0);

  store.clear();
  cacheIfSuccess(fakeCache, 'k', sandbox.ContentService.createTextOutput('x'.repeat(100001)), 300);
  check('an oversized response is NOT cached', store.size === 0);
}

console.log('\nToken cache');
cacheStore.clear(); seen = null;
let calls = 0;
fetchImpl = (u, o) => { calls++; return validToken('cached@real.com')(u, o); };
post({ action: 'getUserData', token: 'good-token' });
post({ action: 'getUserData', token: 'good-token' });
check('second call served from cache (1 verify, not 2)', calls === 1, `calls=${calls}`);
check('cache key is a digest, not the raw token',
  ![...cacheStore.keys()].some((k) => k.includes('good-token')), [...cacheStore.keys()].join(','));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
