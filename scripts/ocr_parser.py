#!/usr/bin/env python3
"""
ocr_parser.py — Extraction d'événements depuis des images d'annonces
Grande Mosquée de Bruxelles

Entièrement GRATUIT — utilise Tesseract OCR (open source, local)
Aucune API payante requise.

Supporte :
  - Tableaux de programmes (cours, Ramadan, etc.)
  - Texte multilingue FR + AR + NL (mélangé dans la même image)
  - Images téléchargées depuis Mawaqit ou Facebook
  - Images locales

Installation VPS :
  sudo apt install tesseract-ocr tesseract-ocr-fra tesseract-ocr-ara tesseract-ocr-nld
  pip install pytesseract pillow pandas numpy opencv-python-headless

Usage :
  python3 ocr_parser.py image.jpg
  python3 ocr_parser.py image.jpg --output events.json
  python3 ocr_parser.py --watch ./data/images/   # surveille un dossier
"""

import sys
import os
import re
import json
import argparse
import hashlib
from pathlib import Path
from datetime import datetime

try:
    from PIL import Image, ImageFilter, ImageEnhance
    import pytesseract
    import pandas as pd
    import numpy as np
except ImportError as e:
    print(f"[ERREUR] Dépendance manquante: {e}")
    print("Installe: pip install pytesseract pillow pandas numpy")
    sys.exit(1)


# ================================================================
# CONFIG
# ================================================================

# Langues Tesseract — sur le VPS après apt install tesseract-ocr-fra etc.
# Si certaines langues ne sont pas installées, le script se dégrade gracieusement
TESSERACT_LANGS_PRIORITY = [
    'fra+ara+nld',   # Idéal : tout installé
    'fra+nld',        # Sans arabe
    'fra',            # Seulement français
    'eng',            # Fallback universel
]

# Jours de la semaine reconnus dans les 3 langues
DAYS_FR = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']
DAYS_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت',
            'الاحد', 'الثلاثاء', 'الاربعاء']
DAYS_NL = ['Zondag', 'Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag']

# Correspondances FR → AR → NL
DAY_MAP = {
    'Dimanche': ('الأحد', 'Zondag'),
    'Lundi':    ('الاثنين', 'Maandag'),
    'Mardi':    ('الثلاثاء', 'Dinsdag'),
    'Mercredi': ('الأربعاء', 'Woensdag'),
    'Jeudi':    ('الخميس', 'Donderdag'),
    'Vendredi': ('الجمعة', 'Vrijdag'),
    'Samedi':   ('السبت', 'Zaterdag'),
}

# Horaires reconnus
TIME_PATTERNS_FR = {
    r"apr[eè]s?\s*[al]['\s]*?asr":     {'fr': 'Après Asr', 'ar': 'بعد العصر', 'nl': 'Na het Asr-gebed'},
    r"apr[eè]s?\s*[al]['\s]*?fajr":    {'fr': 'Après Fajr', 'ar': 'بعد الفجر', 'nl': 'Na het Fajr-gebed'},
    r"apr[eè]s?\s*[al]['\s]*?dhuhr":   {'fr': 'Après Dhuhr', 'ar': 'بعد الظهر', 'nl': 'Na het Dhuhr-gebed'},
    r"apr[eè]s?\s*[al]['\s]*?maghrib": {'fr': 'Après Maghrib', 'ar': 'بعد المغرب', 'nl': 'Na het Maghrib-gebed'},
    r"apr[eè]s?\s*[al]['\s]*?ish[ae]": {'fr': "Après Icha", 'ar': 'بعد العشاء', 'nl': 'Na het Icha-gebed'},
    r"avant\s*[al]['\s]*?ish[ae]":     {'fr': "Avant Icha", 'ar': 'قبل العشاء', 'nl': 'Voor het Icha-gebed'},
    r"avant\s*[al]['\s]*?fajr":        {'fr': 'Avant Fajr', 'ar': 'قبل الفجر', 'nl': 'Voor het Fajr-gebed'},
    r"na\s*(?:het\s*)?asr":            {'fr': 'Après Asr', 'ar': 'بعد العصر', 'nl': 'Na het Asr-gebed'},
    r"voor\s*(?:het\s*)?isha":         {'fr': "Avant Icha", 'ar': 'قبل العشاء', 'nl': 'Voor het Icha-gebed'},
    r"(\d{1,2})[h:](\d{2})":           None,  # Traité séparément
}

# Mots-clés pour détecter le type d'événement
TYPE_KEYWORDS = {
    'ramadan':    ['ramadan', 'tarawih', 'taraweeh', 'iftar', 'suhoor', 'tahajjud', 'لرمضان', 'التراويح'],
    'cours':      ['cours', 'les', 'les ', 'cheikh', 'professeur', 'docteur', 'sheikh', 'شيخ', 'درس', 'les '],
    'conference': ['conférence', 'confer', 'causerie', 'lezing', 'toespraak', 'محاضرة'],
    'jumuah':     ['jumu', 'vendredi', 'vrijdag', 'خطبة', 'الجمعة'],
    'tahajjud':   ['tahajjud', 'tahjud', 'التهجد'],
}


# ================================================================
# PRÉTRAITEMENT DE L'IMAGE
# Améliore la qualité pour Tesseract
# ================================================================

def preprocess_image(img: Image.Image) -> Image.Image:
    """
    Améliore l'image pour maximiser la qualité de l'OCR :
    - Agrandit si trop petite
    - Augmente le contraste
    - Convertit en niveaux de gris
    - Légère netteté
    """
    # 1. Agrandir si nécessaire (Tesseract aime les images >= 300dpi)
    w, h = img.size
    if w < 1000:
        scale = 1000 / w
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)

    # 2. Convertir en RGB si nécessaire
    if img.mode != 'RGB':
        img = img.convert('RGB')

    # 3. Améliorer le contraste
    enhancer = ImageEnhance.Contrast(img)
    img = enhancer.enhance(1.5)

    # 4. Netteté
    img = img.filter(ImageFilter.SHARPEN)

    return img


def detect_available_langs() -> str:
    """Détecte les langues Tesseract disponibles et retourne la meilleure combinaison."""
    try:
        available = pytesseract.get_languages()
    except Exception:
        return 'eng'

    for combo in TESSERACT_LANGS_PRIORITY:
        langs = combo.split('+')
        if all(l in available for l in langs):
            return combo

    # Retourner les langues disponibles parmi nos préférences
    wanted = ['fra', 'ara', 'nld', 'eng']
    found  = [l for l in wanted if l in available]
    return '+'.join(found) if found else 'eng'


# ================================================================
# EXTRACTION DU TEXTE BRUT
# ================================================================

def extract_text_raw(img: Image.Image, langs: str) -> str:
    """Extrait le texte brut de l'image entière."""
    config = '--psm 6 --oem 3'  # PSM 6 = bloc de texte uniforme
    try:
        return pytesseract.image_to_string(img, lang=langs, config=config)
    except Exception as e:
        print(f"[WARN] OCR brut échoué ({e}), fallback eng")
        return pytesseract.image_to_string(img, lang='eng', config=config)


def extract_words_with_coords(img: Image.Image, langs: str) -> pd.DataFrame:
    """
    Extrait chaque mot avec ses coordonnées (left, top, width, height).
    Permet de reconstruire la structure du tableau.
    """
    config = '--psm 6 --oem 3'
    try:
        df = pytesseract.image_to_data(
            img, lang=langs, config=config,
            output_type=pytesseract.Output.DATAFRAME
        )
    except Exception:
        df = pytesseract.image_to_data(
            img, lang='eng', config=config,
            output_type=pytesseract.Output.DATAFRAME
        )

    # Nettoyage
    df = df[df['conf'] > 20].copy()
    df['text'] = df['text'].astype(str).str.strip()
    df = df[df['text'].str.len() > 0]
    df = df[~df['text'].str.match(r'^[|\\/_\-\s]+$')]  # Supprimer les séparateurs purs

    return df.reset_index(drop=True)


# ================================================================
# DÉTECTION DE LA STRUCTURE TABLEAU
# ================================================================

def detect_table_columns(df: pd.DataFrame, img_width: int) -> pd.DataFrame:
    """
    Détecte les 3 colonnes d'un tableau de programme de mosquée :
    - Colonne GAUCHE (< 25% largeur) : horaire (بعد العصر / Après Asr)
    - Colonne CENTRE (25–70%)        : intervenant + sujet
    - Colonne DROITE (> 70%)         : jour de la semaine
    
    Ajoute une colonne 'col' au DataFrame.
    """
    df = df.copy()
    df['col'] = 'centre'
    df.loc[df['left'] < img_width * 0.25, 'col'] = 'horaire'
    df.loc[df['left'] > img_width * 0.70, 'col'] = 'jour'
    return df


def group_into_rows(df: pd.DataFrame, row_height: int = 45) -> list[dict]:
    """
    Regroupe les mots par lignes (bandes horizontales de row_height px).
    Retourne une liste de dicts {y_band, horaire, centre, jour}.
    """
    df = df.copy()
    df['row_band'] = (df['top'] // row_height) * row_height

    rows = []
    for band, group in df.groupby('row_band'):
        by_col = group.groupby('col')['text'].apply(lambda x: ' '.join(x.tolist())).to_dict()
        row = {
            'y':       int(band),
            'horaire': clean_text(by_col.get('horaire', '')),
            'centre':  clean_text(by_col.get('centre', '')),
            'jour':    clean_text(by_col.get('jour', '')),
        }
        # Garder seulement les lignes avec du contenu substantiel
        if any(len(v) > 3 for v in [row['horaire'], row['centre'], row['jour']]):
            rows.append(row)

    return rows


# ================================================================
# NETTOYAGE ET NORMALISATION DU TEXTE OCR
# ================================================================

def clean_text(text: str) -> str:
    """Nettoie le texte OCR : supprime les artefacts, normalise les espaces."""
    if not text:
        return ''

    # Supprimer les séparateurs de tableau Tesseract
    text = re.sub(r'\s*\|\s*', ' ', text)

    # Corriger les erreurs OCR courantes pour le français
    corrections = {
        r'\bApr[eé]s?\b':   'Après',
        r'\bApr[aà]s?\b':   'Après',
        r'\bAvant\b':       'Avant',
        r"[Aa]l'asr\b":    "Al'asr",
        r"[Aa]l'isha\b":   "Al'icha",
        r'\bDimanche\b':   'Dimanche',
        r'\bDimanch[ée]?\b': 'Dimanche',
        r'\bLund[il]\b':   'Lundi',
        r'\bMareil?\b':    'Mardi',
        r'\bMercred[il]\b': 'Mercredi',
        r'\bJeud[il]\b':   'Jeudi',
        r'\bVendredi\b':   'Vendredi',
        r'\bSamed[il]\b':  'Samedi',
    }
    for pattern, replacement in corrections.items():
        text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)

    # Nettoyer les espaces multiples
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def is_arabic(text: str) -> bool:
    """Détecte si le texte contient majoritairement de l'arabe."""
    arabic_chars = len(re.findall(r'[\u0600-\u06FF]', text))
    return arabic_chars > len(text) * 0.3


def detect_day_fr(text: str) -> str | None:
    """Détecte le jour de la semaine en français dans un texte."""
    for day in DAYS_FR:
        if re.search(day, text, re.IGNORECASE):
            return day
    return None


def detect_time(text: str) -> dict | None:
    """
    Détecte l'horaire dans un texte et retourne son équivalent multilingue.
    """
    text_lower = text.lower()
    for pattern, translations in TIME_PATTERNS_FR.items():
        if re.search(pattern, text_lower, re.IGNORECASE):
            if translations is None:
                # Pattern numérique : ex "14h30"
                m = re.search(r'(\d{1,2})[h:](\d{2})', text_lower)
                if m:
                    t = f"{m.group(1)}h{m.group(2)}"
                    return {'fr': t, 'ar': t, 'nl': t}
            else:
                return translations
    return None


def detect_event_type(text: str) -> str:
    """Détecte le type d'événement basé sur les mots-clés."""
    text_lower = text.lower()
    for type_name, keywords in TYPE_KEYWORDS.items():
        if any(kw in text_lower for kw in keywords):
            return type_name
    return 'cours'


def extract_speaker(text: str) -> str | None:
    """Extrait le nom de l'intervenant depuis le texte."""
    patterns = [
        r'(?:Cheikh|Sheikh|Docteur|Dr\.?|Professeur|Prof\.?|[Aa]l-[Uu]staz|الشيخ|الدكتور|الأستاذ)[.\s:]+([A-ZÀ-Üa-zà-ü\s\-]+?)(?:\n|$|(?:Cheikh|Sheikh|Docteur|Professeur))',
        r'(?:Cheikh|Sheikh)\s*:?\s*([A-ZÀ-Üa-zà-ü][a-zà-ü]+(?:\s+[A-ZÀ-Ü][a-zà-ü\-]+)*)',
        r'(?:Docteur|Professeur)\s*:?\s*([A-ZÀ-Üa-zà-ü][a-zà-ü]+(?:\s+[A-ZÀ-Ü][a-zà-ü\-]+)*)',
    ]
    for p in patterns:
        m = re.search(p, text, re.IGNORECASE | re.MULTILINE)
        if m:
            name = m.group(1).strip()
            if 3 < len(name) < 60:
                return name
    return None


# ================================================================
# PARSING PRINCIPAL : TABLEAU DE PROGRAMME
# ================================================================

def parse_programme_table(rows: list[dict], full_text: str) -> list[dict]:
    """
    Analyse les lignes extraites et reconstruit les événements du tableau.
    Stratégie :
    1. Chaque ligne avec un jour reconnu = un événement
    2. Les lignes suivantes sans jour = continuation (intervenant supplémentaire)
    3. Les lignes de notes (début par >, », •) = notes globales
    """
    events = []
    notes_fr, notes_ar, notes_nl = [], [], []
    current_event = None

    for row in rows:
        jour_fr = detect_day_fr(row['jour']) or detect_day_fr(row['centre']) or detect_day_fr(row['horaire'])
        time_info = detect_time(row['horaire']) or detect_time(row['centre'])
        centre = row['centre']

        # Ligne de note (commence par > » • ou similaire)
        if re.match(r'^[>»•\-\*]', row['horaire'] + row['centre']):
            note_text = (row['horaire'] + ' ' + row['centre'] + ' ' + row['jour']).strip()
            note_text = re.sub(r'^[>»•\-\*]\s*', '', note_text)
            if is_arabic(note_text):
                notes_ar.append(note_text)
            elif any(w in note_text.lower() for w in ['ook', 'het', 'van', 'een', 'worden']):
                notes_nl.append(note_text)
            else:
                notes_fr.append(note_text)
            continue

        # Ligne avec un jour reconnu → nouvel événement
        if jour_fr:
            # Sauvegarder l'événement précédent
            if current_event:
                events.append(current_event)

            speaker = extract_speaker(centre)
            day_ar, day_nl = DAY_MAP.get(jour_fr, ('', ''))

            current_event = {
                'jour':         {'fr': jour_fr, 'ar': day_ar, 'nl': day_nl},
                'horaire':      time_info,
                'intervenants': [speaker] if speaker else [],
                'sujet_raw':    centre,
                'sujet_ar':     centre if is_arabic(centre) else '',
            }

        # Ligne sans jour mais avec contenu → continuation du précédent
        elif current_event and (centre or row['horaire']):
            extra_text = (row['horaire'] + ' ' + centre).strip()
            speaker = extract_speaker(extra_text)
            if speaker:
                current_event['intervenants'].append(speaker)
            if extra_text and not is_arabic(extra_text):
                current_event['sujet_raw'] += ' ' + extra_text

    # Ne pas oublier le dernier événement
    if current_event:
        events.append(current_event)

    # Construire les objets finaux normalisés
    result = []
    for evt in events:
        if not evt.get('jour', {}).get('fr'):
            continue

        # Nettoyer les intervenants (dédoublonner, supprimer les vides)
        intervenants = list(dict.fromkeys(
            i for i in evt['intervenants'] if i and len(i) > 2
        ))
        speaker_str = ' / '.join(intervenants) if intervenants else None

        # Construire le titre
        sujet = clean_text(evt.get('sujet_raw', ''))
        if speaker_str:
            sujet_clean = re.sub(
                r'(?:Cheikh|Sheikh|Docteur|Professeur|Prof\.?|Dr\.?)[.\s:]+' + re.escape(speaker_str),
                '', sujet, flags=re.IGNORECASE
            ).strip()
        else:
            sujet_clean = sujet

        horaire = evt.get('horaire') or {}
        event_obj = {
            'id':         'evt_' + hashlib.md5(
                (str(evt['jour']['fr']) + str(speaker_str) + str(horaire.get('fr',''))).encode()
            ).hexdigest()[:10],
            'source':    'ocr-tesseract',
            'type':      detect_event_type(sujet_clean + ' ' + str(speaker_str)),
            'validated': False,
            'jour':      evt['jour'],
            'horaire':   horaire,
            'speaker':   speaker_str,
            'title': {
                'fr': sujet_clean or horaire.get('fr', ''),
                'ar': evt.get('sujet_ar', ''),
                'nl': sujet_clean or horaire.get('nl', ''),
            },
            'notes': {
                'fr': notes_fr,
                'ar': notes_ar,
                'nl': notes_nl,
            },
            'createdAt': datetime.now().isoformat(),
        }
        result.append(event_obj)

    return result


# ================================================================
# DÉTECTION DU TYPE D'IMAGE
# ================================================================

def detect_image_content_type(full_text: str) -> str:
    """
    Détermine si l'image est un tableau de programme, une annonce texte,
    ou autre chose.
    """
    text_lower = full_text.lower()
    day_count = sum(
        1 for day in (DAYS_FR + DAYS_NL)
        if day.lower() in text_lower
    )
    if day_count >= 3:
        return 'tableau_programme'
    if any(w in text_lower for w in ['annonce', 'information', 'chers fidèles', 'مهم']):
        return 'annonce_texte'
    if any(w in text_lower for w in ['ramadan', 'رمضان']):
        return 'annonce_ramadan'
    return 'autre'


# ================================================================
# PARSING D'ANNONCE TEXTE
# ================================================================

def parse_text_announcement(full_text: str) -> list[dict]:
    """Parse une annonce textuelle (pas un tableau)."""
    # Séparer les paragraphes
    paragraphs = [p.strip() for p in re.split(r'\n{2,}', full_text) if p.strip()]

    events = []
    for para in paragraphs:
        if len(para) < 20:
            continue

        event_obj = {
            'id':        'evt_' + hashlib.md5(para.encode()).hexdigest()[:10],
            'source':    'ocr-tesseract',
            'type':      detect_event_type(para),
            'validated': False,
            'title':     {'fr': para[:100], 'ar': '', 'nl': ''},
            'raw_text':  para,
            'createdAt': datetime.now().isoformat(),
        }
        events.append(event_obj)

    return events


# ================================================================
# EXTRACTION DU TITRE / PÉRIODE
# ================================================================

def extract_programme_meta(full_text: str) -> dict:
    """Extrait le titre et la période du programme depuis le texte brut."""
    meta = {'titre_fr': None, 'titre_ar': None, 'titre_nl': None, 'periode': None}

    lines = [l.strip() for l in full_text.split('\n') if l.strip()]

    for line in lines[:8]:  # Le titre est généralement dans les 8 premières lignes
        if is_arabic(line) and not meta['titre_ar']:
            meta['titre_ar'] = line
        elif re.search(r'programm[ae]|programme', line, re.IGNORECASE):
            if any(nl_word in line.lower() for nl_word in ['maand', 'week', 'het']):
                meta['titre_nl'] = line
            else:
                meta['titre_fr'] = line

    # Détecter la période
    if re.search(r'ramadan', full_text, re.IGNORECASE):
        meta['periode'] = 'Ramadan'
    year_m = re.search(r'20\d{2}', full_text)
    if year_m:
        meta['periode'] = (meta['periode'] or '') + ' ' + year_m.group(0)
        meta['periode'] = meta['periode'].strip()

    return meta


# ================================================================
# POINT D'ENTRÉE PRINCIPAL
# ================================================================

def process_image(image_path: str) -> dict:
    """
    Pipeline complet : image → JSON structuré.
    Retourne un dict avec les événements extraits.
    """
    print(f"\n[OCR] Traitement: {image_path}")

    # 1. Charger et prétraiter l'image
    try:
        img = Image.open(image_path)
    except Exception as e:
        return {'error': f'Impossible de charger l\'image: {e}', 'events': []}

    img_processed = preprocess_image(img)
    W, H = img_processed.size
    print(f"  Image: {W}x{H}")

    # 2. Détecter les langues disponibles
    langs = detect_available_langs()
    print(f"  Langues Tesseract: {langs}")

    # 3. Extraire le texte brut
    full_text = extract_text_raw(img_processed, langs)
    print(f"  Texte extrait: {len(full_text)} caractères")

    # 4. Détecter le type de contenu
    content_type = detect_image_content_type(full_text)
    print(f"  Type détecté: {content_type}")

    # 5. Extraire les métadonnées
    meta = extract_programme_meta(full_text)

    # 6. Parser selon le type
    if content_type == 'tableau_programme':
        # Extraction avec coordonnées pour reconstruire le tableau
        df_words = extract_words_with_coords(img_processed, langs)
        df_cols  = detect_table_columns(df_words, W)
        rows     = group_into_rows(df_cols)
        print(f"  Lignes tableau détectées: {len(rows)}")
        events = parse_programme_table(rows, full_text)
    else:
        events = parse_text_announcement(full_text)

    # 7. Enrichir avec les métadonnées du programme
    for evt in events:
        evt['programme'] = {
            'fr': meta.get('titre_fr'),
            'ar': meta.get('titre_ar'),
            'nl': meta.get('titre_nl'),
        }
        if meta.get('periode'):
            evt['period'] = meta['periode']

    print(f"  Événements extraits: {len(events)}")

    return {
        'source_image': str(image_path),
        'content_type': content_type,
        'langs_used':   langs,
        'meta':         meta,
        'events':       events,
        'extracted_at': datetime.now().isoformat(),
    }


def merge_into_events_json(new_events: list[dict], output_file: str):
    """Fusionne les nouveaux événements dans events.json (sans doublons)."""
    store = {'lastUpdated': None, 'events': []}
    if os.path.exists(output_file):
        try:
            with open(output_file) as f:
                store = json.load(f)
        except Exception:
            pass

    existing_ids = {e['id'] for e in store.get('events', [])}
    added = 0
    for evt in new_events:
        if evt['id'] not in existing_ids:
            store['events'].append(evt)
            existing_ids.add(evt['id'])
            added += 1

    store['lastUpdated'] = datetime.now().isoformat()

    os.makedirs(os.path.dirname(output_file) or '.', exist_ok=True)
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(store, f, ensure_ascii=False, indent=2)

    print(f"\n[OK] {added} nouveaux événements ajoutés dans {output_file}")
    print(f"     Total: {len(store['events'])} événements")


# ================================================================
# CLI
# ================================================================

if __name__ == '__main__':
    parser = argparse.ArgumentParser(
        description='Extrait des événements depuis des images d\'annonces de mosquée (OCR gratuit)'
    )
    parser.add_argument('image', nargs='?', help='Chemin vers l\'image à traiter')
    parser.add_argument('--output', '-o', default='data/events.json',
                        help='Fichier events.json de sortie (défaut: data/events.json)')
    parser.add_argument('--json-only', action='store_true',
                        help='Affiche seulement le JSON, sans sauvegarder')
    parser.add_argument('--watch', metavar='DIR',
                        help='Surveille un dossier et traite les nouvelles images')
    args = parser.parse_args()

    if args.watch:
        # Mode surveillance de dossier
        import time
        watch_dir = Path(args.watch)
        processed = set()
        print(f"[WATCH] Surveillance de {watch_dir} (Ctrl+C pour arrêter)...")
        while True:
            for img_file in watch_dir.glob('*.{jpg,jpeg,png,webp}'):
                if img_file not in processed:
                    result = process_image(str(img_file))
                    if result['events']:
                        merge_into_events_json(result['events'], args.output)
                    processed.add(img_file)
            time.sleep(30)

    elif args.image:
        result = process_image(args.image)
        if args.json_only:
            print(json.dumps(result, ensure_ascii=False, indent=2))
        else:
            print("\n=== RÉSULTAT ===")
            print(json.dumps(result['events'], ensure_ascii=False, indent=2))
            if result['events']:
                merge_into_events_json(result['events'], args.output)
    else:
        parser.print_help()
