// Laden, Speichern und Abgleich der Akte mit Google Drive.
//
// Grundsatz: Jede Änderung landet sofort im Browser-Speicher dieses Geräts und wird dann nach
// Drive geschrieben. Vor jedem Schreiben wird geprüft, ob die Datei in Drive inzwischen von einem
// anderen Gerät geändert wurde (Prüfsumme). Dann entscheidest du, welcher Stand gilt.
// Einmal am Tag wird vor dem Überschreiben eine Kopie in 90_Sicherungen abgelegt.
import { ORDNER, AKTE_DATEI, SICHERUNGEN_BEHALTEN, PRIVATE_DOMAINS, WURZEL_PFAD } from './konfig.js';
import { neueAkte, pruefen, vorsorgeAbgleichen, kat } from './modell.js';
import { beispielAkte } from './beispiel.js';
import { heuteIso, dateiname } from './hilfen.js';

export const Z = {
  modus: 'leer',          // 'leer' (Begrüßung) | 'beispiel' | 'konto'
  akte: null,
  konto: null,            // { email, name }
  drive: null,            // googleDrive oder testDrive
  ids: {},                // Ordner- und Datei-IDs in Drive
  version: null,          // Prüfsumme von akte.json, auf der der lokale Stand beruht
  ungespeichert: false,
  status: 'getrennt',     // 'getrennt' | 'verbinde' | 'bereit' | 'speichert' | 'fehler' | 'konflikt'
  meldung: '',
  zuletztGespeichert: null,
  konflikt: null,         // { fremd, version }
  eingang: null,          // Dateien in 00_Eingang (null = noch nicht gelesen)
  kalender: null,         // { stand, gelesen, kandidaten, fehler } – nur im Speicher, nicht in der Akte
  kalenderNamen: null,    // { kalenderId: Name } nach „Auswählen“
};

let beobachter = () => {};
export const beobachten = fn => { beobachter = fn; };
const melden = () => beobachter();

// ---------- Browser-Speicher ----------
const LS_KONTO = 'gesundheitsakte.konto';
const LS_PRIVAT = 'gesundheitsakte.privat-bestaetigt';
const lsAkte = email => 'gesundheitsakte.akte.' + email;
const lsSicherung = email => 'gesundheitsakte.sicherung.' + email;
function lsLesen(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }
function lsSchreiben(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } }
function lsLoeschen(k) { try { localStorage.removeItem(k); } catch { /* egal */ } }

export const letztesKonto = () => lsLesen(LS_KONTO);
export const istPrivat = email => PRIVATE_DOMAINS.includes(String(email).split('@')[1]?.toLowerCase()) || (lsLesen(LS_PRIVAT) || []).includes(email);
export function privatBestaetigen(email) { const l = lsLesen(LS_PRIVAT) || []; if (!l.includes(email)) l.push(email); lsSchreiben(LS_PRIVAT, l); }

function cacheSchreiben() {
  if (Z.modus !== 'konto' || !Z.konto || !Z.akte) return;
  const ok = lsSchreiben(lsAkte(Z.konto.email), { akte: Z.akte, version: Z.version, ungespeichert: Z.ungespeichert, ids: Z.ids, zeit: Date.now() });
  if (!ok) console.warn('Browser-Speicher voll oder gesperrt – lokaler Stand nicht gesichert.');
}

const istAnmeldefehler = e => e?.name === 'AnmeldungNoetig';
function fehlerBehandeln(e) {
  console.error(e);
  if (istAnmeldefehler(e)) { Z.status = 'getrennt'; Z.meldung = e.message; }
  else { Z.status = 'fehler'; Z.meldung = e.message || String(e); }
}

// ---------- Start ----------
/** Zuletzt benutztes Konto mit dem Stand auf diesem Gerät anzeigen (ohne Netz, ohne Anmeldung). */
export function ausCacheStarten(drive) {
  const k = letztesKonto(); if (!k) return false;
  const c = lsLesen(lsAkte(k.email));
  Object.assign(Z, { modus: 'konto', drive, konto: k, akte: c?.akte ? pruefen(c.akte) : null, version: c?.version ?? null, ungespeichert: !!c?.ungespeichert, ids: c?.ids || {}, status: 'getrennt', meldung: '' });
  return true;
}
export function beispielStarten() {
  Object.assign(Z, { modus: 'beispiel', akte: beispielAkte(), konto: null, status: 'getrennt', ungespeichert: false, konflikt: null, eingang: null, meldung: '' });
  melden();
}
export function zurBegruessung() { Object.assign(Z, { modus: 'leer', akte: null, konto: null, status: 'getrennt', eingang: null }); melden(); }

// ---------- Verbinden ----------
/** Schritt 1: Anmeldung (muss aus einem Klick kommen). Liefert das Konto oder eine Rückfrage. */
export async function anmelden(drive) {
  Z.drive = drive; Z.status = 'verbinde'; Z.meldung = ''; melden();
  try {
    const hinweis = Z.konto?.email || letztesKonto()?.email;
    await drive.anmelden(hinweis);
    const konto = await drive.konto();
    if (!istPrivat(konto.email)) { Z.status = 'getrennt'; melden(); return { frage: 'privat', konto }; }
    await verbinden(konto);
    return { ok: true };
  } catch (e) { fehlerBehandeln(e); melden(); return { fehler: e }; }
}

/** Schritt 2: Ordner prüfen, Akte laden und mit dem Stand auf diesem Gerät abgleichen. */
export async function verbinden(konto) {
  const drive = Z.drive;
  Z.status = 'verbinde'; melden();
  try {
    if (Z.konto?.email !== konto.email || Z.modus !== 'konto') {
      const c = lsLesen(lsAkte(konto.email));
      Object.assign(Z, { akte: c?.akte ? pruefen(c.akte) : null, version: c?.version ?? null, ungespeichert: !!c?.ungespeichert, ids: c?.ids || {} });
    }
    Object.assign(Z, { modus: 'konto', konto, eingang: null, konflikt: null });
    lsSchreiben(LS_KONTO, konto);

    Z.ids = { ...Z.ids, ...(await ordnerStruktur(drive)) };
    const datei = await drive.dateiSuchen(AKTE_DATEI, Z.ids.wurzel);
    if (datei) {
      Z.ids.akte = datei.id;
      const pruef = datei.md5Checksum || datei.version;
      if (Z.akte && Z.ungespeichert && Z.version !== pruef) {
        Z.konflikt = { fremd: pruefen(await drive.jsonLesen(datei.id)), version: pruef };
        Z.status = 'konflikt';
      } else if (!(Z.akte && Z.ungespeichert)) {
        Z.akte = pruefen(await drive.jsonLesen(datei.id)); Z.version = pruef; Z.ungespeichert = false;
        Z.status = 'bereit';
      } else Z.status = 'bereit';
    } else {
      delete Z.ids.akte; Z.version = null;
      if (Z.akte) Z.ungespeichert = true;
      Z.status = 'bereit';
    }
    if (Z.akte && vorsorgeAbgleichen(Z.akte)) Z.ungespeichert = true;
    cacheSchreiben();
    melden();
    if (Z.status === 'bereit' && Z.ungespeichert) await speichernJetzt();
    eingangLesen();
    dateienVerknuepfen();
  } catch (e) { fehlerBehandeln(e); melden(); }
}

async function ordnerStruktur(drive) {
  const holen = async (name, eltern) => (await drive.ordnerSuchen(name, eltern)) || drive.ordnerAnlegen(name, eltern);
  // Ablage liegt unter „Meine Ablage/60 Gesundheit/Gesundheitsakte“. Eine Akte am alten Ort (direkt in „Meine Ablage“)
  // wird weiter benutzt, damit nie eine zweite, leere Akte entsteht.
  let wurzel = 'root';
  const alt = await drive.ordnerSuchen(ORDNER.wurzel, 'root');
  if (alt && await drive.dateiSuchen(AKTE_DATEI, alt)) wurzel = alt;
  else for (const name of WURZEL_PFAD) wurzel = await holen(name, wurzel);
  const [eingang, fachbereiche, tk, sicherungen] = await Promise.all(
    [ORDNER.eingang, ORDNER.fachbereiche, ORDNER.tk, ORDNER.sicherungen].map(n => holen(n, wurzel)));
  return { wurzel, eingang, fachbereiche, tk, sicherungen, fach: Z.ids.fach || {} };
}

export function trennen({ lokalLoeschen = false } = {}) {
  Z.drive?.abmelden();
  if (lokalLoeschen && Z.konto) { lsLoeschen(lsAkte(Z.konto.email)); lsLoeschen(LS_KONTO); zurBegruessung(); return; }
  Z.status = 'getrennt'; Z.meldung = ''; melden();
}

// ---------- Ändern und Speichern ----------
let zaehler = 0;
let timer = null;
let laeuft = false;

export function akteAnlegen(profil) {
  Z.akte = neueAkte(profil);
  Z.ungespeichert = true; zaehler++;
  cacheSchreiben(); melden(); speichernJetzt();
}

/** Alle Änderungen laufen hier durch. */
export function aendern(fn) {
  if (!Z.akte) return;
  fn(Z.akte);
  Z.akte.geaendert = new Date().toISOString();
  zaehler++;
  if (Z.modus === 'konto') { Z.ungespeichert = true; cacheSchreiben(); planen(); }
  melden();
}
function planen(ms = 1200) { clearTimeout(timer); timer = setTimeout(speichernJetzt, ms); }

export async function speichernJetzt() {
  clearTimeout(timer);
  if (Z.modus !== 'konto' || !Z.akte || !Z.ungespeichert || Z.status === 'konflikt') return;
  if (!Z.drive?.verbunden()) { if (Z.status !== 'verbinde') Z.status = 'getrennt'; melden(); return; }
  if (laeuft) { planen(800); return; }
  laeuft = true; Z.status = 'speichert'; melden();
  const stand = zaehler;
  const drive = Z.drive;
  try {
    const inhalt = JSON.stringify(Z.akte, null, 1);
    let r;
    if (Z.ids.akte) {
      const m = await drive.metadaten(Z.ids.akte);
      const pruef = m.md5Checksum || m.version;
      if (Z.version && pruef !== Z.version) {
        Z.konflikt = { fremd: pruefen(await drive.jsonLesen(Z.ids.akte)), version: pruef };
        Z.status = 'konflikt'; return;
      }
      await tagessicherung();
      r = await drive.ueberschreiben(Z.ids.akte, new Blob([inhalt], { type: 'application/json' }), 'application/json');
    } else {
      const d = await drive.dateiSuchen(AKTE_DATEI, Z.ids.wurzel);
      if (d) {
        Z.ids.akte = d.id;
        Z.konflikt = { fremd: pruefen(await drive.jsonLesen(d.id)), version: d.md5Checksum || d.version };
        Z.status = 'konflikt'; return;
      }
      r = await drive.dateiAnlegen(AKTE_DATEI, Z.ids.wurzel, new Blob([inhalt], { type: 'application/json' }), 'application/json');
      Z.ids.akte = r.id;
    }
    Z.version = r.md5Checksum || r.version;
    if (zaehler === stand) Z.ungespeichert = false;
    Z.status = 'bereit'; Z.meldung = ''; Z.zuletztGespeichert = new Date();
  } catch (e) {
    fehlerBehandeln(e);
  } finally {
    laeuft = false;
    cacheSchreiben();
    melden();
    if (Z.ungespeichert && Z.status === 'bereit') planen(300);
  }
}

async function tagessicherung() {
  const heute = heuteIso();
  if (lsLesen(lsSicherung(Z.konto.email)) === heute) return;
  const drive = Z.drive;
  try {
    const name = `akte_${heute}.json`;
    if (!(await drive.dateiSuchen(name, Z.ids.sicherungen))) await drive.kopieren(Z.ids.akte, name, Z.ids.sicherungen);
    const alle = (await drive.auflisten(Z.ids.sicherungen)).filter(f => /^akte_\d{4}-\d{2}-\d{2}\.json$/.test(f.name)).sort((a, b) => b.name.localeCompare(a.name));
    for (const alt of alle.slice(SICHERUNGEN_BEHALTEN)) await drive.inPapierkorb(alt.id);
    lsSchreiben(lsSicherung(Z.konto.email), heute);
  } catch (e) {
    if (istAnmeldefehler(e)) throw e;
    console.warn('Tagessicherung nicht möglich:', e);
  }
}

/** Nach Rückfrage: 'fremd' = Stand aus Drive übernehmen, 'eigen' = Stand dieses Geräts behalten. */
export async function konfliktLoesen(wahl) {
  const k = Z.konflikt; if (!k) return;
  Z.konflikt = null;
  if (wahl === 'fremd') { Z.akte = k.fremd; Z.version = k.version; Z.ungespeichert = false; Z.status = 'bereit'; cacheSchreiben(); melden(); }
  else { Z.version = k.version; Z.ungespeichert = true; Z.status = 'bereit'; zaehler++; await speichernJetzt(); }
}

/** Beim Zurückkehren in die App: neueren Stand eines anderen Geräts holen. */
export async function aktualisieren() {
  if (Z.modus !== 'konto' || !Z.drive?.verbunden() || Z.ungespeichert || !Z.ids.akte || Z.status !== 'bereit') return false;
  try {
    const m = await Z.drive.metadaten(Z.ids.akte);
    const pruef = m.md5Checksum || m.version;
    if (pruef === Z.version) return false;
    Z.akte = pruefen(await Z.drive.jsonLesen(Z.ids.akte)); Z.version = pruef;
    cacheSchreiben(); melden();
    return true;
  } catch (e) { fehlerBehandeln(e); melden(); return false; }
}

// ---------- Dateien ----------
async function fachOrdner(katId) {
  if (katId === 'tk') return Z.ids.tk;
  if (Z.ids.fach?.[katId]) return Z.ids.fach[katId];
  const name = kat(Z.akte, katId).name.replace(/[\\/]+/g, '-').trim() || 'Sonstiges';
  const id = (await Z.drive.ordnerSuchen(name, Z.ids.fachbereiche)) || (await Z.drive.ordnerAnlegen(name, Z.ids.fachbereiche));
  Z.ids.fach = { ...(Z.ids.fach || {}), [katId]: id };
  return id;
}
const ablageName = (d, endung) => `${d.datum}_${dateiname(d.typ)}_${dateiname(d.titel)}${endung ? '.' + endung : ''}`;
const endungVon = name => (String(name).match(/\.([a-z0-9]{1,5})$/i) || [])[1]?.toLowerCase() || '';

function nurMitDrive() {
  if (Z.modus !== 'konto') throw new Error('Im Beispielmodus werden keine Dateien gespeichert.');
  if (!Z.drive?.verbunden()) throw Object.assign(new Error('Für Dateien bitte zuerst mit Google verbinden.'), { name: 'AnmeldungNoetig' });
}

/** Neue Datei vom Gerät hochladen und im Fachordner ablegen. */
export async function dateiHochladen(datei, d) {
  nurMitDrive();
  const ordner = await fachOrdner(d.kat);
  const name = ablageName(d, endungVon(datei.name));
  const r = await Z.drive.dateiAnlegen(name, ordner, datei, datei.type || 'application/octet-stream');
  return { driveId: r.id, datei: r.name, link: r.webViewLink || Z.drive.link(r.id) };
}

/** Datei aus 00_Eingang umbenennen und in den Fachordner verschieben. */
export async function ausEingangAblegen(driveId, d) {
  nurMitDrive();
  const f = (Z.eingang || []).find(x => x.id === driveId) || await Z.drive.metadaten(driveId);
  const ordner = await fachOrdner(d.kat);
  const r = await Z.drive.verschieben(driveId, ablageName(d, endungVon(f.name)), ordner, Z.ids.eingang);
  Z.eingang = (Z.eingang || []).filter(x => x.id !== driveId);
  return { driveId: r.id, datei: r.name, link: r.webViewLink || Z.drive.link(r.id) };
}

/** Abgelegte Datei umbenennen/verschieben, wenn sich Titel, Datum, Art oder Fach ändern. */
export async function ablageAnpassen(alt, neu) {
  if (!neu.driveId || Z.modus !== 'konto' || !Z.drive?.verbunden()) return null;
  if (alt.kat === neu.kat && alt.titel === neu.titel && alt.datum === neu.datum && alt.typ === neu.typ) return null;
  const m = await Z.drive.metadaten(neu.driveId);
  const ziel = await fachOrdner(neu.kat);
  const r = await Z.drive.verschieben(neu.driveId, ablageName(neu, endungVon(m.name)), ziel, (m.parents || [])[0] || ziel);
  return { datei: r.name };
}

export async function dateiInPapierkorb(driveId) {
  if (!driveId || Z.modus !== 'konto' || !Z.drive?.verbunden()) return false;
  await Z.drive.inPapierkorb(driveId);
  return true;
}

export async function eingangLesen() {
  if (Z.modus !== 'konto' || !Z.drive?.verbunden() || !Z.ids.eingang) return;
  try {
    Z.eingang = (await Z.drive.auflisten(Z.ids.eingang)).filter(f => !f.mimeType?.includes('folder'));
    melden();
  } catch (e) { if (istAnmeldefehler(e)) { fehlerBehandeln(e); melden(); } else console.warn(e); }
}

export const dateiLink = d => d.link || (d.driveId && Z.drive ? Z.drive.link(d.driveId) : null);

/**
 * Verknüpft Dokumente, die nur einen Dateinamen haben (z. B. aus einem Import), mit der Datei in Drive.
 * Gesucht wird im Ordner des Fachbereichs. Liefert die Zahl der neu verknüpften Dokumente.
 */
export async function dateienVerknuepfen() {
  if (Z.modus !== 'konto' || !Z.drive?.verbunden() || !Z.akte || !Z.ids.fachbereiche) return 0;
  const offen = Z.akte.dokumente.filter(d => d.datei && !d.driveId);
  if (!offen.length) return 0;
  const funde = {};
  try {
    const nachKat = {};
    for (const d of offen) (nachKat[d.kat] ||= []).push(d);
    for (const [katId, docs] of Object.entries(nachKat)) {
      const ordner = katId === 'tk' ? Z.ids.tk : (Z.ids.fach?.[katId] || await Z.drive.ordnerSuchen(kat(Z.akte, katId).name.replace(/[\\/]+/g, '-').trim(), Z.ids.fachbereiche));
      if (!ordner) continue;
      if (katId !== 'tk') Z.ids.fach = { ...(Z.ids.fach || {}), [katId]: ordner };
      const dateien = await Z.drive.auflisten(ordner);
      const nachName = new Map(dateien.map(f => [f.name.normalize('NFC'), f]));
      for (const d of docs) { const f = nachName.get(d.datei.normalize('NFC')); if (f) funde[d.id] = f; }
    }
  } catch (e) { if (istAnmeldefehler(e)) { fehlerBehandeln(e); melden(); } else console.warn('Verknüpfen:', e); }
  const n = Object.keys(funde).length;
  if (n) aendern(a => { for (const d of a.dokumente) if (funde[d.id]) { d.driveId = funde[d.id].id; d.link = funde[d.id].webViewLink || Z.drive.link(funde[d.id].id); } });
  return n;
}
