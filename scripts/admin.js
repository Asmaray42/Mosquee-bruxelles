/**
 * admin.js — Panel d'administration
 * Grande Mosquée de Bruxelles
 *
 * Fonctionnalités :
 *   - Ajouter des événements manuellement
 *   - Valider / supprimer des événements
 *   - API publique /api/events pour le site
 *
 * Usage : node scripts/admin.js
 * Port  : 3001 (configurable via ADMIN_PORT dans .env)
 * Accès : http://localhost:3001/admin
 */

'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const PORT       = process.env.ADMIN_PORT || 3001;
const ADMIN_PASS = process.env.ADMIN_PASSWORD || 'mosquee2025';
const EVENTS_FILE = path.join(__dirname, '../data/events.json');

/* ----------------------------------------------------------------
   Helpers
---------------------------------------------------------------- */
function loadEvents() {
  try {
    if (fs.existsSync(EVENTS_FILE))
      return JSON.parse(fs.readFileSync(EVENTS_FILE, 'utf8'));
  } catch {}
  return { lastUpdated: null, events: [] };
}

function saveEvents(store) {
  store.lastUpdated = new Date().toISOString();
  fs.mkdirSync(path.dirname(EVENTS_FILE), { recursive: true });
  fs.writeFileSync(EVENTS_FILE, JSON.stringify(store, null, 2));
}

function json(res, data, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data));
}

function html(res, content) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(content);
}

function checkAuth(req) {
  const auth = req.headers['authorization'] || '';
  const decoded = Buffer.from(auth.replace('Basic ', ''), 'base64').toString();
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
  return new Promise(resolve => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve({}); } });
  });
}

function makeId() {
  return 'evt_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/* ----------------------------------------------------------------
   Interface HTML
---------------------------------------------------------------- */
function adminPage(store) {
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
  header h1{font-size:1rem;letter-spacing:.05em}
  header small{opacity:.7;font-size:.8rem}
  .container{max-width:1100px;margin:0 auto;padding:1.5rem}
  h2{font-size:.9rem;text-transform:uppercase;letter-spacing:.06em;color:var(--vert);margin-bottom:1rem;border-bottom:2px solid var(--or);padding-bottom:.5rem}
  .tabs{display:flex;gap:.5rem;margin-bottom:1.5rem}
  .tab{padding:.5rem 1.2rem;border:1px solid #ccc;border-radius:4px;background:#fff;cursor:pointer;font-size:.85rem;transition:all .2s}
  .tab.active,.tab:hover{background:var(--vert);color:#fff;border-color:var(--vert)}
  .panel{display:none}.panel.active{display:block}
  .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;margin-bottom:1.5rem}
  .stat{background:#fff;border:1px solid #e0d8c0;border-radius:8px;padding:1rem;text-align:center}
  .stat-num{font-size:2rem;font-weight:700;color:var(--vert)}
  .stat-label{font-size:.78rem;color:#888;text-transform:uppercase;letter-spacing:.05em}
  .card{background:#fff;border:1px solid #e0d8c0;border-radius:8px;padding:1rem;margin-bottom:.75rem;display:grid;grid-template-columns:1fr auto;gap:1rem;align-items:start}
  .card:hover{border-color:var(--or)}
  .card-title{font-weight:600;margin-bottom:.3rem}
  .card-meta{font-size:.8rem;color:#666;display:flex;flex-wrap:wrap;gap:.5rem}
  .badge{display:inline-block;padding:2px 8px;border-radius:12px;font-size:.72rem;font-weight:600}
  .badge-conference{background:#EEEDFE;color:#3C3489}
  .badge-ramadan{background:#fff3cd;color:#8a6a00}
  .badge-cours{background:#E1F5EE;color:#085041}
  .badge-jumuah{background:#E6F1FB;color:#0C447C}
  .badge-annonce{background:#F1EFE8;color:#444441}
  .card-actions{display:flex;flex-direction:column;gap:.4rem}
  .btn{padding:.4rem .9rem;border:none;border-radius:4px;cursor:pointer;font-size:.82rem;font-weight:600;transition:opacity .2s}
  .btn:hover{opacity:.85}
  .btn-validate{background:var(--vert);color:#fff}
  .btn-reject{background:var(--rouge);color:#fff}
  .btn-submit{background:var(--vert);color:#fff;padding:.6rem 1.4rem;font-size:.9rem;width:100%;margin-top:1rem}
  .form-grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem}
  .form-group{display:flex;flex-direction:column;gap:.3rem}
  label{font-size:.82rem;font-weight:600;color:var(--vert)}
  input,select,textarea{padding:.5rem;border:1px solid #ccc;border-radius:4px;font-size:.9rem;font-family:inherit;width:100%}
  textarea{resize:vertical;min-height:80px}
  .empty{text-align:center;padding:3rem;color:#aaa;font-style:italic}
  .form-wrap{background:#fff;border:1px solid #e0d8c0;border-radius:8px;padding:1.5rem}
  @media(max-width:600px){.form-grid{grid-template-columns:1fr}.stats{grid-template-columns:1fr 1fr}}
</style>
</head>
<body>
<header>
  <h1>🕌 Admin — Grande Mosquée de Bruxelles</h1>
  <small>Dernière MàJ : ${store.lastUpdated ? new Date(store.lastUpdated).toLocaleString('fr-BE') : 'jamais'} — ${store.events.length} événements</small>
</header>
<div class="container">

  <div class="stats">
    <div class="stat"><div class="stat-num">${store.events.length}</div><div class="stat-label">Total</div></div>
    <div class="stat"><div class="stat-num">${pending.length}</div><div class="stat-label">En attente</div></div>
    <div class="stat"><div class="stat-num">${validated.length}</div><div class="stat-label">Validés</div></div>
  </div>

  <div class="tabs">
    <button class="tab active" onclick="showTab('add',this)">+ Ajouter</button>
    <button class="tab" onclick="showTab('pending',this)">En attente (${pending.length})</button>
    <button class="tab" onclick="showTab('validated',this)">Validés (${validated.length})</button>
  </div>

  <!-- AJOUTER -->
  <div class="panel active" id="tab-add">
    <h2>Ajouter un événement</h2>
    <div class="form-wrap">
      <div class="form-grid">
        <div class="form-group">
          <label>Type</label>
          <select id="new-type">
            <option value="cours">Cours</option>
            <option value="conference">Conférence</option>
            <option value="ramadan">Programme Ramadan</option>
            <option value="jumuah">Jumu'a</option>
            <option value="annonce">Annonce</option>
          </select>
        </div>
        <div class="form-group">
          <label>Jour / Date (ex: Lundi ou 2025-03-15)</label>
          <input type="text" id="new-day" placeholder="ex: Dimanche ou 2025-04-01"/>
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
      <div class="form-group" style="margin-top:1rem">
        <label>Notes</label>
        <textarea id="new-notes" placeholder="Informations complémentaires..."></textarea>
      </div>
      <button class="btn btn-submit" onclick="addEvent()">✓ Ajouter l'événement</button>
    </div>
  </div>

  <!-- EN ATTENTE -->
  <div class="panel" id="tab-pending">
    <h2>En attente de validation</h2>
    ${pending.length === 0 ? '<p class="empty">Aucun événement en attente</p>' : pending.map(e => eventCard(e, true)).join('')}
  </div>

  <!-- VALIDÉS -->
  <div class="panel" id="tab-validated">
    <h2>Événements validés</h2>
    ${validated.length === 0 ? '<p class="empty">Aucun événement validé</p>' : validated.map(e => eventCard(e, false)).join('')}
  </div>

</div>
<script>
function showTab(name, el) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  el.classList.add('active');
}
async function addEvent() {
  const day = document.getElementById('new-day').value.trim();
  const body = {
    type:    document.getElementById('new-type').value,
    day:     { fr: day, ar: '', nl: '' },
    title:   { fr: document.getElementById('new-title-fr').value, ar: document.getElementById('new-title-ar').value, nl: document.getElementById('new-title-nl').value },
    time:    { fr: document.getElementById('new-time').value },
    speaker: document.getElementById('new-speaker').value,
    period:  document.getElementById('new-period').value,
    notes:   { fr: [document.getElementById('new-notes').value].filter(Boolean) },
    source:  'manual',
    validated: true,
  };
  // Si le jour ressemble à une date, l'ajouter aussi dans date
  if (day.match(/\\d{4}-\\d{2}-\\d{2}/)) body.date = day;
  const r = await fetch('/admin/events/add', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
  if (r.ok) { alert('Événement ajouté !'); location.reload(); }
  else alert('Erreur lors de l\\'ajout');
}
async function validateEvent(id) {
  const r = await fetch('/admin/events/' + id + '/validate', { method: 'POST' });
  if (r.ok) location.reload();
}
async function rejectEvent(id) {
  if (!confirm('Supprimer cet événement ?')) return;
  const r = await fetch('/admin/events/' + id + '/reject', { method: 'POST' });
  if (r.ok) document.getElementById('card-' + id)?.remove();
}
</script>
</body>
</html>`;
}

function eventCard(e, showValidate) {
  const title = (e.title?.fr || e.raw || 'Sans titre').slice(0, 80);
  const type  = e.type || 'annonce';
  return `
  <div class="card" id="card-${e.id}">
    <div>
      <div class="card-title">${title}</div>
      <div class="card-meta">
        <span class="badge badge-${type}">${type}</span>
        ${e.source === 'manual' ? '<span>Manuel</span>' : '<span>OCR</span>'}
        ${e.speaker ? `<span>👤 ${e.speaker}</span>` : ''}
        ${e.day?.fr ? `<span>📅 ${e.day.fr}</span>` : ''}
        ${e.time?.fr ? `<span>⏰ ${e.time.fr}</span>` : ''}
        ${e.period  ? `<span>🌙 ${e.period}</span>` : ''}
      </div>
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

  // API publique — pas d'auth requise
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

  // Routes admin — auth requise
  if (!requireAuth(req, res)) return;

  if (method === 'GET' && (url === '/admin' || url === '/admin/')) {
    return html(res, adminPage(loadEvents()));
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
    body.id        = makeId();
    body.createdAt = new Date().toISOString();
    body.validated = body.validated ?? true;
    store.events.push(body);
    saveEvents(store);
    return json(res, { ok: true, id: body.id });
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`[GMB Admin] http://localhost:${PORT}/admin`);
  console.log(`[GMB API]   http://localhost:${PORT}/api/events`);
});
