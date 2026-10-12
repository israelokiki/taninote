'use strict';
/* TaniNote: open any study file and write on it. */
(() => {
  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------
  const BASE = 800;                        // page width in CSS px at 100% zoom
  const A4 = 297 / 210;                    // height / width
  const TILE = Math.round(BASE * A4);      // page height used to slice reflowed documents
  const PAPER_U = 32;                      // paper line spacing at 100% zoom
  const PT_W = 595.28;                     // A4 width in PDF points
  const UI_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

  const PENS = [['Graphite', '#23262b'], ['Blue', '#2257d6'], ['Red', '#d83a34'], ['Green', '#1f8a4c'], ['Violet', '#6d3fd1']];
  const HLS = [['Yellow', '#ffe14d'], ['Pink', '#ff9ccd'], ['Green', '#8eed98'], ['Blue', '#86ceff'], ['Orange', '#ffb866']];

  const TOOLS = {
    scroll: { label: 'Scroll' },
    pen:    { label: 'Pen', min: 1, max: 12, step: 0.5, w: 2.5, c: PENS[0][1] },
    hl:     { label: 'Highlighter', min: 8, max: 40, step: 1, w: 18, c: HLS[0][1] },
    eraser: { label: 'Eraser', min: 6, max: 60, step: 1, w: 18 },
    text:   { label: 'Text', min: 10, max: 48, step: 1, w: 18, c: PENS[0][1] },
  };

  const KIND_LABEL = { pdf: 'PDF', docx: 'Word', pptx: 'Slides', epub: 'EPUB', image: 'Image', notebook: 'Notebook', md: 'Markdown', html: 'HTML', text: 'Text' };
  const KIND_ICON = { pdf: 'ph-file-pdf', docx: 'ph-file-doc', pptx: 'ph-presentation', epub: 'ph-book-open', image: 'ph-image', md: 'ph-file-text', html: 'ph-file-html', text: 'ph-file-text', notebook: 'ph-notebook' };
  const OLD_FORMATS = {
    doc: 'Word 97-2003 files (.doc)', ppt: 'PowerPoint 97-2003 files (.ppt)', xls: 'Excel files (.xls)', xlsx: 'Excel workbooks',
    pages: 'Apple Pages files', key: 'Keynote files', numbers: 'Numbers files', odt: 'OpenDocument files', odp: 'OpenDocument files',
    rtf: 'RTF files', mobi: 'Kindle files (.mobi)', azw: 'Kindle files', azw3: 'Kindle files', djvu: 'DjVu files', xps: 'XPS files',
  };
  const PURIFY = {
    FORBID_TAGS: ['style', 'link', 'script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select', 'meta', 'base', 'video', 'audio'],
    FORBID_ATTR: ['style', 'class', 'id'],
  };

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, props) => { const e = document.createElement(tag); if (cls) e.className = cls; if (props) Object.assign(e, props); return e; };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const sanitize = (html) => window.DOMPurify ? DOMPurify.sanitize(html, PURIFY) : esc(html);
  const store = {
    get(k, d) { try { const v = localStorage.getItem('nota.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('nota.' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
  };
  const fmtSize = (b) => b == null ? '' : b < 1048576 ? Math.max(1, Math.round(b / 1024)) + ' KB' : b < 1073741824 ? (b / 1048576).toFixed(1) + ' MB' : (b / 1073741824).toFixed(b < 10737418240 ? 1 : 0) + ' GB';
  function fmtAgo(t) {
    if (!t) return '';
    const s = (Date.now() - t) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + ' h ago';
    if (s < 86400 * 7) return Math.floor(s / 86400) + ' d ago';
    return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }
  const stripExt = (n) => n.replace(/\.[^.]+$/, '') || n;
  const parseXml = (s) => new DOMParser().parseFromString(s, 'application/xml');
  const dirOf = (p) => p.includes('/') ? p.slice(0, p.lastIndexOf('/') + 1) : '';
  function joinPath(dir, rel) {
    rel = (rel || '').split('#')[0];
    try { return decodeURIComponent(new URL(rel, 'https://z/' + dir).pathname.slice(1)); } catch { return dir + rel; }
  }
  const canvasBytes = (c, type, q) => new Promise((res, rej) => c.toBlob((b) => b ? b.arrayBuffer().then(res, rej) : rej(new Error('Could not encode page image')), type, q));

  let toastTimer;
  function toast(msg, ms = 3200) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    if (ms) toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }

  if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';

  // ---------------------------------------------------------------------------
  // Storage (IndexedDB): docs = files + metadata, ink = annotations per doc
  // ---------------------------------------------------------------------------
  const db = (() => {
    let opening;
    const open = () => opening || (opening = new Promise((res, rej) => {
      const r = indexedDB.open('nota', 3);
      r.onupgradeneeded = () => {
        const d = r.result;
        for (const n of ['docs', 'ink', 'plan', 'sounds']) if (!d.objectStoreNames.contains(n)) d.createObjectStore(n, { keyPath: 'id' });
      };
      r.onblocked = () => toast('Close other TaniNote tabs so it can update its storage.', 6000);
      r.onsuccess = () => {
        const d = r.result;
        // Let a newer TaniNote (another tab, or after an update) upgrade storage instead of being blocked by this one.
        d.onversionchange = () => { d.close(); opening = null; toast('TaniNote was updated in another tab. Reload this page to keep going.', 0); };
        res(d);
      };
      r.onerror = () => rej(r.error);
    }));
    async function run(name, mode, fn) {
      const d = await open();
      return new Promise((res, rej) => {
        const tx = d.transaction(name, mode);
        const req = fn(tx.objectStore(name));
        tx.oncomplete = () => res(req && req.result);
        tx.onerror = () => rej(tx.error);
        tx.onabort = () => rej(tx.error || new Error('Storage aborted'));
      });
    }
    return {
      get: (n, id) => run(n, 'readonly', (s) => s.get(id)),
      put: (n, v) => run(n, 'readwrite', (s) => s.put(v)),
      del: (n, id) => run(n, 'readwrite', (s) => s.delete(id)),
      all: (n) => run(n, 'readonly', (s) => s.getAll()),
      clear: (n) => run(n, 'readwrite', (s) => s.clear()),
    };
  })();

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  const state = {
    doc: null, ink: null, pdf: null, flow: null,
    sheets: [], zoom: 1,
    tool: 'pen',
    settings: Object.assign(JSON.parse(JSON.stringify(TOOLS)), store.get('settings', {})),
    penOnly: store.get('penOnly', false),
    sawPen: false,
    undo: [], redo: [],
    active: null,
    dirty: false,
  };
  for (const k of Object.keys(TOOLS)) state.settings[k] = Object.assign({}, TOOLS[k], state.settings[k] || {});

  const stage = $('#stage');
  const scroller = $('#scroller');

  // ---------------------------------------------------------------------------
  // File detection: read the bytes, don't trust the extension
  // ---------------------------------------------------------------------------
  async function detect(file) {
    const ext = (file.name.includes('.') ? file.name.split('.').pop() : '').toLowerCase();
    const head = new Uint8Array(await file.slice(0, 2048).arrayBuffer());
    const ascii = String.fromCharCode.apply(null, head.subarray(0, 1024));
    if (ascii.includes('%PDF-')) return 'pdf';
    if (head[0] === 0x89 && ascii.slice(1, 4) === 'PNG') return 'image';
    if (head[0] === 0xff && head[1] === 0xd8) return 'image';
    if (ascii.startsWith('GIF8') || (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP')) return 'image';
    if (head[0] === 0x50 && head[1] === 0x4b) {
      if (!window.JSZip) throw new Error('The file reader could not load. Check your internet connection and try again.');
      const zip = await JSZip.loadAsync(file);
      if (zip.file('word/document.xml')) return 'docx';
      if (zip.file('ppt/presentation.xml')) return 'pptx';
      if (zip.file('META-INF/container.xml')) return 'epub';
      if (zip.file('xl/workbook.xml')) return { unsupported: 'Excel workbooks' };
      if (zip.file('content.xml')) return { unsupported: 'OpenDocument files' };
      return { unsupported: OLD_FORMATS[ext] || 'ZIP archives' };
    }
    if (head[0] === 0xd0 && head[1] === 0xcf) return { unsupported: OLD_FORMATS[ext] || 'Old Microsoft Office files' };
    if (OLD_FORMATS[ext]) return { unsupported: OLD_FORMATS[ext] };
    if (['svg', 'heic', 'heif', 'avif', 'bmp', 'tif', 'tiff'].includes(ext) || (file.type || '').startsWith('image/')) return 'image';
    if (!head.includes(0)) {
      if (ext === 'md' || ext === 'markdown') return 'md';
      if (['html', 'htm', 'xhtml'].includes(ext)) return 'html';
      return 'text';
    }
    return { unsupported: ext ? '.' + ext + ' files' : 'This kind of file' };
  }

  // ---------------------------------------------------------------------------
  // Thumbnails
  // ---------------------------------------------------------------------------
  // PDF.js hardening: never compile embedded font programs with eval (CVE-2024-4367), no XFA forms.
  const PDF_OPTS = { isEvalSupported: false, enableXfa: false };
  async function pdfThumb(blob) {
    const task = pdfjsLib.getDocument(Object.assign({ data: new Uint8Array(await blob.arrayBuffer()) }, PDF_OPTS));
    task.onPassword = () => task.destroy();
    try {
      const pdf = await task.promise;
      const page = await pdf.getPage(1);
      const vp1 = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: 360 / vp1.width });
      const c = el('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      return { thumb: c.toDataURL('image/jpeg', 0.8), pages: pdf.numPages };
    } finally { task.destroy(); }
  }
  function imageThumb(blob) {
    return new Promise((res) => {
      const url = URL.createObjectURL(blob); const img = new Image();
      img.onload = () => {
        const w = 360, h = Math.round(w * img.naturalHeight / img.naturalWidth) || 470;
        const c = el('canvas'); c.width = w; c.height = Math.min(h, 900);
        const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, c.height); ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = () => { URL.revokeObjectURL(url); res(null); };
      img.src = url;
    });
  }

  // ---------------------------------------------------------------------------
  // App shell: dashboard, files, study plan, settings
  // ---------------------------------------------------------------------------
  const MAX_FILE = 300 * 1024 * 1024;
  const pad2 = (n) => String(n).padStart(2, '0');
  const dayKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const todayKey = () => dayKey(new Date());
  const parseDay = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const weekStart = (d) => addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), -d.getDay());
  const fmtDate = (t) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  let libDocs = [];
  let plan = [];
  const ui = { view: store.get('view', 'dashboard'), filter: 'all', day: todayKey(), week: weekStart(new Date()), month: new Date(new Date().getFullYear(), new Date().getMonth(), 1) };
  if (!['dashboard', 'files', 'notebooks', 'plan', 'settings'].includes(ui.view)) ui.view = 'dashboard';

  function inkStats(ink, pages) {
    const s = { pages: pages || 0, marked: 0, hl: 0, pen: 0, notes: 0 };
    if (!ink || !ink.pages) return s;
    for (const p of Object.values(ink.pages)) {
      const notes = (p.texts || []).filter((t) => t.text && t.text.trim()).length;
      const hl = (p.strokes || []).filter((x) => x.t === 'hl').length;
      const pen = (p.strokes || []).length - hl;
      if (hl || pen || notes) s.marked++;
      s.hl += hl; s.pen += pen; s.notes += notes;
    }
    return s;
  }
  const marks = (d) => d.stats ? d.stats.hl + d.stats.pen + d.stats.notes : 0;

  function noteStudyDay() {
    const t = todayKey();
    const days = store.get('days', []);
    if (days[days.length - 1] !== t) { days.push(t); store.set('days', days.slice(-400)); }
  }
  function streak() {
    const days = new Set(store.get('days', []));
    let d = new Date();
    if (!days.has(dayKey(d))) d = addDays(d, -1);
    let n = 0;
    while (days.has(dayKey(d))) { n++; d = addDays(d, -1); }
    return n;
  }

  async function refresh() {
    try {
      [libDocs, plan] = await Promise.all([db.all('docs'), db.all('plan')]);
      // One-time switch to plain pages (like a Word page) for notebooks and added pages.
      if (!store.get('plainPagesV1', false)) {
        store.set('paper', 'blank');
        const inks = await db.all('ink');
        for (const ink of inks) {
          if (!(ink.extra || []).some((x) => x.paper !== 'blank')) continue;
          ink.extra = ink.extra.map(() => ({ paper: 'blank' }));
          await db.put('ink', ink);
          const d = libDocs.find((x) => x.id === ink.id);
          if (d && d.kind === 'notebook') { d.paper = 'blank'; delete d.thumb; await db.put('docs', d); }
        }
        store.set('plainPagesV1', true);
      }
      // Files annotated before stats existed: count their marks once from the saved ink.
      const missing = libDocs.filter((d) => !d.stats);
      if (missing.length) {
        const inks = new Map((await db.all('ink')).map((x) => [x.id, x]));
        for (const d of missing) {
          const ink = inks.get(d.id);
          d.stats = inkStats(ink, d.pages || (d.kind === 'notebook' && ink ? (ink.extra || []).length : 0));
          db.put('docs', d).catch(() => {});
        }
      }
    } catch (e) {
      libDocs = []; plan = [];
      toast('TaniNote can\'t save files in this browser window. Private browsing blocks storage.', 6000);
    }
    renderProfile();
    showView(ui.view, true);
    updateStorage();
    checkReminders();
  }

  function showView(v, keepScroll) {
    ui.view = v;
    store.set('view', v);
    if (v === 'notebooks') ui.filter = 'notebook';
    else if (v === 'files' && ui.filter === 'notebook') ui.filter = 'all';
    const page = v === 'notebooks' ? 'files' : v;
    document.querySelectorAll('.nav-item, .tab').forEach((b) => {
      const on = b.dataset.view === v || (b.classList.contains('tab') && v === 'notebooks' && b.dataset.view === 'files');
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    document.querySelectorAll('.page').forEach((p) => { p.hidden = p.id !== 'view-' + page; });
    if (!keepScroll) $('#panel').scrollTop = 0;
    if (page === 'dashboard') renderDashboard();
    else if (page === 'files') renderFiles();
    else if (page === 'plan') renderPlan();
    else if (page === 'settings') renderSettings();
  }

  function renderProfile() {
    const name = store.get('name', '');
    $('#profileName').textContent = name || 'Add your name';
    $('#avatar').textContent = (name.trim()[0] || 'T').toUpperCase();
  }

  // ---------- Dashboard ----------
  const byOpened = (a, b) => (b.opened || b.updated || b.created) - (a.opened || a.updated || a.created);

  function renderDashboard() {
    const name = store.get('name', '');
    $('#heroTitle').textContent = name ? `Hello, ${name}!` : 'Hello!';
    const todays = plan.filter((p) => p.date === todayKey() && !p.done);
    const last = libDocs.slice().sort(byOpened).find((d) => d.opened);
    let sub = 'Bring in a study module and start writing on it. PDFs, Word, slides, ebooks and photos all open here.';
    if (todays.length) sub = `You have ${todays.length} study session${todays.length > 1 ? 's' : ''} planned today. Small steps add up.`;
    else if (last) sub = `Pick up where you left off, or bring in something new to study.`;
    $('#heroSub').textContent = sub;
    const cont = $('#continueBtn');
    cont.hidden = !last;
    if (last) { $('#continueLabel').textContent = 'Continue ' + last.name; cont.onclick = () => openDoc(last.id); }

    $('#statFiles').textContent = libDocs.length;
    $('#statPages').textContent = libDocs.reduce((n, d) => n + (d.stats ? d.stats.marked : 0), 0);
    const st = streak();
    $('#statStreak').textContent = st;
    $('#statStreakLabel').textContent = st === 1 ? 'Day study streak' : 'Days study streak';

    const sort = $('#recentSort').value;
    const docs = libDocs.slice().sort(sort === 'marked' ? (a, b) => marks(b) - marks(a) || byOpened(a, b) : byOpened).slice(0, 5);
    const list = $('#recentList');
    list.innerHTML = '';
    docs.forEach((d, i) => list.append(recentRow(d, i)));
    $('#recentEmpty').hidden = docs.length > 0;
    renderWeek();
    renderSessions($('#sessions'), ui.day, false);
  }

  function thumbEl(d, cls) {
    const t = el('span', cls);
    if (d.thumb) t.append(el('img', '', { src: d.thumb, alt: '', loading: 'lazy' }));
    else if (d.kind === 'notebook') t.classList.add('paper-' + (d.paper || 'blank'));
    else t.append(el('i', 'ph ' + (KIND_ICON[d.kind] || 'ph-file')));
    return t;
  }

  function recentRow(d, i) {
    const li = el('li');
    const b = el('button', 'recent-row');
    const s = d.stats || {};
    const pages = s.pages || d.pages || 0;
    b.setAttribute('aria-label', `Open ${d.name}`);
    b.append(el('span', 'recent-idx', { textContent: pad2(i + 1) }), thumbEl(d, 'recent-thumb'));
    const text = el('span');
    text.append(el('span', 'recent-name', { textContent: d.name }), el('span', 'recent-date', { textContent: (d.opened ? 'Opened ' : 'Added ') + fmtDate(d.opened || d.created) }));
    text.lastChild.style.display = 'block';
    const stats = el('span', 'recent-stats');
    const stat = (icon, n, label) => { const x = el('span', '', { innerHTML: `<i class="ph ${icon}" aria-hidden="true"></i>`, title: label }); x.append(String(n)); x.setAttribute('aria-label', `${n} ${label}`); return x; };
    stats.append(stat('ph-files', pages || '-', 'pages'), stat('ph-highlighter', s.hl || 0, 'highlights'), stat('ph-pen-nib', (s.pen || 0) + (s.notes || 0), 'pen marks and notes'));
    b.append(text, stats);
    b.addEventListener('click', () => openDoc(d.id));
    li.append(b);
    return li;
  }

  function renderWeek() {
    const w = $('#week');
    w.innerHTML = '';
    const prev = el('button', 'arrow', { innerHTML: '<i class="ph ph-caret-left"></i>' }); prev.setAttribute('aria-label', 'Previous week');
    const next = el('button', 'arrow', { innerHTML: '<i class="ph ph-caret-right"></i>' }); next.setAttribute('aria-label', 'Next week');
    prev.onclick = () => { ui.week = addDays(ui.week, -7); ui.day = dayKey(ui.week); renderWeek(); renderSessions($('#sessions'), ui.day, false); };
    next.onclick = () => { ui.week = addDays(ui.week, 7); ui.day = dayKey(ui.week); renderWeek(); renderSessions($('#sessions'), ui.day, false); };
    w.append(prev);
    const busy = new Set(plan.map((p) => p.date));
    for (let i = 0; i < 7; i++) {
      const d = addDays(ui.week, i), k = dayKey(d);
      const b = el('button', 'day' + (busy.has(k) ? ' has' : '') + (k === todayKey() ? ' is-today' : ''));
      b.setAttribute('aria-pressed', String(k === ui.day));
      b.setAttribute('aria-label', d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }));
      b.append(el('small', '', { textContent: DOW[i] }), el('b', '', { textContent: d.getDate() }));
      b.onclick = () => { ui.day = k; renderWeek(); renderSessions($('#sessions'), k, false); };
      w.append(b);
    }
    w.append(next);
    $('#todayMonth span').textContent = parseDay(ui.day).toLocaleDateString(undefined, { month: 'long' });
    $('#todayTitle').textContent = ui.day === todayKey() ? 'Today\'s study' : parseDay(ui.day).toLocaleDateString(undefined, { weekday: 'long' }) + '\'s study';
  }

  function renderSessions(ul, key, big) {
    ul.innerHTML = '';
    const items = plan.filter((p) => p.date === key).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    if (!items.length) {
      ul.append(el('li', 'none', { textContent: big ? 'Nothing planned for this day yet.' : 'Nothing planned. Add a session to stay on track.' }));
      return;
    }
    for (const p of items) {
      const li = el('li', 'session' + (p.done ? ' done' : ''));
      li.append(el('time', '', { textContent: p.time || '--:--', dateTime: p.time || '' }));
      const mid = el('div');
      const doc = p.docId && libDocs.find((d) => d.id === p.docId);
      const t = el('button', 'session-title', { textContent: p.title });
      if (doc) { t.dataset.doc = doc.id; t.onclick = () => openDoc(doc.id); t.title = 'Open ' + doc.name; }
      else t.disabled = true;
      mid.append(t);
      const meta = [];
      if (doc && doc.name !== p.title) meta.push(doc.name);
      if (p.minutes) meta.push(p.minutes + ' min');
      if (meta.length) mid.append(el('small', '', { textContent: meta.join(', ') }));
      const acts = el('div', 'session-actions');
      const check = el('button', 'session-check', { innerHTML: '<i class="ph ph-check"></i>' });
      check.setAttribute('aria-label', p.done ? 'Mark as not done' : 'Mark as done');
      check.setAttribute('aria-pressed', String(!!p.done));
      check.onclick = async () => { p.done = !p.done; await db.put('plan', p); if (p.done) noteStudyDay(); renderSessionsEverywhere(); };
      const del = el('button', 'icon-btn', { innerHTML: '<i class="ph ph-x"></i>' });
      del.setAttribute('aria-label', 'Remove session');
      del.onclick = async () => { await db.del('plan', p.id); plan = plan.filter((x) => x !== p); renderSessionsEverywhere(); toast('Session removed'); };
      if (big) {
        const edit = el('button', 'icon-btn', { innerHTML: '<i class="ph ph-pencil-simple"></i>' });
        edit.setAttribute('aria-label', 'Edit session');
        edit.onclick = () => sessionDialog(p);
        acts.append(edit);
      }
      acts.append(del, check);
      li.append(mid, acts);
      ul.append(li);
    }
  }
  function renderSessionsEverywhere() {
    if (ui.view === 'dashboard') renderDashboard();
    if (ui.view === 'plan') renderPlan();
  }

  // ---------- Files ----------
  function renderFiles() {
    const notebooksOnly = ui.view === 'notebooks';
    $('#filesTitle').textContent = notebooksOnly ? 'Notebooks' : 'My files';
    const subjects = Array.from(new Set(libDocs.map((d) => d.subject).filter(Boolean))).sort((a, b) => a.localeCompare(b));
    const chips = $('#chips');
    chips.innerHTML = '';
    const chip = (id, label, icon) => {
      const c = el('button', 'chip', { innerHTML: icon ? `<i class="ph ${icon}" aria-hidden="true"></i>` : '' });
      c.append(label);
      c.setAttribute('role', 'tab');
      c.setAttribute('aria-selected', String(ui.filter === id));
      c.onclick = () => { ui.filter = id; if (id === 'notebook') showView('notebooks'); else if (ui.view === 'notebooks') showView('files'); else renderFiles(); };
      chips.append(c);
    };
    chip('all', 'All');
    chip('fav', 'Favourites', 'ph-star');
    chip('notebook', 'Notebooks', 'ph-notebook');
    subjects.forEach((s) => chip('s:' + s, s, 'ph-bookmark-simple'));
    if (ui.filter.startsWith('s:') && !subjects.includes(ui.filter.slice(2))) ui.filter = 'all';

    const q = $('#search').value.trim().toLowerCase();
    let docs = libDocs.slice();
    if (ui.filter === 'fav') docs = docs.filter((d) => d.fav);
    else if (ui.filter === 'notebook') docs = docs.filter((d) => d.kind === 'notebook');
    else if (ui.filter.startsWith('s:')) docs = docs.filter((d) => d.subject === ui.filter.slice(2));
    if (q) docs = docs.filter((d) => d.name.toLowerCase().includes(q) || (d.subject || '').toLowerCase().includes(q));
    const sort = $('#filesSort').value;
    const cmp = {
      opened: byOpened,
      name: (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }),
      added: (a, b) => b.created - a.created,
      marked: (a, b) => marks(b) - marks(a) || byOpened(a, b),
    }[sort] || byOpened;
    docs.sort((a, b) => (b.fav ? 1 : 0) - (a.fav ? 1 : 0) || cmp(a, b));

    const grid = $('#grid');
    grid.innerHTML = '';
    docs.forEach((d) => grid.append(fileCard(d)));
    $('#empty').hidden = libDocs.length > 0;
    $('#chips').hidden = libDocs.length === 0;
    $('#noResults').hidden = !(libDocs.length && !docs.length);
    $('#noResults').textContent = q ? `No files match "${$('#search').value.trim()}".` : 'Nothing here yet.';
  }

  function fileCard(d) {
    const c = el('article', 'card-file');
    const open = el('button', 'card-open');
    open.setAttribute('aria-label', 'Open ' + d.name);
    const th = el('div', 'thumb');
    if (d.thumb) th.append(el('img', '', { src: d.thumb, alt: '', loading: 'lazy' }));
    else if (d.kind === 'notebook') th.classList.add('paper-' + (d.paper || 'blank'));
    else {
      const face = el('div', 'thumb-face');
      face.append(el('i', 'ph ' + (KIND_ICON[d.kind] || 'ph-file')));
      for (let k = 0; k < 6; k++) face.append(el('div', 'line' + (k % 3 === 2 ? ' short' : '')));
      th.append(face);
    }
    if (d.fav) th.append(el('span', 'star', { innerHTML: '<i class="ph-fill ph-star"></i>', title: 'Favourite' }));
    open.append(th);
    open.addEventListener('click', () => openDoc(d.id));
    const meta = el('div', 'card-meta');
    const text = el('div', 'card-text');
    text.append(el('h3', 'card-name', { textContent: d.name, title: d.name }));
    const sub = el('p', 'card-sub');
    sub.append(el('span', 'kind kind-' + d.kind, { textContent: KIND_LABEL[d.kind] || 'File' }));
    if (d.subject) sub.append(el('span', 'subject', { textContent: d.subject, title: d.subject }));
    sub.append(el('span', '', { textContent: fmtAgo(d.updated || d.created) }));
    text.append(sub);
    const more = el('button', 'icon-btn card-menu', { innerHTML: '<i class="ph ph-dots-three"></i>' });
    more.setAttribute('aria-label', 'More actions for ' + d.name);
    more.setAttribute('aria-haspopup', 'menu');
    more.addEventListener('click', (e) => { e.stopPropagation(); cardMenu(more, d); });
    meta.append(text, more);
    c.append(open, meta);
    return c;
  }

  let openMenu = null;
  function closeMenu() { if (openMenu) { openMenu.remove(); openMenu = null; } }
  function cardMenu(anchor, d) {
    closeMenu();
    const m = el('div', 'menu'); m.setAttribute('role', 'menu');
    const item = (icon, label, fn, cls) => {
      const b = el('button', cls || '', { innerHTML: `<i class="ph ${icon}" aria-hidden="true"></i>` });
      b.append(el('span', '', { textContent: label }));
      b.setAttribute('role', 'menuitem');
      b.addEventListener('click', () => { closeMenu(); fn(); });
      m.append(b);
    };
    item('ph-arrow-square-out', 'Open', () => openDoc(d.id));
    item(d.fav ? 'ph-star-half' : 'ph-star', d.fav ? 'Remove from favourites' : 'Add to favourites', async () => { d.fav = !d.fav; await db.put('docs', d); refresh(); });
    item('ph-pencil-simple', 'Rename', async () => {
      const name = await askText('Rename file', 'Name', d.name);
      if (name) { d.name = name; await db.put('docs', d); refresh(); }
    });
    item('ph-bookmark-simple', d.subject ? 'Change subject' : 'Set subject', async () => {
      const subjects = Array.from(new Set(libDocs.map((x) => x.subject).filter(Boolean)));
      const s = await askText('Subject', 'Subject or course', d.subject || '', { suggestions: subjects, allowEmpty: true, hint: 'For example Biology or MTH 101. Leave empty to clear it.' });
      if (s !== null) { d.subject = s || undefined; await db.put('docs', d); refresh(); }
    });
    item('ph-calendar-plus', 'Plan a study session', () => sessionDialog(null, d.id));
    if (d.blob) item('ph-download-simple', 'Download original', () => download(d.blob, d.fileName || d.name));
    item('ph-trash', 'Delete', async () => {
      if (!await confirmDialog('Delete this file?', `"${d.name}" and all its notes will be removed from this device. This can't be undone.`, 'Delete')) return;
      await db.del('docs', d.id); await db.del('ink', d.id);
      for (const p of plan.filter((p) => p.docId === d.id)) { p.docId = null; await db.put('plan', p); }
      refresh(); toast('Deleted');
    }, 'danger');
    document.body.append(m);
    const r = anchor.getBoundingClientRect();
    const mw = m.offsetWidth, mh = m.offsetHeight;
    const below = r.bottom + 6 + mh < innerHeight;
    m.style.left = clamp(r.right - mw, 8, innerWidth - mw - 8) + 'px';
    m.style.top = Math.max(8, below ? r.bottom + 6 : r.top - mh - 6) + 'px';
    m.style.setProperty('--origin', (below ? 'top ' : 'bottom ') + 'right');
    openMenu = m;
    m.querySelector('button').focus();
  }
  document.addEventListener('pointerdown', (e) => { if (openMenu && !openMenu.contains(e.target)) closeMenu(); });

  function download(blob, name) {
    const a = el('a', '', { href: URL.createObjectURL(blob), download: name.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'file', rel: 'noopener' });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  }

  // ---------- Study plan ----------
  function renderPlan() {
    const m = ui.month;
    $('#monthTitle').textContent = m.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const g = $('#monthGrid');
    g.innerHTML = '';
    DOW.forEach((d) => g.append(el('span', 'dow', { textContent: d })));
    const counts = {};
    plan.forEach((p) => { counts[p.date] = (counts[p.date] || 0) + 1; });
    const start = weekStart(m);
    for (let i = 0; i < 42; i++) {
      const d = addDays(start, i), k = dayKey(d);
      if (i >= 35 && d.getMonth() !== m.getMonth()) break;
      const b = el('button', 'mday' + (d.getMonth() !== m.getMonth() ? ' out' : '') + (k === todayKey() ? ' is-today' : ''));
      b.setAttribute('aria-pressed', String(k === ui.day));
      b.setAttribute('aria-label', d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }) + (counts[k] ? `, ${counts[k]} planned` : ''));
      b.append(el('span', '', { textContent: d.getDate() }));
      const dots = el('span', 'dots');
      for (let j = 0; j < Math.min(3, counts[k] || 0); j++) dots.append(el('i'));
      b.append(dots);
      b.onclick = () => { ui.day = k; ui.week = weekStart(d); renderPlan(); };
      g.append(b);
    }
    $('#agendaTitle').textContent = parseDay(ui.day).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
    renderSessions($('#agenda'), ui.day, true);
  }

  async function sessionDialog(existing, docId) {
    const p = existing || { id: uid(), date: ui.day, time: pad2(Math.min(23, new Date().getHours() + 1)) + ':00', title: '', docId: docId || null, minutes: 45, done: false };
    const title = el('input', '', { type: 'text', required: true, maxLength: 120, value: p.title, placeholder: 'What will you study?' });
    const date = el('input', '', { type: 'date', required: true, value: p.date });
    const time = el('input', '', { type: 'time', value: p.time || '' });
    const mins = el('select');
    [15, 25, 30, 45, 60, 90, 120].forEach((n) => mins.append(el('option', '', { value: n, textContent: n + ' minutes', selected: n === +p.minutes })));
    const file = el('select');
    file.append(el('option', '', { value: '', textContent: 'No file' }));
    libDocs.slice().sort((a, b) => a.name.localeCompare(b.name)).forEach((d) => file.append(el('option', '', { value: d.id, textContent: d.name, selected: d.id === p.docId })));
    file.addEventListener('change', () => { if (!title.value.trim() && file.value) title.value = 'Study ' + file.selectedOptions[0].textContent; });
    if (!p.title && p.docId) { const d = libDocs.find((x) => x.id === p.docId); if (d) title.value = 'Study ' + d.name; }
    const lab = (t, input) => { const l = el('label'); l.append(el('span', '', { textContent: t }), input); return l; };
    const two = el('div', 'two'); two.append(lab('Day', date), lab('Time', time));
    const two2 = el('div', 'two'); two2.append(lab('Length', mins), lab('File', file));
    const ok = await openDialog({ title: existing ? 'Edit session' : 'Plan a study session', body: [lab('Title', title), two, two2], ok: existing ? 'Save' : 'Add to plan', focus: title });
    if (!ok) return;
    Object.assign(p, { title: title.value.trim().slice(0, 120), date: date.value || ui.day, time: time.value, minutes: +mins.value, docId: file.value || null, notified: false, snoozeUntil: undefined });
    await db.put('plan', p);
    if (!existing) plan.push(p);
    ui.day = p.date; ui.week = weekStart(parseDay(p.date)); ui.month = new Date(parseDay(p.date).getFullYear(), parseDay(p.date).getMonth(), 1);
    toast(existing ? 'Session updated' : 'Added to your study plan');
    renderSessionsEverywhere();
  }

  // ---------- Dialogs ----------
  function openDialog({ title, body, ok = 'Save', danger = false, focus }) {
    const dlg = $('#dialog');
    $('#dialogTitle').textContent = title;
    const b = $('#dialogBody');
    b.innerHTML = '';
    b.append(...body);
    const okBtn = $('#dialogOk');
    okBtn.textContent = ok;
    okBtn.classList.toggle('danger', danger);
    dlg.returnValue = '';
    dlg.showModal();
    if (focus) { focus.focus(); if (focus.select) focus.select(); }
    return new Promise((res) => dlg.addEventListener('close', () => res(dlg.returnValue === 'ok'), { once: true }));
  }
  async function askText(title, label, value, opts = {}) {
    const input = el('input', '', { type: 'text', value: value || '', maxLength: 120, required: !opts.allowEmpty });
    const l = el('label'); l.append(el('span', '', { textContent: label }), input);
    const body = [l];
    if (opts.suggestions && opts.suggestions.length) {
      const id = 'dl' + uid();
      const dl = el('datalist', '', { id });
      opts.suggestions.forEach((s) => dl.append(el('option', '', { value: s })));
      input.setAttribute('list', id);
      body.push(dl);
    }
    if (opts.hint) body.push(el('p', '', { textContent: opts.hint }));
    if (!await openDialog({ title, body, ok: opts.ok || 'Save', focus: input })) return null;
    const v = input.value.trim().slice(0, 120);
    return v || (opts.allowEmpty ? '' : null);
  }
  function confirmDialog(title, msg, ok) {
    return openDialog({ title, body: [el('p', '', { textContent: msg })], ok, danger: true });
  }

  // ---------- Settings ----------
  function applyTheme() {
    const t = store.get('theme', 'auto');
    if (t === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
    const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    $('#themeBtn').innerHTML = `<i class="ph ${dark ? 'ph-sun' : 'ph-moon'}"></i>`;
    $('#themeBtn').setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
    document.querySelector('meta[name="theme-color"]').content = dark ? '#181b33' : '#262b4a';
  }

  function renderSettings() {
    $('#setName').value = store.get('name', '');
    const t = store.get('theme', 'auto');
    document.querySelectorAll('#setTheme button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === t)));
    $('#setPenOnly').setAttribute('aria-checked', String(state.penOnly));
    $('#setPaper').value = store.get('paper', 'blank');
    $('#setRemind').setAttribute('aria-checked', String(REM.on));
    $('#setSound').setAttribute('aria-checked', String(REM.sound));
    $('#setLead').value = String(REM.lead);
    remindStatus();
    updateStorage();
  }

  async function updateStorage() {
    if (!navigator.storage || !navigator.storage.estimate) return;
    try {
      const { usage = 0, quota = 0 } = await navigator.storage.estimate();
      const pct = quota ? Math.max(1, Math.round(usage / quota * 100)) : 0;
      const html = `Using ${fmtSize(usage)}${quota ? ' of ' + fmtSize(quota) : ''}<div class="bar"><i style="width:${pct}%"></i></div>`;
      $('#storageMini').innerHTML = html;
      $('#storageFull').innerHTML = html;
    } catch { /* estimate unavailable */ }
  }

  async function backup() {
    if (!window.JSZip) return toast('The backup tool did not load. Reload TaniNote and try again.');
    toast('Packing your backup', 0);
    try {
      const [docs, inks, sessions, sounds] = await Promise.all([db.all('docs'), db.all('ink'), db.all('plan'), db.all('sounds')]);
      const zip = new JSZip();
      const meta = [];
      for (const d of docs) {
        const { blob, ...rest } = d;
        if (blob) zip.file('files/' + d.id, blob);
        meta.push(rest);
      }
      const soundMeta = sounds.map(({ blob, ...rest }) => { zip.file('sounds/' + rest.id, blob); return rest; });
      zip.file('taninote.json', JSON.stringify({ app: 'TaniNote', version: 1, exported: new Date().toISOString(), docs: meta, ink: inks, plan: sessions, sounds: soundMeta, settings: { name: store.get('name', ''), days: store.get('days', []) } }));
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
      download(blob, `TaniNote backup ${todayKey()}.zip`);
      toast('Backup downloaded. Keep it somewhere safe.');
    } catch (e) {
      toast('Backup failed: ' + (e.message || 'something went wrong'), 6000);
    }
  }

  // Restoring reads a file from outside, so every field is checked before it is stored.
  const ID_RE = /^[a-z0-9]{6,40}$/i;
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const isDataImg = (s) => typeof s === 'string' && /^data:image\/(jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(s) && s.length < 2e6;
  function cleanInk(x) {
    if (!x || !ID_RE.test(x.id) || typeof x.pages !== 'object' || !x.pages) return null;
    const pages = {};
    for (const [k, p] of Object.entries(x.pages)) {
      if (!/^[sx]\d{1,5}$/.test(k) || !p) continue;
      const strokes = (Array.isArray(p.strokes) ? p.strokes : []).filter((s) => s && (s.t === 'pen' || s.t === 'hl') && /^#[0-9a-f]{6}$/i.test(s.c) && typeof s.w === 'number' && Array.isArray(s.pts))
        .map((s) => ({ t: s.t, c: s.c, w: clamp(s.w, 0, 1), pts: s.pts.filter((q) => Array.isArray(q) && q.length >= 2 && q.every((v) => typeof v === 'number' && isFinite(v))).map((q) => [q[0], q[1], q[2] == null ? 0.5 : q[2]]) }))
        .filter((s) => s.pts.length);
      const texts = (Array.isArray(p.texts) ? p.texts : []).filter((t) => t && typeof t.text === 'string' && isFinite(t.x) && isFinite(t.y) && /^#[0-9a-f]{6}$/i.test(t.c))
        .map((t) => ({ x: clamp(t.x, 0, 1), y: Math.max(0, t.y), text: t.text.slice(0, 5000), size: clamp(+t.size || 18, 8, 80), c: t.c }));
      pages[k] = { strokes, texts };
    }
    const extra = (Array.isArray(x.extra) ? x.extra : []).slice(0, 2000).map((e) => ({ paper: ['lined', 'grid', 'dots', 'blank'].includes(e && e.paper) ? e.paper : 'blank' }));
    return { id: x.id, pages, extra };
  }

  async function restore(file) {
    if (!file) return;
    try {
      if (file.size > 4 * 1024 * 1024 * 1024) throw new Error('That backup is too large.');
      const zip = await JSZip.loadAsync(file);
      const metaFile = zip.file('taninote.json');
      if (!metaFile) throw new Error('This isn\'t a TaniNote backup.');
      const data = JSON.parse(await metaFile.async('string'));
      if (!data || data.app !== 'TaniNote' || !Array.isArray(data.docs)) throw new Error('This isn\'t a TaniNote backup.');
      const docs = data.docs.filter((d) => d && ID_RE.test(d.id) && KIND_LABEL[d.kind] && typeof d.name === 'string');
      if (!await confirmDialog('Restore this backup?', `It holds ${docs.length} file${docs.length === 1 ? '' : 's'}. Files that are already on this device stay; matching ones are replaced by the backup copy.`, 'Restore')) return;
      toast('Restoring', 0);
      let n = 0;
      for (const d of docs) {
        const doc = {
          id: d.id, name: d.name.slice(0, 200), kind: d.kind,
          fileName: typeof d.fileName === 'string' ? d.fileName.slice(0, 200) : undefined,
          mime: typeof d.mime === 'string' && /^[\w.+-]+\/[\w.+-]+$/.test(d.mime) ? d.mime : '',
          size: +d.size || 0, pages: +d.pages || undefined,
          created: +d.created || Date.now(), updated: +d.updated || Date.now(), opened: +d.opened || undefined,
          fav: !!d.fav, subject: typeof d.subject === 'string' ? d.subject.slice(0, 80) || undefined : undefined,
          paper: ['lined', 'grid', 'dots', 'blank'].includes(d.paper) ? d.paper : undefined,
          thumb: isDataImg(d.thumb) ? d.thumb : undefined,
          stats: d.stats && typeof d.stats === 'object' ? { pages: +d.stats.pages || 0, marked: +d.stats.marked || 0, hl: +d.stats.hl || 0, pen: +d.stats.pen || 0, notes: +d.stats.notes || 0 } : undefined,
        };
        if (d.kind !== 'notebook') {
          const f = zip.file('files/' + d.id);
          if (!f) continue;
          doc.blob = new Blob([await f.async('arraybuffer')], { type: doc.mime });
        }
        await db.put('docs', doc);
        n++;
      }
      for (const x of Array.isArray(data.ink) ? data.ink : []) { const c = cleanInk(x); if (c) await db.put('ink', c); }
      for (const p of Array.isArray(data.plan) ? data.plan : []) {
        if (!p || !ID_RE.test(p.id) || !DATE_RE.test(p.date) || typeof p.title !== 'string') continue;
        await db.put('plan', { id: p.id, date: p.date, time: /^\d{2}:\d{2}$/.test(p.time) ? p.time : '', title: p.title.slice(0, 120), minutes: clamp(+p.minutes || 45, 5, 600), docId: ID_RE.test(p.docId || '') ? p.docId : null, done: !!p.done });
      }
      for (const s of Array.isArray(data.sounds) ? data.sounds : []) {
        if (!s || !ID_RE.test(s.id) || typeof s.name !== 'string') continue;
        const f = zip.file('sounds/' + s.id);
        if (!f) continue;
        const type = typeof s.type === 'string' && /^audio\/[\w.+-]+$/.test(s.type) ? s.type : 'audio/mpeg';
        const blob = new Blob([await f.async('arraybuffer')], { type });
        if (blob.size > MAX_SOUND) continue;
        await db.put('sounds', { id: s.id, name: s.name.slice(0, 80), size: blob.size, type, blob, created: +s.created || Date.now() });
      }
      if (data.settings) {
        if (!store.get('name', '') && typeof data.settings.name === 'string') store.set('name', data.settings.name.slice(0, 40));
        if (Array.isArray(data.settings.days)) store.set('days', Array.from(new Set(store.get('days', []).concat(data.settings.days.filter((x) => DATE_RE.test(x))))).sort().slice(-400));
      }
      await refresh();
      toast(`Restored ${n} file${n === 1 ? '' : 's'}`);
    } catch (e) {
      toast('Couldn\'t restore: ' + (e.message || 'the backup is damaged') , 7000);
    }
  }

  async function wipe() {
    if (!await confirmDialog('Delete everything?', 'Every file, note and study session on this device will be erased. This can\'t be undone.', 'Delete everything')) return;
    stopSound(); await Promise.all([db.clear('docs'), db.clear('ink'), db.clear('plan'), db.clear('sounds')]);
    try { Object.keys(localStorage).filter((k) => k.startsWith('nota.')).forEach((k) => localStorage.removeItem(k)); } catch { /* ignore */ }
    location.reload();
  }

  // ---------- Study reminders ----------
  // Without a server, a web app can only remind while it is open (a tab, or installed to the home screen).
  // The scheduler checks every 15 seconds; a session that started up to 30 minutes ago still fires once.
  const REM = {
    get on() { return store.get('remind', false); },
    get lead() { return +store.get('remindLead', 5); },
    get sound() { return store.get('remindSound', true); },
  };
  const LATE_GRACE = 30 * 60000;
  let audioCtx = null;
  function unlockAudio() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!audioCtx) { try { audioCtx = new AC(); } catch { return; } }
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  }
  // Browsers only allow sound after the person has touched the page once, so unlock on the first touch or key.
  addEventListener('pointerdown', unlockAudio, { passive: true });
  addEventListener('keydown', unlockAudio);

  function chime() {
    unlockAudio();
    if (!audioCtx) return;
    const ring = (at) => [[659.25, 0], [783.99, 0.16], [1046.5, 0.32]].forEach(([f, d]) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      const t = at + d;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
      o.connect(g).connect(audioCtx.destination);
      o.start(t); o.stop(t + 1.2);
    });
    const now = audioCtx.currentTime + 0.03;
    ring(now); ring(now + 1.5);
    if (navigator.vibrate) navigator.vibrate([180, 90, 180]);
  }

  function sessionStart(p) {
    if (!p.time || !DATE_RE.test(p.date)) return null;
    const [h, m] = p.time.split(':').map(Number);
    const d = parseDay(p.date); d.setHours(h, m, 0, 0);
    return d.getTime();
  }
  function dueAt(p) {
    const start = sessionStart(p);
    if (start == null) return null;
    return p.snoozeUntil || start - REM.lead * 60000;
  }

  let checking = false;
  async function checkReminders() {
    updateBell();
    if (!REM.on || checking) return;
    checking = true;
    try {
      const now = Date.now();
      for (const p of plan) {
        if (p.done || p.notified) continue;
        const due = dueAt(p);
        if (due == null || due > now) continue;
        const end = (p.snoozeUntil || sessionStart(p)) + LATE_GRACE;
        p.notified = true;
        await db.put('plan', p).catch(() => {});
        if (now <= end) await fireReminder(p);
      }
    } finally { checking = false; }
  }

  function reminderText(p) {
    const start = sessionStart(p);
    const mins = Math.round((start - Date.now()) / 60000);
    const doc = p.docId && libDocs.find((d) => d.id === p.docId);
    const when = p.snoozeUntil || mins <= 0 ? `It's time to start${p.minutes ? ` your ${p.minutes} minute session` : ''}.` : `Starts in ${mins} minute${mins === 1 ? '' : 's'}, at ${p.time}.`;
    return { title: p.title || 'Study session', body: doc && doc.name !== p.title ? `${when} File: ${doc.name}.` : when, doc };
  }

  let shownReminder = null;
  async function fireReminder(p) {
    const { title, body, doc } = reminderText(p);
    if (REM.sound) chime();
    showReminderCard(p, title, body, doc);
    if (window.Notification && Notification.permission === 'granted' && (document.hidden || !document.hasFocus())) {
      const opts = { body, icon: 'icons/icon-192.png', badge: 'icons/favicon-32.png', tag: 'session-' + p.id, renotify: true, requireInteraction: true, silent: !REM.sound, data: { session: p.id } };
      try {
        const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
        if (reg) await reg.showNotification('Time to study: ' + title, opts);
        else new Notification('Time to study: ' + title, opts);
      } catch { /* the in-app card still shows */ }
    }
  }

  function showReminderCard(p, title, body, doc) {
    shownReminder = p;
    $('#remTitle').textContent = title;
    $('#remBody').textContent = body;
    $('#remOpen').hidden = !doc;
    $('#remSnooze').hidden = !p.id || p.test;
    $('#remDone').hidden = !p.id || p.test;
    $('#reminder').hidden = false;
    setTimeout(() => ($('#remOpen').hidden ? $('#remClose') : $('#remOpen')).focus({ preventScroll: true }), 50);
  }
  function hideReminder() { $('#reminder').hidden = true; shownReminder = null; }

  async function snooze(p, minutes) {
    p.snoozeUntil = Date.now() + minutes * 60000;
    p.notified = false;
    await db.put('plan', p);
    toast(`Snoozed. We'll remind you again in ${minutes} minutes.`);
  }

  function updateBell() {
    const left = plan.filter((p) => p.date === todayKey() && !p.done).length;
    const badge = $('#bellBadge');
    badge.hidden = !left;
    badge.textContent = left;
    $('#bellBtn').classList.toggle('off', !REM.on);
    $('#bellBtn').setAttribute('aria-label', REM.on ? `Study reminders on. ${left} session${left === 1 ? '' : 's'} left today` : 'Study reminders are off');
    $('#bellBtn').title = REM.on ? `Reminders on, ${left} left today` : 'Reminders off';
  }

  function remindStatus() {
    let msg;
    const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    if (!REM.on) msg = 'Reminders are off.';
    else if (!window.Notification) msg = /iP(hone|ad|od)|Macintosh/.test(navigator.userAgent) && 'ontouchend' in document && !standalone
      ? 'On iPhone and iPad, add TaniNote to your Home Screen (Share, then Add to Home Screen) to get notifications. Until then you get the in-app alert and chime while it is open.'
      : 'This browser can\'t show notifications. You get the in-app alert and chime while TaniNote is open.';
    else if (Notification.permission === 'denied') msg = 'Notifications are blocked for TaniNote in your browser settings. You still get the in-app alert and chime while it is open.';
    else if (Notification.permission === 'default') msg = 'Turn reminders off and on again to allow notifications.';
    else msg = 'Keep TaniNote open in a tab, or installed on your device, to get reminded. Websites can\'t wake up on their own.';
    $('#remindStatus span').textContent = msg;
  }

  async function setRemind(on) {
    store.set('remind', on);
    if (on) {
      unlockAudio();
      if (window.Notification && Notification.permission === 'default') {
        try { await Notification.requestPermission(); } catch { /* old Safari callback form */ }
      }
      toast('Reminders are on');
      checkReminders();
    }
    renderSettings();
    updateBell();
  }

  // ---------- Reading sounds ----------
  // Built-in tracks ship in the music/ folder and stream from there.
  // Imported sounds stay on this device in IndexedDB. Both loop through the same volume, fades and timer.
  const SOUNDS = [
    { id: 'piano', name: 'Soft piano', by: 'kalsstockmedia', src: 'music/kalsstockmedia-soft-piano-music-10-minutes-long-231315.mp3', icon: 'ph-piano-keys', bg: '#bdeef0' },
    { id: 'sleep', name: 'Relaxing sleep', by: 'atlasaudio', src: 'music/atlasaudio-relaxing-sleep-583152.mp3', icon: 'ph-moon-stars', bg: '#c9dcff' },
    { id: 'relaxing', name: 'Relaxing', by: 'leberch', src: 'music/leberch-relaxing-583082.mp3', icon: 'ph-flower-lotus', bg: '#f4c3cd' },
    { id: 'background', name: 'Relax background', by: 'sigmamusicart', src: 'music/sigmamusicart-relaxing-relax-background-music-537728.mp3', icon: 'ph-cloud-moon', bg: '#d9daf5' },
    { id: 'calm', name: 'Relaxing music', by: 'arpmedia', src: 'music/arpmedia-relaxing-relaxing-music-577813.mp3', icon: 'ph-music-notes-simple', bg: '#fbdcae' },
  ];
  const AUDIO_EXT = /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|webm|mp4)$/i;
  const MAX_SOUND = 80 * 1024 * 1024;
  const snd = { playing: null, voice: null, master: null, volume: +store.get('sndVol', 0.6), timer: 0, stopAt: 0, mine: [] };

  function masterOut() {
    unlockAudio();
    if (!audioCtx) return null;
    if (!snd.master) {
      snd.master = audioCtx.createGain();
      snd.master.gain.value = snd.volume * snd.volume;
      snd.master.connect(audioCtx.destination);
    }
    return snd.master;
  }

  function stopVoice(fade = 1.2) {
    const v = snd.voice;
    if (!v) return;
    snd.voice = null;
    const t = audioCtx.currentTime;
    v.bus.gain.cancelScheduledValues(t);
    v.bus.gain.setValueAtTime(v.bus.gain.value, t);
    v.bus.gain.linearRampToValueAtTime(0, t + fade);
    setTimeout(() => { v.cleanup(); v.bus.disconnect(); }, fade * 1000 + 100);
  }

  async function playSound(id) {
    if (snd.playing === id) { stopSound(); return; }
    const out = masterOut();
    if (!out) { toast('This browser can\'t play sounds.'); return; }
    if (audioCtx.state === 'suspended') await audioCtx.resume().catch(() => {});
    stopVoice(0.8);
    const bus = audioCtx.createGain();
    bus.gain.value = 0;
    bus.connect(out);
    const own = id.startsWith('u:');
    const track = own ? snd.mine.find((x) => x.id === id.slice(2)) : SOUNDS.find((x) => x.id === id);
    if (!track) { bus.disconnect(); return; }
    const el = new Audio();
    el.src = own ? URL.createObjectURL(track.blob) : encodeURI(track.src);
    el.loop = true;
    el.preload = 'auto';
    audioCtx.createMediaElementSource(el).connect(bus);
    snd.playing = id;
    renderSoundUi();
    try { await el.play(); } catch (e) {
      if (own) URL.revokeObjectURL(el.src);
      bus.disconnect();
      snd.playing = null;
      renderSoundUi();
      toast(own ? 'That sound file can\'t be played in this browser. Try MP3 or M4A.' : 'That track couldn\'t load. Check the music folder is next to TaniNote.', 6000);
      return;
    }
    const cleanup = () => { el.pause(); if (own) URL.revokeObjectURL(el.src); el.removeAttribute('src'); el.load(); };
    const t = audioCtx.currentTime;
    bus.gain.setValueAtTime(0, t);
    bus.gain.linearRampToValueAtTime(1, t + 2);
    snd.voice = { bus, cleanup };
    snd.playing = id;
    store.set('sndLast', id);
    armTimer();
    renderSoundUi();
  }

  function stopSound() {
    stopVoice(1.2);
    snd.playing = null;
    clearTimeout(snd.timer); snd.timer = 0; snd.stopAt = 0;
    renderSoundUi();
  }

  function armTimer() {
    clearTimeout(snd.timer);
    const m = +store.get('sndTimer', 0);
    snd.stopAt = m && snd.playing ? Date.now() + m * 60000 : 0;
    if (snd.stopAt) snd.timer = setTimeout(() => { stopVoice(6); snd.playing = null; snd.stopAt = 0; renderSoundUi(); }, m * 60000);
  }

  function setVolume(v) {
    snd.volume = v;
    store.set('sndVol', v);
    if (snd.master) snd.master.gain.setTargetAtTime(v * v, audioCtx.currentTime, 0.08);
  }

  function renderSoundUi() {
    document.querySelectorAll('.sound-btn').forEach((b) => b.classList.toggle('playing', !!snd.playing));
    const panel = $('#soundPanel');
    if (panel.hidden) return;
    const grid = $('#soundGrid');
    grid.innerHTML = '';
    for (const s of SOUNDS) {
      const b = el('button', 'sound-tile', { innerHTML: `<i class="ph ${s.icon}" aria-hidden="true"></i><span class="eq" aria-hidden="true"><i></i><i></i><i></i></span>` });
      const label = el('span', 'tile-name', { textContent: s.name });
      label.append(el('small', '', { textContent: s.by }));
      b.append(label);
      b.style.setProperty('--t-bg', s.bg);
      b.setAttribute('aria-label', `${s.name} by ${s.by}`);
      b.setAttribute('aria-pressed', String(snd.playing === s.id));
      b.onclick = () => playSound(s.id);
      grid.append(b);
    }
    const add = el('button', 'sound-tile add', { innerHTML: '<i class="ph ph-plus-circle" aria-hidden="true"></i>' });
    add.append(el('span', 'tile-name', { textContent: 'Add your own' }));
    add.onclick = () => $('#soundInput').click();
    grid.append(add);
    const list = $('#mySounds');
    list.innerHTML = '';
    if (!snd.mine.length) list.append(el('li', 'none', { textContent: 'Import music or nature sounds from your device. MP3 and M4A work everywhere.' }));
    for (const s of snd.mine) {
      const on = snd.playing === 'u:' + s.id;
      const li = el('li', on ? 'playing' : '');
      const play = el('button', 'play', { innerHTML: `<i class="ph-fill ${on ? 'ph-pause' : 'ph-play'}"></i>` });
      play.setAttribute('aria-label', (on ? 'Stop ' : 'Play ') + s.name);
      play.onclick = () => playSound('u:' + s.id);
      const name = el('span', 'name', { textContent: s.name, title: s.name });
      name.append(el('small', '', { textContent: fmtSize(s.size) }));
      const del = el('button', 'icon-btn', { innerHTML: '<i class="ph ph-trash"></i>' });
      del.setAttribute('aria-label', 'Delete ' + s.name);
      del.onclick = async () => {
        if (!await confirmDialog('Delete this sound?', `"${s.name}" will be removed from TaniNote.`, 'Delete')) return;
        if (on) stopSound();
        await db.del('sounds', s.id);
        snd.mine = snd.mine.filter((x) => x !== s);
        renderSoundUi();
      };
      li.append(play, name, del);
      list.append(li);
    }
    $('#soundVol').value = snd.volume;
    const m = String(store.get('sndTimer', 0));
    document.querySelectorAll('#soundTimer button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.m === m)));
    const left = snd.stopAt ? Math.max(1, Math.round((snd.stopAt - Date.now()) / 60000)) : 0;
    $('#soundLeft').textContent = snd.playing && left ? `Fades out in ${left} min` : '';
  }

  async function openSoundPanel(anchor) {
    const panel = $('#soundPanel');
    if (!panel.hidden) { closeSoundPanel(); return; }
    try { snd.mine = (await db.all('sounds')).sort((a, b) => a.created - b.created); } catch { snd.mine = []; }
    panel.hidden = false;
    if (innerWidth > 760) {
      const r = anchor.getBoundingClientRect();
      panel.style.top = Math.min(r.bottom + 10, innerHeight - 200) + 'px';
      panel.style.right = Math.max(12, innerWidth - r.right) + 'px';
      panel.style.left = 'auto';
    } else { panel.style.top = ''; panel.style.right = ''; panel.style.left = ''; }
    renderSoundUi();
    unlockAudio();
    setTimeout(() => panel.querySelector('.sound-tile').focus({ preventScroll: true }), 30);
    clearInterval(snd.leftTick);
    snd.leftTick = setInterval(() => { if (!panel.hidden) renderSoundUi(); }, 30000);
  }
  function closeSoundPanel() { $('#soundPanel').hidden = true; clearInterval(snd.leftTick); }

  async function importSounds(list) {
    for (const f of Array.from(list || [])) {
      if (!((f.type || '').startsWith('audio/') || AUDIO_EXT.test(f.name))) { toast(`"${f.name}" isn't an audio file.`, 5000); continue; }
      if (f.size > MAX_SOUND) { toast(`"${f.name}" is over 80 MB. Try a shorter or more compressed file.`, 6000); continue; }
      // Make sure the browser can actually decode it before saving
      const ok = await new Promise((res) => {
        const a = new Audio(); const url = URL.createObjectURL(f);
        const done = (v) => { URL.revokeObjectURL(url); res(v); };
        a.onloadedmetadata = () => done(true); a.onerror = () => done(false);
        setTimeout(() => done(false), 8000);
        a.preload = 'metadata'; a.src = url;
      });
      if (!ok) { toast(`"${f.name}" can't be played in this browser. Try MP3 or M4A.`, 6000); continue; }
      const s = { id: uid(), name: stripExt(f.name).slice(0, 80), size: f.size, type: f.type || 'audio/mpeg', blob: new Blob([f], { type: f.type || 'audio/mpeg' }), created: Date.now() };
      try { await db.put('sounds', s); snd.mine.push(s); toast(`Added "${s.name}"`); }
      catch { toast('Couldn\'t save that sound. Your device may be out of space.', 6000); }
    }
    renderSoundUi();
  }

  // ---------- Import ----------
  async function importFiles(list) {
    const files = Array.from(list || []);
    if (!files.length) return;
    try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch { /* optional */ }
    const added = [];
    for (const f of files) {
      if (f.size > MAX_FILE) { toast(`"${f.name}" is larger than 300 MB, which is too big to open in a browser.`, 7000); continue; }
      if (!f.size) { toast(`"${f.name}" is empty.`, 5000); continue; }
      let kind;
      try { kind = await detect(f); } catch (e) { toast(`Couldn't read "${f.name}". ${e.message || ''}`, 6000); continue; }
      if (typeof kind === 'object') {
        toast(`${kind.unsupported} can't open in a browser. Open "${f.name}" in its own app, export it as PDF, then import the PDF.`, 8000);
        continue;
      }
      const now = Date.now();
      const doc = { id: uid(), name: stripExt(f.name).slice(0, 200), fileName: f.name.slice(0, 200), kind, mime: f.type, size: f.size, blob: new Blob([f], { type: f.type }), created: now, updated: now };
      if (ui.filter.startsWith('s:')) doc.subject = ui.filter.slice(2);
      try {
        if (kind === 'pdf' && window.pdfjsLib) { const r = await pdfThumb(f).catch(() => null); if (r) { doc.thumb = r.thumb; doc.pages = r.pages; } }
        if (kind === 'image') { doc.thumb = await imageThumb(f); doc.pages = 1; }
      } catch { /* thumbnail is optional */ }
      try { await db.put('docs', doc); added.push(doc); }
      catch (e) { toast(`Couldn't save "${f.name}". Your device may be out of space.`, 6000); }
    }
    await refresh();
    if (added.length === 1) openDoc(added[0].id);
    else if (added.length > 1) toast(`Added ${added.length} files`);
  }

  async function newNotebook() {
    const now = Date.now();
    const paper = store.get('paper', 'blank');
    const doc = { id: uid(), name: 'Notebook ' + new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), kind: 'notebook', paper, created: now, updated: now, pages: 1 };
    if (ui.filter.startsWith('s:')) doc.subject = ui.filter.slice(2);
    await db.put('docs', doc);
    await db.put('ink', { id: doc.id, pages: {}, extra: [{ paper }] });
    openDoc(doc.id);
  }

  // ---------------------------------------------------------------------------
  // Converting reflowable files to HTML
  // ---------------------------------------------------------------------------
  async function toHtml(doc) {
    const k = doc.kind;
    if (k === 'docx') {
      const r = await mammoth.convertToHtml({ arrayBuffer: await doc.blob.arrayBuffer() });
      return sanitize(r.value) || '<p><em>This document has no readable text.</em></p>';
    }
    if (k === 'md') return sanitize(marked.parse(await doc.blob.text()));
    if (k === 'html') return sanitize(await doc.blob.text());
    if (k === 'text') return '<pre class="plain">' + esc(await doc.blob.text()) + '</pre>';
    if (k === 'epub') return epubToHtml(doc.blob);
    if (k === 'pptx') return pptxToHtml(doc.blob);
    throw new Error('Unknown file type');
  }

  const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp' };
  async function zipDataUrl(zip, path) {
    const f = zip.file(path) || zip.file(decodeURI(path));
    if (!f) return '';
    const ext = path.split('.').pop().toLowerCase();
    if (!MIME[ext]) return '';
    return 'data:' + MIME[ext] + ';base64,' + await f.async('base64');
  }

  async function epubToHtml(blob) {
    const zip = await JSZip.loadAsync(blob);
    const read = (p) => { const f = zip.file(p); return f ? f.async('string') : Promise.resolve(null); };
    const container = await read('META-INF/container.xml');
    if (!container) throw new Error('This EPUB is missing its contents file.');
    const rootfile = parseXml(container).getElementsByTagNameNS('*', 'rootfile')[0];
    const opfPath = rootfile && rootfile.getAttribute('full-path');
    const opfText = opfPath && await read(opfPath);
    if (!opfText) throw new Error('This EPUB is missing its package file.');
    const opf = parseXml(opfText);
    const base = dirOf(opfPath);
    const items = {};
    for (const it of opf.getElementsByTagNameNS('*', 'item')) items[it.getAttribute('id')] = { href: it.getAttribute('href'), type: it.getAttribute('media-type') || '' };
    const parts = [];
    for (const ref of opf.getElementsByTagNameNS('*', 'itemref')) {
      const it = items[ref.getAttribute('idref')];
      if (!it || !/html/.test(it.type)) continue;
      const path = joinPath(base, it.href);
      const src = await read(path);
      if (!src) continue;
      let d = new DOMParser().parseFromString(src, 'application/xhtml+xml');
      if (d.getElementsByTagName('parsererror').length || !d.body) d = new DOMParser().parseFromString(src, 'text/html');
      const here = dirOf(path);
      for (const img of Array.from(d.querySelectorAll('img'))) img.setAttribute('src', await zipDataUrl(zip, joinPath(here, img.getAttribute('src'))));
      for (const im of Array.from(d.getElementsByTagNameNS('*', 'image'))) {
        const href = im.getAttribute('xlink:href') || im.getAttribute('href') || im.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
        const img = d.createElement('img');
        img.setAttribute('src', await zipDataUrl(zip, joinPath(here, href)));
        const svg = im.closest ? im.closest('svg') : null;
        (svg || im).replaceWith(img);
      }
      parts.push('<section class="chapter">' + sanitize(d.body ? d.body.innerHTML : '') + '</section>');
    }
    if (!parts.length) throw new Error('This EPUB has no readable chapters.');
    return parts.join('');
  }

  async function pptxToHtml(blob) {
    const zip = await JSZip.loadAsync(blob);
    const relsOf = async (path) => {
      const f = zip.file(dirOf(path) + '_rels/' + path.split('/').pop() + '.rels');
      const map = {};
      if (f) for (const r of parseXml(await f.async('string')).getElementsByTagNameNS('*', 'Relationship')) map[r.getAttribute('Id')] = r.getAttribute('Target');
      return map;
    };
    // Slide order comes from presentation.xml; fall back to file numbering.
    let slides = [];
    try {
      const pres = parseXml(await zip.file('ppt/presentation.xml').async('string'));
      const rels = await relsOf('ppt/presentation.xml');
      for (const s of pres.getElementsByTagNameNS('*', 'sldId')) {
        const rid = s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
        if (rels[rid]) slides.push(joinPath('ppt/', rels[rid]));
      }
    } catch { /* fall through */ }
    if (!slides.length) {
      const num = (n) => +n.match(/(\d+)\.xml$/)[1];
      slides = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => num(a) - num(b));
    }
    const out = [];
    for (let i = 0; i < slides.length; i++) {
      const f = zip.file(slides[i]);
      if (!f) continue;
      const x = parseXml(await f.async('string'));
      const rels = await relsOf(slides[i]);
      const html = [`<div class="slide-no">Slide ${i + 1}</div>`];
      let first = true;
      const walker = x.createTreeWalker(x.documentElement, NodeFilter.SHOW_ELEMENT);
      let n;
      while ((n = walker.nextNode())) {
        if (n.localName === 'p' && /drawingml/.test(n.namespaceURI || '')) {
          const t = Array.from(n.getElementsByTagNameNS('*', 't')).map((e) => e.textContent).join('');
          if (!t.trim()) continue;
          if (first) { html.push('<h3>' + esc(t) + '</h3>'); first = false; }
          else {
            const ppr = n.getElementsByTagNameNS('*', 'pPr')[0];
            const lvl = ppr ? +(ppr.getAttribute('lvl') || 0) : 0;
            html.push(`<p style="margin-left:${lvl * 24}px">${esc(t)}</p>`);
          }
        } else if (n.localName === 'blip') {
          const rid = n.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed');
          if (rels[rid]) {
            const url = await zipDataUrl(zip, joinPath(dirOf(slides[i]), rels[rid]));
            if (url) html.push(`<img src="${url}" alt="">`);
          }
        }
      }
      out.push('<div class="slide">' + html.join('') + '</div>');
    }
    if (!out.length) throw new Error('This presentation has no slides.');
    return out.join('');
  }

  // ---------------------------------------------------------------------------
  // Viewer: sheets
  // ---------------------------------------------------------------------------
  function pageData(key, create) {
    let p = state.ink.pages[key];
    if (!p && create) p = state.ink.pages[key] = { strokes: [], texts: [] };
    return p;
  }
  const snap = (key) => JSON.stringify(pageData(key) || { strokes: [], texts: [] });

  function makeSheet(key, kind, aspect) {
    const wrap = el('div', 'sheet');
    const ink = el('canvas', 'ink');
    const texts = el('div', 'texts');
    wrap.append(ink, texts);
    const s = { key, kind, aspect, wrap, ink, texts, visible: false };
    wrap.addEventListener('pointerdown', (e) => onDown(s, e));
    wrap.addEventListener('pointermove', (e) => onMove(s, e));
    wrap.addEventListener('pointerup', (e) => onUp(s, e));
    wrap.addEventListener('pointercancel', (e) => onUp(s, e, true));
    wrap.addEventListener('click', (e) => onClick(s, e));
    state.sheets.push(s);
    return s;
  }

  function addBlankSheet(index, paper) {
    const s = makeSheet('x' + index, 'blank', A4);
    s.paper = paper || 'blank';
    s.wrap.classList.add('paper-' + s.paper);
    stage.append(s.wrap);
    observer.observe(s.wrap);
    return s;
  }

  const observer = new IntersectionObserver((entries) => {
    for (const en of entries) {
      const s = state.sheets.find((x) => x.wrap === en.target);
      if (!s) continue;
      if (en.isIntersecting) { s.visible = true; renderSheet(s); }
      else { s.visible = false; freeSheet(s); }
    }
  }, { root: scroller, rootMargin: '900px 0px' });

  function sheetCss(s) { const w = BASE * state.zoom; return { w, h: w * s.aspect }; }

  function renderSheet(s, deferBase) {
    const { w, h } = sheetCss(s);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pw = Math.max(1, Math.round(w * dpr)), ph = Math.max(1, Math.round(h * dpr));
    if (s.ink.width !== pw || s.ink.height !== ph) { s.ink.width = pw; s.ink.height = ph; }
    redrawInk(s);
    renderTexts(s);
    if (s.kind === 'pdf') { if (deferBase) scheduleBase(s); else renderPdfBase(s); }
  }

  function freeSheet(s) {
    s.ink.width = 0; s.ink.height = 0;
    if (s.kind === 'pdf') {
      s.token = (s.token || 0) + 1;
      if (s.task) { try { s.task.cancel(); } catch { /* already done */ } }
      if (s.base) { s.base.width = 0; s.base.height = 0; }
      s.baseW = 0;
    }
    s.texts.innerHTML = '';
  }

  let baseTimer = null;
  function scheduleBase() {
    clearTimeout(baseTimer);
    baseTimer = setTimeout(() => state.sheets.forEach((x) => x.visible && x.kind === 'pdf' && renderPdfBase(x)), 180);
  }

  async function renderPdfBase(s) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pw = Math.round(sheetCss(s).w * dpr);
    if (s.baseW === pw) return;
    const token = s.token = (s.token || 0) + 1;
    if (!s.baseW) s.wrap.classList.add('loading');
    try {
      const page = await state.pdf.getPage(s.n);
      if (token !== s.token || !s.visible) return;
      const vp1 = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: pw / vp1.width });
      const c = el('canvas', 'base');
      c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      if (s.task) { try { s.task.cancel(); } catch { /* ignore */ } }
      s.task = page.render({ canvasContext: ctx, viewport: vp });
      await s.task.promise;
      if (token !== s.token) return;
      if (s.base) s.base.replaceWith(c); else s.wrap.prepend(c);
      s.base = c; s.baseW = pw;
      s.wrap.classList.remove('loading');
    } catch (e) {
      if (e && e.name === 'RenderingCancelledException') return;
      s.wrap.classList.remove('loading');
    }
  }

  // ---------------------------------------------------------------------------
  // Ink drawing
  // ---------------------------------------------------------------------------
  function strokeStyle(ctx, st) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = st.c; ctx.fillStyle = st.c;
    ctx.globalCompositeOperation = st.t === 'hl' ? 'darken' : 'source-over';
  }
  const strokeWidth = (st, p, W) => st.t === 'hl' ? st.w * W : st.w * W * (0.45 + (p == null ? 0.5 : p) * 1.1);

  function drawSegment(ctx, st, W, i) {
    const pts = st.pts;
    const a = pts[i - 2] || pts[i - 1], b = pts[i - 1], c = pts[i];
    ctx.lineWidth = strokeWidth(st, b[2], W);
    ctx.beginPath();
    ctx.moveTo((a[0] + b[0]) / 2 * W, (a[1] + b[1]) / 2 * W);
    ctx.quadraticCurveTo(b[0] * W, b[1] * W, (b[0] + c[0]) / 2 * W, (b[1] + c[1]) / 2 * W);
    ctx.stroke();
  }
  function drawTail(ctx, st, W) {
    const n = st.pts.length; if (n < 2) return;
    const b = st.pts[n - 2], c = st.pts[n - 1];
    ctx.lineWidth = strokeWidth(st, c[2], W);
    ctx.beginPath();
    ctx.moveTo((b[0] + c[0]) / 2 * W, (b[1] + c[1]) / 2 * W);
    ctx.lineTo(c[0] * W, c[1] * W);
    ctx.stroke();
  }
  function drawDot(ctx, st, W) {
    const p = st.pts[0];
    ctx.beginPath(); ctx.arc(p[0] * W, p[1] * W, strokeWidth(st, p[2], W) / 2, 0, Math.PI * 2); ctx.fill();
  }
  function drawStroke(ctx, st, W) {
    ctx.save(); strokeStyle(ctx, st);
    if (st.pts.length === 1) drawDot(ctx, st, W);
    else { if (st.t === 'hl') drawHighlight(ctx, st, W); else { for (let i = 1; i < st.pts.length; i++) drawSegment(ctx, st, W, i); drawTail(ctx, st, W); } }
    ctx.restore();
  }
  // Highlighter: one continuous path so overlapping joins never darken.
  function drawHighlight(ctx, st, W) {
    const p = st.pts;
    ctx.lineWidth = st.w * W;
    ctx.beginPath();
    ctx.moveTo(p[0][0] * W, p[0][1] * W);
    for (let i = 1; i < p.length - 1; i++) ctx.quadraticCurveTo(p[i][0] * W, p[i][1] * W, (p[i][0] + p[i + 1][0]) / 2 * W, (p[i][1] + p[i + 1][1]) / 2 * W);
    ctx.lineTo(p[p.length - 1][0] * W, p[p.length - 1][1] * W);
    ctx.stroke();
  }

  function redrawInk(s) {
    if (!s.ink.width) return;
    const ctx = s.ink.getContext('2d');
    ctx.clearRect(0, 0, s.ink.width, s.ink.height);
    const pg = pageData(s.key);
    if (pg) for (const st of pg.strokes) drawStroke(ctx, st, s.ink.width);
  }

  function drawTexts(ctx, s, W) {
    const pg = pageData(s.key);
    if (!pg) return;
    for (const t of pg.texts) {
      if (!t.text.trim()) continue;
      const fs = t.size / BASE * W;
      const pad = fs * 0.25;
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.font = `${fs}px ${UI_FONT}`;
      ctx.fillStyle = t.c; ctx.textBaseline = 'top';
      const maxW = (0.98 - t.x) * W - pad * 2;
      const lh = fs * 1.3;
      wrapLines(ctx, t.text, maxW).forEach((line, i) => ctx.fillText(line, t.x * W + pad, t.y * W + fs * 0.1 + (lh - fs) / 2 + i * lh));
      ctx.restore();
    }
  }
  function wrapLines(ctx, text, maxW) {
    const out = [];
    for (const para of text.split('\n')) {
      let line = '';
      for (const word of para.split(/(\s+)/)) {
        const test = line + word;
        if (line.trim() && ctx.measureText(test).width > maxW) { out.push(line.trimEnd()); line = word.trimStart(); }
        else line = test;
      }
      out.push(line);
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Text boxes
  // ---------------------------------------------------------------------------
  function renderTexts(s) {
    s.texts.innerHTML = '';
    const pg = pageData(s.key);
    if (pg) for (const t of pg.texts) s.texts.append(textBox(s, t));
  }
  function placeText(d, s, t) {
    d.style.left = t.x * 100 + '%';
    d.style.top = (t.y / s.aspect) * 100 + '%';
    d.style.fontSize = t.size * state.zoom + 'px';
    d.style.color = t.c;
    d.style.maxWidth = (98 - t.x * 100) + '%';
  }
  function textBox(s, t) {
    const d = el('div', 'tbox');
    d.contentEditable = 'true';
    d.spellcheck = true;
    d.setAttribute('role', 'textbox');
    d.setAttribute('aria-label', 'Note');
    d.innerText = t.text;
    d._item = t; d._before = null;
    placeText(d, s, t);
    d.addEventListener('focus', () => { if (d._before == null) d._before = snap(s.key); });
    d.addEventListener('input', () => { t.text = d.innerText.replace(/\n$/, ''); markDirty(); });
    d.addEventListener('keydown', (e) => { if (e.key === 'Escape') d.blur(); e.stopPropagation(); });
    d.addEventListener('blur', () => {
      if (!t.text.trim()) { const pg = pageData(s.key); if (pg) pg.texts = pg.texts.filter((x) => x !== t); d.remove(); }
      if (d._before != null) commit(s.key, d._before);
      d._before = null;
    });
    return d;
  }
  // Start a typed note where the page was tapped.
  function createTextAt(s, clientX, clientY) {
    const before = snap(s.key);
    const r = s.wrap.getBoundingClientRect();
    const set = state.settings.text;
    const t = { x: clamp((clientX - r.left) / r.width, 0, 0.9), y: Math.max(0, (clientY - r.top) / r.width - set.w * 0.75 / BASE), text: '', size: set.w, c: set.c };
    pageData(s.key, true).texts.push(t);
    const d = textBox(s, t);
    d._before = before;
    s.texts.append(d);
    d.focus();
  }
  const editingText = () => { const a = document.activeElement; return !!(a && a.classList && a.classList.contains('tbox')); };
  let tapState = { wasEditing: false, type: '' };
  // Taps that aren't handled as a drawing gesture (text tool, hand tool, fingers in Pencil-only mode) start a note.
  function onClick(s, e) {
    if (e.target.closest('.tbox')) return;
    const fingerInPenOnly = state.penOnly && isDrawTool() && tapState.type === 'touch';
    if (state.tool !== 'text' && state.tool !== 'scroll' && !fingerInPenOnly) return;
    if (tapState.wasEditing) return;  // the tap just finished the note being typed
    createTextAt(s, e.clientX, e.clientY);
  }
  function blurText() { const a = document.activeElement; if (a && a.classList && a.classList.contains('tbox')) a.blur(); }

  // ---------------------------------------------------------------------------
  // Pointer input
  // ---------------------------------------------------------------------------
  const isDrawTool = () => state.tool === 'pen' || state.tool === 'hl' || state.tool === 'eraser';
  function localPt(s, e) {
    const r = s.wrap.getBoundingClientRect();
    const p = e.pointerType === 'mouse' || !e.pressure ? 0.5 : e.pressure;
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.width, Math.round(p * 100) / 100];
  }

  function onDown(s, e) {
    if (e.pointerType === 'pen' && !state.sawPen) {
      state.sawPen = true;
      if (!state.penOnly) { setPenOnly(true); toast('Pencil found. Your pen draws, your fingers scroll and pinch.', 4200); }
    }
    tapState = { wasEditing: editingText(), type: e.pointerType };
    if (e.target.closest('.tbox')) return;  // tapping a note edits it
    if (!isDrawTool() || state.active) return;
    if (state.penOnly && e.pointerType === 'touch') return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    blurText();
    try { s.wrap.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    if (!s.ink.width) renderSheet(s);
    const p = localPt(s, e);
    const before = snap(s.key);
    if (state.tool === 'eraser') {
      state.active = { s, id: e.pointerId, before, erase: true };
      eraseAt(s, p);
    } else {
      const set = state.settings[state.tool];
      const st = { t: state.tool, c: set.c, w: set.w / BASE, pts: [p] };
      state.active = { s, id: e.pointerId, before, stroke: st, start: performance.now(), x: e.clientX, y: e.clientY, type: e.pointerType, wasEditing: tapState.wasEditing };
      const ctx = s.ink.getContext('2d');
      ctx.save(); strokeStyle(ctx, st); drawDot(ctx, st, s.ink.width); ctx.restore();
    }
  }

  function onMove(s, e) {
    const a = state.active;
    if (!a || a.id !== e.pointerId || a.s !== s) return;
    e.preventDefault();
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    const list = evs.length ? evs : [e];
    if (a.erase) { for (const ev of list) eraseAt(s, localPt(s, ev)); return; }
    const st = a.stroke, W = s.ink.width;
    const ctx = s.ink.getContext('2d');
    for (const ev of list) {
      const p = localPt(s, ev);
      const last = st.pts[st.pts.length - 1];
      if (Math.abs(p[0] - last[0]) + Math.abs(p[1] - last[1]) < 0.0009) continue;
      st.pts.push(p);
      if (st.t !== 'hl') { ctx.save(); strokeStyle(ctx, st); drawSegment(ctx, st, W, st.pts.length - 1); ctx.restore(); }
    }
    if (st.t === 'hl') { // redraw the page so the highlight stays one clean band
      if (!a.raf) a.raf = requestAnimationFrame(() => { a.raf = 0; redrawInk(s); drawStroke(ctx, st, W); });
    }
  }

  function onUp(s, e, cancelled) {
    const a = state.active;
    if (!a || a.id !== e.pointerId) return;
    state.active = null;
    if (a.raf) cancelAnimationFrame(a.raf);
    // A quick tap with a mouse or finger (not a drag, not the Pencil) means "type here", not "draw a dot".
    const tap = a.stroke && !cancelled && a.type !== 'pen' && performance.now() - a.start < 350 && Math.hypot(e.clientX - a.x, e.clientY - a.y) < 6;
    if (tap) {
      redrawInk(s);
      if (!a.wasEditing) createTextAt(s, e.clientX, e.clientY);
      return;
    }
    if (a.stroke && !(cancelled && a.stroke.pts.length < 3)) {
      pageData(s.key, true).strokes.push(a.stroke);
    }
    redrawInk(s);
    commit(s.key, a.before);
  }

  function distToSeg(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    let t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0;
    t = clamp(t, 0, 1);
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
  }
  function eraseAt(s, p) {
    const pg = pageData(s.key);
    if (!pg) return;
    const r = state.settings.eraser.w / 2 / BASE;
    const keep = pg.strokes.filter((st) => {
      const lim = r + st.w / 2;
      const pts = st.pts;
      if (pts.length === 1) return Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]) > lim;
      for (let i = 1; i < pts.length; i++) if (distToSeg(p, pts[i - 1], pts[i]) <= lim) return false;
      return true;
    });
    let changed = keep.length !== pg.strokes.length;
    pg.strokes = keep;
    const rect = s.wrap.getBoundingClientRect();
    for (const d of Array.from(s.texts.children)) {
      const b = d.getBoundingClientRect();
      const x = rect.left + p[0] * rect.width, y = rect.top + p[1] * rect.width;
      if (x >= b.left && x <= b.right && y >= b.top && y <= b.bottom) {
        pg.texts = pg.texts.filter((t) => t !== d._item); d.remove(); changed = true;
      }
    }
    if (changed) redrawInk(s);
  }

  // ---------------------------------------------------------------------------
  // Undo / save
  // ---------------------------------------------------------------------------
  function commit(key, before) {
    const after = snap(key);
    if (after === before) return;
    state.undo.push({ key, before, after });
    if (state.undo.length > 300) state.undo.shift();
    state.redo = [];
    updateUndoUi();
    markDirty();
  }
  function applySnap(key, json) {
    state.ink.pages[key] = JSON.parse(json);
    const s = state.sheets.find((x) => x.key === key);
    if (s) {
      if (s.visible) { redrawInk(s); renderTexts(s); }
      const top = s.wrap.getBoundingClientRect().top, sr = scroller.getBoundingClientRect();
      if (top > sr.bottom || s.wrap.getBoundingClientRect().bottom < sr.top + 120) s.wrap.scrollIntoView({ block: 'start' });
    }
    markDirty();
  }
  function doUndo() { blurText(); const h = state.undo.pop(); if (!h) return; state.redo.push(h); applySnap(h.key, h.before); updateUndoUi(); }
  function doRedo() { blurText(); const h = state.redo.pop(); if (!h) return; state.undo.push(h); applySnap(h.key, h.after); updateUndoUi(); }
  function updateUndoUi() { $('#undoBtn').disabled = !state.undo.length; $('#redoBtn').disabled = !state.redo.length; }

  let saveTimer = null;
  function markDirty() {
    state.dirty = true;
    noteStudyDay();
    $('#saveStatus').textContent = 'Saving';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 500);
  }
  async function save() {
    clearTimeout(saveTimer);
    if (!state.ink) return;
    try {
      state.ink.view = { zoom: state.zoom, scroll: scroller.scrollTop / Math.max(1, scroller.scrollHeight) };
      await db.put('ink', state.ink);
      $('#saveStatus').textContent = 'Saved';
    } catch (e) {
      $('#saveStatus').textContent = 'Not saved';
      toast('Couldn\'t save your notes. Your device may be out of space.', 6000);
    }
  }

  // ---------------------------------------------------------------------------
  // Opening / closing documents
  // ---------------------------------------------------------------------------
  async function openDoc(id) {
    const doc = await db.get('docs', id);
    if (!doc) { toast('That file is gone.'); refresh(); return; }
    closeMenu();
    state.doc = doc;
    state.ink = (await db.get('ink', id)) || { id, pages: {}, extra: [] };
    state.ink.extra = state.ink.extra || [];
    state.undo = []; state.redo = []; state.dirty = false;
    state.sheets = []; state.flow = null;
    if (state.pdf) { state.pdf.destroy(); state.pdf = null; }
    stage.innerHTML = '';
    $('#docTitle').textContent = doc.name;
    $('#saveStatus').textContent = '';
    $('#app').hidden = true;
    $('#viewer').hidden = false;
    if (!history.state || history.state.doc !== id) history.pushState({ doc: id }, '', '#' + id);
    measureBar();
    moveNib();
    updateUndoUi();
    const v = state.ink.view;
    // Reopen at the saved zoom, but never wider than this screen (the file may have been last open on a bigger one).
    state.zoom = v && v.zoom ? Math.min(v.zoom, fitZoom()) : fitZoom();
    stage.style.setProperty('--u', PAPER_U * state.zoom + 'px');
    try {
      await buildSource(doc);
    } catch (e) {
      showDocError(doc, e);
      return;
    }
    state.ink.extra.forEach((x, i) => addBlankSheet(i, x.paper));
    layout();
    for (const s of state.sheets) if (s.kind !== 'tile') observer.observe(s.wrap);
    if (v && v.scroll) scroller.scrollTop = v.scroll * scroller.scrollHeight;
    else scroller.scrollTop = 0;
    updatePageInd();
    doc.opened = Date.now();
    db.put('docs', doc).catch(() => {});
  }

  async function buildSource(doc) {
    if (doc.kind === 'notebook') return;
    if (doc.kind === 'pdf') {
      if (!window.pdfjsLib) throw new Error('The PDF reader could not load. Check your internet connection and reopen the file.');
      const task = pdfjsLib.getDocument(Object.assign({ data: new Uint8Array(await doc.blob.arrayBuffer()) }, PDF_OPTS));
      let cancelled = false;
      task.onPassword = (update, reason) => {
        const pw = prompt(reason === 2 ? 'That password didn\'t work. Try again:' : `"${doc.name}" is password-protected. Enter its password:`);
        if (pw == null) { cancelled = true; task.destroy(); } else update(pw);
      };
      let pdf;
      try { pdf = await task.promise; } catch (e) {
        if (cancelled) throw new Error('This PDF needs its password to open.');
        throw new Error('This PDF is damaged or not a real PDF. Try downloading it again.');
      }
      state.pdf = pdf;
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const vp = page.getViewport({ scale: 1 });
        const s = makeSheet('s' + (i - 1), 'pdf', vp.height / vp.width);
        s.n = i; s.ptW = vp.width; s.ptH = vp.height;
        stage.append(s.wrap);
        page.cleanup();
      }
      return;
    }
    if (doc.kind === 'image') {
      const url = URL.createObjectURL(doc.blob);
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('This image format can\'t be shown in this browser. Try a PNG or JPG.')); img.src = url; });
      const s = makeSheet('s0', 'image', img.naturalHeight / img.naturalWidth);
      img.className = 'base'; img.alt = ''; img.draggable = false;
      s.wrap.prepend(img); s.img = img;
      stage.append(s.wrap);
      return;
    }
    // Reflowable: render once at a fixed width, slice into A4-height writing tiles.
    const html = await toHtml(doc);
    const box = el('div', 'flowdoc');
    const content = el('div', 'flow');
    content.innerHTML = html;
    box.append(content);
    stage.append(box);
    await Promise.race([
      Promise.all(Array.from(content.querySelectorAll('img')).map((im) => im.complete ? 0 : new Promise((r) => { im.onload = im.onerror = r; }))),
      new Promise((r) => setTimeout(r, 8000)),
    ]);
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const tiles = Math.max(1, Math.ceil(content.offsetHeight / TILE));
    content.style.height = tiles * TILE + 'px';
    state.flow = { box, content, tiles };
    for (let i = 0; i < tiles; i++) {
      const s = makeSheet('s' + i, 'tile', TILE / BASE);
      s.tile = i;
      box.append(s.wrap);
      observer.observe(s.wrap);
    }
  }

  function showDocError(doc, e) {
    stage.innerHTML = '';
    const box = el('div', 'doc-error');
    box.innerHTML = `<h2>TaniNote couldn't open this file</h2><p>${esc(e && e.message ? e.message : 'Something went wrong while reading it.')}</p>`;
    const back = el('button', 'btn navy', { innerHTML: '<i class="ph ph-caret-left"></i><span>Back to my files</span>' });
    back.addEventListener('click', () => history.back());
    box.append(back);
    stage.append(box);
    stage.style.width = '100%';
  }

  async function closeDoc() {
    if (!state.doc) return;
    blurText();
    await save();
    const doc = state.doc;
    doc.stats = inkStats(state.ink, state.sheets.length);
    if (state.dirty) {
      doc.updated = Date.now();
      try { const t = await composeThumb(state.sheets[0]); if (t) doc.thumb = t; } catch { /* keep old thumb */ }
    }
    await db.put('docs', doc).catch(() => {});
    observer.disconnect();
    if (state.pdf) { state.pdf.destroy(); state.pdf = null; }
    if (state.flowClip) { state.flowClip.remove(); state.flowClip = null; }
    state.doc = null; state.ink = null; state.sheets = []; state.flow = null;
    stage.innerHTML = '';
    stage.style.width = '';
    $('#viewer').hidden = true;
    $('#app').hidden = false;
    refresh();
  }

  // ---------------------------------------------------------------------------
  // Zoom & layout
  // ---------------------------------------------------------------------------
  function fitZoom() { return clamp((scroller.clientWidth - 32) / BASE, 0.25, 1.25); }

  function layout() {
    const z = state.zoom, W = BASE * z;
    stage.style.setProperty('--u', PAPER_U * z + 'px');
    for (const s of state.sheets) {
      if (s.kind === 'tile') {
        s.wrap.style.top = s.tile * TILE * z + 'px';
        s.wrap.style.width = W + 'px';
        s.wrap.style.height = TILE * z + 'px';
      } else {
        s.wrap.style.width = W + 'px';
        s.wrap.style.height = W * s.aspect + 'px';
      }
    }
    if (state.flow) {
      state.flow.box.style.width = W + 'px';
      state.flow.box.style.height = state.flow.tiles * TILE * z + 'px';
      state.flow.content.style.transform = `scale(${z})`;
    }
    $('#zoomVal').textContent = Math.round(z * 100) + '%';
  }

  function setZoom(z, ax, ay) {
    z = clamp(z, 0.25, 4);
    if (Math.abs(z - state.zoom) < 0.001) return;
    const sr = scroller.getBoundingClientRect();
    const px = ax == null ? sr.width / 2 : ax - sr.left;
    const py = ay == null ? sr.height / 2 : ay - sr.top;
    const padTop = (parseFloat(getComputedStyle(stage).paddingTop) || 0);
    const cx = scroller.scrollLeft + px, cy = scroller.scrollTop + py - padTop;
    const ratio = z / state.zoom;
    state.zoom = z;
    layout();
    for (const s of state.sheets) if (s.visible) renderSheet(s, true);
    scroller.scrollLeft = cx * ratio - px;
    scroller.scrollTop = cy * ratio - py + padTop;
    markViewDirty();
  }
  let viewTimer;
  function markViewDirty() { clearTimeout(viewTimer); viewTimer = setTimeout(() => state.ink && db.put('ink', Object.assign(state.ink, { view: { zoom: state.zoom, scroll: scroller.scrollTop / Math.max(1, scroller.scrollHeight) } })).catch(() => {}), 800); }

  // Trackpad pinch / ctrl+wheel
  let wheelZoom = null;
  scroller.addEventListener('wheel', (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const f = Math.exp(-e.deltaY * 0.01);
    if (!wheelZoom) {
      wheelZoom = { z: state.zoom, x: e.clientX, y: e.clientY };
      requestAnimationFrame(() => { const w = wheelZoom; wheelZoom = null; setZoom(w.z, w.x, w.y); });
    }
    wheelZoom.z = clamp(wheelZoom.z * f, 0.25, 4);
    wheelZoom.x = e.clientX; wheelZoom.y = e.clientY;
  }, { passive: false });

  // Two-finger pinch (when fingers aren't drawing)
  let pinch = null;
  const fingersNavigate = () => !isDrawTool() || state.penOnly;
  scroller.addEventListener('touchstart', (e) => {
    if (isDrawTool()) for (const t of e.touches) if (t.touchType === 'stylus') { e.preventDefault(); return; }
    if (e.touches.length === 2 && fingersNavigate()) {
      const [a, b] = e.touches;
      pinch = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2, scale: 1 };
      const sr = stage.getBoundingClientRect();
      stage.style.transformOrigin = `${pinch.x - sr.left}px ${pinch.y - sr.top}px`;
    }
  }, { passive: false });
  scroller.addEventListener('touchmove', (e) => {
    if (isDrawTool()) for (const t of e.touches) if (t.touchType === 'stylus') { e.preventDefault(); return; }
    if (pinch && e.touches.length === 2) {
      e.preventDefault();
      const [a, b] = e.touches;
      pinch.scale = clamp(Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) / pinch.d, 0.25 / state.zoom, 4 / state.zoom);
      stage.style.transform = `scale(${pinch.scale})`;
    }
  }, { passive: false });
  const endPinch = (e) => {
    if (!pinch || e.touches.length >= 2) return;
    const p = pinch; pinch = null;
    stage.style.transform = '';
    setZoom(state.zoom * p.scale, p.x, p.y);
  };
  scroller.addEventListener('touchend', endPinch);
  scroller.addEventListener('touchcancel', endPinch);

  // Page indicator
  let indRaf = 0;
  scroller.addEventListener('scroll', () => { if (!indRaf) indRaf = requestAnimationFrame(() => { indRaf = 0; updatePageInd(); markViewDirty(); }); }, { passive: true });
  function updatePageInd() {
    const n = state.sheets.length;
    if (!n) { $('#pageInd').textContent = ''; return; }
    const sr = scroller.getBoundingClientRect();
    const bar = parseFloat(stage.style.getPropertyValue('--bar-h')) || 0;
    const line = sr.top + bar + (sr.height - bar) * 0.4;
    let idx = 0;
    for (let i = 0; i < n; i++) { if (state.sheets[i].wrap.getBoundingClientRect().top <= line) idx = i; else break; }
    $('#pageInd').textContent = `${idx + 1} / ${n}`;
  }

  function measureBar() {
    const h = document.querySelector('.vbar').offsetHeight;
    stage.style.setProperty('--bar-h', h + 'px');
    const tb = $('#toolbar');
    tb.classList.remove('scrolls');
    tb.classList.toggle('scrolls', tb.scrollWidth > tb.clientWidth + 1);
  }
  addEventListener('resize', () => { if (state.doc) { measureBar(); updatePageInd(); } });

  // ---------------------------------------------------------------------------
  // Pages
  // ---------------------------------------------------------------------------
  function addPage() {
    if (!state.ink) return;
    const paper = $('#paperSel').value;
    state.ink.extra.push({ paper });
    const s = addBlankSheet(state.ink.extra.length - 1, paper);
    layout();
    markDirty();
    state.dirty = true;
    requestAnimationFrame(() => s.wrap.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }));
    updatePageInd();
  }

  // ---------------------------------------------------------------------------
  // Export to PDF
  // ---------------------------------------------------------------------------
  function inkCanvas(s, Wpx, Hpx) {
    const c = el('canvas'); c.width = Wpx; c.height = Hpx;
    const ctx = c.getContext('2d');
    const pg = pageData(s.key);
    if (pg) for (const st of pg.strokes) drawStroke(ctx, st, Wpx);
    drawTexts(ctx, s, Wpx);
    return c;
  }

  function paperCanvas(paper, Wpx, Hpx) {
    const c = el('canvas'); c.width = Wpx; c.height = Hpx;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, Wpx, Hpx);
    const u = PAPER_U / BASE * Wpx;
    if (paper === 'lined') {
      ctx.fillStyle = '#cfdbe8';
      for (let y = u * 3 - 1; y < Hpx; y += u) ctx.fillRect(0, Math.round(y), Wpx, Math.max(1, Wpx / BASE));
    } else if (paper === 'grid') {
      ctx.fillStyle = '#e1e7ec';
      for (let y = 0; y < Hpx; y += u) ctx.fillRect(0, Math.round(y), Wpx, Math.max(1, Wpx / BASE));
      for (let x = 0; x < Wpx; x += u) ctx.fillRect(Math.round(x), 0, Math.max(1, Wpx / BASE), Hpx);
    } else if (paper === 'dots') {
      ctx.fillStyle = '#b8c1c9';
      const r = 1.2 * Wpx / BASE;
      for (let y = u / 2; y < Hpx; y += u) for (let x = u / 2; x < Wpx; x += u) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
    }
    return c;
  }

  function flowClip() {
    if (state.flowClip) return state.flowClip;
    const clip = el('div');
    clip.style.cssText = `position:absolute;left:-${BASE * 3}px;top:0;width:${BASE}px;height:${TILE}px;overflow:hidden;background:#fff;`;
    const inner = state.flow.content.cloneNode(true);
    inner.style.transform = 'none';
    inner.style.position = 'static';
    clip.append(inner);
    document.body.append(clip);
    clip._inner = inner;
    return (state.flowClip = clip);
  }

  async function backgroundCanvas(s, Wpx, Hpx) {
    if (s.kind === 'blank') return paperCanvas(s.paper, Wpx, Hpx);
    const c = el('canvas'); c.width = Wpx; c.height = Hpx;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, Wpx, Hpx);
    if (s.kind === 'pdf') {
      const page = await state.pdf.getPage(s.n);
      const vp1 = page.getViewport({ scale: 1 });
      await page.render({ canvasContext: ctx, viewport: page.getViewport({ scale: Wpx / vp1.width }) }).promise;
    } else if (s.kind === 'image') {
      ctx.drawImage(s.img, 0, 0, Wpx, Hpx);
    } else if (s.kind === 'tile') {
      const clip = flowClip();
      clip._inner.style.marginTop = -s.tile * TILE + 'px';
      const shot = await html2canvas(clip, { scale: Wpx / BASE, backgroundColor: '#ffffff', logging: false, width: BASE, height: TILE, windowWidth: BASE * 4 });
      ctx.drawImage(shot, 0, 0, Wpx, Hpx);
    }
    return c;
  }

  async function composeThumb(s) {
    if (!s || s.kind === 'tile') return null;
    const W = 360, H = Math.round(W * s.aspect);
    const bg = await backgroundCanvas(s, W, H);
    const ctx = bg.getContext('2d');
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(inkCanvas(s, W, H), 0, 0);
    return bg.toDataURL('image/jpeg', 0.8);
  }

  let exporting = false;
  async function exportPdf() {
    if (exporting || !state.doc || !state.sheets.length) return;
    if (!window.PDFLib) { toast('The PDF tools could not load. Check your internet connection.', 5000); return; }
    exporting = true;
    const btn = $('#exportBtn'); btn.disabled = true;
    blurText();
    try {
      const { PDFDocument, BlendMode } = PDFLib;
      const out = await PDFDocument.create();
      out.setTitle(state.doc.name);
      let src = null;
      if (state.doc.kind === 'pdf') { try { src = await PDFDocument.load(await state.doc.blob.arrayBuffer()); } catch { src = null; } }
      const n = state.sheets.length;
      for (let i = 0; i < n; i++) {
        const s = state.sheets[i];
        toast(`Preparing PDF, page ${i + 1} of ${n}`, 0);
        const pg = pageData(s.key);
        const hasInk = !!pg && (pg.strokes.length > 0 || pg.texts.some((t) => t.text.trim()));
        if (s.kind === 'pdf' && src) {
          const srcPage = src.getPage(s.n - 1);
          if ((srcPage.getRotation().angle % 360) === 0) {
            const [p] = await out.copyPages(src, [s.n - 1]);
            out.addPage(p);
            if (hasInk) {
              const box = p.getCropBox ? p.getCropBox() : p.getMediaBox();
              const Wpx = Math.min(2400, Math.round(box.width * 2.5));
              const png = await out.embedPng(await canvasBytes(inkCanvas(s, Wpx, Math.round(Wpx * box.height / box.width)), 'image/png'));
              const opts = { x: box.x, y: box.y, width: box.width, height: box.height };
              if (BlendMode) opts.blendMode = BlendMode.Multiply;
              p.drawImage(png, opts);
            }
            continue;
          }
        }
        const Wpt = s.kind === 'pdf' ? s.ptW : PT_W;
        const Hpt = s.kind === 'pdf' ? s.ptH : PT_W * s.aspect;
        const Wpx = Math.min(1800, Math.round(Wpt * 2.2));
        const Hpx = Math.round(Wpx * Hpt / Wpt);
        const bg = await backgroundCanvas(s, Wpx, Hpx);
        if (hasInk) {
          const ctx = bg.getContext('2d');
          ctx.globalCompositeOperation = 'multiply';
          ctx.drawImage(inkCanvas(s, Wpx, Hpx), 0, 0);
        }
        const jpg = await out.embedJpg(await canvasBytes(bg, 'image/jpeg', 0.9));
        out.addPage([Wpt, Hpt]).drawImage(jpg, { x: 0, y: 0, width: Wpt, height: Hpt });
      }
      const bytes = await out.save();
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const a = el('a', '', { href: URL.createObjectURL(blob), download: state.doc.name.replace(/[\\/:*?"<>|]+/g, ' ').trim() + ' (notes).pdf' });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 30000);
      toast('PDF ready. Check your downloads.');
    } catch (e) {
      console.error(e);
      toast('Export failed: ' + (e.message || 'something went wrong') + '.', 6000);
    } finally {
      exporting = false; btn.disabled = false;
      if (state.flowClip) { state.flowClip.remove(); state.flowClip = null; }
    }
  }

  // ---------------------------------------------------------------------------
  // Toolbar
  // ---------------------------------------------------------------------------
  function setTool(tool) {
    if (tool !== 'text') blurText();
    state.tool = tool;
    document.body.classList.toggle('drawing', isDrawTool());
    document.body.classList.toggle('tool-text', tool === 'text');
    document.querySelectorAll('.tool').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.tool === tool)));
    renderInks();
    renderSize();
    moveNib();
  }

  function moveNib() {
    const group = $('#toolGroup');
    const btn = group.querySelector(`.tool[data-tool="${state.tool}"]`);
    const nib = $('#nib');
    if (!btn) return;
    nib.style.setProperty('--nib-x', btn.offsetLeft + (btn.offsetWidth - 30) / 2 + 'px');
    const set = state.settings[state.tool];
    const colored = !!set.c;
    nib.classList.toggle('mute', !colored);
    nib.classList.toggle('hl', state.tool === 'hl');
    group.style.setProperty('--ink', colored ? set.c : '');
    $('#sizeGroup').style.setProperty('--ink', colored ? set.c : '');
  }

  function renderInks() {
    const box = $('#inks');
    box.innerHTML = '';
    const set = state.settings[state.tool];
    const palette = state.tool === 'hl' ? HLS : PENS;
    const disabled = !set.c;
    box.classList.toggle('disabled', disabled);
    for (const [name, c] of palette) {
      const b = el('button', 'swatch' + (state.tool === 'hl' ? ' hl' : ''));
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-label', name);
      b.title = name;
      b.style.setProperty('--c', c);
      b.setAttribute('aria-checked', String(!disabled && set.c.toLowerCase() === c));
      b.append(el('span'));
      b.addEventListener('click', () => setColor(c));
      box.append(b);
    }
    const custom = el('label', 'swatch custom' + (state.tool === 'hl' ? ' hl' : ''));
    custom.title = 'Custom colour';
    const inp = el('input', '', { type: 'color', value: set.c || '#22262a' });
    inp.setAttribute('aria-label', 'Custom colour');
    inp.addEventListener('input', () => setColor(inp.value, true));
    custom.append(el('span'), inp);
    const isCustom = !disabled && !palette.some(([, c]) => c === set.c.toLowerCase());
    if (isCustom) { custom.style.setProperty('--c', set.c); custom.querySelector('span').style.background = set.c; custom.setAttribute('aria-checked', 'true'); }
    box.append(custom);
  }
  function setColor(c, live) {
    const set = state.settings[state.tool];
    if (!set.c) return;
    set.c = c.toLowerCase();
    store.set('settings', state.settings);
    if (live) {
      const sw = document.querySelector('.swatch.custom span');
      if (sw) sw.style.background = c;
    } else renderInks();
    moveNib();
  }

  function renderSize() {
    const set = state.settings[state.tool];
    const r = $('#sizeRange');
    const g = $('#sizeGroup');
    if (!set.w) { g.style.opacity = '0.4'; r.disabled = true; $('#sizeDot').style.setProperty('--d', '6px'); return; }
    g.style.opacity = ''; r.disabled = false;
    r.min = set.min; r.max = set.max; r.step = set.step; r.value = set.w;
    r.setAttribute('aria-label', TOOLS[state.tool].label + ' size');
    const d = clamp(state.tool === 'text' ? set.w * 0.6 : state.tool === 'eraser' ? set.w * 0.4 : state.tool === 'hl' ? set.w * 0.55 : set.w * 1.4 + 1, 3, 22);
    $('#sizeDot').style.setProperty('--d', d + 'px');
  }

  function setPenOnly(on) {
    state.penOnly = on;
    store.set('penOnly', on);
    document.body.classList.toggle('pen-only', on);
    $('#penOnly').setAttribute('aria-checked', String(on));
  }

  // ---------------------------------------------------------------------------
  // Wiring
  // ---------------------------------------------------------------------------
  document.querySelectorAll('.tool').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));
  $('#sizeRange').addEventListener('input', (e) => {
    const set = state.settings[state.tool];
    set.w = +e.target.value;
    store.set('settings', state.settings);
    renderSize();
  });
  $('#undoBtn').addEventListener('click', doUndo);
  $('#redoBtn').addEventListener('click', doRedo);
  $('#zoomIn').addEventListener('click', () => setZoom(state.zoom * 1.2));
  $('#zoomOut').addEventListener('click', () => setZoom(state.zoom / 1.2));
  $('#zoomVal').addEventListener('click', () => setZoom(fitZoom()));
  $('#addPage').addEventListener('click', addPage);
  $('#paperSel').value = store.get('paper', 'blank');
  $('#paperSel').addEventListener('change', (e) => store.set('paper', e.target.value));
  $('#penOnly').addEventListener('click', () => setPenOnly(!state.penOnly));
  $('#exportBtn').addEventListener('click', exportPdf);
  $('#backBtn').addEventListener('click', () => history.back());
  $('#docTitle').addEventListener('click', async () => {
    const name = await askText('Rename file', 'Name', state.doc.name);
    if (name) { state.doc.name = name; $('#docTitle').textContent = name; await db.put('docs', state.doc); }
  });

  addEventListener('popstate', () => { if (state.doc && (!history.state || !history.state.doc)) closeDoc(); });
  addEventListener('pagehide', () => { if (state.doc) save(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && state.doc) save(); });

  for (const id of ['#fileInput', '#heroInput', '#filesInput', '#emptyInput']) {
    $(id).addEventListener('change', (e) => { importFiles(e.target.files); e.target.value = ''; });
  }
  $('#newNotebook').addEventListener('click', newNotebook);
  $('#search').addEventListener('input', () => { if (ui.view !== 'files' && ui.view !== 'notebooks') showView('files'); else renderFiles(); });
  document.querySelectorAll('.nav-item, .tab').forEach((b) => b.addEventListener('click', () => showView(b.dataset.view)));
  $('#recentSort').addEventListener('change', renderDashboard);
  $('#filesSort').addEventListener('change', renderFiles);
  $('#addSessionBtn').addEventListener('click', () => sessionDialog());
  $('#planAdd').addEventListener('click', () => sessionDialog());
  $('#todayMonth').addEventListener('click', () => { ui.month = new Date(parseDay(ui.day).getFullYear(), parseDay(ui.day).getMonth(), 1); showView('plan'); });
  $('#monthPrev').addEventListener('click', () => { ui.month = new Date(ui.month.getFullYear(), ui.month.getMonth() - 1, 1); renderPlan(); });
  $('#monthNext').addEventListener('click', () => { ui.month = new Date(ui.month.getFullYear(), ui.month.getMonth() + 1, 1); renderPlan(); });
  $('#profileBtn').addEventListener('click', () => { showView('settings'); setTimeout(() => $('#setName').focus(), 50); });
  $('#themeBtn').addEventListener('click', () => {
    const t = store.get('theme', 'auto');
    const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    store.set('theme', dark ? 'light' : 'dark');
    applyTheme();
    if (ui.view === 'settings') renderSettings();
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  $('#setName').addEventListener('input', (e) => { store.set('name', e.target.value.trim().slice(0, 40)); renderProfile(); });
  document.querySelectorAll('#setTheme button').forEach((b) => b.addEventListener('click', () => { store.set('theme', b.dataset.v); applyTheme(); renderSettings(); }));
  $('#setPenOnly').addEventListener('click', () => { setPenOnly(!state.penOnly); renderSettings(); });
  $('#setPaper').addEventListener('change', (e) => { store.set('paper', e.target.value); $('#paperSel').value = e.target.value; });
  $('#soundBtn').addEventListener('click', (e) => { e.stopPropagation(); openSoundPanel(e.currentTarget); });
  $('#vSoundBtn').addEventListener('click', (e) => { e.stopPropagation(); openSoundPanel(e.currentTarget); });
  $('#soundClose').addEventListener('click', closeSoundPanel);
  $('#soundVol').addEventListener('input', (e) => setVolume(+e.target.value));
  document.querySelectorAll('#soundTimer button').forEach((b) => b.addEventListener('click', () => { store.set('sndTimer', +b.dataset.m); armTimer(); renderSoundUi(); }));
  $('#soundInput').addEventListener('change', (e) => { importSounds(e.target.files); e.target.value = ''; });
  document.addEventListener('pointerdown', (e) => {
    const p = $('#soundPanel');
    if (!p.hidden && !p.contains(e.target) && !e.target.closest('.sound-btn') && !e.target.closest('dialog')) closeSoundPanel();
  });
  $('#soundPanel').addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeSoundPanel(); } });

  $('#setRemind').addEventListener('click', () => setRemind(!REM.on));
  $('#setSound').addEventListener('click', () => { store.set('remindSound', !REM.sound); if (REM.sound) chime(); renderSettings(); });
  $('#setLead').addEventListener('change', (e) => { store.set('remindLead', +e.target.value); });
  $('#testRemind').addEventListener('click', () => {
    unlockAudio();
    const next = plan.filter((p) => !p.done && sessionStart(p) > Date.now()).sort((a, b) => sessionStart(a) - sessionStart(b))[0];
    const demo = { test: true, title: next ? next.title : 'Study session', time: next ? next.time : '', docId: next ? next.docId : null };
    const doc = demo.docId && libDocs.find((d) => d.id === demo.docId);
    if (REM.sound) chime();
    showReminderCard(demo, 'Time to study: ' + demo.title, 'This is how reminders look and sound.' + (next ? ` Your next session is at ${next.time}.` : ''), doc);
    if (window.Notification && Notification.permission === 'granted' && navigator.serviceWorker) {
      navigator.serviceWorker.getRegistration().then((reg) => reg && reg.showNotification('Time to study: ' + demo.title, { body: 'This is how reminders look.', icon: 'icons/icon-192.png', tag: 'test', silent: true })).catch(() => {});
    }
  });
  $('#bellBtn').addEventListener('click', () => {
    if (!REM.on) { showView('settings'); setTimeout(() => $('#remindCard').scrollIntoView({ behavior: 'smooth', block: 'start' }), 60); return; }
    ui.day = todayKey(); ui.month = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    showView('plan');
  });
  $('#remOpen').addEventListener('click', () => { const p = shownReminder; hideReminder(); if (p && p.docId) openDoc(p.docId); });
  $('#remSnooze').addEventListener('click', () => { const p = shownReminder; hideReminder(); if (p) snooze(p, 10); });
  $('#remDone').addEventListener('click', async () => { const p = shownReminder; hideReminder(); if (p) { p.done = true; await db.put('plan', p); noteStudyDay(); renderSessionsEverywhere(); updateBell(); toast('Nice work. Session done.'); } });
  $('#remClose').addEventListener('click', hideReminder);
  $('#reminder').addEventListener('keydown', (e) => { if (e.key === 'Escape') hideReminder(); });
  setInterval(checkReminders, 15000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkReminders(); });
  // Tapping a system notification brings TaniNote forward and opens that session's file.
  const openSessionFile = (id) => {
    const p = plan.find((x) => x.id === id);
    if (p && p.docId && libDocs.some((d) => d.id === p.docId)) { hideReminder(); if (!state.doc || state.doc.id !== p.docId) openDoc(p.docId); }
  };
  if (navigator.serviceWorker) navigator.serviceWorker.addEventListener('message', (e) => { if (e.data && e.data.type === 'reminder-click' && ID_RE.test(e.data.session || '')) openSessionFile(e.data.session); });

  $('#backupBtn').addEventListener('click', backup);
  $('#restoreInput').addEventListener('change', (e) => { restore(e.target.files[0]); e.target.value = ''; });
  $('#wipeBtn').addEventListener('click', wipe);

  // Drag & drop anywhere on the app
  let dragDepth = 0;
  addEventListener('dragenter', (e) => { if (state.doc || !e.dataTransfer || !Array.from(e.dataTransfer.types).includes('Files')) return; dragDepth++; $('#dropOverlay').hidden = false; });
  addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('#dropOverlay').hidden = true; } });
  addEventListener('dragover', (e) => { if (!state.doc) e.preventDefault(); });
  addEventListener('drop', (e) => {
    e.preventDefault(); dragDepth = 0; $('#dropOverlay').hidden = true;
    if (!state.doc && e.dataTransfer) importFiles(e.dataTransfer.files);
  });

  addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenu();
    if (!state.doc) {
      const typingHere = e.target.closest && e.target.closest('input, select, textarea, dialog');
      if (e.key === '/' && !typingHere) { e.preventDefault(); $('#search').focus(); }
      return;
    }
    const typing = e.target.closest && e.target.closest('input, select, textarea, [contenteditable="true"]');
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); return; }
    if (mod && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); doRedo(); return; }
    if (mod && (e.key === '=' || e.key === '+')) { e.preventDefault(); setZoom(state.zoom * 1.2); return; }
    if (mod && e.key === '-') { e.preventDefault(); setZoom(state.zoom / 1.2); return; }
    if (mod && e.key === '0') { e.preventDefault(); setZoom(fitZoom()); return; }
    if (typing || mod || e.altKey) return;
    const map = { v: 'scroll', p: 'pen', h: 'hl', e: 'eraser', t: 'text' };
    if (map[e.key.toLowerCase()]) setTool(map[e.key.toLowerCase()]);
  });

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------
  applyTheme();
  setPenOnly(state.penOnly);
  setTool('pen');
  const launchSession = new URLSearchParams(location.search).get('session');
  history.replaceState(null, '', location.pathname);
  refresh().then(() => { if (launchSession && ID_RE.test(launchSession)) openSessionFile(launchSession); });
  if (!window.pdfjsLib || !window.PDFLib) toast('Some file readers didn\'t load. Reload TaniNote to try again.', 6000);
  // Offline support: cache the app so it opens without a connection.
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { /* offline mode unavailable */ }));
  }
})();
