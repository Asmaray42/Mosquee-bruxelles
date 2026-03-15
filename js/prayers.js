/**
 * prayers.js — Horaires de prière
 * Grande Mosquée de Bruxelles
 *
 * Stratégie double :
 * 1. PRIMAIRE  : Iframe officiel Mawaqit (mawaqit.net/fr/w/gmb)
 *    → données 100% fidèles à ce que la mosquée a configuré
 *    → inclut Iqama, Jumu'a, Ramadan automatiquement
 *
 * 2. FALLBACK : API Aladhan (calcul astronomique)
 *    → si Mawaqit ne répond pas ou en cas d'erreur réseau
 *    → horaires calculés pour Bruxelles (50.8503°N, 4.3517°E)
 *    → méthode Muslim World League (standard en Belgique)
 */

'use strict';

/* ----------------------------------------------------------------
   CONFIG
---------------------------------------------------------------- */
const PRAYER_CONFIG = {
  mawaqitSlug:  'gmb',                               // slug de la GMB sur mawaqit.net
  mawaqitWidget: 'https://mawaqit.net/fr/w/gmb',     // URL widget officiel
  mawaqitPage:   'https://mawaqit.net/fr/m/gmb',     // page publique

  // Coordonnées GPS de la Grande Mosquée de Bruxelles
  latitude:  50.8426,
  longitude:  4.3940,
  timezone:  'Europe/Brussels',

  // Méthode de calcul Aladhan : 3 = Muslim World League
  aladhanMethod: 3,

  // Clé de cache localStorage
  cacheKey: 'gmb_prayers',
  cacheTTL: 60 * 60 * 1000, // 1 heure en ms
};

/* Noms des prières dans les 3 langues */
const PRAYER_NAMES = {
  fr: ['Fajr', 'Chourouk', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'],
  ar: ['الفجر', 'الشروق', 'الظهر', 'العصر', 'المغرب', 'العشاء'],
  nl: ['Fajr', 'Zonsopgang', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'],
};

/* Noms arabes — toujours affichés en sous-titre */
const PRAYER_ARABIC = ['الفجر', 'الشروق', 'الظهر', 'العصر', 'المغرب', 'العشاء'];

/* Icônes SVG pour chaque prière */
const PRAYER_ICONS = [
  /* Fajr — croissant + étoile */
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
   </svg>`,
  /* Chourouk — soleil levant */
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
    <path d="M3 20h18" stroke-linecap="round"/>
   </svg>`,
  /* Dhuhr — soleil haut */
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
   </svg>`,
  /* Asr — soleil à mi-descente */
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <circle cx="12" cy="14" r="4"/><path d="M12 2v4M4.93 6.93l1.41 1.41M2 14h2M20 14h2M17.66 6.93l-1.41 1.41"/>
    <path d="M3 20h18" stroke-linecap="round"/>
   </svg>`,
  /* Maghrib — soleil couchant */
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <path d="M17 12a5 5 0 1 1-10 0"/><path d="M3 12h18M12 3v3"/>
    <path d="M3 20h18" stroke-linecap="round"/>
   </svg>`,
  /* Isha — nuit étoilée */
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/><path d="M16 5l.5 1.5L18 7l-1.5.5L16 9l-.5-1.5L14 7l1.5-.5z"/>
   </svg>`,
];


/* ================================================================
   MODULE PRINCIPAL
================================================================ */
const PrayerTimes = {

  /**
   * Point d'entrée — appelé depuis main.js
   * Choisit automatiquement la méthode d'affichage
   */
  async init() {
    const container = document.getElementById('prayer-section');
    if (!container) return;

    // Toujours afficher le widget Mawaqit comme source principale
    // + les horaires Aladhan en parallèle comme backup/complément
    this.renderMawaqitSection(container);
    await this.loadAladhanTimes(container);
  },


  /* ----------------------------------------------------------------
     MÉTHODE 1 : Widget officiel Mawaqit (iframe)
     Avantages : données 100% fidèles à la mosquée,
                 inclut iqama, Jumu'a, Ramadan
  ---------------------------------------------------------------- */
  renderMawaqitSection(container) {
    const widgetWrap = container.querySelector('#mawaqit-widget-wrap');
    if (!widgetWrap) return;

    // On intègre l'iframe officiel de mawaqit.net/fr/w/gmb
    // L'iframe est responsive et s'adapte à la largeur du conteneur
    widgetWrap.innerHTML = `
      <div class="mawaqit-iframe-container" role="region" aria-label="Horaires officiels Mawaqit">
        <iframe
          src="${PRAYER_CONFIG.mawaqitWidget}"
          title="Horaires de prière — Grande Mosquée de Bruxelles"
          loading="lazy"
          allow="autoplay"
          aria-label="Widget Mawaqit — horaires de prière officiels"
        ></iframe>
        <div class="mawaqit-source">
          <a href="${PRAYER_CONFIG.mawaqitPage}" target="_blank" rel="noopener">
            Voir sur Mawaqit ↗
          </a>
        </div>
      </div>
    `;
  },


  /* ----------------------------------------------------------------
     MÉTHODE 2 : API Aladhan (fallback / complément)
     Appel : https://api.aladhan.com/v1/timings
     Paramètres : coords Bruxelles + méthode Muslim World League
  ---------------------------------------------------------------- */
  async loadAladhanTimes(container) {
    const grid = container.querySelector('#aladhan-grid');
    if (!grid) return;

    // Vérifier le cache d'abord
    const cached = this.getCache();
    if (cached) {
      this.renderPrayerCards(grid, cached);
      return;
    }

    // Afficher un skeleton pendant le chargement
    grid.innerHTML = this.renderSkeleton();

    try {
      const today = new Date();
      const day   = today.getDate();
      const month = today.getMonth() + 1;
      const year  = today.getFullYear();

      const url = `https://api.aladhan.com/v1/timings/${day}-${month}-${year}`
        + `?latitude=${PRAYER_CONFIG.latitude}`
        + `&longitude=${PRAYER_CONFIG.longitude}`
        + `&method=${PRAYER_CONFIG.aladhanMethod}`
        + `&timezonestring=${PRAYER_CONFIG.timezone}`;

      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`Aladhan HTTP ${resp.status}`);

      const data = await resp.json();
      if (data.code !== 200) throw new Error('Aladhan: réponse invalide');

      const timings = data.data.timings;
      const prayers = [
        { key: 'Fajr',    time: timings.Fajr    },
        { key: 'Sunrise', time: timings.Sunrise  },
        { key: 'Dhuhr',   time: timings.Dhuhr    },
        { key: 'Asr',     time: timings.Asr      },
        { key: 'Maghrib', time: timings.Maghrib  },
        { key: 'Isha',    time: timings.Isha     },
      ];

      // Mise en cache
      this.setCache(prayers);

      this.renderPrayerCards(grid, prayers);

    } catch (err) {
      console.warn('Aladhan fallback échoué:', err);
      grid.innerHTML = `
        <p class="prayers-error" role="alert">
          Impossible de charger les horaires calculés.<br>
          <a href="${PRAYER_CONFIG.mawaqitPage}" target="_blank" rel="noopener">
            Consulter Mawaqit directement ↗
          </a>
        </p>
      `;
    }
  },


  /* ----------------------------------------------------------------
     RENDU DES CARTES DE PRIÈRE
  ---------------------------------------------------------------- */
  renderPrayerCards(grid, prayers) {
    const lang     = document.documentElement.getAttribute('data-lang') || 'fr';
    const names    = PRAYER_NAMES[lang] || PRAYER_NAMES.fr;
    const nextIdx  = this.getNextPrayerIndex(prayers);
    const now      = new Date();
    const dateStr  = now.toLocaleDateString(
      lang === 'ar' ? 'ar-BE' : lang === 'nl' ? 'nl-BE' : 'fr-BE',
      { weekday: 'long', day: 'numeric', month: 'long' }
    );

    grid.innerHTML = prayers.map((p, i) => {
      const isNext = (i === nextIdx);
      const isSunrise = (p.key === 'Sunrise');
      return `
        <article class="prayer-card ${isNext ? 'prayer-card--next' : ''} ${isSunrise ? 'prayer-card--sunrise' : ''}"
                 aria-label="${names[i]} ${p.time}">
          <div class="prayer-card__icon" aria-hidden="true">
            ${PRAYER_ICONS[i] || ''}
          </div>
          <div class="prayer-card__name">${names[i]}</div>
          <div class="prayer-card__arabic">${PRAYER_ARABIC[i]}</div>
          <div class="prayer-card__time">${p.time}</div>
          ${isNext ? `<div class="prayer-card__badge" data-i18n="next_prayer">Prochaine</div>` : ''}
        </article>
      `;
    }).join('');

    // Mettre à jour le badge de date
    const dateEl = grid.closest('[id]')?.parentElement?.querySelector('.prayers-date');
    if (dateEl) dateEl.textContent = dateStr;
  },


  /* ----------------------------------------------------------------
     SKELETON LOADER — pendant le chargement Aladhan
  ---------------------------------------------------------------- */
  renderSkeleton() {
    return Array.from({ length: 6 }, () => `
      <div class="prayer-card prayer-card--skeleton" aria-hidden="true">
        <div class="skeleton-icon"></div>
        <div class="skeleton-line skeleton-line--short"></div>
        <div class="skeleton-line skeleton-line--tiny"></div>
        <div class="skeleton-line skeleton-line--medium"></div>
      </div>
    `).join('');
  },


  /* ----------------------------------------------------------------
     UTILITAIRES
  ---------------------------------------------------------------- */

  /** Trouve l'index de la prochaine prière à venir */
  getNextPrayerIndex(prayers) {
    const now = new Date();
    const currentMins = now.getHours() * 60 + now.getMinutes();
    for (let i = 0; i < prayers.length; i++) {
      const [h, m] = prayers[i].time.split(':').map(Number);
      if (h * 60 + m > currentMins) return i;
    }
    return 0; // Retour à Fajr le lendemain
  },

  /** Lit le cache localStorage */
  getCache() {
    try {
      const raw = localStorage.getItem(PRAYER_CONFIG.cacheKey);
      if (!raw) return null;
      const { data, timestamp } = JSON.parse(raw);
      // Vérifier que le cache est du jour et pas expiré
      const now = new Date();
      const cached = new Date(timestamp);
      if (
        now.toDateString() !== cached.toDateString() ||
        (now - cached) > PRAYER_CONFIG.cacheTTL
      ) return null;
      return data;
    } catch {
      return null;
    }
  },

  /** Écrit dans le cache localStorage */
  setCache(data) {
    try {
      localStorage.setItem(PRAYER_CONFIG.cacheKey, JSON.stringify({
        data,
        timestamp: new Date().toISOString()
      }));
    } catch { /* localStorage plein ou bloqué */ }
  },
};


/* ----------------------------------------------------------------
   INIT AU CHARGEMENT
---------------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => PrayerTimes.init());

/* Export pour usage depuis d'autres modules */
window.PrayerTimes = PrayerTimes;
