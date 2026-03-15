/**
 * scraper.js — Collecte automatique de l'agenda de la Grande Mosquée de Bruxelles
 *
 * Ce script fait DEUX choses :
 *
 * 1. SCRAPING TEXTE  → lit les annonces textuelles sur mawaqit.net/fr/m/gmb
 *    via Puppeteer (navigateur headless) et extrait les blocs d'annonces.
 *
 * 2. OCR IMAGES      → détecte les images d'annonces (tableaux de cours, programmes)
 *    et les envoie à l'API Claude Vision pour en extraire les données structurées.
 *    Claude comprend le FR + AR + NL et retourne du JSON propre.
 *
 * Résultat : un fichier data/events.json mis à jour automatiquement.
 *
 * Usage :
 *   node scraper.js              → scrape tout
 *   node scraper.js --text-only  → texte uniquement
 *   node scraper.js --ocr-only   → images uniquement
 *   node scraper.js --image path/to/image.jpg → OCR d'une image locale
 *
 * Cron (VPS) — toutes les 6h :
 *   0 */6 * * * /usr/bin/node /var/www/mosquee/scripts/scraper.js >> /var/log/scraper.log 2>&1
 *
 * Dépendances :
 *   npm install puppeteer-core @anthropic-ai/sdk sharp dotenv
 */

'use strict';

const fs        = require('fs');
const path      = require('path');
const https     = require('https');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

/* ================================================================
   CONFIG
================================================================ */
const CONFIG = {
  mawaqitUrl:   'https://mawaqit.net/fr/m/gmb',
  outputFile:   path.join(__dirname, '../data/events.json'),
  logFile:      path.join(__dirname, '../data/scraper.log'),
  anthropicKey: process.env.ANTHROPIC_API_KEY,

  // Puppeteer — chemin vers Chrome/Chromium sur le VPS
  // Sur Ubuntu : apt install chromium-browser → /usr/bin/chromium-browser
  chromiumPath: process.env.CHROMIUM_PATH || '/usr/bin/chromium-browser',
};

/* ================================================================
   UTILITAIRES
================================================================ */
function log(msg, level = 'INFO') {
  const line = `[${new Date().toISOString()}] [${level}] ${msg}`;
  console.log(line);
  try {
    fs.appendFileSync(CONFIG.logFile, line + '\n');
  } catch {}
}

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/** Charge le fichier events.json existant ou retourne une structure vide */
function loadExistingEvents() {
  try {
    if (fs.existsSync(CONFIG.outputFile)) {
      return JSON.parse(fs.readFileSync(CONFIG.outputFile, 'utf8'));
    }
  } catch (e) {
    log(`Impossible de lire events.json existant: ${e.message}`, 'WARN');
  }
  return { lastUpdated: null, sources: [], events: [] };
}

/** Sauvegarde le fichier events.json */
function saveEvents(data) {
  ensureDir(CONFIG.outputFile);
  data.lastUpdated = new Date().toISOString();
  fs.writeFileSync(CONFIG.outputFile, JSON.stringify(data, null, 2), 'utf8');
  log(`events.json sauvegardé : ${data.events.length} événements`);
}

/** Génère un ID unique basé sur le contenu */
function makeId(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return 'evt_' + Math.abs(hash).toString(36);
}

/** Télécharge une image depuis une URL et retourne un Buffer */
function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    https.get(url, (res) => {
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}


/* ================================================================
   MODULE 1 : SCRAPING TEXTE MAWAQIT via Puppeteer
   Lit les blocs d'annonces textuelles sur la page Mawaqit de la GMB
================================================================ */
async function scrapeMawaqitText() {
  log('Démarrage du scraping texte Mawaqit...');

  // Import dynamique de puppeteer-core
  let puppeteer;
  try {
    puppeteer = require('puppeteer-core');
  } catch (e) {
    log('puppeteer-core non installé. Exécute : npm install puppeteer-core', 'ERROR');
    return [];
  }

  const browser = await puppeteer.launch({
    executablePath: CONFIG.chromiumPath,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });

  const page = await browser.newPage();

  try {
    await page.setUserAgent(
      'Mozilla/5.0 (compatible; GrandeMosqueeBruxelles-Bot/1.0; +https://grande-mosquee.be)'
    );

    log(`Chargement de ${CONFIG.mawaqitUrl}...`);
    await page.goto(CONFIG.mawaqitUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    // Attendre que le contenu dynamique soit chargé
    await page.waitForTimeout(3000);

    // Extraire les blocs d'annonces (messages affichés dans la mosquée)
    // Mawaqit affiche ces blocs dans plusieurs sélecteurs potentiels
    const rawData = await page.evaluate(() => {
      const results = {
        announcements: [],
        images: [],
      };

      // Sélecteurs des blocs d'annonces Mawaqit (basé sur l'analyse du HTML)
      const announcementSelectors = [
        '.mosque-messages li',
        '.messages-list li',
        '.slider-content li',
        '[class*="message"] li',
        '[class*="announce"] li',
        '.mosque-info li',
      ];

      for (const sel of announcementSelectors) {
        const items = document.querySelectorAll(sel);
        items.forEach(el => {
          const text = el.textContent?.trim();
          if (text && text.length > 10) {
            results.announcements.push(text);
          }
        });
      }

      // Images d'annonces affichées sur la page
      const imgSelectors = [
        '.mosque-messages img',
        '.messages-list img',
        '[class*="announce"] img',
        '[class*="slider"] img',
      ];

      for (const sel of imgSelectors) {
        const imgs = document.querySelectorAll(sel);
        imgs.forEach(img => {
          const src = img.src || img.getAttribute('data-src');
          if (src && !src.includes('cupola') && !src.includes('logo') && !src.includes('icon')) {
            results.images.push(src);
          }
        });
      }

      return results;
    });

    log(`Trouvé : ${rawData.announcements.length} annonces texte, ${rawData.images.length} images`);

    // Convertir les annonces texte en événements structurés
    const events = rawData.announcements
      .filter(text => text.length > 15) // Filtrer les textes trop courts
      .map(text => ({
        id:         makeId(text),
        source:     'mawaqit-text',
        type:       detectEventType(text),
        raw:        text,
        title:      extractTitle(text),
        date:       extractDate(text),
        time:       extractTime(text),
        lang:       detectLanguage(text),
        createdAt:  new Date().toISOString(),
        validated:  false, // Doit être validé via l'admin panel
      }));

    // Retourner aussi les URLs d'images pour traitement OCR
    return { events, imageUrls: rawData.images };

  } catch (err) {
    log(`Erreur scraping texte: ${err.message}`, 'ERROR');
    return { events: [], imageUrls: [] };
  } finally {
    await browser.close();
  }
}


/* ================================================================
   MODULE 2 : OCR INTELLIGENT via Claude Vision (API Anthropic)
   Envoie une image à Claude qui extrait les données structurées
   en comprenant FR + AR + NL et les tableaux complexes
================================================================ */
async function extractEventsFromImage(imageInput) {
  /**
   * imageInput peut être :
   *   - un Buffer (image déjà en mémoire)
   *   - un string = chemin vers fichier local
   *   - un string = URL https://...
   */

  if (!CONFIG.anthropicKey) {
    log('ANTHROPIC_API_KEY manquant dans .env', 'ERROR');
    return [];
  }

  log(`OCR image: ${typeof imageInput === 'string' ? imageInput : 'Buffer'}`);

  // Charger l'image en base64
  let imageBase64;
  let mediaType = 'image/jpeg';

  try {
    let buffer;

    if (Buffer.isBuffer(imageInput)) {
      buffer = imageInput;
    } else if (imageInput.startsWith('http')) {
      buffer = await downloadImage(imageInput);
    } else {
      buffer = fs.readFileSync(imageInput);
      const ext = path.extname(imageInput).toLowerCase();
      if (ext === '.png') mediaType = 'image/png';
      else if (ext === '.webp') mediaType = 'image/webp';
    }

    imageBase64 = buffer.toString('base64');
  } catch (err) {
    log(`Impossible de charger l'image: ${err.message}`, 'ERROR');
    return [];
  }

  // Appel à l'API Claude Vision
  const prompt = `Tu es un assistant qui extrait des données structurées depuis des images d'annonces de mosquée.

Cette image vient de la Grande Mosquée de Bruxelles. Elle contient probablement :
- Un tableau de cours ou programme (Ramadan, cours hebdomadaires, conférences)
- Du texte en français, arabe, et/ou néerlandais
- Des informations sur des horaires, des intervenants, des jours de la semaine

Ta tâche : extraire TOUTES les informations et les retourner en JSON UNIQUEMENT, sans aucun texte avant ou après.

Format JSON attendu :
{
  "type": "programme_ramadan" | "cours_regulier" | "conference" | "annonce" | "autre",
  "titre": "titre principal en français",
  "titre_ar": "titre en arabe si présent",
  "titre_nl": "titre en néerlandais si présent",
  "periode": "ex: Ramadan 2025 ou null",
  "events": [
    {
      "jour": "Dimanche" | "Lundi" | ... | "récurrent",
      "jour_ar": "الأحد" etc,
      "jour_nl": "Zondag" etc,
      "horaire": "après Asr" | "avant Icha" | "14h30" | etc,
      "horaire_ar": "بعد العصر" etc si présent,
      "intervenant": "Nom du cheikh ou professeur",
      "sujet": "description du cours ou de l'événement",
      "sujet_ar": "description en arabe si présent",
      "sujet_nl": "description en néerlandais si présent"
    }
  ],
  "notes": ["note 1", "note 2"],
  "notes_ar": ["ملاحظة 1"],
  "notes_nl": ["opmerking 1"]
}

Si l'image n'est pas un programme/agenda, retourne:
{ "type": "non_agenda", "contenu_brut": "description du contenu" }`;

  try {
    // Appel direct à l'API REST Anthropic (sans SDK pour éviter une dépendance)
    const requestBody = JSON.stringify({
      model:      'claude-opus-4-5',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type:       'base64',
                media_type: mediaType,
                data:       imageBase64,
              },
            },
            {
              type: 'text',
              text: prompt,
            },
          ],
        },
      ],
    });

    const result = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.anthropic.com',
        path:     '/v1/messages',
        method:   'POST',
        headers: {
          'Content-Type':      'application/json',
          'x-api-key':         CONFIG.anthropicKey,
          'anthropic-version': '2023-06-01',
          'Content-Length':    Buffer.byteLength(requestBody),
        },
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error('Réponse API invalide: ' + data.slice(0, 200)));
          }
        });
      });

      req.on('error', reject);
      req.write(requestBody);
      req.end();
    });

    if (result.error) {
      log(`Erreur API Claude: ${result.error.message}`, 'ERROR');
      return [];
    }

    const responseText = result.content?.[0]?.text || '';
    log(`Réponse Claude reçue (${responseText.length} chars)`);

    // Parser le JSON retourné par Claude
    // Claude peut parfois ajouter des backticks malgré la consigne
    const cleanJson = responseText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    const parsed = JSON.parse(cleanJson);

    if (parsed.type === 'non_agenda') {
      log(`Image non-agenda: ${parsed.contenu_brut}`);
      return [];
    }

    // Convertir la structure extraite en événements normalisés
    return normalizeExtractedEvents(parsed);

  } catch (err) {
    log(`Erreur OCR/Claude: ${err.message}`, 'ERROR');
    return [];
  }
}


/* ================================================================
   NORMALISATION
   Convertit les données brutes extraites en format events.json unifié
================================================================ */
function normalizeExtractedEvents(parsed) {
  const events = [];

  if (!parsed.events || !Array.isArray(parsed.events)) return events;

  for (const item of parsed.events) {
    const event = {
      id:        makeId(JSON.stringify(item)),
      source:    'mawaqit-image-ocr',
      type:      mapEventType(parsed.type),
      validated: false,

      // Titre de l'événement (dérivé du sujet ou de l'intervenant)
      title: {
        fr: item.sujet || item.intervenant || parsed.titre || '',
        ar: item.sujet_ar || item.intervenant || parsed.titre_ar || '',
        nl: item.sujet_nl || item.intervenant || parsed.titre_nl || '',
      },

      // Intervenant
      speaker: item.intervenant || null,

      // Jour et horaire
      day: {
        fr: item.jour || null,
        ar: item.jour_ar || null,
        nl: item.jour_nl || null,
      },
      time: {
        fr: item.horaire || null,
        ar: item.horaire_ar || null,
      },

      // Période (Ramadan, etc.)
      period:    parsed.periode || null,

      // Programme parent (titre du tableau d'origine)
      programme: {
        fr: parsed.titre || null,
        ar: parsed.titre_ar || null,
        nl: parsed.titre_nl || null,
      },

      // Notes associées
      notes: {
        fr: parsed.notes || [],
        ar: parsed.notes_ar || [],
        nl: parsed.notes_nl || [],
      },

      createdAt:  new Date().toISOString(),
      rawParsed:  parsed, // Conserver les données brutes pour débogage
    };

    events.push(event);
  }

  return events;
}

function mapEventType(rawType) {
  const map = {
    programme_ramadan: 'ramadan',
    cours_regulier:    'cours',
    conference:        'conference',
    annonce:           'annonce',
  };
  return map[rawType] || 'autre';
}


/* ================================================================
   DÉTECTEURS SIMPLES pour le scraping texte
================================================================ */
function detectEventType(text) {
  const lower = text.toLowerCase();
  if (lower.includes('ramadan') || lower.includes('tarawih') || lower.includes('iftar')) return 'ramadan';
  if (lower.includes('cours') || lower.includes('درس') || lower.includes('les')) return 'cours';
  if (lower.includes('conférence') || lower.includes('confer')) return 'conference';
  if (lower.includes('jumu') || lower.includes('vendredi') || lower.includes('خطبة')) return 'jumuah';
  if (lower.includes('tahajjud') || lower.includes('tahjud')) return 'tahajjud';
  return 'annonce';
}

function detectLanguage(text) {
  // Détection très simple basée sur les caractères
  if (/[\u0600-\u06FF]/.test(text)) return 'ar';
  if (/\b(de|het|een|van|voor|ook)\b/i.test(text)) return 'nl';
  return 'fr';
}

function extractTitle(text) {
  // Prend la première ligne non vide comme titre
  return text.split('\n').find(l => l.trim().length > 3)?.trim() || text.slice(0, 60);
}

function extractDate(text) {
  // Cherche des patterns de date
  const patterns = [
    /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/,
    /(\d{1,2})\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[0];
  }
  return null;
}

function extractTime(text) {
  const m = text.match(/\b(\d{1,2})[h:](\d{2})?\b/i);
  return m ? m[0] : null;
}


/* ================================================================
   DÉDUPLICATION
   Évite d'ajouter des événements déjà présents dans events.json
================================================================ */
function mergeEvents(existing, newEvents) {
  const existingIds = new Set(existing.map(e => e.id));
  const added = [];

  for (const evt of newEvents) {
    if (!existingIds.has(evt.id)) {
      existing.push(evt);
      added.push(evt.id);
    }
  }

  if (added.length > 0) {
    log(`${added.length} nouveaux événements ajoutés`);
  } else {
    log('Aucun nouvel événement (déjà tous présents)');
  }

  return existing;
}


/* ================================================================
   POINT D'ENTRÉE PRINCIPAL
================================================================ */
async function main() {
  const args = process.argv.slice(2);
  const textOnly  = args.includes('--text-only');
  const ocrOnly   = args.includes('--ocr-only');
  const imageArg  = args.includes('--image') ? args[args.indexOf('--image') + 1] : null;

  log('=== Scraper Grande Mosquée de Bruxelles ===');

  const store = loadExistingEvents();
  let allNewEvents = [];

  // Cas spécial : OCR d'une image locale fournie en argument
  if (imageArg) {
    log(`Mode OCR image locale: ${imageArg}`);
    const events = await extractEventsFromImage(imageArg);
    log(`${events.length} événements extraits de l'image`);
    console.log(JSON.stringify(events, null, 2)); // Affiche le résultat dans le terminal
    allNewEvents = events;
    store.events = mergeEvents(store.events || [], allNewEvents);
    store.sources = [...new Set([...(store.sources || []), 'local-image'])];
    saveEvents(store);
    return;
  }

  // Mode scraping complet ou texte seul
  if (!ocrOnly) {
    const { events: textEvents, imageUrls } = await scrapeMawaqitText();
    allNewEvents.push(...textEvents);

    // Traiter les images trouvées sur Mawaqit (si pas --text-only)
    if (!textOnly && imageUrls.length > 0) {
      log(`Traitement OCR de ${imageUrls.length} images depuis Mawaqit...`);
      for (const url of imageUrls) {
        const imgEvents = await extractEventsFromImage(url);
        allNewEvents.push(...imgEvents);
      }
    }
  }

  // Mode OCR seul (relit les images déjà connues)
  if (ocrOnly) {
    log('Mode OCR only — relecture des images en cache...');
    // Ici on pourrait relire un dossier d'images locales
    const imgDir = path.join(__dirname, '../data/images');
    if (fs.existsSync(imgDir)) {
      const imgs = fs.readdirSync(imgDir).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
      for (const img of imgs) {
        const events = await extractEventsFromImage(path.join(imgDir, img));
        allNewEvents.push(...events);
      }
    }
  }

  // Fusionner et sauvegarder
  store.events  = mergeEvents(store.events || [], allNewEvents);
  store.sources = [...new Set([...(store.sources || []), 'mawaqit-text', 'mawaqit-image-ocr'])];
  saveEvents(store);

  log(`=== Terminé. Total: ${store.events.length} événements dans events.json ===`);
}

main().catch(err => {
  log(`ERREUR FATALE: ${err.message}`, 'ERROR');
  process.exit(1);
});
