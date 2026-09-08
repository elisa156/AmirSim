/* ============================================================
   AMIRNETSIM — PDF importer
   Parses psychometric practice-exam PDFs, keeps only the English
   sections (sentence completion / restatements / reading), and
   stores them in a per-user bank in localStorage. The user is
   shown a confirm list before anything is saved.
   ============================================================ */

/* ---------------- personal bank (localStorage) ---------------- */
const USER_BANK_KEY = 'amirnetsim.userbank.v1';
const SOURCES_KEY = 'amirnetsim.sources.v1';
function loadSources() {
  try { return JSON.parse(localStorage.getItem(SOURCES_KEY) || '[]'); } catch (e) { return []; }
}
function saveSources(list) { localStorage.setItem(SOURCES_KEY, JSON.stringify(list)); }
function registerSource(name, counts) {
  const list = loadSources();
  list.push({ name, d: new Date().toLocaleDateString('he-IL'), ts: Date.now(), counts });
  saveSources(list);
  renderSources();
}
function deleteSource(i) {
  /* deleting a source removes its LAST-ADDED questions (matched by name in the
     source registry; per-question origin tags are stored as q.src) */
  const list = loadSources();
  const src = list[i];
  if (!src) return;
  list.splice(i, 1);
  saveSources(list);
  /* remove bank questions tagged with this source (fall back: none tagged → none removed) */
  const bank = loadUserBank();
  let removed = 0;
  ['sc', 'restate'].forEach(t => {
    const before = bank[t].length;
    bank[t] = bank[t].filter(q => q.src !== src.name);
    removed += before - bank[t].length;
  });
  bank.reading = bank.reading.filter(u => u.src !== src.name);
  saveUserBank(bank);
  renderSources();
}
function renderSources() {
  const box = document.getElementById('sources-list');
  if (!box) return;
  const list = loadSources();
  if (!list.length) { box.innerHTML = '<span style="color:var(--muted);font-size:13px">עדיין לא יובאו מקורות.</span>'; return; }
  box.innerHTML = list.map((s, i) =>
    '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--line)">' +
    '<span style="font-size:13.5px">' + s.name + ' <span style="color:var(--muted);font-size:12px">(' + s.d + ' · ' + s.counts + ')</span></span>' +
    '<button class="icon-btn" data-delsrc="' + i + '" style="border:1px solid #c0392b;color:#c0392b;border-radius:4px;padding:3px 10px;cursor:pointer;font-size:12.5px">מחיקה</button>' +
    '</div>').join('');
  box.querySelectorAll('[data-delsrc]').forEach(btn => {
    btn.onclick = () => { if (confirm('למחוק את המקור הזה ואת השאלות שיובאו ממנו?')) deleteSource(+btn.dataset.delsrc); };
  });
}

function loadUserBank() {
  try {
    const b = JSON.parse(localStorage.getItem(USER_BANK_KEY) || '{"sc":[],"restate":[],"reading":[]}');
    /* one-time relevel for banks saved before difficulty tagging (idempotent) */
    ['sc', 'restate'].forEach(t => (b[t] || []).forEach(q => {
      if (q.src_qn != null && q._releveled !== true) {
        q.level = levelForQ(t, q.src_qn, q.stem || q.text);
        q._releveled = true;
      }
    }));
    return b;
  }
  catch (e) { return { sc: [], restate: [], reading: [] }; }
}
function saveUserBank(bank) { localStorage.setItem(USER_BANK_KEY, JSON.stringify(bank)); }

/* merge extracted items into the bank, skipping duplicates by normalized stem.
   readingUnits: optional array of {title, paragraphs, questions} passage units —
   stored intact in bank.reading so poolFor() can serve them in practice. */
/* ---- difficulty estimation for imported questions ----
   NITE's own guide: within each domain, questions ascend in difficulty
   (position in the section = statistical difficulty from past examinees).
   Reading questions follow passage order → no position difficulty. */
let _nawlSet = null;
function nawlCount(text) {
  if (_nawlSet == null) {
    _nawlSet = (typeof COMMON_WORDS !== 'undefined')
      ? new Set(COMMON_WORDS.filter(w => w.band === 'nawl').map(w => w.en))
      : new Set();
  }
  return ((String(text).toLowerCase().match(/[a-z'-]{3,}/g) || []).filter(w => _nawlSet.has(w))).length;
}
function levelForQ(type, qn, stem) {
  if (type === 'reading') return 2;              // passage order, not difficulty
  let lv;
  if (type === 'sc') lv = qn <= 2 ? 1 : qn <= 5 ? 2 : 3;       // SC 1-8 ascending
  else lv = qn <= 10 ? 2 : 3;                                  // restate 9-12 ascending (harder domain)
  if (nawlCount(stem) >= 2 && lv < 3) lv++;                    // academic vocab bump
  return lv;
}

function norm(s) { return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 90); }
function mergedIntoBank(items, readingUnits) {
  const bank = loadUserBank();
  let added = 0, skipped = 0;
  const seen = new Set();
  Object.values(bank).forEach(arr => arr.forEach(q => seen.add(norm(q.stem || q.text))));
  items.forEach(it => {
    const key = norm(it.q.stem || it.q.text);
    if (!key || seen.has(key)) { skipped++; return; }
    seen.add(key);
    bank[it.type].push(it.q);
    added++;
  });
  /* passage units: dedupe by title+first-paragraph head, replace the whole unit */
  (readingUnits || []).forEach(u => {
    if (!u.paragraphs || !u.paragraphs.length || !u.questions || !u.questions.length) return;
    const key = norm(u.title) + '|' + norm(u.paragraphs[0]);
    if (seen.has(key)) { skipped += u.questions.length; return; }
    seen.add(key);
    bank.reading.push(u);
    added += u.questions.length;
  });
  saveUserBank(bank);
  return {
    added, skipped,
    /* reading entries are passage UNITS (each holds N questions) — count the
       questions inside, not the units, so the total matches what was reported */
    total: bank.sc.length + bank.restate.length +
           bank.reading.reduce((a, u) => a + ((u && u.questions && u.questions.length) || 0), 0)
  };
}

/* ---------------- answers from an answer-key PDF ---------------- */
/* Official NITE key: TWO English sections, each with its own numbering.
   Layout per section: אנגלית - פרק ראשון / מספר / <question numbers row> /
   השאלה / התשובה / <answers row> / הנכונה.
   pdf.js extracts both rows RIGHT-TO-LEFT (22 … 1); pypdf-like text may be
   merged digits ascending. We never assume order: every answer is zipped to
   the question number printed above it when counts match, else fallback
   ascending. Returns an array of maps — one per English section. */
function parseAnswerKeySections(pagesText) {
  const sections = [];
  const lines = pagesText.join('\n').split('\n').map(l => l.replace(/\s+/g, ' ').trim());

  let inEnglish = false;
  let current = null;
  let qnums = null;           // question-number row (as printed, any order)
  let pendingAnswers = false; // saw התשובה, waiting for the digits row

  const pushCurrent = () => {
    if (current && Object.keys(current).length) sections.push(current);
    current = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/^אנגלית/.test(line)) {
      pushCurrent();
      inEnglish = true; qnums = null; pendingAnswers = false;
      current = {};                        // new English section begins
      continue;
    }
    if (/^(חשיבה|כתיבה|מבנה|עברית|מתמטיקה)/.test(line)) {
      pushCurrent();
      inEnglish = false; continue;
    }
    /* ENGLISH SECTION HEADER (NITE books): a line that is ONLY the section
       name opens an English key section even without מפתח on the same line. */
    if (/^\s*(Sentence Completion|Restating|Reading Comprehension)\s*$/i.test(line)) {
      pushCurrent();
      inEnglish = true; qnums = null; pendingAnswers = false;
      current = {};
      continue;
    }
    /* MIRRORED inline key (pdf.js RTL): ') 2 (  . 1' = question 1, answer 2. */
    if (inEnglish && /\)\s*[1-4]\s*\(\s*\.?\s*\d{1,2}/.test(line)) {
      const toks = line.match(/\)\s*([1-4])\s*\(\s*\.\s*(\d{1,2})/g) || [];
      toks.forEach(tok => {
        const m2 = tok.match(/\)\s*([1-4])\s*\(\s*\.\s*(\d{1,2})/);
        if (m2) {
          const ans = parseInt(m2[1], 10) - 1;
          const qn = parseInt(m2[2], 10);
          if (current[qn] == null) current[qn] = ans;
        }
      });
      if (toks.length) continue;
    }
    /* INLINE KEY ROW (NITE digital books): "Sentence Completion  מפתח תשובות   1 . ( 2 ) ..." */
    if (/\b(Sentence Completion|Restating|Reading Comprehension)\b/i.test(line) && /מפתח/.test(line)) {
      pushCurrent();
      inEnglish = true; qnums = null; pendingAnswers = false;
      current = {};
    }
    /* MIRRORED inline key (pdf.js RTL): ') 2 (  . 1' = question 1, answer 2. */
    if (/\)\s*[1-4]\s*\(\s*\.?\s*\d{1,2}/.test(line)) {
      const toks = line.match(/\)\s*([1-4])\s*\(\s*\.\s*(\d{1,2})/g) || [];
      toks.forEach(tok => {
        const m2 = tok.match(/\)\s*([1-4])\s*\(\s*\.\s*(\d{1,2})/);
        if (m2) {
          const qn = parseInt(m2[2], 10);
          if (current[qn] == null) current[qn] = parseInt(m2[1], 10) - 1;
        }
      });
      if (toks.length) continue;
    }
    /* STANDALONE ENGLISH SECTION HEADER (NITE books): line is ONLY the name. */
    if (/^\s*(Sentence Completion|Restating|Reading Comprehension)\s*$/i.test(line)) {
      pushCurrent();
      inEnglish = true; qnums = null; pendingAnswers = false;
      current = {};
      continue;
    }
    /* INLINE 'מפתח תשובות' continuation rows (also LTR form) */
    if (inEnglish && (/מפתח\s*תשובות/.test(line) || /\d{1,2}\s*\.\s*\(\s*[1-4]\s*\)/.test(line))) {
      const inline = line.match(/(\d{1,2})\s*\.\s*\(\s*([1-4])\s*\)/g) || [];
      if (inline.length) {
        inline.forEach(tok => {
          const m2 = tok.match(/(\d{1,2})\s*\.\s*\(\s*([1-4])\s*\)/);
          if (m2) {
            const qn = parseInt(m2[1], 10);
            if (current[qn] == null) current[qn] = parseInt(m2[2], 10) - 1;
          }
        });
        continue;
      }
    }
    if (!inEnglish) continue;

    /* the מספר header: gather the question-numbers row(s) below it.
       NOTE: \b does not work after Hebrew letters in JS (\w is ASCII-only),
       so we anchor with a plain prefix match. */
    if (/^מספר/.test(line)) {
      const nums = [];
      let j = i + 1;
      while (j < lines.length && !/(השאלה|התשובה|מספר|אנגלית|חשיבה|מפתח)/.test(lines[j])) {
        const toks = lines[j].split(' ').filter(t => /^\d{1,2}$/.test(t));
        if (!toks.length) break;
        nums.push(...toks.map(Number));
        j++;
      }
      if (nums.length >= 8) qnums = nums;   // e.g. [22,21,…,1] (pdf.js RTL) or [1..N]
      continue;
    }

    if (/התשובה/.test(line)) { pendingAnswers = true; continue; }
    if (/^(הנכונה|השאלה)$/.test(line)) { continue; }

    if (pendingAnswers) {
      /* digits row: space-separated single digits (pdf.js) or a merged run (pypdf) */
      const digits = (line.match(/[1-4]/g) || []).map(Number);
      if (digits.length >= 8) {
        for (let k = 0; k < digits.length; k++) {
          /* zip each answer to its printed question number; if the numbers row
             is missing or misaligned, fall back to ascending 1..N */
          const qn = (qnums && qnums.length === digits.length) ? qnums[k] : k + 1;
          if (current[qn] == null) current[qn] = digits[k] - 1;   // 0-indexed
        }
        pendingAnswers = false;
        qnums = null;
      }
    }
  }
  pushCurrent();
  return sections;
}

function parseAnswerKey(pagesText) {
  const sections = parseAnswerKeySections(pagesText);
  return sections.length ? sections[0] : {};
}

/* ---------------- parsing extracted text ---------------- */
/* pages are split into "sessions" — each time question numbering restarts
   (1, 2, 3… after 20+) a new English section begins. Each session receives
   its own answer-key map (sections[k]). */
function splitOptionLine(t) {
  /* tolerate round/square/curly brackets and bare "1." markers */
  t = t.replace(/[\[\{]/g, '(').replace(/[\]\}]/g, ')');
  const parts = {};
  let m, count = 0;
  const re = /\(([1-4])\)\s+/g;
  const marks = [];
  while ((m = re.exec(t)) !== null) marks.push({ n: +m[1], at: m.index, after: re.lastIndex });
  for (let i = 0; i < marks.length; i++) {
    const end = i + 1 < marks.length ? marks[i + 1].at : t.length;
    parts[marks[i].n] = t.slice(marks[i].after, end).trim();
    count++;
  }
  if (!marks.length) {
    /* fallback "1. a 2. b ..." style */
    const m2 = /^([1-4])[.)]\s+(.*)$/.exec(t);
    if (!m2) return null;
    const rest = t.slice(m2[1].length + 1);
    const inner = rest.split(/\s+(?=[2-4][.)]\s)/);
    if (inner.length === 4) {
      inner.forEach((s, i) => parts[i + 1] = s.replace(/^[2-4][.)]\s*/, '').trim());
      count = 4;
    } else { parts[1] = m2[2]; count = 1; }
  }
  return count === 4 ? [parts[1], parts[2], parts[3], parts[4]] : null;
}

function parseExamPages(pages, keySections) {
  /* keySections: array of maps (one per English section). Back-compat: a plain
     map is wrapped. sessions[k] uses keySections[min(k, len-1)] */
  const keyArray = Array.isArray(keySections) ? keySections : [keySections || {}];
  const keyFor = k => keyArray[Math.min(k, keyArray.length - 1)] || {};

  const questions = [];
  let curQ = null;
  let mode = null;              // 'sc' | 'restate' | 'reading'
  let session = 0;              // index into keyArray
  let lastQn = 0;
  let curFile = null;           // origin file of the current question (multi-file import)
  const flush = () => {
    if (curQ && curQ.options.length === 4 && curQ.stemsWordsOK !== false && curQ.stemWords >= 3) {
      /* re-estimate with the complete stem (wrapped lines may add NAWL words) */
      curQ.level = levelForQ(mode, curQ._src, curQ.stem || curQ.text);
      if (curFile) curQ.srcFile = curFile;
      questions.push({ type: mode, q: curQ, session });
    }
    curQ = null;
  };

  for (const pageText of pages) {
    if (pageText.startsWith('@@@FILE:')) { curFile = pageText.replace('@@@FILE:', '').replace('@@@', '').trim(); continue; }
    const lines = pageText.replace(/[\[\{]/g, '(').replace(/[\]\}]/g, ')').split('\n');
    for (const raw of lines) {
      const t = raw.trim();
      if (!t) continue;

      /* passage start marker (Hebrew) */
      if (/(^|\s)(הקטע הבא|קטע קריאה|הקטע מתחיל)/.test(t)) mode = 'reading';

      const enRatio = (t.match(/[a-zA-Z]/g) || []).length / t.length;
      if (enRatio < 0.5) continue;

      const opts = splitOptionLine(t);
      const qm = /^(?:Question\s*)?(\d{1,2})\s*[.)]\s*(.*)$/.exec(t);
      /* a question line must carry a sentence-ish body, not be an option line */
      const isQuestionLine = qm && !opts && qm[2].length > 15;
      /* session detection: numbering restart (this qn <= lastQn) = new section */
      if (isQuestionLine) {
        const qn = +qm[1];
        if (lastQn >= 8 && qn <= lastQn - 4) { flush(); session++; }
        lastQn = qn;
      }

      /* section-type headlines — flush the pending question BEFORE switching
         mode, so the previous section's last question keeps its own type */
      if (/^restatements?\b/i.test(t)) { flush(); mode = 'restate'; continue; }
      if (/^sentence complet?ions?\b/i.test(t)) { flush(); mode = 'sc'; continue; }
      if (/^reading comprehension/i.test(t)) { flush(); mode = 'reading'; continue; }
      if (/text i+ \(questions/i.test(t)) { flush(); mode = 'reading'; continue; }
      /* the combined intro line ("...Completion, Restatement and Reading
         Comprehension...") must NOT switch modes */
      if (!mode) continue;

      if (isQuestionLine) {
        if (curQ) flush();
        const qn = +qm[1];
        let body = qm[2];
        /* SC: the PDF underline is lost in text extraction — it survives only as a
           multi-space gap. Restore a visible blank so the sentence makes sense. */
        if (mode === 'sc') body = body.replace(/\S(\s{2,})\S/g, m => m.replace(/\s{2,}/g, ' _____ '))
                                     .replace(/\S(\s{2,})$/, m => m.replace(/\s{2,}/, ' _____ '))
                                     .replace(/^(\s{2,})\S/, m => m.replace(/\s{2,}/, '_____ '));

        const key = keyFor(session);
        const correctIdx = key[qn] != null ? key[qn] : null;
        curQ = {
          stem: body,
          text: body,
          options: [],
          answer: correctIdx != null ? correctIdx : 0,
          level: levelForQ(mode, qn, body),
          exp: 'מיובא מבחינת עבר. אימתי את התשובה הנכונה במקור הרשמי.',
          _src: qn
        };
        curQ.stemWords = body.split(/\s+/).length;
        continue;
      }

      if (curQ && opts && curQ.options.length < 4) {
        curQ.options = opts;
        continue;
      }

      /* single option on its own line: "(1) The alarm sounded..." */
      let single = /^\(?([1-4])\)?[).\-–—:]*\s+(.+)$/.exec(t.replace(/[\[\{]/g, '(').replace(/[\]\}]/g, ')'));
      if (curQ && single && curQ.options.length < 4 && +single[1] === curQ.options.length + 1) {
        curQ.options.push(single[2].trim());
        continue;
      }

      /* continuation line: sentence wrapped over multiple lines */
      if (curQ && curQ.options.length === 0 && !qm && t.length > 2) {
        /* SC: restore the lost underline on wrapped lines too */
        let add = t;
        if (mode === 'sc') {
          add = add.replace(/\S(\s{2,})\S/g, m => m.replace(/\s{2,}/g, ' _____ '))
                   .replace(/^\s{2,}\S/, m => m.replace(/\s{2,}/, '_____ '))
                   .replace(/\S\s{2,}$/, m => m.replace(/\s{2,}/, ' _____ '));
          /* a vector-drawn underline never reaches the text layer: if the SC stem
             still has no blank, the join between the wrapped lines IS the blank */
          if (!curQ.stem.includes('_____') && !add.includes('_____')) {
            curQ.stem += ' _____ ';
          }
        }
        curQ.stem += ' ' + add;
        /* LEADING-BLANK FIX (user report): the PDF's blank sits at the END of
           the first wrapped line (trailing gap), but in the real exam the blank
           is at the START of the sentence. If the stem so far ends with a
           restored blank and the sentence continues, move the blank to the front. */
        if (mode === 'sc' && /\s*_____\s*$/.test(curQ.stem) && !/^_____/.test(curQ.stem)) {
          curQ.stem = curQ.stem.replace(/\s*_____\s*$/, '').trim();
          curQ.stem = '_____ ' + curQ.stem;
        }
        curQ.text = curQ.stem;
        curQ.stemWords = curQ.stem.split(/\s+/).length;
        continue;
      }
    }
  }
  flush();

  /* mark questions whose answer came from a real key (session-matched) */
  questions.forEach(q => {
    const key = keyFor(q.session);
    q.q.answerConfirmed = key[q.q._src] != null;
  });
  return questions;
}

/* reading-passage extraction v2: units bound to their questions.
   Official layout per reading part: "Reading Comprehension" → intro →
   "Text I (Questions 13-17)" → passage (with "(n)" line markers) →
   bare "Questions" line → 13. stem + (1)..(4) options → next headline.
   Units start ONLY at "Text N (Questions ...)"; "Reading Comprehension" and
   SC/Restatement headlines are section boundaries that close the current unit.
   Bare "Questions" must match an ENTIRE line — a passage line like
   "Question Bee on the radio..." would otherwise flip us into question mode. */
function extractPassageUnits(pages, keySections) {
  const keyArray = Array.isArray(keySections) ? keySections : (keySections ? [keySections] : []);
  const keyFor = k => keyArray[Math.min(k, keyArray.length - 1)] || {};
  const units = [];
  let cur = null;
  let inQuestions = false;
  let curQ = null;
  let session = 0;

  const flushQ = () => {
    if (cur && curQ && curQ.options.length === 4) {
      const key = keyFor(session);
      const correct = key[curQ._src] != null ? key[curQ._src] : 0;
      cur.questions.push({
        text: curQ.text, options: curQ.options, answer: correct,
        level: 2, exp: 'מיובא מבחינת עבר. אימתי את התשובה הנכונה במקור הרשמי.',
        answerConfirmed: key[curQ._src] != null
      });
    }
    curQ = null;
  };
  const flushUnit = () => {
    flushQ();
    if (cur && cur.questions.length) {
      cur.paragraphs = cur.paragraphs.filter(p => (p.match(/[a-zA-Z]/g) || []).length / p.length > 0.7);
      if (cur.paragraphs.join(' ').split(/\s+/).length > 40) units.push(cur);
    }
    cur = null;
    inQuestions = false;
  };

  for (const pageText of pages) {
    if (pageText.startsWith(String.fromCharCode(64,64,64) + "FILE:")) { window.__curFileUnit = pageText.replace("@@@FILE:","").replace("@@@","").trim(); continue; }
    const curFileUnit = window.__curFileUnit || null;
    for (const raw of pageText.replace(/[\[\{]/g, '(').replace(/[\]\}]/g, ')').split('\n')) {
      const t = raw.trim();
      if (!t) continue;
      const enRatio = (t.match(/[a-zA-Z]/g) || []).length / t.length;

      if (/^text\s+(?:[IVX]+|\d+)\s*\(questions/i.test(t)) {
        flushUnit();
        const label = t.replace(/\s*\(questions.*$/i, '').trim();
        /* 'Text I/II' are structural labels, not real passage titles — store empty
           so the app renders no heading (per user request) */
        const isLabel = /^text\s+(?:[IVX]+|\d+)$/i.test(label);
        cur = { title: isLabel ? '' : label, paragraphs: [], questions: [], srcFile: curFileUnit || null };
        continue;
      }
      if (/^reading comprehension/i.test(t)) {
        flushUnit(); session++; cur = null; inQuestions = false; continue;
      }
      if (/^sentence complet?ions?\b/i.test(t) || /^restatements?\b/i.test(t)) {
        flushUnit(); cur = null; inQuestions = false; continue;
      }
      if (!cur) continue;
      if (enRatio < 0.5) continue;

      if (/^questions?\.?:?\s*$/i.test(t)) { inQuestions = true; continue; }

      const opts = splitOptionLine(t);
      const qm = /^(?:Question\s*)?(\d{1,2})\s*[.)]\s*(.*)$/.exec(t);
      const isQ = qm && !opts && qm[2].length > 12;

      if (inQuestions && isQ) {
        flushQ();
        curQ = { text: qm[2], options: [], _src: +qm[1] };
        continue;
      }

      if (!inQuestions) {
        if (enRatio > 0.7 && cur.paragraphs.length < 40) cur.paragraphs.push(t);
        continue;
      }

      if (curQ && opts && curQ.options.length < 4) { curQ.options = opts; continue; }
      const single = /^\(?([1-4])\)?[).\u2013\u2014:]*\s+(.+)$/.exec(t);
      if (curQ && single && curQ.options.length < 4 && +single[1] === curQ.options.length + 1) {
        curQ.options.push(single[2].trim()); continue;
      }
      if (curQ && curQ.options.length === 0 && !qm && t.length > 2) {
        curQ.text += ' ' + t; continue;
      }
    }
  }
  flushUnit();
  return units;
}

/* ---------------- UI flow ---------------- */
let pendingExam = null;

function startImport() { show('scr-import'); resetImportStatus(); if (typeof renderSources === 'function') renderSources(); }

function resetImportStatus() {
  const el = $$('import-status');
  el.hidden = true; el.innerHTML = '';
  pendingExam = null;
}

function showStatus(html) {
  const el = $$('import-status');
  el.hidden = false;
  el.innerHTML = html;
}

function wireImporter() {
  const dz = $$('dropzone'), fi = $$('file-input');
  $$('btn-browse').onclick = e => { e.stopPropagation(); fi.click(); };
  dz.onclick = () => fi.click();
  dz.ondragover = e => { e.preventDefault(); dz.classList.add('drag'); };
  dz.ondragleave = () => dz.classList.remove('drag');
  dz.ondrop = e => {
    e.preventDefault(); dz.classList.remove('drag');
    handleFiles(e.dataTransfer.files);
  };
  fi.onchange = () => { handleFiles(fi.files); fi.value = ''; };
  $$('btn-import-exit').onclick = () => show('scr-home');
}

async function handleFiles(fileList) {
  const all = Array.from(fileList);
  const vocabFiles = all.filter(f => /\.(csv|tsv|txt)$/i.test(f.name));
  const files = all.filter(f => /\.pdf$/i.test(f.name));
  for (const vf of vocabFiles) {
    const added = await importVocabFile(vf);
    showStatus('<div class="imp-ok">נוספו ' + added + ' מילים מ־' + vf.name + ' לאוצר המילים.</div>');
    registerSourceFromVocab([vf]);
  }
  if (!files.length) {
    if (!vocabFiles.length) showStatus('<div class="imp-warn">לא נבחר קובץ PDF או CSV.</div>');
    return;
  }

  showStatus('<div class="imp-progress">קורא את הקבצים…</div>');

  let examPages = [], keyPages = [];
  let fileNames = [];             // per-file source registry entries
  try {
    for (const f of files) {
      fileNames.push(f.name);
      examPages.push('@@@FILE:' + f.name + '@@@');   // origin marker page
      const pages = await extractPdfText(f, (p, n) => {
        const pct = n ? Math.round(100 * p / n) : 0;
showStatus(`<div class="imp-progress">מחלצת טקסט מ־${f.name} — ${pct}% (עמוד ${p} מתוך ${n})</div>
            <div style="background:var(--frame-inner);border:1px solid var(--line);border-radius:6px;height:14px;overflow:hidden;margin-top:6px">
              <div style="width:${pct}%;height:100%;background:linear-gradient(90deg,var(--brand-blue),var(--green));transition:width .2s"></div>
            </div>`);
      });
      /* CONTENT-BASED key-page detection: one NITE file often contains BOTH
         questions and keys. A page that looks like a key page is duplicated to
         keyPages (parsed for answers); ALL pages also stay in examPages so the
         question parser sees the whole book. */
      const isKeyFile = /answer|key|מפתח/i.test(f.name);
      pages.forEach(p => {
        if (isKeyFile || /מפתח\s*תשובות/.test(p) || /(\d{1,2}\s*\.\s*\(\s*[1-4]\s*\)\s*){6,}/.test(p)) {
          keyPages.push(p);
        }
      });
      examPages = examPages.concat(pages);
    }
  } catch (err) {
    showStatus(`<div class="imp-warn">החילוץ נכשל: ${err.message}<br>נסי קובץ PDF עם טקסט נבחר (לא סריקה).</div>`);
    return;
  }

  if (!examPages.length && !keyPages.length) {
    showStatus('<div class="imp-warn">הקובצים שנבחרו לא הכילו טקסט.</div>');
    return;
  }

  const keySections = parseAnswerKeySections(keyPages.concat(examPages));
  var hqMaps = (window.__highQKeyMaps || []);
  if (!keySections.length && hqMaps.length) {
    hqMaps.forEach(function (m) { keySections.push(m); });
    window.__highQKeyMaps = [];
  }
  window.__impDebug = { keyPages, examPages, keySections };

  /* extract correct-answer marks embedded in the exam PDF itself:
     lines like "1. The answer is correct. V (X)" or "(V)" / "(X)" per question */
  const embedded = {};
  examPages.join('\n').split('\n').forEach(line => {
    let m;
    const re = /(\d{1,2})\s*[.)\-–—]*\s*(?:the answer is correct\.)?\s*[\(\[]?(?:([Vv✓])|([Xx✗✘]))[\)\]]?\.?\s*$/;
    if ((m = re.exec(line.trim())) !== null) {
      const qn = +m[1];
      if (qn >= 1 && qn <= 23 && embedded[qn] == null) embedded[qn] = m[2] ? 0 : 1;
    }
  });
  const hasKey = keySections.length > 0;
  const hasEmbedded = Object.keys(embedded).length > 0;
  const finalKey = hasKey ? keySections : (hasEmbedded ? [embedded] : []);

  const parsed = parseExamPages(examPages, finalKey);
  const preview = renderPreview(parsed, finalKey[0] || {});

  const keyNote = hasKey ? 'עם מפתח תשובות (' + keySections.length + ' פרקי אנגלית)'
    : hasEmbedded ? UI.importedAnswersFound
    : 'ללא מפתח (תשובה ראשונה סומנה זמנית — מומלץ לעלות מפתח תשובות)';

  showStatus(`
    <div class="imp-result">
      <h3 style="margin-top:0">נמצאו ${parsed.length} שאלות אנגלית — ${keyNote}</h3>
      <div class="imp-list">${preview}</div>
      <div style="display:flex;gap:10px;margin-top:14px">
        <button class="btn-primary" id="btn-import-save" style="width:auto;padding:11px 30px">שמירה במאגר האישי</button>
        <button class="icon-btn" id="btn-import-restart" style="border:1px solid var(--line);border-radius:4px;padding:8px 18px;cursor:pointer">ביטול</button>
      </div>
    </div>`);

  let importSourceName = '';
  if (parsed.length) {
    pendingExam = parsed;
    $$('btn-import-save').onclick = () => {
      /* per-file sources: each file = its own deletable source */
      importSourceName = (typeof files !== 'undefined' && files && files.length === 1 ? files[0].name : files.map(f => f.name).join(' + '));
      const perFile = {};
      parsed.forEach(q => { if (q.q.srcFile) perFile[q.q.srcFile] = (perFile[q.q.srcFile] || 0) + 1; });
      /* reading questions travel as passage UNITS (extractPassageUnits): keep their
         paragraphs+questions structure — poolFor() expects whole units, and flat
         questions inside bank.reading are silently invisible in practice. */
      const readingUnits = extractPassageUnits(examPages, finalKey);
      const items = pendingExam.filter(q => q.type !== 'reading').map(q => ({ type: q.type, q: {
        stem: q.q.stem, text: q.q.text, options: q.q.options,
        answer: q.q.answer, level: q.q.level || 2, src_qn: q.q._src, exp: q.q.exp,
        answerConfirmed: q.q.answerConfirmed,
        srcFile: q.q.srcFile
      }}));
      items.forEach(it => { it.q.src = it.q.srcFile || importSourceName; });
      readingUnits.forEach(u => { u.src = u.srcFile || importSourceName; });
      const res = mergedIntoBank(items, readingUnits);
      /* register each FILE separately so it can be deleted independently */
      Object.entries(perFile).forEach(([fname, cnt]) => registerSource(fname, cnt + ' שאלות'));
      const untagged = res.added - Object.values(perFile).reduce((a, b) => a + b, 0);
      if (untagged > 0) registerSource(importSourceName, untagged + ' שאלות');
      showStatus(`<div class="imp-ok">נוספו ${res.added} שאלות חדשות למאגר (${res.skipped} כפולות דולגו). סה״כ במאגר האישי: ${res.total}.</div>`);
    };
  }
  $$('btn-import-restart').onclick = resetImportStatus;
}

/* without a key, index the longest option as the presumed correct one? No —
   we simply mark option 1 and flag it in the preview for manual fix later */
function buildDefaultKey(pages) {
  /* naive: questions renumbered 1..n; all answers = 1 for now */
  return null;
}

function esc(s) { return (s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function renderPreview(parsed, keyMap) {
  return parsed.slice(0, 60).map((p, i) => {
    const q = p.q;
    const stem = (q.stem || q.text || '').slice(0, 110);
    const tag = p.type === 'sc' ? 'השלמת משפטים' : p.type === 'restate' ? 'ניסוח מחדש' : 'קריאה';
    const opts = q.options.length === 4
      ? `<div class="imp-opts">${q.options.map((o, j) => `<span class="${j === q.answer ? 'right' : ''}">${j + 1}. ${o.slice(0, 40)}</span>`).join('')}</div>`
      : '<div class="imp-opts imp-bad">לא זוהו 4 תשובות — לא יישמר</div>';
    return `<div class="imp-item"><span class="imp-tag">${tag}</span> <span dir="ltr">${stem}…</span>${opts}</div>`;
  }).join('') + (parsed.length > 60 ? `<div class="imp-more">…ועוד ${parsed.length - 60}</div>` : '');
}

/* wire on load — the script tag sits at the end of body, DOM is ready */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', wireImporter);
} else {
  wireImporter();
}

/* CSV vocab import → register in the sources list too (deletable) */
function registerSourceFromVocab(files) {
  try {
    const key = 'amirnetsim.sources.v1';
    const list = JSON.parse(localStorage.getItem(key) || '[]');
    files.forEach(f => list.push({ name: f.name, d: new Date().toLocaleDateString('he-IL'), ts: Date.now(), kind: 'vocab' }));
    localStorage.setItem(key, JSON.stringify(list.slice(-40)));
    if (typeof renderSources === 'function') renderSources();
  } catch (e) {}
}


/* ---------- CSV/TSV vocab import (Anki / Quizlet / spreadsheets) ---------- */
function parseVocabCSV(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const seps = ['\t', ';', ','];
  let best = '\t', bestScore = -1;
  seps.forEach(sep => {
    let score = 0;
    lines.slice(0, 30).forEach(l => {
      const cells = l.split(sep).map(c => c.trim().replace(/^"|"$/g, ''));
      if (cells.length >= 2 && cells[0] && cells[1]) score++;
    });
    if (score > bestScore) { bestScore = score; best = sep; }
  });
  /* WORDS-ONLY CSV: rows with an empty second column are kept with he='' —
       the app's background translation (MyMemory/AI) fills them later. */
  return lines.map(l => l.split(best).map(c => c.trim().replace(/^"|"$/g, '')))
    .filter(cells => cells.length >= 1 && cells[0])
    .filter(cells => cells.length < 2 || cells[1] || true)
    .filter(cells => !/^(front|term|word|english|en)$/i.test(cells[0].trim()))   /* header row even when he is empty */
    .map(cells => ({ en: cells[0], he: (cells[1] && /[\u0590-\u05FF]/.test(cells[1])) ? cells[1] : '', ex: cells[2] || '' }));
}

async function importVocabFile(file) {
  const text = await file.text();
  const rows = parseVocabCSV(text);
  if (!rows.length) { showStatus('<div class="imp-warn">לא נמצאו מילים בקובץ — צריך שתי עמודות (מילה, תרגום).</div>'); return 0; }
  const cache = heCache();
  let added = 0;
  rows.forEach(r => {
    if (cache[r.en] && cache[r.en].manual) return;   // user-edited words win
    if (r.he) {                                      /* he may be empty (words-only CSV) */
      cache[r.en] = { he: r.he, ex: r.ex || '', manual: true, source: file.name };
    }
    added++;
  });
  heCacheSave(cache);
  const s = loadSRS();
  rows.forEach(r => {
    if (!s.cards[r.en]) {
      s.cards[r.en] = { en: r.en, he: r.he, ex: r.ex || '', deck: 'mine', reps: 0, streak: 0, lapses: 0, interval: 0, due: 0, first: Date.now() };
    } else if (!s.cards[r.en].he) { s.cards[r.en].he = r.he; }
  });
  saveSRS(s);
  return added;
}
