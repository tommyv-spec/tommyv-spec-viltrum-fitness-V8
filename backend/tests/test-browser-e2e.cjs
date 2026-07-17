// Real browser test of the V9 client against the STAGING Apps Script deployment.
//
// Safety: the app is COPIED to a temp dir and the copy's config.js is pointed at
// staging. The real repo is never modified, and production cannot be reached
// even if something goes wrong.
//
// Proves the things unit tests cannot: that the browser actually allows the
// text/plain POST (no CORS preflight block), that window.ViltrumAPI exists when
// index.html reaches for it, and that a real login drives real authenticated calls.
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REPO = 'c:/Users/tomma/Documents/Viltrum 05-15/viltrum-fitness-V8';
const TMP = path.join(process.env.TEMP || '/tmp', 'viltrum-v9-browsertest');
const STAGING = 'https://script.google.com/macros/s/AKfycbwuh2hrho__RELvXqvSfBYmF61zXwBL76n2W5NNNEf3jZvveCU8B1k-sln9AtMHhFw6Rg/exec';
const PROD_ID = 'AKfycbziZcFyYVVoK4w8jvHEnd0Fi6cD9ZaIGnBwDQc0Dhf1wx7tZ1uWgW8e74O5jR2c8YodGg';
const SUPA = 'https://nvdrvqamxoqezmfrnjcw.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im52ZHJ2cWFteG9xZXptZnJuamN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI2NDA3NjIsImV4cCI6MjA3ODIxNjc2Mn0.xyxX2L2mDto9hyWBsEGOqL1Ip73thC8E81V54UAKNEg';
const PORT = 8787;

let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { console.log(`  PASS  ${n}`); pass++; } else { console.log(`  FAIL  ${n}${d ? '\n          -> ' + d : ''}`); fail++; } };

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.ico': 'image/x-icon' };

function copyApp() {
  fs.rmSync(TMP, { recursive: true, force: true });
  const skip = new Set(['node_modules', '.git', 'graphify-out', '.wrangler', '.planning', 'backend', 'images', 'supabase']);
  const rec = (src, dst) => {
    fs.mkdirSync(dst, { recursive: true });
    for (const e of fs.readdirSync(src, { withFileTypes: true })) {
      if (skip.has(e.name)) continue;
      const s = path.join(src, e.name), d = path.join(dst, e.name);
      if (e.isDirectory()) rec(s, d); else fs.copyFileSync(s, d);
    }
  };
  rec(REPO, TMP);
  // point the COPY at staging
  const cfgPath = path.join(TMP, 'js', 'config.js');
  let cfg = fs.readFileSync(cfgPath, 'utf8');
  if (!cfg.includes(PROD_ID)) throw new Error('config.js did not contain the prod id - aborting');
  cfg = cfg.replace(new RegExp(PROD_ID, 'g'), 'AKfycbwuh2hrho__RELvXqvSfBYmF61zXwBL76n2W5NNNEf3jZvveCU8B1k-sln9AtMHhFw6Rg');
  fs.writeFileSync(cfgPath, cfg);
  if (fs.readFileSync(cfgPath, 'utf8').includes(PROD_ID)) throw new Error('failed to strip prod id');
  return true;
}

(async () => {
  let server, browser, svc = null, uid = null;
  const email = `v9-browser-${Date.now().toString(36)}@example.com`;
  const pw = 'Test-' + Math.random().toString(36).slice(2) + '-Aa1!';
  try {
    console.log('--- setup ---');
    copyApp();
    check('app copied to temp, config.js -> staging (prod unreachable from this test)', true);

    server = http.createServer((req, res) => {
      const u = decodeURIComponent(req.url.split('?')[0]);
      let p = path.join(TMP, u === '/' ? 'index.html' : u);
      if (!p.startsWith(TMP)) { res.writeHead(403); return res.end(); }
      if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end('nf'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
      fs.createReadStream(p).pipe(res);
    });
    await new Promise((r) => server.listen(PORT, r));
    check('local server up on :' + PORT, true);

    // throwaway user
    const raw = execSync('supabase projects api-keys --project-ref nvdrvqamxoqezmfrnjcw -o json', { encoding: 'utf8', cwd: REPO, stdio: ['ignore', 'pipe', 'ignore'] });
    svc = (JSON.parse(raw).find((k) => k.name === 'service_role') || {}).api_key;
    if (!svc) throw new Error('no service_role key');
    const cu = await fetch(`${SUPA}/auth/v1/admin/users`, {
      method: 'POST', headers: { apikey: svc, Authorization: `Bearer ${svc}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pw, email_confirm: true, user_metadata: { full_name: 'V9 Browser Test', username: 'v9browser' } })
    });
    uid = (await cu.json()).id;
    check('throwaway test user created', !!uid);

    // ---- browser ----
    browser = await chromium.launch();
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    const consoleErrors = [], pageErrors = [], gasCalls = [], blocked = [];
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('pageerror', (e) => pageErrors.push(e.message));
    page.on('requestfailed', (r) => blocked.push(`${r.url().slice(0, 60)} :: ${r.failure()?.errorText}`));
    page.on('response', async (r) => {
      if (r.url().includes('/macros/s/')) {
        let body = '';
        try { body = (await r.text()).slice(0, 120); } catch (e) {}
        gasCalls.push({ status: r.status(), method: r.request().method(), body });
      }
    });

    console.log('\n--- page load ---');
    await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle', timeout: 45000 });
    check('index.html loads', true);
    const apiReady = await page.evaluate(() => typeof window.ViltrumAPI?.apiPost === 'function');
    check('window.ViltrumAPI is defined in a REAL browser (module graph works)', apiReady);
    check('no uncaught page errors on load', pageErrors.length === 0, pageErrors.join(' | '));

    console.log('\n--- login (real Supabase session) ---');
    // The auth modal is hidden until opened; openAuthModal() adds .active
    await page.evaluate(() => {
      const m = document.getElementById('auth-modal');
      if (m) m.classList.add('active');
    });
    await page.waitForSelector('#login-email', { state: 'visible', timeout: 10000 });
    await page.fill('#login-email', email);
    await page.fill('#login-password', pw);
    await page.click('#login-button');
    await page.waitForTimeout(10000);

    const loggedIn = await page.evaluate(() => !!localStorage.getItem('loggedUser'));
    check('login succeeded (session established)', loggedIn, 'loggedUser not set');

    console.log('\n--- THE CORS QUESTION ---');
    const corsErrors = [...consoleErrors, ...blocked].filter((t) => /CORS|Access-Control|preflight|blocked by/i.test(t));
    check('NO CORS errors — browser allowed the text/plain POST', corsErrors.length === 0, corsErrors.slice(0, 3).join(' | '));
    check('backend was actually called', gasCalls.length > 0, 'no /macros/s/ requests seen at all');
    const posts = gasCalls.filter((c) => c.method === 'POST');
    check('calls went out as POST', posts.length > 0, JSON.stringify(gasCalls.slice(0, 3)));
    console.log('    GAS requests observed:', gasCalls.length, '(bodies are empty: Apps Script answers POST with a 302 and fetch follows it)');

    // Definitive: call the API from inside the real page and read the parsed result.
    console.log('\n--- authenticated call FROM THE BROWSER ---');
    const own = await page.evaluate(async () => {
      try { return await window.ViltrumAPI.apiPost('ensureUserInSheet', { name: 'V9 Browser Test' }); }
      catch (e) { return { _err: e.message }; }
    });
    check('apiPost round-trips through the browser and is accepted',
      own && !own._err && own.status === 'success', JSON.stringify(own).slice(0, 140));

    const me = await page.evaluate(async () => {
      try { return await window.ViltrumAPI.apiPost('getUserData'); }
      catch (e) { return { _err: e.message }; }
    });
    check('getUserData returns MY row', me && me.status === 'success' && me.user, JSON.stringify(me).slice(0, 140));
    check('and it is really my email (identity came from the token)',
      me && me.user && me.user.email === email.toLowerCase(), me?.user?.email);

    console.log('\n--- IDOR, from a real browser, with a real session ---');
    const victim = await page.evaluate(async (target) => {
      try { return await window.ViltrumAPI.apiPost('getUserData', { email: target }); }
      catch (e) { return { _err: e.message }; }
    }, 'v9-authtest-a-mro5l7y9@example.com'); // the row left by the earlier API test
    const leaked = JSON.stringify(victim).includes('v9-authtest-a-mro5l7y9');
    check('asking for ANOTHER user by email does not return them',
      !leaked, 'LEAKED: ' + JSON.stringify(victim).slice(0, 140));
    check('server answered with my own identity instead',
      victim && (victim.status === 'error' || (victim.user && victim.user.email === email.toLowerCase())),
      JSON.stringify(victim).slice(0, 140));

    const noTok = await page.evaluate(async (url) => {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'getUserData', email: 'v9-authtest-a-mro5l7y9@example.com' }) });
      return (await r.text()).slice(0, 120);
    }, STAGING);
    check('a tokenless POST from the browser is rejected', /unauthorized/.test(noTok), noTok);

    const dump = await page.evaluate(async (url) => {
      const r = await fetch(url);
      return (await r.text()).slice(0, 120);
    }, STAGING);
    check('the old full-dump GET returns no data from the browser either',
      !/userWorkouts/.test(dump) && /gone/.test(dump), dump);

    console.log('\n--- undefined-global regressions ---');
    const undef = pageErrors.filter((e) => /ViltrumAPI|apiPost|is not defined|undefined is not/i.test(e));
    check('no "ViltrumAPI undefined" style errors', undef.length === 0, undef.join(' | '));

    console.log('\n--- legacy cache purge ran in browser ---');
    const purged = await page.evaluate(() => localStorage.getItem('viltrum_v9_legacy_purged'));
    check('purge flag set on device', purged === '1', 'got: ' + purged);

    await page.screenshot({ path: path.join(TMP, 'after-login.png') });
    console.log('    screenshot:', path.join(TMP, 'after-login.png'));

    if (consoleErrors.length) {
      console.log('\n  (console errors seen, for context)');
      consoleErrors.slice(0, 6).forEach((e) => console.log('    -', e.slice(0, 110)));
    }
  } catch (e) {
    console.log('\nERROR:', e.message.slice(0, 300));
    fail++;
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server) server.close();
    if (svc && uid) {
      await fetch(`${SUPA}/auth/v1/admin/users/${uid}`, { method: 'DELETE', headers: { apikey: svc, Authorization: `Bearer ${svc}` } }).catch(() => {});
      console.log('\ncleaned up throwaway auth user');
    }
    console.log('SHEET ROW may have been created for:', email);
    console.log(`\n${pass} passed, ${fail} failed\n`);
    process.exit(fail ? 1 : 0);
  }
})();
