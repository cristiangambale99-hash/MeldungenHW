// Mailtexte für Bestellungen beim Lieferanten – gleiche Gestaltung wie die übrigen Mails der App.
//
//   lieferantMail(b)  Bestellung an den Lieferanten (info@webstar.ch), Bestellschein als PDF im Anhang
//   internMail(b)     Kopie bzw. Eingang für die Hauswartung (hauswartung@clean-service.ch)
//
// b: { nr, artikel, mengeText, lieferdatum (ISO oder leer), objekt:{strasse, ort, nr, kunde},
//      besteller, freigegebenVon, stand: 'offen' | 'bestellt' }
import { csRahmen, csTabelle, csKasten, esc } from './mailversand.js';
import { datumLang, datumKurz } from './bestellung-pdf.js';

const GRAU = '#767676';
const kopf = t => `<div style="font-family:Verdana,Geneva,sans-serif;font-size:11px;color:${GRAU};letter-spacing:.1em;margin:0 0 6px;">${t}</div>`;

export function lieferantMail(b) {
  const a = b.artikel;
  const betreff = `Bestellung Nr. ${b.nr} · ${a.kurz} · ${b.mengeText}`
    + (b.lieferdatum ? ` · Lieferung ${datumKurz(b.lieferdatum)}` : '')
    + ` · ${b.objekt.strasse}, ${b.objekt.ort}`;
  const inhalt = `
    <p style="margin:0 0 16px;">Sehr geehrte Damen und Herren</p>
    <p style="margin:0 0 20px;">Gerne bestellen wir bei Ihnen die folgende Ware.${b.lieferdatum
      ? ` Wir bitten Sie um Lieferung am <strong>${esc(datumLang(b.lieferdatum))}</strong>.`
      : ' Wir bitten Sie um Lieferung zum nächstmöglichen Termin.'} Den Bestellschein finden Sie als PDF im Anhang.</p>
    ${csKasten('BESTELLUNG NR. ' + esc(b.nr), `${esc(b.mengeText)} · ${esc(a.kurz)}`, `Artikel-Nr. ${esc(a.nr)}`)}
    ${csTabelle([
      ['Artikel-Nr.', esc(a.nr)],
      ['Bezeichnung', esc(a.name)],
      ['Gebinde', esc(a.einheit)],
      ['Menge', esc(b.mengeText)],
      ['Gewünschtes Lieferdatum', b.lieferdatum ? `<span style="color:#12797A;">${esc(datumLang(b.lieferdatum))}</span>` : ''],
      ['Lieferadresse', `${esc(b.objekt.strasse)}, ${esc(b.objekt.ort)}`],
      ['Bestellnummer', esc(b.nr)]
    ])}
    <p style="margin:0 0 14px;">Bitte geben Sie die Bestellnummer auf dem Lieferschein an. Für Rückfragen erreichen Sie unsere Hauswartung unter 0844 355 355.</p>
    <p style="margin:0;">Besten Dank und freundliche Grüsse</p>`;
  const html = csRahmen(`Bestellung Nr. ${esc(b.nr)}`, inhalt,
    'Antworten auf diese Nachricht gehen direkt an unsere Hauswartung (hauswartung@clean-service.ch).')
    .replace('Hauswartung<br>Meldung aus der App', 'Hauswartung<br>Bestellung');
  const text = [`Sehr geehrte Damen und Herren`, '',
    `Gerne bestellen wir bei Ihnen die folgende Ware.${b.lieferdatum ? ` Wir bitten Sie um Lieferung am ${datumLang(b.lieferdatum)}.` : ' Wir bitten Sie um Lieferung zum nächstmöglichen Termin.'} Den Bestellschein finden Sie als PDF im Anhang.`, '',
    `Bestellnummer: ${b.nr}`, `Artikel-Nr.: ${a.nr}`, `Bezeichnung: ${a.name}`, `Gebinde: ${a.einheit}`, `Menge: ${b.mengeText}`,
    b.lieferdatum ? `Gewünschtes Lieferdatum: ${datumLang(b.lieferdatum)}` : '',
    `Lieferadresse: ${b.objekt.strasse}, ${b.objekt.ort}`, '',
    'Bitte geben Sie die Bestellnummer auf dem Lieferschein an. Für Rückfragen erreichen Sie unsere Hauswartung unter 0844 355 355.', '',
    'Besten Dank und freundliche Grüsse', 'Clean Service Scaramuzzo AG · Hauswartung',
    'Industriestrasse 5 · 8307 Effretikon · 0844 355 355'].filter(z => z !== '').join('\n');
  return { betreff, html, text };
}

export function internMail(b) {
  const a = b.artikel;
  const offen = b.stand === 'offen';
  const betreff = `Bestellung ${b.nr} · ${a.kurz} · ${b.mengeText} · ${b.objekt.strasse}, ${b.objekt.ort}`
    + (offen ? ' · Freigabe nötig' : '');
  const inhalt = `
    <p style="margin:0 0 18px;">${offen
      ? 'Ein Hauswart hat die folgende Bestellung erfasst. Sie geht erst an den Lieferanten, wenn im Admin das Lieferdatum eingetragen und die Bestellung freigegeben wurde.'
      : 'Die folgende Bestellung wurde soeben an den Lieferanten gesendet. Der Bestellschein liegt als PDF bei.'}</p>
    ${csKasten(offen ? 'WARTET AUF FREIGABE' : 'BEIM LIEFERANTEN BESTELLT',
      `${esc(b.mengeText)} · ${esc(a.kurz)}`,
      `${esc(b.objekt.strasse)} · ${esc(b.objekt.ort)} · Obj. ${esc(b.objekt.nr)}`)}
    ${csTabelle([
      ['Bestellnummer', esc(b.nr)],
      ['Artikel', `${esc(a.kurz)} (Art.-Nr. ${esc(a.nr)})`],
      ['Menge', esc(b.mengeText)],
      ['Gewünschtes Lieferdatum', b.lieferdatum ? esc(datumLang(b.lieferdatum)) : (offen ? 'noch offen – im Admin eintragen' : '')],
      ['Lieferadresse', `${esc(b.objekt.strasse)}, ${esc(b.objekt.ort)}`],
      ['Kunde', esc(b.objekt.kunde || '')],
      ['Lieferant', 'WEBSTAR · info@webstar.ch'],
      ['Bestellt durch', esc(b.besteller)],
      ['Freigegeben durch', esc(b.freigegebenVon || '')]
    ])}
    ${offen ? `<p style="margin:0;">Im Admin unter «Bestellungen» kannst du das Lieferdatum eintragen und die Bestellung freigeben – oder sie mit einem kurzen Grund ablehnen.</p>` : ''}`;
  const html = csRahmen(`${offen ? 'Neue Bestellung' : 'Bestellung gesendet'} · Nr. ${esc(b.nr)}`, inhalt,
    (offen ? '' : 'Beilage: Bestellschein als PDF<br>') + 'Diese Nachricht wurde automatisch aus der Hauswartungs-App erstellt.');
  const text = [`Bestellung Nr. ${b.nr} · ${a.kurz}`, '', `Menge: ${b.mengeText}`, `Artikel-Nr.: ${a.nr}`,
    b.lieferdatum ? `Gewünschtes Lieferdatum: ${datumLang(b.lieferdatum)}` : (offen ? 'Lieferdatum: noch offen' : ''),
    `Lieferadresse: ${b.objekt.strasse}, ${b.objekt.ort}`, `Bestellt durch: ${b.besteller}`, '',
    offen ? 'Die Bestellung geht erst nach der Freigabe im Admin an den Lieferanten.' : 'Die Bestellung wurde an info@webstar.ch gesendet.'
  ].filter(Boolean).join('\n');
  return { betreff, html, text };
}
