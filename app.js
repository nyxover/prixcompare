// PrixCompare webapp (vanilla JS, localStorage)
const DB_KEY = 'prixcompare_db_v1';
function normalize(s) {
  if (!s) return s;
  let t = s.toLowerCase().trim();
  const map = {'à':'a','á':'a','â':'a','ä':'a','ã':'a','å':'a','è':'e','é':'e','ê':'e','ë':'e','ì':'i','í':'i','î':'i','ï':'i','ò':'o','ó':'o','ô':'o','ö':'o','õ':'o','ù':'u','ú':'u','û':'u','ü':'u','ç':'c','ñ':'n','œ':'oe','æ':'ae'};
  for (const k in map) t = t.replaceAll(k, map[k]);
  return t.replace(/\s+/g, ' ');
}
function load() {
  try { return JSON.parse(localStorage.getItem(DB_KEY)) || {products:[], purchases:[]}; } catch(e) { return {products:[], purchases:[]}; }
}
function saveLocal(db) { localStorage.setItem(DB_KEY, JSON.stringify(db)); }
function save(db) { saveLocal(db); if (typeof Cloud !== 'undefined') Cloud.queueSave(db); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

let db = load();

// tabs
document.querySelectorAll('nav button').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('nav button').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('section').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    document.getElementById(b.dataset.tab).classList.add('active');
    if (b.dataset.tab === 'products') renderProducts();
    if (b.dataset.tab === 'history') renderHistory();
    if (b.dataset.tab === 'compare') renderCompare();
  });
});

// theme
document.getElementById('theme').addEventListener('click', () => {
  document.body.classList.toggle('dark');
  localStorage.setItem('pc_theme', document.body.classList.contains('dark') ? 'dark' : 'light');
});
if (localStorage.getItem('pc_theme') === 'dark') document.body.classList.add('dark');

// mode
const modeSel = document.getElementById('mode');
modeSel.addEventListener('change', () => {
  document.getElementById('form-manual').style.display = modeSel.value === 'manual' ? 'flex' : 'none';
  document.getElementById('form-scan').style.display = modeSel.value === 'scan' ? 'block' : 'none';
  document.getElementById('form-photo').style.display = modeSel.value === 'photo' ? 'block' : 'none';
});

// photo previews
let mPhoto = null, pPhoto = null;
let mPhotoFile = null, pPhotoFile = null;
document.getElementById('m-photo').addEventListener('click', () => document.getElementById('m-photo-file').click());
document.getElementById('m-photo-file').addEventListener('change', (e) => {
  const f = e.target.files[0]; if (!f) return;
  mPhotoFile = f;
  const r = new FileReader();
  r.onload = (ev) => { mPhoto = ev.target.result; const img = document.getElementById('m-photo-prev'); img.src = mPhoto; img.style.display = 'block'; };
  r.readAsDataURL(f);
});
document.getElementById('p-photo').addEventListener('click', () => document.getElementById('p-photo-file').click());
document.getElementById('p-photo-file').addEventListener('change', (e) => {
  const f = e.target.files[0]; if (!f) return;
  pPhotoFile = f;
  const r = new FileReader();
  r.onload = (ev) => { pPhoto = ev.target.result; const img = document.getElementById('p-photo-prev'); img.src = pPhoto; img.style.display = 'block'; };
  r.readAsDataURL(f);
});

// Si le cloud est actif, envoie la photo dans le bucket et renvoie son URL.
// Sinon (ou en cas d'échec) on garde l'image en data URL locale.
async function resolveImage(dataUrl, file) {
  if (file && typeof Cloud !== 'undefined' && Cloud.enabled()) {
    try { return await Cloud.uploadPhotoFile(file); } catch (e) { /* repli local */ }
  }
  return dataUrl;
}

// save manual
document.getElementById('m-save').addEventListener('click', async () => {
  const name = document.getElementById('m-name').value.trim();
  const barcode = document.getElementById('m-barcode').value.trim() || null;
  const price = parseFloat((document.getElementById('m-price').value.replace(',', '.')));
  const qty = parseFloat((document.getElementById('m-qty').value.replace(',', '.')) || '1');
  const store = document.getElementById('m-store').value.trim() || 'Inconnu';
  let date = document.getElementById('m-date').value;
  if (!date) date = new Date().toISOString().slice(0,10);
  if (!name || isNaN(price)) { alert('Nom et prix requis'); return; }
  const img = await resolveImage(mPhoto, mPhotoFile);
  let prod = barcode ? db.products.find(p => p.barcode === barcode) : null;
  if (!prod) prod = db.products.find(p => normalize(p.name) === normalize(name));
  if (!prod) {
    prod = { id: uid(), name, barcode, normalized_name: normalize(name), category: null, image_path: img, updated_at: new Date().toISOString() };
    db.products.push(prod);
  } else {
    if (img) prod.image_path = img;
    prod.updated_at = new Date().toISOString();
  }
  const purch = { id: uid(), product_id: prod.id, store, price, quantity: isNaN(qty)?1:qty, date, note: null, created_at: new Date().toISOString() };
  db.purchases.push(purch);
  save(db);
  refreshStores();
  alert('Enregistré');
  document.getElementById('m-name').value=''; document.getElementById('m-barcode').value=''; document.getElementById('m-price').value=''; document.getElementById('m-qty').value='1'; document.getElementById('m-store').value=''; document.getElementById('m-photo-prev').style.display='none'; mPhoto=null; mPhotoFile=null; document.getElementById('m-photo-file').value='';
});

// scan camera
let scanStream = null;
let scanInterval = null;
document.getElementById('scan-start').addEventListener('click', async () => {
  const video = document.getElementById('scan-video');
  const status = document.getElementById('scan-status');
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      status.textContent = 'Caméra non supportée sur ce navigateur';
      return;
    }
    scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    video.srcObject = scanStream;
    video.style.display = 'block';
    document.getElementById('scan-start').style.display = 'none';
    document.getElementById('scan-stop').style.display = 'inline-block';
    status.textContent = 'Caméra active...';
    // simple barcode detection via canvas + Quagga-like minimal? fallback: ask user to fill
    // lightweight: use BarcodeDetector if available
    const BarcodeDetector = window.BarcodeDetector;
    if (BarcodeDetector) {
      const detector = new BarcodeDetector({ formats: ['ean_13','ean_8','upc_a','upc_e','code_128','code_39','qr_code'] });
      scanInterval = setInterval(async () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth || 320; canvas.height = video.videoHeight || 240;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const codes = await detector.detect(canvas);
          if (codes.length > 0) {
            const code = codes[0].rawValue;
            if (code) {
              document.getElementById('s-barcode').value = code;
              status.textContent = 'Code détecté : ' + code;
              // beep-like: vibrate small
              if (navigator.vibrate) navigator.vibrate(100);
            }
          }
        } catch (e) {}
      }, 500);
    } else {
      status.textContent = 'BarcodeDetector non dispo. Saisis le code ou copie depuis photo.';
    }
  } catch (e) {
    status.textContent = 'Accès caméra refusé';
  }
});
document.getElementById('scan-stop').addEventListener('click', () => {
  if (scanStream) {
    scanStream.getTracks().forEach(t => t.stop());
    scanStream = null;
  }
  if (scanInterval) { clearInterval(scanInterval); scanInterval = null; }
  document.getElementById('scan-video').style.display = 'none';
  document.getElementById('scan-start').style.display = 'inline-block';
  document.getElementById('scan-stop').style.display = 'none';
  document.getElementById('scan-status').textContent = '';
});

// scan save
document.getElementById('s-save').addEventListener('click', () => {
  const barcode = document.getElementById('s-barcode').value.trim();
  const name = document.getElementById('s-name').value.trim();
  const price = parseFloat((document.getElementById('s-price').value.replace(',', '.')));
  const store = document.getElementById('s-store').value.trim() || 'Inconnu';
  if (!barcode || !name || isNaN(price)) { alert('Code-barres, nom, prix requis'); return; }
  let prod = db.products.find(p => p.barcode === barcode);
  if (!prod) {
    prod = { id: uid(), name, barcode, normalized_name: normalize(name), category: null, image_path: null, updated_at: new Date().toISOString() };
    db.products.push(prod);
  }
  const purch = { id: uid(), product_id: prod.id, store, price, quantity: 1, date: new Date().toISOString().slice(0,10), note: null, created_at: new Date().toISOString() };
  db.purchases.push(purch);
  save(db); refreshStores(); alert('Enregistré');
});

// photo
document.getElementById('p-save').addEventListener('click', async () => {
  const name = document.getElementById('p-name').value.trim();
  const price = parseFloat((document.getElementById('p-price').value.replace(',', '.')));
  const store = document.getElementById('p-store').value.trim() || 'Inconnu';
  if (!name || isNaN(price) || !pPhoto) { alert('Photo, nom, prix requis'); return; }
  const img = await resolveImage(pPhoto, pPhotoFile);
  let prod = db.products.find(p => normalize(p.name) === normalize(name));
  if (!prod) {
    prod = { id: uid(), name, barcode: null, normalized_name: normalize(name), category: null, image_path: img, updated_at: new Date().toISOString() };
    db.products.push(prod);
  } else {
    prod.image_path = img; prod.updated_at = new Date().toISOString();
  }
  const purch = { id: uid(), product_id: prod.id, store, price, quantity: 1, date: new Date().toISOString().slice(0,10), note: null, created_at: new Date().toISOString() };
  db.purchases.push(purch);
  save(db); refreshStores(); alert('Enregistré');
});

// render
function renderProducts() {
  const grid = document.getElementById('products-grid');
  grid.innerHTML = '';
  if (db.products.length === 0) { grid.innerHTML = '<div class="muted">Aucun produit</div>'; return; }
  for (const p of db.products) {
    const ps = db.purchases.filter(x => x.product_id === p.id).sort((a,b) => b.date.localeCompare(a.date));
    const last = ps[0];
    const div = document.createElement('div');
    div.className = 'card';
    div.innerHTML = `<div style="display:flex;gap:10px;align-items:center"><img src="${p.image_path||''}" style="width:56px;height:56px;object-fit:cover;border-radius:10px;display:${p.image_path?'block':'none'}"><div style="flex:1"><strong>${escapeHtml(p.name)}</strong><div class="muted">${last?last.store+' • '+ps.length+' achat(s)':'-'}</div></div><div>${last?last.price.toFixed(2)+' €':'-'}</div></div>`;
    grid.appendChild(div);
  }
}
function renderHistory() {
  const body = document.getElementById('hist-body');
  body.innerHTML = '';
  const items = db.purchases.slice().sort((a,b) => b.date.localeCompare(a.date));
  for (const pur of items) {
    const prod = db.products.find(p => p.id === pur.product_id);
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${pur.date}</td><td>${prod?escapeHtml(prod.name):'-'}</td><td>${escapeHtml(pur.store)}</td><td>${pur.price.toFixed(2)}</td><td>${pur.quantity}</td><td>${(pur.price*pur.quantity).toFixed(2)}</td>`;
    body.appendChild(tr);
  }
}
function renderCompare() {
  const sel = document.getElementById('cmp-prod');
  sel.innerHTML = '<option value="">Sélectionner produit</option>';
  for (const p of db.products) {
    const o = document.createElement('option'); o.value = p.id; o.textContent = p.name; sel.appendChild(o);
  }
}
document.getElementById('cmp-prod').addEventListener('change', () => {
  const id = document.getElementById('cmp-prod').value;
  const list = document.getElementById('cmp-list');
  list.innerHTML = '';
  if (!id) return;
  const ps = db.purchases.filter(x => x.product_id === id);
  const by = {};
  for (const p of ps) { if (!by[p.store]) by[p.store] = []; by[p.store].push(p); }
  const rows = Object.entries(by).map(([s, arr]) => {
    arr.sort((a,b) => b.date.localeCompare(a.date));
    const minv = Math.min(...arr.map(x=>x.price));
    return {s, last: arr[0].date, count: arr.length, price: minv};
  }).sort((a,b) => a.price - b.price);
  for (const r of rows) {
    const d = document.createElement('div');
    d.className = 'card';
    d.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><div><strong>${escapeHtml(r.s)}</strong><div class="muted">Dernier: ${r.last} • ${r.count} achat(s)</div></div><div><strong>${r.price.toFixed(2)} €</strong>${rows.indexOf(r)===0?'<div class="muted">Moins cher</div>':''}</div></div>`;
    list.appendChild(d);
  }
});

function refreshStores() {
  const stores = [...new Set(db.purchases.map(p=>p.store).filter(Boolean))].sort();
  ['stores','stores2','stores3'].forEach(id => {
    const el = document.getElementById(id); if (!el) return; el.innerHTML = '';
    for (const s of stores) { const o = document.createElement('option'); o.value = s; el.appendChild(o); }
  });
}
function escapeHtml(s){return (s||'').replace(/[&<>"']/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[c]));}

// ---- cloud (Supabase Storage) -----------------------------------------
function renderCloudStatus(state, detail) {
  const el = document.getElementById('cloud-status');
  const pill = document.getElementById('cloud-pill');
  const off = (typeof Cloud === 'undefined' || !Cloud.enabled());
  if (off) {
    if (el) el.textContent = 'Désactivé — données locales uniquement (localStorage)';
    if (pill) {
      pill.textContent = 'Local';
      pill.className = 'pill off';
      pill.title = 'Cloud non configuré : renseigne url et anonKey dans cloud.js';
    }
    return;
  }
  const map = { syncing: 'Synchronisation…', idle: 'Connecté', error: 'Erreur', off: 'Connecté' };
  const detailTxt = (map[state] || state) + (detail ? ' (' + detail + ')' : '');
  const last = Cloud.lastSync() ? ' • dernière sync ' + new Date(Cloud.lastSync()).toLocaleTimeString() : '';
  if (el) el.textContent = detailTxt + last;
  if (pill) {
    pill.className = 'pill ' + (state === 'error' ? 'err' : (state === 'syncing' ? 'busy' : 'ok'));
    pill.textContent = state === 'error' ? 'Cloud ⚠' : (state === 'syncing' ? 'Sync…' : 'Cloud ✓');
    pill.title = 'Cloud Supabase — ' + detailTxt + last;
  }
}
async function pushToCloud(silent) {
  if (typeof Cloud === 'undefined' || !Cloud.enabled()) {
    if (!silent) alert('Cloud non configuré : renseigne url et anonKey dans cloud.js'); return;
  }
  try {
    await Cloud.saveDb(db);
    renderCloudStatus('idle');
    if (!silent) alert('Enregistré dans le cloud');
  } catch (e) {
    renderCloudStatus('error', e.message);
    if (!silent) alert('Échec de la synchronisation : ' + e.message);
  }
}
async function pullFromCloud() {
  if (typeof Cloud === 'undefined' || !Cloud.enabled()) { alert('Cloud non configuré : renseigne url et anonKey dans cloud.js'); return; }
  try {
    const remote = await Cloud.loadDb();
    if (!remote) { alert('Aucune donnée dans le cloud pour le moment'); return; }
    db = { products: remote.products || [], purchases: remote.purchases || [] };
    saveLocal(db);
    refreshStores(); renderProducts(); renderHistory(); renderCompare();
    alert('Données rechargées depuis le cloud');
  } catch (e) { alert('Échec du chargement : ' + e.message); }
}
async function initCloud() {
  if (typeof Cloud === 'undefined') return;
  Cloud.onStatus(renderCloudStatus);
  renderCloudStatus('off');
  if (!Cloud.enabled()) return;
  try {
    const remote = await Cloud.loadDb();
    if (remote && (Array.isArray(remote.products) || Array.isArray(remote.purchases))) {
      db = { products: remote.products || [], purchases: remote.purchases || [] };
      saveLocal(db);
      refreshStores(); renderProducts(); renderHistory(); renderCompare();
    } else {
      // premier lancement : on publie les données locales
      await Cloud.saveDb(db);
    }
    renderCloudStatus('idle');
  } catch (e) {
    renderCloudStatus('error', e.message);
  }
}
document.getElementById('cloud-push').addEventListener('click', () => pushToCloud(false));
document.getElementById('cloud-pull').addEventListener('click', pullFromCloud);

// export/import
document.getElementById('exp-csv').addEventListener('click', () => {
  const rows = ['date,product_name,barcode,store,price,quantity,total_price,category,note,has_image'];
  for (const p of db.purchases) {
    const prod = db.products.find(x => x.id === p.product_id);
    const total = p.price * p.quantity;
    const hasImg = prod && prod.image_path ? 'true' : 'false';
    const name = (prod?prod.name:'').replace(/"/g,'""');
    rows.push(`"${p.date}","${name}","${prod?prod.barcode||'':''}","${p.store.replace(/"/g,'""')}","${p.price}","${p.quantity}","${total}","${prod?prod.category||'':''}","",${hasImg}`);
  }
  const blob = new Blob([rows.join('\n')], {type:'text/csv'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `prixcompare_export_${new Date().toISOString().slice(0,10)}.csv`; a.click();
});
document.getElementById('exp-json').addEventListener('click', () => {
  const data = {version:'1.0.0', exported_at:new Date().toISOString(), platform:'web', products:db.products, purchases:db.purchases};
  const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `prixcompare_export_${new Date().toISOString().slice(0,10)}.json`; a.click();
});

// ---- import helpers ----------------------------------------------------
// Trouve un produit existant (code-barres prioritaire, sinon nom normalisé)
// ou en crée un nouveau. Retourne l'id du produit.
function upsertProduct(p) {
  const name = (p.name || '').trim();
  const barcode = (p.barcode || '').trim() || null;
  let found = barcode ? db.products.find(x => x.barcode === barcode) : null;
  if (!found && name) found = db.products.find(x => x.normalized_name === normalize(name));
  if (found) {
    if (!found.barcode && barcode) found.barcode = barcode;
    if (!found.image_path && p.image_path) found.image_path = p.image_path;
    if (!found.category && p.category) found.category = p.category;
    found.updated_at = new Date().toISOString();
    return found.id;
  }
  const np = {
    id: uid(),
    name: name || 'Sans nom',
    barcode,
    normalized_name: normalize(name || 'Sans nom'),
    category: p.category || null,
    image_path: p.image_path || null,
    updated_at: new Date().toISOString()
  };
  db.products.push(np);
  return np.id;
}

// Ajoute un achat en évitant les doublons stricts. Retourne true si ajouté.
function addPurchase(pu) {
  const rec = {
    id: uid(),
    product_id: pu.product_id,
    store: (pu.store || 'Inconnu').toString(),
    price: Number(String(pu.price).replace(',', '.')) || 0,
    quantity: Number(String(pu.quantity).replace(',', '.')) || 1,
    date: pu.date || new Date().toISOString().slice(0,10),
    note: pu.note || null,
    created_at: pu.created_at || new Date().toISOString()
  };
  const dup = db.purchases.find(x =>
    x.product_id === rec.product_id && x.store === rec.store && x.date === rec.date &&
    Number(x.price) === rec.price && Number(x.quantity) === rec.quantity
  );
  if (dup) return false;
  db.purchases.push(rec);
  return true;
}

function emptyDb() { db = { products: [], purchases: [] }; }

function showImportResult(products, purchases, mode, format, skipped) {
  const el = document.getElementById('imp-result');
  const verb = mode === 'replace' ? 'remplacées' : 'fusionnées';
  el.textContent = `Import ${format} OK — ${products} produit(s) et ${purchases} achat(s) ${verb}` +
    (skipped ? ` • ${skipped} ligne(s) ignorée(s)` : '');
}

// ---- CSV parsing -------------------------------------------------------
function parseCSV(text) {
  text = text.replace(/^\uFEFF/, ''); // BOM
  const firstLine = text.split(/\r?\n/)[0] || '';
  const delim = (firstLine.split(';').length > firstLine.split(',').length) ? ';' : ',';
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delim) {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else if (c === '\r') {
      // ignore
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ''));
}

function importCSV(text, replace) {
  const rows = parseCSV(text);
  if (!rows.length) throw new Error('CSV vide');
  const header = rows[0].map(h => normalize(h));
  const known = ['date','product_name','name','barcode','store','price','quantity','category','note'];
  const hasHeader = header.some(h => known.includes(h));
  const cols = hasHeader ? header : ['date','product_name','barcode','store','price','quantity','category','note'];
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const at = (r, names) => {
    for (const n of names) { const i = cols.indexOf(n); if (i >= 0) return (r[i] || '').trim(); }
    return '';
  };
  if (replace) emptyDb();
  let np = 0, na = 0, skipped = 0;
  for (const r of dataRows) {
    const name = at(r, ['product_name','name']);
    const price = at(r, ['price']);
    if (!name || price === '') { skipped++; continue; }
    const pid = upsertProduct({ name, barcode: at(r, ['barcode']), category: at(r, ['category']) });
    np++;
    const ok = addPurchase({
      product_id: pid,
      store: at(r, ['store']) || 'Inconnu',
      price: price,
      quantity: at(r, ['quantity']) || 1,
      date: at(r, ['date']),
      note: at(r, ['note'])
    });
    if (ok) na++;
  }
  save(db); refreshStores();
  showImportResult(np, na, replace ? 'replace' : 'merge', 'CSV', skipped);
}

function importJSON(text, replace) {
  const j = JSON.parse(text);
  const products = Array.isArray(j.products) ? j.products : [];
  const purchases = Array.isArray(j.purchases) ? j.purchases : [];
  if (!products.length && !purchases.length) throw new Error('Aucune donnée');
  if (replace) emptyDb();
  const idMap = {};
  for (const p of products) {
    if (!p || !p.name) continue;
    idMap[p.id] = upsertProduct(p);
  }
  let na = 0;
  for (const pu of purchases) {
    if (!pu) continue;
    // remappe l'ancien id produit vers le nouveau, sinon réutilise tel quel
    const pid = idMap[pu.product_id] || (db.products.some(x => x.id === pu.product_id) ? pu.product_id : null);
    if (!pid) continue;
    if (addPurchase({ ...pu, product_id: pid })) na++;
  }
  save(db); refreshStores();
  showImportResult(products.length, na, replace ? 'replace' : 'merge', 'JSON', 0);
}

function readFileAndImport(file, replace, handler) {
  if (!file) return;
  const r = new FileReader();
  r.onload = (ev) => {
    try { handler(ev.target.result, replace); }
    catch (ex) { alert('Erreur import : ' + ex.message); }
  };
  r.readAsText(file);
}

document.getElementById('imp-csv-btn').addEventListener('click', () => document.getElementById('imp-csv').click());
document.getElementById('imp-json-btn').addEventListener('click', () => document.getElementById('imp-json').click());
document.getElementById('imp-csv').addEventListener('change', (e) => {
  const mode = document.getElementById('imp-mode').value;
  readFileAndImport(e.target.files[0], mode === 'replace', importCSV);
  e.target.value = '';
});
document.getElementById('imp-json').addEventListener('change', (e) => {
  const mode = document.getElementById('imp-mode').value;
  readFileAndImport(e.target.files[0], mode === 'replace', importJSON);
  e.target.value = '';
});

refreshStores();
renderProducts();
initCloud();
