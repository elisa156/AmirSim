// AMIRSIM — HIGHLIGHTER for untimed practice (S.mode === 'practice') ONLY:
// 5-color marker pen that works in ALL THREE zones — question text (qtext /
// sc-line), passage text (reading), and the answer options (opts spans).
// Text selection → toolbar (5 colors + eraser + clear zone) → wraps selection
// in a <mark class="hlx" data-hlx="cN">. Highlights persist per question-item
// in S.highlights[secIdx][item.id] (raw HTML with marks so re-renders keep them)
// and are stripped from snapshots (report review keeps clean text) — EXCEPT we
// DO store marks in the snapshot questions[].stem for her review?? NO: keep
// snapshots clean; highlights are a scratch tool for practice only.
/* HIGHLIGHTER v1 (practice-only) */
(function () {
  const HLX_COLORS = [
    { id: 'y', label: 'צהוב',  bg: '#fff3a0' },
    { id: 'g', label: 'ירוק',  bg: '#c8f0b8' },
    { id: 'b', label: 'תכלת',  bg: '#bfe0fa' },
    { id: 'p', label: 'ורוד',  bg: '#ffd2e0' },
    { id: 'o', label: 'כתום',  bg: '#ffd9ad' }
  ];
  window.HLX_COLORS = HLX_COLORS;

  /* ---------- toolbar UI (injected into the exam toolbar, hidden unless
     practice + English-text zone hovered/selected) ---------- */
  function buildToolbar() {
    const old = document.getElementById('hlx-bar');
    if (old) old.remove();
    const bar = document.createElement('div');
    bar.id = 'hlx-bar';
    bar.hidden = true;
    bar.dir = 'rtl';
    bar.style.cssText = 'position:fixed;top:-999px;left:-999px;right:auto;' +
      'background:var(--header-bg,#fff);border:1px solid var(--line,#d3d7d9);border-radius:10px;' +
      'box-shadow:0 8px 30px rgba(0,0,0,.22);padding:4px 6px;display:flex;gap:3px;align-items:center;z-index:1250;width:max-content';
    bar.innerHTML = HLX_COLORS.map(c =>
      '<button data-hlx-color="' + c.id + '" title="' + c.label + '" style="width:20px;height:20px;border-radius:50%;border:1.5px solid var(--line);cursor:pointer;background:' + c.bg + '"></button>'
    ).join('') +
      '<button data-hlx-clear="sel" title="מחיקת ההדגשה בבחירה" style="width:20px;height:20px;border-radius:50%;border:1px solid var(--line);background:#fff;cursor:pointer;font-size:11px;line-height:1;padding:0">⌫</button>' +
      '<button data-hlx-clear="q" title="מחיקת כל ההדגשות באזור הזה" style="width:20px;height:20px;border-radius:6px;border:1px solid var(--line);background:#fff;cursor:pointer;font-size:11px;line-height:1;padding:0">🧽</button>' +
      '<button data-hlx-pin title="הצמדה: הסרגל יישאר פתוח (ברירת מחדל ללא הצמדה — יורד אוטומטית אחרי 6 שניות או בלחיצה מחוץ לסרגל)" style="width:20px;height:20px;border-radius:6px;border:1px solid var(--line);background:#fff;cursor:pointer;font-size:11px;line-height:1;padding:0">📌</button>';
    document.body.appendChild(bar);

    bar.addEventListener('pointerdown', e => e.preventDefault());   /* keep the text selection alive */

    /* AUTO-DISMISS: without a pin the bar drops after 6s of no action, or on the
       first click OUTSIDE it. 📌 pins it open (toggle, per-session). */
    let __hlxPin = false, __hlxTimer = null;
    function hlxDismiss() { bar.hidden = true; clearTimeout(__hlxTimer); }
    bar.addEventListener('mouseenter', function () { clearTimeout(__hlxTimer); });   /* hover holds it */
    bar.addEventListener('mouseleave', function () { if (!__hlxPin) armDismiss(); });
    function armDismiss() {
      clearTimeout(__hlxTimer);
      if (!__hlxPin) __hlxTimer = setTimeout(hlxDismiss, 6000);
    }
    bar.addEventListener('click', e => {
      const btn = e.target.closest('button');
      if (!btn) return;
      if ('hlxPin' in btn.dataset) {
        __hlxPin = !__hlxPin;
        btn.style.background = __hlxPin ? 'var(--accent-soft,#f8d9a8)' : '#fff';
        btn.title = __hlxPin ? 'מוצמד — לחצי שוב כדי לחזור להורדה אוטומטית'
                             : 'הצמדה: הסרגל יישאר פתוח (ברירת מחדל ללא הצמדה — יורד אוטומטית אחרי 6 שניות או בלחיצה מחוץ לסרגל)';
        clearTimeout(__hlxTimer);
        if (!__hlxPin) armDismiss();
        return;
      }
      if (!window.__hlxSel) return;
      const sel = window.__hlxSel;
      if (btn.dataset.hlxColor) applyMark(sel, btn.dataset.hlxColor);
      else if (btn.dataset.hlxClear === 'sel') { clearMark(sel); if (!__hlxPin) hlxDismiss(); }
      else if (btn.dataset.hlxClear === 'q') { clearZone(sel.zone); if (!__hlxPin) hlxDismiss(); }
      else return;
      window.getSelection().removeAllRanges();
      if (!__hlxPin) armDismiss();     /* after a color action the bar stays a beat then drops */
    });
    /* outside click → dismiss (unless pinned) */
    document.addEventListener('pointerdown', function (e) {
      if (bar.hidden || __hlxPin) return;
      if (!bar.contains(e.target) && !(e.target.closest && e.target.closest('#hlx-bar'))) hlxDismiss();
    }, true);
    window.__hlxArmDismiss = armDismiss;   /* re-armed by the selection handler */
  }

  /* ---------- zone discovery: qtext / sc-line / opts span / passage ---------- */
  function zoneOf(node) {
    if (!node) return null;
    const el = node.nodeType === 1 ? node : node.parentElement;
    if (!el) return null;
    if (el.closest && el.closest('.passage')) return { type: 'passage', root: () => document.querySelector('#pass-col .passage') };
    if (el.closest && el.closest('.opts')) return { type: 'opts', root: () => el.closest('.qitem') };
    if (el.closest && el.closest('.qtext, .sc-line')) return { type: 'q', root: () => el.closest('.qitem') };
    return null;
  }

  /* ---------- apply / clear marks (survives the DOM: we re-serialize the zone
     HTML into the item store, so paintQuestion re-renders keep the marks) ---------- */
  function applyMark(sel, colorId) {
    const range = sel.range;
    const root = sel.zone.root ? sel.zone.root() : null;
    if (!root || range.collapsed) return;
    /* never let a mark swallow the sc-line .blank (answer fill) */
    if (range.startContainer.nodeType === 1 && range.startContainer.closest && range.startContainer.closest('.blank')) return;
    if (range.startContainer.parentElement && range.startContainer.parentElement.closest && range.startContainer.parentElement.closest('.blank')) return;
    /* never let a mark swallow the .opts INPUT (radio) — wrap text only */
    const fragTest = range.cloneContents();
    if (fragTest.querySelector && fragTest.querySelector('input')) return;
    try {
      const mark = document.createElement('mark');
      mark.className = 'hlx';
      mark.dataset.hlx = colorId;
      mark.appendChild(range.extractContents());
      range.insertNode(mark);
    } catch (err) { return; }
    /* store the zone's innerHTML on the item so re-renders repopulate marks */
    storeZone(sel.zone);
  }
  function clearMark(sel) {
    const root = sel.zone.root ? sel.zone.root() : null;
    if (!root) return;
    const range = sel.range;
    let touched = false;
    /* every mark that INTERSECTS the selection gets unwrapped */
    root.querySelectorAll('mark.hlx').forEach(m => {
      const mRng = document.createRange();
      mRng.selectNodeContents(m);
      /* intersect: mStart < rEnd && mEnd > rStart */
      if (mRng.compareBoundaryPoints(Range.END_TO_START, range) < 0 &&
          mRng.compareBoundaryPoints(Range.START_TO_END, range) > 0) {
        while (m.firstChild) m.parentNode.insertBefore(m.firstChild, m);
        m.remove();
        touched = true;
      }
    });
    if (touched) storeZone(sel.zone);
  }
  function clearZone(zone) {
    const root = zone && zone.root && zone.root();
    if (!root) return;
    root.querySelectorAll('mark.hlx').forEach(m => {
      while (m.firstChild) m.parentNode.insertBefore(m.firstChild, m);
      m.remove();
    });
    storeZone(zone);
    /* OPTS zone: restore the option INPUTs the unwrap may have displaced */
    if (zone.type === 'opts') rewireOpts(root);
  }
  /* after unwrapping marks inside an .opts zone, make sure every <li> still has
     label>input+span structure; rebuild any <li> that lost its input */
  function rewireOpts(root) {
    try {
      const qitem = root && root.closest ? root.closest('.qitem') : null;
      if (!qitem) return;
      const sec = S.sections[S.cur];
      if (!sec || !sec.items) return;
      const item = sec.items[+qitem.dataset.qi];
      const lis = qitem.querySelectorAll('.opts li');
      lis.forEach((li, i) => {
        if (li.querySelector('input')) return;             /* intact */
        const span = li.querySelector('span') || li;       /* text survived here */
        const txt = span ? span.innerHTML : li.innerHTML;
        li.innerHTML = '<label><input type="radio" name="q' + qitem.dataset.qi + '" value="' + i + '"><span>' + txt + '</span></label>';
        const input = li.querySelector('input');
        input.onchange = () => {
          sec.answers[item.id] = +input.value;
          adaptLevelAfter(sec, item);
          paintQuestion(sec);
        };
        if (sec.answers[item.id] != null && sec.answers[item.id] === i) input.checked = true;
        rewireLabel(li);
      });
    } catch (err) {}
  }
  function rewireLabel(li) {
    const label = li.querySelector('label');
    if (!label || label.dataset.hlxWired) return;
    label.dataset.hlxWired = '1';
  }
  window.__hlxClearAll = function () {   /* used when leaving practice */
    document.querySelectorAll('mark.hlx').forEach(m => { while (m.firstChild) m.parentNode.insertBefore(m.firstChild, m); m.remove(); });
  };

  /* ---------- restore hooks called from app.js (paintQuestion / renderSection) ---------- */
  window.__hlxRestoreQItem = function (qi) {
    try {
      const sec = S.sections[S.cur];
      if (!sec || !sec.items || !sec.items[qi]) return;
      const itemId = sec.items[qi].id;
      const map = (S.highlights && S.highlights[S.cur] && S.highlights[S.cur][itemId]) || null;
      if (!map) return;
      const qitem = document.querySelector('#qcol .qitem[data-qi="' + qi + '"]');
      if (!qitem) return;
      /* question text zone (.qtext or .sc-line) — skip the .blank span (answer fill) */
      const qz = qitem.querySelector('.qtext') || qitem.querySelector('.sc-line');
      if (qz && map.q != null) {
        qz.innerHTML = map.q;
        /* re-strip marks that swallowed the blank span (safety) */
        qz.querySelectorAll('mark.hlx .blank, mark.hlx .blank').forEach(b => { /* keep, blank inside mark is OK visually */ });
      }
      /* opts zone — per <li> restore keeps labels/inputs intact */
      if (map.opts != null) {
        const holder = document.createElement('div');
        holder.innerHTML = map.opts;
        const freshLis = holder.querySelectorAll('.opts li');
        const lis = qitem.querySelectorAll('.opts li');
        lis.forEach((li, i) => {
          const fresh = freshLis[i];
          if (!fresh) return;
          const span = li.querySelector('span');
          const freshSpan = fresh.querySelector('span');
          if (span && freshSpan) { span.innerHTML = freshSpan.innerHTML; }
          const input = li.querySelector('input');
          const freshInput = fresh.querySelector('input');
          if (input && freshInput && freshInput.checked) input.checked = true;
        });
      }
    } catch (err) {}
  };
  window.__hlxRestorePassage = function (pEl) {
    try {
      const sec = S.sections[S.cur];
      if (!sec) return;
      const itemId = 'p:' + (sec.items[0] ? sec.items[0].pid : sec.n);
      const map = (S.highlights && S.highlights[S.cur] && S.highlights[S.cur][itemId]) || null;
      if (map && map.passage != null) pEl.innerHTML = map.passage;
    } catch (err) {}
  };

  /* ---------- per-item storage: sec item id → zone → innerHTML ---------- */
  function itemRef(zone) {
    let rootEl = null;
    try { rootEl = zone.root ? zone.root() : null; } catch (err) { rootEl = null; }   /* detached node → no-op */
    const qitem = rootEl && rootEl.closest ? (rootEl.closest('.qitem') || null) : null;
    const sec = S.sections[S.cur];
    let itemId = null;
    if (qitem && sec && sec.items[+qitem.dataset.qi]) itemId = sec.items[+qitem.dataset.qi].id;
    if (zone.type === 'passage') itemId = 'p:' + (sec.items[0] ? sec.items[0].pid : sec.n);
    return { sec: S.cur, itemId: itemId };
  }
  function storeZone(zone) {
    const ref = itemRef(zone);
    let root = null;
    try { root = zone.root ? zone.root() : null; } catch (err) { root = null; }
    if (!ref.itemId || !root) return;
    S.highlights = S.highlights || [];
    S.highlights[ref.sec] = S.highlights[ref.sec] || {};
    S.highlights[ref.sec][ref.itemId] = S.highlights[ref.sec][ref.itemId] || {};
    S.highlights[ref.sec][ref.itemId][zone.type] = root.innerHTML;
  }
  function restoreZone(zone, rootEl) {
    const qitem = rootEl.closest ? rootEl.closest('.qitem') : null;
    const sec = S.sections[S.cur];
    let itemId = null;
    if (qitem && sec) itemId = sec.items[+qitem.dataset.qi].id;
    if (zone === 'passage') itemId = 'p:' + (sec.items[0] ? sec.items[0].pid : sec.n);
    const map = (S.highlights && S.highlights[S.cur] && S.highlights[S.cur][itemId]) || null;
    if (!map) return false;
    const html = map[zone === 'passage' ? 'passage' : zone];
    if (html == null) return false;
    rootEl.innerHTML = html;
    return true;
  }
  window.__hlxRestore = restoreZone;

  /* ---------- selection handling ---------- */
  function onMouseUp() {
    const sec = S.sections && S.sections[S.cur];
    const bar = document.getElementById('hlx-bar');
    if (!bar) return;
    if (!sec || S.mode !== 'practice') { bar.hidden = true; return; }   /* practice ONLY */
    const s = window.getSelection();
    if (!s || s.rangeCount === 0 || s.isCollapsed) {
      /* no selection: keep the bar while it has a recent zone for "מחקי הכול באזור" */
      return;
    }
    const node = s.anchorNode;
    const zone = zoneOf(node) || zoneOf(s.focusNode);
    if (!zone) { bar.hidden = true; return; }
    window.__hlxSel = { range: s.getRangeAt(0).cloneRange(), zone: zone };
    bar.hidden = false;
    /* position near selection — width:max-content so the bar never stretches */
    try {
      const r = s.getRangeAt(0).getBoundingClientRect();
      bar.style.top = Math.max(8, r.top - 44) + 'px';
      const x = Math.min(Math.max(8, r.left + r.width / 2 - bar.offsetWidth / 2), window.innerWidth - bar.offsetWidth - 8);
      bar.style.right = 'auto';
      bar.style.left = x + 'px';
    } catch (err) {}
    if (typeof window.__hlxArmDismiss === 'function') window.__hlxArmDismiss();   /* fresh countdown each selection */
  }
  document.addEventListener('pointerup', onMouseUp, true);

  buildToolbar();
})();