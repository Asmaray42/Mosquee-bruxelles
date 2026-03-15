# Système de collecte d'agenda — Grande Mosquée de Bruxelles

## Architecture

```
scripts/
├── scraper.js   → Collecte automatique (Mawaqit + OCR images)
├── admin.js     → Interface de validation + API publique
data/
├── events.json  → Base de données des événements (fichier plat)
├── images/      → Images d'annonces téléchargées
└── scraper.log  → Logs du scraper
```

## Installation sur le VPS

```bash
# 1. Installer les dépendances
npm install

# 2. Installer Chromium (pour Puppeteer)
sudo apt install chromium-browser

# 3. Copier et configurer .env
cp .env.example .env
nano .env   # Remplir ANTHROPIC_API_KEY et ADMIN_PASSWORD

# 4. Créer les dossiers de données
mkdir -p data/images
```

## Utilisation

### Scraper complet (texte + images)
```bash
node scripts/scraper.js
# ou
npm run scrape
```

### OCR d'une image locale (ex: image Mawaqit téléchargée manuellement)
```bash
node scripts/scraper.js --image /chemin/vers/programme-ramadan.jpg
# ou
npm run ocr -- /chemin/vers/programme-ramadan.jpg
```

### Admin panel (validation + ajout manuel)
```bash
node scripts/admin.js
# Accès : http://localhost:3001/admin
# Mot de passe : celui défini dans .env
```

### API publique (pour le site)
```
GET http://localhost:3001/api/events
→ Retourne les événements validés en JSON
```

## Cron job — automatisation toutes les 6h

```bash
# Éditer la crontab
crontab -e

# Ajouter cette ligne :
0 */6 * * * /usr/bin/node /var/www/mosquee/scripts/scraper.js >> /var/log/gmb-scraper.log 2>&1
```

## Workflow recommandé

1. **Cron** lance `scraper.js` toutes les 6h
2. Nouveaux événements → `events.json` avec `validated: false`
3. Admin ouvre `http://votre-vps:3001/admin`
4. Valide ou rejette chaque événement extrait
5. Le site charge `/api/events` → affiche les événements validés

## Comment traiter une image Mawaqit manuellement

Quand tu vois une image de tableau sur la page Mawaqit ou Facebook :

1. Télécharge l'image
2. Lance : `node scripts/scraper.js --image programme-ramadan.jpg`
3. Claude Vision extrait le tableau structuré en JSON
4. Les événements apparaissent dans l'admin panel pour validation
5. Valide → ils s'affichent sur le site

## Format events.json

```json
{
  "lastUpdated": "2025-03-14T12:00:00.000Z",
  "sources": ["mawaqit-text", "mawaqit-image-ocr", "manual"],
  "events": [
    {
      "id": "evt_abc123",
      "source": "mawaqit-image-ocr",
      "type": "cours",
      "validated": true,
      "title": { "fr": "Cours après Asr", "ar": "درس بعد العصر", "nl": "Les na Asr" },
      "speaker": "Cheikh Ibrahim Bouhna",
      "day":  { "fr": "Dimanche", "ar": "الأحد", "nl": "Zondag" },
      "time": { "fr": "après Asr", "ar": "بعد العصر" },
      "period": "Ramadan 2025",
      "createdAt": "2025-03-14T12:00:00.000Z"
    }
  ]
}
```
