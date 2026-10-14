/* ============================================================
   AMIRNETSIM — PDF text extraction (pdf.js)
   Local copies of pdf.js are served from the app folder so the
   importer also works fully offline. Falls back to CDN.
   ============================================================ */

const PDFJS_SOURCES = [
  'vendor/pdf.min.mjs',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.6.82/pdf.min.mjs'
];
const PDFJS_WORKER_SOURCES = [
  'vendor/pdf.worker.min.mjs',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.6.82/pdf.worker.min.mjs'
];

let _pdfjs = null;

async function loadPdfJs() {
  if (_pdfjs) return _pdfjs;
  let lastErr = null;
  for (let i = 0; i < PDFJS_SOURCES.length; i++) {
    try {
      const mod = await import(PDFJS_SOURCES[i]);
      const lib = mod.getProductLibrary ? mod.getProductLibrary() : mod;
      lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SOURCES[i];
      _pdfjs = lib;
      return _pdfjs;
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('pdf.js unavailable');
}

/* Extract per-page text from a PDF file */
async function extractPdfText(file, onProgress) {
  const pdfjsLib = await loadPdfJs();
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const pages = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    /* reconstruct reading order: group items into lines by y, then sort by x */
    const items = tc.items.filter(it => it.str != null);
    const lines = [];
    let cur = null;
    items.forEach(it => {
      const y = Math.round(it.transform[5]);
      const x = it.transform[4];
      const w = it.width || 0;
      /* an EMPTY text item with a meaningful width is the SC blank underline:
         it carries no characters but real horizontal extent → render as _____ */
      const s = (it.str === '' && w >= 15) ? '_____' : it.str;
      if (!cur || Math.abs(cur.y - y) > 3) {
        cur = { y, parts: [] };
        lines.push(cur);
      }
      cur.parts.push({ x, s, w });
    });
    lines.forEach(l => l.parts.sort((a, b) => a.x - b.x));
    lines.sort((a, b) => b.y - a.y);   // PDF y grows upward
    /* join parts with a single space, but PRESERVE wide gaps BETWEEN parts:
       in NITE PDFs the SC blank underline extracts as a separate item, so the gap
       'crowning' + '  ' + 'of' IS the missing blank. Keep 2+ spaces there.
       Whitespace-ONLY items don't extend the previous part's footprint: a lone
       ' ' item between 'then' (ends 357.8) and ', packed' (starts 386.1) hides a
       28px underline gap. Skip pure-space parts when measuring the gap. */
    const text = lines.map(l => {
      let s = '';
      let prevReal = null;                      // last non-whitespace part
      l.parts.forEach(pp => {
        if (!pp.s.trim()) return;               // pure-space items carry no position info
        if (prevReal == null) { s = pp.s; prevReal = pp; return; }
        const gapX = pp.x - (prevReal.x + (prevReal.w || 0));
        s += (gapX > 12 ? '  ' : ' ') + pp.s;   // wide x-gap → double space (blank candidate)
        prevReal = pp;
      });
      return s.replace(/\s+/g, m => (m.length > 1 ? '  ' : ' ')).trim();
    }).filter(Boolean).join('\n');
    pages.push(text);
    try {
      var glyphItems = tc.items.filter(function (it) { return it.str && it.str.length === 1 && it.str.charCodeAt(0) >= 0xf080 && it.str.charCodeAt(0) <= 0xf0ff; });
      if (glyphItems.length >= 16 && tc.items.some(function (it) { return (it.str || '').indexOf('\u05e4\u05ea\u05e8\u05d5\u05e0\u05d5\u05ea') !== -1; })) {
        var kmap = highQKeyFromPage(tc.items);
        if (kmap && Object.keys(kmap).length) {
          (window.__highQKeyMaps = window.__highQKeyMaps || []).push(kmap);
        }
      }
    } catch (eHQ) {}
    if (onProgress) onProgress(p, pdf.numPages);
  }
  return pages;
}

/* High-Q solution-table parser: glyph grid, filled cell = correct answer */
function highQKeyFromPage(items) {
  const pts = items.filter(function (it) { return it.str && it.str.trim(); })
    .map(function (it) { return { x: it.transform[4], y: it.transform[5], s: it.str.trim() }; });
  if (!pts.some(function (p) { return p.s.indexOf("\u05e4\u05ea\u05e8\u05d5\u05e0\u05d5\u05ea") !== -1; })) return null;
  const solY = Math.max.apply(null, pts.filter(function (p) { return p.s.indexOf("\u05e4\u05ea\u05e8\u05d5\u05e0\u05d5\u05ea") !== -1; }).map(function (p) { return p.y; }));
  const numFrags = pts.filter(function (p) { return p.y < solY && solY - p.y < 20 && /^[\d\s\.,]+$/.test(p.s); })
    .sort(function (a, b) { return a.x - b.x; });
  const nums = [];
  numFrags.forEach(function (f) {
    (f.s.match(/\d{1,3}/g) || []).forEach(function (t) { nums.push(parseInt(t, 10)); });
  });
  if (nums.length < 8) return null;
  const rows = {};
  pts.filter(function (p) { return p.y < solY - 18 && p.s.length === 1 && p.s.charCodeAt(0) >= 0xf080 && p.s.charCodeAt(0) <= 0xf0ff; })
     .forEach(function (p) { const k = Math.round(p.y); (rows[k] = rows[k] || []).push({ x: p.x, code: p.s.charCodeAt(0) }); });
  const rowYs = Object.keys(rows).map(Number).sort(function (a, b) { return b - a; });
  if (rowYs.length < 2) return null;
  const grid = rows[rowYs[0]].map(function (c) { return c.x; }).sort(function (a, b) { return a - b; });
  if (grid.length < nums.length - 2) return null;
  const colQn = {};
  grid.forEach(function (x, i) { if (i < nums.length) colQn[Math.round(x)] = nums[i]; });
  const answers = {};
  rowYs.forEach(function (y, optIdx) {
    const cells = rows[y];
    const codes = {};
    cells.forEach(function (c) { (codes[c.code] = codes[c.code] || []).push(c.x); });
    if (Object.keys(codes).length < 2) return;
    const emptyCode = Number(Object.keys(codes).sort(function (a, b) { return codes[b].length - codes[a].length; })[0]);
    Object.keys(codes).forEach(function (ks) {
      const code = Number(ks);
      if (code === emptyCode) return;
      codes[code].forEach(function (fx) {
        const col = grid.reduce(function (best, g) { return Math.abs(g - fx) < Math.abs(best - fx) ? g : best; });
        const qn = colQn[Math.round(col)];
        if (qn && answers[qn] == null) answers[qn] = optIdx;
      });
    });
  });
  return Object.keys(answers).length >= 8 ? answers : null;
}