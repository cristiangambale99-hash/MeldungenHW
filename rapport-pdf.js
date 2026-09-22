// Erstellt den Verwaltungsrapport als PDF auf dem Clean-Service-Briefpapier (A4).
// Masse gemäss Vorlage CSS_AG_Brief.dotm: Textbereich links 25 mm, rechts 45 mm, oben 50 mm, unten 30 mm.
//
// Seitenlogik:
//   - Der Rapport ist auf EINE Seite ausgelegt (Angaben, Beschrieb, Aufwand, Gruss).
//   - Abschnitte werden nie mitten getrennt: passt ein Abschnitt nicht mehr, beginnt eine
//     saubere Folgeseite mit Kopfzeile «… (Fortsetzung)».
//   - Fotos stehen unten auf Seite 1, wenn Platz ist; sonst auf einer eigenen Seite «Fotos».
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { FONT_REGULAR, FONT_BOLD, BRIEFPAPIER_PNG } from './ressourcen.js';

const MM = 72 / 25.4;
const A4 = [210 * MM, 297 * MM];
const LINKS = 25 * MM, BREITE = 140 * MM, OBEN = 50 * MM, UNTEN = 265 * MM;
const SCHWARZ = rgb(0.06, 0.12, 0.12), GRAU = rgb(0.37, 0.45, 0.45), LINIE = rgb(0.85, 0.89, 0.89), TUERKIS = rgb(0.169, 0.714, 0.718);
const GROESSE = 9.5, ZEILE = GROESSE * 1.42;
// Der Rapport geht als PDF per Mail (kein Fenstercouvert): Datum und Betreff rücken näher an den Empfänger.
const DATUM_Y = 80 * MM, BETREFF_Y = 92 * MM;
const b64 = s => Uint8Array.from(Buffer.from(s, 'base64'));

export async function erstelleRapportPdf(m) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const f = await pdf.embedFont(b64(FONT_REGULAR), { subset: true });
  const fb = await pdf.embedFont(b64(FONT_BOLD), { subset: true });
  const hintergrund = await pdf.embedPng(b64(BRIEFPAPIER_PNG));
  const pk = !!m.pikett;
  const titel = pk ? 'Rapport Pikettdienst' : 'Meldung Hauswartung';
  pdf.setTitle(`${titel} Nr. ${m.nr}`); pdf.setAuthor('Clean Service Scaramuzzo AG'); pdf.setSubject(`${m.objekt.strasse}, ${m.objekt.ort}`);

  let seite, y;
  const neueSeite = kopf => {
    seite = pdf.addPage(A4);
    seite.drawImage(hintergrund, { x: 0, y: 0, width: A4[0], height: A4[1] });
    y = OBEN;
    if (kopf) {                                   // saubere Folgeseite
      text(kopf, LINKS, y, { font: fb, size: 11 });
      text(`${m.objekt.strasse}${m.hausnr ? ' ' + m.hausnr : ''}, ${m.objekt.ort} · ${m.objekt.kunde || ''}`, LINKS, y + 17, { color: GRAU, size: 8.5 });
      y += 34; linie(LINKS, LINKS + BREITE, y, { dicke: 1, color: TUERKIS }); y += 8 * MM;
    }
  };
  const text = (t, x, yy, { font = f, size = GROESSE, color = SCHWARZ } = {}) =>
    seite.drawText(String(t), { x, y: A4[1] - yy - size * 0.8, size, font, color });
  const linie = (x1, x2, yy, { dicke = 0.5, color = LINIE } = {}) =>
    seite.drawLine({ start: { x: x1, y: A4[1] - yy }, end: { x: x2, y: A4[1] - yy }, thickness: dicke, color });
  const umbrechen = (t, font, size, breite) => {
    const zeilen = [];
    for (const abs of String(t || '').split(/\r?\n/)) {
      let z = '';
      for (const w of abs.split(/\s+/).filter(Boolean)) {
        const p = z ? z + ' ' + w : w;
        if (font.widthOfTextAtSize(p, size) <= breite) z = p; else { if (z) zeilen.push(z); z = w; }
      }
      zeilen.push(z);
    }
    return zeilen;
  };

  /* ---------- Abschnitte: jeder kennt seine Höhe und zeichnet sich an y ---------- */
  const abschnitte = [];
  const add = (hoehe, zeichnen) => abschnitte.push({ hoehe, zeichnen });

  // Anrede + Einleitung
  const einleitung = umbrechen(pk ? 'Gerne informieren wir Sie über den folgenden Pikett-Einsatz in Ihrer Liegenschaft.'
                                  : 'Gerne informieren wir Sie über die folgende Feststellung unserer Hauswartung in Ihrer Liegenschaft.', f, GROESSE, BREITE);
  add(ZEILE + 2.5 * MM + einleitung.length * ZEILE + 3.5 * MM, () => {
    text('Sehr geehrte Damen und Herren', LINKS, y); y += ZEILE + 2.5 * MM;
    einleitung.forEach(z => { text(z, LINKS, y); y += ZEILE; }); y += 3.5 * MM;
  });

  // Angaben
  const WERT_X = LINKS + 40 * MM, WERT_B = BREITE - 40 * MM;
  const zeilen = [
    ['Objekt', `${m.objekt.strasse}${m.hausnr ? ', Hausnummer ' + m.hausnr : ''}, ${m.objekt.ort} (Obj. ${m.objekt.nr})`],
    ['Stockwerk', m.stockwerk], ['Bereich', m.bereich],
    ['Art der Meldung', pk ? '' : m.unterart],
    ['Auftrag erteilt von', pk ? m.pikett.auftraggeber : ''],
    [pk ? 'Einsatz am' : 'Festgestellt am', pk ? m.pikett.datum : m.gemeldetDatum],
    ['Hauswart', m.hauswart]
  ].filter(([, v]) => v).map(([k, v]) => [k, umbrechen(v, f, GROESSE, WERT_B)]);
  const zeilenHoehe = w => w.length * ZEILE + 5.5;
  add(zeilen.reduce((s, [, w]) => s + zeilenHoehe(w), 0) + 5 * MM, () => {
    for (const [k, w] of zeilen) {
      text(k, LINKS, y + 2.8, { color: GRAU });
      w.forEach((z, i) => text(z, WERT_X, y + 2.8 + i * ZEILE));
      y += zeilenHoehe(w); linie(LINKS, LINKS + BREITE, y);
    }
    y += 5 * MM;
  });

  // Beschreibung (lange Texte dürfen am Zeilenende umbrechen, mit Fortsetzungsseite)
  const beschrieb = umbrechen(m.textDe || '—', f, GROESSE, BREITE);
  const beschriebTitel = pk ? 'Einsatzbeschrieb' : 'Beschreibung';
  add(16 + beschrieb.length * ZEILE + 5 * MM, (platzBis) => {
    text(beschriebTitel, LINKS, y, { font: fb }); y += 16;
    for (let i = 0; i < beschrieb.length; i++) {
      if (y + ZEILE > platzBis) { neueSeite(`${titel} · Nr. ${m.nr} (Fortsetzung)`); text(beschriebTitel + ' (Fortsetzung)', LINKS, y, { font: fb }); y += 16; }
      text(beschrieb[i], LINKS, y); y += ZEILE;
    }
    y += 5 * MM;
  }, true);
  abschnitte[abschnitte.length - 1].teilbar = true;

  // Aufwand (Pikett)
  if (pk) {
    const reihen = [[`Einsatz ${m.pikett.datum}, ${m.pikett.von} – ${m.pikett.bis} Uhr`, m.pikett.dauerKurz]];
    if (m.pikett.adminKurz) reihen.push(['Administrativer Aufwand', m.pikett.adminKurz]);
    reihen.push(['Total verrechenbar', m.pikett.totalKurz, true]);
    add(16 + reihen.length * 20 + 5 * MM, () => {
      text('Aufwand', LINKS, y, { font: fb }); y += 16;
      for (const [k, v, fett] of reihen) {
        const fo = fett ? fb : f;
        text(k, LINKS, y + 3.5, { font: fo }); text(v, LINKS + BREITE - fo.widthOfTextAtSize(v, GROESSE), y + 3.5, { font: fo });
        y += 20; linie(LINKS, LINKS + BREITE, y, fett ? { dicke: 1.4, color: TUERKIS } : {});
      }
      y += 5 * MM;
    });
  }

  // Gruss – bleibt immer beim letzten Abschnitt, steht nie allein auf einer Seite
  const GRUSS_H = ZEILE * 3 + 5 * MM;
  const gruss = () => {
    text('Freundliche Grüsse', LINKS, y); y += ZEILE + 5 * MM;
    text('Clean Service Scaramuzzo AG', LINKS, y); y += ZEILE;
    text('Hauswartung', LINKS, y, { size: 7.5 }); y += ZEILE;
  };
  const letzter = abschnitte[abschnitte.length - 1], altZeichnen = letzter.zeichnen;
  letzter.hoehe += GRUSS_H; letzter.gruss = true;
  letzter.zeichnen = bis => {
    altZeichnen(bis - (letzter.teilbar ? GRUSS_H : 0));
    if (fotosAufSeite1) { text('Fotos', LINKS, y, { font: fb }); y += 16; fotoReihe(KLEIN, 4); }
    if (y + GRUSS_H > UNTEN) neueSeite(`${titel} · Nr. ${m.nr} (Fortsetzung)`);
    gruss();
  };

  /* ---------- Fotos vorbereiten ---------- */
  const bilder = [];
  for (const src of (m.fotos || []).slice(0, 4)) {
    try {
      const t = /^data:image\/(jpeg|jpg|png);base64,(.+)$/.exec(src || ''); if (!t) continue;
      bilder.push(t[1] === 'png' ? await pdf.embedPng(b64(t[2])) : await pdf.embedJpg(b64(t[2])));
    } catch (e) { /* ungültiges Bild überspringen */ }
  }
  const fotoReihe = (box, spalten) => {
    let x = LINKS, startY = y;
    bilder.forEach((img, i) => {
      if (i && i % spalten === 0) { x = LINKS; startY += box + 4 * MM; }
      const sk = Math.min(box / img.width, box / img.height), w = img.width * sk, h = img.height * sk;
      seite.drawImage(img, { x: x + (box - w) / 2, y: A4[1] - startY - box + (box - h) / 2, width: w, height: h });
      seite.drawRectangle({ x, y: A4[1] - startY - box, width: box, height: box, borderColor: LINIE, borderWidth: 0.5 });
      x += box + 4 * MM;
    });
    y = startY + box + 5 * MM;
  };
  const KLEIN = 30 * MM, fotoHoehe = 16 + KLEIN + 5 * MM;
  const START_Y = BETREFF_Y + 11 * MM;
  const textHoehe = abschnitte.reduce((s2, a) => s2 + a.hoehe, 0);
  // Fotos klein auf Seite 1 (vor dem Gruss), wenn alles zusammen auf eine Seite passt
  const fotosAufSeite1 = bilder.length && START_Y + textHoehe + fotoHoehe <= UNTEN;
  if (fotosAufSeite1) letzter.hoehe += fotoHoehe;   // Fotos stehen dann direkt vor dem Gruss

  /* ---------- Seite 1: Briefkopf an den Positionen der Word-Vorlage ---------- */
  neueSeite();
  const absender = 'Clean Service Scaramuzzo AG, Industriestrasse 5, 8307 Effretikon';
  text(absender, LINKS, y, { size: 6.5 });
  linie(LINKS, LINKS + f.widthOfTextAtSize(absender, 6.5), y + 9, { dicke: 0.6, color: SCHWARZ });
  text(m.objekt.kunde || 'Verwaltung', LINKS, 55 * MM, { font: fb });
  if (m.objekt.email) text(m.objekt.email, LINKS, 55 * MM + 13.5);
  text(`Effretikon, ${m.heute}`, LINKS, DATUM_Y);
  text(`${titel} · Nr. ${m.nr}`, LINKS, BETREFF_Y, { font: fb, size: 12 });
  y = START_Y;

  /* ---------- Abschnitte setzen, nie mitten trennen ---------- */
  for (const a of abschnitte) {
    if (y + a.hoehe > UNTEN) {
      // Teilbarer Text läuft weiter, solange noch mindestens 4 Zeilen Platz haben; sonst saubere neue Seite
      const restPlatz = UNTEN - y;
      if (!a.teilbar || restPlatz < 16 + 4 * ZEILE) neueSeite(`${titel} · Nr. ${m.nr} (Fortsetzung)`);
    }
    a.zeichnen(UNTEN);
  }

  /* ---------- Sonst: Fotos auf eigener, sauberer Seite (2 × 2 gross) ---------- */
  if (bilder.length && !fotosAufSeite1) { neueSeite(`Fotos zu ${titel} Nr. ${m.nr}`); fotoReihe(68 * MM, 2); }

  return Buffer.from(await pdf.save());
}
