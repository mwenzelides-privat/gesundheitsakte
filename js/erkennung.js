// Iteration 4: Dokumente erkennen – ohne KI, nur aus Dateiname und PDF-Text.
// Schlägt Titel, Datum, Art, Fachbereich, Arzt und Erkrankung vor. Eingescannte PDFs ohne Textebene
// und Fotos liefern keinen Text; dann bleibt es beim Dateinamen. Die genaue Auswertung macht Claude (auswertung.js).
import { nachname, norm } from './kalender.js';
import { heuteIso, iso } from './hilfen.js';

// ---------------------------------------------------------------- PDF-Text
let pdfjs = null;
async function pdfBibliothek() {
  if (!pdfjs) {
    pdfjs = await import('../lib/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('../lib/pdf.worker.min.mjs', import.meta.url).href;
  }
  return pdfjs;
}
/** true, wenn das PDF nur mit Kennwort zu öffnen ist (dann kann es auch Claude nicht lesen). */
export async function pdfGeschuetzt(daten) {
  const b = new Uint8Array(daten);
  if (!new TextDecoder('latin1').decode(b).includes('/Encrypt')) return false;
  try {
    const lib = await pdfBibliothek();
    await lib.getDocument({ data: b.slice(), isEvalSupported: false }).promise;   // Kopie: pdf.js darf den Puffer übernehmen
    return false;
  } catch (e) { return e?.name === 'PasswordException'; }
}
/** Text der ersten Seiten eines PDFs (leer bei reinen Scans). */
export async function pdfText(daten, maxSeiten = 4) {
  try {
    const lib = await pdfBibliothek();
    const doc = await lib.getDocument({ data: new Uint8Array(daten), isEvalSupported: false }).promise;
    let text = '';
    for (let s = 1; s <= Math.min(doc.numPages, maxSeiten); s++) {
      const inhalt = await (await doc.getPage(s)).getTextContent();
      text += inhalt.items.map(i => i.str + (i.hasEOL ? '\n' : ' ')).join('') + '\n';
    }
    return { text: text.replace(/[ \t]+/g, ' ').trim(), seiten: doc.numPages };
  } catch (e) {
    return { text: '', seiten: 0, fehler: e.message };
  }
}

// ---------------------------------------------------------------- Erkennung
const TYPEN = [
  ['TK-Abrechnung', /behandlungsubersicht|patientenquittung|abrechnungsdaten|leistungsubersicht/],
  ['Kostenplan', /heil- ?und kostenplan/],
  ['Medikationsplan', /medikationsplan/],
  ['Arbeitsunfähigkeit', /arbeitsunfahigkeit|au-bescheinigung|krankschreibung/],
  ['Rezept', /e-rezept|\brezept\b|arzneimittelverordnung/],
  ['Verordnung', /heilmittelverordnung|verordnung|uberweisung/],
  ['Rechnung', /rechnung|rechnungsbetrag|\bgoa\b|gesamtbetrag|zahlbar/],
  ['Impfnachweis', /impfausweis|impfpass|impfzertifikat|impfung/],
  ['Arztbrief', /arztbrief|sehr geehrte[r]? (herr |frau )?kolleg|wir berichten (ihnen )?uber|epikrise|entlassungsbericht/],
  ['Bildgebung', /\bmrt\b|magnetresonanz|rontgen|computertomograph|\bct\b|sonograph|ultraschall|szintigraph|\bdicom\b/],
  ['Labor', /laborbefund|\blabor\b|referenzbereich|normbereich|blutbild|kreatinin|\btsh\b|\bpsa\b|cholesterin|hba1c/],
  ['Messwerte', /24 ?h|langzeit-?blutdruck|blutdruckmessung|messung|messwerte|abpm/],
  ['Befund', /befund|diagnose/],
];
const FAECHER = [
  ['zahn', /zahnarzt|zahnheilkunde|zahnmedizin|kieferorthop|zahnreinigung|\bpzr\b|heil- ?und kostenplan/],
  ['auge', /augenarzt|augenheilkunde|ophthalm|augeninnendruck|sehscharfe/],
  ['haut', /hautarzt|dermatolog|hautkrebs/],
  ['uro', /urolog|prostata|\bpsa\b/],
  ['ruecken', /orthopad|physiotherap|osteopath|wirbelsaule|bandscheib|\blws\b|\bhws\b/],
  ['innere', /kardiolog|nephrolog|gastroenterolog|internist|nierenzentrum|darmspiegel|koloskop/],
  ['hno', /hals-nasen|\bhno\b/],
  ['impf', /impfausweis|impfpass|impfung/],
  ['tk', /techniker krankenkasse|\btk\b.*(behandlungsubersicht|abrechnung)/],
  ['hausarzt', /hausarzt|allgemeinmedizin|blutdruck|24 ?h|schilddruse|check-?up|blutabnahme|gesundheitsuntersuchung/],
];

const DATUM_TEXT = /\b(\d{1,2})\.(\d{1,2})\.(\d{2,4})\b/g;
const DATUM_NAME = /(20\d{2})[-_.]?(\d{2})[-_.]?(\d{2})/;
const gueltig = (j, m, t) => j >= 1990 && j <= new Date().getFullYear() + 1 && m >= 1 && m <= 12 && t >= 1 && t <= 31;
const isoAus = (j, m, t) => `${j}-${String(m).padStart(2, '0')}-${String(t).padStart(2, '0')}`;

function datumFinden(name, text, geburtsjahr) {
  const n = String(name).match(DATUM_NAME);
  if (n && gueltig(+n[1], +n[2], +n[3])) return { datum: isoAus(+n[1], +n[2], +n[3]), grund: 'Datum im Dateinamen' };
  if (!text) return null;
  const kandidaten = [];
  for (const m of text.matchAll(DATUM_TEXT)) {
    let j = +m[3]; if (j < 100) j += 2000;
    if (!gueltig(j, +m[2], +m[1]) || j === geburtsjahr) continue;
    const d = isoAus(j, +m[2], +m[1]);
    if (d > heuteIso()) continue;
    const davor = norm(text.slice(Math.max(0, m.index - 40), m.index));
    const gewicht = /datum|vom|befund|untersuchung am|ausgestellt|erstellt|aufnahme|eingang/.test(davor) ? 3 : /geb\.|geboren|geburt/.test(davor) ? -10 : 1;
    kandidaten.push({ d, gewicht });
  }
  if (!kandidaten.length) return null;
  // Höchstes Gewicht, bei Gleichstand das jüngste Datum (Briefdatum steht meist neben älteren Angaben)
  kandidaten.sort((a, b) => b.gewicht - a.gewicht || b.d.localeCompare(a.d));
  return kandidaten[0].gewicht > 0 ? { datum: kandidaten[0].d, grund: 'Datum im Text' } : null;
}

const SCANNER_NAME = /^(scan|img|dsc|pxl|photo|foto|dokument|document|bild|whatsapp|screenshot|\d{6,})[\s_-]/i;
function titelAusName(name) {
  const ohne = String(name).replace(/\.[a-z0-9]{2,5}$/i, '').replace(/^tk[-_ ]?epa[-_ ]*/i, '').replace(DATUM_NAME, ' ')
    .replace(/[_]+/g, ' ').replace(/\s+-\s+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^-+|-+$/g, '').trim();
  if (!ohne || SCANNER_NAME.test(name) || /^\d+$/.test(ohne.replace(/\W/g, '')) || ohne.length < 4) return null;
  // „24h-Messung-Blutdruck“ (Bindestriche statt Leerzeichen) lesbar machen
  return ohne.includes(' ') ? ohne : ohne.replace(/-/g, ' ');
}

/**
 * Vorschlag für ein Dokument. Liefert { titel, datum, typ, kat, arzt, erk, quelle, sicherheit (0–100), gruende[] }.
 * Bekannt: Dateiname; optional: PDF-Text.
 */
export function dokumentErkennen(akte, { name = '', text = '', geaendert = null }) {
  const t = norm(text + ' ' + name.replace(/[_-]+/g, ' '));
  const gruende = [];
  let punkte = 0;

  // Arzt: Absender im Briefkopf zählt mehr, Empfänger („Herrn Dr. …“, „An …“) weniger, passende Fachbegriffe zählen mit
  const fachAusText = FAECHER.find(([, re]) => re.test(t))?.[0] || null;
  const arztTreffer = akte.aerzte.map(a => {
    const n = nachname(a); if (!n) return null;
    const stellen = [...t.matchAll(new RegExp(`\\b${n}\\b`, 'g'))].map(m => m.index);
    if (!stellen.length) return null;
    let wert = stellen.length;
    if (stellen[0] < 250) wert += 2;
    if (stellen.every(i => /(herrn?|frau|an|z\. ?hd\.?)\s+(dr\.?\s*)?(med\.?\s*)?([a-z]+\s+)?$/.test(t.slice(Math.max(0, i - 40), i)))) wert -= 3;
    if (fachAusText && a.kat === fachAusText) wert += 2;
    return { a, wert };
  }).filter(Boolean).sort((x, y) => y.wert - x.wert);
  let arzt = arztTreffer[0]?.wert > 0 ? arztTreffer[0].a : null;
  if (arzt) { punkte += 35; gruende.push(`Arzt im Text: ${arzt.name}`); }

  const typ = TYPEN.find(([, re]) => re.test(t))?.[0] || null;
  if (typ) { punkte += 20; gruende.push(`Art: ${typ}`); }

  let kat = arzt?.kat || null;
  if (typ === 'TK-Abrechnung') kat = 'tk';
  if (!kat) { kat = FAECHER.find(([, re]) => re.test(t))?.[0] || null; if (kat) { punkte += 10; gruende.push('Fach aus Fachbegriffen'); } }
  if (kat && !akte.kategorien.some(k => k.id === kat)) kat = null;
  // Kein Arzt im Text, aber nur eine Praxis in diesem Fach → sie vorschlagen
  if (!arzt && kat && kat !== 'tk') {
    const inFach = akte.aerzte.filter(a => a.kat === kat);
    if (inFach.length === 1) { arzt = inFach[0]; punkte += 10; gruende.push(`einzige Praxis im Fach: ${arzt.name}`); }
  }

  const d = datumFinden(name, text, akte.profil?.jahrgang);
  let datum = d?.datum || null;
  if (datum) { punkte += 25; gruende.push(d.grund); }
  else if (geaendert) datum = geaendert.slice(0, 10);
  datum ||= heuteIso();

  // Laufende oder passende Erkrankung im selben Fach
  let erk = null;
  if (kat) {
    const passend = akte.erkrankungen.filter(e => e.kat === kat && e.von <= datum.slice(0, 7) && (!e.bis || e.bis >= datum.slice(0, 7)));
    if (passend.length === 1) { erk = passend[0].id; gruende.push(`Erkrankung: ${passend[0].titel}`); }
  }

  const ausName = titelAusName(name);
  const arztKurz = arzt ? (nachname(arzt) ? arzt.name.replace(/\([^)]*\)/g, '').trim().split(/\s+/).slice(-1)[0] : arzt.name) : '';
  const titel = ausName || [typ === 'Labor' ? 'Laborbefund' : typ || 'Dokument', arztKurz].filter(Boolean).join(' ');
  if (!text) gruende.push('kein lesbarer Text (Scan oder Foto)');

  const quelle = /tk[- ]?epa|techniker/i.test(name) ? 'TK-ePA' : /scan/i.test(name) ? 'Scan' : /\.(jpe?g|png|heic)$/i.test(name) ? 'Foto' : 'Sonstiges';
  return { titel, datum, typ: typ || 'Befund', kat, arzt: arzt?.id || null, erk, quelle, sicherheit: Math.min(100, punkte), gruende };
}

// ---------------------------------------------------------------- Vorschläge für Eingang und unerfasste Dateien
import { Z } from './speicher.js';
let lauf = null, wartend = null;
/**
 * Liest die Dateien (nur PDFs bis 15 MB werden geöffnet) und legt Vorschläge in Z.vorschlaege ab.
 * Kommt ein Aufruf, während noch gelesen wird, wird er danach nachgeholt (früher ging er verloren).
 */
export function vorschlaegeErstellen(dateien, nachJederDatei = () => {}) {
  if (!Z.akte || !Z.drive?.verbunden()) return Promise.resolve();
  if (lauf) { wartend = dateien; return lauf; }
  lauf = (async () => {
    let liste = dateien;
    while (liste) { wartend = null; await durchlauf(liste, nachJederDatei); liste = wartend; }
  })().finally(() => { lauf = null; });
  return lauf;
}
async function durchlauf(dateien, nachJederDatei) {
  {
    for (const f of dateien) {
      const schluessel = f.id + '|' + (f.modifiedTime || '');
      if (Z.vorschlaege[f.id]?.schluessel === schluessel) continue;
      let text = '';
      if (/pdf/i.test(f.mimeType || f.name) && Number(f.size || 0) < 15e6) {
        try { text = (await pdfText(await Z.drive.dateiInhalt(f.id))).text; }
        catch (e) { if (e?.name === 'AnmeldungNoetig') throw e; }
      }
      const alt = Z.vorschlaege[f.id];
      Z.vorschlaege[f.id] = { schluessel, textGefunden: !!text, ...dokumentErkennen(Z.akte, { name: f.name, text, geaendert: f.modifiedTime }) };
      // Vorhandene Claude-Auswertung nicht verwerfen (aus diesem Lauf oder in der Akte gemerkt)
      const gemerkt = Z.akte.eingangKi || {};
      const ki = alt?.ki ? alt : gemerkt[f.id] || Object.values(gemerkt).find(k => k.md5 && k.md5 === f.md5Checksum);
      if (ki?.ki && (!ki.md5 || !f.md5Checksum || ki.md5 === f.md5Checksum)) Object.assign(Z.vorschlaege[f.id], ki, { schluessel, kiFehler: null });
      nachJederDatei();
    }
  }
}

export { iso };
