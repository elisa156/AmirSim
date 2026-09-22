/* ============================================================
   Vocab SRS — Anki-style spaced repetition for Amirnet-sim.
   Two decks:
     · 'common'  — COMMON_WORDS (NAWL + NGSL 2000/3000, researched lists)
     · 'mine'    — words the user double-clicked anywhere in the app
   SRS model (simplified SM-2):
     each card: { en, he, ex, ease, interval(d), due(ts), lapses, reps }
     again  → interval 0 (today), ease -0.2 (min 1.3), lapses++
     hard   → interval ×1.2, ease -0.05
     good   → interval ×ease (first success: 1d → 3d)
     easy   → interval ×ease×1.3 (first success: 2d)
   Due cards first, then new cards (bounded per session).
   All state persists in localStorage (amirnetsim.vocab.v1).
   ============================================================ */

const VOCAB_SRS_KEY = 'amirnetsim.vocab.v1';
const GEMINI_KEY_STORE = 'amirnetsim.gemini.key';

function loadSRS() {
  try { return JSON.parse(localStorage.getItem(VOCAB_SRS_KEY) || 'null') || freshSRS(); }
  catch (e) { return freshSRS(); }
}
function freshSRS() {
  return {
    cards: {},            // en -> {en, he, ex, ease, interval, due, lapses, reps, deck}
    key: '',              // Gemini API key (user-provided)
    log: []               // [{d: date, right, wrong}] for the progress screen
  };
}
function saveSRS(s) { localStorage.setItem(VOCAB_SRS_KEY, JSON.stringify(s)); }

function srsAddWord(en, opts) {
  const s = loadSRS();
  en = (en || '').trim().toLowerCase();
  if (!en || s.cards[en]) return false;
  s.cards[en] = {
    en, he: (opts && opts.he) || '', ex: (opts && opts.ex) || '',
    deck: (opts && opts.deck) || 'mine',
    ease: 2.5, interval: 0, due: 0, lapses: 0, reps: 0
  };
  saveSRS(s);
  return true;
}

function srsDueList(deck, limitNew) {
  const s = loadSRS();
  const now = Date.now();
  const all = Object.values(s.cards).filter(c => !deck || c.deck === deck || deck === 'all');
  const due = all.filter(c => c.due <= now && c.reps > 0);
  const fresh = all.filter(c => c.reps === 0);
  due.sort((a, b) => a.due - b.due);
  return due.concat(fresh.slice(0, limitNew == null ? 12 : limitNew));
}
/* alias used by app.js — same semantics, named like the concept */
function srsDue(deck, limitNew) { return srsDueList(deck, limitNew); }

function srsGrade(en, grade) {   // grade: 0 again | 1 hard | 2 good | 3 easy
  const s = loadSRS();
  const c = s.cards[en];
  if (!c) return;
  const DAY = 86400000;
  c.reps++;
  if (c.reps === 1) {           // first successful review sets the base interval
    if (grade === 0) { c.interval = 0; c.lapses++; c.ease = Math.max(1.3, c.ease - 0.2); }
    else if (grade === 1) c.interval = 1;
    else if (grade === 2) c.interval = 1;
    else c.interval = 2;
  } else {
    if (grade === 0) { c.interval = 0; c.lapses++; c.ease = Math.max(1.3, c.ease - 0.2); }
    else {
      if (grade === 1) c.ease = Math.max(1.3, c.ease - 0.05);
      if (grade === 3) c.ease = Math.min(3.2, c.ease + 0.1);
      const mult = grade === 1 ? 1.2 : grade === 3 ? c.ease * 1.3 : c.ease;
      c.interval = Math.max(1, Math.round(c.interval * mult));
    }
  }
  c.due = Date.now() + (c.interval === 0 ? 6 * 3600000 : c.interval * DAY); // again = 6h
  /* session log for the progress screen */
  const today = new Date().toLocaleDateString('he-IL');
  const last = s.log[s.log.length - 1];
  if (last && last.d === today) { last.n++; if (grade === 0) last.wrong++; }
  else s.log.push({ d: today, n: 1, wrong: grade === 0 ? 1 : 0 });
  if (s.log.length > 120) s.log = s.log.slice(-120);
  saveSRS(s);
}

/* ---------- Gemini translation (user key, cached) ---------- */
const HE_CACHE_KEY = 'amirnetsim.hecache.v1';
function heCache() {
  try { return JSON.parse(localStorage.getItem(HE_CACHE_KEY) || '{}'); }
  catch (e) { return {}; }
}
function heCacheSave(c) { localStorage.setItem(HE_CACHE_KEY, JSON.stringify(c)); }

/* model fallback chain — Google retires models; try newest first */
const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.0-flash'];
/* live model list from Google with the user's key — self-heals retired models */
async function fetchAvailableModels(key) {
  try {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?key=' + encodeURIComponent(key) + '&pageSize=100');
    if (!r.ok) return null;
    const j = await r.json();
    const names = (j.models || []).map(m => (m.name || '').replace('models/', ''));
    /* prefer flash (fast, cheap) non-experimental chat models */
    const score = m => {
      let s = 0;
      if (/flash/.test(m)) s += 10;
      if (/exp|preview|thinking|lite/.test(m)) s -= 2;
      if (/vision|embed|aqa|image|audio|tts|veo|imagen/.test(m)) s -= 10;
      if (/2\.5/.test(m)) s += 3;
      if (/2\.0/.test(m)) s += 1;
      return s;
    };
    return names.filter(m => srsChatCandidate(m)).sort((a, b) => score(b) - score(a));
  } catch (e) { return null; }
}
function srsChatModel(m) {
  return /generateContent/.test(m) || true;   // list returns generateContent-capable by default
}
async function pickLiveModels(key) {
  const list = await fetchAvailableModels(key);
  if (list && list.length) {
    const chat = list.filter(m => !/embed|vision|aqa|image|audio|tts|veo|imagen|guard|rerank|retriever/.test(m));
    if (chat.length) return chat.slice(0, 4);
  }
  return null;
}
let lastGeminiError = '';

async function geminiCall(prompt) {
  const key = (localStorage.getItem(GEMINI_KEY_STORE) || '').trim();
  if (!key) { lastGeminiError = 'no key'; return null; }
  let lastErr = '';
  const savedModel = localStorage.getItem('amirnetsim.gemini.model');
  const chain = savedModel ? [savedModel, ...GEMINI_MODELS] : GEMINI_MODELS;
  for (const model of [...new Set(chain)]) {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + encodeURIComponent(key);
    try {
      const r = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      if (r.ok) {
        const j = await r.json();
        const parts = (((j.candidates || [])[0] || {}).content || {}).parts || [];
        const text = parts.map(p => p.text || '').join('').trim();
        if (text) { localStorage.setItem('amirnetsim.gemini.model', model); return text; }
        lastErr = 'empty response';
        continue;
      }
      try { const ej = await r.json(); lastErr = ((ej.error || {}).message || '').slice(0, 110); }
      catch (e) { lastErr = 'HTTP ' + r.status; }
      /* 404/400 model-gone → try next model; 4xx key problems → stop early */
      if (r.status === 400 && /API key not valid|API_KEY_INVALID/i.test(lastErr)) { lastGeminiError = lastErr; return null; }
    } catch (e) { lastErr = String(e).slice(0, 110); }
  }
  lastGeminiError = lastErr;
  return null;
}

async function fetchHebrew(word) {
  lastGeminiError = '';
  const cache = heCache();
  if (cache[word]) return cache[word];
  const text = await geminiCall(
    'Translate the English word "' + word + '" to Hebrew. Reply ONLY with compact JSON: ' +
    '{"he":"תרגומים מובילים, מופרדים בפסיק","ex":"a very short English example sentence using the word"}');
  if (!text) return null;
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[0].replace(/```json|```/g, '').trim());
    if (!parsed.he) return null;
    cache[word] = { he: parsed.he, ex: parsed.ex || '' };
    heCacheSave(cache);
    return cache[word];
  } catch (e) { return null; }
}

/* ensure a card has a Hebrew face before showing it (best effort, non-blocking UI) */
function srsEnsureHebrew(card) {
  if (card.he) return Promise.resolve(card);
  /* 1) bundled gloss (offline, instant) */
  if (typeof COMMON_HE !== 'undefined' && COMMON_HE[card.en]) {
    card.he = COMMON_HE[card.en];
    const s0 = loadSRS();
    if (s0.cards[card.en] && !s0.cards[card.en].he) { s0.cards[card.en].he = card.he; saveSRS(s0); }
    return Promise.resolve(card);
  }
  /* 2) Gemini (user key, cached) */
  return fetchHebrew(card.en).then(got => {
    if (got && got.he) {
      const s = loadSRS();
      if (s.cards[card.en]) { s.cards[card.en].he = got.he; if (got.ex) s.cards[card.en].ex = got.ex; saveSRS(s); }
      card.he = got.he; if (got.ex) card.ex = got.ex;
    }
    return card;
  });
}