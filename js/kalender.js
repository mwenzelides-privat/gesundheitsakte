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

/**
 * Nachname bzw. unterscheidender Name eines Arztes – nie Vornamen (sonst wäre „Bernhard hat Geburtstag“ ein Arzttermin).
 * „Dr. med. Bernhard Brandlhuber“ → 'brandlhuber', „Praxis für Zahnheilkunde Adriana Hintermaier“ → 'hintermaier',
 * „KfH-Nierenzentrum Erding“ → 'nierenzentrum', „Kardiologie Erding/Freising (Dres. …)“ → keiner.
 */
function nachname(a) {
  const woerter = norm(String(a.name).replace(/\([^)]*\)/g, ' ')).split(/[^a-z0-9]+/).filter(w => w.length >= 5 && !FUELL.has(w));
  return woerter.at(-1) || null;
}

// Stichwörter → Fachbereich (Reihenfolge = Vorrang). Nur eindeutige medizinische Begriffe.
const FACH_STICHWORTE = [
  ['zahn', /zahnarzt|zahnreinigung|zahnarzttermin|\bpzr\b|kieferorthop|\bkfo\b/],
  ['auge', /augenarzt|augenklinik|augenheilk|ophthalm|augendruck/],
  ['haut', /hautarzt|dermatolog|hautkrebs|hautscreening|haut-?screening/],
  ['uro', /urolog|prostata|vasektom/],
  ['ruecken', /orthopad|physio|krankengymnast|osteopath|ostheopat|\bmrt\b|chiropr|bandscheib/],
  ['innere', /kardiolog|nephrolog|internist|gastroenterolog|darmspiegel|koloskop|magenspiegel|nuklearmed/],
  ['hno', /\bhno\b|hals-nasen|ohrenarzt/],
  ['impf', /impfung|\bimpfen\b|grippeschutz/],
  ['hausarzt', /hausarzt|allgemeinarzt|blutabnahme|blut abnehmen|check-?up|gesundheitsuntersuchung|24 ?h[- ]messung/],
  ['chirurgie', /chirurg|herniensprechstunde/],
];
// Einträge, die nie Arzttermine sind (auch wenn „Dr.“ oder ein Arztname darin vorkommt)
const KEIN_ARZTTERMIN = /geburtstag|\bgeb\.|jahrestag|hochzeitstag|namenstag|todestag|feiertag|ferien|urlaub|\bessen\b|party|feier\b|kino|konzert|flug\b|\bzug\b|hotel|wochen nach op|kurs\b|schulung|vorstellungsgesprach|to-?do/;
// Geburtstage aus Google Kontakte, Arbeitsort, Abwesenheit, Fokuszeit
const KEINE_TERMINARTEN = new Set(['birthday', 'workingLocation', 'outOfOffice', 'focusTime']);
// Klingt nach Arzt, reicht aber nicht für eine sichere Zuordnung → nur Vorschlag
const ARZT_HINWEIS = /\barzt\b|arzttermin|arztin|\bdr\b|\bdr\.|\bdoktor\b|praxis|sprechstunde|vorsorge|befund|klinik|krankenhaus|\bop\b|operation|nachkontrolle|untersuchung|rontgen|labor|blutdruck/;

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
  if (KEINE_TERMINARTEN.has(ev.eventType)) return null;
  // Nur Titel und Ort – der Beschreibungstext enthält zu oft Namen und Stichwörter aus anderen Zusammenhängen
  const titel = norm(ev.summary);
  const text = norm([ev.summary, ev.location].filter(Boolean).join(' '));
  if (!titel.trim()) return null;
  if (KEIN_ARZTTERMIN.test(titel)) return null;
  if (fremdePerson(akte, ev.summary)) return null;

  for (const r of e.kalenderRegeln || []) {
    if (r.stichwort && text.includes(norm(r.stichwort))) return { arzt: r.arzt || null, kat: r.kat || null, grund: `Regel „${r.stichwort}“` };
  }
  // Nachname eines Arztes als ganzes Wort. Kurze Namen, die auch normale Wörter sein können (z. B. „Burger“),
  // zählen nur mit Zusammenhang (Dr., Praxis, Fachwort …), sonst nur als Vorschlag.
  const fach = FACH_STICHWORTE.find(([, re]) => re.test(text))?.[0] || null;
  const zusammenhang = !!fach || ARZT_HINWEIS.test(text) || /\b(frau|herr)\b/.test(text);
  const imText = a => { const n = nachname(a); return n && new RegExp(`\\b${n}\\b`).test(text) ? n : null; };
  const treffer = akte.aerzte.filter(a => { const n = imText(a); return n && (n.length >= 7 || zusammenhang); });
  if (treffer.length === 1) return { arzt: treffer[0].id, kat: null, grund: 'Arztname' };
  if (treffer.length > 1) {
    const passend = treffer.filter(a => a.kat === fach);
    if (passend.length === 1) return { arzt: passend[0].id, kat: null, grund: 'Arztname' };
    return { kandidat: true };
  }
  if (!fach && akte.aerzte.some(imText)) return { kandidat: true };
  if (fach) {
    // Ein anderer, unbekannter Arzt im Titel („Kieferorthopädie Dr. Blank“) → nur das Fach, keinen Arzt raten
    const fremderDoktor = /\b(dr|doktor)\b\.?\s*[a-z]{3,}/.test(titel);
    const inFach = akte.aerzte.filter(a => a.kat === fach);
    // Nur ein Arzt in diesem Fach → ihm zuordnen (z. B. „Zahnreinigung“ → die eine Zahnarztpraxis)
    if (inFach.length === 1 && !fremderDoktor) return { arzt: inFach[0].id, kat: null, grund: 'Fach' };
    return { arzt: null, kat: fach, grund: 'Fach' };
  }
  return ARZT_HINWEIS.test(text) ? { kandidat: true } : null;
}

// ---------------------------------------------------------------- Termine anderer Personen
/** Enthält der Titel den Namen einer Person, deren Termine nicht in diese Akte gehören (Kinder, Partnerin, Haustier …)? */
function fremdePerson(akte, summary) {
  const personen = akte.einstellungen?.kalenderPersonen || [];
  if (!personen.length) return false;
  const t = norm(summary);
  const eigene = [...eigeneNamen(akte), 'ich'];
  if (eigene.some(n => new RegExp(`\\b${n}\\b`).test(t))) return false;
  return personen.some(p => new RegExp(`\\b${norm(p)}\\b`).test(t));
}
const eigeneNamen = akte => norm(`${akte.profil?.name || ''} ${akte.profil?.rufname || ''}`).split(/[^a-z]+/).filter(w => w.length >= 3 && !FUELL.has(w));

// Wörter, die in Arztterminen vorkommen, aber keine Personennamen sind
const KEIN_NAME = new Set(['termin', 'arzttermin', 'physio', 'physiotherapie', 'praxis', 'zahnarzt', 'zahnarzttermin', 'zahnreinigung', 'professionelle', 'impfung',
  'covid', 'biontec', 'biontech', 'orthopadie', 'orthopade', 'urologe', 'hautarzt', 'augenarzt', 'hausarzt', 'hausarzttermin', 'osteopath', 'osteopathie', 'chiropraktik',
  'kieferorthopadie', 'vorsorge', 'kontrolle', 'nachkontrolle', 'untersuchung', 'voruntersuchung', 'besprechung', 'vorbesprechung', 'vorgesprach', 'planbesprechung',
  'rezept', 'tabletten', 'messung', 'blutdruck', 'krankschreibung', 'schilddruse', 'neurologie', 'radiologie', 'nuklearmedizin', 'chirurgie', 'operation', 'bericht',
  'rontgen', 'rontgenbilder', 'erding', 'dorfen', 'freising', 'landshut', 'taufkirchen', 'vilsbiburg', 'waldkraiburg', 'isen', 'munchen', 'klinikum', 'mrt', 'kfo',
  'hpv', 'fsme', 'tetanus', 'doktor', 'herr', 'herrn', 'frau', 'oberarztin', 'abholen', 'anrufen', 'wegen', 'beim', 'nach', 'mit', 'und', 'bei', 'der', 'die', 'das', 'ihr',
  'hand', 'blut', 'faden', 'fuss', 'knie', 'rucken', 'heilpraxis', 'zentrum', 'mvz', 'gmbh', 'montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag', 'sonntag']);

/**
 * Schlägt Namen vor, die in mehreren erkannten Arztterminen vorkommen, aber weder Arzt noch man selbst sind –
 * typischerweise Kinder, Partnerin oder Haustiere. Die Namen kommen ausschließlich aus dem eigenen Kalender.
 */
export function personenVorschlaege() {
  const akte = Z.akte; if (!akte || !letzteEintraege.length) return [];
  const e = akte.einstellungen || {};
  const bekannt = new Set([...(e.kalenderPersonen || []), ...(e.kalenderPersonenKeine || [])].map(norm));
  const aerzteNamen = new Set(akte.aerzte.flatMap(a => norm(a.name).split(/[^a-z]+/)));
  const eigene = new Set(eigeneNamen(akte));
  const zaehler = new Map();
  for (const ev of letzteEintraege) {
    if (!erkennen({ ...akte, einstellungen: { ...e, kalenderPersonen: [] } }, ev)) continue;
    const woerter = String(ev.summary || '').match(/\b[A-ZÄÖÜ][a-zäöüß]{2,}\b/g) || [];
    for (const w of new Set(woerter)) {
      const n = norm(w);
      if (KEIN_NAME.has(n) || aerzteNamen.has(n) || eigene.has(n) || bekannt.has(n) || FUELL.has(n)) continue;
      if (FACH_STICHWORTE.some(([, re]) => re.test(n))) continue;
      if (new RegExp(`\\b(dr|doktor|fr|frau|herrn?)\\.?\\s+${w}\\b`, 'i').test(ev.summary)) continue;   // „Dr. Gruber“ → Arzt, keine Angehörige
      const z = zaehler.get(w) || { name: w, anzahl: 0, beispiele: [], vorne: 0 };
      z.anzahl++; if (z.beispiele.length < 3) z.beispiele.push(ev.summary);
      // „Mara Physio“, „Leo und Mara …“ → Name steht vorn; „Physiotherapie bei Steffi“ → eher Therapeutin
      if (new RegExp(`^\\s*${w}\\b`).test(ev.summary) || new RegExp(`\\b(und|&)\\s+${w}\\b`).test(ev.summary)) z.vorne++;
      zaehler.set(w, z);
    }
  }
  return [...zaehler.values()].filter(z => z.anzahl >= 2).map(z => ({ ...z, vorgewaehlt: z.vorne > 0 })).sort((a, b) => b.vorgewaehlt - a.vorgewaehlt || b.anzahl - a.anzahl);
}
export function personenFestlegen(ausblenden, behalten) {
  aendern(a => {
    a.einstellungen.kalenderPersonen = [...new Set([...(a.einstellungen.kalenderPersonen || []), ...ausblenden])];
    a.einstellungen.kalenderPersonenKeine = [...new Set([...(a.einstellungen.kalenderPersonenKeine || []), ...behalten])];
  });
  return neuZuordnen();
}
export function personEntfernen(name) {
  aendern(a => { a.einstellungen.kalenderPersonen = (a.einstellungen.kalenderPersonen || []).filter(p => p !== name); });
  return neuZuordnen();
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
