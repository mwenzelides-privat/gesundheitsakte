// Iteration 6: TK-Abrechnungsdaten (Behandlungsübersicht, Patientenquittung, Auskunft nach § 305 SGB V).
//
// Claude liest das PDF und liefert je Arztkontakt bzw. Quartal: Praxis, Fachrichtung und Diagnosen (ICD-10-GM)
// mit Sicherheitskennzeichen (G gesichert, V Verdacht, A ausgeschlossen, Z Zustand nach).
// Die Diagnosen werden nach ICD-Gruppe (z. B. M51) zusammengefasst und mit den Erkrankungen der Akte abgeglichen:
//   bekannt  – passt zu einer vorhandenen Erkrankung (ggf. Zeitraum ergänzen)
//   neu      – Vorschlag für eine neue Erkrankung im Verlauf
//   verdacht – nur als Verdacht kodiert
//   anlass   – Vorsorge, Impfung, Beratung u. Ä. (ICD-Kapitel Z), kein Eintrag im Verlauf
// Nichts wird ohne deinen Klick in den Verlauf übernommen.
import { Z, aendern } from './speicher.js';
import { anfragen } from './auswertung.js';
import { finde } from './modell.js';
import { nachname, norm } from './kalender.js';
import { heuteIso, neueId } from './hilfen.js';

const SYSTEM = `Du liest Abrechnungsdaten einer gesetzlichen Krankenkasse (Techniker Krankenkasse) für die private Gesundheitsakte des Versicherten: Behandlungsübersichten aus der elektronischen Patientenakte, Patientenquittungen oder Leistungsauskünfte nach § 305 SGB V.

Übernimm jeden ambulanten Arztkontakt bzw. jede Abrechnungszeile mit Diagnosen als eigenen Eintrag:
- quartal: Abrechnungsquartal als „JJJJ-Q“ (z. B. „2024-3“); leer, wenn nicht erkennbar.
- datum_von / datum_bis: Behandlungszeitraum als JJJJ-MM-TT, falls angegeben, sonst leer.
- praxis: Name der Praxis, des Arztes oder des Krankenhauses wie im Dokument.
- fach: Fachrichtung, falls angegeben (z. B. „Allgemeinmedizin“, „Orthopädie“).
- diagnosen: jede Diagnose mit ICD-10-GM-Code (ohne Seitenangabe und ohne Sicherheitskennzeichen), der deutschen Bezeichnung (aus dem Dokument; fehlt sie, die amtliche Kurzbezeichnung des Codes) und dem Sicherheitskennzeichen G, V, A oder Z (leer, wenn nicht angegeben).
Krankenhausaufenthalte, Arzneimittel und Heilmittel ohne Diagnose weglassen. Übernimm nur, was im Dokument steht; erfinde keine Einträge.
zeitraum_von / zeitraum_bis: der Zeitraum, den das ganze Dokument abdeckt (JJJJ-MM-TT, sonst leer).`;

const text = { type: 'string' };
const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['art', 'zeitraum_von', 'zeitraum_bis', 'eintraege'],
  properties: {
    art: { type: 'string', enum: ['Behandlungsübersicht', 'Patientenquittung', 'Leistungsauskunft', 'Sonstiges'] },
    zeitraum_von: text, zeitraum_bis: text,
    eintraege: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['quartal', 'datum_von', 'datum_bis', 'praxis', 'fach', 'diagnosen'],
      properties: { quartal: text, datum_von: text, datum_bis: text, praxis: text, fach: text,
        diagnosen: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['icd', 'text', 'kennung'],
          properties: { icd: text, text, kennung: { type: 'string', enum: ['G', 'V', 'A', 'Z', ''] } } } } } } },
  },
};

// ---------------------------------------------------------------- Auslesen
const sauber = s => String(s || '').trim();
const ICD = /^[A-Z]\d{2}(\.[0-9A-Z-]{1,3})?$/;
const laufend = new Set();
export const tkWirdGelesen = id => laufend.has(id);

/** Quartal „2024-3“ aus Angaben ableiten. */
function quartalVon(e) {
  const q = sauber(e.quartal).match(/^(\d{4})\D?([1-4])$/);
  if (q) return `${q[1]}-${q[2]}`;
  const d = sauber(e.datum_von || e.datum_bis).match(/^(\d{4})-(\d{2})/);
  return d ? `${d[1]}-${Math.ceil(+d[2] / 3)}` : '';
}

/** TK-Dokument (mit Datei in Drive) von Claude auslesen lassen und die Einträge in der Akte speichern. */
export async function tkAuslesen(docId, nachher = () => {}) {
  const d = finde(Z.akte, 'dokumente', docId);
  if (!d?.driveId) throw new Error('Zu diesem Dokument ist keine Datei in Google Drive hinterlegt.');
  if (Z.modus !== 'konto' || !Z.drive?.verbunden()) throw Object.assign(new Error('Bitte zuerst mit Google verbinden.'), { name: 'AnmeldungNoetig' });
  if (laufend.has(docId)) return null;
  laufend.add(docId); nachher();
  try {
    const m = await Z.drive.metadaten(d.driveId);
    const { r, modell, zeit, kosten } = await anfragen(m, { art: 'TK', system: SYSTEM, schema: SCHEMA, maxTokens: 32000, text: `Dateiname: ${m.name}\nBitte alle Einträge mit Diagnosen auslesen.` });
    const eintraege = (r.eintraege || []).map(e => ({
      quartal: quartalVon(e), von: sauber(e.datum_von), bis: sauber(e.datum_bis), praxis: sauber(e.praxis), fach: sauber(e.fach),
      diagnosen: (e.diagnosen || []).map(x => ({ icd: sauber(x.icd).toUpperCase().replace(/[^A-Z0-9.-]/g, ''), text: sauber(x.text), kennung: x.kennung || '' }))
        .filter(x => ICD.test(x.icd)),
    })).filter(e => e.diagnosen.length && e.quartal);
    const quartale = [...new Set(eintraege.map(e => e.quartal))].sort();
    const anzahl = eintraege.reduce((n, e) => n + e.diagnosen.length, 0);
    aendern(a => {
      a.tk ||= { eintraege: [] };
      a.tk.eintraege = a.tk.eintraege.filter(e => e.quelle !== docId).concat(eintraege.map(e => ({ ...e, quelle: docId })));
      const x = finde(a, 'dokumente', docId);
      if (x) {
        if (x.kurz && !x.ki && !x.notiz) x.notiz = x.kurz;
        Object.assign(x, {
          kurz: `${r.art || 'TK-Abrechnungsdaten'}: ${eintraege.length} Arztkontakte mit ${anzahl} Diagnosen${quartale.length ? `, ${qText(quartale[0])} bis ${qText(quartale.at(-1))}` : ''}. Die Diagnosen stehen unter „TK und Import“ zum Abgleich mit dem Krankheitsverlauf.`,
          ki: true, kiModell: modell, kiStand: heuteIso(), kiZeit: zeit, kiKosten: kosten, tkGelesen: heuteIso(),
          tkZeitraum: quartale.length ? [quartale[0], quartale.at(-1)] : null,
        });
      }
    });
    return { eintraege: eintraege.length, diagnosen: anzahl, quartale };
  } finally { laufend.delete(docId); nachher(); }
}

// ---------------------------------------------------------------- Abgleich
export const qText = q => q ? `${q.split('-')[1]}. Quartal ${q.split('-')[0]}` : '';
const qMonate = q => { const [j, n] = q.split('-').map(Number); return [`${j}-${String(n * 3 - 2).padStart(2, '0')}`, `${j}-${String(n * 3).padStart(2, '0')}`]; };
const jetztQ = () => { const h = new Date(); return `${h.getFullYear()}-${Math.floor(h.getMonth() / 3) + 1}`; };
const qIndex = q => { const [j, n] = q.split('-').map(Number); return j * 4 + n - 1; };

/** Fachbereich für eine ICD-Gruppe (falls die Praxis nicht bekannt ist). */
function katAusIcd(g) {
  const b = g[0], n = +g.slice(1, 3);
  if (b === 'K' && n <= 14) return 'zahn';
  if (b === 'H' && n <= 59) return 'auge';
  if (b === 'H') return 'hno';
  if (b === 'L') return 'haut';
  if (b === 'M' || (b === 'S' && n >= 30 && n <= 39)) return 'ruecken';
  if ((b === 'N' && n >= 40 && n <= 51) || (b === 'C' && n === 61)) return 'uro';
  if (b === 'K' || (b === 'N' && n <= 39)) return 'innere';
  return 'hausarzt';
}

/** Arzt der Akte zu einem Praxisnamen aus den TK-Daten. */
export function arztZuPraxis(akte, praxis) {
  const p = norm(praxis);
  return akte.aerzte.find(a => { const n = nachname(a); return n && new RegExp(`\\b${n}\\b`).test(p); }) || null;
}

/**
 * Fasst alle TK-Diagnosen nach ICD-Gruppe zusammen und gleicht sie mit den Erkrankungen ab.
 * Liefert Gruppen { schluessel, icd, text, quartale[], von, bis, praxen[], aerzte[], kat, status, erk, erweitert }.
 */
export function tkAbgleich(akte) {
  const ign = new Set(akte.einstellungen?.tkIgnoriert || []);
  // Letztes Quartal, für das TK-Daten vorliegen (die TK liefert mit Verzögerung) – daran wird „läuft noch“ gemessen
  const ende = [...tkQuartale(akte)].sort().at(-1) || jetztQ();
  const gruppen = new Map();
  for (const e of akte.tk?.eintraege || []) for (const dg of e.diagnosen) {
    if (dg.kennung === 'A') continue;
    const k = dg.icd.slice(0, 3);
    const g = gruppen.get(k) || { schluessel: k, codes: {}, quartale: new Set(), praxen: new Set(), kennungen: new Set() };
    (g.codes[dg.icd] ||= { n: 0, text: dg.text }).n++;
    g.quartale.add(e.quartal); if (e.praxis) g.praxen.add(e.praxis); g.kennungen.add(dg.kennung || 'G');
    gruppen.set(k, g);
  }
  return [...gruppen.values()].map(g => {
    const [icd, haupt] = Object.entries(g.codes).sort((x, y) => y[1].n - x[1].n)[0];
    const quartale = [...g.quartale].sort();
    const praxen = [...g.praxen];
    const aerzte = [...new Set(praxen.map(p => arztZuPraxis(akte, p)?.id).filter(Boolean))];
    const erk = akte.erkrankungen.find(e => e.icd && e.icd.toUpperCase().startsWith(g.schluessel)) || null;
    const von = qMonate(quartale[0])[0];
    const letzt = quartale.at(-1);
    const laeuft = qIndex(ende) - qIndex(letzt) <= 1;     // im letzten oder vorletzten Quartal der TK-Daten noch kodiert
    const bis = laeuft ? null : qMonate(letzt)[1];
    const nurVerdacht = [...g.kennungen].every(x => x === 'V');
    let status = erk ? 'bekannt' : /^[ZU]/.test(g.schluessel) && g.schluessel !== 'U07' ? 'anlass' : nurVerdacht ? 'verdacht' : 'neu';
    if (!erk && ign.has(g.schluessel)) status = 'ignoriert';
    const kat = (aerzte[0] && akte.aerzte.find(a => a.id === aerzte[0])?.kat) || katAusIcd(g.schluessel);
    const erweitert = erk ? (von < erk.von ? { von } : {}) : {};
    if (erk && erk.bis && !laeuft && qMonate(letzt)[1] > erk.bis) erweitert.bis = qMonate(letzt)[1];
    if (erk && erk.bis && laeuft) erweitert.bis = null;
    return {
      schluessel: g.schluessel, icd, text: haupt.text, codes: Object.keys(g.codes).sort(), quartale, von, bis, laeuft,
      praxen, aerzte, kat: akte.kategorien.some(k => k.id === kat) ? kat : 'hausarzt', status, erk: erk?.id || null,
      erweitert: Object.keys(erweitert).length ? erweitert : null,
      dauerhaft: quartale.length >= 4 && qIndex(letzt) - qIndex(quartale[0]) >= 4,
    };
  }).sort((x, y) => y.quartale.at(-1).localeCompare(x.quartale.at(-1)) || x.schluessel.localeCompare(y.schluessel));
}

/** Neue Erkrankung aus einer TK-Gruppe anlegen. */
export function tkUebernehmen(schluessel) {
  const g = tkAbgleich(Z.akte).find(x => x.schluessel === schluessel);
  if (!g || g.erk) return null;
  const id = neueId('e');
  aendern(a => {
    a.erkrankungen.push({
      id, titel: g.text || g.icd, icd: g.icd, kat: g.kat, von: g.von, bis: g.bis,
      status: g.bis ? 'abgeschlossen' : g.dauerhaft ? 'chronisch' : 'aktiv', aerzte: g.aerzte,
      notiz: `Aus den TK-Abrechnungsdaten: ${qText(g.quartale[0])} bis ${qText(g.quartale.at(-1))}, ${g.quartale.length} ${g.quartale.length === 1 ? 'Quartal' : 'Quartale'}${g.praxen.length ? ', ' + g.praxen.join(', ') : ''}.`,
      quelle: 'tk',
    });
  });
  return id;
}
/** Zeitraum einer vorhandenen Erkrankung nach den TK-Daten ergänzen. */
export function tkZeitraumAnpassen(schluessel) {
  const g = tkAbgleich(Z.akte).find(x => x.schluessel === schluessel);
  if (!g?.erk || !g.erweitert) return false;
  aendern(a => { const e = finde(a, 'erkrankungen', g.erk); if (!e) return; Object.assign(e, g.erweitert); if ('bis' in g.erweitert && g.erweitert.bis === null && e.status === 'abgeschlossen') e.status = 'aktiv'; });
  return true;
}
export function tkIgnorieren(schluessel, an = true) {
  aendern(a => {
    const l = new Set(a.einstellungen.tkIgnoriert || []);
    an ? l.add(schluessel) : l.delete(schluessel);
    a.einstellungen.tkIgnoriert = [...l];
  });
}
/** Quartale, für die TK-Daten vorliegen (für die Übersicht). */
export const tkQuartale = akte => new Set((akte.tk?.eintraege || []).map(e => e.quartal));

// ---------------------------------------------------------------- Testmodus
export function tkTestAntwort() {
  const r = {
    art: 'Behandlungsübersicht', zeitraum_von: '2024-01-01', zeitraum_bis: '2025-12-31',
    eintraege: [
      { quartal: '2024-1', datum_von: '', datum_bis: '', praxis: 'Dr. med. Anna Berger', fach: 'Allgemeinmedizin', diagnosen: [{ icd: 'I10.90', text: 'Essentielle Hypertonie, nicht näher bezeichnet', kennung: 'G' }, { icd: 'Z00.0', text: 'Allgemeine Untersuchung', kennung: 'G' }] },
      { quartal: '2024-4', datum_von: '', datum_bis: '', praxis: 'Dr. med. Anna Berger', fach: 'Allgemeinmedizin', diagnosen: [{ icd: 'I10.90', text: 'Essentielle Hypertonie, nicht näher bezeichnet', kennung: 'G' }, { icd: 'E78.0', text: 'Reine Hypercholesterinämie', kennung: 'G' }] },
      { quartal: '2025-2', datum_von: '', datum_bis: '', praxis: 'Praxis Dr. Haas', fach: 'Orthopädie', diagnosen: [{ icd: 'M54.5', text: 'Kreuzschmerz', kennung: 'G' }, { icd: 'M51.2', text: 'Sonstige näher bezeichnete Bandscheibenverlagerung', kennung: 'G' }] },
      { quartal: '2025-3', datum_von: '', datum_bis: '', praxis: 'Dr. Lorenz', fach: 'Augenheilkunde', diagnosen: [{ icd: 'H40.0', text: 'Glaukomverdacht', kennung: 'V' }] },
    ],
  };
  return { model: 'claude-opus-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(r) }], usage: { input_tokens: 9000, output_tokens: 1500 } };
}
