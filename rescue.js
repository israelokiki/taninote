// TaniNote rescue page: finds notes saved in this browser at this address and packs them into a
// normal TaniNote backup file. Read-only: it never creates, changes or deletes stored data.
(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const ADDRESSES = [
    ['taninote.netlify.app', 'https://taninote.netlify.app/rescue.html'],
    ['israelokiki.github.io', 'https://israelokiki.github.io/taninote/rescue.html'],
    ['taninote.vercel.app', 'https://taninote.vercel.app/rescue.html'],
  ];
  const browser = /SamsungBrowser/i.test(navigator.userAgent) ? 'Samsung Internet'
    : /EdgA?\//i.test(navigator.userAgent) ? 'Edge'
    : /Firefox|FxiOS/i.test(navigator.userAgent) ? 'Firefox'
    : /CriOS|Chrome/i.test(navigator.userAgent) ? 'Chrome'
    : /Safari/i.test(navigator.userAgent) ? 'Safari' : 'this browser';

  // Open the existing database without ever creating or upgrading it.
  async function openExisting() {
    if (indexedDB.databases) {
      try { const list = await indexedDB.databases(); if (!list.some((d) => d.name === 'nota')) return null; } catch { /* fall through */ }
    }
    return new Promise((res) => {
      let req;
      try { req = indexedDB.open('nota'); } catch { return res(null); }
      req.onupgradeneeded = () => { try { req.transaction.abort(); } catch { /* ignore */ } }; // it didn't exist: don't create it
      req.onsuccess = () => res(req.result);
      req.onerror = () => res(null);
      req.onblocked = () => res(null);
    });
  }
  // Reads one record at a time (a cursor), so very large files can't make the whole read fail.
  const problems = [];
  function readAll(db, name) {
    if (!db.objectStoreNames.contains(name)) return Promise.resolve([]);
    return new Promise((res) => {
      const out = [];
      let req;
      try { req = db.transaction(name, 'readonly').objectStore(name).openCursor(); }
      catch (e) { problems.push(`${name}: ${e && e.name}`); return res(out); }
      req.onsuccess = () => { const c = req.result; if (!c) return res(out); out.push(c.value); c.continue(); };
      req.onerror = (ev) => { problems.push(`${name}: ${req.error && req.error.name}`); ev.preventDefault(); res(out); };
    });
  }
  function countAll(db, name) {
    if (!db.objectStoreNames.contains(name)) return Promise.resolve(-1);
    return new Promise((res) => {
      try { const r = db.transaction(name, 'readonly').objectStore(name).count(); r.onsuccess = () => res(r.result); r.onerror = (ev) => { ev.preventDefault(); res(-2); }; }
      catch { res(-2); }
    });
  }

  let data = null;
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  // Big collections are split into several backup files; each one restores on its own.
  const PART_BYTES = 150 * 1024 * 1024;
  function parts() {
    const groups = [[]]; let size = 0;
    for (const d of data.docs) {
      const b = d.blob ? d.blob.size : 0;
      if (groups[groups.length - 1].length && size + b > PART_BYTES) { groups.push([]); size = 0; }
      groups[groups.length - 1].push(d); size += b;
    }
    return groups;
  }
  async function buildZip(group, first) {
    const zip = new JSZip();
    const ids = new Set(group.map((d) => d.id));
    const meta = group.map((d) => { const { blob, ...rest } = d; if (blob) zip.file('files/' + d.id, blob, { compression: 'STORE' }); return rest; });
    const ink = data.ink.filter((x) => x && (ids.has(x.id) || (first && !data.docs.some((d) => d.id === x.id))));
    const soundMeta = first ? data.sounds.map(({ blob, ...rest }) => { if (blob) zip.file('sounds/' + rest.id, blob, { compression: 'STORE' }); return rest; }) : [];
    let settings = {};
    try { settings = { name: JSON.parse(localStorage.getItem('nota.name') || '""'), days: JSON.parse(localStorage.getItem('nota.days') || '[]') }; } catch { /* optional */ }
    zip.file('taninote.json', JSON.stringify({ app: 'TaniNote', version: 1, exported: new Date().toISOString(), docs: meta, ink, plan: first ? data.plan : [], sounds: soundMeta, settings }));
    return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  }
  let zipBlob = null;
  const fileName = (i, n) => `TaniNote backup ${today()}${n > 1 ? ` part ${i + 1} of ${n}` : ''}.zip`;

  async function save() {
    const btn = $('#saveBtn');
    btn.disabled = true;
    const groups = parts();
    let total = 0;
    try {
      for (let i = 0; i < groups.length; i++) {
        btn.textContent = groups.length > 1 ? `Packing part ${i + 1} of ${groups.length}…` : 'Packing your notes…';
        const blob = await buildZip(groups[i], i === 0);
        if (groups.length === 1) zipBlob = blob;
        total += blob.size;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = fileName(i, groups.length); a.rel = 'noopener';
        document.body.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 120000);
        await new Promise((r) => setTimeout(r, 1200));
      }
      $('#saveMsg').textContent = groups.length > 1
        ? `Saved ${groups.length} backup files (${(total / 1048576).toFixed(1)} MB) to your Downloads. Restore each one in the new TaniNote.`
        : `Saved “${fileName(0, 1)}” (${(total / 1048576).toFixed(1)} MB) to your Downloads. Keep a second copy somewhere safe too.`;
      $('#next').hidden = false;
      btn.textContent = 'Save again';
    } catch (e) {
      $('#saveMsg').textContent = 'Saving didn\'t work: ' + (e && e.message ? e.message : 'unknown problem') + '. Try again.';
      btn.textContent = 'Try again';
    }
    btn.disabled = false;
  }

  async function share() {
    try {
      if (parts().length > 1) { $('#saveMsg').textContent = 'There is too much to send in one go. Use “Save all my notes” instead.'; return; }
      const file = new File([zipBlob || (zipBlob = await buildZip(parts()[0], true))], fileName(0, 1), { type: 'application/zip' });
      await navigator.share({ files: [file], title: 'My TaniNote backup' });
      $('#next').hidden = false;
    } catch (e) { if (e && e.name !== 'AbortError') $('#saveMsg').textContent = 'Sending didn\'t work here. Use “Save all my notes” instead.'; }
  }

  async function run() {
    const db = window.indexedDB ? await openExisting() : null;
    let counts = null;
    if (db) {
      counts = await Promise.all(['docs', 'ink', 'plan', 'sounds'].map((n) => countAll(db, n)));
      const [docs, ink, plan, sounds] = await Promise.all(['docs', 'ink', 'plan', 'sounds'].map((n) => readAll(db, n)));
      data = { docs, ink, plan, sounds };
    }
    let used = null;
    try { if (navigator.storage && navigator.storage.estimate) used = (await navigator.storage.estimate()).usage; } catch { /* unknown */ }
    const mb = (b) => b == null ? '?' : (b / 1048576).toFixed(1) + ' MB';
    $('#report').textContent = `Report: ${browser} at ${location.host} · TaniNote storage ${db ? 'found (v' + db.version + ')' : 'not found'}` +
      (counts ? ` · documents ${counts[0]} · pages with notes ${counts[1]} · study sessions ${counts[2]} · sounds ${counts[3]}` : '') +
      ` · space used here ${mb(used)}` + (problems.length ? ` · read problems: ${problems.join(', ')}` : '');
    $('#report').hidden = false;
    const docs = data ? data.docs : [];
    const marked = data ? data.ink.filter((x) => x && x.pages && Object.values(x.pages).some((p) => p && ((p.strokes || []).length || (p.texts || []).length)) || (x && x.html)).length : 0;
    $('#status').hidden = true;
    if (!docs.length && !(data && (data.plan.length || data.ink.length))) {
      $('#none').hidden = false;
      $('#noneWhere').textContent = `Checked ${browser} at ${location.host}.`;
      const box = $('#otherLinks');
      for (const [host, url] of ADDRESSES) {
        if (host === location.host) continue;
        const a = document.createElement('a'); a.className = 'btn second'; a.href = url; a.textContent = 'Check ' + host;
        box.append(a);
      }
      return;
    }
    $('#found').hidden = false;
    if (!docs.length) $('#foundTitle').classList.replace('ok', 'warn');
    $('#foundTitle').textContent = `Found ${docs.length} document${docs.length === 1 ? '' : 's'}` + (marked ? `, ${marked} with your notes or highlights` : '') + (data.plan.length ? `, and ${data.plan.length} study session${data.plan.length === 1 ? '' : 's'}` : '');
    const list = $('#foundList');
    docs.slice().sort((a, b) => (b.updated || 0) - (a.updated || 0)).slice(0, 30).forEach((d) => { const li = document.createElement('li'); li.textContent = d.name || 'Untitled'; list.append(li); });
    if (docs.length > 30) { const li = document.createElement('li'); li.textContent = `and ${docs.length - 30} more`; list.append(li); }
    $('#saveBtn').addEventListener('click', save);
    try {
      if (navigator.canShare && navigator.canShare({ files: [new File(['x'], 'x.zip', { type: 'application/zip' })] })) {
        $('#shareBtn').hidden = false;
        $('#shareBtn').addEventListener('click', share);
      }
    } catch { /* sharing files unsupported */ }
  }
  run().catch(() => { $('#status').innerHTML = '<p class="big warn">This browser blocked the check.</p><p class="muted">Try opening this page in Chrome, outside private or incognito mode.</p>'; });
})();
