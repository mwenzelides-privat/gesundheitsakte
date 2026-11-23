// Datenmodell der Gesundheitsakte (akte.json) und abgeleitete Werte.
import { heute, heuteIso, iso, tag, plusMonate, plusTage, tageBis, neueId } from './hilfen.js';

export const FORMAT = 1;

export const KATEGORIEN_STANDARD = [
  { id: 'hausarzt', name: 'Hausarzt', kurz: 'HA', h: 212 },
  { id: 'zahn', name: 'Zahnarzt', kurz: 'ZA', h: 178 },
  { id: 'auge', name: 'Augenarzt', kurz: 'AU', h: 268 },
  { id: 'ruecken', name: 'Rücken & Orthopädie', kurz: 'OR', h: 24 },
  { id: 'haut', name: 'Haut', kurz: 'HT', h: 330 },
  { id: 'hno', name: 'HNO', kurz: 'HN', h: 92 },
  { id: 'uro', name: 'Urologie', kurz: 'UR', h: 46 },
  { id: 'innere', name: 'Innere & Magen-Darm', kurz: 'IN', h: 2 },
  { id: 'impf', name: 'Impfungen', kurz: 'IM', h: 145 },
  { id: 'tk', name: 'Krankenkasse', kurz: 'TK', h: 200, kein_fach: true },
];
const KAT_GYN = { id: 'gyn', name: 'Frauenarzt', kurz: 'GY', h: 300 };

export const STATUS_ERKRANKUNG = { aktiv: 'in Behandlung', chronisch: 'dauerhaft', abgeschlossen: 'abgeschlossen' };
export const DOKUMENT_TYPEN = ['Befund', 'Arztbrief', 'Labor', 'Messwerte', 'Bildgebung', 'Verordnung', 'Rezept', 'Medikationsplan', 'Impfnachweis', 'Arbeitsunfähigkeit', 'Kostenplan', 'Rechnung', 'Nachweis', 'Formular', 'Information', 'TK-Abrechnung', 'Sonstiges'];

// Vorsorge nach GKV/TK und STIKO (vereinfacht). abAlter bezieht sich auf das Kalenderjahr (nur Jahrgang bekannt).
export const VORSORGE_REGELN = [
  { id: 'gkv-zahn', name: 'Zahnärztliche Kontrolle', regel: 'halbjährlich · Bonusheft: 1 × pro Jahr', kat: 'zahn', intervallMonate: 6, abAlter: 18 },
  { id: 'tk-pzr', name: 'Professionelle Zahnreinigung', regel: 'jährlich · Zuschuss der TK', kat: 'zahn', intervallMonate: 12, abAlter: 18 },
  { id: 'gkv-checkup', name: 'Check-up (Gesundheitsuntersuchung)', regel: 'ab 35 alle 3 Jahre', kat: 'hausarzt', intervallMonate: 36, abAlter: 35 },
  { id: 'gkv-haut', name: 'Hautkrebs-Screening', regel: 'ab 35 alle 2 Jahre', kat: 'haut', intervallMonate: 24, abAlter: 35 },
  { id: 'gkv-prostata', name: 'Krebsfrüherkennung Prostata', regel: 'Männer ab 45 jährlich', kat: 'uro', intervallMonate: 12, abAlter: 45, geschlecht: 'männlich' },
  { id: 'gkv-gyn', name: 'Gynäkologische Krebsfrüherkennung', regel: 'ab 20 jährlich, ab 35 Ko-Test alle 3 Jahre', kat: 'gyn', intervallMonate: 12, abAlter: 20, geschlecht: 'weiblich' },
  { id: 'gkv-mammo', name: 'Mammographie-Screening', regel: '50 bis 75 alle 2 Jahre', kat: 'gyn', intervallMonate: 24, abAlter: 50, geschlecht: 'weiblich' },
  { id: 'gkv-darm', name: 'Darmspiegelung (Darmkrebs-Vorsorge)', regel: 'ab 50, zweimal im Abstand von 10 Jahren', kat: 'innere', intervallMonate: 120, abAlter: 50 },
  { id: 'gkv-aorta', name: 'Ultraschall Bauchschlagader', regel: 'Männer ab 65 einmalig', kat: 'innere', intervallMonate: 0, abAlter: 65, geschlecht: 'männlich' },
  { id: 'stiko-td', name: 'Tetanus, Diphtherie, Keuchhusten', regel: 'Auffrischung alle 10 Jahre', kat: 'impf', intervallMonate: 120, abAlter: 18 },
  { id: 'stiko-grippe', name: 'Grippeschutzimpfung', regel: 'ab 60 jährlich im Herbst, bei chronischen Erkrankungen früher', kat: 'impf', intervallMonate: 12, abAlter: 60 },
  { id: 'stiko-pneumo', name: 'Pneumokokken-Impfung', regel: 'ab 60 einmalig', kat: 'impf', intervallMonate: 0, abAlter: 60 },
  { id: 'stiko-zoster', name: 'Gürtelrose-Impfung (2 Dosen)', regel: 'ab 60 einmalig', kat: 'impf', intervallMonate: 0, abAlter: 60 },
  { id: 'eigen-auge', name: 'Augeninnendruck (Glaukom-Vorsorge)', regel: 'Empfehlung ab 40 alle 2 Jahre, Selbstzahlerleistung', kat: 'auge', intervallMonate: 24, abAlter: 40, vorschlag: true },
];

export function neueAkte(profil) {
  const akte = {
    format: FORMAT, angelegt: new Date().toISOString(), geaendert: new Date().toISOString(),
    profil: { name: '', jahrgang: null, geschlecht: '', kasse: 'Techniker Krankenkasse', ...profil },
    einstellungen: { erinnerungVorlaufTage: 42 },
    kategorien: KATEGORIEN_STANDARD.map(k => ({ ...k })),
    aerzte: [], erkrankungen: [], dokumente: [], termine: [], vorsorge: [], medikamente: [],
  };
  vorsorgeAbgleichen(akte);
  return akte;
}

/** Fehlende Felder ergänzen (ältere oder unvollständige Dateien). */
export function pruefen(akte) {
  if (!akte || typeof akte !== 'object') throw new Error('Die Akte ist leer oder beschädigt.');
  akte.format ??= FORMAT;
  akte.profil ??= { name: '', jahrgang: null, geschlecht: '', kasse: 'Techniker Krankenkasse' };
  akte.einstellungen ??= { erinnerungVorlaufTage: 42 };
  akte.kategorien ??= KATEGORIEN_STANDARD.map(k => ({ ...k }));
  if (!akte.kategorien.some(k => k.id === 'tk')) akte.kategorien.push({ ...KATEGORIEN_STANDARD.at(-1) });
  for (const f of ['aerzte', 'erkrankungen', 'dokumente', 'termine', 'vorsorge', 'medikamente']) akte[f] ??= [];
  return akte;
}

/** Ergänzt Vorsorge-Regeln, die zum Profil passen und noch fehlen. Löscht nie etwas. */
export function vorsorgeAbgleichen(akte) {
  const g = akte.profil.geschlecht;
  let neu = 0;
  for (const r of VORSORGE_REGELN) {
    if (r.geschlecht && r.geschlecht !== g) continue;
    if (akte.vorsorge.some(v => v.regelId === r.id)) continue;
    if (r.kat === 'gyn' && !akte.kategorien.some(k => k.id === 'gyn')) akte.kategorien.splice(-1, 0, { ...KAT_GYN });
    akte.vorsorge.push({
      id: neueId('v'), regelId: r.id, name: r.name, regel: r.regel, kat: r.kat, intervallMonate: r.intervallMonate,
      abAlter: r.abAlter, arzt: null, zuletzt: null, faelligManuell: null, aktiv: !r.vorschlag, notiz: '',
    });
    neu++;
  }
  return neu;
}

// ---------- Zugriffe ----------
export const finde = (akte, liste, id) => id ? akte[liste].find(x => x.id === id) || null : null;
export const kat = (akte, id) => akte.kategorien.find(k => k.id === id) || { id: id || '', name: 'Ohne Fach', kurz: '–', h: 200 };
export const faecher = akte => akte.kategorien.filter(k => !k.kein_fach);
export const katVonTermin = (akte, t) => t.kat || finde(akte, 'aerzte', t.arzt)?.kat || null;
export const alter = akte => akte.profil.jahrgang ? heute().getFullYear() - akte.profil.jahrgang : null;

// ---------- Vorsorge ----------
export const V_TEXT = { ueber: 'überfällig', bald: 'bald fällig', geplant: 'Termin steht', ok: 'erledigt', spaeter: 'später', unbekannt: 'Datum fehlt', aus: 'ausgeschaltet' };
export const V_RANG = { ueber: 0, unbekannt: 1, bald: 2, geplant: 3, ok: 4, spaeter: 5, aus: 6 };

export function vorsorgeLage(akte, v) {
  if (!v.aktiv) return { status: 'aus', faellig: null };
  const jg = akte.profil.jahrgang;
  const abDatum = jg && v.abAlter ? `${jg + v.abAlter}-01-01` : null;
  let faellig = v.faelligManuell || null;
  if (!faellig) {
    if (!v.zuletzt) {
      if (abDatum && tageBis(abDatum) > 0) return { status: 'spaeter', faellig: abDatum };
      return { status: 'unbekannt', faellig: null };
    }
    if (!v.intervallMonate) return { status: 'ok', faellig: null, einmalig: true };
    faellig = plusMonate(v.zuletzt, v.intervallMonate);
  }
  const t = tageBis(faellig);
  const termin = akte.termine
    .filter(x => tageBis(x.datum) >= 0 && (x.vorsorge === v.id || katVonTermin(akte, x) === v.kat))
    .sort((a, b) => a.datum.localeCompare(b.datum))[0];
  if (termin && t <= 180) return { status: 'geplant', faellig, termin };
  if (t < 0) return { status: 'ueber', faellig };
  if (t <= 90) return { status: 'bald', faellig };
  return { status: 'ok', faellig, erinnerung: plusTage(faellig, -(akte.einstellungen.erinnerungVorlaufTage || 42)) };
}

// ---------- Sprechzeiten ----------
const minuten = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const WT = ['so', 'mo', 'di', 'mi', 'do', 'fr', 'sa'];
const WT_LANG = { mo: 'Montag', di: 'Dienstag', mi: 'Mittwoch', do: 'Donnerstag', fr: 'Freitag', sa: 'Samstag', so: 'Sonntag' };
export function offen(a, jetzt = new Date()) {
  const z = a.zeiten || {};
  if (!Object.values(z).some(x => x && x.length)) return { offen: false, text: 'Sprechzeiten nicht hinterlegt', unbekannt: true };
  const heuteZ = z[WT[jetzt.getDay()]] || [];
  const m = jetzt.getHours() * 60 + jetzt.getMinutes();
  for (const [v, b] of heuteZ) if (m >= minuten(v) && m < minuten(b)) return { offen: true, text: `geöffnet bis ${b}` };
  const spaeter = heuteZ.find(([v]) => minuten(v) > m);
  if (spaeter) return { offen: false, text: `geschlossen · öffnet heute ${spaeter[0]}` };
  for (let i = 1; i <= 7; i++) {
    const w = WT[(jetzt.getDay() + i) % 7];
    if ((z[w] || []).length) return { offen: false, text: `geschlossen · öffnet ${i === 1 ? 'morgen' : WT_LANG[w]} ${z[w][0][0]}` };
  }
  return { offen: false, text: 'Sprechzeiten nicht hinterlegt', unbekannt: true };
}

/** "08:00-12:00, 15:00–18:00" → [['08:00','12:00'],['15:00','18:00']]; wirft bei Fehlern */
export function zeitenLesen(text) {
  const t = String(text || '').trim();
  if (!t || /^(geschlossen|zu|-|–)$/i.test(t)) return [];
  return t.split(/[,;]/).map(s => s.trim()).filter(Boolean).map(s => {
    const m = s.match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(?:-|–|bis)\s*(\d{1,2})(?:[:.](\d{2}))?(?:\s*Uhr)?$/i);
    if (!m) throw new Error(`„${s}“ verstehe ich nicht. Beispiel: 08:00–12:00, 15:00–18:00`);
    const a = `${m[1].padStart(2, '0')}:${m[2] || '00'}`, b = `${m[3].padStart(2, '0')}:${m[4] || '00'}`;
    if (minuten(a) >= minuten(b) || minuten(b) > 24 * 60) throw new Error(`„${s}“: Ende muss nach dem Beginn liegen.`);
    return [a, b];
  });
}
export const zeitenText = z => (z || []).map(x => x.join('–')).join(', ');

export { heuteIso, iso, tag };
