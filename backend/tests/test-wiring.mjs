// Static wiring checks. These catch the class of bug that only surfaces in a
// real browser: an import path that does not resolve, a service-worker precache
// entry pointing at a file that does not exist (breaks offline install), or a
// page calling window.ViltrumAPI without anything that loads js/api.js.
//
//   Run:  node backend/tests/test-wiring.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { console.log(`  PASS  ${name}`); pass++; }
  else { console.log(`  FAIL  ${name}${detail ? '\n          -> ' + detail : ''}`); fail++; }
};

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.posix.join(dir, e.name);
    if (e.isDirectory()) {
      if (['node_modules', 'graphify-out', '.git', '.wrangler', '.planning', 'backend'].includes(e.name)) continue;
      walk(rel, out);
    } else out.push(rel);
  }
  return out;
};
const files = walk('.');
const jsFiles = files.filter((f) => f.endsWith('.js') && !f.includes('/sw.js') && f !== './sw.js');

console.log('\n--- every import specifier resolves to a real file ---');
let bad = [];
for (const f of files.filter((x) => x.endsWith('.js') || x.endsWith('.html'))) {
  const src = read(f);
  const specs = [...src.matchAll(/(?:from|import)\s*\(?\s*['"](\.[^'"]+)['"]/g)].map((m) => m[1]);
  for (const s of specs) {
    const resolved = path.resolve(path.dirname(path.join(ROOT, f)), s);
    if (!fs.existsSync(resolved)) bad.push(`${f} -> ${s}`);
  }
}
check('no broken relative imports', bad.length === 0, bad.join('\n          -> '));

console.log('\n--- service worker precache integrity (a bad entry breaks offline install) ---');
const sw = read('sw.js');
const urls = [...sw.matchAll(/['"](\.\/[^'"]+\.(?:js|html|json|css))['"]/g)].map((m) => m[1]);
const missing = urls.filter((u) => !fs.existsSync(path.join(ROOT, u.replace(/^\.\//, ''))));
check(`all ${urls.length} precached urls exist on disk`, missing.length === 0, missing.join(', '));
check('js/api.js is precached (new module, else offline breaks)', urls.includes('./js/api.js'),
  'precached js: ' + urls.filter((u) => u.startsWith('./js/')).join(', '));

console.log('\n--- window.ViltrumAPI consumers can actually reach it ---');
// api.js sets window.ViltrumAPI as an import side effect. A file using the
// global must be on a page whose module graph reaches api.js, or the call is a
// TypeError at runtime.
const importsApi = (rel) => /from\s+['"][^'"]*\/api\.js['"]|import\(\s*['"][^'"]*\/api\.js['"]\s*\)/.test(read(rel));
const norm = (p) => p.replace(/^\.\//, '');
const resolveRel = (fromFile, spec) => {
  const abs = path.resolve(path.dirname(path.join(ROOT, fromFile)), spec);
  const rel = path.relative(ROOT, abs).split(path.sep).join('/');
  return fs.existsSync(abs) ? rel : null;
};
// Does this module reach api.js within `depth` hops?
const graphReachesApi = (rel, depth = 4, seen = new Set()) => {
  if (!rel || seen.has(rel) || depth < 0) return false;
  seen.add(rel);
  if (norm(rel).endsWith('js/api.js')) return true;
  if (importsApi(rel)) return true;
  const deps = [...read(rel).matchAll(/from\s+['"](\.[^'"]+)['"]/g)].map((m) => m[1]);
  return deps.some((d) => graphReachesApi(resolveRel(rel, d), depth - 1, seen));
};
// Everything a page pulls in: module srcs + inline imports.
const pageReachesApi = (page) => {
  const src = read(page);
  if (importsApi(page)) return true;
  const inline = [...src.matchAll(/from\s+['"](\.[^'"]+)['"]/g)].map((m) => m[1]);
  const srcs = [...src.matchAll(/<script[^>]*src=["']([^"']+\.js)["']/g)].map((m) => m[1]);
  return [...inline, ...srcs].some((s) => graphReachesApi(resolveRel(page, s)));
};

const htmlPages = files.filter((f) => f.endsWith('.html'));
const usesGlobal = files.filter((f) => (f.endsWith('.js') || f.endsWith('.html')) && /window\.ViltrumAPI/.test(read(f)) && !norm(f).endsWith('js/api.js'));

for (const f of usesGlobal) {
  if (f.endsWith('.html')) {
    check(`${f} uses window.ViltrumAPI -> its own module graph reaches api.js`, pageReachesApi(f),
      'nothing this page loads imports api.js; window.ViltrumAPI would be undefined');
    continue;
  }
  // A .js file using the global: every page that actually <script>-loads it must reach api.js.
  const base = path.posix.basename(f);
  const loaders = htmlPages.filter((p) => new RegExp(`<script[^>]*src=["'][^"']*${base.replace('.', '\\.')}["']`).test(read(p)));
  const broken = loaders.filter((p) => !pageReachesApi(p));
  check(`${f} uses window.ViltrumAPI -> reachable on all ${loaders.length} page(s) that load it`,
    loaders.length > 0 && broken.length === 0,
    broken.length ? 'BROKEN on: ' + broken.join(', ') : 'no page loads this file at all');
}

console.log('\n--- no unauthenticated backend call survives anywhere in the client ---');
// NOTE: an earlier version of this check only looked for the LITERAL strings
// "?action=" and "&email=". That missed every call site that built its query
// programmatically via `new URL(GOOGLE_SCRIPT_URL)` + `searchParams.append`,
// which is how js/workout-history.js and pages/workout-completion.html talked
// to the backend — four live IDOR endpoints that survived the first sweep.
// Match on the CAPABILITY (touching GOOGLE_SCRIPT_URL outside api.js), not on
// one syntax for it.
// Comments must be stripped first: this file is now full of prose explaining
// the very patterns being banned, and matching those is a false positive.
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/<!--[\s\S]*?-->/g, '');

const offenders = [];
for (const f of files.filter((x) => x.endsWith('.js') || x.endsWith('.html'))) {
  if (norm(f).endsWith('js/api.js')) continue; // the one legitimate door
  const src = stripComments(read(f));
  if (/\?action=/.test(src)) offenders.push(`${f}: builds a ?action= URL literal`);
  if (/&email=/.test(src)) offenders.push(`${f}: puts &email= in a URL literal`);
  if (/searchParams\.append\(\s*['"]action['"]/.test(src)) offenders.push(`${f}: searchParams.append('action', ...)`);
  if (/searchParams\.append\(\s*['"]email['"]/.test(src)) offenders.push(`${f}: searchParams.append('email', ...)`);
  if (/new URL\(\s*(this\.)?(GOOGLE_SCRIPT_URL|GAS_URL)/.test(src)) offenders.push(`${f}: new URL(GOOGLE_SCRIPT_URL) — programmatic query building`);
  if (/fetch\(\s*(this\.)?(GOOGLE_SCRIPT_URL|GAS_URL)\s*[,)]/.test(src)) offenders.push(`${f}: direct fetch of the GAS endpoint`);
  if (/fetch\(\s*`\$\{(this\.)?(GOOGLE_SCRIPT_URL|GAS_URL)\}/.test(src)) offenders.push(`${f}: template-literal fetch of the GAS endpoint`);
  if (/password=\$\{|[?&]password=/.test(src)) offenders.push(`${f}: credentials in a URL`);
}
check('no client code reaches the backend outside js/api.js', offenders.length === 0, offenders.join('\n          -> '));

console.log('\n--- no application/json POST to the GAS endpoint (would be preflight-blocked) ---');
// Scoped to the fetch TARGET, not the file: other hosts (e.g. TTS_SERVER_URL)
// answer preflight fine and are legitimately application/json.
const jsonPosters = [];
for (const f of files.filter((x) => x.endsWith('.js') || x.endsWith('.html'))) {
  const src = stripComments(read(f));
  for (const m of src.matchAll(/fetch\(\s*[`'"]?\$?\{?\s*(this\.)?(GOOGLE_SCRIPT_URL|GAS_URL)/g)) {
    const window_ = src.slice(m.index, m.index + 300);
    if (/application\/json/.test(window_)) jsonPosters.push(`${f} (near index ${m.index})`);
  }
}
check('no application/json POSTs to Apps Script', jsonPosters.length === 0, jsonPosters.join(', '));

console.log('\n--- config.js points at PRODUCTION, not staging ---');
const cfg = read('js/config.js');
check('GOOGLE_SCRIPT_URL is the prod deployment',
  cfg.includes('AKfycbziZcFyYVVoK4w8jvHEnd0Fi6cD9ZaIGnBwDQc0Dhf1wx7tZ1uWgW8e74O5jR2c8YodGg'),
  'config.js must not ship pointing at the staging deployment');
check('staging URL not left in config.js', !cfg.includes('AKfycbwuh2hrho__RELvXqvSfBYmF61zXwBL76n2W5NNNEf3jZvveCU8B1k-sln9AtMHhFw6Rg'));

console.log('\n--- backend: anon key in Codice.js matches config.js (verification would 401 if drifted) ---');
const codice = read('backend/apps-script/Codice.js');
const keyIn = (s) => (s.match(/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/) || [])[0];
check('anon key identical in both files', keyIn(codice) === keyIn(cfg), 'they have drifted apart');

console.log('\n--- no bootstrap/backdoor left in the backend ---');
check('no BOOTSTRAP key or bootstrap action in Codice.js',
  !/BOOTSTRAP|bootstrapSyncToken|bootstrapDiagnostics/.test(codice));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
