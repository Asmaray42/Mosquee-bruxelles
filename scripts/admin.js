/**
 * admin.js — Mini serveur Express pour l'admin panel
 *
 * Routes :
 *   GET  /admin              → interface de gestion
 *   GET  /admin/events       → liste tous les événements (JSON)
 *   POST /admin/events/:id/validate   → valide un événement
 *   POST /admin/events/:id/reject     → supprime un événement
 *   POST /admin/events/add   → ajoute un événement manuellement
 *   POST /admin/ocr          → soumet une image pour OCR
 *   POST /admin/scrape       → déclenche le scraper manuellement
 *
 * Protégé par un mot de passe simple via variable d'environnement ADMIN_PASSWORD
 *
 * Usage : node admin.js
 * Port  : 3001 (configurable via PORT=3001)
 *
 * Sur le VPS, faire tourner avec PM2 :
 *   pm2 start admin.js --name "gmb-admin"
 */

'use strict';

const http       = require('http');
const fs         = require('fs');
const path       = require('path');
const { execFile } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const PORT          = process.env.ADMIN_PORT || 3001;
const ADMIN_PASS    = process.env.ADMIN_PASSWORD || 'changez-moi';
const EVENTS_FILE   = path.join(__dirname, '../data/events.json');
const SCRAPER_FILE  = path.join(__dirname, 'scraper.js');
const IMAGES_DIR    = path.join(__dirname, '../data/images');

/* ----------------------------------------------------------------
   Helpers
---------------------------------------------------------------- */
function loadEvents() {
  try {
    return JSON.parse(fs.readFileSync(EVENTS_FILE, 'utf8'));
  } catch {
    return { lastUpdated: null, events: [] };
  }
}

function saveEvents(store) {
  store.lastUpdated = new Date().toISOString();
  fs.writeFileSync(EVENTS_FILE, JSON.stringify(store, null, 2));
}

function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function html(res, content) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(content);
}

function checkAuth(req) {
  const auth = req.headers['authorization'] || '';
  const b64  = auth.replace('Basic ', '');
  const decoded = Buffer.from(b64, 'base64').toString();
  const [, pass] = decoded.split(':');
  return pass === ADMIN_PASS;
}

function requireAuth(req, res) {
  if (!checkAuth(req)) {
    res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="GMB Admin"' });
    res.end('Accès non autorisé');
    return false;
  }
  return true;
}

function bodyParser(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch { resolve({}); }
    });
  });
}

function makeId() {
  return 'evt_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}


/* ----------------------------------------------------------------
   Interface HTML admin
---------------------------------------------------------------- */
function adminPageHtml(store) {
  const pending   = store.events.filter(e => !e.validated);
  const validated = store.events.filter(e => e.validated);

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Admin — Grande Mosquée de Bruxelles</title>
<style>
  :root{--vert:#1a6b4a;--or:#c9a84c;--rouge:#c0392b;--bg:#faf7f0}
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:system-ui,sans-serif;background:var(--bg);color:#1e1e1e;font-size:14px}
  header{background:var(--vert);color:#fff;padding:1rem 2rem;display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid var(--or)}
  header h1{font-size:1.1rem;letter-spacing:.05em}
  header small{opacity:.7;font-size:.8rem}
  .container{max-width:1200px;margin:0 auto;padding:1.5rem}
  h2{font-size:1rem;text-transform:uppercase;letter-spacing:.06em;color:var(--vert);margin-bottom:1rem;border-bottom:2px solid var(--or);padding-bottom:.5rem}
  .tabs{display:flex;gap:.5rem;margin-bottom:1.5rem}
  .tab{padding:.5rem 1.2rem;border:1px solid #ccc;border-radius:4px;background:#fff;cursor:pointer;font-size:.85rem;transition:all .2s}
  .tab.active,.tab:hover{background:var(--vert);color:#fff;border-color:var(--vert)}
  .panel{display:none}.panel.active{display:block}
  .badge{display:inline-block;padding:2px 8px;border-radius:12px;font-size:.72rem;font-weight:600}
  .badge-pending{background:#fff3cd;color:#856404}
  .badge-validated{background:#d1e7dd;color:#0a3622}
  .badge-cours{background:#cff4fc;color:#055160}
  .badge-ramadan{background:#f8d7da;color:#842029}
  .badge-conference{background:#e2d9f3;color:#432874}
  .badge-annonce{background:#e9ecef;color:#495057}
  .card{background:#fff;border:1px solid #e0d8c0;border-radius:8px;padding:1rem;margin-bottom:.75rem;display:grid;grid-template-columns:1fr auto;gap:1rem;align-items:start}
  .card:hover{border-color:var(--or)}
  .card-title{font-weight:600;margin-bottom:.3rem;font-size:.95rem}
  .card-meta{font-size:.8rem;color:#666;display:flex;flex-wrap:wrap;gap:.5rem;margin-bottom:.5rem}
  .card-raw{font-size:.78rem;color:#888;font-style:italic;white-space:pre-wrap;max-height:80px;overflow:hidden;cursor:pointer}
  .card-raw.expanded{max-height:none}
  .card-actions{display:flex;flex-direction:column;gap:.4rem}
  .btn{padding:.4rem .9rem;border:none;border-radius:4px;cursor:pointer;font-size:.82rem;font-weight:600;transition:opacity .2s}
  .btn:hover{opacity:.85}
  .btn-validate{background:var(--vert);color:#fff}
  .btn-reject{background:var(--rouge);color:#fff}
  .btn-edit{background:var(--or);color:#333}
  .btn-scrape{background:var(--vert);color:#fff;padding:.6rem 1.4rem;font-size:.9rem}
  .btn-submit{background:var(--vert);color:#fff;padding:.6rem 1.4rem;font-size:.9rem;width:100%}
  .form-grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem}
  .form-group{display:flex;flex-direction:column;gap:.3rem}
  label{font-size:.82rem;font-weight:600;color:var(--vert)}
  input,select,textarea{padding:.5rem;border:1px solid #ccc;border-radius:4px;font-size:.9rem;font-family:inherit;width:100%}
  textarea{resize:vertical;min-height:80px}
  .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;margin-bottom:1.5rem}
  .stat{background:#fff;border:1px solid #e0d8c0;border-radius:8px;padding:1rem;text-align:center}
  .stat-num{font-size:2rem;font-weight:700;color:var(--vert)}
  .stat-label{font-size:.78rem;color:#888;text-transform:uppercase;letter-spacing:.05em}
  .empty{text-align:center;padding:3rem;color:#aaa;font-style:italic}
  .ocr-zone{border:2px dashed #ccc;border-radius:8px;padding:2rem;text-align:center;cursor:pointer;transition:border-color .2s;background:#fff}
  .ocr-zone:hover{border-color:var(--vert)}
  .ocr-zone input{display:none}
  #ocr-result{margin-top:1rem;background:#f8f9fa;border-radius:6px;padding:1rem;font-size:.82rem;white-space:pre-wrap;display:none}
  .log-box{background:#1e1e1e;color:#a8ff78;font-family:monospace;font-size:.78rem;padding:1rem;border-radius:6px;height:200px;overflow-y:auto;white-space:pre-wrap}
  @media(max-width:600px){.form-grid{grid-template-columns:1fr}.stats{grid-template-columns:1fr 1fr}}
</style>
</head>
<body>

<header>
  <h1>🕌 Admin — Grande Mosquée de Bruxelles</h1>
  <small>Dernière MàJ : ${store.lastUpdated ? new Date(store.lastUpdated).toLocaleString('fr-BE') : 'jamais'}</small>
</header>

<div class="container">

  <!-- Statistiques -->
  <div class="stats">
    <div class="stat"><div class="stat-num">${store.events.length}</div><div class="stat-label">Total événements</div></div>
    <div class="stat"><div class="stat-num">${pending.length}</div><div class="stat-label">En attente</div></div>
    <div class="stat"><div class="stat-num">${validated.length}</div><div class="stat-label">Validés</div></div>
    <div class="stat"><div class="stat-num">${store.events.filter(e=>e.source==='mawaqit-image-ocr').length}</div><div class="stat-label">Via OCR</div></div>
  </div>

  <!-- Onglets -->
  <div class="tabs">
    <button class="tab active" onclick="showTab('pending')">En attente (${pending.length})</button>
    <button class="tab" onclick="showTab('validated')">Validés (${validated.length})</button>
    <button class="tab" onclick="showTab('add')">+ Ajouter</button>
    <button class="tab" onclick="showTab('ocr')">OCR Image</button>
    <button class="tab" onclick="showTab('scrape')">Scraper</button>
  </div>

  <!-- Panneau : En attente -->
  <div class="panel active" id="tab-pending">
    <h2>Événements en attente de validation</h2>
    ${pending.length === 0 ? '<p class="empty">Aucun événement en attente</p>' : ''}
    ${pending.map(e => eventCard(e, true)).join('')}
  </div>

  <!-- Panneau : Validés -->
  <div class="panel" id="tab-validated">
    <h2>Événements validés</h2>
    ${validated.length === 0 ? '<p class="empty">Aucun événement validé</p>' : ''}
    ${validated.map(e => eventCard(e, false)).join('')}
  </div>

  <!-- Panneau : Ajouter manuellement -->
  <div class="panel" id="tab-add">
    <h2>Ajouter un événement manuellement</h2>
    <div style="background:#fff;border:1px solid #e0d8c0;border-radius:8px;padding:1.5rem">
      <div class="form-grid" style="margin-bottom:1rem">
        <div class="form-group">
          <label>Type</label>
          <select id="new-type">
            <option value="cours">Cours</option>
            <option value="conference">Conférence</option>
            <option value="ramadan">Programme Ramadan</option>
            <option value="annonce">Annonce</option>
            <option value="jumuah">Jumu'a</option>
            <option value="autre">Autre</option>
          </select>
        </div>
        <div class="form-group">
          <label>Jour / Date</label>
          <input type="text" id="new-day" placeholder="ex: Dimanche ou 2025-03-15"/>
        </div>
        <div class="form-group">
          <label>Titre (FR)</label>
          <input type="text" id="new-title-fr" placeholder="Titre en français"/>
        </div>
        <div class="form-group">
          <label>Titre (AR)</label>
          <input type="text" id="new-title-ar" placeholder="العنوان بالعربية" dir="rtl"/>
        </div>
        <div class="form-group">
          <label>Titre (NL)</label>
          <input type="text" id="new-title-nl" placeholder="Titel in het Nederlands"/>
        </div>
        <div class="form-group">
          <label>Horaire</label>
          <input type="text" id="new-time" placeholder="ex: après Asr ou 14h30"/>
        </div>
        <div class="form-group">
          <label>Intervenant</label>
          <input type="text" id="new-speaker" placeholder="Nom du cheikh ou professeur"/>
        </div>
        <div class="form-group">
          <label>Période</label>
          <input type="text" id="new-period" placeholder="ex: Ramadan 2025"/>
        </div>
      </div>
      <div class="form-group" style="margin-bottom:1rem">
        <label>Notes / Description</label>
        <textarea id="new-notes" placeholder="Informations complémentaires..."></textarea>
      </div>
      <button class="btn btn-submit" onclick="addEvent()">Ajouter l'événement</button>
    </div>
  </div>

  <!-- Panneau : OCR Image -->
  <div class="panel" id="tab-ocr">
    <h2>Extraire des événements depuis une image</h2>
    <p style="margin-bottom:1rem;color:#666;font-size:.9rem">
      Glisse une image d'affiche ou de tableau de programme (comme les images Mawaqit).
      Claude Vision va extraire automatiquement les données structurées.
    </p>
    <div class="ocr-zone" onclick="document.getElementById('ocr-file').click()">
      <input type="file" id="ocr-file" accept="image/*" onchange="processOcrImage(this)"/>
      <div style="font-size:2rem;margin-bottom:.5rem">🖼️</div>
      <p>Clique ou glisse une image ici</p>
      <small style="color:#aaa">JPG, PNG, WEBP — max 5MB</small>
    </div>
    <div id="ocr-status" style="margin-top:.5rem;font-size:.85rem;color:var(--vert);display:none">
      ⏳ Analyse en cours...
    </div>
    <pre id="ocr-result"></pre>
  </div>

  <!-- Panneau : Scraper -->
  <div class="panel" id="tab-scrape">
    <h2>Lancer le scraper manuellement</h2>
    <p style="margin-bottom:1rem;color:#666;font-size:.9rem">
      Le scraper tourne automatiquement toutes les 6h via cron.
      Clique ci-dessous pour le déclencher manuellement.
    </p>
    <div style="display:flex;gap:1rem;margin-bottom:1rem;flex-wrap:wrap">
      <button class="btn btn-scrape" onclick="runScraper('all')">Scraper tout</button>
      <button class="btn btn-edit" onclick="runScraper('text-only')">Texte seulement</button>
      <button class="btn btn-edit" onclick="runScraper('ocr-only')">Images seulement</button>
    </div>
    <div class="log-box" id="scraper-log">Logs du scraper ici...</div>
  </div>

</div>

<script>
function showTab(name) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  event.target.classList.add('active');
}

function toggleRaw(id) {
  document.getElementById('raw-' + id).classList.toggle('expanded');
}

async function validateEvent(id) {
  const r = await fetch('/admin/events/' + id + '/validate', { method: 'POST' });
  if (r.ok) { document.getElementById('card-' + id).remove(); location.reload(); }
}

async function rejectEvent(id) {
  if (!confirm('Supprimer cet événement ?')) return;
  const r = await fetch('/admin/events/' + id + '/reject', { method: 'POST' });
  if (r.ok) { document.getElementById('card-' + id).remove(); }
}

async function addEvent() {
  const body = {
    type:     document.getElementById('new-type').value,
    day:      { fr: document.getElementById('new-day').value },
    title:    {
      fr: document.getElementById('new-title-fr').value,
      ar: document.getElementById('new-title-ar').value,
      nl: document.getElementById('new-title-nl').value,
    },
    time:     { fr: document.getElementById('new-time').value },
    speaker:  document.getElementById('new-speaker').value,
    period:   document.getElementById('new-period').value,
    notes:    { fr: [document.getElementById('new-notes').value].filter(Boolean) },
    source:   'manual',
    validated: true,
  };
  const r = await fetch('/admin/events/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (r.ok) { alert('Événement ajouté !'); location.reload(); }
}

async function processOcrImage(input) {
  const file = input.files[0];
  if (!file) return;
  const status = document.getElementById('ocr-status');
  const result = document.getElementById('ocr-result');
  status.style.display = 'block';
  result.style.display = 'none';

  const formData = new FormData();
  formData.append('image', file);

  try {
    const r = await fetch('/admin/ocr', { method: 'POST', body: formData });
    const data = await r.json();
    status.style.display = 'none';
    result.style.display = 'block';
    result.textContent = JSON.stringify(data, null, 2);
    if (data.events && data.events.length > 0) {
      if (confirm(data.events.length + ' événements extraits. Les ajouter à events.json ?')) {
        await fetch('/admin/events/add-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ events: data.events }),
        });
        location.reload();
      }
    }
  } catch (e) {
    status.style.display = 'none';
    result.style.display = 'block';
    result.textContent = 'Erreur: ' + e.message;
  }
}

async function runScraper(mode) {
  const log = document.getElementById('scraper-log');
  log.textContent = 'Lancement du scraper (' + mode + ')...\\n';
  const r = await fetch('/admin/scrape?mode=' + mode, { method: 'POST' });
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    log.textContent += decoder.decode(value);
    log.scrollTop = log.scrollHeight;
  }
}
</script>
</body>
</html>`;
}

function eventCard(e, showValidate) {
  const title = (e.title?.fr || e.title || e.raw || 'Sans titre').slice(0, 80);
  const typeClass = 'badge-' + (e.type || 'annonce');
  const srcLabel  = e.source === 'manual' ? 'Manuel' : e.source === 'mawaqit-image-ocr' ? 'OCR' : 'Mawaqit';
  return `
  <div class="card" id="card-${e.id}">
    <div>
      <div class="card-title">${title}</div>
      <div class="card-meta">
        <span class="badge ${typeClass}">${e.type || 'autre'}</span>
        <span>${srcLabel}</span>
        ${e.speaker ? `<span>👤 ${e.speaker}</span>` : ''}
        ${e.day?.fr ? `<span>📅 ${e.day.fr}</span>` : ''}
        ${e.time?.fr ? `<span>⏰ ${e.time.fr}</span>` : ''}
        ${e.period ? `<span>🌙 ${e.period}</span>` : ''}
      </div>
      ${e.raw ? `<div class="card-raw" id="raw-${e.id}" onclick="toggleRaw('${e.id}')">${e.raw.slice(0, 300)}</div>` : ''}
    </div>
    <div class="card-actions">
      ${showValidate ? `<button class="btn btn-validate" onclick="validateEvent('${e.id}')">✓ Valider</button>` : ''}
      <button class="btn btn-reject" onclick="rejectEvent('${e.id}')">✗ Supprimer</button>
    </div>
  </div>`;
}


/* ----------------------------------------------------------------
   Serveur HTTP
---------------------------------------------------------------- */
const server = http.createServer(async (req, res) => {
  const url    = req.url.split('?')[0];
  const method = req.method;

  // Auth sur toutes les routes /admin
  if (!requireAuth(req, res)) return;

  // Routes
  if (method === 'GET' && url === '/admin') {
    const store = loadEvents();
    return html(res, adminPageHtml(store));
  }

  if (method === 'GET' && url === '/admin/events') {
    return json(res, loadEvents());
  }

  if (method === 'POST' && url.startsWith('/admin/events/') && url.endsWith('/validate')) {
    const id    = url.split('/')[3];
    const store = loadEvents();
    const evt   = store.events.find(e => e.id === id);
    if (evt) { evt.validated = true; saveEvents(store); }
    return json(res, { ok: true });
  }

  if (method === 'POST' && url.startsWith('/admin/events/') && url.endsWith('/reject')) {
    const id    = url.split('/')[3];
    const store = loadEvents();
    store.events = store.events.filter(e => e.id !== id);
    saveEvents(store);
    return json(res, { ok: true });
  }

  if (method === 'POST' && url === '/admin/events/add') {
    const body  = await bodyParser(req);
    const store = loadEvents();
    body.id         = makeId();
    body.createdAt  = new Date().toISOString();
    body.validated  = body.validated ?? true;
    store.events.push(body);
    saveEvents(store);
    return json(res, { ok: true, id: body.id });
  }

  if (method === 'POST' && url === '/admin/events/add-batch') {
    const body  = await bodyParser(req);
    const store = loadEvents();
    const existing = new Set(store.events.map(e => e.id));
    let added = 0;
    for (const evt of (body.events || [])) {
      if (!existing.has(evt.id)) {
        store.events.push(evt);
        added++;
      }
    }
    saveEvents(store);
    return json(res, { ok: true, added });
  }

  if (method === 'POST' && url === '/admin/ocr') {
    // Ici on recevrait un multipart/form-data — en production, utiliser multer
    // Pour simplifier, on retourne une instruction claire
    return json(res, {
      message: 'Pour l\'OCR via interface web, utilisez la route /admin/ocr avec multer.',
      hint:    'En ligne de commande: node scraper.js --image chemin/image.jpg',
    });
  }

  if (method === 'POST' && url.startsWith('/admin/scrape')) {
    const mode = req.url.includes('text-only') ? '--text-only' :
                 req.url.includes('ocr-only')  ? '--ocr-only'  : '';

    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.write(`Lancement: node scraper.js ${mode}\n`);

    const child = execFile('node', [SCRAPER_FILE, mode].filter(Boolean));
    child.stdout.on('data', d => res.write(d));
    child.stderr.on('data', d => res.write('[ERR] ' + d));
    child.on('close', code => {
      res.write(`\nTerminé (code: ${code})\n`);
      res.end();
    });
    return;
  }

  // API publique — events validés pour le site
  if (method === 'GET' && url === '/api/events') {
    const store  = loadEvents();
    const events = store.events.filter(e => e.validated);
    res.writeHead(200, {
      'Content-Type':                'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control':               'public, max-age=3600',
    });
    return res.end(JSON.stringify({ events, lastUpdated: store.lastUpdated }));
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`Admin panel: http://localhost:${PORT}/admin`);
  console.log(`API events:  http://localhost:${PORT}/api/events`);
  console.log(`Mot de passe: défini dans .env (ADMIN_PASSWORD)`);
});
