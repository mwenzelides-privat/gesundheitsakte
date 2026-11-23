// Formulare zum Erfassen, Bearbeiten und Löschen.
import { Z, aendern, akteAnlegen, dateiHochladen, ausEingangAblegen, ablageAnpassen, dateiInPapierkorb } from './speicher.js';
import { esc, heuteIso, neueId, WOCHE, WT_LANG, svg, datum } from './hilfen.js';
import { finde, kat, faecher, STATUS_ERKRANKUNG, DOKUMENT_TYPEN, zeitenLesen, zeitenText, vorsorgeAbgleichen } from './modell.js';
import { blattKopf, formularProfil } from './ansichten.js';

const A = () => Z.akte;
const QUELLEN = ['Scan', 'TK-ePA', 'E-Mail', 'Papier', 'Arztportal', 'Sonstiges'];

// ---------- Bausteine ----------
let feldZaehler = 0;
function feld({ name, label, typ = 'text', wert = '', pflicht = false, optionen = null, hilfe = '', attr = '', breit = false }) {
  const id = 'ff-' + name + '-' + (++feldZaehler);
  const stern = pflicht ? ' *' : '';
  let eingabe;
  if (typ === 'select') eingabe = `<select id="${id}" name="${name}" ${pflicht ? 'required' : ''} ${attr}>${optionen.map(([v, t]) => `<option value="${esc(v)}" ${String(v) === String(wert ?? '') ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
  else if (typ === 'textarea') eingabe = `<textarea id="${id}" name="${name}" rows="3" ${attr}>${esc(wert)}</textarea>`;
  else if (typ === 'checkbox') return `<label class="check"><input type="checkbox" name="${name}" ${wert ? 'checked' : ''} ${attr}> ${esc(label)}</label>`;
  else eingabe = `<input id="${id}" name="${name}" type="${typ}" value="${esc(wert ?? '')}" ${pflicht ? 'required' : ''} ${attr}>`;
  return `<div class="feld${breit ? ' breit' : ''}"><label for="${id}">${esc(label)}${stern}</label>${eingabe}${hilfe ? `<span class="hilfe">${hilfe}</span>` : ''}</div>`;
}
const katOptionen = (mitTk, leerText) => [...(leerText ? [['', leerText]] : []), ...(mitTk ? A().kategorien : faecher(A())).map(k => [k.id, k.name])];
const arztOptionen = (leerText = '– keiner –') => [['', leerText], ...[...A().aerzte].sort((a, b) => a.name.localeCompare(b.name)).map(a => [a.id, `${a.name} (${kat(A(), a.kat).name})`])];
const erkOptionen = () => [['', '– keine –'], ...[...A().erkrankungen].sort((a, b) => b.von.localeCompare(a.von)).map(e => [e.id, `${e.titel} (${datum(e.von)})`])];

function rahmen(name, id, titel, label, inhalt, { loeschbar = false, knopf = 'Speichern', extra = '' } = {}) {
  return `${blattKopf(label, titel)}
  <form data-form="${name}" data-id="${esc(id || '')}" class="formular" novalidate ${extra}>
    ${inhalt}
    <p class="formular-fehler" role="alert" hidden></p>
    <div class="knoepfe formular-knoepfe">
      <button class="btn primaer" type="submit">${knopf}</button>
      <button class="btn" type="button" data-zu>Abbrechen</button>
      ${loeschbar ? `<button class="btn gefahr" type="button" data-loeschen="${name}:${esc(id)}">Löschen</button>` : ''}
    </div>
    <div class="bestaetigung" hidden></div>
  </form>`;
}

// ======================================================================
//  Formulare
// ======================================================================
export function formular(typ, id, vorgaben = {}) {
  const a = A();
  switch (typ) {
    case 'profil': return `${blattKopf('Profil', 'Profil bearbeiten')}${formularProfil(false)}`;

    case 'arzt': {
      const x = finde(a, 'aerzte', id) || { kat: vorgaben.kat || '', zeiten: {} };
      return rahmen('arzt', id, id ? x.name : 'Arzt hinzufügen', 'Arzt / Praxis', `
        ${feld({ name: 'name', label: 'Name', wert: x.name, pflicht: true, attr: 'placeholder="z. B. Dr. med. Anna Berger" autocomplete="off"' })}
        <div class="feldreihe">
          ${feld({ name: 'kat', label: 'Fachbereich', typ: 'select', wert: x.kat, pflicht: true, optionen: katOptionen(false, 'bitte wählen') })}
          ${feld({ name: 'fach', label: 'Fachrichtung', wert: x.fach, attr: 'placeholder="z. B. Orthopädie"' })}
        </div>
        <div class="feldreihe">
          ${feld({ name: 'tel', label: 'Telefon', typ: 'tel', wert: x.tel, attr: 'inputmode="tel"' })}
          ${feld({ name: 'web', label: 'Internetseite', wert: x.web, attr: 'inputmode="url"' })}
        </div>
        ${feld({ name: 'adresse', label: 'Adresse', wert: x.adresse, attr: 'placeholder="Straße Nr., PLZ Ort"' })}
        <fieldset class="zeiten-feld"><legend>Sprechzeiten</legend><span class="hilfe">Format: 08:00–12:00, 15:00–18:00 · leer = geschlossen. Ab Iteration 8 kommen sie aus Google Maps.</span>
          <div class="zeiten-raster">${WOCHE.map(t => `<label for="z-${t}">${WT_LANG[t]}</label><input id="z-${t}" name="z_${t}" value="${esc(zeitenText(x.zeiten?.[t]))}" placeholder="geschlossen">`).join('')}</div>
        </fieldset>
        ${feld({ name: 'notiz', label: 'Notiz', typ: 'textarea', wert: x.notiz })}`, { loeschbar: !!id });
    }

    case 'erkrankung': {
      const e = finde(a, 'erkrankungen', id) || { kat: vorgaben.kat || '', status: 'aktiv', aerzte: [], von: heuteIso().slice(0, 7) };
      const aerzte = [...a.aerzte].sort((p, q) => (p.kat === e.kat ? 0 : 1) - (q.kat === e.kat ? 0 : 1) || p.name.localeCompare(q.name));
      return rahmen('erkrankung', id, id ? e.titel : 'Erkrankung erfassen', 'Erkrankung / Behandlung', `
        ${feld({ name: 'titel', label: 'Bezeichnung', wert: e.titel, pflicht: true, attr: 'placeholder="z. B. Bandscheibenvorfall L5/S1"' })}
        <div class="feldreihe">
          ${feld({ name: 'kat', label: 'Fachbereich', typ: 'select', wert: e.kat, pflicht: true, optionen: katOptionen(false, 'bitte wählen') })}
          ${feld({ name: 'icd', label: 'ICD-10-Code', wert: e.icd, attr: 'placeholder="z. B. M51.2" autocapitalize="characters"', hilfe: 'steht auf AU, Überweisung und Arztbrief' })}
        </div>
        <div class="feldreihe">
          ${feld({ name: 'von', label: 'Beginn (Monat)', typ: 'month', wert: e.von, pflicht: true })}
          ${feld({ name: 'bis', label: 'Ende (Monat)', typ: 'month', wert: e.bis, hilfe: 'leer = dauert an' })}
          ${feld({ name: 'status', label: 'Stand', typ: 'select', wert: e.status, pflicht: true, optionen: Object.entries(STATUS_ERKRANKUNG) })}
        </div>
        ${aerzte.length ? `<fieldset><legend>Behandelnde Ärzte</legend><div class="checks">${aerzte.map(x => `<label class="check"><input type="checkbox" name="aerzte" value="${x.id}" ${e.aerzte?.includes(x.id) ? 'checked' : ''}> ${esc(x.name)}</label>`).join('')}</div></fieldset>` : ''}
        ${feld({ name: 'notiz', label: 'Notiz', typ: 'textarea', wert: e.notiz, attr: 'placeholder="Behandlung, Medikamente, Verlauf …"' })}`, { loeschbar: !!id });
    }

    case 'termin': {
      const t = finde(a, 'termine', id) || { datum: heuteIso(), zeit: '', arzt: vorgaben.arzt || '', kat: vorgaben.kat || '' };
      return rahmen('termin', id, id ? t.titel : 'Termin erfassen', 'Arzttermin', `
        <div class="feldreihe">
          ${feld({ name: 'datum', label: 'Datum', typ: 'date', wert: t.datum, pflicht: true })}
          ${feld({ name: 'zeit', label: 'Uhrzeit', typ: 'time', wert: t.zeit })}
        </div>
        ${feld({ name: 'arzt', label: 'Arzt', typ: 'select', wert: t.arzt, optionen: arztOptionen() })}
        ${feld({ name: 'titel', label: 'Anlass', wert: t.titel, attr: 'placeholder="z. B. Kontrolle, Blutabnahme, Impfung"', hilfe: 'leer = „Termin“' })}
        ${feld({ name: 'kat', label: 'Fachbereich (abweichend vom Arzt)', typ: 'select', wert: t.kat || '', optionen: katOptionen(false, '– wie beim Arzt –'), hilfe: 'z. B. Impfung beim Hausarzt → Impfungen' })}
        ${feld({ name: 'notiz', label: 'Notiz', typ: 'textarea', wert: t.notiz })}`, { loeschbar: !!id });
    }

    case 'dokument': {
      const d = finde(a, 'dokumente', id) || { datum: heuteIso(), typ: 'Befund', kat: vorgaben.kat || '', quelle: vorgaben.quelle || 'Scan' };
      const eingangsDatei = vorgaben.eingang ? (Z.eingang || []).find(f => f.id === vorgaben.eingang) : null;
      let datei = '';
      if (eingangsDatei) datei = `<div class="datei-info">${svg('datei')}<div><div class="mono">${esc(eingangsDatei.name)}</div><div class="small muted">aus dem Eingang · wird umbenannt und in den Ordner des Fachbereichs verschoben</div></div></div>`;
      else if (!id && Z.modus === 'konto') datei = feld({ name: 'datei', label: 'Datei (PDF oder Foto)', typ: 'file', attr: 'accept="application/pdf,image/*"', hilfe: 'Optional. Am Handy kannst du hier direkt fotografieren.' });
      else if (!id) datei = '<p class="small muted">Im Beispielmodus werden keine Dateien hochgeladen.</p>';
      else if (d.driveId) datei = `<div class="datei-info">${svg('datei')}<div><div class="mono">${esc(d.datei || 'Datei in Google Drive')}</div><div class="small muted">Bei Änderung von Titel, Datum, Art oder Fach wird die Datei mit umbenannt.</div></div></div>`;
      return rahmen('dokument', id, id ? d.titel : eingangsDatei ? 'Datei einordnen' : 'Dokument ablegen', 'Dokument', `
        ${datei}
        ${feld({ name: 'titel', label: 'Titel', wert: d.titel, pflicht: true, attr: 'placeholder="z. B. MRT der Lendenwirbelsäule"' })}
        <div class="feldreihe">
          ${feld({ name: 'datum', label: 'Datum des Dokuments', typ: 'date', wert: d.datum, pflicht: true })}
          ${feld({ name: 'typ', label: 'Art', typ: 'select', wert: d.typ, pflicht: true, optionen: DOKUMENT_TYPEN.map(t => [t, t]) })}
        </div>
        <div class="feldreihe">
          ${feld({ name: 'kat', label: 'Fachbereich', typ: 'select', wert: d.kat, pflicht: true, optionen: katOptionen(true, 'bitte wählen') })}
          ${feld({ name: 'quelle', label: 'Herkunft', typ: 'select', wert: d.quelle, optionen: QUELLEN.map(q => [q, q]) })}
        </div>
        ${feld({ name: 'arzt', label: 'Arzt', typ: 'select', wert: d.arzt, optionen: arztOptionen() })}
        ${feld({ name: 'erk', label: 'Gehört zu Erkrankung', typ: 'select', wert: d.erk, optionen: erkOptionen() })}
        ${feld({ name: 'kurz', label: 'Inhalt / Notiz', typ: 'textarea', wert: d.kurz, attr: 'placeholder="Wichtigste Aussage, Diagnose, Werte …"', hilfe: 'Ab Iteration 5 schlägt die Auswertung diesen Text vor.' })}`,
        { loeschbar: !!id, knopf: eingangsDatei ? 'Einordnen' : 'Speichern', extra: eingangsDatei ? `data-eingang="${esc(eingangsDatei.id)}"` : '' });
    }

    case 'vorsorge': {
      const v = finde(a, 'vorsorge', id) || { kat: vorgaben.kat || '', intervallMonate: 12, aktiv: true, abAlter: null };
      return rahmen('vorsorge', id, id ? v.name : 'Eigene Vorsorge-Regel', 'Vorsorge', `
        ${feld({ name: 'name', label: 'Untersuchung', wert: v.name, pflicht: true, attr: v.regelId ? 'readonly' : '' })}
        ${feld({ name: 'regel', label: 'Regel (Beschreibung)', wert: v.regel, attr: 'placeholder="z. B. alle 2 Jahre"' })}
        <div class="feldreihe">
          ${feld({ name: 'kat', label: 'Fachbereich', typ: 'select', wert: v.kat, pflicht: true, optionen: katOptionen(false, 'bitte wählen') })}
          ${feld({ name: 'arzt', label: 'Praxis', typ: 'select', wert: v.arzt, optionen: arztOptionen() })}
        </div>
        <div class="feldreihe">
          ${feld({ name: 'intervallMonate', label: 'Abstand in Monaten', typ: 'number', wert: v.intervallMonate, attr: 'min="0" max="240" inputmode="numeric"', hilfe: '0 = einmalig' })}
          ${feld({ name: 'abAlter', label: 'Ab Alter', typ: 'number', wert: v.abAlter ?? '', attr: 'min="0" max="120" inputmode="numeric"' })}
        </div>
        <div class="feldreihe">
          ${feld({ name: 'zuletzt', label: 'Zuletzt am', typ: 'date', wert: v.zuletzt })}
          ${feld({ name: 'faelligManuell', label: 'Abweichend fällig am', typ: 'date', wert: v.faelligManuell, hilfe: 'z. B. laut Arzt früher' })}
        </div>
        ${feld({ name: 'aktiv', label: 'Diese Untersuchung verfolgen und erinnern', typ: 'checkbox', wert: v.aktiv })}
        ${feld({ name: 'notiz', label: 'Notiz', typ: 'textarea', wert: v.notiz })}
        ${v.regelId ? '<p class="small muted" style="margin:0">Regel aus den Vorgaben der Krankenkasse. Sie lässt sich ausschalten, aber nicht löschen.</p>' : ''}`, { loeschbar: !!id && !v.regelId });
    }

    case 'erledigt': {
      const v = finde(a, 'vorsorge', id); if (!v) return null;
      const vorschlag = v.arzt || a.aerzte.find(x => x.kat === v.kat)?.id || '';
      return rahmen('erledigt', id, v.name, 'Untersuchung erledigt', `
        <p class="small" style="margin:0">${esc(v.regel)}${v.zuletzt ? ` · bisher zuletzt am ${datum(v.zuletzt)}` : ''}</p>
        ${feld({ name: 'zuletzt', label: 'Durchgeführt am', typ: 'date', wert: heuteIso(), pflicht: true, attr: `max="${heuteIso()}"` })}
        ${feld({ name: 'arzt', label: 'Praxis', typ: 'select', wert: vorschlag, optionen: arztOptionen() })}`);
    }

    case 'kategorie': {
      const k = finde(a, 'kategorien', id) || { name: '', kurz: '', h: Math.round(Math.random() * 359) };
      return rahmen('kategorie', id, id ? k.name : 'Fachbereich anlegen', 'Fachbereich', `
        ${feld({ name: 'name', label: 'Name', wert: k.name, pflicht: true, attr: 'placeholder="z. B. Kardiologie"' })}
        <div class="feldreihe">
          ${feld({ name: 'kurz', label: 'Kürzel (2 Buchstaben)', wert: k.kurz, pflicht: true, attr: 'maxlength="3" autocapitalize="characters"' })}
          <div class="feld"><label for="k-farbe">Farbe</label><div class="farbwahl"><input id="k-farbe" name="h" type="range" min="0" max="359" value="${k.h}"><span class="mono-mark cat" id="k-vorschau" style="--h:${k.h}">${esc(k.kurz || 'AB')}</span></div></div>
        </div>`, { loeschbar: !!id && id !== 'tk' });
    }
  }
  return null;
}

// ======================================================================
//  Absenden
// ======================================================================
const text = (fd, n) => String(fd.get(n) ?? '').trim();
const pflicht = (wert, name) => { if (!wert) throw new Error(`Bitte „${name}“ ausfüllen.`); return wert; };

/** Liefert eine Meldung für die Statuszeile; wirft bei Eingabefehlern. */
export async function absenden(form) {
  const name = form.dataset.form;
  const id = form.dataset.id || '';
  const fd = new FormData(form);
  const a = A();

  if (name === 'profil') {
    const jahrgang = Number(text(fd, 'jahrgang'));
    if (!jahrgang || jahrgang < 1900 || jahrgang > new Date().getFullYear()) throw new Error('Bitte einen gültigen Jahrgang eintragen, z. B. 1974.');
    const geschlecht = pflicht(text(fd, 'geschlecht'), 'Geschlecht');
    const profil = { name: text(fd, 'name'), rufname: text(fd, 'rufname'), jahrgang, geschlecht, kasse: text(fd, 'kasse') };
    if (!a) { akteAnlegen(profil); return 'Akte angelegt.'; }
    let neu = 0;
    aendern(x => { Object.assign(x.profil, profil); neu = vorsorgeAbgleichen(x); });
    return neu ? `Profil gespeichert. ${neu} passende Vorsorgeuntersuchungen ergänzt.` : 'Profil gespeichert.';
  }

  if (name === 'arzt') {
    const zeiten = {};
    for (const t of WOCHE) {
      try { const z = zeitenLesen(fd.get('z_' + t)); if (z.length) zeiten[t] = z; }
      catch (e) { throw new Error(`${WT_LANG[t]}: ${e.message}`); }
    }
    const daten = { name: pflicht(text(fd, 'name'), 'Name'), kat: pflicht(text(fd, 'kat'), 'Fachbereich'), fach: text(fd, 'fach'), tel: text(fd, 'tel'), web: text(fd, 'web'), adresse: text(fd, 'adresse'), notiz: text(fd, 'notiz'), zeiten };
    aendern(x => { if (id) Object.assign(finde(x, 'aerzte', id), daten); else x.aerzte.push({ id: neueId('a'), ...daten }); });
    return id ? 'Arzt gespeichert.' : `${daten.name} hinzugefügt.`;
  }

  if (name === 'erkrankung') {
    const daten = { titel: pflicht(text(fd, 'titel'), 'Bezeichnung'), kat: pflicht(text(fd, 'kat'), 'Fachbereich'), icd: text(fd, 'icd').toUpperCase(), von: pflicht(text(fd, 'von'), 'Beginn'), bis: text(fd, 'bis') || null, status: text(fd, 'status'), aerzte: fd.getAll('aerzte').map(String), notiz: text(fd, 'notiz') };
    if (daten.bis && daten.bis < daten.von) throw new Error('Das Ende liegt vor dem Beginn.');
    if (daten.bis && daten.status === 'aktiv') daten.status = 'abgeschlossen';
    aendern(x => { if (id) Object.assign(finde(x, 'erkrankungen', id), daten); else x.erkrankungen.push({ id: neueId('e'), ...daten }); });
    return id ? 'Erkrankung gespeichert.' : 'Erkrankung erfasst.';
  }

  if (name === 'termin') {
    const arztId = text(fd, 'arzt') || null;
    const daten = { datum: pflicht(text(fd, 'datum'), 'Datum'), zeit: text(fd, 'zeit'), arzt: arztId, kat: text(fd, 'kat') || null, titel: text(fd, 'titel') || 'Termin', notiz: text(fd, 'notiz') };
    if (!arztId && !daten.kat) throw new Error('Bitte einen Arzt oder einen Fachbereich wählen.');
    aendern(x => { if (id) Object.assign(finde(x, 'termine', id), daten); else x.termine.push({ id: neueId('t'), quelle: 'manuell', ...daten }); });
    return id ? 'Termin gespeichert.' : 'Termin erfasst.';
  }

  if (name === 'dokument') {
    const daten = { titel: pflicht(text(fd, 'titel'), 'Titel'), datum: pflicht(text(fd, 'datum'), 'Datum'), typ: text(fd, 'typ'), kat: pflicht(text(fd, 'kat'), 'Fachbereich'), quelle: text(fd, 'quelle'), arzt: text(fd, 'arzt') || null, erk: text(fd, 'erk') || null, kurz: text(fd, 'kurz') };
    const datei = fd.get('datei');
    const eingangId = form.dataset.eingang;
    let ablage = {};
    if (eingangId) ablage = await ausEingangAblegen(eingangId, daten);
    else if (datei && datei.size) ablage = await dateiHochladen(datei, daten);
    else if (id) {
      const alt = finde(a, 'dokumente', id);
      const r = await ablageAnpassen(alt, { ...alt, ...daten });
      if (r) ablage = r;
    }
    aendern(x => { if (id) Object.assign(finde(x, 'dokumente', id), daten, ablage); else x.dokumente.push({ id: neueId('d'), ...daten, ...ablage }); });
    return eingangId ? 'Eingeordnet und in Drive abgelegt.' : ablage.driveId ? 'Dokument in Drive abgelegt.' : 'Dokument gespeichert.';
  }

  if (name === 'vorsorge') {
    const daten = { name: pflicht(text(fd, 'name'), 'Untersuchung'), regel: text(fd, 'regel'), kat: pflicht(text(fd, 'kat'), 'Fachbereich'), arzt: text(fd, 'arzt') || null,
      intervallMonate: Math.max(0, Number(text(fd, 'intervallMonate')) || 0), abAlter: text(fd, 'abAlter') ? Number(text(fd, 'abAlter')) : null,
      zuletzt: text(fd, 'zuletzt') || null, faelligManuell: text(fd, 'faelligManuell') || null, aktiv: fd.get('aktiv') === 'on', notiz: text(fd, 'notiz') };
    aendern(x => { if (id) Object.assign(finde(x, 'vorsorge', id), daten); else x.vorsorge.push({ id: neueId('v'), regelId: null, ...daten }); });
    return 'Vorsorge gespeichert.';
  }

  if (name === 'erledigt') {
    const zuletzt = pflicht(text(fd, 'zuletzt'), 'Datum');
    if (zuletzt > heuteIso()) throw new Error('Das Datum liegt in der Zukunft. Für geplante Termine bitte „Termin erfassen“ nutzen.');
    aendern(x => { const v = finde(x, 'vorsorge', id); v.zuletzt = zuletzt; v.faelligManuell = null; v.aktiv = true; if (text(fd, 'arzt')) v.arzt = text(fd, 'arzt'); });
    return 'Eingetragen. Die nächste Fälligkeit ist berechnet.';
  }

  if (name === 'kategorie') {
    const daten = { name: pflicht(text(fd, 'name'), 'Name'), kurz: pflicht(text(fd, 'kurz'), 'Kürzel').toUpperCase().slice(0, 3), h: Number(fd.get('h')) || 0 };
    aendern(x => {
      if (id) Object.assign(finde(x, 'kategorien', id), daten);
      else { const neuId = daten.name.toLowerCase().normalize('NFD').replace(/[^\w]+/g, '').slice(0, 12) + '-' + neueId('').slice(-4); x.kategorien.splice(x.kategorien.findIndex(k => k.id === 'tk'), 0, { id: neuId, ...daten }); }
    });
    return 'Fachbereich gespeichert.';
  }
  throw new Error('Unbekanntes Formular.');
}

// ======================================================================
//  Löschen
// ======================================================================
export function loeschFrage(typ, id) {
  const a = A();
  switch (typ) {
    case 'arzt': { const n = a.termine.filter(t => t.arzt === id).length + a.dokumente.filter(d => d.arzt === id).length; return `Arzt löschen?${n ? ` ${n} Termine und Dokumente bleiben erhalten, nur ohne Arzt.` : ''}`; }
    case 'erkrankung': return 'Erkrankung löschen? Zugeordnete Dokumente bleiben erhalten.';
    case 'termin': return 'Termin löschen?';
    case 'dokument': { const d = finde(a, 'dokumente', id); return d?.driveId ? 'Eintrag löschen? Die Datei wird in den Papierkorb von Google Drive verschoben und kann dort 30 Tage lang wiederhergestellt werden.' : 'Eintrag löschen?'; }
    case 'vorsorge': return 'Eigene Vorsorge-Regel löschen?';
    case 'kategorie': {
      const benutzt = ['aerzte', 'erkrankungen', 'dokumente', 'termine', 'vorsorge'].reduce((n, l) => n + a[l].filter(x => x.kat === id).length, 0);
      return benutzt ? null : 'Fachbereich löschen?';
    }
  }
  return 'Wirklich löschen?';
}
export function loeschSperre(typ, id) {
  if (typ === 'kategorie') return 'Der Fachbereich wird noch verwendet. Bitte zuerst die Einträge einem anderen Fachbereich zuordnen.';
  return null;
}

export async function loeschen(typ, id) {
  const a = A();
  if (typ === 'dokument') {
    const d = finde(a, 'dokumente', id);
    if (d?.driveId && Z.modus === 'konto') {
      if (!Z.drive?.verbunden()) throw new Error('Zum Löschen eines Dokuments mit Datei bitte zuerst mit Google verbinden.');
      await dateiInPapierkorb(d.driveId);
    }
  }
  aendern(x => {
    const raus = (liste) => { x[liste] = x[liste].filter(e => e.id !== id); };
    if (typ === 'arzt') {
      const ar = finde(x, 'aerzte', id);
      x.termine.forEach(t => { if (t.arzt === id) { t.kat ||= ar?.kat || null; t.arzt = null; } });
      x.erkrankungen.forEach(e => { e.aerzte = (e.aerzte || []).filter(i => i !== id); });
      x.dokumente.forEach(d => { if (d.arzt === id) d.arzt = null; });
      x.vorsorge.forEach(v => { if (v.arzt === id) v.arzt = null; });
      raus('aerzte');
    }
    if (typ === 'erkrankung') { x.dokumente.forEach(d => { if (d.erk === id) d.erk = null; }); (x.medikamente || []).forEach(m => { if (m.erk === id) m.erk = null; }); raus('erkrankungen'); }
    if (typ === 'termin') raus('termine');
    if (typ === 'dokument') raus('dokumente');
    if (typ === 'vorsorge') raus('vorsorge');
    if (typ === 'kategorie') raus('kategorien');
  });
  return 'Gelöscht.';
}
