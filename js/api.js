// ═══════════════════════════════════════════════════════════════════════════
// VILTRUM FITNESS - AUTHENTICATED BACKEND CLIENT (V9)
//
// Single door to the Google Apps Script backend. Every data call goes through
// apiPost(), which attaches the caller's Supabase access token.
//
// WHY POST + text/plain (do not "fix" this):
//   Apps Script web apps cannot answer a CORS preflight (there is no doOptions
//   hook), so any request with an Authorization header or Content-Type of
//   application/json is blocked by the browser cross-origin. POST with
//   Content-Type: text/plain is a CORS "simple request" — no preflight — and
//   Apps Script reads the body via e.postData.contents regardless of the type.
//   So the token rides in the body. That also keeps it out of URLs, browser
//   history and Apps Script execution logs, which a ?token= param would not.
//
// NEVER send an `email` field to identify the user. The server ignores it and
// derives identity from the token. Passing one is a bug, not a fallback.
// ═══════════════════════════════════════════════════════════════════════════

import { SUPABASE_URL, GOOGLE_SCRIPT_URL } from './config.js';

// Supabase-js persists the session under sb-<project-ref>-auth-token.
const PROJECT_REF = (() => {
  try {
    return new URL(SUPABASE_URL).hostname.split('.')[0];
  } catch (e) {
    return '';
  }
})();
const SESSION_STORAGE_KEY = `sb-${PROJECT_REF}-auth-token`;

export class AuthError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * Current Supabase access token, or null if not logged in.
 * Prefers the live client (it transparently refreshes an expired token);
 * falls back to the persisted session when the client hasn't booted yet.
 * @return {Promise<string|null>}
 */
export async function getAccessToken() {
  try {
    if (window.supabase && window.supabase.auth && window.supabase.auth.getSession) {
      const { data } = await window.supabase.auth.getSession();
      if (data && data.session && data.session.access_token) {
        return data.session.access_token;
      }
    }
  } catch (e) {
    console.warn('getAccessToken: live client unavailable, falling back', e);
  }

  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return (parsed && parsed.access_token) || null;
  } catch (e) {
    return null;
  }
}

/**
 * Authenticated call to the backend.
 * @param {string} action
 * @param {object} [payload] - extra fields. Do NOT include email or token.
 * @return {Promise<object>} parsed JSON response
 * @throws {AuthError} when there is no session, or the server rejects it
 */
export async function apiPost(action, payload = {}) {
  const token = await getAccessToken();
  if (!token) throw new AuthError('Not logged in');

  const response = await fetch(GOOGLE_SCRIPT_URL, {
    method: 'POST',
    // text/plain keeps this a CORS simple request. See header comment.
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...payload, action, token }),
    redirect: 'follow'
  });

  if (!response.ok) {
    throw new Error(`Backend HTTP ${response.status} for action=${action}`);
  }

  const body = await response.json();

  if (body && body.code === 'unauthorized') {
    // Token rejected — session is dead. Surface it so callers can bounce to login.
    throw new AuthError(body.message || 'Session expired');
  }

  return body;
}

/**
 * Unauthenticated call, for the genuinely public endpoints only
 * (submitQuestionnaire, list-plans). Everything else must use apiPost.
 */
export async function apiPostPublic(action, payload = {}) {
  const response = await fetch(GOOGLE_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...payload, action }),
    redirect: 'follow'
  });
  if (!response.ok) throw new Error(`Backend HTTP ${response.status} for action=${action}`);
  return response.json();
}

// ═══════════════════════════════════════════════════════════════════════════
// ONE-SHOT LEGACY CACHE PURGE
//
// Before V9, the app cached the ENTIRE backend response — every customer's
// email, full name, expiry and nutrition PDF link — into localStorage on each
// user's device. Closing the endpoint does not remove those copies. This does.
//
// It must run exactly once per device: V9 reuses the same cache keys for the
// new single-user payload, so an unguarded purge on every load would wipe the
// legitimate cache too and refetch constantly. The flag makes it idempotent.
//
// Do not remove this until you are confident every install has run it once.
// ═══════════════════════════════════════════════════════════════════════════

const PURGE_FLAG = 'viltrum_v9_legacy_purged';

export function purgeLegacyCaches({ force = false } = {}) {
  try {
    if (!force && localStorage.getItem(PURGE_FLAG) === '1') return false;
    localStorage.removeItem('workoutData');
    localStorage.removeItem('workoutDataTimestamp');
    localStorage.removeItem('viltrum_user_cache');
    sessionStorage.removeItem('viltrum_session_data');
    sessionStorage.removeItem('viltrum_session_timestamp');
    localStorage.setItem(PURGE_FLAG, '1');
    console.log('🧹 V9: purged pre-V9 cached backend data from this device');
    return true;
  } catch (e) {
    console.warn('purgeLegacyCaches failed:', e);
    return false;
  }
}

// Runs on import, before any consumer reads a cache key. Deliberate side
// effect: it guarantees the purge happens on every page that talks to the
// backend, without each one having to remember to call it.
purgeLegacyCaches();

window.ViltrumAPI = { apiPost, apiPostPublic, getAccessToken, purgeLegacyCaches, AuthError };

export default { apiPost, apiPostPublic, getAccessToken, purgeLegacyCaches, AuthError };
