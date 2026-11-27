// Steuerung: Navigation, Statusanzeige, Klicks, Verbinden.
import { VERSION } from './konfig.js';
import { $, esc, svg, uhrzeit, datum } from './hilfen.js';
import { googleDrive } from './drive.js';
import { Z, beobachten, ausCacheStarten, beispielStarten, zurBegruessung, anmelden, verbinden, privatBestaetigen, trennen, konfliktLoesen, aktualisieren, speichernJetzt, eingangLesen } from './speicher.js';
import * as V from './ansichten.js';
import { formular, absenden, loeschFrage, loeschSperre, loeschen } from './formulare.js';
import { vorsorgeLage } from './modell.js';
import { importLesen, importVorschau, importAnwenden } from './import.js';
import { aendern, dateienVerknuepfen, inEingangHochladen, fachordnerPruefen, dateiInPapierkorb } from './speicher.js';
import { vorschlaegeErstellen } from './erkennung.js';
import { vorschlagUebernehmen } from './formulare.js';
import { fehlgeschlageneDokumente, schluesselLaden, schluesselEntfernen, schluesselVergessen, eingangAuswerten, eingangAutomatisch, dokumentAuswerten, offeneDokumente, stapelAuswerten, stapelStoppen } from './auswertung.js';
import { duplikatVon } from './speicher.js';
import { tkAuslesen, tkAbgleich, tkUebernehmen, tkZeitraumAnpassen, tkIgnorieren } from './tk.js';
import { erinnerungenAbgleichen, erinnerungenEntfernen } from './erinnerungen.js';

/** Dateien in den Eingang laden (Ziehen, Auswahl, Teilen) – mit Fortschritt. */
async function hochladen(dateien) {
  if (!dateien?.length) return;
  if (Z.modus !== 'konto') { toast('Im Beispielmodus werden keine Dateien gespeichert.', 'fehler'); return; }
  if (!drive.verbunden()) { toast('Bitte zuerst verbinden, dann die Dateien erneut ablegen.', 'fehler'); return; }
  try {
    const n = await inEingangHochladen([...dateien], text => toast(text));
    toast(`${n} ${n === 1 ? 'Datei' : 'Dateien'} im Eingang. Die Erkennung läuft …`);
    if (location.hash !== '#dokumente') location.hash = '#dokumente'; else zeichnen();
  } catch (e) { toast(e.message, 'fehler'); }
}
// ---------- Vom Handy geteilte Dateien (Service Worker legt sie in einen Zwischenspeicher) ----------
const GETEILT = 'gesundheitsakte-geteilt';
async function geteilteLesen() {
  if (!('caches' in window)) return [];
  const cache = await caches.open(GETEILT);
  const schluessel = await cache.keys();
  return Promise.all(schluessel.map(async k => {
    const r = await cache.match(k);
    const blob = await r.blob();
    return { schluessel: k, datei: new File([blob], decodeURIComponent(r.headers.get('X-Dateiname') || 'Datei'), { type: blob.type }) };
  }));
}
async function geteilteAblegen() {
  const liste = await geteilteLesen();
  Z.geteiltWartend = liste.length;
  if (!liste.length) return;
  if (Z.modus !== 'konto' || !drive.verbunden()) { zeichnen(); return; }   // Hinweis mit „Verbinden“ wird angezeigt
  try {
    await inEingangHochladen(liste.map(x => x.datei), text => toast(text));
    const cache = await caches.open(GETEILT);
    for (const x of liste) await cache.delete(x.schluessel);
    Z.geteiltWartend = 0;
    toast(`${liste.length} geteilte ${liste.length === 1 ? 'Datei liegt' : 'Dateien liegen'} im Eingang.`);
    location.hash = '#dokumente'; zeichnen();
  } catch (e) { toast(e.message, 'fehler'); }
}

/** Erkennung für Eingang und unerfasste Dateien anstoßen (läuft im Hintergrund, zeichnet nach jeder Datei neu). */
function erkennungAnstossen() {
  if (Z.modus !== 'konto' || !drive.verbunden()) return;
  const dateien = [...(Z.eingang || []), ...(Z.unerfasst || [])];
  const neuZeichnen = () => { if (ansichtId() === 'dokumente' && !$('#ebene form')) zeichnen(); };
  if (dateien.length) vorschlaegeErstellen(dateien, neuZeichnen)
    .then(() => eingangAutomatisch(f => !!duplikatVon(f), neuZeichnen, (text, art) => toast(text, art)))
    .catch(e => { if (e?.name === 'AnmeldungNoetig') statusZeichnen(); else toast(e.message, 'fehler'); });
}
/** Schlüssel für die Befund-Auswertung still aus Drive laden (nach dem Verbinden). */
function kiStill() { schluesselLaden().then(() => { if (['einstellungen', 'dokumente'].includes(ansichtId()) && !$('#ebene form')) zeichnen(); }).catch(e => console.warn('Claude-Schlüssel:', e)); }
import { kalenderAbgleichen, kandidatIgnorieren, regelLoeschen, terminIgnorieren, personEntfernen } from './kalender.js';
import { finde } from './modell.js';

/** Kalender im Hintergrund abgleichen; meldet nur, wenn sich etwas getan hat (oder wenn ausdrücklich angestoßen). */
async function kalenderStill(laut = false) {
  try {
    const r = await kalenderAbgleichen();
    zeichnen();
    if (r.status === 'ok' && (laut || r.neu)) toast(`Kalender abgeglichen: ${r.neu} neue, ${r.geaendert} aktualisierte Arzttermine${r.kandidaten.length ? `, ${r.kandidaten.length} zum Zuordnen` : ''}.`);
    else if (laut && r.status === 'keinZugriff') toast('Kein Zugriff auf den Google Kalender. Bitte „Zugriff erlauben“ wählen.', 'fehler');
    else if (laut && r.status === 'fehler') toast(r.fehler, 'fehler');
  } catch (e) { if (e?.name === 'AnmeldungNoetig') { statusZeichnen(); if (laut) toast(e.message, 'fehler'); } }
  await erinnerungenStill();
}
/** Vorsorge-Erinnerungen im Kalender abgleichen (still, oder mit Meldung bei laut). */
async function erinnerungenStill(laut = false) {
  try {
    const r = await erinnerungenAbgleichen();
    if (r.status === 'ok' && (laut || r.neu || r.entfernt)) toast(`Vorsorge-Erinnerungen: ${r.neu} neu, ${r.geaendert} angepasst, ${r.entfernt} entfernt.`);
    else if (laut && r.status === 'keinZugriff') toast('Die App darf noch nicht in deinen Kalender schreiben. Bitte „Zugriff erlauben“ wählen.', 'fehler');
    else if (r.status === 'fehler') toast('Kalender-Erinnerungen: ' + r.fehler, 'fehler');
    if (['vorsorge', 'einstellungen', 'start'].includes(ansichtId()) && !$('#ebene form')) zeichnen();
  } catch (e) { if (e?.name === 'AnmeldungNoetig') { statusZeichnen(); if (laut) toast(e.message, 'fehler'); } }
}

let wartenderImport = null;
async function importDateiGewaehlt(datei) {
  try {
    const d = importLesen(await datei.text());
    const v = importVorschau(Z.akte, d);
    wartenderImport = d;
    const zeile = (n, text, vorhanden, hinweis = 'schon vorhanden, werden übersprungen') => `<div class="zeile"><div class="grow"><div class="t">${n} ${text}</div>${vorhanden ? `<div class="s">${vorhanden} ${hinweis}</div>` : ''}</div></div>`;
    blatt(`${V.blattKopf('Daten übernehmen', d.quelle || 'Import')}
      <p class="small" style="margin:0">${esc(d.beschreibung || '')} Datei: <span class="mono">${esc(datei.name)}</span></p>
      <section class="panel"><div class="liste">
        ${zeile(v.erkrankungen, 'Erkrankungen und Behandlungen', v.erkrankungenVorhanden)}
        ${zeile(v.aerzte, 'Ärzte und Praxen neu', v.aerzteVorhanden, 'gibt es schon in der Akte, fehlende Angaben werden ergänzt')}
        ${zeile(v.termine, 'Arzttermine', v.termineVorhanden)}
        ${zeile(v.dokumente, 'Dokumente und Befunde', v.dokumenteVorhanden)}
        ${zeile(v.medikamente, 'Medikamente', v.medikamenteVorhanden)}
        ${zeile(v.vorsorge, 'Vorsorge-Daten werden aktualisiert', 0)}
        ${v.kategorien ? zeile(v.kategorien, 'neuer Fachbereich', 0) : ''}
      </div></section>
      <p class="small muted" style="margin:0">Nichts wird gelöscht. Alles lässt sich danach einzeln bearbeiten.${Z.modus === 'beispiel' ? ' Im Beispielmodus wird nichts gespeichert.' : ''}</p>
      <div class="knoepfe"><button class="btn primaer" data-aktion="import-ja">Übernehmen</button><button class="btn" data-zu>Abbrechen</button></div>`);
  } catch (e) { toast(e.message, 'fehler'); }
}

const TEST = new URLSearchParams(location.search).has('test');
let drive = googleDrive;
if (TEST) drive = (await import('./drive-test.js')).testDrive;

const TABS = [['start', 'Übersicht'], ['verlauf', 'Verlauf'], ['faecher', 'Fächer'], ['termine', 'Termine'], ['mehr', 'Mehr']];

// ---------- Zeichnen ----------
function ansichtId() {
  const h = (location.hash || '#start').slice(1);
  if (h.startsWith('fach-') || h.startsWith('sp-')) return h;
  return ['start', 'verlauf', 'faecher', 'termine', 'dokumente', 'vorsorge', 'aerzte', 'tk', 'einstellungen', 'mehr'].includes(h) ? h : 'start';
}
function zaehler(id) {
  const a = Z.akte; if (!a) return 0;
  const ueber = a.vorsorge.filter(v => vorsorgeLage(a, v).status === 'ueber').length;
  const ein = Z.eingang?.length || 0;
  return { dokumente: ein, vorsorge: ueber, mehr: ein + ueber }[id] || 0;
}
function navZeichnen(aktiv) {
  const basis = aktiv.startsWith('fach-') ? 'faecher' : aktiv;
  const sichtbar = !!Z.akte;
  $('#nav-seite').innerHTML = sichtbar ? V.navListe().map(([id, txt, icon]) => {
    const z = zaehler(id);
    return `<a href="#${id}" class="${basis === id ? 'aktiv' : ''}">${svg(icon || id)}${txt}${z ? `<span class="badge">${z}</span>` : ''}</a>`;
  }).join('') : '';
  const tabAktiv = V.MEHR_ZIELE.includes(basis) || basis.startsWith('sp-') ? 'mehr' : basis;
  $('#nav-tabs').innerHTML = sichtbar ? TABS.map(([id, txt]) => {
    const z = zaehler(id);
    return `<a href="#${id}" class="${tabAktiv === id ? 'aktiv' : ''}">${svg(id)}${txt}${z ? `<span class="badge">${z}</span>` : ''}</a>`;
  }).join('') : '';
  document.body.classList.toggle('ohne-nav', !sichtbar);
}
function statusZeichnen() {
  let html = '';
  if (Z.modus === 'beispiel') html = `<span class="status st-spaeter">Beispieldaten</span>`;
  else if (Z.modus === 'konto') {
    const s = Z.status;
    if (s === 'verbinde') html = `<span class="status st-geplant">${svg('wolke')}Verbinde …</span>`;
    else if (s === 'speichert') html = `<span class="status st-geplant">${svg('wolke')}Speichert …</span>`;
    else if (s === 'bereit') html = Z.ungespeichert ? `<span class="status st-bald">${svg('wolke')}Nicht gespeichert</span>`
      : `<span class="status st-ok" title="${esc(Z.konto?.email)}">${svg('wolke')}In Drive gespeichert${Z.zuletztGespeichert ? ' · ' + uhrzeit(Z.zuletztGespeichert) : ''}</span>`;
    else if (s === 'konflikt') html = `<button class="status st-ueber" data-aktion="konflikt">${svg('wolke_aus')}Zwei Stände – bitte wählen</button>`;
    else if (s === 'fehler') html = `<button class="status st-ueber" data-aktion="verbinden" title="${esc(Z.meldung)}">${svg('wolke_aus')}Fehler – erneut versuchen</button>`;
    else html = `<button class="status ${Z.ungespeichert ? 'st-bald' : 'st-spaeter'}" data-aktion="verbinden">${svg('wolke_aus')}${Z.ungespeichert ? 'Nicht gespeichert · ' : ''}Verbinden</button>`;
  }
  $('#status-seite').innerHTML = html;
  $('#status-oben').innerHTML = html;
}

let letzteAnsicht = '';
export function zeichnen() {
  const id = ansichtId();
  const inhalt = $('#inhalt');
  const scroll = id === letzteAnsicht ? window.scrollY : 0;
  // Fokus in einem Suchfeld nicht verlieren
  const fokus = document.activeElement?.id;
  if (Z.modus === 'leer') inhalt.innerHTML = V.ansichtBegruessung();
  else if (!Z.akte) inhalt.innerHTML = Z.status === 'verbinde' ? '<div class="laden">Verbinde mit Google Drive …</div>' : V.ansichtEinrichtung();
  else if (id.startsWith('fach-')) inhalt.innerHTML = V.ansichtFach(id.slice(5));
  else if (id.startsWith('sp-')) inhalt.innerHTML = V.ansichtSchwerpunkt(id.slice(3));
  else inhalt.innerHTML = ({ start: V.ansichtStart, verlauf: V.ansichtVerlauf, faecher: V.ansichtFaecher, termine: V.ansichtTermine, dokumente: V.ansichtDokumente, vorsorge: V.ansichtVorsorge, aerzte: V.ansichtAerzte, tk: V.ansichtTK, einstellungen: V.ansichtEinstellungen, mehr: V.ansichtMehr })[id]();
  if (id === 'dokumente') { V.docListeZeichnen(); setTimeout(erkennungAnstossen, 50); }
  const lanes = $('.lanes-wrap'); if (lanes) lanes.scrollLeft = lanes.scrollWidth;
  navZeichnen(id); statusZeichnen();
  if (fokus && document.getElementById(fokus) && fokus.startsWith('f-')) { const el = document.getElementById(fokus); el.focus(); if (el.setSelectionRange && el.type === 'search') el.setSelectionRange(el.value.length, el.value.length); }
  window.scrollTo(0, scroll);
  letzteAnsicht = id;
  if (Z.konflikt && !$('#ebene .konflikt')) konfliktZeigen();
}
let zeichnenGeplant = false;
beobachten(() => {
  if (zeichnenGeplant) return;
  zeichnenGeplant = true;
  requestAnimationFrame(() => { zeichnenGeplant = false; if (!$('#ebene').innerHTML || !$('#ebene form')) zeichnen(); else { statusZeichnen(); } });
});

// ---------- Blatt (Detail/Formular) ----------
function blatt(html) {
  if (!html) return;
  $('#ebene').innerHTML = `<div class="schleier" data-schleier><div class="blatt" role="dialog" aria-modal="true">${html}</div></div>`;
  document.body.classList.add('blatt-offen');
  const erstes = $('#ebene .blatt input:not([type=hidden]):not([readonly]), #ebene .blatt select, #ebene .schliessen');
  erstes?.focus({ preventScroll: true });
}
function blattZu() { $('#ebene').innerHTML = ''; document.body.classList.remove('blatt-offen'); zeichnen(); }

let toastTimer;
export function toast(text, art = '') {
  let t = $('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = text; t.className = 'toast ' + art; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 4500);
}

// ---------- Verbinden ----------
async function verbindenStarten() {
  const r = await anmelden(drive);
  if (r.frage === 'privat') {
    blatt(`${V.blattKopf('Google-Konto prüfen', 'Ist das dein privates Konto?')}
      <p>Du hast dich mit <b>${esc(r.konto.email)}</b> angemeldet. Das ist kein gmail.com-Konto. Gesundheitsdaten gehören nicht in ein Firmenkonto, denn dort hat die Verwaltung des Arbeitgebers Zugriff.</p>
      <div class="knoepfe"><button class="btn primaer" data-aktion="privat-ja" data-email="${esc(r.konto.email)}" data-name="${esc(r.konto.name || '')}">Ja, das ist mein privates Konto</button>
      <button class="btn" data-aktion="privat-nein">Nein, anderes Konto wählen</button></div>`);
    return;
  }
  if (r.fehler) toast(r.fehler.message, 'fehler');
  else if (Z.status === 'bereit') { toast(`Verbunden mit ${Z.konto.email}`); kalenderStill(); geteilteAblegen(); kiStill(); }
}
function konfliktZeigen() {
  const k = Z.konflikt; if (!k) return;
  const eigen = Z.akte, fremd = k.fremd;
  const zahl = a => `${a.aerzte.length} Ärzte, ${a.erkrankungen.length} Erkrankungen, ${a.dokumente.length} Dokumente, ${a.termine.length} Termine`;
  const zeit = a => a.geaendert ? new Date(a.geaendert).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : 'unbekannt';
  $('#ebene').innerHTML = `<div class="schleier"><div class="blatt konflikt" role="alertdialog" aria-modal="true">
    ${V.blattKopf('Abgleich', 'Die Akte wurde auf einem anderen Gerät geändert')}
    <p>Auf diesem Gerät gibt es Änderungen, die noch nicht in Drive sind. Gleichzeitig wurde die Akte in Drive von einem anderen Gerät geändert. Welcher Stand soll gelten? Der andere wird als Sicherung in <span class="mono">90_Sicherungen</span> aufbewahrt, sobald gespeichert wird.</p>
    <div class="wahl">
      <button class="wahl-karte" data-aktion="konflikt-eigen"><b>Stand dieses Geräts</b><span>geändert ${zeit(eigen)}</span><span class="small muted">${zahl(eigen)}</span></button>
      <button class="wahl-karte" data-aktion="konflikt-fremd"><b>Stand aus Google Drive</b><span>geändert ${zeit(fremd)}</span><span class="small muted">${zahl(fremd)}</span></button>
    </div></div></div>`;
}

// ---------- Klicks ----------
document.addEventListener('click', async ev => {
  const el = ev.target.closest('[data-doc],[data-arzt],[data-erk],[data-termin],[data-vorsorge],[data-neu],[data-bearbeiten],[data-loeschen],[data-erledigt],[data-einordnen],[data-aktion],[data-copy],[data-vfilter],[data-vaktiv],[data-tmodus],[data-zu],[data-schleier],[data-loeschen-ja],[data-loeschen-nein],[data-kandidat],[data-kandidat-ignorieren],[data-termin-ignorieren],[data-regel-loeschen],[data-person-entfernen],[data-vorschlag-ok],[data-duplikat-weg],[data-ki-eingang],[data-ki-doc],[data-tk-lesen],[data-tk-neu],[data-tk-ignorieren],[data-tk-zeigen],[data-tk-zeitraum],[data-bdart],[data-sp-dokumente]');
  if (!el) return;
  if (el.hasAttribute('data-schleier') && ev.target !== el) return;
  const d = el.dataset;
  if (el.hasAttribute('data-schleier') || el.hasAttribute('data-zu')) { if (!Z.konflikt) blattZu(); return; }
  if (d.doc) return blatt(V.blattDokument(d.doc));
  if (d.arzt) return blatt(V.blattArzt(d.arzt));
  if (d.erk) return blatt(V.blattErkrankung(d.erk));
  if (d.termin) return blatt(V.blattTermin(d.termin));
  if (d.vorsorge) return blatt(formular('vorsorge', d.vorsorge));
  if (d.neu) return blatt(d.neu === 'profil' ? formular('profil') : formular(d.neu, null, { kat: d.kat || '' }));
  if (d.bearbeiten) { const [typ, id] = d.bearbeiten.split(':'); return blatt(formular(typ, id)); }
  if (d.erledigt) return blatt(formular('erledigt', d.erledigt));
  if (d.einordnen) return blatt(formular('dokument', null, { eingang: d.einordnen, quelle: 'TK-ePA' }));
  if (d.kandidat) return blatt(formular('kandidat', d.kandidat));
  if (d.kandidatIgnorieren) { kandidatIgnorieren(d.kandidatIgnorieren); zeichnen(); toast('Wird nicht mehr als Arzttermin vorgeschlagen.'); return; }
  if (d.terminIgnorieren) { const t = finde(Z.akte, 'termine', d.terminIgnorieren); if (t) { terminIgnorieren(t); blattZu(); toast('Aus den Arztterminen entfernt. Der Kalendereintrag bleibt unverändert.'); } return; }
  if (d.regelLoeschen !== undefined) { regelLoeschen(+d.regelLoeschen); zeichnen(); toast('Regel gelöscht.'); return; }
  if (d.vorschlagOk) {
    el.disabled = true;
    try { toast(await vorschlagUebernehmen(d.vorschlagOk)); zeichnen(); } catch (e) { el.disabled = false; toast(e.message, 'fehler'); }
    return;
  }
  if (d.kiEingang) {
    const f = [...(Z.eingang || []), ...(Z.unerfasst || [])].find(x => x.id === d.kiEingang); if (!f) return;
    try { await eingangAuswerten(f, () => { if (ansichtId() === 'dokumente' && !$('#ebene form')) zeichnen(); }); toast('Ausgewertet. Bitte prüfen und übernehmen.'); }
    catch (e) { toast(e.message, 'fehler'); if (e.name === 'KeinSchluessel') location.hash = '#einstellungen'; }
    zeichnen(); return;
  }
  if (d.bdart) { V.spFilter.bd = d.bdart; return zeichnen(); }
  if (d.spDokumente) { V.docFilter.sp = d.spDokumente; location.hash = '#dokumente'; return; }
  if (d.tkLesen) {
    const neu = () => { if (ansichtId() === 'tk' && !$('#ebene form')) zeichnen(); };
    try { const r = await tkAuslesen(d.tkLesen, neu); if (r) toast(`${r.eintraege} Arztkontakte mit ${r.diagnosen} Diagnosen ausgelesen.`); }
    catch (e) { toast(e.message, 'fehler'); }
    neu(); return;
  }
  if (d.tkNeu) { if (tkUebernehmen(d.tkNeu)) { zeichnen(); toast('Als Erkrankung in den Verlauf übernommen.'); } return; }
  if (d.tkIgnorieren) { tkIgnorieren(d.tkIgnorieren); zeichnen(); toast('Wird nicht mehr vorgeschlagen.'); return; }
  if (d.tkZeigen) { tkIgnorieren(d.tkZeigen, false); zeichnen(); return; }
  if (d.tkZeitraum) { if (tkZeitraumAnpassen(d.tkZeitraum)) { zeichnen(); toast('Zeitraum der Erkrankung ergänzt.'); } return; }
  if (d.kiDoc) {
    const id = d.kiDoc;
    const offenBlatt = () => { if ($('#ebene .blatt') && !$('#ebene form')) blatt(V.blattDokument(id)); };
    const p = dokumentAuswerten(id);
    offenBlatt();
    try { await p; toast('Dokument ausgewertet.'); }
    catch (e) { toast(e.message, 'fehler'); if (e.name === 'KeinSchluessel') { blattZu(); location.hash = '#einstellungen'; } }
    offenBlatt(); zeichnen(); return;
  }
  if (d.duplikatWeg) {
    el.disabled = true;
    try { await dateiInPapierkorb(d.duplikatWeg); Z.eingang = (Z.eingang || []).filter(f => f.id !== d.duplikatWeg); Z.unerfasst = (Z.unerfasst || []).filter(f => f.id !== d.duplikatWeg); zeichnen(); toast('Doppelte Datei liegt im Drive-Papierkorb (30 Tage wiederherstellbar).'); }
    catch (e) { el.disabled = false; toast(e.message, 'fehler'); }
    return;
  }
  if (d.personEntfernen) { personEntfernen(d.personEntfernen); zeichnen(); toast(`${d.personEntfernen} wird wieder berücksichtigt.`); return; }
  if (d.loeschen) {
    const [typ, id] = d.loeschen.split(':');
    const form = el.closest('form');
    const best = form.querySelector('.bestaetigung');
    const frage = loeschFrage(typ, id);
    best.innerHTML = frage ? `<p>${esc(frage)}</p><div class="knoepfe"><button type="button" class="btn gefahr" data-loeschen-ja="${esc(d.loeschen)}">Ja, löschen</button><button type="button" class="btn" data-loeschen-nein>Nein</button></div>`
      : `<p>${esc(loeschSperre(typ, id))}</p><div class="knoepfe"><button type="button" class="btn" data-loeschen-nein>Verstanden</button></div>`;
    best.hidden = false; form.querySelector('.formular-knoepfe').hidden = true;
    best.querySelector('button').focus();
    return;
  }
  if (el.hasAttribute('data-loeschen-nein')) { const form = el.closest('form'); form.querySelector('.bestaetigung').hidden = true; form.querySelector('.formular-knoepfe').hidden = false; return; }
  if (d.loeschenJa) {
    const [typ, id] = d.loeschenJa.split(':');
    try { el.disabled = true; toast(await loeschen(typ, id)); blattZu(); }
    catch (e) { el.disabled = false; formFehler(el.closest('form'), e.message); }
    return;
  }
  if (d.copy) {
    try { await navigator.clipboard.writeText(d.copy); toast('Telefonnummer kopiert: ' + d.copy); } catch { toast('Nummer: ' + d.copy); }
    return;
  }
  if (d.vfilter) { V.verlaufFilter.kat = d.vfilter; return zeichnen(); }
  if (el.hasAttribute('data-vaktiv')) { V.verlaufFilter.nurAktiv = !V.verlaufFilter.nurAktiv; return zeichnen(); }
  if (d.tmodus) { V.termineFilter.modus = d.tmodus; return zeichnen(); }

  switch (d.aktion) {
    case 'verbinden': return verbindenStarten();
    case 'beispiel': beispielStarten(); location.hash = '#start'; return;
    case 'begruessung': zurBegruessung(); return;
    case 'privat-ja': privatBestaetigen(d.email); blattZu(); await verbinden({ email: d.email, name: d.name }); if (Z.status === 'bereit') { toast(`Verbunden mit ${d.email}`); kalenderStill(); geteilteAblegen(); kiStill(); } return;
    case 'kalender-abgleich': if (!drive.verbunden()) await verbindenStarten(); else await kalenderStill(true); return;
    case 'kalender-freigeben': await verbindenStarten(); return;
    case 'kalender-wahl': {
      try { const liste = await drive.kalenderListe(); Z.kalenderNamen = Object.fromEntries(liste.map(k => [k.id, k.name])); blatt(formular('kalenderwahl', '', { liste })); }
      catch (e) { toast(e.message, 'fehler'); }
      return;
    }
    case 'kalender-ignoriert-zuruecksetzen':
      aendern(a => { a.einstellungen.kalenderIgnoriert = []; a.einstellungen.kalenderZuordnung = {}; });
      await kalenderStill(true); return;
    case 'privat-nein': drive.abmelden(); blattZu(); toast('Abgemeldet. Bitte mit dem privaten Konto anmelden.'); return;
    case 'konflikt': return konfliktZeigen();
    case 'konflikt-eigen': $('#ebene').innerHTML = ''; await konfliktLoesen('eigen'); toast('Stand dieses Geräts gespeichert.'); return;
    case 'konflikt-fremd': $('#ebene').innerHTML = ''; await konfliktLoesen('fremd'); toast('Stand aus Google Drive übernommen.'); return;
    case 'trennen': trennen(); schluesselVergessen(); toast('Verbindung getrennt. Änderungen bleiben auf diesem Gerät, bis du wieder verbindest.'); return;
    case 'abmelden-loeschen':
      if (Z.ungespeichert) { toast('Es gibt noch nicht gespeicherte Änderungen. Bitte zuerst verbinden.', 'fehler'); return; }
      trennen({ lokalLoeschen: true }); schluesselVergessen(); location.hash = '#start'; toast('Abgemeldet. Die Daten auf diesem Gerät sind entfernt, die Akte in Drive bleibt.'); return;
    case 'eingang': if (!drive.verbunden()) await verbindenStarten(); else { await eingangLesen(); await fachordnerPruefen(); zeichnen(); } return;
    case 'import-ja': {
      if (!wartenderImport) return;
      const d = wartenderImport; wartenderImport = null;
      aendern(a => importAnwenden(a, d));
      blattZu(); location.hash = '#verlauf';
      toast(`Übernommen: ${d.quelle || 'Import'}. Die Akte wird in Drive gespeichert.`);
      if (Z.modus === 'konto' && drive.verbunden()) {
        const n = await dateienVerknuepfen();
        const ohne = Z.akte.dokumente.filter(x => x.datei && !x.driveId).length;
        toast(`${n} Dateien mit den Dokumenten verknüpft.${ohne ? ` ${ohne} noch nicht in Drive gefunden – Google Drive synchronisiert evtl. noch; beim nächsten Verbinden wird erneut gesucht.` : ''}`);
      }
      return;
    }
    case 'ki-entfernen':
      try { await schluesselEntfernen(); zeichnen(); toast('Schlüssel entfernt (liegt im Drive-Papierkorb). Widerrufe ihn am besten auch in der Anthropic Console.'); }
      catch (e) { toast(e.message, 'fehler'); }
      return;
    case 'ki-stapel': {
      const ids = offeneDokumente(Z.akte).map(x => x.id);
      if (!ids.length) return;
      const r = await stapelAuswerten(ids, () => { if (ansichtId() === 'einstellungen' && !$('#ebene form')) zeichnen(); });
      zeichnen();
      toast(r.abbruch ? `Abgebrochen nach ${r.fertig} Dokumenten: ${r.abbruch}` : `${r.fertig === 1 ? 'Ein Dokument' : r.fertig + ' Dokumente'} ausgewertet.${r.fehler ? ` ${r.fehler} nicht auswertbar – ${r.gruende[0]}${r.fehler > 1 ? ' (Gründe stehen in den Einstellungen)' : ''}` : ''}`, r.abbruch || r.fehler ? 'fehler' : '');
      return;
    }
    case 'ki-kosten': return blatt(V.blattKosten());
    case 'erinnerungen-abgleich': if (!drive.verbunden()) await verbindenStarten(); else await erinnerungenStill(true); return;
    case 'tk-alle': {
      const neu = tkAbgleich(Z.akte).filter(g => g.status === 'neu');
      neu.forEach(g => tkUebernehmen(g.schluessel));
      zeichnen(); toast(`${neu.length} Erkrankungen in den Verlauf übernommen.`); return;
    }
    case 'ki-stopp': stapelStoppen(); toast('Wird nach dem laufenden Dokument angehalten.'); return;
    case 'export': {
      const blob = new Blob([JSON.stringify(Z.akte, null, 1)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `Gesundheitsakte_${new Date().toISOString().slice(0, 10)}.json`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000); return;
    }
  }
});

function formFehler(form, text) {
  const p = form?.querySelector('.formular-fehler');
  if (p) { p.textContent = text; p.hidden = false; p.scrollIntoView({ block: 'nearest' }); }
  else toast(text, 'fehler');
}
document.addEventListener('submit', async ev => {
  const form = ev.target.closest('form[data-form]'); if (!form) return;
  ev.preventDefault();
  const knopf = form.querySelector('[type=submit]');
  knopf.disabled = true; const alt = knopf.textContent; knopf.textContent = 'Speichert …';
  try {
    const meldung = await absenden(form);
    if ($('#ebene').contains(form)) blattZu(); else zeichnen();
    toast(meldung);
    if (['vorsorge', 'erledigt', 'termin', 'kandidat', 'profil', 'arzt'].includes(form.dataset.form)) erinnerungenStill();
  } catch (e) {
    console.error(e);
    formFehler(form, e.message);
    if (e.name === 'AnmeldungNoetig') statusZeichnen();
  } finally { knopf.disabled = false; knopf.textContent = alt; }
});

document.addEventListener('input', ev => {
  const map = { 'f-suche': 'suche', 'f-kat': 'kat', 'f-typ': 'typ', 'f-jahr': 'jahr', 'f-sp': 'sp' };
  if (map[ev.target.id]) { V.docFilter[map[ev.target.id]] = ev.target.value; V.docListeZeichnen(); }
  if (ev.target.id === 'hochladen-datei' && ev.target.files?.length) { const f = [...ev.target.files]; ev.target.value = ''; hochladen(f); return; }
  if (ev.target.id === 'import-datei' && ev.target.files?.[0]) { importDateiGewaehlt(ev.target.files[0]); ev.target.value = ''; return; }
  if (ev.target.hasAttribute?.('data-erinnerung-schalter')) {
    const an = ev.target.checked;
    aendern(x => { x.einstellungen.erinnerungenKalender = an; });
    if (an) erinnerungenStill(true);
    else erinnerungenEntfernen().then(n => { toast(`Erinnerungen ausgeschaltet${n ? `, ${n} aus dem Kalender entfernt` : ''}.`); zeichnen(); }).catch(e => toast(e.message, 'fehler'));
    return;
  }
  if (ev.target.hasAttribute?.('data-vorlauf')) {
    const t = Number(ev.target.value);
    aendern(x => { x.einstellungen.erinnerungVorlaufTage = t; });
    erinnerungenStill(true); return;
  }
  if (ev.target.hasAttribute?.('data-ki-automatik')) { const an = ev.target.checked; aendern(x => { x.einstellungen.kiAutomatisch = an; }); toast(an ? 'Neue Dateien im Eingang werden automatisch ausgewertet.' : 'Auswertung nur noch auf Knopfdruck.'); return; }
  if (ev.target.id === 'k-farbe') { const v = $('#k-vorschau'); v.style.setProperty('--h', ev.target.value); }
  if (ev.target.name === 'kurz' && $('#k-vorschau')) $('#k-vorschau').textContent = ev.target.value.toUpperCase() || 'AB';
});
// Ziehen und Ablegen von Dateien (auf die Ablagefläche oder irgendwo in die Dokumente-Ansicht)
document.addEventListener('dragover', ev => {
  if (![...(ev.dataTransfer?.types || [])].includes('Files')) return;
  ev.preventDefault(); $('#ablage-flaeche')?.classList.add('aktiv');
});
document.addEventListener('dragleave', ev => { if (!ev.relatedTarget) $('#ablage-flaeche')?.classList.remove('aktiv'); });
document.addEventListener('drop', ev => {
  if (!ev.dataTransfer?.files?.length) return;
  ev.preventDefault(); $('#ablage-flaeche')?.classList.remove('aktiv');
  hochladen([...ev.dataTransfer.files]);
});
document.addEventListener('keydown', ev => {
  if (ev.key === 'Enter' && ev.target.id === 'ablage-flaeche') { $('#hochladen-datei')?.click(); return; }
  if (ev.key === 'Escape' && $('#ebene').innerHTML && !Z.konflikt) blattZu();
  if (ev.key === 'Enter' && ev.target.matches('tr[data-doc]')) blatt(V.blattDokument(ev.target.dataset.doc));
});
window.addEventListener('hashchange', () => { if ($('#ebene').innerHTML && !Z.konflikt) $('#ebene').innerHTML = ''; document.body.classList.remove('blatt-offen'); zeichnen(); });
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible') {
    if (await aktualisieren()) toast('Neuer Stand von einem anderen Gerät geladen.');
    eingangLesen();
    if (drive.verbunden() && (!Z.kalender?.stand || Date.now() - Z.kalender.stand > 15 * 60_000)) kalenderStill();
  }
  else speichernJetzt();
});
window.addEventListener('beforeunload', ev => { if (Z.modus === 'konto' && Z.ungespeichert && drive.verbunden()) { speichernJetzt(); ev.preventDefault(); } });

// ---------- Neue Version erkennen ----------
// Eine installierte App bleibt oft tagelang offen. Beim Start und bei jeder Rückkehr ins Fenster wird geprüft,
// ob eine neuere Version veröffentlicht ist; dann wird neu geladen, sobald nichts Ungespeichertes offen ist.
async function versionPruefen() {
  if (TEST || location.protocol === 'file:') return;
  try {
    const text = await (await fetch('js/konfig.js?v=' + Date.now(), { cache: 'no-store' })).text();
    const online = (text.match(/VERSION = '([^']+)'/) || [])[1];
    if (!online || online === VERSION) return;
    const reg = await navigator.serviceWorker?.getRegistration(); await reg?.update();
    if (!Z.ungespeichert && !$('#ebene form')) location.reload();
    else toast(`Version ${online} ist verfügbar. Sie wird geladen, sobald alles gespeichert ist.`);
  } catch { /* offline: egal */ }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') versionPruefen(); });

// ---------- Start ----------
if ('serviceWorker' in navigator && !TEST && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(e => console.warn('Service Worker:', e));
setTimeout(versionPruefen, 1500);
if (new URLSearchParams(location.search).has('geteilt')) history.replaceState(null, '', location.pathname + (TEST ? '?test' : '') + location.hash);
geteilteAblegen();
if (TEST) document.title = 'Gesundheitsakte (Test)';
$('#version').textContent = 'Version ' + VERSION + (TEST ? ' · Testmodus' : '');
document.querySelectorAll('[data-version]').forEach(el => { el.textContent = 'v' + VERSION + (TEST ? ' Test' : ''); el.title = 'Version ' + VERSION; });
if (!ausCacheStarten(drive)) Z.modus = 'leer';
zeichnen();
