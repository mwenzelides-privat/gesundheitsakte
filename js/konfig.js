// Zentrale Einstellungen der Gesundheitsakte.
// Die Client-ID stammt aus der Google Cloud Console des PRIVATEN Google-Kontos (siehe LIESMICH.md).
// Sie ist kein Geheimnis: Sie steht in jeder Web-App öffentlich im Code und funktioniert nur
// auf den Adressen, die in der Cloud Console als "Autorisierte JavaScript-Quellen" eingetragen sind.

export const VERSION = '0.9.3';
export const STAND = '27.11.2026';

// Google-Cloud-Projekt „Gesundheitsakte“ (gesundheitsakte-515315) im privaten Konto, Client „Gesundheitsakte Web“.
// Erlaubte Adressen: https://mwenzelides-privat.github.io und http://localhost:8792
export const GOOGLE_CLIENT_ID = '72259479394-3eh64lin7nld6ve59ltbt5g9cm4gnqgf.apps.googleusercontent.com';

// Voller Drive-Zugriff ist nötig, damit die App auch Dateien sieht, die du aus der TK-App
// oder mit dem Drive-Scanner in den Eingang legst (die legt nicht die App selbst an).
export const SCOPE_DRIVE = 'https://www.googleapis.com/auth/drive';
// Kalender nur lesen (Iteration 3). Ohne diese Freigabe läuft die App weiter, nur ohne Kalender.
export const SCOPE_KALENDER = 'https://www.googleapis.com/auth/calendar.readonly';
// Iteration 7: eigene Einträge anlegen/ändern/löschen (Vorsorge-Erinnerungen). Andere Termine fasst die App nicht an.
export const SCOPE_KALENDER_SCHREIBEN = 'https://www.googleapis.com/auth/calendar.events';
export const SCOPES = `${SCOPE_DRIVE} ${SCOPE_KALENDER} ${SCOPE_KALENDER_SCHREIBEN}`;

// Zeitraum, in dem Arzttermine aus dem Kalender gelesen werden
export const KALENDER_AB = '2021-01-01';
export const KALENDER_MONATE_VORAUS = 24;

// Ablageort in „Meine Ablage“: 60 Gesundheit/Gesundheitsakte (seit 0.3.1, vorher direkt in „Meine Ablage“)
export const WURZEL_PFAD = ['60 Gesundheit', 'Gesundheitsakte'];
export const ORDNER = {
  wurzel: 'Gesundheitsakte',
  eingang: '00_Eingang',
  fachbereiche: '10_Fachbereiche',
  tk: '30_TK',
  sicherungen: '90_Sicherungen',
};
export const AKTE_DATEI = 'akte.json';
export const SICHERUNGEN_BEHALTEN = 30;

// Konten mit diesen Domains gelten ohne Rückfrage als privat.
export const PRIVATE_DOMAINS = ['gmail.com', 'googlemail.com'];

// Befund-Auswertung mit Claude (Iteration 5).
// Der API-Schlüssel steht NICHT hier im (öffentlichen) Code, sondern nur in deinem Google Drive
// (Gesundheitsakte/claude-zugang.json) und wird beim Verbinden in den Speicher des Browsers geladen.
export const KI_MODELL = 'claude-opus-5-5';
export const KI_SDK = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@1.6.0/+esm';
export const KI_SCHLUESSEL_DATEI = 'claude-zugang.json';
export const KI_MAX_MB = 20;                       // Anfrage-Grenze der API: 32 MB (Base64 macht Dateien ~⅓ größer)
export const KI_PREIS = { eingabe: 4, ausgabe: 20 }; // US-Dollar je 1 Mio. Token (Claude Opus 5.5)
