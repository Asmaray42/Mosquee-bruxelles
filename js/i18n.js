/**
 * i18n.js — Système de traduction FR / AR / NL
 * Grande Mosquée de Bruxelles
 *
 * Fonctionnement :
 * 1. Dictionnaire : objet `translations` contenant les 3 langues
 * 2. setLanguage(lang) : met à jour tous les éléments [data-i18n]
 *    et bascule dir="rtl" automatiquement pour l'arabe
 * 3. Les boutons .lang-btn appellent setLanguage() au clic
 * 4. La langue choisie est sauvegardée dans localStorage
 */

'use strict';

/* ----------------------------------------------------------------
   DICTIONNAIRE DE TRADUCTIONS
   Clé = attribut data-i18n dans le HTML
   Valeur = texte dans chaque langue
---------------------------------------------------------------- */
const translations = {

  fr: {
    page_title:           'Grande Mosquée de Bruxelles',
    site_name:            'Grande Mosquée de Bruxelles',
    site_subtitle:        'Centre Islamique de Belgique',

    /* Navigation */
    nav_home:             'Accueil',
    nav_prayers:          'Horaires de prière',
    nav_agenda:           'Agenda',
    nav_education:        'Éducation',
    nav_donate:           'Faire un don',
    nav_contact:          'Contact',

    /* Hero */
    hero_eyebrow:         'Bienvenue',
    hero_title:           'Grande Mosquée de Bruxelles',
    hero_desc:            'Au cœur du Parc du Cinquantenaire, un espace de paix, de prière et de rencontre ouvert à tous.',
    hero_cta_prayers:     'Horaires du jour',
    hero_cta_contact:     'Nous trouver',

    /* Sections */
    prayers_title:        'Horaires de prière',
    prayers_sub:          'Bruxelles — aujourd\'hui',
    agenda_title:         'Agenda',
    agenda_sub:           'Événements et activités à venir',
    education_title:      'Éducation',
    education_sub:        'Cours, conférences et ressources',
    donate_title:         'Faire un don',
    donate_sub:           'Soutenez votre mosquée',
    contact_title:        'Contact & Accès',
    contact_address_label:'Adresse',

    /* Utilitaires */
    loading:              'Chargement…',
    footer_copy:          '© 2025 Centre Islamique de Belgique',
  },

  ar: {
    page_title:           'المسجد الكبير في بروكسل',
    site_name:            'المسجد الكبير في بروكسل',
    site_subtitle:        'المركز الإسلامي في بلجيكا',

    /* Navigation */
    nav_home:             'الرئيسية',
    nav_prayers:          'أوقات الصلاة',
    nav_agenda:           'الأنشطة',
    nav_education:        'التعليم',
    nav_donate:           'التبرع',
    nav_contact:          'اتصل بنا',

    /* Hero */
    hero_eyebrow:         'أهلاً وسهلاً',
    hero_title:           'المسجد الكبير في بروكسل',
    hero_desc:            'في قلب حديقة السينكونتينير، مكان للسلام والصلاة واللقاء مفتوح للجميع.',
    hero_cta_prayers:     'أوقات الصلاة اليوم',
    hero_cta_contact:     'كيفية الوصول',

    /* Sections */
    prayers_title:        'أوقات الصلاة',
    prayers_sub:          'بروكسل — اليوم',
    agenda_title:         'الفعاليات',
    agenda_sub:           'الأنشطة والفعاليات القادمة',
    education_title:      'التعليم',
    education_sub:        'دروس ومحاضرات وموارد',
    donate_title:         'التبرع',
    donate_sub:           'ادعم مسجدك',
    contact_title:        'اتصل بنا والوصول',
    contact_address_label:'العنوان',

    /* Utilitaires */
    loading:              'جارٍ التحميل…',
    footer_copy:          '© 2025 المركز الإسلامي في بلجيكا',
  },

  nl: {
    page_title:           'Grote Moskee van Brussel',
    site_name:            'Grote Moskee van Brussel',
    site_subtitle:        'Islamitisch Centrum van België',

    /* Navigation */
    nav_home:             'Home',
    nav_prayers:          'Gebedstijden',
    nav_agenda:           'Agenda',
    nav_education:        'Onderwijs',
    nav_donate:           'Doneren',
    nav_contact:          'Contact',

    /* Hero */
    hero_eyebrow:         'Welkom',
    hero_title:           'Grote Moskee van Brussel',
    hero_desc:            'In het hart van het Jubelpark, een plek van vrede, gebed en ontmoeting, open voor iedereen.',
    hero_cta_prayers:     'Gebedstijden vandaag',
    hero_cta_contact:     'Ons vinden',

    /* Sections */
    prayers_title:        'Gebedstijden',
    prayers_sub:          'Brussel — vandaag',
    agenda_title:         'Agenda',
    agenda_sub:           'Aankomende evenementen en activiteiten',
    education_title:      'Onderwijs',
    education_sub:        'Lessen, lezingen en bronnen',
    donate_title:         'Doneren',
    donate_sub:           'Steun uw moskee',
    contact_title:        'Contact & Bereikbaarheid',
    contact_address_label:'Adres',

    /* Utilitaires */
    loading:              'Laden…',
    footer_copy:          '© 2025 Islamitisch Centrum van België',
  }
};


/* ----------------------------------------------------------------
   FONCTION PRINCIPALE : setLanguage(lang)
   - Met à jour l'attribut lang et dir sur <html>
   - Traduit tous les éléments [data-i18n]
   - Bascule RTL automatiquement pour l'arabe
   - Met à jour le <title>
   - Sauvegarde le choix dans localStorage
---------------------------------------------------------------- */
function setLanguage(lang) {
  // Vérification : la langue demandée existe-t-elle ?
  if (!translations[lang]) {
    console.warn(`i18n : langue "${lang}" non trouvée, retour au français.`);
    lang = 'fr';
  }

  const dict = translations[lang];
  const htmlEl = document.documentElement;

  /* 1. Attributs sur <html> */
  htmlEl.setAttribute('lang', lang);
  htmlEl.setAttribute('data-lang', lang);

  /* 2. Direction du texte : RTL pour l'arabe, LTR pour les autres */
  htmlEl.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');

  /* 3. Traduction de tous les éléments [data-i18n] */
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (dict[key] !== undefined) {
      el.textContent = dict[key];
    }
  });

  /* 4. Mise à jour du <title> de la page */
  if (dict.page_title) {
    document.title = dict.page_title;
  }

  /* 5. Mise à jour des boutons de langue (aria-pressed + classe active) */
  document.querySelectorAll('.lang-btn').forEach(btn => {
    const isActive = btn.getAttribute('data-lang') === lang;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });

  /* 6. Sauvegarde dans localStorage pour mémoriser le choix */
  try {
    localStorage.setItem('gmb_lang', lang);
  } catch (e) {
    /* localStorage peut être bloqué en navigation privée — on ignore */
  }
}


/* ----------------------------------------------------------------
   INITIALISATION AU CHARGEMENT DE LA PAGE
---------------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => {

  /* Lire la langue sauvegardée, sinon détecter la langue du navigateur */
  let langInitiale = 'fr'; // par défaut

  try {
    const langSauvee = localStorage.getItem('gmb_lang');
    if (langSauvee && translations[langSauvee]) {
      langInitiale = langSauvee;
    } else {
      /* Détection automatique : prend les 2 premiers caractères ex: "fr-BE" → "fr" */
      const langNavigateur = (navigator.language || 'fr').substring(0, 2).toLowerCase();
      if (translations[langNavigateur]) {
        langInitiale = langNavigateur;
      }
    }
  } catch (e) {
    /* Si localStorage est bloqué */
  }

  /* Appliquer la langue initiale */
  setLanguage(langInitiale);

  /* Attacher les événements aux boutons de langue */
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const lang = btn.getAttribute('data-lang');
      setLanguage(lang);
    });
  });
});


/* ----------------------------------------------------------------
   EXPORT (pour usage dans d'autres modules si besoin)
---------------------------------------------------------------- */
window.i18n = {
  setLanguage,
  translations,
  /**
   * Utilitaire : retourne la traduction d'une clé dans la langue active
   * Usage : i18n.t('prayers_title') → "Horaires de prière"
   */
  t(key) {
    const lang = document.documentElement.getAttribute('data-lang') || 'fr';
    return (translations[lang] && translations[lang][key]) || key;
  }
};
