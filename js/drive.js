// Google-Anmeldung (Google Identity Services) und Zugriff auf Google Drive (REST v3).
// Die App läuft ohne eigenen Server: Der Browser holt sich ein Zugriffstoken (1 Stunde gültig)
// und spricht damit direkt mit Drive. Gesundheitsdaten verlassen dein Google-Konto nicht.
import { GOOGLE_CLIENT_ID, SCOPES } from './konfig.js';

const API = 'https://www.googleapis.com/drive/v3/';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/';
const ORDNER_MIME = 'application/vnd.google-apps.folder';

export class AnmeldungNoetig extends Error {
  constructor(text = 'Die Verbindung zu Google ist abgelaufen. Bitte neu verbinden.') { super(text); this.name = 'AnmeldungNoetig'; }
}

let token = null;
let tokenAblauf = 0;

function gisBereit(ms = 8000) {
  return new Promise((ok, fehler) => {
    const start = Date.now();
    (function warten() {
      if (window.google?.accounts?.oauth2) return ok();
      if (Date.now() - start > ms) return fehler(new Error('Die Google-Anmeldung konnte nicht geladen werden. Besteht eine Internetverbindung?'));
      setTimeout(warten, 100);
    })();
  });
}

const q = s => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

async function api(methode, url, { body, headers, roh } = {}) {
  if (!token || Date.now() > tokenAblauf - 30_000) throw new AnmeldungNoetig();
  let r;
  try {
    r = await fetch(url, { method: methode, headers: { Authorization: 'Bearer ' + token, ...headers }, body });
  } catch {
    throw new Error('Keine Verbindung zu Google Drive. Die Änderungen bleiben auf diesem Gerät gespeichert.');
  }
  if (r.status === 401) { token = null; throw new AnmeldungNoetig(); }
  if (!r.ok) {
    let text = '';
    try { text = (await r.json()).error?.message || ''; } catch { /* leer */ }
    throw new Error(`Google Drive meldet Fehler ${r.status}${text ? ': ' + text : ''}`);
  }
  if (roh) return r;
  return r.status === 204 ? null : r.json();
}

function multipart(meta, inhalt, mime) {
  const grenze = 'gesundheitsakte' + Math.random().toString(36).slice(2);
  const body = new Blob([
    `--${grenze}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
    `--${grenze}\r\nContent-Type: ${mime}\r\n\r\n`, inhalt, `\r\n--${grenze}--`,
  ]);
  return { body, headers: { 'Content-Type': `multipart/related; boundary=${grenze}` } };
}

const FELDER = 'id,name,mimeType,version,md5Checksum,modifiedTime,size,webViewLink,parents';

export const googleDrive = {
  name: 'Google Drive',
  eingerichtet: () => !!GOOGLE_CLIENT_ID,
  verbunden: () => !!token && Date.now() < tokenAblauf - 30_000,

  /** Muss aus einem Klick heraus aufgerufen werden (Pop-up). */
  async anmelden(hinweisEmail) {
    if (!GOOGLE_CLIENT_ID) throw new Error('Die Google-Anmeldung ist noch nicht eingerichtet (Client-ID fehlt, siehe LIESMICH.md).');
    await gisBereit();
    return new Promise((ok, fehler) => {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID, scope: SCOPES, hint: hinweisEmail || undefined,
        callback: antwort => {
          if (antwort.error) return fehler(new Error('Anmeldung abgebrochen: ' + antwort.error));
          if (!window.google.accounts.oauth2.hasGrantedAllScopes(antwort, SCOPES)) return fehler(new Error('Ohne Zugriff auf Google Drive kann die Akte nicht gespeichert werden. Bitte bei der Anmeldung den Haken für Drive setzen.'));
          token = antwort.access_token;
          tokenAblauf = Date.now() + (Number(antwort.expires_in) || 3600) * 1000;
          ok();
        },
        error_callback: e => fehler(new Error(e?.type === 'popup_closed' ? 'Das Anmeldefenster wurde geschlossen.' : 'Anmeldung nicht möglich: ' + (e?.message || e?.type || 'unbekannt'))),
      });
      client.requestAccessToken({ prompt: hinweisEmail ? '' : 'select_account' });
    });
  },
  abmelden() {
    if (token && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(token, () => {});
    token = null; tokenAblauf = 0;
  },

  async konto() {
    const r = await api('GET', API + 'about?fields=user(displayName,emailAddress)');
    return { email: r.user.emailAddress, name: r.user.displayName };
  },
  async ordnerSuchen(name, eltern = 'root') {
    const r = await api('GET', API + 'files?' + new URLSearchParams({
      q: `name='${q(name)}' and mimeType='${ORDNER_MIME}' and '${q(eltern)}' in parents and trashed=false`, fields: 'files(id,name)', spaces: 'drive', pageSize: '10',
    }));
    return r.files[0]?.id || null;
  },
  async ordnerAnlegen(name, eltern = 'root') {
    const r = await api('POST', API + 'files?fields=id', {
      body: JSON.stringify({ name, mimeType: ORDNER_MIME, parents: [eltern] }), headers: { 'Content-Type': 'application/json' },
    });
    return r.id;
  },
  async dateiSuchen(name, eltern) {
    const r = await api('GET', API + 'files?' + new URLSearchParams({
      q: `name='${q(name)}' and '${q(eltern)}' in parents and trashed=false`, fields: `files(${FELDER})`, orderBy: 'modifiedTime desc', pageSize: '10',
    }));
    return r.files[0] || null;
  },
  async auflisten(eltern) {
    const alle = [];
    let seite = '';
    do {
      const r = await api('GET', API + 'files?' + new URLSearchParams({
        q: `'${q(eltern)}' in parents and trashed=false`, fields: `nextPageToken,files(${FELDER})`, orderBy: 'name', pageSize: '200', ...(seite ? { pageToken: seite } : {}),
      }));
      alle.push(...r.files); seite = r.nextPageToken || '';
    } while (seite);
    return alle;
  },
  metadaten: id => api('GET', API + `files/${id}?fields=${FELDER}`),
  async jsonLesen(id) {
    const r = await api('GET', API + `files/${id}?alt=media`, { roh: true });
    return JSON.parse(await r.text());
  },
  async dateiAnlegen(name, eltern, inhalt, mime) {
    const { body, headers } = multipart({ name, parents: [eltern] }, inhalt, mime);
    return api('POST', UPLOAD + `files?uploadType=multipart&fields=${FELDER}`, { body, headers });
  },
  ueberschreiben: (id, inhalt, mime) => api('PATCH', UPLOAD + `files/${id}?uploadType=media&fields=${FELDER}`, { body: inhalt, headers: { 'Content-Type': mime } }),
  kopieren: (id, name, eltern) => api('POST', API + `files/${id}/copy?fields=id,name`, { body: JSON.stringify({ name, parents: [eltern] }), headers: { 'Content-Type': 'application/json' } }),
  inPapierkorb: id => api('PATCH', API + `files/${id}?fields=id`, { body: JSON.stringify({ trashed: true }), headers: { 'Content-Type': 'application/json' } }),
  verschieben: (id, name, neuerOrdner, alterOrdner) => api('PATCH', API + `files/${id}?` + new URLSearchParams({ addParents: neuerOrdner, removeParents: alterOrdner, fields: FELDER }), {
    body: JSON.stringify({ name }), headers: { 'Content-Type': 'application/json' },
  }),
  link: id => `https://drive.google.com/file/d/${id}/view`,
};
