// Iteration 7: Vorsorge-Erinnerungen im Google Kalender.
//
// Für jede aktive Vorsorge, die fällig ist oder es demnächst wird, steht genau ein Eintrag im Kalender:
// „Vorsorge: <Untersuchung> – Termin vereinbaren“, 9:00 Uhr, mit Praxis, Adresse, Telefon und Sprechzeiten.
//   – Datum: Fälligkeit minus Vorlauf (Standard 6 Wochen); ist das schon vorbei, heute.
//   – Bleibt eine Erinnerung unerledigt, rückt sie alle 14 Tage auf den aktuellen Tag nach.
//   – Steht ein passender Arzttermin, ist die Untersuchung erledigt oder ausgeschaltet: Eintrag wird entfernt.
// Die App erkennt ihre Einträge an einer unsichtbaren Markierung (extendedProperties) und ändert nie andere Termine.
import { Z, aendern } from './speicher.js';
import { vorsorgeLage, finde, zeitenText } from './modell.js';
import { heuteIso, plusTage, datum, WT_NAME, WOCHE } from './hilfen.js';

const NACHFASSEN_TAGE = 14;
export const VORLAUF_STANDARD = 42;

export const erinnerungenAn = akte => akte?.einstellungen?.erinnerungenKalender !== false;
const kalenderVon = akte => akte.einstellungen?.erinnerungKalender || 'primary';

function hash(s) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return (h >>> 0).toString(36); }

/** Was für eine Vorsorge im Kalender stehen soll (oder null). */
function sollFuer(akte, v, vorhanden) {
  const lage = vorsorgeLage(akte, v);
  if (!['ueber', 'bald', 'ok'].includes(lage.status) || !lage.faellig) return null;
  const heute = heuteIso();
  const vorlauf = akte.einstellungen?.erinnerungVorlaufTage || VORLAUF_STANDARD;
  const erinnerung = plusTage(lage.faellig, -vorlauf);
  let tag = erinnerung > heute ? erinnerung : heute;
  const ist = vorhanden?.start?.dateTime?.slice(0, 10) || vorhanden?.start?.date;
  // schon fällig: vorhandenen Eintrag bis zu 14 Tage stehen lassen, danach auf heute nachrücken
  if (erinnerung <= heute && ist && ist <= heute && ist >= plusTage(heute, -NACHFASSEN_TAGE + 1)) tag = ist;

  const ar = finde(akte, 'aerzte', v.arzt);
  const zeiten = ar ? WOCHE.filter(t => ar.zeiten?.[t]?.length).map(t => `${WT_NAME[t]} ${zeitenText(ar.zeiten[t])}`) : [];
  const app = location.origin + location.pathname.replace(/[^/]*$/, '') + '#vorsorge';
  const abschnitte = [
    [`Fällig: ${datum(lage.faellig)}${lage.status === 'ueber' ? ' (überfällig)' : ''}`, v.regel ? `Regel: ${v.regel}` : '', v.zuletzt ? `Zuletzt: ${datum(v.zuletzt)}` : ''],
    [ar ? `Praxis: ${ar.name}` : 'Praxis: noch keine zugeordnet (in der Gesundheitsakte unter Vorsorge eintragen)', ar?.tel ? `Telefon: ${ar.tel}` : '',
      ar?.adresse ? `Adresse: ${ar.adresse}` : '', zeiten.length ? `Sprechzeiten: ${zeiten.join(' · ')}` : ''],
    ['Erinnerung aus deiner Gesundheitsakte. Sie verschwindet von selbst, sobald ein Arzttermin eingetragen oder die Untersuchung als erledigt markiert ist.', app],
  ];
  const ev = {
    summary: `Vorsorge: ${v.name} – Termin vereinbaren`,
    location: ar?.adresse || '',
    description: abschnitte.map(z => z.filter(Boolean).join('\n')).join('\n\n'),
    start: { dateTime: `${tag}T09:00:00`, timeZone: 'Europe/Berlin' },
    end: { dateTime: `${tag}T09:15:00`, timeZone: 'Europe/Berlin' },
    transparency: 'transparent',
    reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 0 }] },
  };
  const stand = hash(JSON.stringify([ev.summary, ev.location, ev.description, tag]));
  ev.extendedProperties = { private: { gesundheitsakte: 'vorsorge', vorsorgeId: v.id, stand } };
  return { ev, tag, stand };
}

let laeuft = false;
/** Kalender mit den fälligen Vorsorgen abgleichen. Liefert { status, neu, geaendert, entfernt }. */
export async function erinnerungenAbgleichen() {
  const akte = Z.akte, drive = Z.drive;
  if (Z.modus !== 'konto' || !akte) return { status: 'aus' };
  if (!erinnerungenAn(akte)) return { status: 'ausgeschaltet' };
  if (!drive?.verbunden()) return { status: 'getrennt' };
  if (!drive.kalenderSchreibenErlaubt?.()) return { status: 'keinZugriff' };
  if (laeuft) return { status: 'laeuft' };
  laeuft = true;
  try {
    const kal = kalenderVon(akte);
    const vorhanden = new Map();
    let entfernt = 0, neu = 0, geaendert = 0;
    for (const e of await drive.erinnerungenLesen(kal)) {
      const id = e.extendedProperties?.private?.vorsorgeId;
      if (vorhanden.has(id)) { await drive.terminLoeschen(kal, e.id); entfernt++; }   // doppelte aufräumen
      else vorhanden.set(id, e);
    }
    const stand = {};
    for (const v of akte.vorsorge) {
      const alt = vorhanden.get(v.id);
      vorhanden.delete(v.id);
      const soll = v.aktiv ? sollFuer(akte, v, alt) : null;
      if (!soll) { if (alt) { await drive.terminLoeschen(kal, alt.id); entfernt++; } continue; }
      let r = alt;
      if (!alt) { r = await drive.terminAnlegen(kal, soll.ev); neu++; }
      else if (alt.extendedProperties?.private?.stand !== soll.stand) { r = await drive.terminAendern(kal, alt.id, soll.ev); geaendert++; }
      stand[v.id] = { datum: soll.tag, link: r?.htmlLink || alt?.htmlLink || '' };
    }
    for (const e of vorhanden.values()) { await drive.terminLoeschen(kal, e.id); entfernt++; }   // Vorsorge gelöscht
    // Datum der Erinnerung in der Akte vermerken (nur zur Anzeige), nur bei Änderung speichern
    const unterschied = akte.vorsorge.some(v => JSON.stringify(v.kalErinnerung || null) !== JSON.stringify(stand[v.id] || null));
    if (unterschied) aendern(a => { for (const v of a.vorsorge) { if (stand[v.id]) v.kalErinnerung = stand[v.id]; else delete v.kalErinnerung; } });
    Z.erinnerungen = { stand: new Date(), anzahl: Object.keys(stand).length, fehler: '' };
    return { status: 'ok', neu, geaendert, entfernt };
  } catch (e) {
    if (e?.name === 'AnmeldungNoetig') throw e;
    Z.erinnerungen = { ...(Z.erinnerungen || {}), fehler: e.message };
    return { status: 'fehler', fehler: e.message };
  } finally { laeuft = false; }
}

/** Alle Erinnerungen der App aus dem Kalender entfernen (beim Ausschalten). */
export async function erinnerungenEntfernen() {
  const drive = Z.drive;
  if (Z.modus !== 'konto' || !drive?.verbunden() || !drive.kalenderSchreibenErlaubt?.()) return 0;
  const kal = kalenderVon(Z.akte);
  const liste = await drive.erinnerungenLesen(kal);
  for (const e of liste) await drive.terminLoeschen(kal, e.id);
  if (Z.akte.vorsorge.some(v => v.kalErinnerung)) aendern(a => { for (const v of a.vorsorge) delete v.kalErinnerung; });
  return liste.length;
}
