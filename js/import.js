// „Daten übernehmen“: ergänzt die Akte um Einträge aus einer Import-Datei (z. B. aus dem OneNote-Gesundheitstagebuch).
// Grundsätze: nichts wird gelöscht; Einträge mit gleicher ID werden übersprungen (mehrfacher Import ist harmlos);
// Ärzte mit gleichem Namen werden zusammengeführt; Vorsorge-Daten werden nur nach vorne aktualisiert.

const LISTEN = ['aerzte', 'erkrankungen', 'termine', 'dokumente', 'medikamente'];
const TITEL = /^(dr|prof|med|dent|rer|nat|dipl|ing|praxis|herr|frau)\.?(-[a-z]+\.?)*$/i;
const namensSchluessel = n => String(n || '').toLowerCase().replace(/[.,()]/g, ' ').split(/\s+/).filter(w => w && !TITEL.test(w)).join(' ');

export function importLesen(text) {
  let d;
  try { d = JSON.parse(text); } catch { throw new Error('Die Datei ist kein gültiges JSON.'); }
  if (d?.format !== 'gesundheitsakte-import') throw new Error('Das ist keine Import-Datei der Gesundheitsakte.');
  for (const l of [...LISTEN, 'vorsorge', 'kategorien']) d[l] ??= [];
  return d;
}

/** Ordnet Import-Ärzte vorhandenen Ärzten zu (gleicher Name ohne Titel). */
function arztZuordnung(akte, d) {
  const zuordnung = {};
  for (const a of d.aerzte) {
    const gleich = akte.aerzte.find(x => x.id === a.id) || akte.aerzte.find(x => namensSchluessel(x.name) === namensSchluessel(a.name));
    zuordnung[a.id] = gleich ? gleich.id : null;
  }
  return zuordnung;
}

/** Vorschau: was würde passieren? */
export function importVorschau(akte, d) {
  const z = arztZuordnung(akte, d);
  const v = { kategorien: 0, aerzte: 0, aerzteVorhanden: 0, vorsorge: 0 };
  v.kategorien = d.kategorien.filter(k => !akte.kategorien.some(x => x.id === k.id)).length;
  v.aerzte = d.aerzte.filter(a => !z[a.id]).length;
  v.aerzteVorhanden = d.aerzte.length - v.aerzte;
  for (const l of ['erkrankungen', 'termine', 'dokumente', 'medikamente']) {
    const vorhanden = new Set(akte[l].map(x => x.id));
    v[l] = d[l].filter(x => !vorhanden.has(x.id)).length;
    v[l + 'Vorhanden'] = d[l].length - v[l];
  }
  v.vorsorge = d.vorsorge.length;
  return v;
}

export function importAnwenden(akte, d) {
  const z = arztZuordnung(akte, d);
  const arztId = id => (id && (z[id] || id)) || null;

  for (const k of d.kategorien) if (!akte.kategorien.some(x => x.id === k.id)) akte.kategorien.splice(akte.kategorien.findIndex(x => x.id === 'tk'), 0, { ...k });

  for (const a of d.aerzte) {
    if (z[a.id]) {
      // vorhandenen Arzt nur um fehlende Angaben ergänzen
      const x = akte.aerzte.find(y => y.id === z[a.id]);
      for (const f of ['fach', 'adresse', 'tel', 'web', 'notiz']) if (!x[f] && a[f]) x[f] = a[f];
    } else akte.aerzte.push({ zeiten: {}, ...a });
  }
  const neu = (liste, umbauen = x => x) => {
    const vorhanden = new Set(akte[liste].map(x => x.id));
    for (const x of d[liste]) if (!vorhanden.has(x.id)) akte[liste].push(umbauen({ ...x }));
  };
  neu('erkrankungen', e => ({ ...e, aerzte: (e.aerzte || []).map(arztId).filter(Boolean) }));
  neu('termine', t => ({ quelle: 'import', ...t, arzt: arztId(t.arzt) }));
  neu('dokumente', x => ({ ...x, arzt: arztId(x.arzt) }));
  neu('medikamente');

  for (const v of d.vorsorge) {
    const x = (v.regelId && akte.vorsorge.find(y => y.regelId === v.regelId)) || akte.vorsorge.find(y => y.id === v.id);
    if (!x) { akte.vorsorge.push({ id: v.id, regelId: v.regelId || null, aktiv: true, intervallMonate: 12, notiz: '', ...v, arzt: arztId(v.arzt) }); continue; }
    if (v.zuletzt && (!x.zuletzt || v.zuletzt > x.zuletzt)) { x.zuletzt = v.zuletzt; x.faelligManuell = null; }
    for (const f of ['name', 'regel', 'intervallMonate', 'aktiv', 'faelligManuell', 'notiz']) if (v[f] !== undefined) x[f] = v[f];
    if (v.arzt && !x.arzt) x.arzt = arztId(v.arzt);
  }
  akte.importe = [...(akte.importe || []), { quelle: d.quelle || 'Import', datum: new Date().toISOString() }];
}
