'use strict';
const CONTACT_CONFIG={lat:50.84344,lng:4.38785,zoom:16,address:{fr:'Parc du Cinquantenaire 29\n1000 Bruxelles, Belgique',ar:'حديقة السينكونتينير 29\n1000 بروكسل، بلجيكا',nl:'Jubelpark 29\n1000 Brussel, België'},phone:'+32 2 735 21 75',email:'info@grande-mosquee.be',directionsUrl:'https://www.openstreetmap.org/directions?to=50.84344%2C4.38785'};
const CONTACT_I18N={fr:{address_label:'Adresse',phone_label:'Téléphone',email_label:'Email',directions:'Itinéraire',map_credit:'Carte © OpenStreetMap contributors',popup_title:'Grande Mosquée de Bruxelles',popup_title_ar:'المسجد الكبير في بروكسل'},ar:{address_label:'العنوان',phone_label:'الهاتف',email_label:'البريد الإلكتروني',directions:'الاتجاهات',map_credit:'الخريطة © OpenStreetMap',popup_title:'Grande Mosquée de Bruxelles',popup_title_ar:'المسجد الكبير في بروكسل'},nl:{address_label:'Adres',phone_label:'Telefoon',email_label:'E-mail',directions:'Routebeschrijving',map_credit:'Kaart © OpenStreetMap contributors',popup_title:'Grote Moskee van Brussel',popup_title_ar:'المسجد الكبير في بروكسل'}};
function getLang(){return document.documentElement.getAttribute('data-lang')||'fr';}
function ct(key){const lang=getLang();return(CONTACT_I18N[lang]||CONTACT_I18N.fr)[key]||key;}
const Contact={map:null,marker:null,
init(){
  const section=document.getElementById('contact');
  if(!section)return;
  this.renderShell(section);
  if(typeof L!=='undefined')this.initMap();
  else{const s=document.querySelector('script[src*="leaflet"]');if(s)s.addEventListener('load',()=>this.initMap());}
  document.querySelectorAll('.lang-btn').forEach(btn=>btn.addEventListener('click',()=>setTimeout(()=>this.updateLang(),50)));
},
renderShell(section){
  const lang=getLang();
  const addr=(CONTACT_CONFIG.address[lang]||CONTACT_CONFIG.address.fr).split('\n');
  const c=section.querySelector('#contact-content')||section.querySelector('.container');
  if(!c)return;
  c.innerHTML=`<div class="contact-layout">
  <div class="contact-info-block">
    <div class="contact-card">
      <div class="contact-card-icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg></div>
      <div class="contact-card-label" data-contact-i18n="address_label">${ct('address_label')}</div>
      <div class="contact-card-value" id="contact-addr">${addr.join('<br/>')}</div>
      <span class="contact-card-value-ar">${CONTACT_CONFIG.address.ar.split('\n').join('<br/>')}</span>
      <a href="#" onclick="Contact.openDirections(event)" class="contact-directions-btn">
        <svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round"><path d="M3 12h18M13 6l6 6-6 6"/></svg>
        <span data-contact-i18n="directions">${ct('directions')}</span>
      </a>
    </div>
    <div class="contact-card">
      <div class="contact-card-icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.8 19.79 19.79 0 01.01 1.18 2 2 0 012 0h3a2 2 0 012 1.72c.18.97.45 1.9.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.9.25 1.84.52 2.81.7A2 2 0 0122 16z"/></svg></div>
      <div class="contact-card-label" data-contact-i18n="phone_label">${ct('phone_label')}</div>
      <div class="contact-card-value"><a href="tel:+3227352175">${CONTACT_CONFIG.phone}</a></div>
    </div>
    <div class="contact-card">
      <div class="contact-card-icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg></div>
      <div class="contact-card-label" data-contact-i18n="email_label">${ct('email_label')}</div>
      <div class="contact-card-value"><a href="mailto:${CONTACT_CONFIG.email}">${CONTACT_CONFIG.email}</a></div>
    </div>
  </div>
  <div class="contact-map-block">
    <div id="contact-map" role="application" aria-label="Carte OpenStreetMap"></div>
    <div class="contact-map-credit"><span data-contact-i18n="map_credit">${ct('map_credit')}</span> — <a href="https://www.openstreetmap.org/?mlat=${CONTACT_CONFIG.lat}&mlon=${CONTACT_CONFIG.lng}#map=16/${CONTACT_CONFIG.lat}/${CONTACT_CONFIG.lng}" target="_blank" rel="noopener">Plein écran</a></div>
  </div>
</div>`;
},

openDirections(e){
  e.preventDefault();
  const lat=CONTACT_CONFIG.lat, lng=CONTACT_CONFIG.lng;
  const isIOS=/iPad|iPhone|iPod/.test(navigator.userAgent);
  const isAndroid=/Android/.test(navigator.userAgent);
  if(isIOS){
    // Propose Maps natif iOS ou Google Maps
    const choice=confirm("Ouvrir avec Google Maps ?\n(Annuler = Plans Apple)");
    if(choice) window.open(`https://maps.google.com/?daddr=${lat},${lng}&directionsmode=driving`,'_blank');
    else window.open(`maps://maps.apple.com/?daddr=${lat},${lng}`,'_blank');
  } else if(isAndroid){
    window.open(`https://maps.google.com/?daddr=${lat},${lng}&directionsmode=driving`,'_blank');
  } else {
    // PC — Google Maps
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,'_blank');
  }
},
initMap(){
  const el=document.getElementById('contact-map');
  if(!el||this.map)return;
  this.map=L.map('contact-map',{center:[CONTACT_CONFIG.lat,CONTACT_CONFIG.lng],zoom:CONTACT_CONFIG.zoom,scrollWheelZoom:false,attributionControl:false});
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(this.map);
  const icon=L.divIcon({html:`<div style="width:36px;height:36px;background:#0f4a32;border-radius:50% 50% 50% 50%/60% 60% 40% 40%;border:2px solid #c9a84c;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.3)"><svg viewBox="0 0 24 28" width="18" height="18" fill="none"><rect x="2" y="14" width="20" height="12" rx="1" fill="#c9a84c" opacity=".3"/><path d="M3 14 Q3 4 12 4 Q21 4 21 14 Z" fill="#c9a84c" opacity=".4"/><path d="M3 14 Q3 4 12 4 Q21 4 21 14" fill="none" stroke="#c9a84c" stroke-width="1.5"/><rect x="10.5" y="0" width="3" height="6" fill="#c9a84c" opacity=".9"/><polygon points="10.5,0 13.5,0 12,-2" fill="#c9a84c"/></svg></div>`,className:'',iconSize:[36,36],iconAnchor:[18,36],popupAnchor:[0,-40]});
  this.marker=L.marker([CONTACT_CONFIG.lat,CONTACT_CONFIG.lng],{icon}).addTo(this.map).bindPopup(`<div style="font-family:sans-serif"><div style="font-weight:600;color:#0f4a32;margin-bottom:4px">${ct('popup_title')}</div><div style="color:#c9a84c;direction:rtl;margin-bottom:6px">${ct('popup_title_ar')}</div><div style="font-size:.82rem;color:#5a5a4a">Parc du Cinquantenaire 29<br/>1000 Bruxelles</div></div>`,{maxWidth:220}).openPopup();
  setTimeout(()=>this.map.panBy([0,-50]),300);
},
updateLang(){
  const lang=getLang();
  const addr=(CONTACT_CONFIG.address[lang]||CONTACT_CONFIG.address.fr).split('\n');
  document.querySelectorAll('[data-contact-i18n]').forEach(el=>{el.textContent=ct(el.getAttribute('data-contact-i18n'));});
  const a=document.getElementById('contact-addr');if(a)a.innerHTML=addr.join('<br/>');
  if(this.marker)this.marker.setPopupContent(`<div style="font-family:sans-serif"><div style="font-weight:600;color:#0f4a32;margin-bottom:4px">${ct('popup_title')}</div><div style="color:#c9a84c;direction:rtl;margin-bottom:6px">${ct('popup_title_ar')}</div><div style="font-size:.82rem;color:#5a5a4a">${addr.join('<br/>')}</div></div>`);
}};
document.addEventListener('DOMContentLoaded',()=>Contact.init());
window.Contact=Contact;
