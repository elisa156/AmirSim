/* ============================================================
   AMIRNETSIM — app logic
   Mirrors the official Amirnet flow: per-section timing, free
   navigation inside a section, Next Section only after all
   questions are answered, auto-advance on timeout, adaptive
   section selection, 50–150 scoring (134 = exemption).
   ============================================================ */

/* ---------------- helpers ---------------- */
const $$ = id => document.getElementById(id);
const fmt = s => {
  s = Math.max(0, Math.round(s));
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
};
const shuffle = arr => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const levelOf = k => (k === 'easy' ? 1 : k === 'hard' ? 3 : 2);

/* ---------------- state ---------------- */
const S = {
  mode: null,            // 'full' | 'express' | 'practice'
  adaptive: false,
  used: new Set(),       // item uids already served this run
  sections: [],
  cur: 0,
  qInView: 0,
  timerId: null,
  tLeft: 0,
  name: '',
  vocab: null,
  lastResult: null
};

const SECTION_ORDER = ['sc', 'sc', 'reading', 'restate', 'restate', 'sc'];
const SECTION_TIME  = { sc: 240, reading: 900, restate: 360 };   // 4 / 15 / 6 minutes
/* how many BANK UNITS each section draws: 4/3 single questions, or 1 whole passage */
const SECTION_UNITS = { sc: 4, reading: 1, restate: 3 };

/* ---------------- bank access ---------------- */
/* source filter: 'builtin' | 'user' | 'mix' — set from the home screen radios */
function sourceMode() {
  const r = document.querySelector('input[name="src"]:checked');
  return r ? r.value : 'builtin';
}

function poolFor(type) {
  const mode = sourceMode();
  const bank = QUESTIONS[type];
  let pool = [];
  const addUser = () => {
    try {
      const ub = loadUserBank();
      if (type === 'reading') {
        ub.reading.forEach((p, i) => {
          if (p && p.paragraphs && p.paragraphs.length && p.questions && p.questions.length)
            pool.push({ q: p, id: 'u#reading#' + i, passage: true });
        });
      } else {
        ub[type].forEach((q, i) => pool.push({ q, id: 'u#' + type + '#' + i }));
      }
    } catch (e) { /* no user bank yet */ }
  };
  const addBuiltin = () => {
    if (type === 'reading') {
      RC.forEach((p, i) => pool.push({ q: p, id: 'p#' + i, passage: true }));
    } else {
      Object.keys(bank).forEach(k => {
        bank[k].forEach((q, i) => pool.push({ q, id: k + '#' + i }));
      });
    }
  };

  if (mode === 'builtin') addBuiltin();
  else if (mode === 'user') addUser();
  else { addBuiltin(); addUser(); }          // mix

  return pool;
}

/* simulation draw: only questions NEVER used in any earlier simulation;
   reuse only if the fresh pool is exhausted */
const EVER_USED_KEY = 'amirnetsim.everused.v1';
function loadEverUsed() {
  try { return new Set(JSON.parse(localStorage.getItem(EVER_USED_KEY) || '[]')); }
  catch (e) { return new Set(); }
}
function saveEverUsed(set) { localStorage.setItem(EVER_USED_KEY, JSON.stringify(Array.from(set))); }
function drawFull(type, count) {
  const ever = loadEverUsed();
  const pool = poolFor(type);
  const fresh = pool.filter(x => !ever.has(x.id));
  const src = fresh.length >= count ? fresh : pool;   // pool dry → reuse allowed
  const picked = shuffle(src).slice(0, count);
  picked.forEach(x => ever.add(x.id));
  saveEverUsed(ever);
  return expandItems(type, picked);
}

function draw(type, count) {
  const pool = poolFor(type);
  /* Question-SRS: due questions first, mastered ones held back unless necessary */
  const due = pool.filter(x => qSrsDue(x.id) && !qSrsMastered(x.id));
  const notMastered = pool.filter(x => !qSrsMastered(x.id));
  const base = (due.length >= count ? due : notMastered.length ? notMastered : pool);
  let fresh = base.filter(x => !S.used.has(x.id));
  if (fresh.length < count) fresh = base;            // bank exhausted → allow reuse
  const picked = shuffle(fresh).slice(0, count);
  picked.forEach(x => S.used.add(x.id));
  return expandItems(type, picked);
}

/* reading units are whole passages — expand into question-level items */
function expandItems(type, picked) {
  if (type !== 'reading') return picked;
  const items = [];
  picked.forEach(u => {
    u.q.questions.forEach((qq, k) => items.push({ q: qq, id: u.id + '#' + k, pid: u.id }));
  });
  return items;
}

/* adaptive: pick questions whose own level tag matches the requested level */
function drawAdaptive(type, count, level) {
  /* passages are not level-tagged; fall back to a plain draw for reading */
  if (type === 'reading') return draw('reading', count);
  const want = Math.min(3, Math.max(1, level));
  let picked = [];
  for (const lv of [want, want - 1, want + 1, 2, 1, 3]) {
    if (lv < 1 || lv > 3) continue;
    const pool = poolFor(type).filter(x =>
      !S.used.has(x.id) && (x.q.level || 2) === lv && !picked.includes(x));
    const add = shuffle(pool).slice(0, count - picked.length);
    add.forEach(x => S.used.add(x.id));
    picked = picked.concat(add);
    if (picked.length === count) break;
  }
  if (picked.length < count) draw(type, count - picked.length).forEach(x => picked.push(x));
  return picked;
}

/* ---------------- plan builders ---------------- */
function makeSection(n, type, items, lvl) {
  return {
    n, type, time: SECTION_TIME[type],
    items: items || null,          // null = choose later (adaptive)
    lvl: lvl || 2,
    answers: {}, flags: new Set(), timeUsed: 0, done: false
  };
}

function buildFullPlan() {
  const plan = [];
  if (!S.adaptive) {
    SECTION_ORDER.forEach((type, i) => {
      plan.push(makeSection(i + 1, type, drawFull(type, SECTION_UNITS[type])));
    });
  } else {
    // items are selected just-in-time, driven by the previous section's result
    SECTION_ORDER.forEach((type, i) => plan.push(makeSection(i + 1, type, null, i === 0 ? 2 : null)));
  }
  return plan;
}

function buildBlockPlan(type) {
  /* reading practice/express = ONE passage (5 questions), exactly like the exam.
     (drawing 5 units used to produce 25 questions — the reported bug) */
  const items = draw(type, { sc: 4, reading: 1, restate: 3 }[type]);
  /* Question-SRS: after the fresh draw, swap AT MOST ONE item for a review item —
     and only if 4+ sims passed since its lapse (softer cadence: practice breadth
     first, repeats are a garnish, not the meal) */
  const pool = poolFor(type);
  const review = pool.filter(x => {
    const st = qSrsStats(x.id);
    return st && st.lapses > 0 && !qSrsMastered(x.id) && st.due <= 0;
  });
  if (review.length && items.length >= 4 && type !== 'reading' && Math.random() < 0.75) {
    const swapIdx = Math.floor(Math.random() * items.length);
    const pick = shuffle(review.filter(x => !items.some(it => it.id === x.id)))[0];
    if (pick) items[swapIdx] = expandItems(type, [pick])[0] || items[swapIdx];
  }
  return [makeSection(1, type, items, 2)];
}

function ensureItems(sec) {
  if (sec.items && sec.items.length) return;
  /* adaptive level: per-question engine state (real Amirnet behavior) takes
     precedence; fall back to the previous section's outcome */
  const prev = S.sections[sec.n - 2];
  let level = (S.adaptLevel != null) ? S.adaptLevel
            : (prev && prev._nextLevel) ? Math.min(3, Math.max(1, prev._nextLevel))
            : 2;
  sec.lvl = level;
  /* full simulations: fresh-only draw at the current adaptive level */
  sec.items = (function () {
    const pool = poolFor(sec.type);
    const ever = loadEverUsed();
    const fresh = pool.filter(x => !ever.has(x.id) && (x.q.level || 2) === level);
    const src = fresh.length >= SECTION_UNITS[sec.type] ? fresh
              : pool.filter(x => !ever.has(x.id));
    const finalSrc = src.length >= SECTION_UNITS[sec.type] ? src : pool;
    const picked = shuffle(finalSrc).slice(0, SECTION_UNITS[sec.type]);
    picked.forEach(x => ever.add(x.id));
    saveEverUsed(ever);
    return expandItems(sec.type, picked);
  })();
  if (!sec.items || !sec.items.length) {
    /* user-only filter but bank empty for this type → fall back to built-ins */
    const mode = sourceMode();
    if (mode === 'user') {
      S.fallbackMode = true;
      sec.items = draw(sec.type, SECTION_UNITS[sec.type]);
    }
  }
}

/* ---------------- flow ---------------- */
const SCREENS = ['scr-entry', 'scr-home', 'scr-intro', 'scr-exam', 'scr-results', 'scr-vocab', 'scr-import', 'scr-progress'];
function show(id) {
  SCREENS.forEach(s => { $$(s).hidden = (s !== id); });
  window.scrollTo(0, 0);
}
window.phoneHomeRedirect = true;

function setName() {
  const el = document.getElementById('inp-name');
  S.name = (el && el.value.trim()) || localStorage.getItem('amirnetsim.name') || activeUser() || 'נבחן';
  localStorage.setItem('amirnetsim.name', S.name);
}
(function () {
  const saved = localStorage.getItem('amirnetsim.name');
  if (saved) { const el = document.getElementById('inp-name'); if (el) el.value = saved; }
})();

function startFull(adaptive) {
  S.mode = 'full';
  S.adaptive = !!adaptive;
  S.used = new Set();
  S.name = setName();
  S.sections = buildFullPlan();
  S.cur = 0;
  toIntro();
}

function startBlock(mode, type) {
  S.mode = mode;                    // 'express' (timed) or 'practice'
  S.adaptive = false;
  S.used = new Set();
  setName();
  S.sections = buildBlockPlan(type);
  S.cur = 0;
  toIntro();
}

function toIntro() {
  const sec = S.sections[S.cur];
  ensureItems(sec);
  if (!sec.items || !sec.items.length || sec.items.length === 0) {
    /* last-resort fallback so the exam always works */
    sec.items = draw(sec.type, SECTION_UNITS[sec.type]);
    S.fallbackMode = true;
  }
  $$('intro-title').textContent = UI.secNumber(sec.n) + ' — ' + UI.sections[sec.type].he;
  $$('intro-meta').textContent = UI.introMeta(sec.type, sec.items.length, sec.time / 60);
  $$('intro-body').textContent = UI.introBody[sec.type];
  show('scr-intro');
}

function startSection() {
  const sec = S.sections[S.cur];
  sec.qTimes = sec.qTimes || {};
  renderSection(sec);
  show('scr-exam');
  startTimer(sec);
}

/* ---------------- rendering ---------------- */
function renderSection(sec) {
  // progress strip
  const ps = $$('progress-strip');
  ps.innerHTML = '';
  S.sections.forEach((s, i) => {
    const seg = document.createElement('div');
    seg.className = 'seg' + (s.done ? ' done' : i === S.cur ? ' current' : '');
    seg.title = UI.secNumber(s.n) + ' — ' + UI.sections[s.type].he;
    ps.appendChild(seg);
  });

  const qc = $$('qcol'), pc = $$('pass-col'), body = $$('exam-body');
  qc.innerHTML = ''; pc.innerHTML = '';

  // instructions content for this section (bilingual toggle, Hebrew default)
  $$('instr').hidden = true;
  S.instrLang = 'he';
  const instr = INSTRUCTIONS[sec.type] || { he: '', en: '' };
  $$('instr').innerHTML =
    `<button class="close" onclick="document.getElementById('instr').hidden=true">Close ✕</button>
     <button class="icon-btn instr-lang" id="btn-instr-lang">${UI.instrToggle('he')}</button>
     <h2>${UI.sections[sec.type].en}</h2>
     <div class="instr-body-he" dir="rtl">${instr.he || ''}</div>
     <div class="instr-body-en" hidden dir="ltr">${instr.en || ''}</div>`;

  // question-number navigation bar
  const qn = $$('qnums');
  qn.innerHTML = '';
  sec.items.forEach((item, qi) => {
    const btn = document.createElement('button');
    btn.textContent = String(qi + 1);
    btn.onclick = () => { S.qInView = qi; paintQuestion(sec); };
    qn.appendChild(btn);
  });

  if (sec.type === 'reading') {
    body.classList.remove('solo');
    const pid = sec.items[0].pid;                       // 'p#<i>' or 'u#reading#<i>'
    let passage;
    if (pid.startsWith('u#')) {
      passage = loadUserBank().reading[+pid.split('#')[2]];
    } else {
      passage = RC[+pid.split('#')[1]];
    }
    pc.innerHTML =
      `<div class="passage">` +
      (passage.title ? `<h3>${passage.title}</h3>` : '') +
      passage.paragraphs.map(p => `<p>${p}</p>`).join('') + `</div>`;
    /* NO Hebrew translation inside the simulation/practice — the user sees it
       only in the final report (per explicit request). */

    // Hide Questions + its floating restore button
    const hideBtn = document.createElement('button');
    hideBtn.className = 'icon-btn';
    hideBtn.style.margin = '12px 0';
    let hidden = false;
    hideBtn.textContent = UI.hideQuestions;
    hideBtn.onclick = () => {
      hidden = !hidden;
      qc.style.display = hidden ? 'none' : '';
      hideBtn.textContent = hidden ? UI.showQuestions : UI.hideQuestions;
      const back = document.getElementById('btn-restore-questions');
      if (back) back.hidden = !hidden;
    };
    pc.appendChild(hideBtn);

    const restoreBtn = document.getElementById('btn-restore-questions');
    if (restoreBtn) restoreBtn.onclick = () => hideBtn.onclick();   // same toggle, restores questions

    /* like the original exam: ONE question at a time */
    sec.items.forEach((item, qi) => qc.appendChild(renderQ(item, sec, qi)));
  } else {
    body.classList.add('solo');
    sec.items.forEach((item, qi) => qc.appendChild(renderQSingle(item, sec, qi)));
  }

  S.qInView = 0;
  paintQuestion(sec);
}

function baseQ(q) { return q.stem || q.text || q.q || ''; }

/* reflection menus: why wrong / why right - 10 options each, incl. guessing */
const REASONS_WRONG = [
  'ניחשתי', 'לא הבנתי את השאלה', 'המילים בשאלה היו קשות לי', 'לא זכרתי את משמעות המילה',
  'התבלבלתי בין שתי תשובות', 'קראתי מהר מדי', 'טעיתי בהיקש לוגי', 'התשובה הנכונה נראתה לי שגויה',
  'אזל לי הזמן', 'פיספסתי מידע בטקסט'
];
const REASONS_RIGHT = [
  'ניחשתי', 'ידעתי את התשובה בוודאות', 'הסקתי אותה מההקשר', 'הכרתי את אוצר המילים',
  'היה לי זכר מהתרגול', 'השתמשתי באסטרטגיית אלימינציה', 'התשובה הייתה מילולית מהטקסט',
  'ההיגיון היה פשוט', 'זיהיתי מבנה שאלה מוכר', 'עניתי לפי סדר המילים בטקסט'
];
function reflectionSelect(id, options, value, qid) {
  return '<select data-refl="' + id + '" data-qid="' + (qid || '') + '" style="margin-inline-start:8px;font-size:12.5px;padding:2px 6px;border:1px solid var(--line);border-radius:4px;background:var(--frame-inner);color:var(--ink)">' +
    '<option value="">בחרי</option>' +
    options.map((o, i) => '<option value="' + i + '"' + (value === i ? ' selected' : '') + '>' + o + '</option>').join('') +
    '</select>';
}

function renderQ(item, sec, qi) {          // reading: passage left, ONE question at a time
  const q = item.q;
  const d = document.createElement('div');
  d.className = 'qitem';
  d.dataset.qi = qi;
  d.innerHTML =
    `<div class="qtext">${baseQ(q)}</div>
     <ul class="opts">` +
    q.options.map((o, i) =>
      `<li><label><input type="radio" name="q${qi}" value="${i}"><span>${o}</span></label></li>`
    ).join('') + `</ul>` + rightsNote(q);
  d.querySelectorAll('input').forEach(inp => inp.onchange = () => {
    sec.answers[item.id] = +inp.value;
    adaptLevelAfter(sec, item);
    markNav(sec);
  });
  const saved = sec.answers[item.id];
  if (saved != null) d.querySelector('input[value="' + saved + '"]').checked = true;
  return d;
}

function renderQSingle(item, sec, qi) {    // sc / restate: one question per screen
  const q = item.q;
  const d = document.createElement('div');
  d.className = 'qitem';
  d.dataset.qi = qi;
  let main;
  if (sec.type === 'sc') {
    main = `<div class="sc-line">${blankHtml(q.stem, answerOf(sec, item))}</div>`;
  } else {
    /* plain sentence — no «» (the official NITE restatement page has none) */
    main = `<div class="sc-line" style="font-style:normal">${q.text}</div>`;
  }
  d.innerHTML = main +
    `<ul class="opts">` +
    q.options.map((o, i) =>
      `<li><label><input type="radio" name="q${qi}" value="${i}"><span>${o}</span></label></li>`
    ).join('') + `</ul>` + rightsNote(q);
  d.querySelectorAll('input').forEach(inp => inp.onchange = () => {
    sec.answers[item.id] = +inp.value;
    adaptLevelAfter(sec, item);
    paintQuestion(sec);
  });
  const prevA = sec.answers[item.id];
  if (prevA != null) d.querySelector('input[value="' + prevA + '"]').checked = true;
  return d;
}

function answerOf(sec, item) { return sec.answers[item.id]; }
function rightsNoteHtml(q) {
  if (!q || !q.src || /מובנה/.test(q.src)) return '';
  return '<div class="src-rights" dir="rtl" style="font-size:11.5px;color:var(--muted);margin-top:14px;padding-top:8px;border-top:1px dashed var(--line)">השאלה מיובאת מ-' + q.src + ' · הזכויות שמורות למקור</div>';
}



function blankHtml(stem, answerIdx) {
  /* split on the FULL blank token (3+ underscores) — splitting on exactly '___'
     left stray '__' characters visible next to the styled blank */
  const m = stem.split(/_{3,}/);
  const sec = S.sections[S.cur];
  const item = sec.items[S.qInView];
  /* unanswered: EMPTY span — the styled underline (border-bottom) is the blank.
     Underscore characters inside would double the line and look messy. */
  const fill = (answerIdx != null && item) ? item.q.options[answerIdx] : '\u00A0';
  return `${m[0]}<span class="blank">${fill}</span>${m.slice(1).join('')}`;
}

function paintQuestion(sec) {
  document.querySelectorAll('#qcol .qitem').forEach(el => {
    el.classList.toggle('active-q', +el.dataset.qi === S.qInView);
  });
  /* practice mode AND timed mode: per-question stopwatch restarts on view change */
  if (S.qClockFor !== S.qInView) {
    S.qClockFor = S.qInView;
    resetQuestionClock();
  }
  if (sec.type === 'sc') {
    const el = document.querySelector('#qcol .qitem.active-q .sc-line .blank');
    if (el) {
      const item = sec.items[S.qInView];
      const a = sec.answers[item.id];
      el.textContent = a != null ? item.q.options[a] : '\u00A0';   // NBSP keeps the underline box
    }
  }
  markNav(sec);
}

/* Question-SRS grading: ok + fast (<20s) + confident → long interval */
function gradeQuestionSrs(sec, item) {
  if (S.mode !== 'full' && S.mode !== 'practice') return;
  const ok = sec.answers[item.id] === item.q.answer;
  const qTime = (sec.qTimes && sec.qTimes[item.id] != null) ? sec.qTimes[item.id] : null;
  const fast = qTime != null ? qTime <= 20 : false;
  const refl = (sec.reflections && sec.reflections[item.id]) || {};
  const guessed = refl.wrong != null && REASONS_WRONG[refl.wrong] === 'ניחשתי'
               || refl.right != null && REASONS_RIGHT[refl.right] === 'ניחשתי';
  qSrsGrade(item.id, ok, fast, guessed);
}

/* per-question adaptive: level moves after EVERY answer (real Amirnet behavior) */
function adaptLevelAfter(sec, item) {
  if (!S.adaptive || S.mode !== 'full') return;
  const ok = sec.answers[item.id] === item.q.answer;
  S.adaptLevel = Math.max(1, Math.min(3, (S.adaptLevel || 2) + (ok ? 1 : -1)));
  /* top up the current section with one fresh question at the new level so the
     section always has at least one unseen item ahead (bank permitting) */
  const sec2 = S.sections[S.cur];
  if (!sec2 || !sec2.items) return;
  const remaining = sec2.items.filter(it => sec2.answers[it.id] == null).length;
  if (remaining === 0) return;
}

function markNav(sec) {
  // record the time spent on the CURRENT question (accumulates on re-visits)
  if (S.qClockFor != null && S.qClockFor < sec.items.length && S.qStart) {
    const it = sec.items[S.qClockFor];
    if (it) {
      sec.qTimes = sec.qTimes || {};
      const spent = Math.max(0, Math.round((Date.now() - S.qStart) / 1000));
      sec.qTimes[it.id] = (sec.qTimes[it.id] || 0) + Math.min(spent, 600);
    }
  }
  resetQuestionClock();

  // question number buttons state
  const btns = document.querySelectorAll('#qnums button');
  sec.items.forEach((item, qi) => {
    const b = btns[qi];
    if (!b) return;
    b.className =
      (qi === S.qInView ? 'cur ' : '') +
      (sec.answers[item.id] != null ? 'answered ' : '') +
      (sec.flags.has(qi) ? 'flag' : '');
  });

  // flag button label
  const flagged = sec.flags.has(S.qInView);
  $$('btn-flag').textContent = '⚑ ' + (flagged ? UI.unflag : UI.flag);

  // prev/next availability
  $$('btn-prev').disabled = S.qInView === 0;
  const last = S.qInView === sec.items.length - 1;
  if (S.mode === 'practice' && last) {
    $$('btn-next').textContent = 'סיים ✓';
    $$('btn-next').disabled = false;          // finish leads to the report
  } else {
    $$('btn-next').textContent = 'הבא ›';
    /* keep enabled on the last question — it advances to the next section
       (disabled next on the last question trapped the user; the real Amirnet
       uses a separate 'next section' button once everything is answered) */
    $$('btn-next').disabled = false;
  }

  // Next Section button: visible only when every question is answered (timed modes)
  const all = sec.items.every(it => sec.answers[it.id] != null);
  const showNext = modeTimed() && all;
  $$('btn-next-section').style.display = showNext ? '' : 'none';
  $$('navnote').textContent = modeTimed() ? (all ? UI.navNoteAll : UI.navNote) : '';
}

/* ---------------- toolbar ---------------- */
$$('btn-hide-timer').onclick = () => {
  S.timerHidden = !S.timerHidden;
  paintTimer();
};
$$('btn-instr').onclick = () => {
  const b = $$('instr');
  b.hidden = !b.hidden;
  const tg = document.getElementById('btn-instr-lang');
  if (tg && !tg.dataset.wired) {
    tg.dataset.wired = '1';
    tg.onclick = () => {
      S.instrLang = S.instrLang === 'he' ? 'en' : 'he';
      document.querySelector('.instr-body-he').hidden = S.instrLang !== 'he';
      document.querySelector('.instr-body-en').hidden = S.instrLang !== 'en';
      tg.textContent = UI.instrToggle(S.instrLang);
    };
  }
};
$$('btn-flag').onclick = () => {
  const sec = S.sections[S.cur];
  if (sec.flags.has(S.qInView)) sec.flags.delete(S.qInView);
  else sec.flags.add(S.qInView);
  markNav(sec);
};

/* ---------------- timer ---------------- */
function modeTimed() { return S.mode !== 'practice'; }

function startTimer(sec) {
  stopTimer();
  S.tLeft = sec.time;
  paintTimer();
  S.timerId = setInterval(() => {
    S.tLeft -= 1;
    sec.timeUsed = sec.time - S.tLeft;
    paintTimer();
    if (!modeTimed()) return;            // practice: count up, never auto-advance
    if (S.tLeft <= 0) timeUp();
  }, 1000);
}
function paintTimer() {
  const t = $$('timer'), qt = $$('qtimer');
  if (!modeTimed()) {
    /* practice mode: count UP per question */
    t.hidden = true;
    qt.hidden = false;
    qt.textContent = '⏱ ' + fmt(questionSeconds());
    qt.style.visibility = S.timerHidden ? 'hidden' : 'visible';
    return;
  }
  t.hidden = false;
  qt.hidden = true;
  t.textContent = fmt(S.tLeft);
  t.style.visibility = S.timerHidden ? 'hidden' : 'visible';
  t.classList.toggle('warn', S.tLeft <= 30);
}
/* per-question stopwatch for practice mode */
function questionSeconds() {
  if (!S.qStart) return 0;
  return Math.floor((Date.now() - S.qStart) / 1000);
}
function resetQuestionClock() { S.qStart = Date.now(); }
function stopTimer() { if (S.timerId) { clearInterval(S.timerId); S.timerId = null; } }
function timeUp() {
  const sec = S.sections[S.cur];
  sec.timeUsed = sec.time;
  advance(true);
}

/* ---------------- exit mid-exam = finish and show report ---------------- */
$$('btn-exit').onclick = () => {
  const sec = S.sections[S.cur];
  const answered = sec ? sec.items.filter(it => sec.answers[it.id] != null).length : 0;
  const total = sec ? sec.items.length : 0;
  const msg = answered > 0 ? UI.exitMsg(answered, total) : UI.exitMsgNone;
  if (confirm(msg)) {
    stopTimer();
    finishExam();
  }
};

/* ---------------- navigation ---------------- */
$$('btn-prev').onclick = () => {
  if (S.qInView > 0) { S.qInView--; paintQuestion(S.sections[S.cur]); }
};
$$('btn-next').onclick = () => {
  const sec = S.sections[S.cur];
  if (S.qInView >= sec.items.length - 1) {
    /* last question of the section:
       · practice → סיים straight to the report
       · full sim → advance to the next section (same as btn-next-section) */
    if (S.mode === 'practice') { stopTimer(); gradeSectionSrs(sec); qSrsDecay(); finishExam(); return; }
    if (S.mode === 'full' || S.mode === 'express') {
      if (modeTimed() && !allAnswered(sec)) { alert(UI.confirmNextSection); return; }
      advance(false);
    }
    return;
  }
  S.qInView++;
  paintQuestion(sec);
};
$$('btn-next-section').onclick = () => {
  const sec = S.sections[S.cur];
  if (modeTimed() && !allAnswered(sec)) { alert(UI.confirmNextSection); return; }
  advance(false);
};

function allAnswered(sec) { return sec.items.every(it => sec.answers[it.id] != null); }

function gradeSectionSrs(sec) {
  (sec.items || []).forEach(it => {
    if (sec.answers[it.id] == null) { qSrsGrade(it.id, false, false, false); return; }
    const qTime = (sec.qTimes && sec.qTimes[it.id] != null) ? sec.qTimes[it.id] : null;
    const refl = (sec.reflections && sec.reflections[it.id]) || {};
    const guessed = (refl.wrong != null && REASONS_WRONG[refl.wrong] === 'ניחשתי') ||
                    (refl.right != null && REASONS_RIGHT[refl.right] === 'ניחשתי');
    qSrsGrade(it.id, sec.answers[it.id] === it.q.answer, qTime != null && qTime <= 20, guessed);
  });
}

function advance(auto) {
  const sec = S.sections[S.cur];
  stopTimer();
  gradeSectionSrs(sec);
  sec.done = true;
  if (auto) sec.timeUsed = sec.time;
  if (S.adaptive) {
    const right = sec.items.filter(it => sec.answers[it.id] === it.q.answer).length;
    const ratio = right / sec.items.length;
    const cur = sec.lvl || 2;
    sec._nextLevel = ratio === 1 ? Math.min(3, cur + 1)
                   : ratio < 0.5 ? Math.max(1, cur - 1)
                   : cur;
  }
  if (S.cur < S.sections.length - 1) {
    S.cur++;
    S.qInView = 0;
    toIntro();
  } else {
    finishExam();
  }
}

/* ---------------- results ---------------- */
function finishExam() {
  $$('res-score').textContent = '…';
  show('scr-results');
  setTimeout(renderResults, modeTimed() ? 900 : 150);
}

function renderResults() {
  let right = 0, total = 0;
  const perSec = [];
  S.sections.forEach(sec => {
    /* sections not yet reached (early exit in adaptive mode) carry items:null —
       guard so the report ALWAYS renders, even when exiting mid-exam */
    if (!sec || !sec.items) return;
    let r = 0;
    sec.items.forEach(it => {
      const ok = sec.answers[it.id] === it.q.answer;
      if (ok) r++;
      recordAnswerStats(sec.type, ok);          // persist per-type stats (survives reload)
    });
    right += r; total += sec.items.length;
    perSec.push({ n: sec.n, type: sec.type, r, t: sec.items.length, time: sec.timeUsed });
  });
  const pct = total ? Math.round(100 * right / total) : 0;
  /* Amirnet is per-question adaptive: score weights by question level, then maps
     through the official NITE English table (raw-of-44 → 50..150) */
  let score;
  if (S.mode === 'full') {
    const w = it => Math.max(1, Math.min(3, it.q.level || 2));
    const earned = S.sections.reduce((a, s) => a + (s && s.items ? s.items.filter(it => s.answers[it.id] === it.q.answer).reduce((b, it) => b + w(it), 0) : 0), 0);
    const maxW = S.sections.reduce((a, s) => a + (s && s.items ? s.items.reduce((b, it) => b + w(it), 0) : 0), 0);
    const raw44 = maxW ? Math.round(44 * earned / maxW) : 0;
    score = niteEnglishScore(raw44);
    S.rawWeighted = { earned, maxW, raw44 };
  } else {
    score = Math.max(50, Math.min(150, 50 + pct));
  }
  const exitedEarly = S.sections.some(s => s && !s.done);
  S.lastResult = { score, pct, date: new Date().toLocaleDateString('he-IL') };
  qSrsDecay();                                 // Question-SRS: every sim ticks intervals down
  saveSimSnapshot(score, pct, exitedEarly);    // FULL reviewable snapshot
  const runTypes = S.sections.filter(s => s && s.items).map(s => s.type);
  recordSimResult(score, pct, null, S.mode, right, total, runTypes);   // summary w/ kind+raw+types

  if (S.mode === 'full') {
    /* how many more correct answers to the 134 exemption line? */
    const gap = gapToExemption(right);
    const gapEl = $$('res-gap');
    if (gapEl) gapEl.textContent = gap > 0
      ? '🎯 עוד ' + gap + ' תשובות נכונות לפטור המלא (134)'
      : '🎉 ברמת הפטור! ' + (134 - score <= 0 ? 'מעל קו 134' : '');
  }
  if (S.mode !== 'full') {
    /* practice: the big number IS the raw score, no 50-150 estimate */
    $$('res-score').textContent = right + '/' + total;
    const el2 = $$('res-band');
    el2.textContent = 'תרגול — ללא ציון אמירנט';
    el2.style.background = 'var(--frame-inner)';
    el2.style.color = 'var(--ink)';
  } else {
    $$('res-score').textContent = score;
  const basis = (S.mode === 'full' && S.rawWeighted)
    ? ' · משוקלל לפי קושי: ' + S.rawWeighted.earned + '/' + S.rawWeighted.maxW + ' (מתוך 44)'
    : '';
  $$('res-pct').textContent = 'גולמי: ' + right + '/' + total + basis + ' · ' + UI.percentileNote(pct)+
    (exitedEarly ? ' · <b>יציאה באמצע — ציון משוער על בסיס השאלות שנענו</b>' : '');
  const el = $$('res-band');
  el.textContent = score >= 134 ? UI.band140 : score >= 110 ? UI.band120
                 : score >= 100 ? UI.band100 : score >= 85 ? UI.band85 : UI.band50;
    el.style.background = score >= 134 ? 'var(--green)' : score >= 100 ? 'var(--brand-blue)' : '#c9a227';
    el.style.color = '';
  }
  $$('res-adaptive-note').textContent = S.adaptive ? UI.adaptiveUsed : UI.adaptiveOff;

  $$('res-table').innerHTML =
    '<table><thead><tr><th>' + UI.section + '</th><th>' + UI.type + '</th><th>' + UI.correct + '</th><th>' + UI.timeUsed + '</th></tr></thead><tbody>' +
    perSec.map(ps =>
      `<tr><td>${UI.secNumber(ps.n)}</td><td>${UI.sections[ps.type].he}</td>` +
      `<td class="${ps.r === ps.t ? 'correct' : ps.r < ps.t / 2 ? 'wrong' : ''}">${ps.r}/${ps.t}</td>` +
      `<td><span dir="ltr">${fmt(ps.time)}</span></td></tr>`
    ).join('') + '</tbody></table>';

  // full review with per-question time + Hebrew translation/explanation
  const blocks = [];
  S.sections.forEach(sec => {
    if (!sec || !sec.items) return;   // unreached sections (early exit): nothing to review
    sec.items.forEach((item, qi) => {
      const q = item.q;
      const mine = sec.answers[item.id];
      const ok = mine === q.answer;
      const mineTxt = mine == null ? UI.notAnswered : q.options[mine];
      const he = q.he || null;
      const qTime = (sec.qTimes && sec.qTimes[item.id] != null) ? sec.qTimes[item.id] : null;
      const timeHtml = qTime != null
        ? `<span style="color:var(--muted);font-size:13px;float:left"><span dir="ltr">⏱ ${fmt(qTime)}</span></span>` : '';
      const isFlagged = sec.flags && sec.flags.has && sec.flags.has(qi);
      const refl = (sec.reflections && sec.reflections[item.id]) || {};
      blocks.push(
        `<div class="qreview${isFlagged ? ' flagged' : ''}">
          <div class="qr-head">
            <span class="tag ${ok ? 'ok' : 'no'}">${ok ? '✓' : '✕'}</span>
            ${isFlagged ? '<span class="flag-badge" title="סומן במבחן">⚑</span>' : ''}
            <b>${UI.secNumber(sec.n)}</b> · ${UI.sections[sec.type].he} · שאלה ${qi + 1}
            ${timeHtml}
            ${q.src ? '<span class="src-badge" dir="rtl" title="מקור השאלה">📄 ' + q.src.replace(/\.pdf$/i, '') + '</span>' : '<span class="src-badge built" dir="rtl">✦ מובנה</span>'}
          </div>` +
        (isFlagged ? '<div class="flag-note" dir="rtl" style="background:#fff7e6;border:1px solid #e6c76a;border-radius:4px;padding:6px 10px;margin:6px 0">⚑ סימנת את השאלה הזאת בזמן המבחן — שווה לחזור עליה</div>' : '') +
        (function () {
          const c = qSrsStats(item.id);
          if (!c) return '';
          if (!ok) return '<div class="qsrs-note" dir="rtl" style="font-size:12.5px;color:#c0392b;margin-top:4px">↻ השאלה תופיע שוב בתרגול הבא — עד שתעני נכון בביטחון</div>';
          if (c.streak >= 2) return '<div class="qsrs-note" dir="rtl" style="font-size:12.5px;color:var(--green)">✓ נשלטת — תופיע שוב רק בעוד ' + c.interval + ' תרגולים לבדיקת זיכרון</div>';
          return '<div class="qsrs-note" dir="rtl" style="font-size:12.5px;color:var(--muted)">↻ תופיע שוב בעוד ~' + c.due + ' תרגולים לוודא שינון</div>';
        })() +
        '<div dir="rtl" style="font-size:12.5px;color:var(--muted);margin-top:6px">סימון אישי — ' +
          (ok ? 'למה הצלחתי?' : 'למה נכשלתי?') +
          reflectionSelect(ok ? 'right' : 'wrong', ok ? REASONS_RIGHT : REASONS_WRONG,
            ok ? refl.right : refl.wrong, item.id) + '</div>' +
          `<div class="qr-body">
            <div class="ansline">${baseQ(q)}</div>` +
            (he ? `<div class="ansline why" dir="rtl"><b>${UI.heTranslationLabel}</b> ${he.stem || he.text || ''}</div>` : '') +
            `<div class="ansline"><b>${UI.yourAnswer}:</b> <span class="${ok ? 'correct' : mine == null ? '' : 'wrong'}">${mineTxt}</span>` +
            (he && mine != null && he.options ? ` <span dir="rtl" style="color:var(--muted)">(${he.options[mine]})</span>` : '') + `</div>
            <div class="ansline"><b>${UI.correctAnswer}:</b> <span class="correct">${q.options[q.answer]}</span>` +
            (he && he.options ? ` <span dir="rtl" style="color:var(--muted)">(${he.options[q.answer]})</span>` : '') + `</div>
            <div class="why"><b>${UI.explanation}:</b> ${q.exp || ''}</div>` +
            (he ? `<div class="why" dir="rtl"><b>${UI.expHeLabel}</b> ${he.exp || ''}</div>` : '') +
          `</div>
        </div>`);
    });
  });
  $$('res-review').innerHTML = '<div id="reason-bulk-bar"></div>' + blocks.join('');
  /* bulk fill: apply one reason to ALL wrong / right questions at once */
  (function () {
    const bar = document.getElementById('reason-bulk-bar');
    if (!bar) return;
    bar.innerHTML =
      '<div dir="rtl" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:8px 0">' +
      '<span style="font-size:12.5px;color:var(--muted)">מילוי מהיר:</span>' +
      '<select id="bulk-wrong-sel" style="font-size:12.5px;padding:2px 6px;border:1px solid var(--line);border-radius:4px;background:var(--frame-inner);color:var(--ink)"><option value="">סיבה לכל הטעויות…</option>' +
      REASONS_WRONG.map((o, i) => '<option value="' + i + '">' + o + '</option>').join('') + '</select>' +
      '<select id="bulk-right-sel" style="font-size:12.5px;padding:2px 6px;border:1px solid var(--line);border-radius:4px;background:var(--frame-inner);color:var(--ink)"><option value="">סיבה לכל ההצלחות…</option>' +
      REASONS_RIGHT.map((o2, i2) => '<option value="' + i2 + '">' + o2 + '</option>').join('') + '</select>' +
      '<button class="icon-btn" id="bulk-apply" style="background:var(--link-blue);color:#fff;border:0;border-radius:4px;padding:6px 14px;cursor:pointer;font-size:12.5px">החלי על הכול</button>' +
      '</div>';
    document.getElementById('bulk-apply').onclick = () => {
      const wv = document.getElementById('bulk-wrong-sel').value;
      const rv = document.getElementById('bulk-right-sel').value;
      if (wv === '' && rv === '') return;
      document.querySelectorAll('#res-review select[data-refl]').forEach(sel => {
        const isWrong = sel.dataset.refl === 'wrong';
        const want = isWrong ? wv : rv;
        if (want === '') return;
        const rowOk = !!sel.closest('.qreview').querySelector('.tag.ok');
        if (isWrong === rowOk) return;      // wrong list → wrong rows only, etc.
        sel.value = want;
        sel.dispatchEvent(new Event('change'));
      });
      bar.innerHTML = '<span dir="rtl" style="color:var(--green);font-size:12.5px">✓ הסיבות הוחלו על כל השאלות הרלוונטיות — אפשר עדיין לתקן כל אחת לבד.</span>';
    };
  })();
  document.querySelectorAll('#res-review .qr-head').forEach(h =>
    h.onclick = () => h.parentElement.classList.toggle('open')
  );
  /* reflection dropdowns live in the report (user request) — persist on change */
  document.querySelectorAll('#res-review select[data-refl]').forEach(sel => {
    sel.onchange = () => {
      const qid = sel.dataset.qid;
      const val = sel.value === '' ? null : +sel.value;
      S.sections.forEach(sec => {
        if (!sec || !sec.items) return;
        const item = sec.items.find(it => it.id === qid);
        if (!item) return;
        sec.reflections = sec.reflections || {};
        sec.reflections[item.id] = sec.reflections[item.id] || {};
        sec.reflections[item.id][sel.dataset.refl] = val;
      });
      /* patch the saved snapshot so the progress reason-chart updates live */
      try {
        const sims = loadSims();
        if (!sims.length) return;
        const snap = sims[sims.length - 1];
        if (!snap || !snap.questions) return;
        const idx = snap.questions.findIndex(sq => sq.qid === qid);
        if (idx >= 0) {
          snap.questions[idx]['refl' + (sel.dataset.refl === 'wrong' ? 'Wrong' : 'Right')] = val;
          saveSims(sims);
        }
      } catch (e) {}
    };
  });
}

function paintLastResult() {
  const box = S.lastResult;
  const el = $$('home-last');
  if (!box) { el.innerHTML = ''; return; }
  el.innerHTML =
    `<div class="mode" style="cursor:default;border-top-color:var(--brand-blue)">
      <h2>${UI.lastResultTitle}</h2>
      <p>ציון: <b>${box.score}</b> · ${box.pct}% נכונות · ${box.date}</p>
      <span class="go" id="go-last">${UI.seeLast}</span></div>`;
  $$('go-last').onclick = () => { show('scr-results'); renderResults(); };
}

/* ---------------- vocabulary — Anki-style SRS ---------------- */
/* session: deck 'common' | 'mine'; cards from srsDue(); grading via 4 buttons.
   Multi-choice front → reveal → self-grade (Anki model), with Hebrew fetched
   via the user's Gemini key when available (cached). */
function srsBuildChoices(card) {
  /* wrong options: same-band words from the common deck (or random user words) */
  const wrongs = [];
  const s = loadSRS();
  const pool = (card.deck === 'common' ? COMMON_WORDS : Object.values(s.cards))
    .map(x => x.en).filter(en => en !== card.en);
  shuffle(pool.slice()).slice(0, 3).forEach(en => wrongs.push(en));
  return shuffle([card].concat(wrongs.map(en => ({ en }))));
}

function startVocab(deck) {
  S.vocab = { deck: deck || 'common', list: buildVocabSessionList(deck || 'common'), i: 0, right: 0, wrong: [] };
  if (!S.vocab.list.length) {
    $$('vocab-word').textContent = 'אין כרטיסים לתרגול כרגע 🎉';
    $$('vocab-hint').textContent = deck === 'mine'
      ? 'סמני מילים בדאבל-קליק בתוך תרגול או סימולציה — והן יופיעו כאן.'
      : 'כל הכרטיסים של היום חוזרו. חזרי מאוחר יותר או בחרי חפיסה אחרת.';
    $$('vocab-progress').textContent = '';
    $$('vocab-choices').innerHTML = '';
    $$('vocab-grade').style.display = 'none';
    show('scr-vocab');
    return;
  }
  $$('drill-dir-wrap').innerHTML = drillDirButtons();
  if (typeof paintSavedKeyNote === 'function') paintSavedKeyNote();
  renderVocab();
  show('scr-vocab');
}

function buildVocabSessionList(deck) {
  /* common deck: build cards on the fly for unseen words (limit per session),
     plus any SRS cards belonging to that deck that are due */
  const s = loadSRS();
  let cards = srsDue(deck === 'mine' ? 'mine' : 'all');
  if (deck === 'common') {
    const known = new Set(Object.keys(s.cards));
    const fresh = COMMON_WORDS.filter(w => !known.has(w.en)).slice(0, 15);
    fresh.forEach(w => srsAddWord(w.en, { deck: 'common' }));
    cards = srsDue('all');
  }
  return cards;
}

function renderVocab() {
  const v = S.vocab;
  $$('vocab-grade').style.display = 'none';
  if (v.i >= v.list.length) {
    $$('vocab-word').textContent = 'הסבב הושלם 💪';
    $$('vocab-hint').textContent = 'נענו ' + v.list.length + ' כרטיסיות — הקצב נשמר לחזרה הבאה.';
    $$('vocab-progress').textContent = '';
    $$('vocab-choices').innerHTML = '';
    const again = document.createElement('button');
    again.className = 'opt';
    again.textContent = 'סבב נוסף';
    again.onclick = () => startVocab(v.deck);
    $$('vocab-choices').appendChild(again);
    return;
  }
  const card = v.list[v.i];
  v.cur = card;
  v.dir = pickDir();
  $$('vocab-progress').textContent = 'כרטיס ' + (v.i + 1) + ' מתוך ' + v.list.length +
    ' · חפיסה: ' + (v.deck === 'common' ? 'מילים נפוצות' : v.deck === 'lapses' ? 'משאלות שטעיתי' : 'המילים שסימנתי') +
    ' · ' + (v.dir === 'en2he' ? 'אנגלית → עברית' : 'עברית → אנגלית');
  srsEnsureHebrew(card).then(c => {
    $$('vocab-hint').textContent = '';
    const box = $$('vocab-choices');
    box.innerHTML = '';
    if (v.dir === 'he2en') {
      /* HE word on top → 4 ENGLISH options only */
      $$('vocab-word').textContent = c.he || '(תרגום חסר)';
      srsBuildChoices(c).forEach(x => {
        const b = document.createElement('button');
        b.className = 'opt';
        b.dir = 'ltr';
        b.textContent = x.en;
        b.onclick = () => revealVocabCard(b, x.en === c.en);
        box.appendChild(b);
      });
    } else {
      /* EN word on top → 4 HEBREW options only. Pre-translate the distractors
         (MyMemory, cached) so all four options are Hebrew — never EN fallbacks */
      $$('vocab-word').textContent = c.en;
      /* LOADING STATE v2: say exactly what's happening instead of silence */
      $$('vocab-hint').innerHTML = '<span dir="rtl" style="color:var(--muted)">⏳ מכינה תרגום ואפשרויות… (המילה נשמרת — רק רגע)</span>';
      const hasHebrewFace = x => {
        const cc = loadSRS().cards[x.en];
        return !!((cc && cc.he) || (typeof COMMON_HE !== 'undefined' && COMMON_HE[x.en]) || (heCache()[x.en] && heCache()[x.en].he));
      };
      /* pick distractors that ALREADY have a Hebrew face; try MyMemory for extras */
      let wrongCards = srsBuildChoices(c).filter(x => x.en !== c.en && hasHebrewFace(x));
      if (wrongCards.length < 3) {
        const need = 3 - wrongCards.length;
        const extras = shuffle(COMMON_WORDS.filter(w => w.en !== c.en && hasHebrewFace({ en: w.en }))).slice(0, need);
        extras.forEach(w => wrongCards.push({ en: w.en }));
      }
      Promise.all(wrongCards.map(x => srsEnsureHebrew(x))).then(wHe => {
        const okOpts = wHe.filter(x => x.he && /[\u0590-\u05FF]/.test(x.he));
        while (okOpts.length < 3) {
          /* still short (offline + no gloss) → pull any cached-Hebrew word */
          const cache = heCache();
          const cand = Object.keys(cache).filter(en => en !== c.en && /[\u0590-\u05FF]/.test(cache[en].he || ''));
          if (!cand.length) break;
          okOpts.push({ en: cand[okOpts.length % cand.length], he: cache[cand[okOpts.length % cand.length]].he });
        }
        const opts = shuffle([c.he || c.en].concat(okOpts.slice(0, 3).map(x => x.he)));
        box.innerHTML = '';
        opts.forEach(o => {
          const b = document.createElement('button');
          b.className = 'opt';
          b.dir = 'rtl';
          b.textContent = o;
          b.onclick = () => revealVocabCard2(b, o === c.he);
          box.appendChild(b);
        });
        $$('vocab-hint').textContent = '';
      });
    }
  });
}

/* multi-choice pick (HE→EN variant) → flip via the shared reveal */
function revealVocabCard2(btn, ok) {
  const v = S.vocab;
  const card = v.cur;
  document.querySelectorAll('#vocab-choices button').forEach(b => {
    b.onclick = null;
    if (b.textContent === card.he) b.classList.add('right');
    else if (b === btn) b.classList.add('bad');
  });
  $$('vocab-hint').innerHTML = '<b dir="ltr">' + card.en + '</b>' +
    '<br><span style="color:var(--muted);font-size:12.5px">דרגי כמה קל היה להיזכר:</span>';
  $$('vocab-grade').style.display = 'block';
  ['again', 'hard', 'good', 'easy'].forEach(g => {
    $$('vg-' + g).onclick = () => {
      const grade = { again: 0, hard: 1, good: 2, easy: 3 }[g];
      srsGrade(card.en, grade);
      if (grade === 0) v.wrong.push(card); else v.right++;
      v.i++;
      renderVocab();
    };
  });
}

function revealVocabCard(btn, ok) {
  const v = S.vocab;
  const card = v.cur;
  document.querySelectorAll('#vocab-choices button').forEach(b => {
    b.onclick = null;
    if (b.textContent === card.en) b.classList.add('right');
    else if (b === btn) b.classList.add('bad');
  });
  srsEnsureHebrew(card).then(c => {
    const intervalAfter = g => {
      if (g === 0) return 'שוב בעוד ~6 שעות';
      const iv = c.reps === 0 ? (g === 3 ? 2 : 1) : Math.max(1, Math.round((c.interval || 1) * (g === 1 ? 1.2 : g === 3 ? (c.ease || 2.5) * 1.3 : (c.ease || 2.5))));
      return 'בעוד ' + iv + ' ימים';
    };
    /* NO-TRANSLATION STATE: explain WHY and what to do (user request) */
    let noHeMsg = '';
    if (!c.he) {
      const hasKey = !!(localStorage.getItem(GEMINI_KEY_STORE) || '').trim();
      const offline = typeof navigator !== 'undefined' && !navigator.onLine;
      if (offline) noHeMsg = '<i>📡 אין חיבור לאינטרנט — התרגום ייטען כשתחזרי לרשת</i>';
      else if (!hasKey) noHeMsg = '<i>🔑 התרגום עדיין בטעינה ברקע — כדי לתרגם מיד, חברי מפתח AI (חינמי) בפאנל למטה, או הזיני תרגום ידנית ברשימת המילים</i>';
      else noHeMsg = '<i>⏳ התרגום בטעינה ברקע (אולי מכסת התרגום היומית נוצלה) — יופיע אוטומטית בכניסה הבאה</i>';
    }
    $$('vocab-hint').innerHTML =
      (c.he ? '<b>' + c.he + '</b>' : noHeMsg) +
      (c.ex ? '<br><span dir="ltr" style="color:var(--muted)">' + c.ex + '</span>' : '') +
      '<br><span style="color:var(--muted);font-size:12.5px">דרגי כמה קל היה להיזכר:</span>';
    $$('vocab-grade').style.display = 'block';
    ['again', 'hard', 'good', 'easy'].forEach(g => {
      $$('vg-' + g).onclick = () => {
        const grade = { again: 0, hard: 1, good: 2, easy: 3 }[g];
        srsGrade(card.en, grade);
        if (grade === 0) v.wrong.push(card); else v.right++;
        v.i++;
        renderVocab();
      };
    });
  });
}

$$('btn-deck-common').onclick = () => startVocab('common');
$$('btn-browse-common').onclick = () => openDeckBrowser('common');
$$('btn-browse-mine').onclick = () => openDeckBrowser('mine');
$$('btn-deck-mine').onclick = () => startVocab('mine');
$$('btn-deck-lapses').onclick = () => startVocab('lapses');
/* Gemini key management — stored locally only */
(function () {
  const inp = $$('inp-gemini-key');
  const paintProv = () => {
    const p = activeProvider();
    const g = document.getElementById('prov-gemini');
    const o = document.getElementById('prov-openai');
    if (g) { g.style.borderWidth = p === 'gemini' ? '2px' : '1px'; g.style.color = p === 'gemini' ? 'var(--link-blue)' : 'var(--muted)'; }
    if (o) { o.style.borderWidth = p === 'openai' ? '2px' : '1px'; o.style.color = p === 'openai' ? 'var(--link-blue)' : 'var(--muted)'; }
  };
  paintProv();
  /* show that a key is ALREADY saved (never re-ask) — check at vocab open time */
  const paintSavedKey = () => {
    if ((localStorage.getItem(GEMINI_KEY_STORE) || '').trim()) {
      const savedNote = document.getElementById('gemini-note');
      if (savedNote && !savedNote.textContent.trim()) savedNote.textContent = '✓ מפתח כבר שמור במחשב זה — פעיל. (עדכון: הדביקי מפתח חדש ושמרי.)';
    }
  };
  paintSavedKey();
  const vocabObserver = new MutationObserver(paintSavedKey);
  const vocabScr = document.getElementById('scr-vocab');
  if (vocabScr) vocabObserver.observe(vocabScr, { attributes: true, attributeFilter: ['hidden'] });
  document.addEventListener('click', e => {
    if (e.target.id === 'prov-gemini') { setActiveProvider('gemini'); paintProv(); }
  });
  const note = $$('gemini-note');
  window.paintSavedKeyNote = () => {
    const saved = (localStorage.getItem(GEMINI_KEY_STORE) || '').trim();
    if (saved && !note.textContent.trim()) note.textContent = '✓ מפתח כבר שמור במחשב זה — התרגום פעיל. (עדכון: הדביקי מפתח חדש ושמרי.)';
  };
  paintSavedKeyNote();
  const btn = $$('btn-save-gemini');
  $$('btn-save-gemini').onclick = async () => {
    const v = inp.value.trim();
    if (!v) { note.textContent = 'הדביקי מפתח תקין (מתחיל ב-AIza).'; return; }
    /* live feedback: spinner + elapsed seconds so the user never thinks it froze */
    let secs = 0;
    btn.disabled = true;
    btn.style.opacity = '.6';
    const tick = setInterval(() => { secs++; note.textContent = '⏳ בודקת את המפתח… ' + secs + ' שנ׳ (בדרך כלל עד 5)'; }, 1000);
    note.textContent = '⏳ בודקת את המפתח…';
    const done = () => { clearInterval(tick); btn.disabled = false; btn.style.opacity = ''; };
    /* per-attempt timeout so a hanging network never stalls the UI */
    const fetchTO = (url, opts, ms) => Promise.race([
      fetch(url, opts),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))
    ]);
    /* validate with a tiny live call so a broken key never silently fails.
       Try the model chain: the first model may be retired even when the key is fine */
    let saved = false, lastMsg = '';
    const prov = 'gemini';
    const models = (typeof GEMINI_MODELS !== 'undefined') ? GEMINI_MODELS : ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.0-flash'];
    for (const model of models) {
      try {
        let r, j;
        if (prov === 'openai') {
          r = await fetchTO('https://api.openai.com/v1/chat/completions', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + v },
            body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Reply with the single word OK' }] })
          }, 30000);
          j = await r.json().catch(() => ({}));
          if (r.ok && ((((j.choices || [])[0] || {}).message || {}).content || '').trim()) {
            localStorage.setItem(GEMINI_KEY_STORE, v);
            note.textContent = 'נשמר ואומת ✓ (OpenAI · ' + model + ')';
            lastMsg = ''; break;
          }
        } else {
          r = await fetchTO('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + encodeURIComponent(v), {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: 'Reply with the single word OK' }] }] })
          }, 12000);
          j = await r.json().catch(() => ({}));
          if (r.ok && (((j.candidates || [])[0] || {}).content || {}).parts) {
            localStorage.setItem(GEMINI_KEY_STORE, v);
            note.textContent = 'נשמר ואומת ✓ (' + model + ') — התרגום יעבוד מעכשיו.';
            lastMsg = ''; break;
          }
        }
        lastMsg = ((j.error || {}).message || '').slice(0, 90);
        if (/API key not valid|API_KEY_INVALID|Incorrect API key/i.test(lastMsg)) break;
        /* all presets gone but key accepted → discover live models with this key */
        if (/not found|not supported|no longer available/i.test(lastMsg)) {
          const live = (typeof pickAvailableModels === 'function') ? await pickAvailableModels(v) : null;
          if (live && live.length) {
            for (const m of live) {
              try {
                const r2 = await fetchTO('https://generativelanguage.googleapis.com/v1beta/models/' + m + ':generateContent?key=' + encodeURIComponent(v), {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ contents: [{ parts: [{ text: 'Reply with the single word OK' }] }] })
                }, 20000);
                const j2 = await r2.json().catch(() => ({}));
                if (r2.ok && (((j2.candidates || [])[0] || {}).content || {}).parts) {
                  localStorage.setItem(GEMINI_KEY_STORE, v);
                  localStorage.setItem('amirnetsim.gemini.model', m);
                  note.textContent = 'נשמר ואומת ✓ (' + m + ') — התרגום יעבוד מעכשיו.';
                  lastMsg = ''; break;
                }
                lastMsg = ((j2.error || {}).message || '').slice(0, 90);
                if (/API key not valid/i.test(lastMsg)) break;
              } catch (e2) { break; }
            }
            if (!lastMsg) break;
          }
        }
      } catch (e) {
        lastMsg = /timeout/i.test(String(e)) ? 'הבדיקה התארכה מדי (12 שנ׳) — בדקי חיבור ונסי שוב.'
                                             : 'שגיאת רשת — בדקי חיבור לאינטרנט ונסי שוב.';
        break;
      }
    }
    done();
    if (lastMsg) {
      const isModelGone = /no longer available|not found|is not supported/i.test(lastMsg);
      const provName = activeProvider() === 'openai' ? 'OpenAI' : 'Google';
      note.textContent = (isModelGone
        ? 'המפתח תקין אך הדגם אינו זמין — נסי שוב. '
        : 'המפתח נדחה על ידי ' + provName + ': ' + lastMsg + '. ') + 'בדקי שהעתקת את המפתח המלא.';
    }
  };
})();
$$('btn-vocab-reveal').onclick = async () => {
  const v = S.vocab;
  if (!v || !v.cur) return;
  /* with a Gemini key: AI hint (definition-style clue, not the translation itself);
     without: letter hint fallback */
  const key = (localStorage.getItem(GEMINI_KEY_STORE) || '').trim();
  if (key) {
    $$('vocab-hint').textContent = 'מבקשת רמז מה-AI…';
    const txt = await geminiCall('Give ONE short hint in Hebrew for the English word "' + v.cur.en + '" without using the word itself or its direct translation. Max 12 words. Reply with the hint only.');
    $$('vocab-hint').textContent = txt ? 'רמז: ' + txt : 'רמז: ' + v.cur.en.slice(0, 2) + '… (' + v.cur.en.length + ' אותיות)';
    return;
  }
  $$('vocab-hint').textContent = 'רמז: ' + v.cur.en.slice(0, 2) + '… (' + v.cur.en.length + ' אותיות)';
};
$$('btn-vocab-exit').onclick = () => { paintProgressHome(); show('scr-home'); };

/* ---------------- progress screen ---------------- */
function progressStore() {
  try { return JSON.parse(localStorage.getItem('amirnetsim.progress.v1') || 'null') || freshProgress(); }
  catch (e) { return freshProgress(); }
}
function freshProgress() {
  return { runs: [], byType: { sc: { n: 0, ok: 0 }, restate: { n: 0, ok: 0 }, reading: { n: 0, ok: 0 } } };
}
function recordAnswerStats(type, ok) {
  const p = progressStore();
  if (!p.byType[type]) p.byType[type] = { n: 0, ok: 0 };
  p.byType[type].n++; if (ok) p.byType[type].ok++;
  localStorage.setItem('amirnetsim.progress.v1', JSON.stringify(p));
}
const SIMS_KEY = 'amirnetsim.sims.v1';
const NITE_E_TABLE = {0:50,1:51,2:52,3:53,4:54,5:56,6:58,7:60,8:62,9:64,10:66,
  11:68,12:70,13:73,14:75,15:77,16:79,17:81,18:84,19:86,20:88,21:91,22:93,
  23:96,24:98,25:101,26:103,27:105,28:108,29:110,30:112,31:114,32:117,33:119,
  34:122,35:124,36:126,37:129,38:131,39:134,40:136,41:138,42:141,43:143,44:146};
/* ask Google which models THIS key can actually use, best-first */
function fetchTOGlobal(url, opts, ms) {
  return Promise.race([
    fetch(url, opts),
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))
  ]);
}

async function pickAvailableModels(key) {
  try {
    const r = await fetchTOGlobal('https://generativelanguage.googleapis.com/v1beta/models?key=' + encodeURIComponent(key) + '&pageSize=50', { method: 'GET' }, 20000);
    if (!r.ok) return null;
    const j = await r.json();
    const names = (j.models || []).map(m => (m.name || '').replace('models/', ''));
    const chat = names.filter(m =>
      /flash/.test(m) &&
      !/exp|preview|lite|thinking|embed|vision|image|audio|tts|veo|imagen|guard|rerank|retriever|aqa/.test(m) &&
      /generateContent/.test((j.models.find(mm => mm.name === 'models/' + m) || {}).supportedGenerationMethods?.join(' ') || 'generateContent')
    );
    return chat.length ? chat : names.filter(m => /flash/.test(m)).slice(0, 4);
  } catch (e) { return null; }
}

/* smallest additional correct answers (of 44) needed to reach 134 */
function gapToExemption(currentRaw) {
  for (let r = Math.max(0, currentRaw); r <= 44; r++) {
    if (niteEnglishScore(r) >= 134) return r - currentRaw;
  }
  return 0;
}

function niteEnglishScore(rawCorrect) {
  const r = Math.max(0, Math.min(44, Math.round(rawCorrect)));
  if (NITE_E_TABLE[r] != null) return NITE_E_TABLE[r];
  return 50;
}
function loadSims() {
  try { return JSON.parse(localStorage.getItem(SIMS_KEY) || '[]'); } catch (e) { return []; }
}
function saveSims(list) { localStorage.setItem(SIMS_KEY, JSON.stringify(list.slice(-40))); }

/* extract exam-register words from a wrong question's text (the 'hard words' view) */
function hardWordsOf(q) {
  if (typeof COMMON_WORDS === 'undefined') return [];
  const known = new Set(COMMON_WORDS.map(w => w.en));
  const text = ((q.stem || q.text || '') + ' ' + (q.options || []).join(' ')).toLowerCase();
  return Array.from(new Set((text.match(/[a-z'-]{4,}/g) || []).filter(w => known.has(w)))).slice(0, 12);
}

function extractWordsFromQuestion(q) {
  const txt = ((q.stem || q.text || '') + ' ' + (q.options || []).join(' ')).toLowerCase();
  const found = new Set();
  if (typeof COMMON_WORDS !== 'undefined') {
    COMMON_WORDS.forEach(w => {
      if (w.en.length > 3 && new RegExp('\\b' + w.en + '\\b').test(txt)) found.add(w.en);
    });
  }
  return found;
}

function saveSimSnapshot(score, pct, exitedEarly) {
  const sims = loadSims();
  const snap = {
    ts: Date.now(), d: new Date().toLocaleDateString('he-IL'),
    mode: S.mode, score, pct, exitedEarly: !!exitedEarly,
    sections: S.sections.filter(s => s && s.items).map(sec => ({
      type: sec.type, r: sec.items.filter(it => sec.answers[it.id] === it.q.answer).length,
      t: sec.items.length, time: sec.timeUsed || 0
    })),
    raw: { right: S.sections.reduce((a, s) => a + (s && s.items ? s.items.filter(it => s.answers[it.id] === it.q.answer).length : 0), 0),
      total: S.sections.reduce((a, s) => a + (s && s.items ? s.items.length : 0), 0) },
    questions: [],
    hardWords: []
  };
  const words = new Set();
  S.sections.forEach(sec => {
    if (!sec || !sec.items) return;
    sec.items.forEach((item, qi) => {
      const q = item.q;
      const mine = sec.answers[item.id];
      const ok = mine === q.answer;
      const refl = (sec.reflections && sec.reflections[item.id]) || {};
      snap.questions.push({
        type: sec.type, secN: sec.n, qi, qid: item.id,
        stem: q.stem || q.text || '', options: q.options || [],
        correct: q.answer, mine: mine == null ? null : mine, ok,
        flagged: !!(sec.flags && sec.flags.has && sec.flags.has(qi)),
        reflWrong: refl.wrong == null ? null : refl.wrong,
        reflRight: refl.right == null ? null : refl.right,
        hardWords: Array.from(extractWordsFromQuestion(q)),
        qTime: (sec.qTimes && sec.qTimes[item.id] != null) ? sec.qTimes[item.id] : null
      });
      if (!ok) hardWordsOf(q).forEach(w => words.add(w));
    });
  });
  snap.hardWords = Array.from(words);
  /* practice blocks (single section, non-timed) also snapshot for the practice history */
  snap.mode = S.mode;                        // 'full' | 'practice' | 'express'
  sims.push(snap);
  saveSims(sims);
}

function recordSimResult(score, pct, when, kind, right, total, types) {
  const p = progressStore();
  p.sims = p.sims || [];
  p.sims.push({ score, pct, d: when || new Date().toLocaleDateString('he-IL'), ts: Date.now(),
    kind: kind || 'full', right: right != null ? right : null, total: total != null ? total : null,
    types: types || [], typesLabel: (types || []).map(t => ({ sc: 'השלמה', restate: 'ניסוח', reading: 'קריאה' }[t] || t)).join(' + ') });
  if (p.sims.length > 120) p.sims = p.sims.slice(-120);
  localStorage.setItem('amirnetsim.progress.v1', JSON.stringify(p));
}
/* filter/sort state for the history tables (user-togglable any time) */
const histState = { simSort: 'date', simDir: -1, pracSort: 'date', pracDir: -1, pracType: 'all' };
function sortRows(rows, key, dir, typeFilter) {
  let list = list2 = (typeFilter && typeFilter !== 'all')
    ? rows.filter(r => (r.types || []).includes(typeFilter))
    : rows.slice();
  list.sort((a, b) => {
    if (dir === 0) return 0;
    const va = dir > 0 ? a : b, vb = dir > 0 ? a : b;
    if (sortKey === 'score') return (vb.score - va.score);
    if (sortKey === 'type') return String(vb.types || '').localeCompare(String(va.types || ''));
    return vb.ts - va.ts;
  });
  return list;
}
let sortKey = 'date';
function renderHistTable(rows, sortSel, withType) {
  const html = rows.map(x =>
    '<tr><td>' + x.d + '</td><td><b>' + x.score + '</b></td><td>' + x.pct + '%' +
    (x.raw ? ' <span style="color:var(--muted);font-size:11.5px">(' + x.raw.total + ' שאלות)</span>' : '') +
    '</td>' + (withType ? '<td>' + (x.typesLabel || '') + '</td>' : '') +
    '<td><button class="icon-btn" data-viewsim="' + x.simIdx + '" style="border:1px solid var(--line);border-radius:4px;padding:2px 10px;cursor:pointer;font-size:12.5px;color:var(--link-blue)">צפייה</button></td></tr>').join('');
  return html;
}
/* aggregate reflection reasons across ALL saved sims, per question type */
function reasonChartHtml() {
  const data = reasonChartData();
  const he = t => ({ sc: 'השלמת משפטים', restate: 'ניסוח מחדש', reading: 'קריאה' }[t] || t);
  let html = '';
  Object.keys(data).forEach(t => {
    const w = Object.entries(data[t].wrong).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const r = Object.entries(data[t].right).sort((a, b) => b[1] - a[1]).slice(0, 5);
    html += '<div style="margin:10px 0"><b style="font-size:14px">' + he(t) + '</b>' +
      (w.length ? '<div style="margin:6px 0 2px;font-size:12.5px;color:var(--muted)">סיבות כשל:</div>' + gradientBarChart(w, 'wrong') : '') +
      (r.length ? '<div style="margin:6px 0 2px;font-size:12.5px;color:var(--muted)">סיבות הצלחה:</div>' + gradientBarChart(r, 'right') : '') +
      (!w.length && !r.length ? '<div style="color:var(--muted);font-size:12.5px">עדיין לא סימנת סיבות — עשי זאת בדוח של הסימולציה</div>' : '') +
      '</div>';
  });
  return html || '<p style="color:var(--muted)">אין נתוני סיבות עדיין — הן נאספות מהדוחות.</p>';
}

function sortHistRows(rows, key, dir) {
  const d = dir || -1;
  return rows.slice().sort((a, b) => {
    if (key === 'score') return (a.score - b.score) * d;
    if (key === 'ts') return ((a.ts || 0) - (b.ts || 0)) * d;
    if (key === 'type') {
      const ta = (a.types || []).sort().join('+');
      const tb = (b.types || []).sort().join('+');
      if (tb !== ta) return tb.localeCompare(ta) * d;
      return (a.score - b.score) * d;          // tie-break by score
    }
    return 0;                                  // date order = stored order
  });
}

function reasonChartData() {
  const sims = loadSims();
  const acc = {};   // type -> { wrong: {reason: n}, right: {reason: n} }
  sims.forEach(x => (x.questions || []).forEach(q => {
    const t = q.type || 'sc';
    acc[t] = acc[t] || { wrong: {}, right: {} };
    if (q.reflWrong != null && REASONS_WRONG[q.reflWrong] != null)
      acc[t].wrong[REASONS_WRONG[q.reflWrong]] = (acc[t].wrong[REASONS_WRONG[q.reflWrong]] || 0) + 1;
    if (q.reflRight != null && REASONS_RIGHT[q.reflRight] != null)
      acc[t].right[REASONS_RIGHT[q.reflRight]] = (acc[t].right[REASONS_RIGHT[q.reflRight]] || 0) + 1;
  }));
  return acc;
}
/* horizontal bars with a red→yellow→green gradient fill and count labels */
function gradientBarChart(entries, kind) {
  const max = Math.max(1, ...entries.map(e => e[1]));
  const W = 520, H = 30;
  return entries.map(([label, v]) => {
    const pct = v / max;
    const g = kind === 'wrong'
      ? ['#c0392b', '#e07b39']          // red gradient
      : ['#7bb661', 'var(--green)'];    // green gradient
    return '<div style="display:flex;align-items:center;gap:8px;margin:4px 0">' +
      '<span dir="rtl" style="min-width:150px;font-size:12.5px;color:var(--ink)">' + label + '</span>' +
      '<div dir="ltr" style="flex:1;background:var(--frame-inner);border-radius:6px;height:22px;overflow:hidden;border:1px solid var(--line)">' +
      '<div style="width:' + Math.max(4, Math.round(100 * pct)) + '%;height:100%;border-radius:5px;' +
      'background:linear-gradient(90deg,' + g[0] + ',' + g[1] + ');' +
      'box-shadow:inset 0 -6px 10px rgba(0,0,0,.08)"></div></div>' +
      '<span style="min-width:24px;font-size:12.5px;font-weight:600">' + v + '</span></div>';
  }).join('');
}
function barChart(entries, color) {
  const max = Math.max(1, ...entries.map(e => e[1]));
  return entries.map(([label, v]) =>
    '<div style="display:flex;align-items:center;gap:8px;margin:3px 0">' +
    '<span dir="rtl" style="min-width:130px;font-size:12.5px;color:var(--muted)">' + label + '</span>' +
    '<div style="flex:1;background:var(--frame-inner);border-radius:4px;height:16px;overflow:hidden">' +
    '<div style="width:' + Math.round(100 * v / max) + '%;height:100%;background:' + color + '"></div></div>' +
    '<span style="min-width:22px;font-size:12.5px">' + v + '</span></div>').join('');
}

function renderProgress() {
  const p = progressStore();
  const srs = loadSRS();
  const cards = Object.values(srs.cards);
  const mastered = cards.filter(c => c.interval >= 7).length;
  const learning = cards.filter(c => c.interval > 0 && c.interval < 7).length;
  const lapsed = cards.filter(c => c.interval === 0).length;
  const he = t => ({ sc: 'השלמת משפטים', restate: 'ניסוח מחדש', reading: 'קריאה' }[t] || t);
  const rows = Object.keys(p.byType).map(t => {
    const d = p.byType[t];
    const pct = d.n ? Math.round(100 * d.ok / d.n) : 0;
    return '<tr><td>' + he(t) + '</td><td>' + d.n + '</td><td class="' + (pct >= 80 ? 'correct' : pct < 50 ? 'wrong' : '') + '">' + pct + '%</td></tr>';
  }).join('');
  const all = loadSims();
  const practiceMeta = (p.sims || []).filter(x => x.kind === 'practice');
  /* split: full sims vs practice blocks; each row carries its snapshot index */
  let simIdx = -1;
  const simRows = [];
  const pracRows = [];
  all.slice().forEach(x => {
    simIdx++;
    const typesLabel = (x.sections || []).map(s => ({ sc: 'השלמה', restate: 'ניסוח', reading: 'קריאה' }[s.type] || s.type)).join(' + ');
    const types = (x.sections || []).map(s => s.type);
    /* dominant source of the run: the most frequent q.src among its questions */
    const srcCount = {};
    (x.sections || []).forEach(s => (s.items || []).forEach(it => {
      const sc = (it.q && it.q.src) || 'מובנה';
      srcCount[sc] = (srcCount[sc] || 0) + 1;
    }));
    const srcList = Object.entries(srcCount).sort((a, b) => b[1] - a[1]);
    const srcLabel = srcList.length
      ? (srcList.length === 1
          ? (srcList[0][0] === 'מובנה' ? '✦ מובנה' : '📄 ' + srcList[0][0].replace(/\.pdf$/i, ''))
          : '📄 ' + srcList[0][0].replace(/\.pdf$/i, '') + ' +' + (srcList.length - 1))
      : '✦ מובנה';
    /* route BY MODE: practice snapshots also carry sections — the old
       "x.sections → simRows" bug put practice runs in the simulations table */
    if (x.mode === 'practice') {
      pracRows.push({ d: x.d, score: x.score, pct: x.pct, raw: x.raw, simIdx: all.indexOf(x), types, typesLabel, srcLabel });
    } else {
      simRows.push({ d: x.d, score: x.score, pct: x.pct, raw: x.raw, exitedEarly: x.exitedEarly, simIdx: all.indexOf(x), types, typesLabel, srcLabel });
    }
  });
  /* legacy progress-store practice entries (kindLabel) keep their type too */
  (p.sims || []).filter(x => x.kind === 'practice').forEach(x => {
    pracRows.push({ d: x.d, score: x.score, pct: x.pct, ts: x.ts, types: x.types || [], typesLabel: x.typesLabel || (x.types || []).map(t => ({ sc: 'השלמה', restate: 'ניסוח', reading: 'קריאה' }[t] || t)).join(' + ') || '' });
  });
  const heT = t => ({ sc: 'השלמה', restate: 'ניסוח', reading: 'קריאה' }[t] || t);
  const sortCtl = (key, label) =>
    '<button class="icon-btn" data-histsort="' + key + '" data-table="sim" style="border:1px solid var(--line);border-radius:4px;padding:2px 10px;cursor:pointer;font-size:12px;color:' + (histState.simSort === key ? 'var(--link-blue)' : 'var(--muted)') + '">' + label + '</button>';
  const sortCtlP = (key, label) =>
    '<button class="icon-btn" data-histsort="' + key + '" data-table="prac" style="border:1px solid var(--line);border-radius:4px;padding:2px 10px;cursor:pointer;font-size:12px;color:' + (histState.pracSort === key ? 'var(--link-blue)' : 'var(--muted)') + '">' + label + '</button>';
  const typeFilterP = ['all', 'sc', 'restate', 'reading'].map(t =>
    '<button class="icon-btn" data-histype="' + t + '" style="border:1px solid ' + (histState.pracType === t ? 'var(--link-blue)' : 'var(--line)') + ';color:' + (histState.pracType === t ? 'var(--link-blue)' : 'var(--muted)') + ';border-radius:4px;padding:2px 10px;cursor:pointer;font-size:12px">' + (t === 'all' ? 'הכול' : heT(t)) + '</button>').join('');
  var sortKey = histState.simSort;
  const simSorted = sortHistRows(simRows, histState.simSort, histState.simDir);
  sortKey = histState.pracSort;
  /* merge manually-recorded answers (הזנה ידנית) into the practice history */
  const manualRuns = (JSON.parse(localStorage.getItem('amirnetsim.manualruns.v1') || '[]')).map(function (m, i) {
    return { d: m.d, score: m.ok, total: m.total, batch: !!m.batch, pct: 100, manual: true,
             types: [m.type], typesLabel: m.type === 'sc' ? 'השלמה' : m.type === 'reading' ? 'קריאה' : 'ניסוח',
             srcLabel: '✍️ ' + (m.src || 'ליד'), idx: 'm' + i };
  });
  const pracSorted = sortHistRows(pracRows.concat(manualRuns).filter(x => histState.pracType === 'all' || (x.types || []).includes(histState.pracType)), histState.pracSort, histState.pracDir);
  const simHtml = simSorted.map(x =>
    '<tr><td>' + x.d + '</td><td><b>' + x.score + '</b></td><td>' + x.pct + '%' +
    (x.raw ? ' <span style="color:var(--muted);font-size:11.5px">(' + x.raw.total + ' שאלות)</span>' : '') +
    (x.exitedEarly ? ' <span style="color:var(--muted);font-size:11.5px">(הפסקה)</span>' : '') +
    '</td><td>' + (x.typesLabel || '') + '</td>' +
    '<td style="color:var(--muted);font-size:12px">' + (x.srcLabel || '✦ מובנה') + '</td>' +
    '<td><button class="icon-btn" data-viewsim="' + x.simIdx + '" style="border:1px solid var(--line);border-radius:4px;padding:2px 10px;cursor:pointer;font-size:12.5px;color:var(--link-blue)">צפייה</button></td></tr>').join('');
  const pracHtml = pracSorted.map(x => {
    const resCell = x.manual ? (x.batch ? x.score + '/' + x.total + ' נכונות' : (x.score ? 'נכון ✓' : 'לא נכון ✗')) : (x.raw ? x.raw.right + '/' + x.raw.total : '—');
    const lastCell = x.manual
      ? '<button class="icon-btn" data-editman="' + x.idx + '" style="border:1px solid var(--line);border-radius:4px;padding:2px 10px;cursor:pointer;font-size:12.5px;color:var(--link-blue)">✎ עריכה</button>'
      : '<button class="icon-btn" data-viewsim="' + x.simIdx + '" style="border:1px solid var(--line);border-radius:4px;padding:2px 10px;cursor:pointer;font-size:12.5px;color:var(--link-blue)">צפייה</button>';
    return '<tr><td>' + x.d + '</td><td><b>' + resCell + '</b></td><td>' + (x.manual ? '<span style="color:var(--muted);font-size:12px">הזנה ידנית</span>' : x.pct + '%') + '</td>' +
    '<td>' + (x.typesLabel || '') + '</td>' +
    '<td style="color:var(--muted);font-size:12px">' + (x.srcLabel || '✦ מובנה') + '</td>' +
    '<td>' + lastCell + '</td></tr>';
  }).join('');
/* gradient SVG diagram of scores over time (user request) */
function scoreDiagram(sims) {
  if (!sims.length) return '';
  const W = 560, H = 170, PADX = 34, PADY = 26;
  const scores = sims.map(x => x.score);
  const minS = Math.min(50, ...scores), maxS = Math.max(150, ...scores);
  const xs = i => PADX + (sims.length === 1 ? (W - PADX * 2) / 2 : (W - PADX * 2) * i / (sims.length - 1));
  const ys = v => PADY + (H - PADY * 2) * (1 - (v - minS) / Math.max(1, maxS - minS));
  const pts = scores.map((v, i) => [xs(i), ys(v)]);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  /* gradient stroke: red → yellow → green along the LINE via stops on x */
  const defs = '<defs><linearGradient id="scoregrad" x1="0" y1="0" x2="1" y2="0">' +
    '<stop offset="0" stop-color="#c0392b"/><stop offset="0.5" stop-color="#c9a227"/><stop offset="1" stop-color="var(--green)"/></linearGradient></defs>';
  const y134 = ys(134);
  const y134Line = y134 >= PADY && y134 <= H - PADY
    ? '<line x1="' + PADX + '" y1="' + y134.toFixed(1) + '" x2="' + (W - PADX) + '" y2="' + y134.toFixed(1) + '" stroke="#2e7d32" stroke-dasharray="5 4" stroke-width="1.2" opacity="0.7"/>' +
      '<text x="' + (W - PADX + 2) + '" y="' + (y134 + 4).toFixed(1) + '" font-size="10" fill="#2e7d32">134 פטור</text>' : '';
  const dots = pts.map((p, i) =>
    '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="4.5" fill="' +
    (scores[i] >= 134 ? 'var(--green)' : scores[i] >= 100 ? 'var(--brand-blue)' : '#c9a227') + '" stroke="#fff" stroke-width="1.5"/>' +
    '<text x="' + p[0].toFixed(1) + '" y="' + (p[1] - 10).toFixed(1) + '" font-size="11" text-anchor="middle" fill="var(--ink)" font-weight="600">' + scores[i] + '</text>').join('');
  const dates = pts.map((p, i) =>
    '<text x="' + p[0].toFixed(1) + '" y="' + (H - 6) + '" font-size="10" text-anchor="middle" fill="var(--muted)">' + sims[i].d + '</text>').join('');
  return '<div dir="ltr" style="margin:4px 0 10px"><svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;max-width:640px;background:var(--frame-inner);border:1px solid var(--line);border-radius:8px">' +
    defs +
    '<line x1="' + PADX + '" y1="' + (H - PADY) + '" x2="' + (W - PADX) + '" y2="' + (H - PADY) + '" stroke="var(--line)"/>' +
    y134Line +
    '<path d="' + line + '" fill="none" stroke="url(#scoregrad)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>' +
    dots + dates +
    '</svg></div>';
}

  const trend = all.length >= 2
    ? (all[all.length - 1].score > all[0].score ? '📈 מגמת עלייה (' + all[0].score + ' ← ' + all[all.length - 1].score + ')'
       : all[all.length - 1].score < all[0].score ? '📉 ירידה — כדאי תרגול נוסף (' + all[0].score + ' ← ' + all[all.length - 1].score + ')'
       : 'מגמה יציבה')
    : 'עוד אין מספיק סימולציות למגמה';
  $$('progress-body').innerHTML =
    (isPhoneDevice() ? '' :
    '<details style="margin-bottom:14px"><summary dir="rtl" style="cursor:pointer;color:var(--muted);font-size:13.5px">👥 ניהול משתמשות (' + listUsers().length + ')</summary>' +
    '<div style="margin-top:8px">' +
    listUsers().map(u => {
      const active = u.user === activeUser();
      return '<div dir="rtl" style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--line)">' +
        '<span>' + u.user + (active ? ' <span style="color:var(--green);font-size:12px">(פעילה)</span>' : '') +
        (u.passHash ? ' <span style="font-size:11.5px;color:var(--muted)">🔒</span>' : '') + '</span>' +
        (active ? '<span style="font-size:12px;color:var(--muted)">—</span>'
                : '<button class="icon-btn" data-del-user="' + u.user + '" style="border:1px solid #c0392b;color:#c0392b;border-radius:4px;padding:4px 12px;cursor:pointer;font-size:12.5px">מחיקה</button>') +
        '</div>';
    }).join('') +
    '<div style="font-size:12px;color:var(--muted);margin-top:6px">מחיקת משתמשת מוחקת את כל הנתונים שלה מהמחשב זה. לא ניתן למחוק את המשתמשת הפעילה — עברי אליה קודם.</div>' +
    '</div></details>') +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">' +
    '<button class="icon-btn" id="btn-vocab-browse" style="border:1px solid var(--link-blue);color:var(--link-blue);border-radius:4px;padding:6px 14px;cursor:pointer;font-size:13px">📋 רשימות מילים וסימון ✓/↻</button>' +
    '<button class="icon-btn" id="btn-vocab-drill" style="border:1px solid var(--line);color:var(--ink);border-radius:4px;padding:6px 14px;cursor:pointer;font-size:13px">🎴 לאימון אוצר מילים</button>' +
    '</div>' +
    '<h3 style="margin:14px 0 6px">התקדמות בציונים לאורך זמן</h3>' +
    scoreDiagram(simRows.slice().sort((a, b) => a.simIdx - b.simIdx)) +
    '<h3 style="margin:14px 0 6px">היסטוריית סימולציות</h3>' +
    '<div style="display:flex;gap:6px;margin-bottom:6px"><span style="font-size:12px;color:var(--muted);align-self:center">מיון:</span>' +
    '<button class="icon-btn" data-histsort="date" data-table="sim" style="border:1px solid ' + (histState.simSort === 'date' ? 'var(--link-blue)' : 'var(--line)') + ';border-radius:4px;padding:2px 10px;cursor:pointer;font-size:12px;color:' + (histState.simSort === 'date' ? 'var(--link-blue)' : 'var(--muted)') + '">תאריך</button>' +
    '<button class="icon-btn" data-histsort="score" data-table="sim" style="border:1px solid ' + (histState.simSort === 'score' ? 'var(--link-blue)' : 'var(--line)') + ';border-radius:4px;padding:2px 10px;cursor:pointer;font-size:12px;color:' + (histState.simSort === 'score' ? 'var(--link-blue)' : 'var(--muted)') + '">ציון</button>' +
    '<button class="icon-btn" data-histsort="type" data-table="sim" style="border:1px solid ' + (histState.simSort === 'type' ? 'var(--link-blue)' : 'var(--line)') + ';border-radius:4px;padding:2px 10px;cursor:pointer;font-size:12px;color:' + (histState.simSort === 'type' ? 'var(--link-blue)' : 'var(--muted)') + '">סוג שאלות</button>' +
    '</div>' +
    (simHtml.length ? '<table><thead><tr><th>תאריך</th><th>ציון אמירנט</th><th>נכונות</th><th>פרקים</th><th>מקור</th><th></th></tr></thead><tbody>' + simHtml + '</tbody></table>'
      : '<p style="color:var(--muted)">עדיין לא השלמת סימולציה מלאה.</p>') +
    '<h3 style="margin:22px 0 8px">היסטוריית תרגולים</h3>' +
    '<div style="display:flex;gap:6px;margin-bottom:6px;flex-wrap:wrap"><span style="font-size:12px;color:var(--muted);align-self:center">מיון:</span>' +
    '<button class="icon-btn" data-histsort="date" data-table="prac" style="border:1px solid ' + (histState.pracSort === 'date' ? 'var(--link-blue)' : 'var(--line)') + ';border-radius:4px;padding:2px 10px;cursor:pointer;font-size:12px;color:' + (histState.pracSort === 'date' ? 'var(--link-blue)' : 'var(--muted)') + '">תאריך</button>' +
    '<button class="icon-btn" data-histsort="score" data-table="prac" style="border:1px solid ' + (histState.pracSort === 'score' ? 'var(--link-blue)' : 'var(--line)') + ';border-radius:4px;padding:2px 10px;cursor:pointer;font-size:12px;color:' + (histState.pracSort === 'score' ? 'var(--link-blue)' : 'var(--muted)') + '">ציון</button>' +
    '<span style="font-size:12px;color:var(--muted);align-self:center;margin-inline-start:10px">סוג:</span>' + typeFilterP + '</div>' +
    (pracSorted.length ? '<table><thead><tr><th>תאריך</th><th>גולמי</th><th>אחוז</th><th>סוג</th><th>מקור</th><th></th></tr></thead><tbody>' + pracHtml + '</tbody></table>'
      : '<p style="color:var(--muted)">עדיין אין תרגולים.</p>') +
    '<h3 style="margin:22px 0 8px">שיפור לפי סוג שאלה</h3>' +
    '<table><thead><tr><th>סוג</th><th>נענו</th><th>הצלחה</th></tr></thead><tbody>' + rows + '</tbody></table>' +
    '<h3 style="margin:22px 0 8px">סיבות כשל/הצלחה לפי סוג שאלה</h3>' +
    reasonChartHtml() +
    '<h3 style="margin:22px 0 8px">אוצר מילים</h3>' +
    '<p>סה״כ כרטיסים: <b>' + cards.length + '</b> · שולטת בהן (מרווח 7+ ימים): <b>' + mastered + '</b> · בלימוד: <b>' + learning + '</b> · דורשות חזרה: <b>' + lapsed + '</b></p>';
}
function paintProgressHome() { /* reserved: home-side progress snapshot */ }

/* full replay of one past simulation (user request: review + analyze + hard words) */
function viewSim(i) {
  const sims = loadSims();
  const x = sims[i];
  if (!x) return;
  const he = t => ({ sc: 'השלמת משפטים', restate: 'ניסוח מחדש', reading: 'קריאה' }[t] || t);
  const secRows = (x.sections || []).map(s =>
    '<tr><td>' + he(s.type) + '</td><td class="' + (s.r === s.t ? 'correct' : s.r < s.t / 2 ? 'wrong' : '') + '">' + s.r + '/' + s.t + '</td><td><span dir="ltr">' + fmt(s.time) + '</span></td></tr>').join('');
  const hw = (x.hardWords || []);
  const hwHtml = hw.length
    ? hw.map(w => '<span style="display:inline-block;border:1px solid var(--line);border-radius:12px;padding:2px 10px;margin:3px;font-size:13px;background:var(--frame-inner)">' + w + '</span>').join('') +
      '<div style="margin-top:8px"><button class="icon-btn" id="btn-hw-to-srs" style="border:1px solid var(--link-blue);color:var(--link-blue);border-radius:4px;padding:4px 12px;cursor:pointer;font-size:12.5px">➕ הוספת כל המילים לאוצר שלי (SRS)</button></div>'
    : '<span style="color:var(--muted)">אין מילים קשות לחילוץ בסימולציה הזאת 🎉</span>';
  const qs = (x.questions || []).map((q, k) => {
    const mineTxt = q.mine == null ? 'לא נענתה' : (q.options[q.mine] || '—');
    const corrTxt = q.options[q.correct] || '—';
    return '<details class="qreview' + (q.flagged ? ' flagged' : '') + '" style="border:1px solid var(--line);border-radius:6px;padding:8px 10px;margin:8px 0">' +
      '<summary style="cursor:pointer;font-size:14px">' +
      '<span style="color:' + (q.ok ? 'var(--green)' : '#c0392b') + ';font-weight:700">' + (q.ok ? '✓' : '✕') + '</span>' +
      (q.flagged ? ' <span title="סומן">⚑</span>' : '') +
      ' <b>' + he(q.type) + '</b> · שאלה ' + (q.qi + 1) +
      (q.qTime != null ? ' <span style="color:var(--muted);font-size:12px"><span dir="ltr">⏱ ' + fmt(q.qTime) + '</span></span>' : '') +
      '<div dir="ltr" style="font-size:13px;color:var(--muted);margin-top:3px">' + (q.stem || '').slice(0, 90) + '…</div>' +
      '</summary>' +
      '<div style="margin-top:8px;font-size:13.5px">' +
      '<div dir="ltr">' + (q.stem || '') + '</div>' +
      '<div style="margin-top:6px">תשובתך: <span style="color:' + (q.ok ? 'var(--green)' : '#c0392b') + '">' + mineTxt + '</span></div>' +
      '<div>התשובה הנכונה: <span style="color:var(--green)">' + corrTxt + '</span></div>' +
      (q.flagged ? '<div style="color:#8a6d00;margin-top:4px">⚑ סימנת את השאלה הזאת</div>' : '') +
      ((q.reflWrong != null || q.reflRight != null) ?
        '<div style="color:var(--muted);font-size:12.5px;margin-top:4px">' +
        (q.reflWrong != null ? '<div>סיבת כשל: ' + REASONS_WRONG[q.reflWrong] + '</div>' : '') +
        (q.reflRight != null ? '<div>סיבת הצלחה: ' + REASONS_RIGHT[q.reflRight] + '</div>' : '') + '</div>' : '') +
      '</div></details>';
  }).join('');
  $$('progress-body').innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
    '<h3 style="margin:0">סימולציה מ־' + x.d + ' · ציון <b>' + x.score + '</b> (' + x.pct + '%)' + (x.exitedEarly ? ' · הפסקה באמצע' : '') + '</h3>' +
    '<button class="icon-btn" id="btn-sim-back" style="border:1px solid var(--line);border-radius:4px;padding:4px 12px;cursor:pointer;color:var(--ink)">↩ חזרה להתקדמות</button></div>' +
    '<h3 style="margin:12px 0 6px">פירוט לפי פרקים</h3>' +
    '<table><thead><tr><th>פרק</th><th>הצלחה</th><th>זמן</th></tr></thead><tbody>' + secRows + '</tbody></table>' +
    '<h3 style="margin:18px 0 6px">מילים שהתקשית בהן (' + hw.length + ')</h3>' +
    '<div>' + hwHtml + '</div>' +
    '<h3 style="margin:18px 0 6px">כל השאלות (' + (x.questions || []).length + ')</h3>' +
    qs;
  $$('btn-sim-back').onclick = () => renderProgress();
  const addBtn = document.getElementById('btn-hw-to-srs');
  if (addBtn) addBtn.onclick = () => {
    (x.hardWords || []).forEach(w => srsAddWord(w, { deck: 'mine' }));
    addBtn.textContent = 'נוספו לאוצר ✓ — זמינות בחפיסה "המילים שסימנתי"';
    setTimeout(() => { addBtn.textContent = 'נוסף לאוצר ✓'; }, 1600);
  };
  document.querySelectorAll('[data-viewsim]').forEach(btn => {
    btn.onclick = () => viewSim(+btn.dataset.viewsim);
  });
}
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-viewsim]');
  if (btn) viewSim(+btn.dataset.viewsim);
  const sb = e.target.closest('[data-histsort]');
  if (sb) {
    const key = sb.dataset.histsort;
    const isSim = sb.dataset.table === 'sim';
    if (isSim) {
      histState.simDir = (histState.simSort === key) ? -histState.simDir : -1;
      histState.simSort = key;
    } else {
      histState.pracDir = (histState.pracSort === key) ? -histState.pracDir : -1;
      histState.pracSort = key;
    }
    renderProgress();
  }
  const tb = e.target.closest('[data-histype]');
  if (tb) { histState.pracType = tb.dataset.histype; renderProgress(); }
});
$$('btn-progress-exit').onclick = () => { paintLastResult(); show('scr-home'); };
document.addEventListener('click', e => {
  if (e.target.id === 'btn-vocab-browse') openDeckBrowser('common');
  if (e.target.id === 'btn-vocab-drill') startVocab('common');
});
$$('btn-vocab-exit').onclick = () => show('scr-home');

/* ---------------- double-click word → add to vocab ---------------- */
/* works anywhere: passages, questions, results. A small popup offers
   'add to vocabulary' (+ Gemini settings shortcut). The word goes to the
   'mine' deck and is drilled with SRS. */
(function () {
  let pop = null;
  function closePop() { if (pop) { pop.remove(); pop = null; } }
  document.addEventListener('dblclick', e => {
    const sel = (window.getSelection && window.getSelection().toString().trim()) || '';
    const word = (sel || '').split(/\s+/)[0].replace(/[^A-Za-z'-]/g, '').toLowerCase();
    closePop();
    if (!word || word.length < 2) return;
    pop = document.createElement('div');
    pop.id = 'vocab-pop';
    pop.style.cssText = 'position:fixed;z-index:9999;background:var(--frame-inner);border:1px solid var(--line);' +
      'border-radius:6px;box-shadow:var(--shadow);padding:6px 8px;display:flex;gap:6px;align-items:center;' +
      'font:13.5px var(--sans);color:var(--ink)';
    const add = document.createElement('button');
    add.textContent = '➕ הוספה לאוצר המילים';
    add.style.cssText = 'border:0;background:none;color:var(--link-blue);cursor:pointer;font:600 13.5px var(--sans);padding:4px 6px';
    add.onclick = ev => {
      ev.stopPropagation();
      const added = srsAddWord(word, { deck: 'mine' });
      pop.innerHTML = '';
      const msg = document.createElement('span');
      msg.style.cssText = 'padding:4px 6px;color:var(--green);font-weight:600';
      msg.textContent = added ? 'נוסף לאוצר המילים ✓' : 'כבר קיים באוצר';
      pop.appendChild(msg);
      /* fetch Hebrew right away (best effort) so the card is ready for the drill */
      srsEnsureHebrew({ en: word }).catch(() => {});
      setTimeout(closePop, 1400);
    };
    pop.appendChild(add);
    document.body.appendChild(pop);
    const r = window.getSelection().rangeCount ? window.getSelection().getRangeAt(0).getBoundingClientRect() : e;
    const top = Math.min(window.innerHeight - 60, (r.bottom || e.clientY) + 8);
    const left = Math.min(window.innerWidth - 220, Math.max(8, (r.left || e.clientX)));
    pop.style.top = top + 'px';
    pop.style.left = left + 'px';
    setTimeout(() => document.addEventListener('click', closePop, { once: true }), 0);
  });
  function closePop() { closePopInner(); }
  function closePopInner() { if (pop) { pop.remove(); pop = null; } }
})();
$$('btn-a11y').onclick = () => $$('a11y').classList.toggle('open');
/* back to main menu from inside an exam/practice — confirm so an accidental
   click doesn't silently abandon a running simulation */
$$('btn-home-menu').onclick = () => {
  if (confirm('לחזור לתפריט הראשי? המבחן הנוכחי ייסגר (אפשר לסיים קודם עם ✕ סיום כדי לקבל דוח).')) {
    stopTimer();
    paintLastResult();
    paintSourceNote();
    show('scr-home');
  }
};
$$('acc-night').onclick = e => { document.body.classList.toggle('night'); e.target.classList.toggle('on'); };
$$('acc-enlarge').onclick = e => { document.body.classList.toggle('enlarge'); e.target.classList.toggle('on'); };
$$('acc-cursor').onclick = e => { document.body.classList.toggle('bigcursor'); e.target.classList.toggle('on'); };
const marked = new Set();
$$('acc-mark').onclick = e => {
  const on = !document.body.classList.contains('mark-mode');
  document.body.classList.toggle('mark-mode', on);
  e.target.classList.toggle('on', on);
  document.querySelectorAll('button, input, label, .mode, a').forEach(el => {
    if (on) { el.dataset.mo = el.style.outline || ''; el.style.outline = '2px dashed #e08000'; }
    else { el.style.outline = el.dataset.mo || ''; }
  });
};

/* ---------------- entry / home wiring ---------------- */
function paintSourceNote() {
  const ub = loadUserBank();
  const empty = ub.sc.length + ub.restate.length + ub.reading.length === 0;
  $$('source-note').hidden = !empty;
}
/* ---------- multi-user entry flow (users.js) ---------- */
(function () {
  const sel = document.getElementById('sel-user');
  const note = document.getElementById('entry-note');
  const refreshUsers = () => {
    const users = listUsers();
    sel.innerHTML = '<option value="">— בחרי משתמשת —</option>' +
      users.map(u => '<option value="' + u.user + '">' + u.user + '</option>').join('');
  };
  window.refreshUserList = refreshUsers;
  refreshUsers();
  /* SIMPLE ENTRY (default everywhere): name only → saved forever */
  (function () {
    const who = document.getElementById('inp-who');
    const btn = document.getElementById('btn-enter');
    const note = document.getElementById('entry-note');
    /* remember the last used name */
    who.value = localStorage.getItem('amirnetsim.name') || '';
    document.getElementById('btn-enter').onclick = async () => {
      const nm = (who.value || '').trim();
      if (!nm) { note.textContent = 'הזיני שם (כדי שההתקדמות תישמר אצלך).'; return; }
      localStorage.setItem('amirnetsim.name', nm);
      /* personal profile: one namespace per name on this machine */
      const users = listUsers();
      let rec = users.find(x => x.user === nm);
      if (rec && rec.passHash) {
        /* this name has a password (registered via shared-computer) → ask */
        const pass = prompt('לשם "' + nm + '" יש סיסמה. הזיני אותה:') || '';
        if (!(await loginUser(nm, pass))) { note.textContent = 'סיסמה שגויה ל' + nm + '.'; return; }
      } else if (!rec) {
        await registerUser(nm, '', true);   // personal, passwordless
      }
      setActiveUser(nm);
      setName();
      paintHomeAfterLogin();
      show('scr-home');
      paintProgressHome();
    };
    /* Enter key in the name field submits */
    who.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('btn-enter').click(); });
  })();
  /* PHONE: same simple flow — name field doubles as the phone field */
  if (isPhoneDevice()) {
    document.getElementById('shared-wrap').style.display = 'none';
    const simpleWrap = document.getElementById('entry-simple');
    if (simpleWrap) simpleWrap.style.display = 'none';   /* phone uses its own name field */
    /* keep the old phone behavior: its own name + start button */
    document.getElementById('btn-login').style.display = 'none';
    const bundleDetails = document.getElementById('inp-bundle') && document.getElementById('inp-bundle').closest('details');
    if (bundleDetails) bundleDetails.style.display = 'none';
    document.getElementById('entry-phone-wrap').style.display = '';
    document.getElementById('btn-phone-start').onclick = () => {
      const nm = (document.getElementById('inp-phone-name').value || '').trim() || 'תלמידה';
      setActiveUser('phone');
      localStorage.setItem('amirnetsim.name', nm);
      setName();
      paintHomeAfterLogin();
      show('scr-home');
      paintProgressHome();
    };
  }
  document.getElementById('btn-login').onclick = async () => {
    const u = sel.value;
    const passEl = document.getElementById('inp-pass');
    const pass = passEl ? passEl.value : '';
    note.textContent = '';
    if (!u) { note.textContent = 'בחרי משתמשת.'; return; }
    /* private computer: users registered with NO password (empty) log in directly */
    const rec = listUsers().find(x => x.user === u);
    if (!rec) { note.textContent = 'בחרי משתמשת מהרשימה.'; return; }
    if (rec.passHash) {
      /* this user HAS a password → require it */
      if (!(await loginUser(u, pass))) { note.textContent = 'סיסמה שגויה למשתמשת ' + u + '.'; return; }
    } else if (pass.trim() !== '') {
      /* user saved without password → any typed password is wrong */
      note.textContent = 'למשתמשת זו אין סיסמה — השאירי את השדה ריק והיכנסי.';
      return;
    }
    setActiveUser(u);
    setName();
    paintHomeAfterLogin();
    show('scr-home');
    paintProgressHome();
  };
  document.getElementById('btn-register').onclick = async () => {
    const name = document.getElementById('inp-new-user').value.trim();
    const passEl = document.getElementById('inp-new-pass');
    const pass = passEl ? passEl.value : '';
    note.textContent = '';
    /* empty password = allowed (private computer): user logs in with one click */
    const err = await registerUser(name, pass, true);
    if (err) { note.textContent = err; return; }
    refreshUsers();
    sel.value = name.trim();
    document.getElementById('inp-new-user').value = '';
    if (passEl) passEl.value = '';
    note.style.color = 'var(--green)';
    note.textContent = 'המשתמשת נוצרה ✓ — בחרי אותה והיכנסי.';
  };
  /* bundle import */
  const bundleInput = document.getElementById('inp-bundle');
  document.getElementById('btn-import-bundle').onclick = () => bundleInput.click();
  bundleInput.onchange = async () => {
    const f = bundleInput.files && bundleInput.files[0];
    if (!f) return;
    const pass = prompt('בחרי סיסמה למשתמשת המיובאת (4+ תווים):') || '';
    if (pass.length < 4) { document.getElementById('bundle-note').textContent = 'סיסמה קצרה מדי — הייבוא בוטל.'; return; }
    const err = await importUserBundle(f, pass);
    const bn = document.getElementById('bundle-note');
    if (err) { bn.textContent = err; return; }
    bn.style.color = 'var(--green)';
    bn.textContent = 'החבילה יובאה ✓ — בחרי את המשתמשת והיכנסי.';
    refreshUsers();
  };
  /* first-run migration: if there is old data and no users yet, create a default user */
  (async function migrateOld() {
    const users = listUsers();
    if (users.length) { refreshUsers(); return; }
    const hasOldData = PER_USER_KEYS.some(k => _origGetItem(k) != null);
    const defName = hasOldData ? 'משתמשת ראשית' : 'נבחן לדוגמה';
    /* passwordless default: on a personal device no password should block entry */
    await registerUser(defName, '', true);
    if (hasOldData) {
      /* move the legacy data into the new user's namespace */
      PER_USER_KEYS.forEach(k => {
        const raw = _origGetItem(k);
        if (raw != null) { _origSetItem(ukey(k, defName), raw); _origRemoveItem(k); }
      });
      _origSetItem('amirnetsim.migrated', defName);
    }
    refreshUsers();
    sel.value = defName;
    note.style.color = 'var(--muted)';
    note.textContent = hasOldData
      ? 'הנתונים הקיימים הועברו למשתמשת "' + defName + '" — לחצי "כניסה" (אין סיסמה). אפשר להוסיף סיסמה בהגדרות.'
      : 'נוצרה משתמשת לדוגמה "' + defName + '" — לחצי "כניסה" (אין סיסמה). אפשר ליצור משתמשת משלך.';
  })();
})();

/* legacy btn-login body — merged INTO the users-flow handler (users IIFE owns
   the click; this paints home AFTER successful login) */
function paintHomeAfterLogin() {
  $$('home-name').textContent = localStorage.getItem('amirnetsim.name') || activeUser() || 'נבחן';
  const hasBank = Object.values((typeof loadUserBank === 'function') ? loadUserBank() : {}).some(arr => arr.length);
  const hintEl = document.getElementById('home-hint-new');
  if (hintEl) {
    hintEl.style.display = hasBank ? 'none' : '';
    if (!hasBank) hintEl.textContent = '💡 מתחילים כאן: לחצי על "ייבוא PDF" והעלי את קובץ האמירנט שלך — או תרגלי עם השאלות המובנות מיד.';
  }
  paintLastResult();
  paintSourceNote();
  if (typeof paintSavedKeyNote === 'function') paintSavedKeyNote();
}
  /* AI translation audit button */
  document.addEventListener('click', async function (e) {
    if (e.target.id !== 'btn-ai-audit') return;
    const btn = e.target;
    const st = document.getElementById('audit-status');
    if (btn.disabled) return;
    btn.disabled = true; btn.style.opacity = '0.6';
    try {
      const res = await window.aiAuditTranslations(function (msg, isErr) {
        if (st) { st.textContent = msg; st.style.color = isErr ? '#c0392b' : 'var(--muted)'; }
      });
      if (res && st) {
        st.textContent = '\u2705 \u05e0\u05d1\u05d3\u05e7\u05d5 ' + res.checked + ' \u00b7 \u05ea\u05d5\u05e7\u05e0\u05d5 ' + res.fixed + ' \u00b7 \u05e0\u05d5\u05e1\u05e4\u05d5 ' + res.missing + ' \u00b7 \u05ea\u05e7\u05d9\u05e0\u05d5\u05ea ' + res.ok;
        st.style.color = 'var(--green)';
      }
    } finally { btn.disabled = false; btn.style.opacity = ''; }
  });
/* manual-entry-card handler: record a manually-solved question as history */
  document.addEventListener('click', function (e) {
    if (e.target.id === 'me-ok') return;
    if (e.target.id !== 'btn-me-add') return;
    const type = document.getElementById('me-type').value;
    const src = (document.getElementById('me-src').value || '').trim() || 'מקור ליד';
    const okSel = document.getElementById('me-ok').value;
    const st = document.getElementById('me-status');
    /* date: user-chosen (YYYY-MM-DD → dd.mm.yyyy) or today */
    const dateInp = document.getElementById('me-date');
    let dTxt = new Date().toLocaleDateString('he-IL');
    if (dateInp && dateInp.value) {
      const p = dateInp.value.split('-');   /* yyyy-mm-dd */
      if (p.length === 3) dTxt = p[2] + '.' + p[1] + '.' + p[0];
    }
    /* batch mode: N correct out of M answered */
    const addBtnEl = document.getElementById('btn-me-add');
    const editing = addBtnEl.dataset ? addBtnEl.dataset.editing : null;
    const mi = editing != null && editing !== '' ? parseInt(editing, 10) : null;   /* add handler edit-aware */
    if (okSel === 'batch') {
      const right = Math.max(0, parseInt(document.getElementById('me-right').value, 10) || 0);
      const total = Math.max(1, parseInt(document.getElementById('me-total').value, 10) || 1);
      try {
        const store = JSON.parse(localStorage.getItem('amirnetsim.manualruns.v1') || '[]');
        const entry = { d: dTxt, type: type, ok: right, total: total, src: src, manual: true, batch: true, ts: Date.now() };
        if (mi != null && store[mi]) store[mi] = entry; else store.push(entry);
        localStorage.setItem('amirnetsim.manualruns.v1', JSON.stringify(store));
        if (st) {
          st.textContent = '✅ נשמר — ' + right + '/' + total + ' נכונות מהמקור "' + src + '"';
          st.style.color = 'var(--green)';
        }
        if (typeof renderProgress === 'function') renderProgress();
      } catch (err) {
        if (st) { st.textContent = 'שמירה נכשלה: ' + err.message; st.style.color = '#c0392b'; }
      }
      return;
    }
    const ok = okSel === '1';
    try {
      const store = JSON.parse(localStorage.getItem('amirnetsim.manualruns.v1') || '[]');
      const entry2 = { d: dTxt, type: type, ok: ok ? 1 : 0, total: 1, src: src, manual: true, ts: Date.now() };
      if (mi != null && store[mi]) store[mi] = entry2; else store.push(entry2);
      localStorage.setItem('amirnetsim.manualruns.v1', JSON.stringify(store));
      if (st) {
        st.textContent = '✅ נשמר — ההזנה תופיע בהיסטוריית התרגולים עם המקור "' + src + '"';
        st.style.color = 'var(--green)';
      }
      if (typeof renderProgress === 'function') renderProgress();
    } catch (err) {
      if (st) { st.textContent = 'שמירה נכשלה: ' + err.message; st.style.color = '#c0392b'; }
    }
  });
  /* show/hide the batch number fields when the mode changes */
  document.addEventListener('change', function (e) {
    if (e.target.id !== 'me-ok') return;
    const wrap = document.getElementById('me-batch-wrap');
    if (wrap) wrap.style.display = e.target.value === 'batch' ? 'flex' : 'none';
  });

/* editman handler: edit or delete a manual entry */
  document.addEventListener('click', function (e) {
    const ed = e.target.closest ? e.target.closest('[data-editman]') : null;
    if (!ed) return;
    const idx = ed.getAttribute('data-editman');
    const mi = parseInt(String(idx).replace('m', ''), 10);
    const store = JSON.parse(localStorage.getItem('amirnetsim.manualruns.v1') || '[]');
    const m = store[mi];
    if (!m) return;
    /* prefill the entry card with the stored values */
    document.getElementById('me-type').value = m.type;
    document.getElementById('me-src').value = m.src || '';
    document.getElementById('me-ok').value = m.batch ? 'batch' : String(m.ok ? 1 : 0);
    document.getElementById('me-ok').dispatchEvent(new Event('change', { bubbles: true }));
    if (m.batch) {
      document.getElementById('me-right').value = m.ok;
      document.getElementById('me-total').value = m.total;
    }
    /* prefill the date (stored dd.mm.yyyy → yyyy-mm-dd for the input) */
    const dateEl = document.getElementById('me-date');
    if (dateEl && m.d) {
      const dm = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(m.d);
      if (dm) dateEl.value = dm[3] + '-' + dm[2].padStart(2, '0') + '-' + dm[1].padStart(2, '0');
    }
    document.getElementById('me-status').innerHTML = 'עריכת רשומה מ־' + (m.d || '') + ' — עדכני ולחצי "הוסיפי להיסטוריה", או <a href="#" id="me-del" style="color:#c0392b">מחקי את הרשומה</a>';
    /* remember which index is being edited */
    document.getElementById('btn-me-add').dataset.editing = String(mi);
  });
  /* delete link inside the status line */
  document.addEventListener('click', function (e) {
    if (e.target.id !== 'me-del') return;
    e.preventDefault();
    const addBtn = document.getElementById('btn-me-add');
    const mi = parseInt(addBtn.dataset.editing || '', 10);
    if (isNaN(mi)) return;
    const store = JSON.parse(localStorage.getItem('amirnetsim.manualruns.v1') || '[]');
    store.splice(mi, 1);
    localStorage.setItem('amirnetsim.manualruns.v1', JSON.stringify(store));
    delete addBtn.dataset.editing;
    const st = document.getElementById('me-status');
    if (st) st.textContent = '🗑️ הרשומה נמחקה';
    if (typeof renderProgress === 'function') renderProgress();
  });

/* Terms of Use modal (entry screen + footer link) */
  /* auto-open on FIRST visit only; afterwards via button */
  window.addEventListener('load', () => {
    if (!localStorage.getItem('amirnetsim.termsSeen')) {
      const m0 = document.getElementById('terms-modal');
      if (m0) m0.style.display = 'flex';
    }
  });
  document.addEventListener('click', e => {
    if (e.target.id === 'btn-terms' || e.target.id === 'terms-link') {
      const m = document.getElementById('terms-modal');
      if (m) m.style.display = 'flex';
    }
    if (e.target.id === 'terms-close' || e.target.id === 'terms-x') {
      const m = document.getElementById('terms-modal');
      if (m) m.style.display = 'none';
      localStorage.setItem('amirnetsim.termsSeen', '1');   /* don't auto-show again */
    }
  });
  /* backdrop click closes; the ✕ button also */
  document.addEventListener('click', e => {
    const m = document.getElementById('terms-modal');
    if (!m) return;
    if (e.target === m) m.style.display = 'none';
  }, true);

  $$('btn-back-home').onclick = () => { paintLastResult(); show('scr-home'); };
$$('btn-again-drill').onclick = () => {
  /* re-run the same block type without leaving the flow */
  const lastType = S.sections && S.sections[0] ? S.sections[0].type : null;
  if (!lastType) return;
  const wasMode = S.mode === 'practice' ? 'practice' : 'express';
  startBlock(wasMode, lastType);
};
$$('btn-start-section').onclick = () => startSection();
$$('btn-intro-menu').onclick = () => {
  if (confirm('לחזור לתפריט הראשי? התרגול הנוכחי ייסגר.')) {
    paintLastResult();
    paintSourceNote();
    show('scr-home');
  }
};

/* ---------------- user bundle export / import / password ---------------- */
document.addEventListener('click', async e => {
  const delBtn = e.target.closest('[data-del-user]');
  if (delBtn) {
    const name = delBtn.dataset.delUser;
    if (!confirm('למחוק את המשתמשת "' + name + '" ואת כל הנתונים שלה? פעולה בלתי הפיכה.')) return;
    const rec = listUsers().find(x => x.user === name);
    const err = (rec && rec.passHash)
      ? await deleteUser(name, prompt('הזיני את סיסמת המשתמשת "' + name + '" לאישור המחיקה:') || '')
      : await deleteUser(name, '');
    if (err) { alert(err); return; }
    alert('המשתמשת "' + name + '" נמחקה עם כל הנתונים שלה.');
    renderProgress();
  }
  if (e.target.id === 'btn-export-bundle') {
    const fname = exportUserBundle();
    const note = document.getElementById('bundle-here-note');
    if (note) note.textContent = fname ? 'החבילה הורדה ✓ (' + fname + ') — שלחי אותה למחשב השני וייבאי שם.' : 'אין משתמשת פעילה.';
  }
  if (e.target.id === 'btn-import-bundle-here') document.getElementById('inp-import-bundle-here').click();
});
document.addEventListener('change', async e => {
  if (e.target.id !== 'inp-import-bundle-here') return;
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  const pass = prompt('בחרי סיסמה למשתמשת מהחבילה (4+ תווים):') || '';
  if (pass.length < 4) return;
  const err = await importUserBundle(f, pass);
  const note = document.getElementById('bundle-here-note');
  if (note) note.textContent = err || 'החבילה יובאה ✓ — צאי והיכנסי כמשתמשת החדשה.';
  e.target.value = '';
});
document.addEventListener('click', async e => {
  if (e.target.id !== 'btn-change-pass') return;
  const u = activeUser();
  if (!u) return;
  const oldP = prompt('הסיסמה הנוכחית:') || '';
  const newP = prompt('סיסמה חדשה (4+ תווים):') || '';
  const err = await changePassword(u, oldP, newP);
  const note = document.getElementById('bundle-here-note');
  if (note) note.textContent = err || 'הסיסמה שונתה ✓';
});

/* ---------------- data reset (start fresh) ---------------- */
/* Simple-entry model: no "main user" anymore — every logged-in user can run the
   FULL wipe, which resets the device (all profiles) after double confirmation. */
(function () {
  const note = $$('reset-note');
  const wipe = list => list.forEach(k => {
    localStorage.removeItem(k);                                   // legacy/global
    const u = activeUser();
    if (u) localStorage.removeItem(ukey(k, u));                   // user-namespaced
    listUsers().forEach(x => localStorage.removeItem(ukey(k, x.user)));  // all profiles on this device
  });
  $$('btn-reset-progress').onclick = () => {
    if (!confirm('למחוק את כל ההתקדמות, הדוחות והיסטוריית הסימולציות? השאלות שייבאת ומילות האוצר יישמרו.')) return;
    wipe(['amirnetsim.progress.v1', 'amirnetsim.sims.v1', 'amirnetsim.qsrs.v1', 'amirnetsim.everused.v1']);
    S.lastResult = null;
    $$('home-last').innerHTML = '';
    note.textContent = 'ההתקדמות נמחקה ✓ — השאלות והמילים נשמרו.';
    if (typeof renderProgress === 'function') renderProgress();
  };
  $$('btn-reset-all').onclick = () => {
    if (!confirm('איפוס מלא: יימחקו כל הנתונים במחשב/מכשיר זה — שאלות מיובאות, מקורות, התקדמות, מילים ומפתח Gemini. להמשיך?')) return;
    if (!confirm('פעולה זו אינה ניתנת לשחזור. לאשר מחיקת הכול?')) return;
    wipe(['amirnetsim.userbank.v1', 'amirnetsim.sources.v1', 'amirnetsim.progress.v1',
          'amirnetsim.sims.v1', 'amirnetsim.vocab.v1', 'amirnetsim.hecache.v1',
          'amirnetsim.gemini.key', 'amirnetsim.gemini.model', 'amirnetsim.qsrs.v1',
          'amirnetsim.selfmark.v1', 'amirnetsim.everused.v1', 'amirnetsim.drilldir',
          'amirnetsim.name']);
    S.lastResult = null;
    $$('home-last').innerHTML = '';
    note.style.color = 'var(--ink)';
    note.textContent = 'אופס בהצלחה — האפליקציה ריקה כמו בהתחלה.';
    if (typeof renderSources === 'function') renderSources();
    paintSourceNote();
  };
})();

document.addEventListener('click', e => {
  const mode = e.target.closest('.mode');
  if (!mode || !mode.dataset.mode) return;
  const m = mode.dataset.mode;
  if (m === 'vocab') startVocab('common');
  else if (m === 'progress') { renderProgress(); show('scr-progress'); }
  else if (m === 'express') askBlockType('express');
  else if (m === 'practice') askBlockType('practice');
  else if (m === 'import') startImport();
  else if (m === 'full') startFull($$('chk-adaptive').checked);
});

/* in-page modal instead of prompt() — prompt() is blocked by mobile browsers */
function askBlockType(mode) {
  const types = [['sc', UI.chooseType.sc], ['reading', UI.chooseType.reading], ['restate', UI.chooseType.restate]];
  const old = document.getElementById('blocktype-modal');
  if (old) old.remove();
  const wrap = document.createElement('div');
  wrap.id = 'blocktype-modal';
  wrap.style.cssText = 'position:fixed;inset:0;background:rgba(30,38,46,.62);backdrop-filter:blur(2px);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px';
  wrap.innerHTML =
    '<div dir="rtl" style="background:#ffffff;border:1px solid var(--header-line,#d3d7d9);border-radius:12px;padding:22px;max-width:380px;width:100%;box-shadow:0 12px 48px rgba(0,0,0,.35)">' +
    '<h3 style="margin:0 0 14px;font-size:17px;color:var(--brand-blue-deep,#20506f)">' + (mode === 'practice' ? 'מה לתרגל?' : 'איזה פרק?') + '</h3>' +
    types.map(([key, label]) =>
      '<button class="bt-opt" data-bt="' + key + '" style="display:block;width:100%;text-align:right;margin-bottom:9px;padding:14px 16px;border:1.5px solid var(--header-line,#d3d7d9);border-radius:8px;background:#f6f8fa;color:var(--brand-blue-deep,#20506f);font-size:15.5px;font-weight:600;cursor:pointer">' + label + '</button>'
    ).join('') +
    '<button id="bt-cancel" style="width:100%;margin-top:4px;padding:11px;border:1px solid var(--header-line,#d3d7d9);border-radius:8px;background:transparent;color:#8a949b;font-size:14px;cursor:pointer">ביטול</button>' +
    '</div>';
  document.body.appendChild(wrap);
  wrap.querySelectorAll('[data-bt]').forEach(b => b.onclick = () => { wrap.remove(); startBlock(mode, b.dataset.bt); });
  document.getElementById('bt-cancel').onclick = () => wrap.remove();
}