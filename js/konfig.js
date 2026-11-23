// Zentrale Einstellungen der Gesundheitsakte.
// Die Client-ID stammt aus der Google Cloud Console des PRIVATEN Google-Kontos (siehe LIESMICH.md).
// Sie ist kein Geheimnis: Sie steht in jeder Web-App öffentlich im Code und funktioniert nur
// auf den Adressen, die in der Cloud Console als "Autorisierte JavaScript-Quellen" eingetragen sind.

export const VERSION = '0.4.0';
export const STAND = '23.11.2026';

// Google-Cloud-Projekt „Gesundheitsakte“ (gesundheitsakte-515315) im privaten Konto, Client „Gesundheitsakte Web“.
// Erlaubte Adressen: https://mwenzelides-privat.github.io und http://localhost:8792
export const GOOGLE_CLIENT_ID = '72259479394-3eh64lin7nld6ve59ltbt5g9cm4gnqgf.apps.googleusercontent.com';

// Voller Drive-Zugriff ist nötig, damit die App auch Dateien sieht, die du aus der TK-App
// oder mit dem Drive-Scanner in den Eingang legst (die legt nicht die App selbst an).
export const SCOPE_DRIVE = 'https://www.googleapis.com/auth/drive';
// Kalender nur lesen (Iteration 3). Ohne diese Freigabe läuft die App weiter, nur ohne Kalender.
export const SCOPE_KALENDER = 'https://www.googleapis.com/auth/calendar.readonly';
export const SCOPES = `${SCOPE_DRIVE} ${SCOPE_KALENDER}`;

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
