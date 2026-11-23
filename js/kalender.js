// Iteration 3: Arzttermine aus dem Google Kalender erkennen und in die Akte übernehmen.
//
// Gespeichert werden nur Einträge, die als Arzttermin erkannt werden. Alle anderen Kalendereinträge
// bleiben im Kalender und werden nirgends abgelegt. Einträge, die nach Arzt klingen, aber keinem Arzt
// zugeordnet werden können, erscheinen als Vorschlag („Nicht zugeordnet“) und werden erst auf deinen Klick übernommen.
import { Z, aendern } from './speicher.js';
import { KALENDER_AB, KALENDER_MONATE_VORAUS } from './konfig.js';
import { heuteIso, plusMonate } from './hilfen.js';
import { katVonTermin } from './modell.js';

// ---------------------------------------------------------------- Erkennung
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/ß/g, 'ss').replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/ue/g, 'u');
const FUELL = new Set(['dr', 'med', 'dent', 'prof', 'praxis', 'fur', 'und', 'der', 'die', 'das', 'frau', 'herr', 'zahnheilkunde', 'klinikum', 'landkreis',
  'gemeinschaftspraxis', 'kreisklinik', 'zentrum', 'brustzentrum', 'kardiologie', 'urologie', 'orthopadie', 'nephrologie', 'radiologie', 'chirurgie',
  'erding', 'freising', 'dorfen', 'munchen', 'ebersberg', 'smile', 'eyes', 'dres', 'innere', 'medizin', 'allgemeinmedizin']);

/** Unterscheidende Namensteile eines Arztes, z. B. „Dr. med. Bernhard Brandlhuber“ → ['brandlhuber', 'bernhard']. */
function namensTeile(a) {
  return norm(a.name).split(/[^a-z0-9]+/).filter(w => w.length >= 5 && !FUELL.has(w));
}

// Stichwörter → Fachbereich (Reihenfolge = Vorrang)
const FACH_STICHWORTE = [
  ['zahn', /zahn|dental|\bpzr\b|kieferorthop|prophylaxe/],
  ['auge', /augenarzt|augenklinik|augenheilk|ophthalm|augendruck|augen-?untersuchung/],
  ['haut', /hautarzt|dermatolog|hautkrebs|hautscreening|haut-?screening/],
  ['uro', /urolog|prostata|vasektom/],
  ['ruecken', /orthop|physio|krankengymnast|osteopath|\bmrt\b|chiropr|rucken|bandscheib|ruckenschule/],
  ['innere', /kardiolog|nephrolog|internist|gastroenterolog|darmspiegel|koloskop|magenspiegel|herzultraschall|langzeit-?ekg/],
  ['hno', /\bhno\b|hals-nasen|ohrenarzt/],
  ['impf', /impfung|impfen|auffrischung|grippeschutz/],
  ['hausarzt', /hausarzt|allgemeinarzt|blutabnahme|blut abnehmen|check-?up|gesundheitsuntersuchung|blutdruck|24-?h-?messung|labor/],
  ['chirurgie', /chirurg|operation|\bop\b|krankenhaus|klinikum|herniensprechstunde/],
];
const ARZT_HINWEIS = /\barzt\b|arztin|\bdr\b|\bdr\.|praxis|sprechstunde|vorsorge|befund|klinik|termin bei|nachkontrolle|untersuchung/;

/**
 * Prüft einen Kalendereintrag. Ergebnis:
 *  null                          → kein Arzttermin
 *  { arzt, kat, grund }          → Arzttermin (arzt kann null sein, dann ist kat gesetzt)
 *  { kandidat: true }            → klingt nach Arzt, unklar wohin
 */
export function erkennen(akte, ev) {
  const e = akte.einstellungen || {};
  if ((e.kalenderIgnoriert || []).includes(ev.id)) return null;
  const manuell = (e.kalenderZuordnung || {})[ev.id];
  if (manuell) return { ...manuell, grund: 'zugeordnet' };
  const text = norm([ev.summary, ev.location, ev.description].filter(Boolean).join(' '));
  if (!text.trim()) return null;

  for (const r of e.kalenderRegeln || []) {
    if (r.stichwort && text.includes(norm(r.stichwort))) return { arzt: r.arzt || null, kat: r.kat || null, grund: `Regel „${r.stichwort}“` };
  }
  // Arztname im Titel, Ort oder in der Beschreibung (ganzes Wort). Kurze Namen, die auch normale Wörter sein
  // können (z. B. „Burger“), zählen nur mit Zusammenhang (Dr., Praxis, Fachwort …), sonst nur als Vorschlag.
  const fach = FACH_STICHWORTE.find(([, re]) => re.test(text))?.[0] || null;
  const zusammenhang = !!fach || ARZT_HINWEIS.test(text) || /\b(frau|herr)\b/.test(text);
  const namensTreffer = a => namensTeile(a).filter(t => new RegExp(`\\b${t}\\b`).test(text));
  const treffer = akte.aerzte.filter(a => namensTreffer(a).some(t => t.length >= 7 || zusammenhang));
  const schwach = akte.aerzte.some(a => namensTreffer(a).length);
  if (treffer.length === 1) return { arzt: treffer[0].id, kat: null, grund: 'Arztname' };
  if (!treffer.length && schwach && !fach) return { kandidat: true };
  if (treffer.length > 1) {
    const passend = treffer.filter(a => a.kat === fach);
    if (passend.length === 1) return { arzt: passend[0].id, kat: null, grund: 'Arztname' };
    return { kandidat: true };
  }
  if (fach) {
    const inFach = akte.aerzte.filter(a => a.kat === fach);
    // Nur ein Arzt in diesem Fach → ihm zuordnen (z. B. „Zahnreinigung“ → die eine Zahnarztpraxis)
    if (inFach.length === 1) return { arzt: inFach[0].id, kat: null, grund: 'Fach' };
    return { arzt: null, kat: fach, grund: 'Fach' };
  }
  return ARZT_HINWEIS.test(text) ? { kandidat: true } : null;
}

const datumVon = ev => (ev.start?.date || ev.start?.dateTime || '').slice(0, 10);
const zeitVon = ev => ev.start?.dateTime ? ev.start.dateTime.slice(11, 16) : '';

// ---------------------------------------------------------------- Abgleich
let letzteEintraege = [];
let laeuft = false;

/** Liest die gewählten Kalender und gleicht die Arzttermine ab. Liefert eine Zusammenfassung. */
export async function kalenderAbgleichen({ neuLesen = true } = {}) {
  const drive = Z.drive;
  if (Z.modus !== 'konto' || !Z.akte) return { status: 'aus' };
  if (!drive?.verbunden()) return { status: 'getrennt' };
  if (!drive.kalenderErlaubt?.()) return { status: 'keinZugriff' };
  if (laeuft) return { status: 'laeuft' };
  laeuft = true;
  try {
    const kalender = Z.akte.einstellungen?.kalender?.length ? Z.akte.einstellungen.kalender : ['primary'];
    if (neuLesen) {
      const bis = plusMonate(heuteIso(), KALENDER_MONATE_VORAUS);
      letzteEintraege = (await Promise.all(kalender.map(id => drive.kalenderTermine(id, KALENDER_AB, bis)))).flat()
        .filter(e => e.status !== 'cancelled' && datumVon(e));
    }
    const ergebnis = anwenden(kalender);
    Z.kalender = { stand: new Date(), kandidaten: ergebnis.kandidaten, gelesen: letzteEintraege.length, fehler: '' };
    return { status: 'ok', ...ergebnis };
  } catch (e) {
    if (e?.name === 'AnmeldungNoetig') throw e;
    Z.kalender = { ...(Z.kalender || {}), fehler: e.message };
    return { status: 'fehler', fehler: e.message };
  } finally { laeuft = false; }
}

/** Ordnet die zuletzt gelesenen Einträge zu und schreibt nur bei echten Änderungen in die Akte. */
function anwenden(kalender) {
  const akte = Z.akte;
  const vorher = JSON.stringify(akte.termine);
  const termine = JSON.parse(vorher);
  const nachEvent = new Map(termine.filter(t => t.eventId).map(t => [t.eventId, t]));
  const gesehen = new Set();
  const kandidaten = [];
  let neu = 0, geaendert = 0;

  for (const ev of letzteEintraege) {
    const r = erkennen(akte, ev);
    if (!r) continue;
    if (r.kandidat) { kandidaten.push({ id: ev.id, kalenderId: ev.kalenderId, datum: datumVon(ev), zeit: zeitVon(ev), titel: ev.summary || '(ohne Titel)', ort: ev.location || '', link: ev.htmlLink }); continue; }
    gesehen.add(ev.id);
    const daten = { datum: datumVon(ev), zeit: zeitVon(ev), titel: ev.summary || 'Arzttermin', ort: ev.location || '', link: ev.htmlLink || '', kalenderId: ev.kalenderId, eventId: ev.id };
    const t = nachEvent.get(ev.id);
    if (t) {
      const alt = JSON.stringify(t);
      Object.assign(t, daten);
      if (!t.manuell) { t.arzt = r.arzt || null; t.kat = r.arzt ? (t.kat && t.manuell ? t.kat : null) : r.kat; }
      if (JSON.stringify(t) !== alt) geaendert++;
      continue;
    }
    // Schon vorhandener Termin am selben Tag beim selben Arzt (z. B. aus dem Tagebuch) → nur verknüpfen
    const gleich = termine.find(x => !x.eventId && x.datum === daten.datum &&
      ((r.arzt && x.arzt === r.arzt) || (!r.arzt && r.kat && katVonTermin({ ...akte, termine }, x) === r.kat)));
    if (gleich) { Object.assign(gleich, { eventId: ev.id, kalenderId: ev.kalenderId, link: daten.link, zeit: gleich.zeit || daten.zeit }); geaendert++; continue; }
    termine.push({ id: 'gk-' + ev.id, quelle: 'kalender', ...daten, arzt: r.arzt || null, kat: r.arzt ? null : r.kat, notiz: '' });
    neu++;
  }
  // Aus dem Kalender gelöschte oder nicht mehr erkannte Einträge entfernen (nur reine Kalendertermine aus gelesenen Kalendern)
  const vorherAnzahl = termine.length;
  const bleiben = termine.filter(t => !(t.quelle === 'kalender' && t.eventId && kalender.includes(t.kalenderId) && !gesehen.has(t.eventId) && !t.manuell));
  const entfernt = vorherAnzahl - bleiben.length;
  // Verknüpfungen zu verschwundenen Einträgen bei übernommenen Terminen lösen
  for (const t of bleiben) if (t.quelle !== 'kalender' && t.eventId && kalender.includes(t.kalenderId) && !gesehen.has(t.eventId)) { delete t.eventId; delete t.link; }

  if (JSON.stringify(bleiben) !== vorher) aendern(a => { a.termine = bleiben; });
  return { neu, geaendert, entfernt, kandidaten };
}

// ---------------------------------------------------------------- Zuordnen und Ignorieren
/** Zuletzt gelesene Einträge neu zuordnen (ohne erneutes Lesen) und die Vorschlagsliste aktualisieren. */
function neuZuordnen() {
  const r = anwenden(Z.akte.einstellungen?.kalender?.length ? Z.akte.einstellungen.kalender : ['primary']);
  Z.kalender = { ...(Z.kalender || {}), kandidaten: r.kandidaten };
  return r;
}
export function kandidatZuordnen(eventId, { arzt, kat, stichwort }) {
  aendern(a => {
    a.einstellungen.kalenderZuordnung = { ...(a.einstellungen.kalenderZuordnung || {}), [eventId]: { arzt: arzt || null, kat: arzt ? null : (kat || null) } };
    if (stichwort?.trim()) (a.einstellungen.kalenderRegeln ||= []).push({ stichwort: stichwort.trim(), arzt: arzt || null, kat: arzt ? null : (kat || null) });
  });
  return neuZuordnen();
}
export function kandidatIgnorieren(eventId) {
  aendern(a => { a.einstellungen.kalenderIgnoriert = [...new Set([...(a.einstellungen.kalenderIgnoriert || []), eventId])]; });
  return neuZuordnen();
}
export function regelLoeschen(index) {
  aendern(a => { a.einstellungen.kalenderRegeln.splice(index, 1); });
  return neuZuordnen();
}
/** Kalendertermin wieder aus der Akte nehmen und künftig ignorieren. */
export function terminIgnorieren(termin) {
  aendern(a => {
    a.einstellungen.kalenderIgnoriert = [...new Set([...(a.einstellungen.kalenderIgnoriert || []), termin.eventId])];
    a.termine = a.termine.filter(t => t.id !== termin.id);
  });
  if (letzteEintraege.length) neuZuordnen();
}
