// Steuerung: Navigation, Statusanzeige, Klicks, Verbinden.
import { VERSION } from './konfig.js';
import { $, esc, svg, uhrzeit, datum } from './hilfen.js';
import { googleDrive } from './drive.js';
import { Z, beobachten, ausCacheStarten, beispielStarten, zurBegruessung, anmelden, verbinden, privatBestaetigen, trennen, konfliktLoesen, aktualisieren, speichernJetzt, eingangLesen } from './speicher.js';
import * as V from './ansichten.js';
import { formular, absenden, loeschFrage, loeschSperre, loeschen } from './formulare.js';
import { vorsorgeLage } from './modell.js';

const TEST = new URLSearchParams(location.search).has('test');
let drive = googleDrive;
if (TEST) drive = (await import('./drive-test.js')).testDrive;

const TABS = [['start', 'Übersicht'], ['verlauf', 'Verlauf'], ['faecher', 'Fächer'], ['termine', 'Termine'], ['mehr', 'Mehr']];

// ---------- Zeichnen ----------
function ansichtId() {
  const h = (location.hash || '#start').slice(1);
  if (h.startsWith('fach-')) return h;
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
  $('#nav-seite').innerHTML = sichtbar ? V.NAV.map(([id, txt]) => {
    const z = zaehler(id);
    return `<a href="#${id}" class="${basis === id ? 'aktiv' : ''}">${svg(id)}${txt}${z ? `<span class="badge">${z}</span>` : ''}</a>`;
  }).join('') : '';
  const tabAktiv = V.MEHR_ZIELE.includes(basis) ? 'mehr' : basis;
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
  else inhalt.innerHTML = ({ start: V.ansichtStart, verlauf: V.ansichtVerlauf, faecher: V.ansichtFaecher, termine: V.ansichtTermine, dokumente: V.ansichtDokumente, vorsorge: V.ansichtVorsorge, aerzte: V.ansichtAerzte, tk: V.ansichtTK, einstellungen: V.ansichtEinstellungen, mehr: V.ansichtMehr })[id]();
  if (id === 'dokumente') V.docListeZeichnen();
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
  else if (Z.status === 'bereit') toast(`Verbunden mit ${Z.konto.email}`);
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
  const el = ev.target.closest('[data-doc],[data-arzt],[data-erk],[data-termin],[data-vorsorge],[data-neu],[data-bearbeiten],[data-loeschen],[data-erledigt],[data-einordnen],[data-aktion],[data-copy],[data-vfilter],[data-vaktiv],[data-tmodus],[data-zu],[data-schleier],[data-loeschen-ja],[data-loeschen-nein]');
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
    case 'privat-ja': privatBestaetigen(d.email); blattZu(); await verbinden({ email: d.email, name: d.name }); if (Z.status === 'bereit') toast(`Verbunden mit ${d.email}`); return;
    case 'privat-nein': drive.abmelden(); blattZu(); toast('Abgemeldet. Bitte mit dem privaten Konto anmelden.'); return;
    case 'konflikt': return konfliktZeigen();
    case 'konflikt-eigen': $('#ebene').innerHTML = ''; await konfliktLoesen('eigen'); toast('Stand dieses Geräts gespeichert.'); return;
    case 'konflikt-fremd': $('#ebene').innerHTML = ''; await konfliktLoesen('fremd'); toast('Stand aus Google Drive übernommen.'); return;
    case 'trennen': trennen(); toast('Verbindung getrennt. Änderungen bleiben auf diesem Gerät, bis du wieder verbindest.'); return;
    case 'abmelden-loeschen':
      if (Z.ungespeichert) { toast('Es gibt noch nicht gespeicherte Änderungen. Bitte zuerst verbinden.', 'fehler'); return; }
      trennen({ lokalLoeschen: true }); location.hash = '#start'; toast('Abgemeldet. Die Daten auf diesem Gerät sind entfernt, die Akte in Drive bleibt.'); return;
    case 'eingang': if (!drive.verbunden()) await verbindenStarten(); else await eingangLesen(); return;
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
  } catch (e) {
    console.error(e);
    formFehler(form, e.message);
    if (e.name === 'AnmeldungNoetig') statusZeichnen();
  } finally { knopf.disabled = false; knopf.textContent = alt; }
});

document.addEventListener('input', ev => {
  const map = { 'f-suche': 'suche', 'f-kat': 'kat', 'f-typ': 'typ', 'f-jahr': 'jahr' };
  if (map[ev.target.id]) { V.docFilter[map[ev.target.id]] = ev.target.value; V.docListeZeichnen(); }
  if (ev.target.id === 'k-farbe') { const v = $('#k-vorschau'); v.style.setProperty('--h', ev.target.value); }
  if (ev.target.name === 'kurz' && $('#k-vorschau')) $('#k-vorschau').textContent = ev.target.value.toUpperCase() || 'AB';
});
document.addEventListener('keydown', ev => {
  if (ev.key === 'Escape' && $('#ebene').innerHTML && !Z.konflikt) blattZu();
  if (ev.key === 'Enter' && ev.target.matches('tr[data-doc]')) blatt(V.blattDokument(ev.target.dataset.doc));
});
window.addEventListener('hashchange', () => { if ($('#ebene').innerHTML && !Z.konflikt) $('#ebene').innerHTML = ''; document.body.classList.remove('blatt-offen'); zeichnen(); });
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible') { if (await aktualisieren()) toast('Neuer Stand von einem anderen Gerät geladen.'); eingangLesen(); }
  else speichernJetzt();
});
window.addEventListener('beforeunload', ev => { if (Z.modus === 'konto' && Z.ungespeichert && drive.verbunden()) { speichernJetzt(); ev.preventDefault(); } });

// ---------- Start ----------
if ('serviceWorker' in navigator && !TEST && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(e => console.warn('Service Worker:', e));
if (TEST) document.title = 'Gesundheitsakte (Test)';
$('#version').textContent = 'Version ' + VERSION + (TEST ? ' · Testmodus' : '');
if (!ausCacheStarten(drive)) Z.modus = 'leer';
zeichnen();
