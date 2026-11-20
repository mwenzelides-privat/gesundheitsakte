// Kleine Helfer: Datum, Text, Symbole.

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function heute() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
export const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const heuteIso = () => iso(heute());

/** 'JJJJ-MM-TT' oder 'JJJJ-MM' → Date (lokal, 0 Uhr) */
export const tag = s => { const [y, m, dd] = s.split('-').map(Number); return new Date(y, (m || 1) - 1, dd || 1); };
export const plusMonate = (s, n) => { const d = tag(s); const t = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n); const letzter = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); d.setDate(Math.min(t, letzter)); return iso(d); };
export const plusTage = (s, n) => { const d = tag(s); d.setDate(d.getDate() + n); return iso(d); };

export const MON = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sept.', 'Okt.', 'Nov.', 'Dez.'];
export const MON_LANG = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
export const WT = ['so', 'mo', 'di', 'mi', 'do', 'fr', 'sa'];
export const WOCHE = ['mo', 'di', 'mi', 'do', 'fr', 'sa'];
export const WT_NAME = { mo: 'Mo', di: 'Di', mi: 'Mi', do: 'Do', fr: 'Fr', sa: 'Sa', so: 'So' };
export const WT_LANG = { mo: 'Montag', di: 'Dienstag', mi: 'Mittwoch', do: 'Donnerstag', fr: 'Freitag', sa: 'Samstag', so: 'Sonntag' };

export function datum(s) {
  if (!s) return '–';
  const p = s.split('-');
  if (p.length === 2) return MON[+p[1] - 1] + ' ' + p[0];
  return p[2] + '.' + p[1] + '.' + p[0];
}
export const tageBis = s => Math.round((tag(s) - heute()) / 864e5);
export function relativ(s) {
  const t = tageBis(s);
  if (t === 0) return 'heute';
  if (t === 1) return 'morgen';
  if (t === -1) return 'gestern';
  if (t > 0) return t < 60 ? `in ${t} Tagen` : `in ${Math.round(t / 30.4)} Monaten`;
  return -t < 60 ? `vor ${-t} Tagen` : `vor ${Math.round(-t / 30.4)} Monaten`;
}
export const uhrzeit = d => d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

export const neueId = (p = 'x') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
export const dateiname = s => String(s).normalize('NFC').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 90);

// ---------- Symbole (Linien, 24er Raster) ----------
const I = {
  start: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/>',
  verlauf: '<path d="M4 6h16M4 12h10M4 18h13"/><circle cx="19" cy="12" r="1.6"/>',
  faecher: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  termine: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  dokumente: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>',
  vorsorge: '<path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z"/><path d="m9 12 2 2 4-4"/>',
  aerzte: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  tk: '<path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3"/><path d="M18 3v4h-4M6 21v-4h4"/>',
  einstellungen: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  mehr: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
  datei: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/>',
  kalender: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16"/>',
  tel: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
  ort: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  web: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>',
  eingang: '<path d="M4 13h4l1.5 3h5L16 13h4"/><path d="M4 13 6.5 5h11L20 13v6H4z"/>',
  karte: '<path d="m3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>',
  zu: '<path d="M6 6l12 12M18 6 6 18"/>',
  ki: '<path d="M12 3v3M12 18v3M3 12h3M18 12h3M6 6l2 2M16 16l2 2M6 18l2-2M16 8l2-2"/><circle cx="12" cy="12" r="3"/>',
  links: '<path d="m14 6-6 6 6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  stift: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  wolke: '<path d="M7 18h10a4 4 0 0 0 .6-8A6 6 0 0 0 6 9.5 4.3 4.3 0 0 0 7 18z"/>',
  wolke_aus: '<path d="M7 18h10a4 4 0 0 0 .6-8A6 6 0 0 0 6 9.5 4.3 4.3 0 0 0 7 18z"/><path d="M4 4l16 16"/>',
  haken: '<path d="m5 12 4.5 4.5L19 7"/>',
  hochladen: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v4h16v-4"/>',
};
export const svg = (n, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${I[n] || ''}</svg>`;
