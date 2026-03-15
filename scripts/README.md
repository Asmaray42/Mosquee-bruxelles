# Grande Mosquée de Bruxelles — Site Web

Site officiel de la Grande Mosquée de Bruxelles, Parc du Cinquantenaire 29, 1000 Bruxelles.

## Stack technique

- **Frontend** : HTML / CSS / JS vanilla (pas de framework)
- **Langues** : Français, Arabe (RTL), Néerlandais
- **Carte** : OpenStreetMap via Leaflet.js (gratuit, sans clé API)
- **Horaires de prière** : Mawaqit (iframe officiel) + API Aladhan (calcul astronomique)
- **Backend** : Node.js (admin panel uniquement)
- **Serveur** : Nginx + VPS Ubuntu

## Structure

```
mosquee-bruxelles/
├── index.html          → Page principale
├── histoire.html       → Page histoire de la mosquée
├── css/
│   ├── style.css       → Styles principaux (inline dans index.html)
│   ├── agenda.css      → Calendrier des événements
│   ├── contact.css     → Section contact + carte
│   └── prayers.css     → Section horaires de prière
├── js/
│   ├── i18n.js         → Système de traduction FR/AR/NL
│   ├── main.js         → Navigation, hamburger menu
│   ├── prayers.js      → Horaires de prière (Mawaqit + Aladhan)
│   ├── agenda.js       → Calendrier des événements
│   └── contact.js      → Carte OpenStreetMap + itinéraire
├── scripts/
│   ├── admin.js        → Panel d'administration (port 3001)
│   └── README.md       → Ce fichier
├── data/
│   └── events.json     → Base de données des événements
└── images/
    ├── vue-aerienne.webp
    ├── minaret.webp
    └── interieur.webp
```

## Déploiement VPS

```bash
# Cloner le repo
git clone https://github.com/Asmaray42/Mosquee-bruxelles.git /var/www/mosquee
cd /var/www/mosquee
npm install

# Configurer l'environnement
cp .env.example .env
nano .env  # Remplir ADMIN_PASSWORD

# Lancer l'admin panel avec PM2
pm2 start scripts/admin.js --name "gmb-admin"
pm2 save && pm2 startup
```

## Mise à jour du site

```bash
# Sur le PC
git add . && git commit -m "Description" && git push

# Sur le VPS
cd /var/www/mosquee && git pull && pm2 restart gmb-admin
```

## Admin panel

Accessible sur `http://TON_IP:3001/admin`

- **Ajouter** des événements manuellement (conférences, cours, Ramadan...)
- **Valider** ou **supprimer** des événements
- Les événements validés apparaissent automatiquement dans le calendrier du site

## Gestion des événements

1. Aller sur `http://TON_IP:3001/admin`
2. Onglet **Ajouter** → remplir le formulaire → **Ajouter l'événement**
3. L'événement apparaît immédiatement dans le calendrier du site

## Variables d'environnement (.env)

```env
ADMIN_PASSWORD=mot-de-passe-fort
ADMIN_PORT=3001
```

## Sources et crédits

- Photos : © Grande Mosquée de Bruxelles
- Carte : © OpenStreetMap contributors (CC BY-SA)
- Horaires : Mawaqit (mawaqit.net) + Aladhan API
- Fonts : Google Fonts (Amiri, Cinzel, Noto Sans Arabic)
