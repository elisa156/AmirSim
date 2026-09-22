/* ============================================================
   Question-SRS: long-term memory for QUESTIONS (not just words).
   amirnetsim.qsrs.v1: { [qid]: { streak, lapses, interval, due, fastOK, lastTs } }
   interval = in how many FINISHED SIMULATIONS the question stays away.
   Ladder (user-approved): correct+fast+no-guess → 1→2→3→7→14→30 sims;
   correct-but-slow → recheck in 3-5 sims; wrong/guessed → back in ~2 sims.
   ============================================================ */
const QSRS_KEY = 'amirnetsim.qsrs.v1';
function qSrsStore() {
  try { return JSON.parse(localStorage.getItem(QSRS_KEY) || '{}'); }
  catch (e) { return {}; }
}
function qSrsSave(s) { localStorage.setItem(QSRS_KEY, JSON.stringify(s)); }

const Q_INTERVALS = [1, 2, 3, 7, 14, 30];   // sims until next appearance

function qSrsGrade(qid, ok, fast, guessed) {
  const s = qSrsStore();
  const c = s[qid] || { interval: 0, streak: 0, lapses: 0 };
  c.lastTs = Date.now();
  /* softer resurfacing (user correction): the goal is to practice MORE questions
     and varied vocabulary, not to hammer the same one. Wrong/guessed questions
     reappear after 4-6 sims (not 0-2), and each repeat pushes further out. */
  if (!ok || guessed) {
    c.lapses = (c.lapses || 0) + 1;
    c.streak = 0;
    /* 1st lapse → 4 sims; each extra lapse → +1 more (4,5,6…) capped at 8 */
    c.due = Math.min(4 + (c.lapses - 1), 8);
    c.interval = c.due;
  } else if (fast && !guessed) {
    c.streak = (c.streak || 0) + 1;
    c.interval = Q_INTERVALS[Math.min(c.streak + 1, Q_INTERVALS.length - 1)];
    c.due = c.interval;
  } else {
    c.streak = (c.streak || 0) + 1;
    c.interval = 4;
    c.due = 4 + (c.streak || 0);
  }
  s[qid] = c;
  localStorage.setItem(QSRS_KEY, JSON.stringify(s));
}

function qSrsDue(qid) {
  const c = qSrsStore()[qid];
  if (!c) return true;
  return (c.due || 0) <= 0;
}
function qSrsMastered(qid) {
  const c = qSrsStore()[qid];
  return !!(c && c.interval >= 14);       // far out = mastered
}
function qSrsDecay() {
  const s = qSrsStore();
  Object.values(s).forEach(c => { if (c.due > 0) c.due--; });
  localStorage.setItem(QSRS_KEY, JSON.stringify(s));
}
function qSrsStats(qid) { return qSrsStore()[qid] || null; }