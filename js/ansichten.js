// Alle Ansichten der App. Jede Funktion liefert HTML für den Inhaltsbereich.
import { Z, dateiLink } from './speicher.js';
import { googleDrive } from './drive.js';
import { VERSION, STAND } from './konfig.js';
import { esc, datum, tag, tageBis, relativ, svg, MON, MON_LANG, WT, WOCHE, WT_NAME, WT_LANG, heute, iso } from './hilfen.js';
import { finde, kat, faecher, katVonTermin, alter, vorsorgeLage, V_TEXT, V_RANG, STATUS_ERKRANKUNG, offen, zeitenText } from './modell.js';

const A = () => Z.akte;
const arzt = id => finde(A(), 'aerzte', id);
const erk = id => finde(A(), 'erkrankungen', id);
const catStyle = k => `style="--h:${kat(A(), k).h}"`;
export const chip = k => k ? `<span class="chip cat" ${catStyle(k)}>${esc(kat(A(), k).name)}</span>` : '';
const mark = (k, gross) => `<span class="mono-mark cat${gross ? ' gross' : ''}" ${catStyle(k)} aria-hidden="true">${esc(kat(A(), k).kurz)}</span>`;
const nachDatum = (a, b) => (a.datum || a.von || '').localeCompare(b.datum || b.von || '');
const neuKnopf = (typ, text) => `<button class="btn" data-neu="${typ}">${svg('plus')}${text}</button>`;
const leer = (text, typ, knopf) => `<div class="leer"><p>${text}</p>${typ ? neuKnopf(typ, knopf) : ''}</div>`;

const BEISPIEL = () => Z.modus === 'beispiel'
  ? `<div class="proto"><b>Beispieldaten.</b> Alle Personen, Praxen und Werte sind erfunden. Änderungen werden nicht gespeichert.${googleDrive.eingerichtet() ? ' <button class="link" data-aktion="verbinden">Mit Google verbinden</button>' : ''}</div>` : '';

// ======================================================================
//  Begrüßung und Einrichtung
// ======================================================================
export function ansichtBegruessung() {
  const eingerichtet = googleDrive.eingerichtet() || new URLSearchParams(location.search).has('test');
  return `<div class="begruessung">
    <div class="brand-mark gross-mark">${svg('plus', 'width="34" height="34" stroke-width="2.6"')}</div>
    <h1>Gesundheitsakte</h1>
    <p>Deine Krankengeschichte, Befunde, Arzttermine und Vorsorge an einem Ort. Die Daten liegen ausschließlich in deinem privaten Google Drive im Ordner <span class="mono">60 Gesundheit/Gesundheitsakte</span>.</p>
    <div class="knoepfe mitte">
      ${eingerichtet ? `<button class="btn primaer gross" data-aktion="verbinden">${svg('wolke')}Mit privatem Google-Konto anmelden</button>` : ''}
      <button class="btn gross" data-aktion="beispiel">Beispieldaten ansehen</button>
    </div>
    ${eingerichtet ? '' : `<p class="hinweis-box">Die Google-Anmeldung ist noch nicht eingerichtet. Dafür fehlt die Client-ID aus der Google Cloud Console (Anleitung in <span class="mono">LIESMICH.md</span>). Bis dahin kannst du die App mit Beispieldaten ausprobieren.</p>`}
    ${Z.status === 'fehler' || (Z.meldung && Z.status === 'getrennt') ? `<p class="hinweis-box fehler">${esc(Z.meldung)}</p>` : ''}
    <p class="small muted">Version ${VERSION} · ${STAND}</p>
  </div>`;
}

export function ansichtEinrichtung() {
  return `<div class="kopf"><div><h1>Neue Akte anlegen</h1><p>Angemeldet als <b>${esc(Z.konto?.email)}</b>. In deinem Drive gibt es noch keine Akte. Mit Jahrgang und Geschlecht stellt die App die passenden Vorsorgeuntersuchungen zusammen.</p></div></div>
  <section class="panel" style="max-width:620px">${formularProfil(true)}</section>`;
}

export function formularProfil(neu) {
  const p = A()?.profil || { kasse: 'Techniker Krankenkasse' };
  return `<form data-form="profil" class="formular" novalidate>
    <div class="feldreihe">
      <div class="feld"><label for="p-name">Name</label><input id="p-name" name="name" value="${esc(p.name)}" autocomplete="name"></div>
      <div class="feld"><label for="p-rufname">Anrede in der App</label><input id="p-rufname" name="rufname" value="${esc(p.rufname || '')}" placeholder="${esc(rufname(p) || 'z. B. Marcus')}" autocomplete="given-name"><span class="hilfe">leer = Vorname ohne Titel</span></div>
    </div>
    <div class="feldreihe">
      <div class="feld"><label for="p-jahrgang">Jahrgang *</label><input id="p-jahrgang" name="jahrgang" type="number" min="1900" max="${heute().getFullYear()}" inputmode="numeric" value="${esc(p.jahrgang ?? '')}" required></div>
      <div class="feld"><label for="p-geschlecht">Geschlecht *</label><select id="p-geschlecht" name="geschlecht" required>
        <option value="">bitte wählen</option>${['männlich', 'weiblich', 'divers'].map(g => `<option ${p.geschlecht === g ? 'selected' : ''}>${g}</option>`).join('')}</select></div>
    </div>
    <div class="feld"><label for="p-kasse">Krankenkasse</label><input id="p-kasse" name="kasse" value="${esc(p.kasse)}"></div>
    <p class="formular-fehler" hidden></p>
    <div class="knoepfe"><button class="btn primaer" type="submit">${neu ? 'Akte anlegen' : 'Speichern'}</button>${neu ? '' : '<button class="btn" type="button" data-zu>Abbrechen</button>'}</div>
  </form>`;
}

// ======================================================================
//  Übersicht
// ======================================================================
export function ansichtStart() {
  const a = A();
  const vs = a.vorsorge.map(v => ({ ...v, ...vorsorgeLage(a, v) }));
  const ueber = vs.filter(v => v.status === 'ueber');
  const bald = vs.filter(v => v.status === 'bald');
  const unbekannt = vs.filter(v => v.status === 'unbekannt');
  const naechste = a.termine.filter(t => tageBis(t.datum) >= 0).sort(nachDatum);
  const ohneArzt = naechste.filter(t => !t.arzt && !t.kat);
  const geaendert = a.aerzte.filter(x => x.aenderung);
  const wtag = heute().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const schritte = [
    ['Profil ausgefüllt', !!a.profil.jahrgang, 'profil'],
    ['Ärzte erfasst', a.aerzte.length > 0, 'arzt'],
    ['Erkrankungen nachgetragen', a.erkrankungen.length > 0, 'erkrankung'],
    ['Letzte Vorsorge-Termine eingetragen', unbekannt.length === 0, null],
    ['Erste Dokumente abgelegt', a.dokumente.length > 0, 'dokument'],
  ];
  const ersteSchritte = schritte.some(s => !s[1]) ? `<section class="panel"><div class="panel-kopf"><h2>Erste Schritte</h2><span class="small muted">${schritte.filter(s => s[1]).length} von ${schritte.length} erledigt</span></div>
    <div class="liste">${schritte.map(([t, ok, typ]) => `<div class="zeile" style="align-items:center"><span class="haken ${ok ? 'ja' : ''}">${ok ? svg('haken') : ''}</span><div class="grow"><div class="t">${t}</div></div>
      ${ok ? '' : typ ? `<button class="btn klein" data-neu="${typ}">Erfassen</button>` : '<a class="btn klein" href="#vorsorge">Eintragen</a>'}</div>`).join('')}</div></section>` : '';

  const hinweise = [
    ...(Z.modus === 'konto' && Z.ungespeichert && Z.status !== 'speichert' ? [`<div class="hinweis warn"><span class="hinweis-icon">${svg('wolke_aus')}</span>
      <div><div class="t">Änderungen sind noch nicht in Google Drive gespeichert</div><div class="s">Sie liegen sicher auf diesem Gerät und werden nach dem Verbinden übertragen.</div></div>
      <button class="btn klein primaer" data-aktion="verbinden">Verbinden</button></div>`] : []),
    ...ueber.map(v => {
      const ar = arzt(v.arzt);
      return `<div class="hinweis crit"><span class="hinweis-icon">${svg('vorsorge')}</span>
        <div><div class="t">${esc(v.name)} ist seit ${relativ(v.faellig).replace('vor ', '')} fällig</div>
        <div class="s">${ar ? `${esc(ar.name)} · Tel. <span class="num">${esc(ar.tel || '–')}</span> · ${esc(offen(ar).text)}` : 'Noch keine Praxis zugeordnet'}</div></div>
        ${ar ? `<button class="btn klein" data-arzt="${ar.id}">Praxis anzeigen</button>` : `<button class="btn klein" data-vorsorge="${v.id}">Zuordnen</button>`}</div>`;
    }),
    ...(unbekannt.length && a.aerzte.length ? [`<div class="hinweis plan"><span class="hinweis-icon">${svg('vorsorge')}</span>
      <div><div class="t">Bei ${unbekannt.length} Vorsorgeuntersuchungen fehlt das letzte Datum</div><div class="s">${esc(unbekannt.slice(0, 3).map(v => v.name).join(', '))}${unbekannt.length > 3 ? ' …' : ''}</div></div>
      <a class="btn klein" href="#vorsorge">Eintragen</a></div>`] : []),
    ...((Z.eingang || []).length ? [`<div class="hinweis info"><span class="hinweis-icon">${svg('eingang')}</span>
      <div><div class="t">${Z.eingang.length} ${Z.eingang.length === 1 ? 'Datei' : 'Dateien'} im Eingang</div><div class="s">In Google Drive unter Gesundheitsakte/00_Eingang, noch nicht eingeordnet</div></div>
      <a class="btn klein" href="#dokumente">Einordnen</a></div>`] : []),
    ...geaendert.map(x => `<div class="hinweis warn"><span class="hinweis-icon">${svg('karte')}</span>
      <div><div class="t">Sprechzeiten geändert: ${esc(x.name)}</div>
      <div class="s">${WT_LANG[x.aenderung.tag]} jetzt ${zeitenText(x.zeiten[x.aenderung.tag])} (vorher ${esc(x.aenderung.alt)}) · laut Google Maps am ${datum(x.aenderung.datum)}</div></div>
      <button class="btn klein" data-arzt="${x.id}">Ansehen</button></div>`),
    ...ohneArzt.map(t => `<div class="hinweis plan"><span class="hinweis-icon">${svg('kalender')}</span>
      <div><div class="t">Termin „${esc(t.titel)}“ ohne Arzt</div><div class="s">${datum(t.datum)}${t.zeit ? ', ' + t.zeit + ' Uhr' : ''}</div></div>
      <button class="btn klein" data-termin="${t.id}">Zuordnen</button></div>`),
  ].join('');

  const zaehl = st => vs.filter(v => v.status === st).length;
  const aktive = a.erkrankungen.filter(e => e.status !== 'abgeschlossen').sort((x, y) => y.von.localeCompare(x.von));
  const zuletzt = [...a.dokumente].sort(nachDatum).reverse().slice(0, 5);

  return `${BEISPIEL()}
  <div class="kopf"><div><h1>Guten Tag${Z.modus === 'konto' && rufname(a.profil) ? ', ' + esc(rufname(a.profil)) : ''}</h1><p>${wtag}${a.profil.jahrgang ? ` · Jahrgang ${a.profil.jahrgang}` : ''}${a.profil.kasse ? ' · ' + esc(a.profil.kasse) : ''}</p></div></div>
  ${ersteSchritte}
  ${hinweise ? `<section class="hinweise" aria-label="Braucht Aufmerksamkeit">${hinweise}</section>` : ''}
  <div class="grid2">
    <div class="stack">
      <section class="panel"><div class="panel-kopf"><h2>Nächste Arzttermine</h2><a href="#termine">Alle Termine</a></div>
        ${naechste.length ? `<div class="liste">${naechste.slice(0, 4).map(terminZeile).join('')}</div>` : leer('Keine kommenden Termine eingetragen.', 'termin', 'Termin erfassen')}</section>
      <section class="panel"><div class="panel-kopf"><h2>Aktuelle Erkrankungen</h2><a href="#verlauf">Gesamter Verlauf</a></div>
        ${aktive.length ? `<div class="liste">${aktive.map(e => `<button class="zeile" data-erk="${e.id}">${mark(e.kat)}<div class="grow"><div class="t">${esc(e.titel)}</div>
          <div class="s">seit ${datum(e.von)}${e.icd ? ` · <span class="mono">${esc(e.icd)}</span>` : ''}${e.aerzte?.[0] && arzt(e.aerzte[0]) ? ' · ' + esc(arzt(e.aerzte[0]).name) : ''}</div></div>
          <span class="pill st-${e.status}">${STATUS_ERKRANKUNG[e.status]}</span></button>`).join('')}</div>` : leer('Keine laufenden oder dauerhaften Erkrankungen.', 'erkrankung', 'Erkrankung erfassen')}</section>
    </div>
    <div class="stack">
      <section class="panel"><div class="panel-kopf"><h2>Vorsorge</h2><a href="#vorsorge">Alle Untersuchungen</a></div>
        <div class="ampel">${[['ueber', 'überfällig'], ['bald', 'bald fällig'], ['geplant', 'Termin steht'], ['ok', 'erledigt']].map(([st, txt]) =>
          `<a href="#vorsorge" class="st-${st}"><b class="num">${zaehl(st)}</b><span>${txt}</span></a>`).join('')}</div>
        ${[...ueber, ...bald].length ? `<div class="liste" style="margin-top:12px">${[...ueber, ...bald].map(v => `<button class="zeile" data-vorsorge="${v.id}"><div class="grow"><div class="t">${esc(v.name)}</div>
          <div class="s">fällig ${datum(v.faellig)}${arzt(v.arzt) ? ' · ' + esc(arzt(v.arzt).name) : ''}</div></div><span class="pill st-${v.status}">${V_TEXT[v.status]}</span></button>`).join('')}</div>` : ''}
      </section>
      <section class="panel"><div class="panel-kopf"><h2>Zuletzt abgelegt</h2><a href="#dokumente">Alle Dokumente</a></div>
        ${zuletzt.length ? `<div class="liste">${zuletzt.map(docZeile).join('')}</div>` : leer('Noch keine Dokumente.', 'dokument', 'Dokument ablegen')}</section>
    </div>
  </div>`;
}

/** Anrede: eingetragener Rufname, sonst erster Vorname ohne Titel („Dr. med. Marcus W.“ → „Marcus“). */
const TITEL = /^(dr|prof|med|dent|rer|nat|phil|jur|dipl|ing|mag|msc|bsc|ma|ba|herr|frau)\.?(-[a-z]+\.?)*$/i;
export function rufname(p) {
  if (p?.rufname?.trim()) return p.rufname.trim();
  return String(p?.name || '').split(/\s+/).find(w => w && !TITEL.test(w)) || '';
}

export function terminZeile(t) {
  const d = tag(t.datum);
  const ar = arzt(t.arzt);
  const k = katVonTermin(A(), t);
  return `<button class="zeile" data-termin="${t.id}"><div class="termin-datum"><b class="num">${d.getDate()}</b><span>${MON[d.getMonth()]}</span></div>
    <div class="grow"><div class="t">${ar ? esc(ar.name) : esc(t.titel)}</div>
    <div class="s">${WT_LANG[WT[d.getDay()]]}${t.zeit ? `, ${t.zeit} Uhr` : ''}${ar ? ` · „${esc(t.titel)}“` : ''}</div>
    ${ar?.adresse ? `<div class="s">${esc(ar.adresse)}</div>` : ''}</div>
    ${k ? chip(k) : '<span class="pill st-bald">zuordnen</span>'}</button>`;
}
export function docZeile(d) {
  const ar = arzt(d.arzt);
  return `<button class="zeile" data-doc="${d.id}">${mark(d.kat)}<div class="grow"><div class="t">${esc(d.titel)}</div>
    <div class="s">${datum(d.datum)} · ${esc(d.typ)}${ar ? ' · ' + esc(ar.name) : ''}${d.driveId ? '' : ' · <span class="ohne-datei">ohne Datei</span>'}</div></div></button>`;
}

// ======================================================================
//  Krankheitsverlauf
// ======================================================================
export const verlaufFilter = { kat: 'alle', nurAktiv: false };
export function ansichtVerlauf() {
  const a = A();
  const kopf = `<div class="kopf"><div><h1>Krankheitsverlauf</h1><p>${a.erkrankungen.length} Erkrankungen und Behandlungen${a.erkrankungen.length ? ', neueste zuerst' : ''}.</p></div>${neuKnopf('erkrankung', 'Erkrankung erfassen')}</div>`;
  if (!a.erkrankungen.length) return `${BEISPIEL()}${kopf}<section class="panel">${leer('Noch keine Erkrankungen erfasst. Trage zuerst ein, was dir einfällt: Operationen, längere Behandlungen, dauerhafte Diagnosen. Später ergänzen die TK-Behandlungsübersichten die Liste.', 'erkrankung', 'Erste Erkrankung erfassen')}</section>`;
  const kats = [...new Set(a.erkrankungen.map(e => e.kat).filter(Boolean))];
  const liste = a.erkrankungen.filter(e => (verlaufFilter.kat === 'alle' || e.kat === verlaufFilter.kat) && (!verlaufFilter.nurAktiv || e.status !== 'abgeschlossen'))
    .sort((x, y) => y.von.localeCompare(x.von));
  const jahre = {};
  liste.forEach(e => (jahre[e.von.slice(0, 4)] ||= []).push(e));

  const startJ = Math.min(...a.erkrankungen.map(e => +e.von.slice(0, 4)));
  const t0 = new Date(startJ, 0, 1), t1 = new Date(heute().getFullYear() + 1, 0, 1);
  const anteil = d => ((d - t0) / (t1 - t0)) * 100;
  const ende = e => { if (!e.bis) return heute(); const b = tag(e.bis); return e.bis.length === 7 ? new Date(b.getFullYear(), b.getMonth() + 1, 1) : b; };
  const lanes = kats.map(k => {
    const bars = a.erkrankungen.filter(e => e.kat === k).map(e => {
      const l = anteil(tag(e.von)), r = anteil(ende(e));
      return `<button class="bar${e.bis ? '' : ' offen-ende'}" style="left:${l}%;width:${Math.max(r - l, .6)}%" data-erk="${e.id}" title="${esc(e.titel)} (${datum(e.von)}${e.bis ? '–' + datum(e.bis) : ' bis heute'})" aria-label="${esc(e.titel)}"></button>`;
    }).join('');
    return `<div class="lane-name cat" ${catStyle(k)}><span class="dot" style="background:var(--c)"></span>${esc(kat(a, k).name)}</div><div class="lane cat" ${catStyle(k)}>${bars}</div>`;
  }).join('');
  const schritt = heute().getFullYear() - startJ > 12 ? 4 : 2;
  let jahrLabels = '';
  for (let y = startJ; y <= heute().getFullYear(); y += schritt) jahrLabels += `<span style="left:${anteil(new Date(y, 0, 1))}%">${y}</span>`;

  return `${BEISPIEL()}${kopf}
  <section class="panel"><div class="panel-kopf"><h2>Lebenslinie</h2><span class="small muted">Balken antippen für Einzelheiten</span></div>
    <div class="lanes-wrap"><div class="lanes">${lanes}<div></div><div class="jahre">${jahrLabels}</div></div></div></section>
  <div class="filter" role="group" aria-label="Nach Fachbereich filtern">
    <button data-vfilter="alle" aria-pressed="${verlaufFilter.kat === 'alle'}">Alle</button>
    ${kats.map(k => `<button data-vfilter="${k}" aria-pressed="${verlaufFilter.kat === k}">${esc(kat(a, k).name)}</button>`).join('')}
    <button data-vaktiv aria-pressed="${verlaufFilter.nurAktiv}">Nur aktuelle</button>
  </div>
  <div class="zeitstrahl">${Object.keys(jahre).sort().reverse().map(j => `<div class="jahr-gruppe"><h2 class="num">${j}</h2><div class="ereignisse">
    ${jahre[j].map(ereignisKarte).join('')}</div></div>`).join('') || '<p class="muted">Keine Einträge für diesen Filter.</p>'}</div>`;
}
export function ereignisKarte(e) {
  const docs = A().dokumente.filter(d => d.erk === e.id);
  const aerzte = (e.aerzte || []).map(arzt).filter(Boolean);
  return `<article class="ereignis cat" ${catStyle(e.kat)}>
    <div><div class="t">${esc(e.titel)}</div>
      <div class="meta"><span>${datum(e.von)}${e.bis ? (e.bis !== e.von ? ' – ' + datum(e.bis) : '') : ' – heute'}</span>
      ${e.icd ? `<span class="mono">ICD ${esc(e.icd)}</span>` : ''}${aerzte.length ? `<span>${esc(aerzte.map(x => x.name).join(', '))}</span>` : ''}</div></div>
    <div class="rechts">${chip(e.kat)}<span class="pill st-${e.status}">${STATUS_ERKRANKUNG[e.status]}</span><button class="btn klein" data-bearbeiten="erkrankung:${e.id}">${svg('stift')}Bearbeiten</button></div>
    ${e.notiz ? `<p>${esc(e.notiz)}</p>` : ''}
    ${docs.length ? `<div class="docs">${docs.map(d => `<button class="doc-link" data-doc="${d.id}">${svg('datei')}${esc(d.titel)}</button>`).join('')}</div>` : ''}
  </article>`;
}

// ======================================================================
//  Fachbereiche
// ======================================================================
function fachZahlen(k) {
  const a = A();
  const termine = a.termine.filter(t => katVonTermin(a, t) === k);
  const vergangen = termine.filter(t => tageBis(t.datum) < 0).sort(nachDatum);
  const kommend = termine.filter(t => tageBis(t.datum) >= 0).sort(nachDatum);
  return {
    erk: a.erkrankungen.filter(e => e.kat === k), docs: a.dokumente.filter(d => d.kat === k), aerzte: a.aerzte.filter(x => x.kat === k),
    vorsorge: a.vorsorge.filter(v => v.kat === k && v.aktiv), vergangen, kommend, letzter: vergangen.at(-1), naechster: kommend[0],
  };
}
export function ansichtFaecher() {
  const a = A();
  return `${BEISPIEL()}
  <div class="kopf"><div><h1>Fachbereiche</h1><p>Alles zu einem Fachgebiet auf einen Blick: Ärzte, Erkrankungen, Termine, Befunde und Vorsorge.</p></div>${neuKnopf('kategorie', 'Fachbereich anlegen')}</div>
  <div class="kacheln">${faecher(a).map(k => {
    const z = fachZahlen(k.id);
    const vst = z.vorsorge.map(v => vorsorgeLage(a, v).status);
    const warn = vst.includes('ueber') ? '<span class="pill st-ueber">Vorsorge überfällig</span>' : vst.includes('bald') ? '<span class="pill st-bald">Vorsorge bald fällig</span>' : '';
    return `<a class="kachel cat" ${catStyle(k.id)} href="#fach-${k.id}">
      <div class="kachel-kopf">${mark(k.id)}<b>${esc(k.name)}</b></div>
      <div class="kennzahlen"><div><b class="num">${z.erk.length}</b><span>Erkrankungen</span></div><div><b class="num">${z.docs.length}</b><span>Dokumente</span></div><div><b class="num">${z.aerzte.length}</b><span>Ärzte</span></div></div>
      <div class="kachel-fuss"><span>Zuletzt: ${z.letzter ? datum(z.letzter.datum) : '–'}</span><span>Nächster Termin: ${z.naechster ? datum(z.naechster.datum) : 'keiner'}</span>${warn}</div>
    </a>`;
  }).join('')}</div>`;
}
export function ansichtFach(k) {
  const a = A();
  if (!a.kategorien.some(x => x.id === k)) return ansichtFaecher();
  const z = fachZahlen(k);
  let extra = '';
  if (k === 'zahn') {
    const kontrollen = a.termine.filter(t => katVonTermin(a, t) === 'zahn' && tageBis(t.datum) < 0).map(t => +t.datum.slice(0, 4));
    const v = a.vorsorge.find(x => x.regelId === 'gkv-zahn');
    if (v?.zuletzt) kontrollen.push(+v.zuletzt.slice(0, 4));
    const bisJ = heute().getFullYear(), jahre = [];
    for (let y = bisJ - 9; y <= bisJ; y++) jahre.push(y);
    let kette = 0; for (let y = bisJ - (kontrollen.includes(bisJ) ? 0 : 1); kontrollen.includes(y); y--) kette++;
    extra = `<section class="panel cat" ${catStyle(k)}><div class="panel-kopf"><h2>Bonusheft</h2><span class="small muted">${kette} Jahre lückenlos · Bonus ${kette >= 10 ? '30' : kette >= 5 ? '20' : '0'} % auf Zahnersatz</span></div>
      <div class="bonus">${jahre.map(y => `<div class="${kontrollen.includes(y) ? 'ja' : (y === bisJ ? 'offen' : '')}">${String(y).slice(2)}</div>`).join('')}</div>
      <p class="small muted" style="margin:10px 0 0">Ermittelt aus Zahnarztterminen und der letzten Kontrolle. Bitte mit dem Bonusheft abgleichen.</p></section>`;
  }
  // Werteverläufe: je Messgröße (erster Wert eines Befunds) ein Diagramm, sobald es zwei Messungen gibt
  const messreihe = z.docs.filter(d => d.werte?.length).sort(nachDatum);
  const groessen = [...new Set(messreihe.map(d => d.werte[0][0]))];
  for (const name of groessen) {
    const punkte = messreihe.map(d => ({ d: d.datum, w: d.werte.find(w => w[0] === name) })).filter(p => p.w)
      .map(p => ({ d: p.d, w: zahl(p.w[1]), grenze: obergrenze(p.w[3]), einheit: p.w[2] })).filter(p => !isNaN(p.w));
    if (punkte.length >= 2) extra += `<section class="panel"><div class="panel-kopf"><h2>Verlauf ${esc(name)}</h2><span class="small muted">${esc(punkte[0].einheit)}</span></div>${spark(punkte, punkte.at(-1).grenze)}</section>`;
  }
  const meds = (a.medikamente || []).filter(m => z.erk.some(e => e.id === m.erk));
  if (meds.length) extra += `<section class="panel"><div class="panel-kopf"><h2>Dauermedikation</h2></div><div class="liste">${meds.map(m => `<div class="zeile"><div class="grow"><div class="t">${esc(m.name)}</div><div class="s">${esc(m.dosierung)} · seit ${datum(m.seit)} · ${esc(m.grund)}</div></div><span class="pill st-chronisch">dauerhaft</span></div>`).join('')}</div></section>`;

  const kk = kat(a, k);
  return `${BEISPIEL()}<a class="zurueck" href="#faecher">${svg('links', 'width="16" height="16"')}Alle Fachbereiche</a>
  <div class="fach-kopf cat" ${catStyle(k)}>${mark(k, true)}<div class="grow"><h1>${esc(kk.name)}</h1><p class="muted" style="margin:2px 0 0">${z.aerzte.map(x => esc(x.name)).join(' · ') || 'Noch kein Arzt hinterlegt'}</p></div>
    <button class="btn klein" data-bearbeiten="kategorie:${k}">${svg('stift')}Bearbeiten</button></div>
  <div class="kennband">
    <div><b class="num">${z.erk.length}</b><span>Erkrankungen</span></div>
    <div><b class="num">${z.vergangen.length}</b><span>Termine bisher</span></div>
    <div><b class="num">${z.docs.length}</b><span>Dokumente</span></div>
    <div><b>${z.letzter ? datum(z.letzter.datum) : '–'}</b><span>Letzter Besuch</span></div>
  </div>
  <div class="grid2">
    <div class="stack">
      ${extra}
      <section class="panel"><div class="panel-kopf"><h2>Erkrankungen</h2><button class="link" data-neu="erkrankung" data-kat="${k}">+ Erfassen</button></div>
        ${z.erk.length ? `<div class="liste">${z.erk.sort((x, y) => y.von.localeCompare(x.von)).map(e => `<button class="zeile" data-erk="${e.id}"><div class="grow"><div class="t">${esc(e.titel)}</div>
          <div class="s">${datum(e.von)}${e.bis ? ' – ' + datum(e.bis) : ' – heute'}${e.icd ? ` · <span class="mono">${esc(e.icd)}</span>` : ''}</div></div><span class="pill st-${e.status}">${STATUS_ERKRANKUNG[e.status]}</span></button>`).join('')}</div>` : '<p class="muted small">Keine Einträge.</p>'}</section>
      <section class="panel"><div class="panel-kopf"><h2>Dokumente</h2><button class="link" data-neu="dokument" data-kat="${k}">+ Ablegen</button></div>
        ${z.docs.length ? `<div class="liste">${z.docs.sort(nachDatum).reverse().map(docZeile).join('')}</div>` : '<p class="muted small">Keine Dokumente.</p>'}</section>
    </div>
    <div class="stack">
      <section class="panel"><div class="panel-kopf"><h2>Termine</h2><button class="link" data-neu="termin" data-kat="${k}">+ Erfassen</button></div>
        ${[...z.kommend, ...z.vergangen.slice().reverse().slice(0, 4)].map(terminZeile).join('') ? `<div class="liste">${[...z.kommend, ...z.vergangen.slice().reverse().slice(0, 4)].map(terminZeile).join('')}</div>` : '<p class="muted small">Keine Termine.</p>'}</section>
      ${z.vorsorge.length ? `<section class="panel"><div class="panel-kopf"><h2>Vorsorge</h2></div><div class="liste">${z.vorsorge.map(v => { const l = vorsorgeLage(a, v); return `<button class="zeile" data-vorsorge="${v.id}"><div class="grow"><div class="t">${esc(v.name)}</div><div class="s">${esc(v.regel)}${l.faellig ? ' · fällig ' + datum(l.faellig) : ''}</div></div><span class="pill st-${l.status}">${V_TEXT[l.status]}</span></button>`; }).join('')}</div></section>` : ''}
      <section class="panel"><div class="panel-kopf"><h2>Praxen</h2><button class="link" data-neu="arzt" data-kat="${k}">+ Arzt</button></div>
        ${z.aerzte.length ? `<div class="liste">${z.aerzte.map(x => { const o = offen(x); return `<button class="zeile" data-arzt="${x.id}"><div class="grow"><div class="t">${esc(x.name)}</div><div class="s">${esc(x.adresse || '')}</div><div class="s num">${esc(x.tel || '')}</div></div>${o.unbekannt ? '' : `<span class="offen-status"><span class="dot ${o.offen ? 'offen' : 'zu'}"></span></span>`}</button>`; }).join('')}</div>` : '<p class="muted small">Noch kein Arzt in diesem Fachbereich.</p>'}</section>
    </div>
  </div>`;
}
const zahl = s => parseFloat(String(s).replace(/[^\d,.-]/g, '').replace(',', '.'));
/** Obere Grenze aus einem Referenzbereich: „< 4,0“ → 4, „0,4 – 4,0“ → 4, „> 40“ → keine. */
function obergrenze(ref) {
  const s = String(ref || '');
  if (/^\s*>/.test(s)) return NaN;
  const zahlen = s.match(/\d+(?:[,.]\d+)?/g);
  return zahlen ? parseFloat(zahlen.at(-1).replace(',', '.')) : NaN;
}
function spark(werte, grenze) {
  const W = 600, H = 90, pl = 34, pr = 74, pt = 12, pb = 22;
  const hatGrenze = !isNaN(grenze);
  const max = Math.max(hatGrenze ? grenze : 0, ...werte.map(w => w.w)) * 1.15 || 1;
  const x = i => pl + (i / Math.max(werte.length - 1, 1)) * (W - pl - pr);
  const y = v => pt + (1 - v / max) * (H - pt - pb);
  const linie = werte.map((w, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(w.w).toFixed(1)}`).join(' ');
  const letzte = werte.at(-1);
  const hoch = w => hatGrenze && w > grenze;
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Werteverlauf">
    ${hatGrenze ? `<line x1="${pl}" x2="${W - pr}" y1="${y(grenze)}" y2="${y(grenze)}" stroke="var(--crit)" stroke-dasharray="4 4" stroke-width="1"/>
    <text x="${W - pr + 6}" y="${y(grenze) + 4}" font-size="11" fill="var(--crit)">Grenze ${String(grenze).replace('.', ',')}</text>` : ''}
    <path d="${linie} L${x(werte.length - 1)},${H - pb} L${x(0)},${H - pb} Z" fill="var(--accent-soft)"/>
    <path d="${linie}" fill="none" stroke="var(--accent)" stroke-width="2.2"/>
    ${werte.map((w, i) => `<circle cx="${x(i)}" cy="${y(w.w)}" r="${i === werte.length - 1 ? 5 : 3.5}" fill="${hoch(w.w) ? 'var(--crit)' : 'var(--accent)'}"/>
      <text x="${x(i)}" y="${H - 6}" font-size="11" text-anchor="middle" fill="var(--muted)">${werte.length > 5 ? w.d.slice(5, 7) + '/' + w.d.slice(2, 4) : w.d.slice(0, 4)}</text>`).join('')}
    <text x="${x(werte.length - 1) + 9}" y="${y(letzte.w) + 4}" font-size="12" font-weight="700" fill="${hoch(letzte.w) ? 'var(--crit)' : 'var(--fg)'}">${String(letzte.w).replace('.', ',')}</text>
  </svg>`;
}

// ======================================================================
//  Termine
// ======================================================================
export const termineFilter = { modus: 'kommend' };
export function ansichtTermine() {
  const a = A();
  const kommend = a.termine.filter(t => tageBis(t.datum) >= 0).sort(nachDatum);
  const vergangen = a.termine.filter(t => tageBis(t.datum) < 0).sort(nachDatum).reverse();
  const liste = termineFilter.modus === 'kommend' ? kommend : vergangen;
  const monate = {};
  liste.forEach(t => (monate[t.datum.slice(0, 7)] ||= []).push(t));
  const jahr = heute().getFullYear();
  const diesesJahr = a.termine.filter(t => t.datum.startsWith(String(jahr)) && tageBis(t.datum) < 0);
  const proKat = {};
  diesesJahr.forEach(t => { const k = katVonTermin(a, t); if (k) proKat[k] = (proKat[k] || 0) + 1; });
  const maxK = Math.max(1, ...Object.values(proKat));
  return `${BEISPIEL()}
  <div class="kopf"><div><h1>Arzttermine</h1><p>Termine trägst du vorerst selbst ein. Ab Iteration 3 liest die App sie aus deinem Google Kalender und ordnet sie den Ärzten zu.</p></div>${neuKnopf('termin', 'Termin erfassen')}</div>
  <div class="grid2">
    <div class="stack">
      <div class="filter" role="group" aria-label="Zeitraum">
        <button data-tmodus="kommend" aria-pressed="${termineFilter.modus === 'kommend'}">Kommend (${kommend.length})</button>
        <button data-tmodus="vergangen" aria-pressed="${termineFilter.modus === 'vergangen'}">Vergangen (${vergangen.length})</button>
      </div>
      ${Object.keys(monate).map(m => `<section class="panel monat"><h3>${MON_LANG[+m.slice(5) - 1]} ${m.slice(0, 4)}</h3><div class="liste">${monate[m].map(terminZeile).join('')}</div></section>`).join('')
        || `<section class="panel">${leer(termineFilter.modus === 'kommend' ? 'Keine kommenden Termine.' : 'Noch keine vergangenen Termine erfasst.', 'termin', 'Termin erfassen')}</section>`}
    </div>
    <div class="stack">
      <section class="panel"><div class="panel-kopf"><h2>Arztbesuche ${jahr}</h2><span class="small muted num">${diesesJahr.length} bisher</span></div>
        ${Object.keys(proKat).length ? `<div class="balken">${Object.entries(proKat).sort((x, y) => y[1] - x[1]).map(([k, n]) => `<div class="balken-zeile cat" ${catStyle(k)}><span>${esc(kat(a, k).name)}</span><div class="spur"><i style="width:${(n / maxK) * 100}%"></i></div><b class="num">${n}</b></div>`).join('')}</div>` : '<p class="muted small">Noch keine Besuche in diesem Jahr.</p>'}</section>
    </div>
  </div>`;
}

// ======================================================================
//  Dokumente
// ======================================================================
export const docFilter = { suche: '', kat: '', typ: '', jahr: '' };
export function ansichtDokumente() {
  const a = A();
  const typen = [...new Set(a.dokumente.map(d => d.typ))].sort();
  const jahre = [...new Set(a.dokumente.map(d => d.datum.slice(0, 4)))].sort().reverse();
  const kats = a.kategorien.filter(k => a.dokumente.some(d => d.kat === k.id));
  let eingang = '';
  if (Z.modus === 'konto') {
    const e = Z.eingang;
    eingang = `<section class="stack" style="gap:12px"><div class="panel-kopf" style="margin:0"><h2>Eingang${e ? ` · ${e.length}` : ''}</h2>
      <button class="link" data-aktion="eingang">${Z.drive?.verbunden() ? 'Neu einlesen' : 'Verbinden und einlesen'}</button></div>
      ${e === null ? `<p class="muted small">${Z.drive?.verbunden() ? 'Wird gelesen …' : 'Nach dem Verbinden zeigt die App hier die Dateien aus Gesundheitsakte/00_Eingang.'}</p>`
        : e.length ? `<div class="eingang">${e.map(f => `<article class="eingang-karte">
          <div class="datei">${svg('datei')}<div style="min-width:0"><div class="mono">${esc(f.name)}</div><div class="small muted">${f.modifiedTime ? 'eingegangen ' + datum(f.modifiedTime.slice(0, 10)) : ''}${f.size ? ' · ' + Math.max(1, Math.round(f.size / 1024)) + ' KB' : ''}</div></div></div>
          <div class="knoepfe"><button class="btn primaer klein" data-einordnen="${f.id}">Einordnen</button>${f.webViewLink ? `<a class="btn klein" href="${esc(f.webViewLink)}" target="_blank" rel="noopener">Ansehen</a>` : ''}</div>
          </article>`).join('')}</div>`
        : `<p class="muted small">Leer. Dateien aus der TK-App oder vom Drive-Scanner landen hier, wenn du sie in <span class="mono">Gesundheitsakte/00_Eingang</span> speicherst. Die automatische Auswertung kommt in Iteration 5.</p>`}
    </section>`;
  }
  return `${BEISPIEL()}
  <div class="kopf"><div><h1>Dokumente</h1><p>${a.dokumente.length} Dokumente. Dateien liegen in Google Drive unter <span class="mono">Gesundheitsakte/10_Fachbereiche</span>, sortiert nach Fach.</p></div>${neuKnopf('dokument', 'Dokument ablegen')}</div>
  ${eingang}
  <section class="panel stack" style="gap:14px"><div class="panel-kopf" style="margin:0"><h2>Verzeichnis</h2><span class="small muted" id="doc-anzahl"></span></div>
    ${a.dokumente.length ? `<div class="felder">
      <div class="feld"><label for="f-suche">Suche</label><input id="f-suche" type="search" placeholder="Titel, Arzt, Inhalt …" value="${esc(docFilter.suche)}"></div>
      <div class="feld"><label for="f-kat">Fachbereich</label><select id="f-kat"><option value="">Alle</option>${kats.map(k => `<option value="${k.id}" ${docFilter.kat === k.id ? 'selected' : ''}>${esc(k.name)}</option>`).join('')}</select></div>
      <div class="feld"><label for="f-typ">Art</label><select id="f-typ"><option value="">Alle</option>${typen.map(t => `<option ${docFilter.typ === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>
      <div class="feld"><label for="f-jahr">Jahr</label><select id="f-jahr"><option value="">Alle</option>${jahre.map(j => `<option ${docFilter.jahr === j ? 'selected' : ''}>${j}</option>`).join('')}</select></div>
    </div><div id="doc-liste"></div>` : leer('Noch keine Dokumente abgelegt.', 'dokument', 'Erstes Dokument ablegen')}
  </section>`;
}
export function docListeZeichnen() {
  const ziel = document.getElementById('doc-liste'); if (!ziel) return;
  const a = A();
  const q = docFilter.suche.trim().toLowerCase();
  const liste = a.dokumente.filter(d => (!docFilter.kat || d.kat === docFilter.kat) && (!docFilter.typ || d.typ === docFilter.typ) && (!docFilter.jahr || d.datum.startsWith(docFilter.jahr))
    && (!q || [d.titel, d.kurz, d.typ, arzt(d.arzt)?.name, kat(a, d.kat).name].join(' ').toLowerCase().includes(q))).sort(nachDatum).reverse();
  document.getElementById('doc-anzahl').textContent = `${liste.length} von ${a.dokumente.length}`;
  ziel.innerHTML = `<div class="tabelle-wrap"><table><thead><tr><th>Datum</th><th>Dokument</th><th>Art</th><th>Fach</th><th>Arzt</th><th>Datei</th></tr></thead><tbody>
    ${liste.map(d => `<tr data-doc="${d.id}" tabindex="0"><td class="num">${datum(d.datum)}</td><td><b>${esc(d.titel)}</b></td><td>${esc(d.typ)}</td><td>${chip(d.kat)}</td><td>${esc(arzt(d.arzt)?.name || '–')}</td><td class="small muted">${d.driveId ? 'in Drive' : (d.quelle ? esc(d.quelle) : '–')}</td></tr>`).join('')}
    </tbody></table></div>
    <div class="doc-karten liste">${liste.map(docZeile).join('')}</div>
    ${liste.length ? '' : '<p class="muted">Keine Dokumente gefunden. Filter zurücksetzen oder anderen Suchbegriff versuchen.</p>'}`;
}

// ======================================================================
//  Vorsorge
// ======================================================================
export function ansichtVorsorge() {
  const a = A();
  const vs = a.vorsorge.map(v => ({ ...v, ...vorsorgeLage(a, v) })).sort((x, y) => V_RANG[x.status] - V_RANG[y.status] || (x.faellig || '9').localeCompare(y.faellig || '9'));
  const aktiv = vs.filter(v => v.status !== 'aus'), aus = vs.filter(v => v.status === 'aus');
  const bsp = vs.find(v => v.status === 'ueber' && arzt(v.arzt)) || vs.find(v => arzt(v.arzt));
  const al = alter(a);
  const zeile = v => {
    const ar = arzt(v.arzt);
    let aktion = '';
    if (['ueber', 'bald', 'unbekannt', 'ok'].includes(v.status)) aktion = `<button class="btn ${v.status === 'ueber' ? 'primaer' : ''} klein" data-erledigt="${v.id}">${v.status === 'unbekannt' ? 'Datum eintragen' : 'Erledigt am …'}</button>`;
    if (v.status === 'geplant') aktion = `<span class="small"><b>Termin ${datum(v.termin.datum)}</b></span>`;
    const faelligText = v.status === 'spaeter' ? 'ab ' + v.faellig.slice(0, 4) : v.einmalig ? 'einmalig, erledigt' : v.status === 'unbekannt' ? 'unbekannt' : datum(v.faellig);
    return `<div class="vorsorge-zeile"><span class="streifen st-${v.status}"></span>
      <button class="vz-name" data-vorsorge="${v.id}"><div class="t">${esc(v.name)}</div><div class="s">${esc(v.regel)}</div></button>
      <div class="s">Zuletzt: <b>${datum(v.zuletzt)}</b><br>Fällig: <b>${faelligText}</b></div>
      <div class="s">${ar ? `${esc(ar.name)}<br><span class="num">${esc(ar.tel || '')}</span>` : '<span class="muted">keine Praxis zugeordnet</span>'}</div>
      <div class="vz-aktion"><span class="pill st-${v.status}">${V_TEXT[v.status]}</span>${aktion}</div>
    </div>`;
  };
  return `${BEISPIEL()}
  <div class="kopf"><div><h1>Vorsorge</h1><p>${a.profil.jahrgang ? `Nach den Regeln der gesetzlichen Krankenkasse und der Impfempfehlungen für ${esc(a.profil.geschlecht || 'dich')}, ${al} Jahre, plus eigene Regeln.` : 'Bitte zuerst Jahrgang und Geschlecht im Profil eintragen.'} Mit „Erledigt am …“ trägst du die letzte Untersuchung ein, daraus berechnet die App die nächste.</p></div>${neuKnopf('vorsorge', 'Eigene Regel')}</div>
  <div class="stack" style="gap:10px">${aktiv.map(zeile).join('')}</div>
  ${aus.length ? `<details class="panel"><summary><b>Ausgeschaltet (${aus.length})</b> <span class="small muted">Vorschläge und Regeln, die du nicht brauchst</span></summary><div class="stack" style="gap:10px;margin-top:12px">${aus.map(zeile).join('')}</div></details>` : ''}
  <section class="panel grid2"><div><div class="panel-kopf"><h2>So wirst du erinnert</h2><span class="pill st-spaeter">ab Iteration 7</span></div>
    <p class="small" style="margin:0 0 12px">Sechs Wochen vor der Fälligkeit trägt die App einen Termin in deinen Google Kalender ein. Dein S26 meldet sich dann wie bei jedem anderen Termin. Sobald ein passender Arzttermin im Kalender steht, wird die Erinnerung entfernt.</p></div>
    ${bsp ? (() => { const ar = arzt(bsp.arzt); return `<div class="erinnerung"><div class="erinnerung-kopf">${svg('kalender')}Vorschau: Eintrag im Google Kalender</div>
      <div class="erinnerung-body"><b>Termin vereinbaren: ${esc(bsp.name)}</b><span class="small muted">Ganztägig · Erinnerung um 9:00 Uhr</span>
      <span class="small">${esc(ar.name)}<br>${esc(ar.adresse || '')}<br>Tel. <span class="num">${esc(ar.tel || '–')}</span></span>
      <span class="small">Sprechzeiten: ${Object.entries(ar.zeiten || {}).filter(([, z]) => z?.length).map(([t, z]) => WT_NAME[t] + ' ' + zeitenText(z)).join(' · ') || 'nicht hinterlegt'}</span></div></div>`; })() : ''}
  </section>`;
}

// ======================================================================
//  Ärzte
// ======================================================================
export function arztKarte(x, mitKnoepfen = true) {
  const o = offen(x);
  const heuteWt = WT[heute().getDay()];
  const tage = WOCHE.filter(t => t !== 'sa' || x.zeiten?.sa?.length);
  const route = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(x.name + ', ' + (x.adresse || ''));
  const web = x.web ? (/^https?:\/\//.test(x.web) ? x.web : 'https://' + x.web) : '';
  return `<article class="arzt">
    <div class="arzt-kopf">${mark(x.kat)}<div style="min-width:0" class="grow"><b>${esc(x.name)}</b><span class="small muted">${esc(x.fach || kat(A(), x.kat).name)}</span></div>
      ${mitKnoepfen ? `<button class="btn klein" data-bearbeiten="arzt:${x.id}" aria-label="Bearbeiten">${svg('stift')}</button>` : ''}</div>
    ${o.unbekannt ? '' : `<span class="offen-status"><span class="dot ${o.offen ? 'offen' : 'zu'}"></span>${esc(o.text)}</span>`}
    <div class="kontakt">
      ${x.adresse ? `${svg('ort')}<span>${esc(x.adresse)}</span><span></span>` : ''}
      ${x.tel ? `${svg('tel')}<a class="num" href="tel:${esc(x.tel.replace(/[^\d+]/g, ''))}">${esc(x.tel)}</a><button class="kopieren" data-copy="${esc(x.tel)}">Kopieren</button>` : ''}
      ${web ? `${svg('web')}<a href="${esc(web)}" target="_blank" rel="noopener">${esc(x.web)}</a><span></span>` : ''}
    </div>
    ${o.unbekannt ? '<p class="small muted" style="margin:0">Sprechzeiten nicht hinterlegt.</p>' : `<div class="zeiten">${tage.map(t => `<span class="${t === heuteWt ? 'heute' : ''}">${WT_NAME[t]}</span><span class="${t === heuteWt ? 'heute' : ''} ${x.aenderung?.tag === t ? 'geaendert' : ''}">${zeitenText(x.zeiten?.[t]) || 'geschlossen'}${x.aenderung?.tag === t ? ' · neu' : ''}</span>`).join('')}</div>`}
    ${x.notiz ? `<p class="small" style="margin:0">${esc(x.notiz)}</p>` : ''}
    <div class="sync">${svg('karte', 'width="14" height="14"')}${x.sync ? `Abgleich mit Google Maps am ${datum(x.sync)}` : 'Abgleich mit Google Maps ab Iteration 8'}${x.aenderung ? ` · <span class="pill st-bald">${WT_LANG[x.aenderung.tag]} geändert, vorher ${esc(x.aenderung.alt)}</span>` : ''}</div>
    <div class="knoepfe">${x.adresse ? `<a class="btn klein" href="${route}" target="_blank" rel="noopener">${svg('karte')}Route</a>` : ''}<a class="btn klein" href="#fach-${x.kat}">${esc(kat(A(), x.kat).name)}</a></div>
  </article>`;
}
export function ansichtAerzte() {
  const a = A();
  const reihenfolge = a.kategorien.map(k => k.id);
  return `${BEISPIEL()}
  <div class="kopf"><div><h1>Ärzte und Praxen</h1><p>${a.aerzte.length} Praxen. Ab Iteration 8 gleicht die App Adresse, Telefon und Sprechzeiten wöchentlich mit Google Maps ab.</p></div>${neuKnopf('arzt', 'Arzt hinzufügen')}</div>
  ${a.aerzte.length ? `<div class="aerzte">${[...a.aerzte].sort((x, y) => reihenfolge.indexOf(x.kat) - reihenfolge.indexOf(y.kat) || x.name.localeCompare(y.name)).map(x => arztKarte(x)).join('')}</div>`
    : `<section class="panel">${leer('Noch keine Ärzte erfasst. Am schnellsten geht es mit Name, Fachbereich und Telefonnummer, den Rest kannst du später ergänzen.', 'arzt', 'Ersten Arzt erfassen')}</section>`}`;
}

// ======================================================================
//  TK und Import
// ======================================================================
export function ansichtTK() {
  const a = A();
  const quartale = {};
  a.dokumente.filter(d => d.typ === 'TK-Abrechnung').forEach(d => { const m = d.titel.match(/(\d)\.\s*Quartal\s*(\d{4})/); if (m) (quartale[m[2]] ||= {})[m[1]] = true; });
  const jetztJ = heute().getFullYear(), jetztQ = Math.floor(heute().getMonth() / 3) + 1;
  const jahre = [jetztJ - 3, jetztJ - 2, jetztJ - 1, jetztJ];
  const zelle = (j, q) => {
    if (quartale[j]?.[q]) return '<span class="q st-ok">übernommen</span>';
    if (j > jetztJ || (j === jetztJ && q >= jetztQ)) return '<span class="q st-spaeter">–</span>';
    return '<span class="q st-bald">fehlt</span>';
  };
  const verbunden = Z.modus === 'konto' && Z.drive?.verbunden();
  const verb = [
    ['Google-Konto (privat)', Z.konto ? esc(Z.konto.email) : 'Anmeldung, nur du hast Zugriff', Z.modus === 'konto' ? (verbunden ? 'ok' : 'getrennt') : 2],
    ['Google Drive', 'Ablage und Datenbestand akte.json', Z.modus === 'konto' ? (verbunden ? 'ok' : 'getrennt') : 2],
    ['Google Kalender', 'Arzttermine lesen, Erinnerungen schreiben', 3],
    ['Befund-Auswertung (Claude)', 'Dokumente lesen, Kurzfassung, Werte, Einordnung', 5],
    ['Google Maps', 'Adressen, Telefon, Sprechzeiten', 8],
    ['Hintergrunddienst (Apps Script)', 'nachts: Eingang, Maps-Abgleich, Erinnerungen', 9],
  ];
  const pillVerb = s => s === 'ok' ? '<span class="pill st-ok">verbunden</span>' : s === 'getrennt' ? '<span class="pill st-bald">getrennt</span>' : `<span class="pill st-spaeter">Iteration ${s}</span>`;
  return `${BEISPIEL()}
  <div class="kopf"><div><h1>TK und Import</h1><p>Die TK bietet keine Schnittstelle, über die ein eigenes Programm die elektronische Patientenakte abrufen kann. Deshalb kommen die Daten über drei Wege in die Akte.</p></div></div>
  <div class="wege">
    <div class="weg"><span class="nr">Weg 1 · laufend</span><h3>Aus der TK-App teilen</h3><p>In der TK-App ein Dokument der Patientenakte öffnen, „Teilen“ antippen und Google Drive, Ordner <span class="mono">60 Gesundheit/Gesundheitsakte/00_Eingang</span> wählen. Unter Dokumente → Eingang ordnest du es ein.</p><span class="pill st-bald">am S26 noch zu prüfen</span></div>
    <div class="weg"><span class="nr">Weg 2 · vierteljährlich</span><h3>Behandlungsübersicht</h3><p>Die Abrechnungsdaten der TK enthalten jeden Arztkontakt mit Diagnosen (ICD-10). Als Dokument der Art „TK-Abrechnung“ mit Titel „TK-Behandlungsübersicht 2. Quartal 2026“ ablegen, dann erscheint es rechts.</p><span class="pill st-spaeter">Auswertung ab Iteration 6</span></div>
    <div class="weg"><span class="nr">Weg 3 · einmalig</span><h3>Auskunft für alle Jahre</h3><p>Leistungs- und Kostenauskunft nach § 305 SGB V bzw. Datenauskunft nach Art. 15 DSGVO bei der TK anfordern. Liefert die Historie, auch aus der Zeit vor der Patientenakte.</p><span class="pill st-spaeter">noch nicht angefordert</span></div>
  </div>
  <div class="grid2">
    <section class="panel"><div class="panel-kopf"><h2>Behandlungsübersichten</h2><span class="small muted">je Quartal</span></div>
      <div class="quartale"><span></span>${['Q1', 'Q2', 'Q3', 'Q4'].map(q => `<span class="label" style="text-align:center">${q}</span>`).join('')}
      ${jahre.map(j => `<b class="num">${j}</b>${[1, 2, 3, 4].map(q => zelle(j, q)).join('')}`).join('')}</div></section>
    <section class="panel verbindungen"><div class="panel-kopf"><h2>Verbindungen</h2></div>
      <div class="liste">${verb.map(([n, s, st]) => `<div class="zeile"><div class="grow"><div class="t">${n}</div><div class="s">${s}</div></div>${pillVerb(st)}</div>`).join('')}</div></section>
  </div>`;
}

// ======================================================================
//  Einstellungen und Mehr
// ======================================================================
export function ansichtEinstellungen() {
  const a = A();
  const p = a.profil;
  const verbunden = Z.modus === 'konto' && Z.drive?.verbunden();
  return `${BEISPIEL()}
  <div class="kopf"><div><h1>Einstellungen</h1></div></div>
  <div class="grid2">
    <div class="stack">
      <section class="panel"><div class="panel-kopf"><h2>Profil</h2><button class="link" data-bearbeiten="profil:">Bearbeiten</button></div>
        <dl class="meta-grid"><dt>Name</dt><dd>${esc(p.name || '–')}</dd><dt>Anrede</dt><dd>${esc(rufname(p) || '–')}</dd><dt>Jahrgang</dt><dd>${esc(p.jahrgang || '–')}</dd><dt>Geschlecht</dt><dd>${esc(p.geschlecht || '–')}</dd><dt>Krankenkasse</dt><dd>${esc(p.kasse || '–')}</dd></dl></section>
      <section class="panel"><div class="panel-kopf"><h2>Fachbereiche</h2>${neuKnopf('kategorie', 'Neu')}</div>
        <div class="liste">${a.kategorien.map(k => `<button class="zeile" data-bearbeiten="kategorie:${k.id}" style="align-items:center">${mark(k.id)}<div class="grow"><div class="t">${esc(k.name)}</div>
          <div class="s">${a.aerzte.filter(x => x.kat === k.id).length} Ärzte · ${a.erkrankungen.filter(x => x.kat === k.id).length} Erkrankungen · ${a.dokumente.filter(x => x.kat === k.id).length} Dokumente${k.kein_fach ? ' · nur für Dokumente' : ''}</div></div></button>`).join('')}</div></section>
    </div>
    <div class="stack">
      <section class="panel"><div class="panel-kopf"><h2>Speicherort</h2></div>
        ${Z.modus === 'konto' ? `<dl class="meta-grid"><dt>Konto</dt><dd>${esc(Z.konto.email)}</dd><dt>Verbindung</dt><dd>${verbunden ? 'verbunden' : 'getrennt'}</dd>
          <dt>Akte</dt><dd class="mono">60 Gesundheit/Gesundheitsakte/akte.json</dd><dt>Gespeichert</dt><dd>${Z.ungespeichert ? 'Änderungen noch nicht übertragen' : Z.zuletztGespeichert ? 'zuletzt ' + Z.zuletztGespeichert.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : 'aktuell'}</dd>
          <dt>Sicherungen</dt><dd>täglich in <span class="mono">90_Sicherungen</span>, die letzten 30 Tage</dd></dl>
          <div class="knoepfe" style="margin-top:14px">${verbunden ? '<button class="btn" data-aktion="trennen">Verbindung trennen</button>' : '<button class="btn primaer" data-aktion="verbinden">Verbinden</button>'}
          <button class="btn" data-aktion="export">Akte als Datei speichern</button><button class="btn" data-aktion="abmelden-loeschen">Abmelden und Daten von diesem Gerät entfernen</button></div>`
        : `<p class="small" style="margin:0 0 12px">Du siehst Beispieldaten. Nichts davon wird gespeichert.</p><div class="knoepfe">${googleDrive.eingerichtet() || new URLSearchParams(location.search).has('test') ? '<button class="btn primaer" data-aktion="verbinden">Mit Google verbinden</button>' : ''}<button class="btn" data-aktion="begruessung">Zur Startseite</button></div>`}
      </section>
      <section class="panel"><div class="panel-kopf"><h2>Daten übernehmen</h2></div>
        <p class="small" style="margin:0 0 12px">Ergänzt die Akte um Einträge aus einer Import-Datei (.json), z. B. aus dem OneNote-Gesundheitstagebuch. Vorhandenes wird nicht gelöscht, doppelte Einträge werden übersprungen. Vor der Übernahme siehst du, was hinzukommt.</p>
        <label class="btn" for="import-datei">${svg('hochladen')}Import-Datei wählen …</label>
        <input id="import-datei" type="file" accept=".json,application/json" hidden>
        ${(a.importe || []).length ? `<p class="small muted" style="margin:10px 0 0">Bisher übernommen: ${a.importe.map(i => `${esc(i.quelle)} (${datum(i.datum.slice(0, 10))})`).join(', ')}</p>` : ''}
      </section>
      <section class="panel"><div class="panel-kopf"><h2>Über</h2></div><p class="small" style="margin:0">Gesundheitsakte, Version ${VERSION} vom ${STAND}. Die App läuft ohne eigenen Server; alle Daten liegen in deinem Google Drive und zwischengespeichert in diesem Browser.</p></section>
    </div>
  </div>`;
}

export const MEHR_ZIELE = ['dokumente', 'vorsorge', 'aerzte', 'tk', 'einstellungen'];
export const NAV = [
  ['start', 'Übersicht'], ['verlauf', 'Krankheitsverlauf'], ['faecher', 'Fachbereiche'], ['termine', 'Termine'],
  ['dokumente', 'Dokumente'], ['vorsorge', 'Vorsorge'], ['aerzte', 'Ärzte'], ['tk', 'TK und Import'], ['einstellungen', 'Einstellungen'],
];
export function ansichtMehr() {
  const a = A();
  const ueber = a.vorsorge.filter(v => vorsorgeLage(a, v).status === 'ueber').length;
  const z = { dokumente: `${a.dokumente.length} Dokumente${Z.eingang?.length ? ` · ${Z.eingang.length} im Eingang` : ''}`, vorsorge: ueber ? `${ueber} überfällig` : 'alles im Blick', aerzte: `${a.aerzte.length} Praxen`, tk: 'Import und Verbindungen', einstellungen: 'Profil, Fachbereiche, Speicherort' };
  return `${BEISPIEL()}<div class="kopf"><div><h1>Mehr</h1></div></div>
  <section class="panel"><div class="liste">${MEHR_ZIELE.map(id => `<a class="zeile" href="#${id}" style="align-items:center"><span class="hinweis-icon" style="color:var(--accent)">${svg(id)}</span><div class="grow"><div class="t">${NAV.find(n => n[0] === id)[1]}</div><div class="s">${z[id]}</div></div></a>`).join('')}</div></section>`;
}

// ======================================================================
//  Detailblätter
// ======================================================================
const zuKnopf = `<button class="schliessen" data-zu aria-label="Schließen">${svg('zu')}</button>`;
export const blattKopf = (label, titel) => `<div class="blatt-kopf"><div><span class="label">${esc(label)}</span>${titel ? `<h2 style="font-size:1.35rem;margin-top:4px">${esc(titel)}</h2>` : ''}</div>${zuKnopf}</div>`;

export function blattDokument(id) {
  const a = A(); const d = finde(a, 'dokumente', id); if (!d) return null;
  const ar = arzt(d.arzt), e = erk(d.erk), link = dateiLink(d);
  return `${blattKopf(d.typ, d.titel)}
    <dl class="meta-grid">
      <dt>Datum</dt><dd>${datum(d.datum)}</dd><dt>Fach</dt><dd>${chip(d.kat)}</dd>
      <dt>Arzt</dt><dd>${ar ? esc(ar.name) : '–'}</dd>
      <dt>Erkrankung</dt><dd>${e ? esc(e.titel) + (e.icd ? ' <span class="mono">' + esc(e.icd) + '</span>' : '') : '–'}</dd>
      ${d.quelle ? `<dt>Quelle</dt><dd>${esc(d.quelle)}</dd>` : ''}
      <dt>Datei</dt><dd class="mono">${d.datei ? esc(d.datei) : d.driveId ? 'in Google Drive' : 'keine Datei hinterlegt'}</dd>
    </dl>
    ${d.kurz ? `<section class="ki"><span class="label">${svg('ki', 'width="14" height="14"')}${d.ki ? 'Auswertung' : 'Inhalt / Notiz'}</span><p>${esc(d.kurz)}</p></section>` : ''}
    ${d.werte?.length ? `<section class="panel" style="padding:12px"><div class="tabelle-wrap" style="display:block"><table><thead><tr><th>Wert</th><th>Ergebnis</th><th>Referenz</th></tr></thead><tbody>
      ${d.werte.map(([n, w, ein, ref, hoch]) => `<tr style="cursor:default"><td>${esc(n)}</td><td class="num ${hoch ? 'wert-hoch' : ''}">${esc(w)} ${esc(ein)}${hoch ? ' ↑' : ''}</td><td class="num muted">${esc(ref)}</td></tr>`).join('')}
    </tbody></table></div></section>` : ''}
    <div class="knoepfe">${link ? `<a class="btn primaer" href="${esc(link)}" target="_blank" rel="noopener">${svg('datei')}In Drive öffnen</a>` : ''}
      <button class="btn" data-bearbeiten="dokument:${d.id}">${svg('stift')}Bearbeiten</button></div>`;
}
export function blattArzt(id) {
  const x = arzt(id); if (!x) return null;
  const a = A();
  const termine = a.termine.filter(t => t.arzt === id).sort(nachDatum).reverse().slice(0, 5);
  return `${blattKopf('Praxis')}${arztKarte(x)}
    ${termine.length ? `<section class="panel"><div class="panel-kopf"><h2>Termine</h2></div><div class="liste">${termine.map(terminZeile).join('')}</div></section>` : ''}`;
}
export function blattErkrankung(id) {
  const e = erk(id); if (!e) return null;
  return `${blattKopf('Erkrankung')}<div class="ereignisse ohne-linie">${ereignisKarte(e)}</div>`;
}
export function blattTermin(id) {
  const a = A(); const t = finde(a, 'termine', id); if (!t) return null;
  const ar = arzt(t.arzt), k = katVonTermin(a, t), d = tag(t.datum);
  return `${blattKopf('Termin', t.titel)}
    <dl class="meta-grid"><dt>Wann</dt><dd>${WT_LANG[WT[d.getDay()]]}, ${datum(t.datum)}${t.zeit ? `, ${t.zeit} Uhr` : ''} · ${relativ(t.datum)}</dd>
      <dt>Arzt</dt><dd>${ar ? esc(ar.name) : 'nicht zugeordnet'}</dd><dt>Fach</dt><dd>${k ? chip(k) : '–'}</dd>
      ${t.notiz ? `<dt>Notiz</dt><dd>${esc(t.notiz)}</dd>` : ''}<dt>Quelle</dt><dd>${t.quelle === 'kalender' ? 'Google Kalender' : 'selbst erfasst'}</dd></dl>
    ${ar ? arztKarte(ar, false) : ''}
    <div class="knoepfe"><button class="btn primaer" data-bearbeiten="termin:${t.id}">${svg('stift')}Bearbeiten</button></div>`;
}
