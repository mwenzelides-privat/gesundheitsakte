// Iteration 5: Befund-Auswertung mit Claude (Anthropic API).
//
// Claude liest PDFs, Scans und Fotos vollständig (auch ohne Textebene) und liefert einen strukturierten
// Vorschlag: Titel, Datum, Art, Fach, Arzt, Erkrankung, Diagnosen mit ICD-10, Messwerte mit Referenz
// und eine kurze Zusammenfassung in einfachem Deutsch.
//
// Der API-Schlüssel liegt nur in deinem Google Drive (Gesundheitsakte/claude-zugang.json) und während der
// Sitzung im Speicher des Browsers – nie im Code und nie im Browser-Speicher (localStorage).
import { Z, aendern } from './speicher.js';
import { KI_MODELL, KI_SDK, KI_SCHLUESSEL_DATEI, KI_MAX_MB, KI_PREIS } from './konfig.js';
import { DOKUMENT_TYPEN, finde } from './modell.js';
import { heuteIso, neueId } from './hilfen.js';

const TEST = new URLSearchParams(location.search).has('test');

// ---------------------------------------------------------------- Schlüssel
let schluessel = null;
let geprueft = false;
const kontoBereit = () => Z.modus === 'konto' && Z.drive?.verbunden() && Z.ids.wurzel;

export const kiBereit = () => !!schluessel;
export const kiGeprueft = () => geprueft;

/** Schlüssel aus Drive laden (einmal pro Sitzung). Liefert true, wenn einer da ist. */
export async function schluesselLaden() {
  if (schluessel) return true;
  if (!kontoBereit()) return false;
  const f = await Z.drive.dateiSuchen(KI_SCHLUESSEL_DATEI, Z.ids.wurzel);
  schluessel = f ? (await Z.drive.jsonLesen(f.id))?.schluessel || null : null;
  geprueft = true;
  return !!schluessel;
}

/** Schlüssel prüfen (eine kostenlose Abfrage der Modell-Info) und in Drive speichern. */
export async function schluesselSpeichern(wert) {
  wert = String(wert || '').trim();
  if (!/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(wert)) throw new Error('Das sieht nicht wie ein Claude-API-Schlüssel aus. Er beginnt mit „sk-ant-“.');
  if (!kontoBereit()) throw new Error('Bitte zuerst mit Google verbinden.');
  if (!TEST) {
    const Anthropic = await sdk();
    try { await new Anthropic({ apiKey: wert, dangerouslyAllowBrowser: true }).models.retrieve(KI_MODELL); }
    catch (e) { throw new Error(fehlerText(e, Anthropic)); }
  }
  const inhalt = new Blob([JSON.stringify({
    schluessel: wert, gespeichert: new Date().toISOString(),
    hinweis: 'Claude-API-Schlüssel für die Gesundheitsakte. Nicht weitergeben. Löschen oder in der Anthropic Console widerrufen, wenn er nicht mehr gebraucht wird.',
  }, null, 2)], { type: 'application/json' });
  const vorhanden = await Z.drive.dateiSuchen(KI_SCHLUESSEL_DATEI, Z.ids.wurzel);
  if (vorhanden) await Z.drive.ueberschreiben(vorhanden.id, inhalt, 'application/json');
  else await Z.drive.dateiAnlegen(KI_SCHLUESSEL_DATEI, Z.ids.wurzel, inhalt, 'application/json');
  schluessel = wert; geprueft = true;
}

/** Schlüssel-Datei in den Drive-Papierkorb legen und aus dem Speicher nehmen. */
export async function schluesselEntfernen() {
  if (kontoBereit()) {
    const f = await Z.drive.dateiSuchen(KI_SCHLUESSEL_DATEI, Z.ids.wurzel);
    if (f) await Z.drive.inPapierkorb(f.id);
  }
  schluessel = null; geprueft = true;
}
/** Beim Trennen/Abmelden: Schlüssel vergessen. */
export function schluesselVergessen() { schluessel = null; geprueft = false; }

// ---------------------------------------------------------------- Claude-Zugang
let sdkModul = null;
async function sdk() {
  sdkModul ||= (await import(KI_SDK)).default;
  return sdkModul;
}

function fehlerText(e, A) {
  if (A && e instanceof A.AuthenticationError) return 'Der Claude-API-Schlüssel wurde abgelehnt. Bitte in den Einstellungen neu eintragen.';
  if (A && e instanceof A.PermissionDeniedError) return 'Der API-Schlüssel darf dieses Modell nicht nutzen.';
  if (A && e instanceof A.RateLimitError) return 'Zu viele Anfragen an Claude. Bitte eine Minute warten.';
  if (A && e instanceof A.APIConnectionError) return 'Keine Verbindung zu Claude. Bitte Internetverbindung prüfen.';
  if (A && e instanceof A.APIError) {
    const text = e.error?.error?.message || e.message || '';
    if (/credit balance/i.test(text)) return 'Das Guthaben im Anthropic-Konto ist aufgebraucht. Bitte in der Anthropic Console aufladen.';
    return `Claude meldet einen Fehler (${e.status ?? '–'}): ${text}`;
  }
  return e?.message || String(e);
}

// ---------------------------------------------------------------- Anfrage
const BILDTYPEN = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };
function dateiArt(f) {
  const endung = (String(f.name).match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase() || '';
  const mime = String(f.mimeType || '').toLowerCase();
  if (mime === 'application/pdf' || endung === 'pdf') return { art: 'pdf', mime: 'application/pdf' };
  if (/heic|heif/.test(mime + endung)) return { fehler: 'HEIC-Fotos kann Claude nicht lesen. Bitte das Foto als JPG teilen oder in Drive als PDF scannen.' };
  if (Object.values(BILDTYPEN).includes(mime)) return { art: 'bild', mime };
  if (BILDTYPEN[endung]) return { art: 'bild', mime: BILDTYPEN[endung] };
  return { fehler: 'Nur PDFs und Fotos (JPG, PNG, WebP, GIF) können ausgewertet werden.' };
}

function base64(puffer) {
  const b = new Uint8Array(puffer);
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(s);
}

const SYSTEM = `Du wertest medizinische Unterlagen für die private Gesundheitsakte eines Patienten aus: Befunde, Arztbriefe, Laborberichte, Bildgebung, Verordnungen, Rechnungen, Kostenpläne, Krankenkassen-Unterlagen.

Grundsätze:
- Lies das ganze Dokument, auch eingescannte Seiten, Tabellen und Handschrift.
- Übernimm nur, was im Dokument steht. Erfinde nichts. Was nicht erkennbar ist, bleibt eine leere Zeichenkette bzw. eine leere Liste.
- Schreibe auf Deutsch, sachlich und für Laien verständlich.

Felder:
- titel: kurz und aussagekräftig, ohne Datum und ohne Patientennamen, z. B. „MRT Lendenwirbelsäule“, „Laborbefund Blutbild und Blutfette“, „Rechnung Zahnreinigung“.
- datum: Datum der Untersuchung bzw. des Dokuments als JJJJ-MM-TT. Nie das Geburtsdatum.
- typ: passende Art aus der vorgegebenen Liste.
- kat: Fachbereich-ID aus der Liste; „tk“ für Unterlagen der Krankenkasse.
- arzt: ID der Praxis oder Klinik, die das Dokument ausgestellt hat (Absender, nicht Empfänger und nicht überweisender Arzt). Leer, wenn sie nicht in der Liste steht.
- absender_neu: nur wenn der Absender eine Praxis/Klinik ist, die NICHT in der Liste steht: Name, Fachrichtung, Anschrift, Telefon aus dem Briefkopf. Sonst alles leer.
- erkrankung: ID einer vorhandenen Erkrankung, zu der das Dokument gehört. Sonst leer.
- erkrankung_neu: nur wenn das Dokument eine neue, behandlungsrelevante Diagnose feststellt, die noch nicht in der Liste steht (nicht bei Routine-Kontrollen ohne Befund, Rechnungen oder Verwaltungsschreiben): Bezeichnung und ICD-10-GM-Code. Sonst leer.
- diagnosen: alle im Dokument genannten Diagnosen mit ICD-10-GM-Code. Den Code nur angeben, wenn er im Dokument steht oder eindeutig ist; sonst leer.
- werte: alle Mess- und Laborwerte mit Name, Wert (wie im Dokument, Dezimalkomma), Einheit, Referenzbereich und ob der Wert auffällig ist (außerhalb der Referenz oder im Dokument markiert). Höchstens 60.
- kurz: 2 bis 5 Sätze: Was wurde untersucht, was kam heraus, was wird empfohlen. Fachbegriffe kurz erklären.
- naechste_schritte: empfohlene Kontrollen oder Maßnahmen mit Zeitangabe, z. B. „Kontrolle in 12 Monaten“.
- sicherheit: 0 bis 100 – wie sicher die Zuordnung (Datum, Art, Fach, Arzt) ist.`;

function schema(akte) {
  const leerOder = ids => ['', ...ids];
  const text = { type: 'string' };
  return {
    type: 'object',
    additionalProperties: false,
    required: ['titel', 'datum', 'typ', 'kat', 'arzt', 'absender_neu', 'erkrankung', 'erkrankung_neu', 'diagnosen', 'werte', 'kurz', 'naechste_schritte', 'sicherheit'],
    properties: {
      titel: text,
      datum: text,
      typ: { type: 'string', enum: DOKUMENT_TYPEN },
      kat: { type: 'string', enum: leerOder(akte.kategorien.map(k => k.id)) },
      arzt: { type: 'string', enum: leerOder(akte.aerzte.map(a => a.id)) },
      absender_neu: { type: 'object', additionalProperties: false, required: ['name', 'fach', 'adresse', 'telefon'], properties: { name: text, fach: text, adresse: text, telefon: text } },
      erkrankung: { type: 'string', enum: leerOder(akte.erkrankungen.map(e => e.id)) },
      erkrankung_neu: { type: 'object', additionalProperties: false, required: ['titel', 'icd'], properties: { titel: text, icd: text } },
      diagnosen: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['text', 'icd'], properties: { text, icd: text } } },
      werte: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'wert', 'einheit', 'referenz', 'auffaellig'], properties: { name: text, wert: text, einheit: text, referenz: text, auffaellig: { type: 'boolean' } } } },
      kurz: text,
      naechste_schritte: { type: 'array', items: text },
      sicherheit: { type: 'integer' },
    },
  };
}

function kontext(akte, f) {
  const p = akte.profil || {};
  return `Dateiname: ${f.name}
Patient: Jahrgang ${p.jahrgang || 'unbekannt'}, ${p.geschlecht || 'Geschlecht unbekannt'}

Arten (typ): ${DOKUMENT_TYPEN.join(', ')}

Fachbereiche (kat):
${akte.kategorien.map(k => `- ${k.id}: ${k.name}`).join('\n')}

Ärzte und Praxen (arzt):
${akte.aerzte.map(a => `- ${a.id}: ${a.name}${a.fach ? ' – ' + a.fach : ''}${a.adresse ? ' – ' + a.adresse : ''} [kat ${a.kat}]`).join('\n') || '- (noch keine)'}

Bekannte Erkrankungen (erkrankung):
${akte.erkrankungen.map(e => `- ${e.id}: ${e.titel}${e.icd ? ' (' + e.icd + ')' : ''} [kat ${e.kat}, ${e.von || '?'} bis ${e.bis || 'heute'}]`).join('\n') || '- (noch keine)'}

Werte bitte das beigefügte Dokument aus.`;
}

/** Eine Datei aus Drive von Claude auswerten lassen. Liefert das geprüfte Ergebnis. */
async function anfragen(f) {
  if (!schluessel) await schluesselLaden();
  if (!schluessel) throw Object.assign(new Error('Für die Auswertung fehlt der Claude-API-Schlüssel (Einstellungen → Befund-Auswertung).'), { name: 'KeinSchluessel' });
  const art = dateiArt(f);
  if (art.fehler) throw new Error(art.fehler);
  if (Number(f.size || 0) > KI_MAX_MB * 1e6) throw new Error(`Die Datei ist größer als ${KI_MAX_MB} MB und kann nicht ausgewertet werden.`);

  const daten = base64(await Z.drive.dateiInhalt(f.id));
  const block = art.art === 'pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: daten } }
    : { type: 'image', source: { type: 'base64', media_type: art.mime, data: daten } };
  const anfrage = {
    model: KI_MODELL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    thinking: { type: 'adaptive' },
    output_config: { effort: 'high', format: { type: 'json_schema', schema: schema(Z.akte) } },
    system: SYSTEM,
    messages: [{ role: 'user', content: [block, { type: 'text', text: kontext(Z.akte, f) }] }],
  };

  let antwort, A = null;
  try {
    if (TEST) antwort = await testAntwort(anfrage);
    else {
      A = await sdk();
      const client = new A({ apiKey: schluessel, dangerouslyAllowBrowser: true, maxRetries: 2 });
      antwort = await client.beta.messages.stream(anfrage).finalMessage();
    }
  } catch (e) { throw new Error(fehlerText(e, A)); }

  verbrauchMerken(antwort.usage);
  if (antwort.stop_reason === 'refusal') throw new Error('Claude hat die Auswertung dieses Dokuments abgelehnt. Bitte selbst einordnen.');
  if (antwort.stop_reason === 'max_tokens') throw new Error('Das Dokument ist zu umfangreich für eine Auswertung am Stück.');
  const text = antwort.content.find(b => b.type === 'text')?.text;
  let r;
  try { r = JSON.parse(text); } catch { throw new Error('Die Antwort von Claude war unvollständig. Bitte noch einmal versuchen.'); }
  const ersatz = (antwort.usage?.iterations || []).some(x => x.type === 'fallback_message');
  return { r, modell: antwort.model, ersatz };
}

function verbrauchMerken(u) {
  if (!u) return;
  aendern(a => {
    const v = (a.einstellungen.kiVerbrauch ||= { anzahl: 0, eingabe: 0, ausgabe: 0, seit: heuteIso() });
    v.anzahl++;
    v.eingabe += (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
    v.ausgabe += u.output_tokens || 0;
  });
}
/** Geschätzte Kosten in US-Dollar. */
export const kosten = v => v ? (v.eingabe * KI_PREIS.eingabe + v.ausgabe * KI_PREIS.ausgabe) / 1e6 : 0;

// ---------------------------------------------------------------- Ergebnis aufbereiten
const gueltigesDatum = d => /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= '1950-01-01' && d <= heuteIso();
const sauber = s => String(s || '').trim();

function aufbereiten(akte, { r, modell, ersatz }, vorher = {}) {
  const hat = (liste, id) => id && akte[liste].some(x => x.id === id);
  // Schon vorhanden, nur nicht erkannt? Dann den vorhandenen Eintrag nehmen statt einen neuen vorzuschlagen.
  const gleich = (liste, feld, name) => akte[liste].find(x => sauber(x[feld]).toLowerCase() === sauber(name).toLowerCase())?.id;
  if (!hat('aerzte', r.arzt) && r.absender_neu?.name) r.arzt = gleich('aerzte', 'name', r.absender_neu.name) || r.arzt;
  if (!hat('erkrankungen', r.erkrankung) && r.erkrankung_neu?.titel) r.erkrankung = gleich('erkrankungen', 'titel', r.erkrankung_neu.titel) || r.erkrankung;
  const absender = r.absender_neu && sauber(r.absender_neu.name) && !hat('aerzte', r.arzt)
    ? { name: sauber(r.absender_neu.name), fach: sauber(r.absender_neu.fach), adresse: sauber(r.absender_neu.adresse), tel: sauber(r.absender_neu.telefon) } : null;
  const erkNeu = r.erkrankung_neu && sauber(r.erkrankung_neu.titel) && !hat('erkrankungen', r.erkrankung)
    ? { titel: sauber(r.erkrankung_neu.titel), icd: sauber(r.erkrankung_neu.icd).toUpperCase() } : null;
  const kat = akte.kategorien.some(k => k.id === r.kat) ? r.kat : (vorher.kat || null);
  return {
    titel: sauber(r.titel) || vorher.titel || 'Dokument',
    datum: gueltigesDatum(r.datum) ? r.datum : (vorher.datum || heuteIso()),
    typ: DOKUMENT_TYPEN.includes(r.typ) ? r.typ : (vorher.typ || 'Befund'),
    kat,
    arzt: hat('aerzte', r.arzt) ? r.arzt : null,
    erk: hat('erkrankungen', r.erkrankung) ? r.erkrankung : null,
    kurz: sauber(r.kurz),
    werte: (r.werte || []).filter(w => sauber(w.name) && sauber(w.wert)).slice(0, 60)
      .map(w => [sauber(w.name), sauber(w.wert), sauber(w.einheit), sauber(w.referenz), !!w.auffaellig]),
    diagnosen: (r.diagnosen || []).filter(d => sauber(d.text)).map(d => ({ text: sauber(d.text), icd: sauber(d.icd).toUpperCase() })),
    naechste: (r.naechste_schritte || []).map(sauber).filter(Boolean),
    arztNeu: absender ? { ...absender, kat } : null,
    erkNeu: erkNeu ? { ...erkNeu, kat } : null,
    sicherheit: Math.max(0, Math.min(100, Math.round(Number(r.sicherheit) || 0))),
    ki: true,
    kiModell: modell,
    gruende: [ersatz ? `ausgewertet von Claude (Ersatzmodell ${modell})` : 'ausgewertet von Claude'],
  };
}

// ---------------------------------------------------------------- Eingang
const laufend = new Set();
export const wirdAusgewertet = id => laufend.has(id);

/** Datei im Eingang (oder unerfasst) auswerten und den Vorschlag ersetzen. */
export async function eingangAuswerten(f, nachher = () => {}) {
  if (laufend.has(f.id)) return null;
  laufend.add(f.id); nachher();
  try {
    const vorher = Z.vorschlaege[f.id] || {};
    const v = aufbereiten(Z.akte, await anfragen(f), vorher);
    Z.vorschlaege[f.id] = { ...vorher, ...v, quelle: vorher.quelle || 'Sonstiges', schluessel: vorher.schluessel, kiFehler: null };
    return Z.vorschlaege[f.id];
  } catch (e) {
    if (Z.vorschlaege[f.id]) Z.vorschlaege[f.id].kiFehler = e.message;
    throw e;
  } finally { laufend.delete(f.id); nachher(); }
}

/**
 * Neue Dateien im Eingang automatisch auswerten (wenn eingeschaltet und ein Schlüssel da ist).
 * Ausgelassen: Duplikate, schon ausgewertete Dateien und solche, bei denen es schon einen Fehler gab.
 */
let automatikLaeuft = false;
export async function eingangAutomatisch(istDuplikat, nachher = () => {}) {
  if (automatikLaeuft || !Z.akte || Z.akte.einstellungen?.kiAutomatisch === false) return;
  if (!(await schluesselLaden())) return;
  automatikLaeuft = true;
  try {
    for (const f of [...(Z.eingang || [])]) {
      const v = Z.vorschlaege[f.id];
      if (!v || v.ki || v.kiFehler || istDuplikat(f) || dateiArt(f).fehler) continue;
      try { await eingangAuswerten(f, nachher); }
      catch (e) { if (/Schlüssel|Guthaben|Verbindung|Anfragen/.test(e.message)) throw e; }
    }
  } finally { automatikLaeuft = false; }
}

// ---------------------------------------------------------------- Abgelegte Dokumente
/** Abgelegtes Dokument (neu) auswerten. Titel, Datum, Fach und Datei bleiben, Inhalt und Werte werden ersetzt. */
export async function dokumentAuswerten(docId) {
  const d = finde(Z.akte, 'dokumente', docId);
  if (!d?.driveId) throw new Error('Zu diesem Dokument ist keine Datei in Google Drive hinterlegt.');
  if (Z.modus !== 'konto' || !Z.drive?.verbunden()) throw Object.assign(new Error('Bitte zuerst mit Google verbinden.'), { name: 'AnmeldungNoetig' });
  if (laufend.has(docId)) return null;
  laufend.add(docId);
  try {
    const m = await Z.drive.metadaten(d.driveId);
    const v = aufbereiten(Z.akte, await anfragen(m), d);
    aendern(a => {
      const x = finde(a, 'dokumente', docId); if (!x) return;
      // Eine selbst geschriebene Notiz (z. B. aus dem Gesundheitstagebuch) bleibt als Notiz erhalten
      if (x.kurz && !x.ki && !x.notiz) x.notiz = x.kurz;
      Object.assign(x, { kurz: v.kurz, werte: v.werte, diagnosen: v.diagnosen, naechste: v.naechste, ki: true, kiModell: v.kiModell, kiStand: heuteIso() });
      if (!x.arzt && v.arzt) x.arzt = v.arzt;
      if (!x.erk && v.erk) x.erk = v.erk;
    });
    return v;
  } finally { laufend.delete(docId); }
}

/** Dokumente mit Datei, die noch nicht ausgewertet sind. */
export const offeneDokumente = akte => akte.dokumente.filter(d => d.driveId && !d.ki && dateiArt({ name: d.datei || '', mimeType: '' }).fehler === undefined);

let stapel = null;
export const stapelStand = () => stapel;
/** Mehrere Dokumente nacheinander auswerten. Bricht bei Schlüssel-, Guthaben- oder Verbindungsfehlern ab. */
export async function stapelAuswerten(ids, nachher = () => {}) {
  if (stapel) return stapel;
  stapel = { gesamt: ids.length, fertig: 0, fehler: 0, abbruch: null, stopp: false };
  nachher();
  try {
    for (const id of ids) {
      if (stapel.stopp) break;
      try { await dokumentAuswerten(id); stapel.fertig++; }
      catch (e) {
        stapel.fehler++;
        if (/Schlüssel|Guthaben|Verbindung|verbinden|Anfragen/.test(e.message) || e.name === 'AnmeldungNoetig') { stapel.abbruch = e.message; break; }
      }
      nachher();
    }
    return { ...stapel };
  } finally { const s = stapel; stapel = null; nachher(s); }
}
export function stapelStoppen() { if (stapel) stapel.stopp = true; }

// ---------------------------------------------------------------- Übernehmen von Vorschlägen für neue Ärzte/Erkrankungen
/** Legt vorgeschlagene neue Praxis bzw. Erkrankung an und liefert ihre IDs. Läuft innerhalb von aendern(). */
export function neueEintraegeAnlegen(a, v, datum) {
  const ids = {};
  if (v.arztNeu?.name) {
    const vorhanden = a.aerzte.find(x => x.name.toLowerCase() === v.arztNeu.name.toLowerCase());
    if (vorhanden) ids.arzt = vorhanden.id;
    else {
      const id = neueId('a'); ids.arztAngelegt = true;
      a.aerzte.push({ id, name: v.arztNeu.name, fach: v.arztNeu.fach || '', kat: v.arztNeu.kat || v.kat, adresse: v.arztNeu.adresse || '', tel: v.arztNeu.tel || '', web: '', zeiten: {}, notiz: 'Aus einem Dokument übernommen (Claude-Auswertung).' });
      ids.arzt = id;
    }
  }
  if (v.erkNeu?.titel) {
    const vorhanden = a.erkrankungen.find(x => x.titel.toLowerCase() === v.erkNeu.titel.toLowerCase() || (v.erkNeu.icd && x.icd === v.erkNeu.icd && x.kat === (v.erkNeu.kat || v.kat)));
    if (vorhanden) ids.erk = vorhanden.id;
    else {
      const id = neueId('e'); ids.erkAngelegt = true;
      a.erkrankungen.push({ id, titel: v.erkNeu.titel, icd: v.erkNeu.icd || '', kat: v.erkNeu.kat || v.kat, von: datum.slice(0, 7), bis: null, status: 'aktiv', aerzte: ids.arzt || v.arzt ? [ids.arzt || v.arzt] : [], notiz: 'Aus einem Dokument übernommen (Claude-Auswertung).' });
      ids.erk = id;
    }
  }
  return ids;
}

// ---------------------------------------------------------------- Testmodus (?test): Claude wird nur nachgeahmt
async function testAntwort(anfrage) {
  await new Promise(r => setTimeout(r, 300));
  const enumVon = n => anfrage.output_config.format.schema.properties[n].enum.filter(Boolean);
  const kat = enumVon('kat').includes('hausarzt') ? 'hausarzt' : enumVon('kat')[0];
  const r = {
    titel: 'Laborbefund Blutfette (Test)', datum: '2026-11-18', typ: 'Labor', kat, arzt: '',
    absender_neu: { name: 'Labor Musterstadt (Test)', fach: 'Laboratoriumsmedizin', adresse: 'Teststraße 1, 12345 Musterstadt', telefon: '01234 5678' },
    erkrankung: '', erkrankung_neu: { titel: 'Fettstoffwechselstörung (Test)', icd: 'E78.0' },
    diagnosen: [{ text: 'Reine Hypercholesterinämie', icd: 'E78.0' }],
    werte: [{ name: 'LDL-Cholesterin', wert: '171', einheit: 'mg/dl', referenz: '< 116', auffaellig: true }, { name: 'HDL-Cholesterin', wert: '52', einheit: 'mg/dl', referenz: '> 40', auffaellig: false }],
    kurz: 'Testauswertung: Das LDL-Cholesterin ist erhöht, das HDL-Cholesterin liegt im Normbereich. Empfohlen wird eine Kontrolle in 6 Monaten.',
    naechste_schritte: ['Kontrolle der Blutfette in 6 Monaten'], sicherheit: 88,
  };
  return { model: KI_MODELL, stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(r) }], usage: { input_tokens: 4200, output_tokens: 900 } };
}
