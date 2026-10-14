// Text der Bestätigung, die der Hauswart nach dem Absenden im Beekeeper-Chat erhält.
// Kurz, in ganzen Sätzen und immer gleich aufgebaut: Dank mit Nummer, Objekt, das Wichtigste, Abschluss.
import { palettenText } from './artikel.js';

const vorname = hwName => {
  const t = String(hwName || '').split(',');
  return (t.length > 1 ? t[1] : t[0]).trim().split(' ')[0] || '';
};
const anrede = (m, satz) => `${vorname(m.hauswart) ? 'Danke ' + vorname(m.hauswart) + ', ' : 'Danke, '}${satz}`;
// Absätze: leere Zeilen trennen die Blöcke, leere Angaben fallen weg
const bloecke = l => l.map(b => (Array.isArray(b) ? b.filter(z => String(z || '').trim()).join('\n') : String(b || '')))
  .filter(b => b.trim()).join('\n\n');
// Hausnummer nur, wenn sie nicht schon in der Strasse steht
const objektZeile = m => {
  const st = String(m.objekt.strasse || '').trim();
  const nr = String(m.hausnr || '').trim();
  const doppelt = nr && new RegExp(`(^|\\s)${nr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`).test(st);
  return `${st}${nr && !doppelt ? ' ' + nr : ''}, ${m.objekt.ort}`;
};
const fotoText = n => (n === 1 ? '1 Foto' : `${n} Fotos`);

// m: Mail-Daten aus lib/meldung.js → mailDaten()
export function chatText(m) {
  const art = m.artId;
  const nr = m.nr;
  const fotos = (m.fotos || []).length;

  if (art === 'pikett') {
    return bloecke([
      anrede(m, `dein Pikett-Einsatz Nr. ${nr} ist erfasst.`),
      [objektZeile(m), [m.bereich, m.stockwerk].filter(Boolean).join(', '),
       `${m.pikett.datum}, ${m.pikett.von} – ${m.pikett.bis} Uhr`,
       `Verrechenbar: ${m.pikett.dauerKurz}`],
      'Der Rapport ist an die Verwaltung gegangen. Du findest ihn hier als PDF.'
    ]);
  }

  if (art === 'zaehler') {
    return bloecke([
      anrede(m, `die Zählerstände Nr. ${nr} sind erfasst.`),
      [objektZeile(m), m.zeitpunkt ? `Abgelesen am ${m.zeitpunkt}` : ''],
      (m.zaehler || []).map(z => `${z.name}: ${z.wert} ${z.einheit}`),
      'Die Aufstellung ist an die Verwaltung gegangen. Du findest sie hier als PDF.'
    ]);
  }

  if (art === 'jahr') {
    return bloecke([
      anrede(m, `die Bestätigung Nr. ${nr} ist erfasst.`),
      [objektZeile(m), `Ausgeführte Arbeit: ${m.unterart}`, fotos ? `Nachweis: ${fotoText(fotos)}` : ''],
      'Die Verwaltung hat die Bestätigung mit deinen Fotos erhalten. Du findest sie hier als PDF.'
    ]);
  }

  if (art === 'intern') {
    return bloecke([
      anrede(m, `deine interne Meldung Nr. ${nr} ist erfasst.`),
      [objektZeile(m), m.unterart, m.zeitpunkt],
      'Die Hauswartung hat sie erhalten.'
    ]);
  }

  if (art === 'bestellung') {
    const a = m.artikel || {};
    const menge = m.paletten ? palettenText(m.paletten) : '';
    if (m.stand === 'bestellt') {
      return bloecke([
        anrede(m, `deine Bestellung Nr. ${nr} ist raus.`),
        [`${menge} ${a.kurz || ''}`.trim(), a.nr ? `Artikel-Nr. ${a.nr}` : '',
         `Lieferadresse: ${m.objekt.strasse}, ${m.objekt.ort}`,
         m.lieferdatumText ? `Gewünschtes Lieferdatum: ${m.lieferdatumText}` : ''],
        'Der Bestellschein ist an den Lieferanten gegangen. Du findest ihn hier als PDF.'
      ]);
    }
    return bloecke([
      anrede(m, `deine Bestellung Nr. ${nr} ist erfasst.`),
      [`${menge} ${a.kurz || ''}`.trim(), a.nr ? `Artikel-Nr. ${a.nr}` : '',
       `Lieferadresse: ${m.objekt.strasse}, ${m.objekt.ort}`],
      'Die Hauswartung trägt das Lieferdatum ein und gibt die Bestellung beim Lieferanten frei. Du bekommst hier eine Nachricht, sobald sie raus ist.'
    ]);
  }

  // Meldung (Verwaltung)
  return bloecke([
    anrede(m, `deine Meldung Nr. ${nr} ist erfasst.`),
    [objektZeile(m), [m.bereich, m.stockwerk].filter(Boolean).join(', '),
     [m.unterart, m.massnahmeText].filter(Boolean).join(' · ')],
    'Der Rapport ist an die Verwaltung gegangen. Du findest ihn hier als PDF.'
  ]);
}

/* Zweite Nachricht, sobald der Admin eine Bestellung freigegeben hat */
export function chatTextFreigabe(m) {
  const a = m.artikel || {};
  const menge = m.paletten ? palettenText(m.paletten) : '';
  const v = vorname(m.hauswart);
  return bloecke([
    `${v ? v + ', d' : 'D'}eine Bestellung Nr. ${m.nr} ist beim Lieferanten.`,
    [`${menge} ${a.kurz || ''}`.trim(), a.nr ? `Artikel-Nr. ${a.nr}` : '',
     m.lieferdatumText ? `Gewünschtes Lieferdatum: ${m.lieferdatumText}` : '',
     `Lieferadresse: ${m.objekt.strasse}, ${m.objekt.ort}`],
    'Die Hauswartung hat die Bestellung freigegeben. Du findest den Bestellschein hier als PDF.'
  ]);
}

/* Nachricht, wenn eine Bestellung abgelehnt wurde */
export function chatTextAblehnung(m) {
  const a = m.artikel || {};
  const menge = m.paletten ? palettenText(m.paletten) : '';
  const v = vorname(m.hauswart);
  return bloecke([
    `${v ? v + ', d' : 'D'}eine Bestellung Nr. ${m.nr} wurde nicht ausgelöst.`,
    [`${menge} ${a.kurz || ''}`.trim(), `Lieferadresse: ${m.objekt.strasse}, ${m.objekt.ort}`],
    `Grund: ${m.ablehnGrund}`,
    'Bei Fragen melde dich bei der Hauswartung.'
  ]);
}
