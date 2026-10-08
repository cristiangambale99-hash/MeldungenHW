// Versand einer Bestellung: Bestellschein als PDF, Mail an die Hauswartung und – sobald freigegeben –
// an den Lieferanten (info@webstar.ch).
//
//   Streusalz:       geht sofort an beide.
//   Regeneriersalz:  geht zuerst nur an die Hauswartung («Wartet auf Freigabe»). Trägt der Admin das
//                    Lieferdatum ein und gibt frei, geht der Bestellschein an den Lieferanten.
import { versendeMail } from './mailversand.js';
import { lieferantMail, internMail } from './bestellmail.js';
import { erstelleBestellPdf } from './bestellung-pdf.js';
import { ARTIKEL, LIEFERANT, palettenText } from './artikel.js';

const dateiName = (b) => `Bestellung_${b.nr}_${b.artikel.kurz}_${String(b.objekt.strasse || '').replace(/[^A-Za-z0-9ÄÖÜäöü]+/g, '_')}.pdf`;

// m: gespeicherte Meldung (art 'bestellung') · o: Objekt aus der Datenbank
export function bestellDaten(m, o) {
  const artikel = ARTIKEL[m.unterart];
  return {
    nr: m.nr, artikel, lieferant: LIEFERANT,
    mengeText: palettenText(m.paletten),
    lieferdatum: m.lieferdatum || null,
    objekt: { strasse: o.strasse, ort: o.ort, nr: m.objekt, kunde: o.kunde || '' },
    besteller: m.hwName || '', freigegebenVon: m.freigabeVon || '',
    stand: m.stand || 'offen',
    heute: new Date().toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Zurich' })
  };
}

/* Eingang bei der Hauswartung – ohne PDF, solange die Freigabe fehlt */
export async function sendeIntern(b) {
  const an = process.env.MAIL_TO || 'hauswartung@clean-service.ch';
  const m = internMail(b);
  const anhaenge = [];
  if (b.stand === 'bestellt') {
    try { anhaenge.push({ filename: dateiName(b), content: await erstelleBestellPdf(b), contentType: 'application/pdf' }); }
    catch (e) { console.error('Bestell-PDF', e); }
  }
  return versendeMail({ an, betreff: m.betreff, html: m.html, text: m.text, anhaenge });
}

/* Bestellung an den Lieferanten – immer mit Bestellschein */
export async function sendeLieferant(b) {
  if (process.env.LIEFERANT_DIREKT === 'aus') return 'abgeschaltet';
  const m = lieferantMail(b);
  const anhaenge = [{ filename: dateiName(b), content: await erstelleBestellPdf(b), contentType: 'application/pdf' }];
  await versendeMail({ an: LIEFERANT.email, betreff: m.betreff, html: m.html, text: m.text, anhaenge });
  return 'gesendet';
}

/* Neue Bestellung vom Handy */
export async function versendeBestellung(m, o) {
  const b = bestellDaten(m, o);
  const ergebnis = { ok: true, lieferant: 'wartet_auf_freigabe' };
  if (b.stand === 'bestellt') {
    try { ergebnis.lieferant = await sendeLieferant(b); }
    catch (e) { console.error('Lieferant', e); ergebnis.lieferant = 'fehler'; }
  }
  ergebnis.via = await sendeIntern(b);
  return ergebnis;
}

/* Freigabe durch den Admin: Bestellschein mit Lieferdatum an den Lieferanten */
export async function versendeFreigabe(m, o) {
  const b = bestellDaten(m, o);
  b.stand = 'bestellt';
  const ergebnis = { ok: true, lieferant: 'fehler' };
  ergebnis.lieferant = await sendeLieferant(b);
  try { ergebnis.via = await sendeIntern(b); } catch (e) { console.error('Kopie', e); }
  return ergebnis;
}
