/* providers: Gemini (Google) and OpenAI-compatible (GPT) — user key picks one */
const PROVIDERS = {
  gemini: { keyPrefix: 'AIza', models: ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.0-flash'] }
};
function activeProvider() {
  return localStorage.getItem('amirnetsim.ai.provider') || 'gemini';
}
function setActiveProvider(p) { localStorage.setItem('amirnetsim.ai.provider', p); }

/* ============================================================
   Part 2 of the vocab upgrade — the browse list + drill UI override.
   Appended to vocab-ui.js as a second module (keeps files small).
   ============================================================ */

/* ---------- MyMemory free translation (no key) + layered ensure ---------- */
const MYMEMORY_URL = 'https://api.mymemory.translated.net/get?q=WORD&langpair=en|he';
async function myMemoryTranslate(word) {
  const cache = heCache();
  if (cache[word] && cache[word].manual) return cache[word];   // user translation wins
  if (cache[word]) return cache[word];
  try {
    const r = await fetch(MYMEMORY_URL.replace('WORD', encodeURIComponent(word)));
    if (!r.ok) return null;
    const j = await r.json();
    const he = j.responseData && j.responseData.translatedText;
    if (!he || !/[\u0590-\u05FF]/.test(he)) {
      /* quota exhausted → stop the batch so we don't hammer an empty bucket */
      if (/MYMEMORY WARNING|ALL AVAILABLE FREE/i.test(he || '')) window.__mymemoryQuotaDone = true;
      return null;
    }
    cache[word] = { he: he.trim(), ex: '' };
    heCacheSave(cache);
    return cache[word];
  } catch (e) { return null; }
}
/* override: bundled gloss → MyMemory (auto, keyless) → Gemini (optional key) */
function srsEnsureHebrew(card) {
  if (card.he && card.manual) return Promise.resolve(card);
  if (card.he) return Promise.resolve(card);
  if (typeof COMMON_HE !== 'undefined' && COMMON_HE[card.en]) {
    card.he = COMMON_HE[card.en];
    const s0 = loadSRS();
    if (s0.cards[card.en] && !s0.cards[card.en].he) { s0.cards[card.en].he = card.he; saveSRS(s0); }
    return Promise.resolve(card);
  }
  return myMemoryTranslate(card.en).then(mm => {
    if (mm && mm.he) {
      card.he = mm.he;
      const s = loadSRS();
      if (s.cards[card.en] && !s.cards[card.en].he) { s.cards[card.en].he = mm.he; saveSRS(s); }
      return card;
    }
    return fetchHebrew(card.en).then(got => {
      if (got && got.he) {
        card.he = got.he; if (got.ex) card.ex = got.ex;
        const s = loadSRS();
        if (s.cards[card.en]) { s.cards[card.en].he = got.he; if (got.ex) s.cards[card.en].ex = got.ex; saveSRS(s); }
      } else if (lastGeminiError && lastGeminiError !== 'no key') {
        showAiErrorToast(lastGeminiError);
      }
      return card;
    });
  });
}

/* ---------- browse screen: list per deck with ✓/✗ ---------- */
/* memory stage per card: 0-1 reviews = needs work, 2-4 = almost, 5+ or long interval = excellent */
function memoryStage(en) {
  const c = loadSRS().cards[en];
  if (!c || !c.reps) return { label: 'חדשה', color: 'var(--muted)' };
  if (c.lapses > 0 && c.streak === 0) return { label: 'דורשת חזרה', color: '#c0392b' };
  if ((c.interval || 0) >= 7 || (c.streak || 0) >= 5) return { label: 'יודעת מצוין', color: 'var(--green)' };
  if ((c.streak || 0) >= 2) return { label: 'כמעט — עוד קצת', color: '#c9a227' };
  return { label: 'דורשת חזרה', color: '#c0392b' };
}

function openDeckBrowser(deck) {
  const words = deckWords(deck);
  const marks = selfmarkStore();
  const srs = loadSRS();
  const rows = words.map(w => {
    const m = marks[w.en] || '';
    const c = srs.cards[w.en];
    const he = (c && c.he) || (typeof COMMON_HE !== 'undefined' && COMMON_HE[w.en]) || '';
    const st = memoryStage(w.en);
    return '<tr data-w="' + w.en + '">' +
      '<td dir="ltr">' + w.en + '</td>' +
      '<td dir="rtl">' + (he || '<i style="color:var(--muted)">—</i>') + '</td>' +
      '<td><span style="color:' + st.color + ';font-size:12.5px">' + st.label + '</span></td>' +
      '<td style="text-align:center;white-space:nowrap">' +
        '<button class="icon-btn" data-mark="know" style="border:1px solid ' + (m === 'know' ? 'var(--green)' : 'var(--line)') + ';color:' + (m === 'know' ? 'var(--green)' : 'var(--ink)') + ';border-radius:4px;padding:2px 10px;cursor:pointer;margin-inline-end:4px">✓</button>' +
        '<button class="icon-btn" data-mark="review" style="border:1px solid ' + (m === 'review' ? '#c0392b' : 'var(--line)') + ';color:' + (m === 'review' ? '#c0392b' : 'var(--ink)') + ';border-radius:4px;padding:2px 10px;cursor:pointer;margin-inline-end:4px">↻</button>' +
        '<button class="icon-btn" data-edit="' + w.en + '" title="ערוך תרגום ידנית" style="border:1px solid var(--line);border-radius:4px;padding:2px 10px;cursor:pointer;color:var(--link-blue)">✎</button>' +
      '</td></tr>';
  }).join('');
  const box = $$('vocab-choices');
  const note = $$('vocab-hint');
  $$('vocab-word').textContent = 'רשימת המילים';
  note.innerHTML = '<div dir="rtl"><b>' + (deck === 'common' ? 'מילים נפוצות' : 'המילים שסימנתי') + '</b> (' + words.length + ' מילים) — סמני ✓ = יודעת בטח · ↻ = מעדיפה לחזור. המצב לפי הזיכרון מתעדכן אוטומטית.</div>' +
    '<div style="max-height:380px;overflow:auto;margin-top:8px"><table style="width:100%"><thead><tr><th>מילה</th><th>תרגום</th><th>מעמד</th><th>יודעת?</th></tr></thead><tbody>' +
    rows + '</tbody></table></div>' +
    '<div style="margin-top:10px"><button class="icon-btn" id="btn-browse-back" style="border:1px solid var(--line);border-radius:4px;padding:6px 14px;cursor:pointer;color:var(--ink)">↩ חזרה לאימון</button></div>';
  box.innerHTML = '';
  $$('vocab-progress').textContent = '';
  $$('vocab-grade').style.display = 'none';
  $$('btn-browse-back').onclick = () => startVocab(deck);
  /* MARK ACTIONS v2: ✓/↻ now actually drive the memory scheduler (SRS) */
  document.querySelectorAll('[data-mark]').forEach(btn => {
    btn.onclick = () => {
      const en = btn.closest('tr').dataset.w;
      const cur = selfmarkStore()[en] || '';
      const next = btn.dataset.mark === cur ? '' : btn.dataset.mark;
      selfmarkSet(en, next);
      /* drive the SRS: ✓ = knows it (easy → long interval), ↻ = wants review (again → due soon) */
      if (typeof srsGrade === 'function' && typeof srsHasCard === 'function' ? true : true) {
        const card = (loadSRS().cards || {})[en];
        if (card) {
          if (next === 'know') srsGrade(en, 3);        /* easy */
          else if (next === 'review') srsGrade(en, 0); /* again */
          else { /* cleared: reset to neutral */ srsGrade(en, 2); }
        } else if (next) {
          /* not yet in the deck — add it, then grade */
          if (typeof srsAddWord === 'function') srsAddWord(en, { deck: 'mine' });
          srsGrade(en, next === 'know' ? 3 : 0);
        }
      }
      /* visual refresh of this row's buttons */
      const row = btn.closest('tr');
      row.querySelectorAll('[data-mark]').forEach(b => {
        const active = b.dataset.mark === next;
        b.style.borderColor = active ? (b.dataset.mark === 'know' ? 'var(--green)' : '#c0392b') : 'var(--line)';
        b.style.color = active ? (b.dataset.mark === 'know' ? 'var(--green)' : '#c0392b') : 'var(--ink)';
      });
      /* visible feedback: stage label in the row updates + a short toast */
      const stCell = row.children[2];
      if (typeof memoryStage === 'function') {
        const s = loadSRS().cards[en] || {};
        const stage = memoryStage(en);
        stCell.innerHTML = '<span style="color:' + stage.color + ';font-size:12.5px">' + stage.label + '</span>';
      }
      const t = document.createElement('div');
      t.textContent = next === 'know' ? '✓ נשמר — תוזכרי בעוד ימים רבים' :
                      next === 'review' ? '↻ תחזור לחזרה בקרוב' : 'סימון הוסר';
      t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#2a3238;color:#fff;padding:8px 18px;border-radius:6px;font-size:13px;z-index:2000;direction:rtl;opacity:.95';
      document.body.appendChild(t);
      setTimeout(() => t.remove(), 1800);
    };
  });
}

/* drill direction selector UI (EN→HE / HE→EN / mix) */
function drillDirButtons() {
  const cur = drillDir();
  const opt = (id, label) => '<button class="icon-btn" data-dir="' + id + '" style="border:1px solid ' + (cur === id ? 'var(--link-blue)' : 'var(--line)') + ';color:' + (cur === id ? 'var(--link-blue)' : 'var(--ink)') + ';border-radius:4px;padding:4px 12px;cursor:pointer;font-size:12.5px">' + label + '</button>';
  return '<div style="display:flex;gap:6px;margin:8px 0;flex-wrap:wrap" id="drill-dirs">' +
    opt('en2he', 'אנגלית → עברית') + opt('he2en', 'עברית → אנגלית') + opt('mix', 'ערבוב') + '</div>';
}
document.addEventListener('click', e => {
  const d = e.target.closest('[data-dir]');
  if (d) { setDrillDir(d.dataset.dir); startVocab(S.vocab ? S.vocab.deck : 'common'); }
});

/* pick this card's direction (respects 'mix') */
function pickDir() {
  const d = drillDir();
  if (d === 'mix') return Math.random() < 0.5 ? 'en2he' : 'he2en';
  return d;
}

/* ---------- deck model ---------- */
function deckWords(deck) {
  if (deck === 'common') return COMMON_WORDS.map(w => ({ en: w.en, band: w.band }));
  if (deck === 'lapses') {
    const sims = (typeof loadSims === 'function') ? loadSims() : [];
    const seen = new Set(); const out = [];
    sims.forEach(x => (x.questions || []).forEach(q => {
      if (q.ok === false && Array.isArray(q.hardWords)) q.hardWords.forEach(w => {
        if (w && !seen.has(w)) { seen.add(w); out.push({ en: w, band: 'lapse' }); }
      });
    }));
    return out;
  }
  const s = loadSRS();
  return Object.values(s.cards).filter(c => c.deck === 'mine').map(c => ({ en: c.en, band: 'mine' }));
}

/* self-assessment: 'know' (✓) / 'review' (✗) — per word, persisted */
function selfmarkStore() {
  try { return JSON.parse(localStorage.getItem('amirnetsim.selfmark.v1') || '{}'); }
  catch (e) { return {}; }
}
function selfmarkSet(en, mark) {
  const m = selfmarkStore();
  if (mark) m[en] = mark; else delete m[en];
  localStorage.setItem('amirnetsim.selfmark.v1', JSON.stringify(m));
}

/* drill direction: 'en2he' | 'he2en' | 'mix' — persisted */
function drillDir() { return localStorage.getItem('amirnetsim.drilldir') || 'mix'; }
function setDrillDir(d) { localStorage.setItem('amirnetsim.drilldir', d); }

/* pick this card's direction (respects 'mix') */
function pickDir() {
  const d = drillDir();
  if (d === 'mix') return Math.random() < 0.5 ? 'en2he' : 'he2en';
  return d;
}

/* drill direction selector UI */
function drillDirButtons() {
  const cur = drillDir();
  const opt = (id, label) => '<button class="icon-btn" data-dir="' + id + '" style="border:1px solid ' + (cur === id ? 'var(--link-blue)' : 'var(--line)') + ';color:' + (cur === id ? 'var(--link-blue)' : 'var(--ink)') + ';border-radius:4px;padding:4px 12px;cursor:pointer;font-size:12.5px">' + label + '</button>';
  return '<div style="display:flex;gap:6px;margin:8px 0;flex-wrap:wrap" id="drill-dirs">' +
    opt('en2he', 'אנגלית → עברית') + opt('he2en', 'עברית → אנגלית') + opt('mix', 'ערבוב') + '</div>';
}
document.addEventListener('click', e => {
  const d = e.target.closest('[data-dir]');
  if (d) { setDrillDir(d.dataset.dir); startVocab(S.vocab ? S.vocab.deck : 'common'); }
});


/* ---------- AI-generated questions for marked words (Gemini/OpenAI-compatible) ---------- */
async function aiGenerateWordQuestion(word, he) {
  const key = (localStorage.getItem(GEMINI_KEY_STORE) || '').trim();
  if (!key) return null;
  const prompt =
    'Create ONE multiple-choice vocabulary question in English about the word "' + word + '" ' +
    (he ? '(Hebrew meaning: ' + he + '). ' : '') +
    'Choose ONE of these formats at random: (a) fill-in-the-blank sentence with 4 options, ' +
    '(b) synonym question with 4 options, (c) definition question with 4 options. ' +
    'Reply ONLY with compact JSON: {"stem":"...","options":["","","",""],"answer":0}. ' +
    'The stem must be in English, options short, exactly one clearly correct.';
  const text = await geminiCall(prompt);
  if (!text) return null;
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const p = JSON.parse(m[0].replace(/```json|```/g, '').trim());
    if (!p.stem || !Array.isArray(p.options) || p.options.length !== 4 || p.answer == null) return null;
    return p;
  } catch (e) { return null; }
}

/* background batch translation: fills the he-cache for words missing a gloss.
   Staggered (one every 300ms) to stay polite to the free API. Runs silently. */
let batchRunning = false;
function batchTranslateDeck() {
  if (batchRunning) return;
  batchRunning = true;
  const missing = COMMON_WORDS.filter(w => {
    if (typeof COMMON_HE !== 'undefined' && COMMON_HE[w.en]) return false;
    return !heCache()[w.en];
  }).map(w => w.en);
  let i = 0;
  const tick = setInterval(() => {
    if (i >= missing.length || window.myMemoryQuotaDone) { clearInterval(tick); batchRunning = false; return; }
    myMemoryTranslate(missing[i]).then(mm => {
      if (!mm) {
        /* probe: if quota is gone, mark and stop the whole batch */
        fetch(MYMEMORY_URL.replace('WORD', 'test')).then(r => r.json()).then(j => {
          const t = j.responseData && j.responseData.translatedText;
          if (t && /MYMEMORY WARNING|ALL AVAILABLE FREE/i.test(t)) window.myMemoryQuotaDone = true;
        }).catch(() => {});
      }
    }).catch(() => {});
    i++;
  }, 350);
}
/* kick off shortly after load, quietly */
setTimeout(batchTranslateDeck, 3000);


/* ---------- AI definition + example (on demand only) ---------- */
document.addEventListener('click', async e => {
  if (e.target.id !== 'btn-ai-define') return;
  const v = S.vocab;
  if (!v || !v.cur) return;
  const out = document.getElementById('vocab-ai-out');
  if (!out) return;
  const key = (localStorage.getItem(GEMINI_KEY_STORE) || '').trim();
  if (!key) { out.innerHTML = '<div dir="rtl" style="color:var(--muted)">להגדרה מה-AI דרוש מפתח Gemini — פתחי את ״מפתח Gemini API‏” למטה. (התרגום הרגיל עובד בלי זה.)</div>'; return; }
  out.innerHTML = '⏳ מבקשת הגדרה ודוגמה…';
  const txt = await geminiCall('Explain the English word "' + v.cur.en + '" for an ESL student. Reply ONLY with compact JSON: {"def":"הגדרה קצרה בעברית","ex":"short English example sentence using the word"}');
  let p = null;
  if (txt) { try { p = JSON.parse(txt.match(/\{[\s\S]*\}/)[0].replace(/```json|```/g, '').trim()); } catch (err) {} }
  out.innerHTML = (p && (p.he || p.def))
    ? '<div dir="rtl"><b>הגדרה:</b> ' + (p.he || p.def) + '</div><div dir="ltr" style="color:var(--muted);margin-top:4px">' + (p.ex || '') + '</div>'
    : '<span style="color:var(--muted)">לא התקבלה תשובה — נסי שוב בעוד רגע.</span>';
});


/* AI batch translation: one request covers 40 words. Used when MyMemory quota
   is exhausted (or immediately if an AI key exists). */
async function aiBatchTranslate(words) {
  const key = (localStorage.getItem(GEMINI_KEY_STORE) || '').trim();
  if (!key || !words.length) return 0;
  const CHUNK = 40;
  let done = 0;
  for (let i = 0; i < words.length; i += CHUNK) {
    const chunk = words.slice(i, i + CHUNK);
    const prompt = 'Translate each English word to Hebrew (single best translation). ' +
      'Reply ONLY with compact JSON: {"t":{"word":"hebrew","word2":"hebrew2",...}}. Words: ' +
      JSON.stringify(chunk);
    const txt = await geminiCall(prompt);
    let map = null;
    if (txt) {
      try { map = JSON.parse(txt.match(/\{[\s\S]*\}/)[0].replace(/```json|```/g, '').trim()).t; } catch (e) {}
    }
    if (map) {
      const cache = heCache();
      chunk.forEach(w => {
        const he = map[w];
        if (he && /[\u0590-\u05FF]/.test(he)) {
          cache[w] = { he: he.trim(), ex: '' };
          done++;
        }
      });
      heCacheSave(cache);
    }
  }
  return done;
}

/* batchTranslateDeck upgraded: MyMemory first (if quota), then AI for the rest */
const _origBatch = batchTranslateDeck;
batchTranslateDeck = function () {
  if (batchRunning) return;
  batchRunning = true;
  const missing = COMMON_WORDS.filter(w => {
    if (typeof COMMON_HE !== 'undefined' && COMMON_HE[w.en]) return false;
    return !heCache()[w.en];
  }).map(w => w.en);
  if (!missing.length) { batchRunning = false; return; }
  /* try the first word on MyMemory; if the quota is gone → switch to AI bulk */
  myMemoryTranslate(missing[0]).then(first => {
    if (first) {
      let i = 1;
      const tick = setInterval(() => {
        if (i >= missing.length || window.myMemoryQuotaDone) {
          clearInterval(tick); batchRunning = false;
          /* leftover words → AI if a key exists */
          const rest = missing.slice(i).filter(w => !heCache()[w]);
          if (rest.length) aiBatchTranslate(rest);
          return;
        }
        myMemoryTranslate(missing[i]).catch(() => {});
        i++;
      }, 350);
    } else {
      /* MyMemory unavailable (quota) → translate everything via AI */
      aiBatchTranslate(missing).then(n => { batchRunning = false; });
    }
  });
};


/* ---------- manual translation editing (user request) ---------- */
/* user translation is authoritative: stored in the he-cache under 'manual:true'
   and never overwritten by MyMemory/Gemini */
function isManualHe(en) {
  const c = heCache()[en];
  return !!(c && c.manual);
}
function saveManualHe(en, he) {
  const cache = heCache();
  if (he.trim() === '') {
    /* empty input → remove the manual override entirely */
    if (cache[en] && cache[en].manual) delete cache[en];
  } else {
    cache[en] = { he: he.trim(), ex: '', manual: true };
  }
  heCacheSave(cache);
  /* sync the SRS card too so drills see it instantly */
  const s = loadSRS();
  if (s.cards[en] && he.trim() !== '') { s.cards[en].he = he.trim(); saveSRS(s); }
  /* refresh the card's he if it's the current card */
  if (S.vocab && S.vocab.cur && S.vocab.cur.en === en) S.vocab.cur.he = he.trim() || S.vocab.cur.he;
}
function editTranslation(en, cellTd) {
  const cur = (() => {
    const cc = loadSRS().cards[en];
    return (cc && cc.he) || (typeof COMMON_HE !== 'undefined' && COMMON_HE[en]) || (heCache()[en] && heCache()[en].he) || '';
  })();
  cellTd.innerHTML =
    '<div style="display:flex;gap:6px;align-items:center">' +
    '<input id="manual-he-input" dir="rtl" value="' + cur.replace(/"/g, '&quot;') + '" placeholder="תרגום שלך…" ' +
    'style="flex:1;min-width:130px;padding:6px 10px;border:1px solid var(--link-blue);border-radius:4px;font:14px var(--sans);background:var(--frame-inner);color:var(--ink)">' +
    '<button class="icon-btn" id="manual-he-save" style="background:var(--green);color:#fff;border:0;border-radius:4px;padding:6px 12px;cursor:pointer">שמירה</button>' +
    '<button class="icon-btn" id="manual-he-cancel" style="border:1px solid var(--line);border-radius:4px;padding:6px 12px;cursor:pointer;color:var(--muted)">ביטול</button>' +
    '</div>';
  const inp = document.getElementById('manual-he-input');
  inp.focus(); inp.select();
  document.getElementById('manual-he-save').onclick = () => {
    saveManualHe(en, inp.value);
    renderRowBack(en, cellTd);
  };
  document.getElementById('manual-he-cancel').onclick = () => renderRowBack(en, cellTd);
  inp.onkeydown = e => {
    if (e.key === 'Enter') { saveManualHe(en, inp.value); renderRowBack(en, cellTd); }
    if (e.key === 'Escape') renderRowBack(en, cellTd);
  };
}
function renderRowBack(en, cellTd) {
  const c = loadSRS().cards[en];
  const he = (c && c.he) || (typeof COMMON_HE !== 'undefined' && COMMON_HE[en]) || (heCache()[en] && heCache()[en].he) || '';
  const mark = isManualHe(en) ? ' <span style="color:var(--link-blue);font-size:11px" title="תרגום ידני">✎</span>' : '';
  cellTd.innerHTML = '<div dir="rtl">' + (he || '<i style="color:var(--muted)">—</i>') + mark + '</div>';
}
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-edit]');
  if (!btn) return;
  const en = btn.dataset.edit;
  editTranslation(en, btn.closest('tr').querySelector('td:nth-child(2)'));
});


/* on first successful AI connect: batch-translate every word still missing */
async function autoTranslateAfterConnect() {
  const missing = COMMON_WORDS.filter(w => {
    if (typeof COMMON_HE !== 'undefined' && COMMON_HE[w.en]) return false;
    return !heCache()[w.en];
  }).map(w => w.en);
  const note = document.getElementById('gemini-note');
  const report = (msg) => { if (note) note.textContent = msg; };
  if (!missing.length) { report('✓ המפתח פעיל — כל המילים כבר מתורגמות.'); return; }
  report('🔄 מתרגם ' + missing.length + ' מילים חסרות בעזרת ה-AI…');
  const done = await aiBatchTranslate(missing);
  report(done > 0
    ? '✓ תורגמו ' + done + ' מילים חדשות — הרשימה עודכנה.'
    : '⚠ לא הצלחתי לתרגם עכשיו — נסי שוב מאוחר יותר (רענון עמוד).');
}
window.autoTranslateAfterConnect = autoTranslateAfterConnect;
/* ============ Amirnet-style AI question generator ============ */
const AI_QUIZ = { deck: 'common', stage: 'all', count: 5 };

function aiQuizPanel() {
  const deckOpts = [['common', 'מילים נפוצות (NAWL)'], ['mine', 'המילים שסימנתי'], ['lapses', 'מילים משאלות שטעיתי']];
  const stages = [['all', 'כל הרמות'], ['needs', 'דורשת חזרה'], ['almost', 'כמעט — עוד קצת'], ['great', 'יודעת מצוין']];
  const counts = [['5', '5 שאלות'], ['10', '10 שאלות'], ['15', '15 שאלות']];
  const optsFor = (id) => id === 'qdeck' ? deckOpts : id === 'qstage' ? stages : counts;
  const sel = (id, label) => {
    const cur = id === 'qdeck' ? AI_QUIZ.deck : id === 'qstage' ? AI_QUIZ.stage : String(AI_QUIZ.count);
    return '<div style="display:flex;flex-direction:column;gap:4px;min-width:170px">' +
      '<span dir="rtl" style="font-size:12px;color:var(--muted)">' + label + '</span>' +
      '<select id="' + id + '" style="padding:6px 10px;border:1px solid var(--line);border-radius:4px;background:var(--frame-inner);color:var(--ink);font-size:13px">' +
      optsFor(id).map(function(p){ return '<option value="' + p[0] + '"' + (p[0] === cur ? ' selected' : '') + '>' + p[1] + '</option>'; }).join('') +
      '</select></div>';
  };
  return '<div dir="rtl" style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin:10px 0">' +
    sel('qdeck', 'מאיזו חפיסה?') + sel('qstage', 'רמת זיכרון?') + sel('qcount', 'כמה שאלות?') +
    '<button class="icon-btn" id="btn-ai-go" style="background:var(--link-blue);color:#fff;border:0;border-radius:4px;padding:8px 18px;cursor:pointer;font-weight:600">צרי שאלות</button>' +
    '</div><div id="ai-quiz-out" dir="rtl"></div>';
}

function wordsForQuiz(deck, stage) {
  let words = deckWords(deck);
  if (stage !== 'all') {
    const filtered = words.filter(function(w) {
      const st = memoryStage(w.en);
      if (stage === 'needs') return st.label === 'דורשת חזרה' || st.label === 'חדשה';
      if (stage === 'almost') return st.label === 'כמעט — עוד קצת';
      return st.label === 'יודעת מצוין';
    });
    if (filtered.length) words = filtered;
  }
  return words;
}

async function aiMakeAmirnetQuestion(word, he, typeIdx) {
  var prompts = [
    'Create ONE Amirnet-style SENTENCE COMPLETION question for the word "' + word + '" (Hebrew meaning: ' + (he || '?') + '). An academic English sentence with the word replaced by ______ . Reply ONLY compact JSON {"stem":"sentence with ______ inside","options":["a","b","c","d"],"answer":0} — exactly 4 short options, one correct.',
    'Create ONE Amirnet-style RESTATE question for "' + word + '" (meaning: ' + (he || '') + '). Stem: a short sentence containing the word. Options: 4 sentences, exactly ONE restates the stem with the same meaning. Reply ONLY compact JSON {"stem":"...","options":["s1","s2","s3","s4"],"answer":0}.',
    'Create ONE synonym question for "' + word + '" (meaning: ' + (he || '') + '). Stem: "Closest in meaning to the word: ' + word + '". Options: 4 English words/phrases, one synonym. Reply ONLY compact JSON {"stem":"...","options":["w1","w2","w3","w4"],"answer":0}.'
  ];
  const txt = await geminiCall(prompts[typeIdx % 3]);
  if (!txt) return null;
  try {
    const cleaned = txt.replace(/```json|```/g, '').trim();
    const p = JSON.parse(cleaned.match(/\{[\s\S]*\}/)[0]);
    if (!p.stem || !Array.isArray(p.options) || p.options.length !== 4 || p.answer == null) return null;
    return p;
  } catch (e) { return null; }
}

document.addEventListener('click', async e => {
  if (e.target.id === 'btn-ai-quiz') {
    const box = $$('vocab-choices');
    $$('vocab-word').textContent = '🤖 מחולל שאלות AI';
    $$('vocab-hint').textContent = '';
    box.innerHTML = aiQuizPanel();
    $$('vocab-progress').textContent = '';
    $$('vocab-grade').style.display = 'none';
    return;
  }
  if (e.target.id !== 'btn-ai-go') return;
  AI_QUIZ.deck = document.getElementById('qdeck').value;
  AI_QUIZ.stage = document.getElementById('qstage').value;
  AI_QUIZ.count = parseInt(document.getElementById('qcount').value, 10);
  const key = (localStorage.getItem(GEMINI_KEY_STORE) || '').trim();
  const out = document.getElementById('ai-quiz-out');
  if (!key) { out.innerHTML = '<span style="color:#c0392b">דרוש מפתח Gemini — הדביקי למטה ושמרי.</span>'; return; }
  const pool = wordsForQuiz(AI_QUIZ.deck, AI_QUIZ.stage);
  if (!pool.length) { out.innerHTML = '<span style="color:var(--muted)">אין מילים מתאימות בחפיסה הזאת.</span>'; return; }
  out.innerHTML = '⏳ מכין מילים ומייצר שאלות…';
  const chosen = shuffle(pool).slice(0, AI_QUIZ.count);
  await Promise.all(chosen.map(c => srsEnsureHebrew(c)));
  const qs = [];
  for (let i = 0; i < chosen.length; i++) {
    out.innerHTML = '⏳ מייצרת שאלה ' + (i + 1) + ' מתוך ' + chosen.length + '…';
    const q = await aiMakeAmirnetQuestion(chosen[i].en, chosen[i].he, i);
    if (q) qs.push({ word: chosen[i].en, he: chosen[i].he || '', q: q });
  }
  if (!qs.length) { out.innerHTML = '<span style="color:#c0392b">לא נוצרו שאלות — בדקי את המפתח או נסי שוב.</span>'; return; }
  playAiQuiz(qs);
});

function playAiQuiz(qs) {
  let i = 0, right = 0;
  const out = document.getElementById('ai-quiz-out');
  const box = $$('vocab-choices');
  $$('vocab-word').textContent = 'שאלות AI (' + qs.length + ')';
  function show() {
    if (i >= qs.length) {
      $$('vocab-hint').innerHTML = '<div dir="rtl"><b>סיום! ענית נכון ' + right + ' מתוך ' + qs.length + '</b> — הדירוגים נשמרו לחזרות.</div>' +
        '<div style="margin-top:8px"><button class="icon-btn" id="btn-ai-again" style="background:var(--link-blue);color:#fff;border:0;border-radius:4px;padding:8px 18px;cursor:pointer">סבב נוסף</button> ' +
        '<button class="icon-btn" id="btn-ai-back" style="border:1px solid var(--line);border-radius:4px;padding:8px 18px;cursor:pointer;color:var(--ink)">חזרה לאימון</button></div>';
      box.innerHTML = '';
      document.getElementById('btn-ai-again').onclick = function(){ playAiQuiz(qs); };
      document.getElementById('btn-ai-back').onclick = function(){ startVocab(S.vocab ? S.vocab.deck : 'common'); };
      return;
    }
    const item = qs[i];
    $$('vocab-hint').innerHTML = '<div dir="rtl" style="margin-bottom:6px"><b>' + (i + 1) + '/' + qs.length + '</b> · ' +
      ({0:'השלמת משפט',1:'ניסוח מחדש',2:'מילה נרדפת'}[i % 3]) + ' על <b dir="ltr">' + item.word + '</b></div>' +
      '<div dir="ltr" style="font-size:15px">' + item.q.stem + '</div>';
    box.innerHTML = '';
    item.q.options.forEach(function(o, oi) {
      const btn = document.createElement('button');
      btn.className = 'opt';
      btn.dir = 'ltr';
      btn.textContent = o;
      btn.onclick = function() {
        const ok = oi === item.q.answer;
        btn.classList.add(ok ? 'right' : 'bad');
        document.querySelectorAll('#vocab-choices button').forEach(function(x){ if (x !== btn) x.onclick = null; });
        if (ok) right++;
        srsGrade(item.word, ok, true, false);
        $$('vocab-hint').innerHTML += '<div style="margin-top:8px;color:' + (ok ? 'var(--green)' : '#c0392b') + '">' +
          (ok ? '✓ נכון!' : '✕ התשובה הנכונה: <span dir="ltr">' + item.q.options[item.q.answer] + '</span>') + '</div>';
        setTimeout(function(){ i++; show(); }, ok ? 700 : 1600);
      };
      box.appendChild(btn);
    });
  }
  show();
}

/* ==== AI Translation Audit & Fix (user request: AI checks + fixes + fills) ==== */
async function aiAuditTranslations(progressCb) {
  const key = (localStorage.getItem(GEMINI_KEY_STORE) || '').trim();
  if (!key) { if (progressCb) progressCb('\u05e0\u05d3\u05e8\u05e9 \u05de\u05e4\u05ea\u05d7 Gemini — \u05d7\u05d1\u05e8\u05d9 AI \u05d1\u05e4\u05d0\u05e0\u05dc \u05dc\u05de\u05d8\u05d4.', true); return null; }
  const s = loadSRS();
  const names = Object.keys(s.cards || {});
  if (!names.length) { if (progressCb) progressCb('\u05d0\u05d9\u05df \u05de\u05d9\u05dc\u05d9\u05dd \u05d1\u05d7\u05e4\u05d9\u05e1\u05d4 \u05dc\u05d1\u05d3\u05d9\u05e7\u05d4.', true); return null; }
  const review = names.filter(function (w) {
    const h = (heCache()[w] || {});
    if (h.manual && h.source === 'user') return false;   /* user-edited: never touch */
    return true;
  });
  const CHUNK = 25;
  let fixed = 0, missing = 0, ok = 0;
  for (let i = 0; i < review.length; i += CHUNK) {
    const chunk = review.slice(i, i + CHUNK);
    const payload = chunk.map(function (w) {
      const he = (heCache()[w] || {}).he || "";
      return w + " = " + (he || "(no translation)");
    }).join("\n");
    const prompt = "You are a Hebrew-English lexicographer for Israeli Amir test prep. " +
      "Below is a list of lines: english = hebrew translation. For each line judge the translation. " +
      "Reply ONLY with compact JSON, no markdown, in the form: {\"r\":{\"english\":{\"ok\":1}}} " +
      "or {\"r\":{\"english\":{\"fix\":\"correct hebrew\"}}} or {\"r\":{\"english\":{\"none\":1}}}. " +
      "- ok: the translation is correct.\n" +
      "- fix: the translation is WRONG or misleading -> provide the correct single Hebrew translation (no explanations).\n" +
      "- none: the translation is empty or missing -> provide the correct single Hebrew translation.\n" +
      "Keep translations SHORT (single word or 2-3 words max). Lines:\n" + payload;
    const txt = await geminiCall(prompt);
    if (!txt) continue;
    let r = null;
    try {
      const stripped = txt.replace(/\u0060\u0060\u0060json/g, "").replace(/\u0060\u0060\u0060/g, "").trim();
      r = JSON.parse(stripped.match(/\{[\s\S]*\}/)[0]).r;
    } catch (e) {}
    if (!r) continue;
    const cache = heCache();
    chunk.forEach(function (w) {
      const v = r[w];
      if (!v) return;
      if (v.fix) {
        const he = String(v.fix).trim();
        const cur = (cache[w] || {}).he || '';
        if (he && /[\u0590-\u05FF]/.test(he) && he !== cur) {
          cache[w] = { he: he, ex: (cache[w] || {}).ex || '', manual: false, source: 'ai-fixed' };
          fixed++;
        } else { ok++; }
      } else if (v.none) { missing++; }
      else if (v.ok) { ok++; }
    });
    heCacheSave(cache);
    if (progressCb) progressCb("\u05e0\u05d1\u05d3\u05e7\u05d5 " + Math.min(i + CHUNK, review.length) + " \u05de\u05ea\u05d5\u05da " + review.length + " — \u05ea\u05d5\u05e7\u05e0\u05d5 " + fixed + " \u00b7 \u05d7\u05e1\u05e8\u05d9\u05dd " + missing);
    await new Promise(function (res) { setTimeout(res, 1200); });
  }
  /* second pass: fill still-empty translations via the normal batch translator */
  /* FILL PASS v2: check the SRS deck (not just cache keys) for missing he */
  const cacheNow = heCache();
  const stillEmpty = Object.keys(s.cards || {}).filter(function (w) {
    const cd = s.cards[w] || {};
    if (cd.he) return false;
    const h = (cacheNow[w] || {});
    if (h.manual && h.source === 'user') return false;
    return !(h.he || '');
  });
  if (stillEmpty.length && typeof aiBatchTranslate === "function") {
    const got = await aiBatchTranslate(stillEmpty.slice(0, 200));
    if (progressCb) progressCb("\u05d4\u05d5\u05e9\u05dc\u05de\u05d5 " + (got || 0) + " \u05ea\u05e8\u05d2\u05d5\u05de\u05d9\u05dd \u05d7\u05e1\u05e8\u05d9\u05dd \u05d1\u05e0\u05d5\u05e1\u05e3.");
  }
  if (progressCb) progressCb("\u05e1\u05d9\u05d5\u05dd: \u05e0\u05d1\u05d3\u05e7\u05d5 " + review.length + " \u05de\u05d9\u05dc\u05d9\u05dd \u00b7 \u05ea\u05d5\u05e7\u05e0\u05d5 " + fixed + " \u00b7 \u05e0\u05d5\u05e1\u05e4\u05d5 " + missing + " \u05d7\u05d3\u05e9\u05d5\u05ea \u00b7 \u05ea\u05e7\u05d9\u05e0\u05d5\u05ea " + ok, false, true);
  return { checked: review.length, fixed: fixed, missing: missing, ok: ok };
}
window.aiAuditTranslations = aiAuditTranslations;
function srsHasCard(en) { return !!(loadSRS().cards || {})[en]; }
