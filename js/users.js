/* ============================================================
   users.js — multi-user support + export/import bundle.
   Storage layout (localStorage, per-user namespacing):
     amirnetsim.users.v1 = [{ user, passHash, created }]
     amirnetsim.activeUser = 'elisa'
     per-user data keys: <KEY>@<user>  e.g. amirnetsim.sims.v1@elisa
   Keys that are per-user: userbank, sources, progress, sims, vocab,
     hecache, gemini.key, gemini.model, qsrs, selfmark, everused, drilldir
   Global (shared): users list itself.
   Passwords: SHA-256 hash (no plaintext).
   Export: single .json bundle with all per-user keys → import creates a new user.
   ============================================================ */
'use strict';
const USERS_KEY = 'amirnetsim.users.v1';
const ACTIVE_USER_KEY = 'amirnetsim.activeUser';
/* phone: touch + small screen, or explicit mobile UA */
function isPhoneDevice() {
  const touch = (('ontouchstart' in window) || navigator.maxTouchPoints > 0);
  const small = Math.min(window.screen.width, window.screen.height) <= 560 ||
                Math.min(window.innerWidth, window.innerHeight) <= 560;
  const ua = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  const co = (window.matchMedia && window.matchMedia('(any-pointer: coarse)').matches);
  return (touch && small) || (co && small) || ua;
}

function listUsers() {
  try { return JSON.parse(localStorage.getItem(USERS_KEY) || '[]'); }
  catch (e) { return []; }
}
function saveUsers(list) { localStorage.setItem(USERS_KEY, JSON.stringify(list)); }

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/* keys that belong to a user (namespaced with @user) */
const PER_USER_KEYS = [
  'amirnetsim.userbank.v1', 'amirnetsim.sources.v1', 'amirnetsim.progress.v1',
  'amirnetsim.sims.v1', 'amirnetsim.vocab.v1', 'amirnetsim.hecache.v1',
  'amirnetsim.gemini.key', 'amirnetsim.gemini.model', 'amirnetsim.qsrs.v1',
  'amirnetsim.selfmark.v1', 'amirnetsim.everused.v1', 'amirnetsim.drilldir',
  'amirnetsim.name'
];

function ukey(key, user) { return key + '@' + user; }

/* capture the ORIGINAL storage methods FIRST (before any shim) */
const _origGetItem = localStorage.getItem.bind(localStorage);
const _origSetItem = localStorage.setItem.bind(localStorage);
const _origRemoveItem = localStorage.removeItem.bind(localStorage);

/* read the active user WITHOUT going through the shim (no recursion) */
function activeUserRaw() {
  const v = _origGetItem(ACTIVE_USER_KEY);
  return v || null;
}
function activeUser() { return activeUserRaw(); }
function setActiveUser(u) { _origSetItem(ACTIVE_USER_KEY, u); }

/* namespaced storage shims: swap every direct localStorage access used by the app */
localStorage.getItem = function (key) {
  const u = PER_USER_KEYS.includes(key) ? activeUserRaw() : null;
  if (u) return _origGetItem(ukey(key, u));
  return _origGetItem(key);
};
localStorage.setItem = function (key, val) {
  const u = PER_USER_KEYS.includes(key) ? activeUserRaw() : null;
  if (u) return _origSetItem(ukey(key, u), val);
  return _origSetItem(key, val);
};
localStorage.removeItem = function (key) {
  const u = PER_USER_KEYS.includes(key) ? activeUserRaw() : null;
  if (u) return _origRemoveItem(ukey(key, u));
  return _origRemoveItem(key);
};

/* register a new user (name + password). Returns error string or null.
   allowEmpty: on a private computer a user can register with NO password —
   then login is a single click (no password field needed). */
async function registerUser(name, pass, allowEmpty) {
  const users = listUsers();
  if (users.some(x => x.user === name)) return 'שם המשתמש כבר קיים — בחרי שם אחר.';
  if (!name.trim()) return 'הזיני שם משתמש.';
  if (!pass || pass.length < 4) {
    if (allowEmpty && (pass || '') === '') {
      users.push({ user: name.trim(), passHash: '', created: Date.now() });   // no password
      saveUsers(users);
      return null;
    }
    return 'הסיסמה חייבת להכיל לפחות 4 תווים (או השאירי ריק ללא סיסמה).';
  }
  users.push({ user: name.trim(), passHash: await sha256(pass), created: Date.now() });
  saveUsers(users);
  return null;
}

/* login: verify hash; returns true/false */
async function loginUser(name, pass) {
  const users = listUsers();
  const rec = users.find(x => x.user === name);
  if (!rec) return false;
  if (!rec.passHash) return (pass || '') === '';   // passwordless user: only empty pass works
  return (await sha256(pass || '')) === rec.passHash;
}

/* change password */
async function changePassword(user, oldPass, newPass) {
  const ok = await loginUser(user, oldPass);
  if (!ok) return 'הסיסמה הנוכחית שגויה.';
  if (newPass.length < 4) return 'הסיסמה החדשה קצרה מדי.';
  const users = listUsers();
  const rec = users.find(x => x.user === user);
  rec.passHash = await sha256(newPass);
  saveUsers(users);
  return null;
}

/* export the ACTIVE user's data as a downloadable bundle file */
function exportUserBundle() {
  const u = activeUser();
  if (!u) return null;
  const bundle = { app: 'amirnet-sim', version: 1, user: u, exported: new Date().toISOString(), data: {} };
  PER_USER_KEYS.forEach(k => {
    const raw = _origGetItem(ukey(k, u));
    if (raw != null) bundle.data[k] = raw;
  });
  const blob = new Blob([JSON.stringify(bundle)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'amirnet-' + u + '-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  return a.download;
}

/* import a bundle → creates/overwrites the user named inside it.
   passIn = password to set for the imported account. Returns error or null. */
async function importUserBundle(fileObj, passIn) {
  let bundle;
  try { bundle = JSON.parse(await fileObj.text()); }
  catch (e) { return 'הקובץ לא תקין — זהו לא קובץ חבילה של amirnet-sim.'; }
  if (!bundle || bundle.app !== 'amirnet-sim' || !bundle.user) return 'הקובץ לא תקין.';
  const name = bundle.user;
  const users = listUsers();
  const exists = users.find(x => x.user === name);
  const hash = await sha256(passIn);
  if (exists) {
    if (!confirm('למשתמש "' + name + '" כבר קיים נתונים במחשב זה. להחליף אותם בקובץ?')) return 'בוטל.';
    exists.passHash = hash;
  } else {
    users.push({ user: name, passHash: hash, created: Date.now() });
  }
  saveUsers(users);
  Object.entries(bundle.data || {}).forEach(([k, raw]) => _origSetItem(ukey(k, name), raw));
  return null;
}

/* delete a user entirely (requires password) */
async function deleteUser(user, pass) {
  const ok = await loginUser(user, pass);
  if (!ok) return 'סיסמה שגויה.';
  saveUsers(listUsers().filter(x => x.user !== user));
  PER_USER_KEYS.forEach(k => _origRemoveItem(ukey(k, user)));
  return null;
}