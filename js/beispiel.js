// Beispieldaten zum Ausprobieren. Alle Personen, Praxen und Werte sind erfunden.
import { neueAkte } from './modell.js';

const STD = { mo: [['08:00', '12:00'], ['15:00', '18:00']], di: [['08:00', '12:00'], ['15:00', '18:00']], mi: [['08:00', '12:00']], do: [['08:00', '12:00'], ['15:00', '18:00']], fr: [['08:00', '12:00']] };

export function beispielAkte() {
  const akte = neueAkte({ name: 'Beispielprofil', jahrgang: 1974, geschlecht: 'männlich', kasse: 'Techniker Krankenkasse' });
  akte.beispiel = true;

  akte.aerzte = [
    { id: 'berger', name: 'Dr. med. Anna Berger', fach: 'Allgemeinmedizin', kat: 'hausarzt', adresse: 'Lindenstraße 14, 12345 Musterstadt', tel: '01234 56780', web: 'praxis-berger.example', zeiten: STD },
    { id: 'kern', name: 'Dr. med. dent. Thomas Kern', fach: 'Zahnmedizin', kat: 'zahn', adresse: 'Marktplatz 3, 12345 Musterstadt', tel: '01234 22110', web: 'zahnarzt-kern.example', zeiten: { mo: [['08:00', '18:00']], di: [['08:00', '18:00']], mi: [['08:00', '13:00']], do: [['08:00', '19:00']], fr: [['08:00', '14:00']] } },
    { id: 'lorenz', name: 'Dr. med. Sabine Lorenz', fach: 'Augenheilkunde', kat: 'auge', adresse: 'Bahnhofstraße 22, 12345 Musterstadt', tel: '01234 77030', web: 'augen-lorenz.example', zeiten: { mo: [['08:30', '12:30'], ['14:00', '17:00']], di: [['08:30', '12:30']], mi: [['08:30', '12:30'], ['14:00', '17:00']], do: [['08:30', '12:30'], ['14:00', '18:00']], fr: [['08:30', '12:00']] } },
    { id: 'haas', name: 'Dr. med. Michael Haas', fach: 'Orthopädie', kat: 'ruecken', adresse: 'Gartenweg 9, 12346 Musterstadt-Nord', tel: '01234 90412', web: 'ortho-haas.example', zeiten: { mo: [['08:00', '12:00'], ['14:00', '18:00']], di: [['08:00', '12:00'], ['14:00', '18:00']], mi: [['08:00', '13:00']], do: [['08:00', '12:00'], ['14:00', '18:00']], fr: [['08:00', '12:00']] }, aenderung: { tag: 'mi', alt: '08:00–12:00, 14:00–18:00', datum: '2026-11-18' } },
    { id: 'vogt', name: 'Physiotherapie Vogt', fach: 'Physiotherapie', kat: 'ruecken', adresse: 'Gartenweg 11, 12346 Musterstadt-Nord', tel: '01234 90488', web: 'physio-vogt.example', zeiten: { mo: [['07:00', '20:00']], di: [['07:00', '20:00']], mi: [['07:00', '20:00']], do: [['07:00', '20:00']], fr: [['07:00', '15:00']] } },
    { id: 'radio', name: 'Radiologie am Markt', fach: 'Radiologie (MRT, CT, Röntgen)', kat: 'ruecken', adresse: 'Marktplatz 8, 12345 Musterstadt', tel: '01234 31500', web: 'radiologie-markt.example', zeiten: { mo: [['07:30', '19:00']], di: [['07:30', '19:00']], mi: [['07:30', '19:00']], do: [['07:30', '19:00']], fr: [['07:30', '16:00']] } },
    { id: 'brandt', name: 'Dr. med. Julia Brandt', fach: 'Dermatologie', kat: 'haut', adresse: 'Schillerstraße 5, 12345 Musterstadt', tel: '01234 44871', web: 'haut-brandt.example', zeiten: STD },
    { id: 'wolf', name: 'Dr. med. Peter Wolf', fach: 'Urologie', kat: 'uro', adresse: 'Am Klinikum 2, 12347 Musterstadt-Süd', tel: '01234 61520', web: 'urologie-wolf.example', zeiten: { mo: [['08:00', '12:00'], ['14:00', '17:00']], di: [['08:00', '12:00']], mi: [['08:00', '12:00']], do: [['08:00', '12:00'], ['14:00', '17:00']], fr: [['08:00', '11:30']] } },
    { id: 'klein', name: 'Dr. med. Martin Klein', fach: 'Gastroenterologie', kat: 'innere', adresse: 'Am Klinikum 4, 12347 Musterstadt-Süd', tel: '01234 61590', web: 'gastro-klein.example', zeiten: STD },
    { id: 'roth', name: 'Dr. med. Stefan Roth', fach: 'Hals-Nasen-Ohren', kat: 'hno', adresse: 'Rosengasse 1, 12345 Musterstadt', tel: '01234 18044', web: 'hno-roth.example', zeiten: STD },
  ];

  akte.erkrankungen = [
    { id: 'e1', titel: 'Bandscheibenvorfall L5/S1 links', icd: 'M51.2', kat: 'ruecken', von: '2012-03', bis: '2012-09', status: 'abgeschlossen', aerzte: ['haas', 'radio', 'vogt'], notiz: 'Konservativ behandelt: Schmerztherapie und 3 × 6 Physiotherapie.' },
    { id: 'e2', titel: 'Akute Bronchitis', icd: 'J20.9', kat: 'hausarzt', von: '2015-11', bis: '2015-12', status: 'abgeschlossen', aerzte: ['berger'] },
    { id: 'e3', titel: 'Entfernung Weisheitszähne 38 und 48', icd: 'K01.1', kat: 'zahn', von: '2016-06', bis: '2016-07', status: 'abgeschlossen', aerzte: ['kern'] },
    { id: 'e4', titel: 'Kurzsichtigkeit mit Hornhautverkrümmung', icd: 'H52.1', kat: 'auge', von: '2018-02', bis: null, status: 'chronisch', aerzte: ['lorenz'], notiz: 'Brille seit 2018.' },
    { id: 'e5', titel: 'Bluthochdruck (arterielle Hypertonie)', icd: 'I10.90', kat: 'hausarzt', von: '2019-09', bis: null, status: 'chronisch', aerzte: ['berger'], notiz: 'Ramipril 5 mg morgens. Gut eingestellt (zuletzt 132/84 mmHg).' },
    { id: 'e6', titel: 'Hexenschuss (Lumbago)', icd: 'M54.5', kat: 'ruecken', von: '2020-04', bis: '2020-05', status: 'abgeschlossen', aerzte: ['haas'] },
    { id: 'e7', titel: 'Tinnitus links', icd: 'H93.1', kat: 'hno', von: '2021-07', bis: '2021-10', status: 'abgeschlossen', aerzte: ['roth'], notiz: 'Nach 3 Monaten abgeklungen.' },
    { id: 'e8', titel: 'Erhöhte Cholesterinwerte', icd: 'E78.0', kat: 'hausarzt', von: '2022-11', bis: null, status: 'chronisch', aerzte: ['berger'], notiz: 'Zunächst Ernährungsumstellung, Kontrolle jährlich.' },
    { id: 'e9', titel: 'Seborrhoische Keratose am Rücken entfernt', icd: 'L82', kat: 'haut', von: '2023-05', bis: '2023-05', status: 'abgeschlossen', aerzte: ['brandt'] },
    { id: 'e10', titel: 'Wurzelbehandlung und Krone Zahn 36', icd: 'K04.0', kat: 'zahn', von: '2024-01', bis: '2024-04', status: 'abgeschlossen', aerzte: ['kern'] },
    { id: 'e11', titel: 'Darmpolyp bei Vorsorge-Darmspiegelung entfernt', icd: 'K63.5', kat: 'innere', von: '2024-10', bis: '2024-10', status: 'abgeschlossen', aerzte: ['klein'], notiz: 'Gutartig (tubuläres Adenom). Kontrolle nach 5 Jahren.' },
    { id: 'e12', titel: 'Chronische Rückenschmerzen, Bandscheibenvorwölbung L4/5', icd: 'M51.2', kat: 'ruecken', von: '2025-06', bis: null, status: 'aktiv', aerzte: ['haas', 'radio', 'vogt'], notiz: 'Physiotherapie läuft, Rückenschule empfohlen.' },
    { id: 'e13', titel: 'Alterssichtigkeit, Gleitsichtbrille', icd: 'H52.4', kat: 'auge', von: '2026-09', bis: null, status: 'chronisch', aerzte: ['lorenz'] },
    { id: 'e14', titel: 'Erhöhter PSA-Wert, in Abklärung', icd: 'R77.8', kat: 'uro', von: '2026-10', bis: null, status: 'aktiv', aerzte: ['wolf'], notiz: 'Kontrolle am 26.11.2026, ggf. MRT der Prostata.' },
  ];

  akte.dokumente = [
    { id: 'd1', datum: '2012-04-02', titel: 'MRT der Lendenwirbelsäule', typ: 'Bildgebung', kat: 'ruecken', arzt: 'radio', erk: 'e1', quelle: 'Scan', kurz: 'Bandscheibenvorfall L5/S1 links mit Kontakt zur Nervenwurzel S1. Keine Einengung des Spinalkanals.' },
    { id: 'd2', datum: '2012-09-18', titel: 'Abschlussbericht Physiotherapie', typ: 'Arztbrief', kat: 'ruecken', arzt: 'vogt', erk: 'e1', quelle: 'Scan', kurz: 'Beschwerdefrei nach 18 Behandlungen. Eigenübungen zur Rumpfstabilisierung mitgegeben.' },
    { id: 'd3', datum: '2016-06-21', titel: 'OP-Bericht Weisheitszähne', typ: 'Arztbrief', kat: 'zahn', arzt: 'kern', erk: 'e3', quelle: 'Scan', kurz: 'Operative Entfernung 38 und 48 in örtlicher Betäubung, komplikationslos.' },
    { id: 'd4', datum: '2017-05-03', titel: 'Impfpass (Scan aller Seiten)', typ: 'Impfnachweis', kat: 'impf', arzt: 'berger', erk: null, quelle: 'Scan', kurz: 'Letzte Tetanus-Diphtherie-Keuchhusten-Impfung am 03.05.2017. Masern: 2 Impfungen dokumentiert.' },
    { id: 'd5', datum: '2019-09-30', titel: 'Arztbrief Bluthochdruck', typ: 'Arztbrief', kat: 'hausarzt', arzt: 'berger', erk: 'e5', quelle: 'Scan', kurz: 'Langzeit-Blutdruckmessung: Mittelwert 148/94 mmHg. Beginn mit Ramipril 5 mg morgens, Kontrolle nach 4 Wochen.' },
    { id: 'd6', datum: '2021-08-05', titel: 'HNO-Befund und Hörtest', typ: 'Befund', kat: 'hno', arzt: 'roth', erk: 'e7', quelle: 'E-Mail', kurz: 'Hörvermögen altersentsprechend normal. Tinnitus links ohne organischen Befund.' },
    { id: 'd7', datum: '2023-05-12', titel: 'Feingewebliche Untersuchung (Histologie)', typ: 'Befund', kat: 'haut', arzt: 'brandt', erk: 'e9', quelle: 'Scan', kurz: 'Seborrhoische Keratose, vollständig entfernt. Gutartig.' },
    { id: 'd8', datum: '2024-01-22', titel: 'Check-up – Gesundheitsuntersuchung', typ: 'Befund', kat: 'hausarzt', arzt: 'berger', erk: null, quelle: 'Scan', kurz: 'Körperliche Untersuchung ohne Auffälligkeiten. LDL-Cholesterin erhöht (158 mg/dl). Nächster Check-up in 3 Jahren.' },
    { id: 'd9', datum: '2024-03-28', titel: 'Heil- und Kostenplan Krone 36', typ: 'Kostenplan', kat: 'zahn', arzt: 'kern', erk: 'e10', quelle: 'Scan', kurz: 'Vollkeramikkrone Zahn 36. Festzuschuss der TK mit 30 % Bonus. Eigenanteil 412,30 €.' },
    { id: 'd10', datum: '2024-10-15', titel: 'Befund Darmspiegelung', typ: 'Befund', kat: 'innere', arzt: 'klein', erk: 'e11', quelle: 'TK-ePA', kurz: 'Ein 6-mm-Polyp im Sigma abgetragen, gutartig. Kontroll-Darmspiegelung in 5 Jahren empfohlen.' },
    { id: 'd11', datum: '2025-07-09', titel: 'MRT der Lendenwirbelsäule', typ: 'Bildgebung', kat: 'ruecken', arzt: 'radio', erk: 'e12', quelle: 'TK-ePA', kurz: 'Bandscheibenvorwölbung L4/5 ohne Druck auf Nervenwurzeln. Verschleiß L5/S1 nach altem Vorfall.' },
    { id: 'd12', datum: '2025-07-16', titel: 'Verordnung Physiotherapie 2 × 6', typ: 'Verordnung', kat: 'ruecken', arzt: 'haas', erk: 'e12', quelle: 'Scan', kurz: 'Krankengymnastik, 2 × 6 Behandlungen, Diagnose M51.2.' },
    { id: 'd22', datum: '2024-10-14', titel: 'Laborbefund PSA', typ: 'Labor', kat: 'uro', arzt: 'wolf', erk: null, quelle: 'Scan', kurz: 'PSA 2,4 ng/ml, unauffällig.', werte: [['PSA gesamt', '2,4', 'ng/ml', '< 4,0', false]] },
    { id: 'd13', datum: '2025-10-20', titel: 'Laborbefund PSA', typ: 'Labor', kat: 'uro', arzt: 'wolf', erk: null, quelle: 'TK-ePA', kurz: 'PSA 3,1 ng/ml, im Normbereich, leicht gestiegen gegenüber 2024.', werte: [['PSA gesamt', '3,1', 'ng/ml', '< 4,0', false]] },
    { id: 'd14', datum: '2026-02-03', titel: 'Laborbefund Blutbild und Blutfette', typ: 'Labor', kat: 'hausarzt', arzt: 'berger', erk: 'e8', quelle: 'TK-ePA', kurz: 'Cholesterin und LDL weiter erhöht, Langzeitzucker und Nierenwerte normal.', werte: [['Gesamtcholesterin', '238', 'mg/dl', '< 200', true], ['LDL-Cholesterin', '162', 'mg/dl', '< 116', true], ['HDL-Cholesterin', '48', 'mg/dl', '> 40', false], ['Triglyceride', '140', 'mg/dl', '< 150', false], ['HbA1c', '5,6', '%', '< 5,7', false], ['Kreatinin', '1,0', 'mg/dl', '0,7–1,2', false]] },
    { id: 'd15', datum: '2026-03-15', titel: 'TK-Behandlungsübersicht 4. Quartal 2025', typ: 'TK-Abrechnung', kat: 'tk', arzt: null, erk: null, quelle: 'TK-ePA', kurz: '5 Arztkontakte, 6 Diagnosen (ICD-10). Alle bereits in der Akte vorhanden.' },
    { id: 'd16', datum: '2026-06-02', titel: 'Bonusheft Zahnarzt (Scan)', typ: 'Nachweis', kat: 'zahn', arzt: 'kern', erk: null, quelle: 'Scan', kurz: 'Lückenlose Stempel 2017–2026.' },
    { id: 'd17', datum: '2026-09-08', titel: 'Augenbefund und Brillenverordnung', typ: 'Befund', kat: 'auge', arzt: 'lorenz', erk: 'e13', quelle: 'E-Mail', kurz: 'Beginnende Alterssichtigkeit, Nahzusatz +1,25 dpt. Augeninnendruck 15/16 mmHg (normal).', werte: [['Augeninnendruck rechts', '15', 'mmHg', '10–21', false], ['Augeninnendruck links', '16', 'mmHg', '10–21', false]] },
    { id: 'd18', datum: '2026-10-22', titel: 'Laborbefund PSA-Kontrolle', typ: 'Labor', kat: 'uro', arzt: 'wolf', erk: 'e14', quelle: 'TK-ePA', kurz: 'PSA auf 4,6 ng/ml gestiegen, Quotient freies/gesamtes PSA 17 %. Kontrolle in 4 Wochen.', werte: [['PSA gesamt', '4,6', 'ng/ml', '< 4,0', true], ['PSA frei', '0,78', 'ng/ml', '–', false], ['Quotient frei/gesamt', '17', '%', '> 25', true]] },
    { id: 'd19', datum: '2026-10-23', titel: 'Arztbrief Urologie', typ: 'Arztbrief', kat: 'uro', arzt: 'wolf', erk: 'e14', quelle: 'TK-ePA', kurz: 'PSA-Anstieg von 3,1 auf 4,6 ng/ml. Tastbefund unauffällig. Kontrolle in 4 Wochen.' },
    { id: 'd21', datum: '2025-12-09', titel: 'Rechnung professionelle Zahnreinigung', typ: 'Rechnung', kat: 'zahn', arzt: 'kern', erk: null, quelle: 'E-Mail', kurz: '89,00 €. TK-Zuschuss von 40 € über die TK-App beantragt.' },
  ];

  const T = (id, datum, zeit, titel, arzt, kat) => ({ id, datum, zeit, titel, arzt, kat: kat || null, quelle: 'manuell' });
  akte.termine = [
    T('t1', '2025-06-12', '09:15', 'Dr. Haas – Rücken', 'haas'),
    T('t2', '2025-07-09', '07:45', 'MRT LWS Radiologie am Markt', 'radio'),
    T('t3', '2025-07-16', '10:30', 'Dr. Haas Befundbesprechung', 'haas'),
    T('t4', '2025-08-05', '17:00', 'Physio Vogt (Serie 1/6)', 'vogt'),
    T('t5', '2025-10-20', '08:30', 'Urologe Vorsorge', 'wolf'),
    T('t6', '2025-10-28', '11:00', 'Grippeimpfung Dr. Berger', 'berger', 'impf'),
    T('t7', '2025-12-09', '14:00', 'Zahnreinigung Dr. Kern', 'kern'),
    T('t8', '2026-01-14', '08:00', 'Hausarzt Blutdruck', 'berger'),
    T('t9', '2026-02-03', '07:30', 'Blutabnahme nüchtern – Berger', 'berger'),
    T('t10', '2026-06-02', '09:00', 'Zahnarzt Kontrolle', 'kern'),
    T('t11', '2026-09-08', '14:30', 'Augenärztin Dr. Lorenz', 'lorenz'),
    T('t12', '2026-10-22', '08:15', 'Urologie PSA', 'wolf'),
    T('t13', '2026-11-12', '17:30', 'Physio Vogt (Serie 2/6)', 'vogt'),
    T('t14', '2026-11-26', '08:30', 'Dr. Wolf – PSA-Kontrolle', 'wolf'),
    T('t15', '2026-12-04', '17:15', 'Physio Vogt (Serie 3/6)', 'vogt'),
    T('t16', '2026-12-11', '10:00', 'Zahnarzt Kontrolle + PZR', 'kern'),
    T('t17', '2027-01-19', '08:00', 'Check-up Dr. Berger (nüchtern!)', 'berger'),
  ];

  const zuletzt = { 'gkv-zahn': ['2026-06-02', 'kern'], 'tk-pzr': ['2025-12-09', 'kern'], 'gkv-checkup': ['2024-01-22', 'berger'], 'gkv-haut': ['2024-08-12', 'brandt'],
    'gkv-prostata': ['2025-10-20', 'wolf'], 'gkv-darm': ['2024-10-15', 'klein'], 'stiko-td': ['2017-05-03', 'berger'], 'stiko-grippe': ['2025-10-28', 'berger'], 'eigen-auge': ['2026-09-08', 'lorenz'] };
  for (const v of akte.vorsorge) {
    const z = zuletzt[v.regelId];
    if (z) { v.zuletzt = z[0]; v.arzt = z[1]; v.aktiv = true; }
    if (v.regelId === 'gkv-darm') { v.intervallMonate = 60; v.regel = 'laut Befund vom 15.10.2024: Kontrolle nach 5 Jahren'; }
    if (v.regelId === 'stiko-grippe') { v.regel = 'jährlich im Herbst · empfohlen wegen Bluthochdruck'; v.faelligManuell = '2026-10-15'; }
  }
  akte.medikamente = [{ id: 'm1', name: 'Ramipril 5 mg', dosierung: '1-0-0', seit: '2019-09-30', grund: 'Bluthochdruck', erk: 'e5' }];
  return akte;
}
