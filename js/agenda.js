/**
 * agenda.js — Section Agenda / Calendrier
 * Grande Mosquée de Bruxelles
 *
 * Fonctionnement :
 * 1. Charge /data/events.json (généré par ocr_parser.py + admin panel)
 * 2. Affiche un calendrier mensuel interactif
 * 3. Filtres par type : conférences, Ramadan, cours, etc.
 * 4. Clic sur un jour → liste des événements du jour
 * 5. Support trilingue FR / AR / NL via i18n.js
 * 6. Calendrier Hijri en sous-titre (via calcul)
 */

'use strict';

/* ================================================================
   DONNÉES DE TRADUCTION (complète i18n.js)
================================================================ */
const AGENDA_I18N = {
  fr: {
    months: ['Janvier','Février','Mars','Avril','Mai','Juin',
             'Juillet','Août','Septembre','Octobre','Novembre','Décembre'],
    days_short: ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'],
    days_long:  ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'],
    filter_all:        'Tout',
    filter_conference: 'Conférences',
    filter_ramadan:    'Ramadan',
    filter_cours:      'Cours',
    filter_jumuah:     "Jumu'a",
    filter_annonce:    'Annonces',
    no_events:         'Aucun événement ce jour',
    no_events_month:   'Aucun événement ce mois',
    loading:           'Chargement du calendrier…',
    events_on:         'Événements du',
    type_labels: {
      conference: 'Conférence',
      ramadan:    'Ramadan',
      cours:      'Cours',
      jumuah:     "Jumu'a",
      annonce:    'Annonce',
      autre:      'Événement',
    },
  },
  ar: {
    months: ['يناير','فبراير','مارس','أبريل','مايو','يونيو',
             'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'],
    days_short: ['أح','إث','ثل','أر','خم','جم','سب'],
    days_long:  ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'],
    filter_all:        'الكل',
    filter_conference: 'المحاضرات',
    filter_ramadan:    'رمضان',
    filter_cours:      'الدروس',
    filter_jumuah:     'الجمعة',
    filter_annonce:    'الإعلانات',
    no_events:         'لا توجد فعاليات هذا اليوم',
    no_events_month:   'لا توجد فعاليات هذا الشهر',
    loading:           '…جارٍ التحميل',
    events_on:         'فعاليات يوم',
    type_labels: {
      conference: 'محاضرة',
      ramadan:    'رمضان',
      cours:      'درس',
      jumuah:     'الجمعة',
      annonce:    'إعلان',
      autre:      'فعالية',
    },
  },
  nl: {
    months: ['Januari','Februari','Maart','April','Mei','Juni',
             'Juli','Augustus','September','Oktober','November','December'],
    days_short: ['Zo','Ma','Di','Wo','Do','Vr','Za'],
    days_long:  ['Zondag','Maandag','Dinsdag','Woensdag','Donderdag','Vrijdag','Zaterdag'],
    filter_all:        'Alles',
    filter_conference: 'Lezingen',
    filter_ramadan:    'Ramadan',
    filter_cours:      'Lessen',
    filter_jumuah:     "Jumu'a",
    filter_annonce:    'Aankondigingen',
    no_events:         'Geen evenementen op deze dag',
    no_events_month:   'Geen evenementen deze maand',
    loading:           'Kalender laden…',
    events_on:         'Evenementen op',
    type_labels: {
      conference: 'Lezing',
      ramadan:    'Ramadan',
      cours:      'Les',
      jumuah:     "Jumu'a",
      annonce:    'Aankondiging',
      autre:      'Evenement',
    },
  },
};

/* Noms des mois Hijri */
const HIJRI_MONTHS = [
  'Muharram','Safar','Rabi al-Awwal','Rabi al-Thani',
  'Jumada al-Awwal','Jumada al-Thani','Rajab','Sha\'ban',
  'Ramadan','Shawwal','Dhu al-Qi\'dah','Dhu al-Hijjah',
];
const HIJRI_MONTHS_AR = [
  'محرم','صفر','ربيع الأول','ربيع الثاني',
  'جمادى الأولى','جمادى الثانية','رجب','شعبان',
  'رمضان','شوال','ذو القعدة','ذو الحجة',
];


/* ================================================================
   UTILITAIRES
================================================================ */

function getLang() {
  return document.documentElement.getAttribute('data-lang') || 'fr';
}

function t(key) {
  const lang = getLang();
  const dict = AGENDA_I18N[lang] || AGENDA_I18N.fr;
  return key.split('.').reduce((o, k) => o?.[k], dict) || key;
}

/**
 * Conversion approximative Grégorien → Hijri
 * Précis à ±1 jour (calcul sans bibliothèque externe)
 */
function toHijri(date) {
  const jd = Math.floor((date.getTime() / 86400000) + 2440587.5);
  let l = jd - 1948440 + 10632;
  const n = Math.floor((l - 1) / 10631);
  l = l - 10631 * n + 354;
  const j = Math.floor((10985 - l) / 5316) * Math.floor((50 * l) / 17719)
          + Math.floor(l / 5670) * Math.floor((43 * l) / 15238);
  l = l - Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50)
        - Math.floor(j / 16) * Math.floor((15238 * j) / 43) + 29;
  const month = Math.floor((24 * l) / 709);
  const day   = l - Math.floor((709 * month) / 24);
  const year  = 30 * n + j - 30;
  return { year, month, day };
}

function makeEventId(evt) {
  return evt.id || ('evt_' + Math.random().toString(36).slice(2, 8));
}

/**
 * Convertit un événement events.json en objet normalisé
 * avec une vraie date JS si possible
 */
function normalizeEvent(evt) {
  const lang = getLang();

  // Titre dans la bonne langue
  let title = '';
  if (evt.title) {
    title = evt.title[lang] || evt.title.fr || evt.title.ar || '';
  }
  if (!title && evt.speaker) title = evt.speaker;
  if (!title) title = t('type_labels.' + (evt.type || 'autre'));

  // Horaire
  let time = '';
  if (evt.horaire || evt.time) {
    const h = evt.horaire || evt.time;
    time = h[lang] || h.fr || h.ar || '';
  }

  // Jour (pour les événements récurrents sans date fixe)
  let dayLabel = '';
  if (evt.jour || evt.day) {
    const d = evt.jour || evt.day;
    dayLabel = d[lang] || d.fr || d.ar || '';
  }

  return {
    id:       makeEventId(evt),
    type:     evt.type || 'autre',
    title,
    titleAr:  evt.title?.ar || '',
    speaker:  evt.speaker || null,
    time,
    dayLabel,
    period:   evt.period || evt.periode || null,
    date:     evt.date ? new Date(evt.date) : null,
    // Événements récurrents : mapper les jours de la semaine
    weekday:  mapWeekday(evt.jour?.fr || evt.day?.fr || ''),
    raw:      evt,
  };
}

/**
 * Convertit un nom de jour FR en numéro (0=Dim … 6=Sam)
 */
function mapWeekday(dayFr) {
  const map = {
    'Dimanche': 0, 'Lundi': 1, 'Mardi': 2, 'Mercredi': 3,
    'Jeudi': 4, 'Vendredi': 5, 'Samedi': 6,
  };
  return map[dayFr] ?? null;
}

/**
 * Pour un mois donné, retourne toutes les occurrences
 * des événements récurrents (un par semaine)
 */
function expandRecurringEvents(events, year, month) {
  const expanded = [];
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  for (const evt of events) {
    if (evt.date) {
      // Événement à date fixe
      if (evt.date.getFullYear() === year && evt.date.getMonth() === month) {
        expanded.push({ ...evt, displayDate: evt.date });
      }
    } else if (evt.weekday !== null) {
      // Événement récurrent : trouver toutes les occurrences dans le mois
      for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(year, month, d);
        if (date.getDay() === evt.weekday) {
          expanded.push({ ...evt, displayDate: date });
        }
      }
    }
  }

  return expanded;
}


/* ================================================================
   MODULE AGENDA
================================================================ */
const Agenda = {

  events:      [],       // Tous les événements chargés
  filtered:    [],       // Après filtre actif
  currentYear:  new Date().getFullYear(),
  currentMonth: new Date().getMonth(),
  activeFilter: 'all',
  selectedDay:  null,

  /* ----------------------------------------------------------------
     INITIALISATION
  ---------------------------------------------------------------- */
  async init() {
    const section = document.getElementById('agenda');
    if (!section) return;

    // Injecter le HTML de la section
    this.renderShell(section);

    // Charger les événements
    await this.loadEvents();

    // Rendre le calendrier
    this.renderCalendar();

    // Écouter les changements de langue
    document.addEventListener('langChange', () => {
      this.renderCalendar();
      this.renderEventList(this.selectedDay);
    });
  },

  /* ----------------------------------------------------------------
     CHARGEMENT DES ÉVÉNEMENTS
  ---------------------------------------------------------------- */
  async loadEvents() {
    const container = document.getElementById('agenda-loading');
    try {
      const resp = await fetch('/data/events.json');
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();

      // Filtrer les événements validés seulement
      const raw = (data.events || []).filter(e => e.validated !== false);
      if (raw.length === 0) throw new Error("empty");

      this.events = raw.map(normalizeEvent);

      // Trier : d'abord par date fixe, puis par jour de la semaine
      this.events.sort((a, b) => {
        if (a.date && b.date) return a.date - b.date;
        if (a.date) return -1;
        if (b.date) return  1;
        return (a.weekday ?? 7) - (b.weekday ?? 7);
      });

    } catch (err) {
      // Pas de events.json encore — utiliser des données de démonstration
      console.info('Agenda: events.json non trouvé, utilisation des données démo');
      this.events = this.getDemoEvents();
    }

    this.applyFilter(this.activeFilter);
    if (container) container.remove();
  },

  /* ----------------------------------------------------------------
     DONNÉES DE DÉMONSTRATION (si events.json absent)
  ---------------------------------------------------------------- */
  getDemoEvents() {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    return [
      {
        id: 'demo_1', type: 'conference',
        title: 'Conférence : Le sens du Ramadan',
        titleAr: 'محاضرة: معنى رمضان',
        speaker: 'Cheikh Ibrahim Bouhna',
        time: 'Après Icha', date: new Date(y, m, 5),
        displayDate: new Date(y, m, 5),
        weekday: null, dayLabel: '', period: null,
      },
      {
        id: 'demo_2', type: 'ramadan',
        title: 'Cours après Asr — Programme Ramadan',
        titleAr: 'درس بعد العصر',
        speaker: 'Cheikh Mohamed Hrirou',
        time: 'Après Asr', date: null,
        weekday: 1, dayLabel: 'Lundi', period: 'Ramadan',
      },
      {
        id: 'demo_3', type: 'ramadan',
        title: 'Cours après Asr — Programme Ramadan',
        titleAr: 'درس بعد العصر',
        speaker: 'Cheikh Abdelaziz Al-Haffadi',
        time: 'Après Asr', date: null,
        weekday: 2, dayLabel: 'Mardi', period: 'Ramadan',
      },
      {
        id: 'demo_4', type: 'ramadan',
        title: 'Cours après Asr — Tajwid du Saint Coran',
        titleAr: 'تجويد القرآن الكريم',
        speaker: 'Cheikh Mostafa Ahmed',
        time: 'Après Asr', date: null,
        weekday: 5, dayLabel: 'Vendredi', period: 'Ramadan',
      },
      {
        id: 'demo_5', type: 'conference',
        title: 'Conférence mensuelle',
        titleAr: 'محاضرة شهرية',
        speaker: 'Cheikh Soulayman El Hadioui',
        time: 'Après Maghrib', date: new Date(y, m, 15),
        displayDate: new Date(y, m, 15),
        weekday: null, dayLabel: '', period: null,
      },
      {
        id: 'demo_6', type: 'ramadan',
        title: 'Cours avant Icha',
        titleAr: 'درس قبل العشاء',
        speaker: 'Cheikh Abdullah Al-Tryki',
        time: 'Avant Icha', date: null,
        weekday: 0, dayLabel: 'Dimanche', period: 'Ramadan',
      },
    ].map(e => ({ ...e, displayDate: e.displayDate || null }));
  },

  /* ----------------------------------------------------------------
     FILTRE
  ---------------------------------------------------------------- */
  applyFilter(type) {
    this.activeFilter = type;
    this.filtered = type === 'all'
      ? this.events
      : this.events.filter(e => e.type === type);

    // Mettre à jour les boutons
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.filter === type);
    });

    this.renderCalendar();
  },

  /* ----------------------------------------------------------------
     RENDU DU SQUELETTE HTML
  ---------------------------------------------------------------- */
  renderShell(section) {
    const lang = getLang();
    const dict = AGENDA_I18N[lang] || AGENDA_I18N.fr;

    section.querySelector('.container')?.insertAdjacentHTML('beforeend', `
      <div class="container">
        <div id="agenda-loading" class="agenda-skeleton"></div>

        <!-- Filtres -->
        <div class="agenda-filters" id="agenda-filters">
          ${[
            { key: 'all',        dot: 'all',        labelKey: 'filter_all' },
            { key: 'conference', dot: 'conference', labelKey: 'filter_conference' },
            { key: 'ramadan',    dot: 'ramadan',    labelKey: 'filter_ramadan' },
            { key: 'cours',      dot: 'cours',      labelKey: 'filter_cours' },
            { key: 'annonce',    dot: 'annonce',    labelKey: 'filter_annonce' },
          ].map(f => `
            <button class="filter-btn ${f.key === 'all' ? 'active' : ''}"
                    data-filter="${f.key}"
                    onclick="Agenda.applyFilter('${f.key}')">
              <span class="filter-dot filter-dot--${f.dot}"></span>
              ${dict[f.labelKey]}
            </button>
          `).join('')}
        </div>

        <!-- Navigation calendrier -->
        <div class="calendar-nav">
          <button class="calendar-nav-btn" onclick="Agenda.prevMonth()">&#8249;</button>
          <div>
            <div class="calendar-month-label" id="calendar-month-label">…</div>
            <div class="calendar-hijri" id="calendar-hijri">…</div>
          </div>
          <button class="calendar-nav-btn" onclick="Agenda.nextMonth()">&#8250;</button>
        </div>

        <!-- Grille calendrier -->
        <div class="calendar-grid-wrap">
          <div class="calendar-header" id="calendar-header"></div>
          <div class="calendar-body" id="calendar-body"></div>
        </div>

        <!-- Détail du jour sélectionné -->
        <div class="agenda-day-detail" id="agenda-day-detail"></div>

      </div>
    `);
  },

  /* ----------------------------------------------------------------
     RENDU DU CALENDRIER
  ---------------------------------------------------------------- */
  renderCalendar() {
    const lang  = getLang();
    const dict  = AGENDA_I18N[lang] || AGENDA_I18N.fr;
    const year  = this.currentYear;
    const month = this.currentMonth;
    const today = new Date();

    // Label du mois
    const monthLabel = document.getElementById('calendar-month-label');
    if (monthLabel) {
      monthLabel.textContent = `${dict.months[month]} ${year}`;
    }

    // Label Hijri
    const hijriLabel = document.getElementById('calendar-hijri');
    if (hijriLabel) {
      const h = toHijri(new Date(year, month, 15));
      const hMonths = lang === 'ar' ? HIJRI_MONTHS_AR : HIJRI_MONTHS;
      hijriLabel.textContent = `${hMonths[h.month - 1]} ${h.year} هـ`;
    }

    // En-têtes des jours
    const header = document.getElementById('calendar-header');
    if (header) {
      header.innerHTML = dict.days_short.map(d =>
        `<div class="calendar-header-day">${d}</div>`
      ).join('');
    }

    // Corps du calendrier
    const body = document.getElementById('calendar-body');
    if (!body) return;

    const firstDay  = new Date(year, month, 1).getDay(); // 0=Dim
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Événements du mois (expanded pour les récurrents)
    const monthEvents = expandRecurringEvents(this.filtered, year, month);

    // Grouper par numéro de jour
    const byDay = {};
    for (const evt of monthEvents) {
      const d = (evt.displayDate || evt.date)?.getDate();
      if (d) {
        if (!byDay[d]) byDay[d] = [];
        byDay[d].push(evt);
      }
    }

    let html = '';

    // Cases vides avant le 1er
    for (let i = 0; i < firstDay; i++) {
      html += `<div class="calendar-day calendar-day--empty"></div>`;
    }

    // Cases des jours
    for (let d = 1; d <= daysInMonth; d++) {
      const isToday = (
        today.getDate() === d &&
        today.getMonth() === month &&
        today.getFullYear() === year
      );
      const isSelected = this.selectedDay === d;
      const evts = byDay[d] || [];
      const hasEvents = evts.length > 0;

      const classes = [
        'calendar-day',
        isToday    ? 'calendar-day--today'    : '',
        isSelected ? 'calendar-day--selected' : '',
        hasEvents  ? 'calendar-day--has-events' : '',
      ].filter(Boolean).join(' ');

      // Afficher jusqu'à 2 événements, puis "+N autres"
      const visible = evts.slice(0, 2);
      const overflow = evts.length - 2;

      const dots = visible.map(e => `
        <span class="calendar-event-dot calendar-event-dot--${e.type}"
              title="${e.title}">
          ${e.title.slice(0, 18)}${e.title.length > 18 ? '…' : ''}
        </span>
      `).join('');

      const more = overflow > 0
        ? `<span class="calendar-more">+${overflow}</span>`
        : '';

      html += `
        <div class="${classes}" onclick="Agenda.selectDay(${d})">
          <div class="calendar-day-num">${d}</div>
          ${dots}${more}
        </div>
      `;
    }

    body.innerHTML = html;

    // Re-render le détail si un jour est sélectionné
    if (this.selectedDay) {
      this.renderEventList(this.selectedDay);
    }
  },

  /* ----------------------------------------------------------------
     SÉLECTION D'UN JOUR
  ---------------------------------------------------------------- */
  selectDay(day) {
    this.selectedDay = day;
    // Mettre à jour la classe selected visuellement
    document.querySelectorAll('.calendar-day--selected').forEach(el => {
      el.classList.remove('calendar-day--selected');
    });
    const days = document.querySelectorAll('.calendar-day:not(.calendar-day--empty)');
    const firstDay = new Date(this.currentYear, this.currentMonth, 1).getDay();
    const idx = day - 1 + firstDay;
    if (days[day - 1]) days[day - 1].classList.add('calendar-day--selected');

    this.renderEventList(day);

    // Scroll doux vers le détail
    document.getElementById('agenda-day-detail')?.scrollIntoView({
      behavior: 'smooth', block: 'nearest',
    });
  },

  /* ----------------------------------------------------------------
     LISTE DES ÉVÉNEMENTS D'UN JOUR
  ---------------------------------------------------------------- */
  renderEventList(day) {
    const container = document.getElementById('agenda-day-detail');
    if (!container) return;

    if (!day) {
      container.innerHTML = '';
      return;
    }

    const lang = getLang();
    const dict = AGENDA_I18N[lang] || AGENDA_I18N.fr;

    // Trouver les événements de ce jour
    const monthEvents = expandRecurringEvents(
      this.filtered, this.currentYear, this.currentMonth
    );
    const dayEvents = monthEvents.filter(e => {
      const d = (e.displayDate || e.date)?.getDate();
      return d === day;
    });

    const dateObj = new Date(this.currentYear, this.currentMonth, day);
    const dateStr = dateObj.toLocaleDateString(
      lang === 'ar' ? 'ar-BE' : lang === 'nl' ? 'nl-BE' : 'fr-BE',
      { weekday: 'long', day: 'numeric', month: 'long' }
    );

    let html = `
      <div class="agenda-day-detail-title">
        ${dict.events_on} <span>${dateStr}</span>
      </div>
    `;

    if (dayEvents.length === 0) {
      html += `<p class="agenda-no-events">${dict.no_events}</p>`;
    } else {
      html += `<div class="agenda-events-list">`;
      for (const evt of dayEvents) {
        const typeLabel = dict.type_labels?.[evt.type] || evt.type;
        html += `
          <article class="event-card event-card--${evt.type}">
            <div class="event-card-time">
              <div class="event-card-day">${evt.dayLabel || dateStr.split(' ')[0]}</div>
              <div class="event-card-hour">${evt.time || '—'}</div>
              ${evt.raw?.horaire?.ar ? `<div class="event-card-hour-ar">${evt.raw.horaire.ar}</div>` : ''}
            </div>
            <div class="event-card-content">
              <span class="event-card-type event-card-type--${evt.type}">${typeLabel}</span>
              <div class="event-card-title">${evt.title}</div>
              ${evt.titleAr ? `<div class="event-card-title-ar">${evt.titleAr}</div>` : ''}
              ${evt.speaker ? `<div class="event-card-speaker">${evt.speaker}</div>` : ''}
              ${evt.period  ? `<span class="event-card-period">🌙 ${evt.period}</span>` : ''}
            </div>
          </article>
        `;
      }
      html += `</div>`;
    }

    container.innerHTML = html;
  },

  /* ----------------------------------------------------------------
     NAVIGATION MOIS
  ---------------------------------------------------------------- */
  prevMonth() {
    if (this.currentMonth === 0) {
      this.currentMonth = 11;
      this.currentYear--;
    } else {
      this.currentMonth--;
    }
    this.selectedDay = null;
    this.renderCalendar();
  },

  nextMonth() {
    if (this.currentMonth === 11) {
      this.currentMonth = 0;
      this.currentYear++;
    } else {
      this.currentMonth++;
    }
    this.selectedDay = null;
    this.renderCalendar();
  },
};


/* ================================================================
   INIT AU CHARGEMENT
================================================================ */
document.addEventListener('DOMContentLoaded', () => Agenda.init());

// Re-render quand la langue change
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setTimeout(() => {
        Agenda.renderCalendar();
        if (Agenda.selectedDay) Agenda.renderEventList(Agenda.selectedDay);
      }, 50);
    });
  });
});

window.Agenda = Agenda;
