// Nachbildung von Google Drive im Arbeitsspeicher – nur für Tests (Aufruf mit ?test in der Adresse).
// Gleiche Schnittstelle wie googleDrive in drive.js. window.testDrive erlaubt Eingriffe von außen,
// z. B. testDrive.fremdAendern() simuliert eine Änderung auf einem anderen Gerät.
import { AnmeldungNoetig } from './drive.js';

const dateien = new Map();
let zaehler = 0;
let verbunden = false;
let kalenderErlaubt = true;
const ev = (id, datum, zeit, summary, extra = {}) => ({ id, status: 'confirmed', summary, start: zeit ? { dateTime: `${datum}T${zeit}:00+01:00` } : { date: datum }, htmlLink: '#kalender-' + id, ...extra });
let kalenderEintraege = [
  ev('k1', '2026-12-03', '09:30', 'Zahnarzt Kontrolle'),
  ev('k2', '2026-12-10', '17:00', 'Physiotherapie'),
  ev('k3', '2026-12-15', '08:00', 'Blutabnahme Hausarzt'),
  ev('k4', '2026-12-18', '15:00', 'Termin Dr. Beispiel'),
  ev('k5', '2026-12-20', '', 'Geburtstag Oma'),
  ev('k6', '2026-12-22', '10:00', 'Hautarzt Screening'),
];
const neu = (felder) => { const id = 'f' + (++zaehler); const f = { id, version: 1, modifiedTime: new Date().toISOString(), trashed: false, ...felder }; dateien.set(id, f); return f; };
const meta = f => ({ id: f.id, name: f.name, mimeType: f.mimeType, version: String(f.version), md5Checksum: f.ordner ? undefined : (f.pruef || 'md5-' + f.id + '-' + f.version), modifiedTime: f.modifiedTime, parents: [f.eltern], size: String(f.roh?.byteLength || f.inhalt?.length || 0), webViewLink: '#test-' + f.id });
const textVon = async inhalt => typeof inhalt === 'string' ? inhalt : await inhalt.text();
const pause = async () => { if (!verbunden) throw new AnmeldungNoetig(); await new Promise(r => setTimeout(r, 40)); };

export const testDrive = {
  name: 'Test-Drive (im Speicher)',
  eingerichtet: () => true,
  verbunden: () => verbunden,
  async anmelden() { await new Promise(r => setTimeout(r, 40)); verbunden = true; },
  abmelden() { verbunden = false; },
  async konto() { await pause(); return { email: testDrive.email, name: 'Testkonto' }; },
  email: 'test@example.com',
  async ordnerSuchen(name, eltern = 'root') { await pause(); return [...dateien.values()].find(f => !f.trashed && f.ordner && f.name === name && f.eltern === eltern)?.id || null; },
  async ordnerAnlegen(name, eltern = 'root') { await pause(); return neu({ name, eltern, ordner: true, mimeType: 'application/vnd.google-apps.folder' }).id; },
  async dateiSuchen(name, eltern) { await pause(); const f = [...dateien.values()].find(x => !x.trashed && x.name === name && x.eltern === eltern); return f ? meta(f) : null; },
  async auflisten(eltern) { await pause(); return [...dateien.values()].filter(x => !x.trashed && x.eltern === eltern).sort((a, b) => a.name.localeCompare(b.name)).map(meta); },
  async metadaten(id) { await pause(); return meta(dateien.get(id)); },
  async jsonLesen(id) { await pause(); return JSON.parse(dateien.get(id).inhalt); },
  async dateiInhalt(id) { await pause(); const f = dateien.get(id); return f.roh ? f.roh.slice(0) : new TextEncoder().encode(f.inhalt || '').buffer; },
  async dateiAnlegen(name, eltern, inhalt, mimeType) {
    await pause();
    const roh = typeof inhalt === 'string' ? null : await inhalt.arrayBuffer();
    const f = neu({ name, eltern, mimeType, inhalt: roh ? '' : inhalt, roh });
    if (roh) f.pruef = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', roh))).slice(0, 8).map(b => b.toString(16)).join('');
    return meta(f);
  },
  async ueberschreiben(id, inhalt) { await pause(); const f = dateien.get(id); f.inhalt = await textVon(inhalt); f.version++; f.modifiedTime = new Date().toISOString(); return meta(f); },
  async kopieren(id, name, eltern) { await pause(); const f = dateien.get(id); return { id: neu({ name, eltern, mimeType: f.mimeType, inhalt: f.inhalt }).id }; },
  async inPapierkorb(id) { await pause(); dateien.get(id).trashed = true; return { id }; },
  async verschieben(id, name, neuerOrdner) { await pause(); const f = dateien.get(id); f.name = name; f.eltern = neuerOrdner; f.version++; return meta(f); },
  link: id => '#test-' + id,

  // Kalender (Testdaten, per testDrive.kalenderSetzen() austauschbar)
  kalenderErlaubt: () => verbunden && kalenderErlaubt,
  async kalenderListe() { await pause(); return [{ id: 'primary', name: 'Privat', primaer: true }, { id: 'familie', name: 'Familie', primaer: false }]; },
  async kalenderTermine(kalenderId, von, bis) {
    await pause();
    return kalenderEintraege.filter(e => (e.kalenderId || 'primary') === kalenderId)
      .filter(e => { const d = (e.start.date || e.start.dateTime).slice(0, 10); return d >= von && d <= bis; })
      .map(e => ({ kalenderId, ...e }));
  },
  kalenderSetzen(liste) { kalenderEintraege = liste; },
  kalenderSperren(an = true) { kalenderErlaubt = !an; },

  // Eingriffe für Tests
  alle: () => [...dateien.values()].map(f => ({ id: f.id, name: f.name, eltern: f.eltern, version: f.version, trashed: f.trashed })),
  inhalt: name => { const f = [...dateien.values()].find(x => x.name === name && !x.trashed); return f && JSON.parse(f.inhalt); },
  fremdAendern(aenderung = a => { a.profil.name += ' (anderes Gerät)'; }) {
    const f = [...dateien.values()].find(x => x.name === 'akte.json' && !x.trashed);
    const akte = JSON.parse(f.inhalt); aenderung(akte);
    f.inhalt = JSON.stringify(akte); f.version++; f.modifiedTime = new Date().toISOString();
  },
  einwerfen(name = 'Scan_20261120_0815.pdf') {
    const ein = [...dateien.values()].find(x => x.name === '00_Eingang' && x.ordner);
    neu({ name, eltern: ein.id, mimeType: 'application/pdf', inhalt: '%PDF-Test' });
  },
  ablaufen() { verbunden = false; },
};
window.testDrive = testDrive;
