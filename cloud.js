/* PrixCompare — synchronisation cloud via Supabase Storage
 * ---------------------------------------------------------------------------
 * CONFIGURATION (une seule fois) :
 *
 * 1. Créer un projet gratuit sur https://supabase.com
 * 2. Storage → New bucket
 *      - Name : prixcompare
 *      - cocher « Public bucket »   (lecture publique des fichiers)
 * 3. Storage → Policies (ou SQL Editor) : autoriser l'écriture pour le rôle anon
 *      create policy "anon write" on storage.objects
 *        for insert to anon with check (bucket_id = 'prixcompare');
 *      create policy "anon update" on storage.objects
 *        for update to anon using (bucket_id = 'prixcompare');
 *      (la lecture publique découle du bucket « Public »)
 * 4. Settings → API : copier l'URL du projet et la clé « anon public »
 *    et les coller ci-dessous.
 *
 * Tant que url/anonKey sont vides, l'application reste 100 % locale.
 *
 * NOTE SÉCURITÉ : la clé « anon public » est faite pour être exposée dans un
 * site statique ; ce sont les policies RLS qui contrôlent les accès. Ne JAMAIS
 * mettre la clé « service_role » ici.
 *
 * ⚠️ Un bucket n'est pas une base de données : tout tient dans un seul objet
 * db.json (dernier écrivain gagne). Suffisant pour une démo.
 * ---------------------------------------------------------------------------
 */
const CLOUD_CONFIG = {
  url: 'https://drhxlcsxffwxurbuhhub.supabase.co',
  anonKey: 'sb_publishable_DKOw7fZGZRRV1dYfaJD9fQ_9BE192op', // clé publishable (publique)
  bucket: 'prixcompare',
  dbPath: 'db.json',  // objet contenant { products, purchases }
  photosDir: 'photos',
  autoPush: true,     // synchronise automatiquement à chaque enregistrement
  debounceMs: 1200,
};

const Cloud = (function () {
  const cfg = CLOUD_CONFIG;
  let lastSyncAt = null;
  let onStatusCb = null;
  let pushTimer = null;

  function enabled() {
    return !!(cfg.url && cfg.anonKey && cfg.bucket);
  }
  function api() { return cfg.url.replace(/\/+$/, '') + '/storage/v1'; }
  function objectUrl(path) { return api() + '/object/' + cfg.bucket + '/' + encodeURI(path); }
  function publicUrl(path) { return api() + '/object/public/' + cfg.bucket + '/' + encodeURI(path); }
  function headers(extra) {
    return Object.assign({ apikey: cfg.anonKey, Authorization: 'Bearer ' + cfg.anonKey }, extra || {});
  }
  function setStatus(state, detail) {
    if (onStatusCb) onStatusCb(state, detail);
  }
  function lastSync() { return lastSyncAt; }
  function onStatus(cb) { onStatusCb = cb; }

  // Extrait un message d'erreur lisible depuis une réponse Supabase.
  async function errMessage(res) {
    try {
      const j = await res.json();
      return j.message || j.error || ('HTTP ' + res.status);
    } catch (e) { return 'HTTP ' + res.status; }
  }
  function isNoBucket(msg) { return /NoSuchBucket|Bucket not found/i.test(msg || ''); }

  function extFromFile(file) {
    const m = /\.([a-z0-9]+)$/i.exec(file.name || '');
    if (m) return m[1].toLowerCase();
    const t = (file.type || '').split('/')[1];
    return t ? t.replace('jpeg', 'jpg') : 'jpg';
  }
  function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

  // Lit db.json depuis le bucket. Retourne null si l'objet (ou le bucket) n'existe pas.
  async function loadDb() {
    if (!enabled()) return null;
    setStatus('syncing');
    const res = await fetch(objectUrl(cfg.dbPath) + '?t=' + Date.now(), {
      headers: headers(), cache: 'no-store',
    });
    if (res.status === 404) { setStatus('idle'); return null; }
    if (!res.ok) {
      const msg = await errMessage(res);
      if (isNoBucket(msg)) { setStatus('error', 'bucket "' + cfg.bucket + '" introuvable'); return null; }
      setStatus('error', msg);
      throw new Error(msg);
    }
    const data = await res.json();
    lastSyncAt = new Date().toISOString();
    setStatus('idle');
    return data;
  }

  // Écrit db.json dans le bucket (upsert).
  async function saveDb(db) {
    if (!enabled()) return false;
    setStatus('syncing');
    const res = await fetch(objectUrl(cfg.dbPath), {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json', 'x-upsert': 'true' }),
      body: JSON.stringify(db),
    });
    if (!res.ok) {
      const msg = await errMessage(res);
      setStatus('error', isNoBucket(msg) ? 'bucket "' + cfg.bucket + '" introuvable' : msg);
      throw new Error(msg);
    }
    lastSyncAt = new Date().toISOString();
    setStatus('idle');
    return true;
  }

  // Envoi différé (regroupe plusieurs save() rapprochés).
  function queueSave(db) {
    if (!enabled() || !cfg.autoPush) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => { saveDb(db).catch(() => {}); }, cfg.debounceMs);
  }

  // Envoie un fichier photo et retourne son URL publique.
  async function uploadPhotoFile(file) {
    if (!enabled()) throw new Error('Cloud non configuré');
    const path = cfg.photosDir + '/' + newId() + '.' + extFromFile(file);
    setStatus('syncing');
    const res = await fetch(objectUrl(path), {
      method: 'POST',
      headers: headers({ 'Content-Type': file.type || 'image/jpeg', 'x-upsert': 'true', 'cache-control': '3600' }),
      body: file,
    });
    if (!res.ok) { const msg = await errMessage(res); setStatus('error', msg); throw new Error(msg); }
    setStatus('idle');
    return publicUrl(path);
  }

  return { enabled, loadDb, saveDb, queueSave, uploadPhotoFile, onStatus, lastSync, config: cfg };
})();
