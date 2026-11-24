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
  function readAll(db, name) {
    if (!db.objectStoreNames.contains(name)) return Promise.resolve([]);
    return new Promise((res) => {
      const r = db.transaction(name, 'readonly').objectStore(name).getAll();
      r.onsuccess = () => res(r.result || []);
      r.onerror = () => res([]);
    });
  }

  let data = null, zipBlob = null;
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const fileName = () => `TaniNote backup ${today()}.zip`;

  async function buildZip() {
    if (zipBlob) return zipBlob;
    const zip = new JSZip();
    const meta = data.docs.map((d) => { const { blob, ...rest } = d; if (blob) zip.file('files/' + d.id, blob); return rest; });
    const soundMeta = data.sounds.map(({ blob, ...rest }) => { if (blob) zip.file('sounds/' + rest.id, blob); return rest; });
    let settings = {};
    try { settings = { name: JSON.parse(localStorage.getItem('nota.name') || '""'), days: JSON.parse(localStorage.getItem('nota.days') || '[]') }; } catch { /* optional */ }
    zip.file('taninote.json', JSON.stringify({ app: 'TaniNote', version: 1, exported: new Date().toISOString(), docs: meta, ink: data.ink, plan: data.plan, sounds: soundMeta, settings }));
    zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    return zipBlob;
  }

  async function save() {
    const btn = $('#saveBtn');
    btn.disabled = true; btn.textContent = 'Packing your notes…';
    try {
      const blob = await buildZip();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = fileName(); a.rel = 'noopener';
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      $('#saveMsg').textContent = `Saved “${fileName()}” (${(blob.size / 1048576).toFixed(1)} MB) to your Downloads. Keep a second copy somewhere safe too.`;
      $('#next').hidden = false;
      btn.textContent = 'Save again';
    } catch (e) {
      $('#saveMsg').textContent = 'Saving didn\'t work: ' + (e && e.message ? e.message : 'unknown problem') + '. Try again, or use the Send button.';
      btn.textContent = 'Try again';
    }
    btn.disabled = false;
  }

  async function share() {
    try {
      const file = new File([await buildZip()], fileName(), { type: 'application/zip' });
      await navigator.share({ files: [file], title: 'My TaniNote backup' });
      $('#next').hidden = false;
    } catch (e) { if (e && e.name !== 'AbortError') $('#saveMsg').textContent = 'Sending didn\'t work here. Use “Save all my notes” instead.'; }
  }

  async function run() {
    const db = window.indexedDB ? await openExisting() : null;
    if (db) {
      const [docs, ink, plan, sounds] = await Promise.all(['docs', 'ink', 'plan', 'sounds'].map((n) => readAll(db, n)));
      data = { docs, ink, plan, sounds };
    }
    const docs = data ? data.docs : [];
    const marked = data ? data.ink.filter((x) => x && x.pages && Object.values(x.pages).some((p) => p && ((p.strokes || []).length || (p.texts || []).length)) || (x && x.html)).length : 0;
    $('#status').hidden = true;
    if (!docs.length && !(data && data.plan.length)) {
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
