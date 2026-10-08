// Bestellbare Artikel beim Lieferanten (WEBSTAR) – Artikelnummer, Bezeichnung und Produktbild
// stammen aus dem Lieferantenkatalog my.webstar.ch.
import { BILD_STREUSALZ, BILD_REGENERIERSALZ } from './artikelbilder.js';

export const LIEFERANT = { name: 'WEBSTAR', email: 'info@webstar.ch' };

export const ARTIKEL = {
  streusalz: {
    id: 'streusalz', kurz: 'Streusalz', nr: '14813',
    name: 'TAUFIX Streusalz, Schweizer Produkt gegen Schnee- und Eisglätte, weiss, pulverförmig, 25 kg, gebrauchsfertig',
    einheit: 'Sack à 25 kg · 32 Säcke pro Palette',
    bild: BILD_STREUSALZ,
    link: 'https://my.webstar.ch/taufix-streusalz-schweizer-produkt-gegen-schnee-und-eisglatte-weiss-pulverformig-25-kg-gebrauchsfertig-50-148130.html',
    freigabe: false            // geht sofort an den Lieferanten
  },
  regeneriersalz: {
    id: 'regeneriersalz', kurz: 'Regeneriersalz', nr: '17129',
    name: 'Reosal Regeneriersalz, weiss, fein, pH 7, 25 kg, gebrauchsfertig',
    einheit: 'Sack à 25 kg · 32 Säcke pro Palette',
    bild: BILD_REGENERIERSALZ,
    link: 'https://my.webstar.ch/reosal-regeneriersalz-weiss-fein-ph-7-25-kg-gebrauchsfertig-50-171290.html',
    freigabe: true             // erst nach Freigabe durch den Admin, mit Lieferdatum
  },
  leuchtmittel: {
    id: 'leuchtmittel', kurz: 'Leuchtmittel', bald: true   // in der App sichtbar, aber noch nicht wählbar
  }
};

export const bestellbar = id => !!(ARTIKEL[id] && !ARTIKEL[id].bald);
export const brauchtFreigabe = id => !!(ARTIKEL[id] && ARTIKEL[id].freigabe);
export const palettenText = n => `${String(n).replace('.', ',')} ${Number(String(n).replace(',', '.')) === 1 ? 'Palette' : 'Paletten'}`;
