// ═══════════════════════════════════════════════════════════════════════════
// QUESTIONNAIRE BANNER
// Nudges a logged-in user who has not filled the questionnaire yet. The email
// reminders only land if they open their inbox; this catches the ones who go
// straight to the app.
//
// Mounts its own element rather than targeting a container in index.html — the
// same approach update-notifier.js uses. (access-control.js writes into
// #access-status, which does not exist in index.html, so that path renders
// nothing.)
// ═══════════════════════════════════════════════════════════════════════════

import { apiPost } from './api.js';

const DONE_KEY    = 'questionnaireSubmitted';
const SNOOZE_KEY  = 'questionnaireBannerSnoozedUntil';
const SNOOZE_DAYS = 1;

function isSnoozed() {
  const until = localStorage.getItem(SNOOZE_KEY);
  return !!until && Date.now() < Number(until);
}

function snooze() {
  localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000));
}

function render(url) {
  if (document.getElementById('questionnaire-banner')) return;

  const banner = document.createElement('div');
  banner.id = 'questionnaire-banner';
  banner.innerHTML = `
    <div style="
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      background: linear-gradient(135deg, #FFD700, #E6B800);
      color: #000;
      padding: 16px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      box-shadow: 0 -4px 12px rgba(0,0,0,0.35);
      z-index: 99998;
      font-family: 'Staatliches', sans-serif;
      animation: qbSlideUp 0.3s ease;
    ">
      <div style="flex: 1;">
        <div style="font-size: 18px; font-weight: bold; margin-bottom: 4px;">
          IL TUO PIANO TI ASPETTA
        </div>
        <div style="font-size: 14px; opacity: 0.85;">
          Compila il questionario (2 minuti) e il coach cuce il piano su di te.
        </div>
      </div>
      <a id="qb-cta" href="${url}" style="
        padding: 10px 24px;
        background: #000;
        color: #FFD700;
        border: none;
        border-radius: 8px;
        font-size: 16px;
        font-weight: bold;
        font-family: 'Staatliches', sans-serif;
        cursor: pointer;
        letter-spacing: 1px;
        margin-left: 15px;
        text-decoration: none;
        white-space: nowrap;
      ">COMPILA ORA</a>
      <button id="qb-close" aria-label="Chiudi" style="
        padding: 8px;
        background: transparent;
        color: #000;
        border: 1px solid rgba(0,0,0,0.4);
        border-radius: 6px;
        font-size: 20px;
        cursor: pointer;
        margin-left: 10px;
        width: 36px;
        height: 36px;
        line-height: 1;
      ">×</button>
    </div>
    <style>
      @keyframes qbSlideUp {
        from { transform: translateY(100%); opacity: 0; }
        to   { transform: translateY(0); opacity: 1; }
      }
      #qb-cta:hover { transform: scale(1.05); }
      #qb-close:hover { background: rgba(0,0,0,0.12); }
    </style>
  `;

  document.body.appendChild(banner);

  // Dismiss snoozes rather than suppresses forever: they still owe us the
  // questionnaire, and the server-side reminder cap is what stops the nagging.
  document.getElementById('qb-close').addEventListener('click', () => {
    snooze();
    banner.remove();
  });
}

export async function initQuestionnaireBanner() {
  try {
    // Once submitted the answer can never flip back, so a local flag saves a
    // backend round-trip on every single app open.
    if (localStorage.getItem(DONE_KEY) === 'true') return;
    if (isSnoozed()) return;

    const res = await apiPost('getQuestionnaireStatus', {});
    if (!res || res.status !== 'success') return;

    if (res.submitted) {
      localStorage.setItem(DONE_KEY, 'true');
      return;
    }
    if (res.url) render(res.url);
  } catch (e) {
    // Logged out, offline, or backend down. The banner is a nudge, never a
    // reason to interfere with the app loading.
    console.debug('questionnaire banner skipped:', e && e.message);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => setTimeout(initQuestionnaireBanner, 1500));
} else {
  setTimeout(initQuestionnaireBanner, 1500);
}
