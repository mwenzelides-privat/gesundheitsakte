// Zentrale Einstellungen der Gesundheitsakte.
// Die Client-ID stammt aus der Google Cloud Console des PRIVATEN Google-Kontos (siehe LIESMICH.md).
// Sie ist kein Geheimnis: Sie steht in jeder Web-App öffentlich im Code und funktioniert nur
// auf den Adressen, die in der Cloud Console als "Autorisierte JavaScript-Quellen" eingetragen sind.

export const VERSION = '0.2.0';
export const STAND = '20.11.2026';

export const GOOGLE_CLIENT_ID = '';

// Voller Drive-Zugriff ist nötig, damit die App auch Dateien sieht, die du aus der TK-App
// oder mit dem Drive-Scanner in den Eingang legst (die legt nicht die App selbst an).
export const SCOPES = 'https://www.googleapis.com/auth/drive';

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
