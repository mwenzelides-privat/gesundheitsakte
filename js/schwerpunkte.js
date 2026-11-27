// Schwerpunkte: Themen, die gesondert verfolgt werden (Blutdruck, Rücken).
//
// Zuordnung („Verschlagwortung“) ohne Pflegeaufwand: Ein Dokument, Termin, Medikament oder eine Erkrankung gehört
// automatisch zu einem Schwerpunkt, wenn die Erkrankung passt (ICD-Gruppe), der Fachbereich passt (Rücken) oder ein
// Stichwort im Titel, in der Zusammenfassung, den Diagnosen oder den Messwerten vorkommt. Von Hand lässt sich das je
// Eintrag ergänzen (tags) oder abwählen (tagsAus).
//
// Außerdem: Blutdruck-Messreihen (24-h-Messungen von Praxis und Uhr, Heimmessungen) und Gewichtsverlauf aus den
// ausgewerteten Messwerten, und schlichte SVG-Verlaufsdiagramme dazu.
import { norm } from './kalender.js';
import { esc, datum, heuteIso } from './hilfen.js';

export const SCHWERPUNKTE = [
  { id: 'blutdruck', name: 'Blutdruck', icon: 'sp-blutdruck', icd: ['I10', 'I11', 'I12', 'I13', 'I15'], kats: [],
    stichworte: ['blutdruck', 'hypertonie', 'bluthochdruck', 'ramipril', 'abpm', 'kardiolog', 'blutdrucksenker'] },
  { id: 'ruecken', name: 'Rücken', icon: 'sp-ruecken', icd: ['M40', 'M41', 'M42', 'M43', 'M45', 'M46', 'M47', 'M48', 'M50', 'M51', 'M53', 'M54'], kats: ['ruecken'],
    stichworte: ['bandscheib', 'wirbelsaule', 'lendenwirbel', 'halswirbel', 'lws', 'hws', 'bws', 'ruckenschmerz', 'ruckenzentrum', 'ruckentraining', 'ruckenubung', 'ischias', 'spinalkanal', 'neurochirurg', 'osteopath', 'physiotherap', 'krankengymnast'] },
];
export const schwerpunkt = id => SCHWERPUNKTE.find(s => s.id === id);

// ---------------------------------------------------------------- Zuordnung
const text = (...teile) => norm(teile.flat().filter(Boolean).join(' '));
const enthaelt = (t, sp) => sp.stichworte.some(w => new RegExp(`(^|[^a-z])${w}`).test(t));

/** Erkrankungen eines Schwerpunkts (ICD-Gruppe, Stichwort im Titel oder von Hand zugeordnet). */
export function erkrankungenVon(akte, sp) {
  return akte.erkrankungen.filter(e => gehoertZu(akte, sp, e, 'erkrankung'));
}

/** Gehört ein Eintrag zu einem Schwerpunkt? typ: dokument | termin | erkrankung | medikament */
export function gehoertZu(akte, sp, x, typ) {
  if (x.tags?.includes(sp.id)) return true;
  if (x.tagsAus?.includes(sp.id)) return false;
  if (typ === 'erkrankung') {
    // Erkrankungen nur über die ICD-Gruppe (Stichwörter wären zu ungenau, z. B. „Zyste am Rücken“); ohne ICD über den Titel
    if (x.icd) return sp.icd.includes(String(x.icd).toUpperCase().slice(0, 3));
    return enthaelt(text(x.titel), sp);
  }
  const erkIds = new Set(erkrankungenVon(akte, sp).map(e => e.id));
  if (x.erk && erkIds.has(x.erk)) return true;
  if (typ === 'medikament') return enthaelt(text(x.name, x.notiz), sp);
  const ar = x.arzt ? akte.aerzte.find(a => a.id === x.arzt) : null;
  if (typ === 'termin') {
    if (sp.kats.includes(x.kat) || (ar && sp.kats.includes(ar.kat) && !x.kat)) return true;
    return enthaelt(text(x.titel, x.notiz, ar?.fach), sp);
  }
  // Dokument: Erkrankung, Fachbereich, Titel oder Messwerte – nicht jedes Wort der Zusammenfassung
  // (sonst landet z. B. ein Hautarzt-Fragebogen beim Blutdruck, nur weil dort „Ramipril“ als Medikament steht)
  if (sp.kats.includes(x.kat)) return true;
  if ((x.diagnosen || []).some(d => d.icd && sp.icd.includes(String(d.icd).toUpperCase().slice(0, 3))) && (x.diagnosen || []).length <= 2) return true;
  return enthaelt(text(x.titel, (x.werte || []).map(w => w[0])), sp);
}
/** Schwerpunkte, zu denen ein Eintrag gehört. */
export const schwerpunkteVon = (akte, x, typ) => SCHWERPUNKTE.filter(sp => gehoertZu(akte, sp, x, typ));

/** Zuordnung von Hand setzen: an = true/false; nur Abweichungen von der Automatik werden gespeichert. */
export function zuordnungSetzen(akte, x, typ, spId, an) {
  const sp = schwerpunkt(spId); if (!sp) return;
  x.tags = (x.tags || []).filter(t => t !== spId);
  x.tagsAus = (x.tagsAus || []).filter(t => t !== spId);
  const auto = gehoertZu(akte, sp, x, typ);
  if (an && !auto) x.tags.push(spId);
  if (!an && auto) x.tagsAus.push(spId);
  if (!x.tags.length) delete x.tags;
  if (!x.tagsAus.length) delete x.tagsAus;
}

// ---------------------------------------------------------------- Blutdruck-Messreihen
const paar = s => { const m = String(s).replace(/\s/g, '').match(/^(\d{2,3}(?:[,.]\d)?)\/(\d{2,3}(?:[,.]\d)?)$/); return m ? { sys: +m[1].replace(',', '.'), dia: +m[2].replace(',', '.') } : null; };
const zahl = s => { const m = String(s).replace(',', '.').match(/^-?\d+(\.\d+)?$/); return m ? +m[0] : null; };

/** Messquelle eines Dokuments: praxis | uhr | heim */
export function messquelle(d) {
  if (d.messquelle) return d.messquelle;
  const t = norm(`${d.titel} ${d.kurz || ''}`);
  if (/huawei|smartwatch|uhr\b/.test(t)) return 'uhr';
  if (/tagebuch|heimmessung|selbstmessung/.test(t)) return 'heim';
  return 'praxis';
}
export const QUELLE_TEXT = { praxis: 'Praxis (Langzeitgerät)', uhr: 'Huawei-Uhr', heim: 'Heimmessung (Tagebuch)' };

/**
 * Alle Blutdruck-Messungen aus den Messwerten der Dokumente.
 * 24-h-Messungen: { datum, art: '24h', quelle, h24, tag, nacht, puls, dipping, doc }
 * Heimmessungen aus dem Tagebuch (Monatsmittel): { datum, art: 'heim', quelle: 'heim', h24 (= Mittel), n, doc }
 */
export function blutdruckMessungen(akte) {
  const sp = schwerpunkt('blutdruck');
  const liste = [];
  for (const d of akte.dokumente) {
    if (!d.werte?.length || !gehoertZu(akte, sp, d, 'dokument')) continue;
    const q = messquelle(d);
    if (q === 'heim') {
      for (const [name, wert] of d.werte) {
        const p = paar(wert); const m = name.match(/mittel\s+(\d{2})(?:\s*[–-]\s*(\d{2}))?\/(\d{4})(?:.*?\((\d+)\s*Messung)?/i);
        if (!p || !m) continue;
        const mon = m[2] ? Math.round((+m[1] + +m[2]) / 2) : +m[1];
        liste.push({ datum: `${m[3]}-${String(mon).padStart(2, '0')}-15`, art: 'heim', quelle: 'heim', h24: p, n: m[4] ? +m[4] : null, doc: d });
      }
      continue;
    }
    const finde = (re, nicht = /aufwach|maximum|minimum|links|rechts/i) => d.werte.find(([n, w]) => re.test(n) && !nicht.test(n) && paar(w));
    const h24 = finde(/(24|gesamt)/i), tag = finde(/tag/i), nacht = finde(/nacht/i);
    if (!h24 && !tag) continue;
    const puls = d.werte.find(([n, w]) => /puls/i.test(n) && /(24|durchschn|mittel)/i.test(n) && zahl(w) != null);
    const dip = d.werte.find(([n, w]) => /(dipping|absenkung)/i.test(n) && /sys/i.test(n) && zahl(w) != null);
    liste.push({ datum: d.datum, art: '24h', quelle: q, h24: h24 ? paar(h24[1]) : null, tag: tag ? paar(tag[1]) : null, nacht: nacht ? paar(nacht[1]) : null,
      puls: puls ? zahl(puls[1]) : null, dipping: dip ? zahl(dip[1]) : null, doc: d });
  }
  // Doppelte Berichte derselben Messung (gleicher Tag, gleiche Werte) nur einmal
  const gesehen = new Set();
  return liste.sort((a, b) => a.datum.localeCompare(b.datum)).filter(m => {
    const k = `${m.datum}|${m.quelle}|${m.h24?.sys}/${m.h24?.dia}|${m.tag?.sys}`;
    if (gesehen.has(k)) return false; gesehen.add(k); return true;
  });
}

/** Gewichtsverlauf aus Messwerten „Gewicht TT.MM.JJJJ“. */
export function gewichtVerlauf(akte) {
  const punkte = new Map();
  for (const d of akte.dokumente) for (const [name, wert, einheit] of d.werte || []) {
    const m = name.match(/^gewicht\s+(\d{2})\.(\d{2})\.(\d{4})/i); const w = zahl(wert);
    if (m && w && (!einheit || /kg/i.test(einheit))) punkte.set(`${m[3]}-${m[2]}-${m[1]}`, { datum: `${m[3]}-${m[2]}-${m[1]}`, wert: w, doc: d });
  }
  return [...punkte.values()].sort((a, b) => a.datum.localeCompare(b.datum));
}

// ---------------------------------------------------------------- Diagramme (SVG)
// Grundbreite: am Handy schmaler, damit die Schrift beim Verkleinern lesbar bleibt
const breite = () => (typeof innerWidth === 'number' && innerWidth < 640 ? 400 : 720);
const tagNr = iso => Date.parse(iso + 'T12:00:00Z') / 864e5;
const fmt = n => String(Math.round(n * 10) / 10).replace('.', ',');

/** Zeitachse mit Jahres- bzw. Monatsmarken. */
function zeitTicks(von, bis) {
  const t = [];
  const j0 = +von.slice(0, 4), j1 = +bis.slice(0, 4);
  if (j1 - j0 >= 2) for (let j = j0 + (von.slice(5) > '01-01' ? 1 : 0); j <= j1; j++) t.push({ iso: `${j}-01-01`, text: String(j) });
  else {
    const schritt = j1 - j0 >= 1 ? 3 : 1;
    for (let j = j0; j <= j1; j++) for (let m = 1; m <= 12; m += schritt) { const iso = `${j}-${String(m).padStart(2, '0')}-01`; if (iso >= von && iso <= bis) t.push({ iso, text: m === 1 ? String(j) : `${String(m).padStart(2, '0')}/${String(j).slice(2)}` }); }
  }
  return t;
}

/**
 * Liniendiagramm mit einer y-Achse.
 * reihen: [{ name, farbe, punkte: [{ datum, y, form: 'voll'|'hohl'|'quadrat', titel }] }]
 * ziele: [{ y, text }] – gestrichelte Zielwerte; von/bis: gemeinsame Zeitachse (ISO).
 */
export function liniendiagramm({ reihen, ziele = [], von, bis, einheit = '', hoehe = 260, label = '', luecke = 200 }) {   // luecke: Tage ohne Messung, ab denen die Linie unterbrochen wird
  const alle = reihen.flatMap(r => r.punkte);
  if (!alle.length) return '';
  von ||= alle.reduce((m, p) => p.datum < m ? p.datum : m, alle[0].datum);
  bis ||= heuteIso();
  const ys = [...alle.map(p => p.y), ...ziele.map(z => z.y)];
  let yMin = Math.floor((Math.min(...ys) - 4) / 10) * 10, yMax = Math.ceil((Math.max(...ys) + 4) / 10) * 10;
  if (yMax - yMin < 20) yMax = yMin + 20;
  const W = breite(), H = hoehe, pl = 44, pr = 14, pt = 14, pb = 28;
  const x0 = tagNr(von), x1 = Math.max(tagNr(bis), x0 + 1);
  const x = iso => pl + (tagNr(iso) - x0) / (x1 - x0) * (W - pl - pr);
  const y = v => pt + (yMax - v) / (yMax - yMin) * (H - pt - pb);
  const schritt = (yMax - yMin) > 60 ? 20 : 10;
  const gitter = []; for (let v = yMin; v <= yMax; v += schritt) gitter.push(v);
  const marke = (p, farbe) => {
    const cx = x(p.datum).toFixed(1), cy = y(p.y).toFixed(1);
    const form = p.form === 'quadrat' ? `<rect x="${cx - 4.5}" y="${cy - 4.5}" width="9" height="9" rx="1.5" fill="${farbe}" stroke="var(--surface)" stroke-width="2"/>`
      : p.form === 'hohl' ? `<circle cx="${cx}" cy="${cy}" r="4.5" fill="var(--surface)" stroke="${farbe}" stroke-width="2"/>`
      : `<circle cx="${cx}" cy="${cy}" r="5.5" fill="${farbe}" stroke="var(--surface)" stroke-width="2"/>`;
    return `<g class="dg-punkt">${form}<circle cx="${cx}" cy="${cy}" r="12" fill="transparent"><title>${esc(p.titel || `${datum(p.datum)}: ${fmt(p.y)} ${einheit}`)}</title></circle></g>`;
  };
  return `<svg class="diagramm" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">
    ${gitter.map(v => `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width="1"/><text x="${pl - 6}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${v}</text>`).join('')}
    ${zeitTicks(von, bis).map(t => `<line x1="${x(t.iso)}" x2="${x(t.iso)}" y1="${pt}" y2="${H - pb}" stroke="var(--line)" stroke-width="1" stroke-dasharray="2 4"/><text x="${x(t.iso)}" y="${H - 8}" text-anchor="middle" font-size="11" fill="var(--muted)">${t.text}</text>`).join('')}
    ${ziele.map(z => `<line x1="${pl}" x2="${W - pr}" y1="${y(z.y)}" y2="${y(z.y)}" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="6 4"/><text x="${pl + 6}" y="${y(z.y) - 5}" font-size="11" fill="var(--muted)" paint-order="stroke" stroke="var(--surface)" stroke-width="3">${esc(z.text)}</text>`).join('')}
    ${reihen.map(r => r.punkte.length > 1 ? `<path d="${r.punkte.map((p, i) => `${i && tagNr(p.datum) - tagNr(r.punkte[i - 1].datum) <= luecke ? 'L' : 'M'}${x(p.datum).toFixed(1)},${y(p.y).toFixed(1)}`).join(' ')}" fill="none" stroke="${r.farbe}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"${r.gestrichelt ? ' stroke-dasharray="1 5"' : ''}/>` : '').join('')}
    ${reihen.map(r => r.punkte.map(p => marke(p, r.farbe)).join('')).join('')}
    ${reihen.map(r => { const l = r.punkte.at(-1); return l && r.beschriftung ? `<text x="${Math.min(x(l.datum) + 9, W - pr - 2)}" y="${y(l.y) + 4}" font-size="12" font-weight="700" fill="var(--fg)" text-anchor="${x(l.datum) > W - 90 ? 'end' : 'start'}" dx="${x(l.datum) > W - 90 ? -18 : 0}">${esc(r.beschriftung(l))}</text>` : ''; }).join('')}
  </svg>`;
}

/** Gestapeltes Säulendiagramm je Quartal. gruppen: [{ name, farbe }], daten: [{ quartal: 'JJJJ-Q', werte: {name: n} }] */
export function saeulenQuartale({ gruppen, daten, hoehe = 220, label = '' }) {
  if (!daten.length) return '';
  const W = breite(), H = hoehe, pl = 34, pr = 10, pt = 12, pb = 30;
  const summe = q => gruppen.reduce((n, g) => n + (q.werte[g.name] || 0), 0);
  const max = Math.max(2, ...daten.map(summe));
  const yMax = Math.ceil(max / 2) * 2;
  const bw = (W - pl - pr) / daten.length;
  const y = v => pt + (yMax - v) / yMax * (H - pt - pb);
  const gitter = []; for (let v = 0; v <= yMax; v += Math.max(1, Math.round(yMax / 4))) gitter.push(v);
  return `<svg class="diagramm" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">
    ${gitter.map(v => `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${pl - 6}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${v}</text>`).join('')}
    ${daten.map((q, i) => {
      let basis = 0; const xs = pl + i * bw + bw * 0.18, breite = Math.max(4, bw * 0.64);
      const teile = gruppen.map(g => { const n = q.werte[g.name] || 0; if (!n) return ''; const y0 = y(basis), y1 = y(basis + n); basis += n;
        return `<rect x="${xs.toFixed(1)}" y="${(y1 + 1).toFixed(1)}" width="${breite.toFixed(1)}" height="${Math.max(1, y0 - y1 - 2).toFixed(1)}" rx="2" fill="${g.farbe}"><title>${esc(`${q.quartal.split('-')[1]}. Quartal ${q.quartal.split('-')[0]} · ${g.name}: ${n}`)}</title></rect>`; }).join('');
      const beschr = q.quartal.endsWith('-1') ? `<text x="${xs + breite / 2}" y="${H - 10}" text-anchor="middle" font-size="11" fill="var(--muted)">${q.quartal.slice(0, 4)}</text>` : '';
      return teile + beschr;
    }).join('')}
  </svg>`;
}
