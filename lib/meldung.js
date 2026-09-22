// Meldungen: Eingaben prüfen, deutsche Bezeichnungen und Mail-/PDF-Daten aufbereiten (serverseitig).
export const ADMIN_MIN_PIKETT = 0;   // Adminaufwand pro Pikett-Einsatz – aktuell NICHT verrechnet (später 30)
const MIT_ADMIN = ADMIN_MIN_PIKETT > 0;

const ORTE = { mieter: 'Mieter', treppenhaus: 'Treppenhaus', waschkueche: 'Waschküche', technikraum: 'Technikraum', veloraum: 'Veloraum',
  keller: 'Keller', umgebung: 'Umgebung', garten: 'Garten', tiefgarage: 'Tiefgarage', andere: 'Andere' };
const BEREICHE = { '6og': '6. OG', '5og': '5. OG', '4og': '4. OG', '3og': '3. OG', '2og': '2. OG', '1og': '1. OG', eg: 'EG',
  '1ug': '1. UG', '2ug': '2. UG', '3ug': '3. UG', aussen: 'Aussenbereich' };
const UNTERARTEN = {
  verwaltung: { abfall: 'Abfall', schaden: 'Schaden', defekt: 'Defekt', unordnung: 'Unordnung', andere: 'Andere' },
  intern: { winterschnitt: 'Winterschnitt', sommerschnitt: 'Sommerschnitt', jaeten: 'Jäten', fensterreinigung: 'Fensterreinigung',
    garagenreinigung: 'Garagenreinigung', heizung: 'Heizung', rohrreinigung: 'Rohrreinigung', andere: 'Andere' }
};
const ARTEN = { verwaltung: 'Meldung (Verwaltung)', pikett: 'Pikettdienst (Verwaltung)', intern: 'Meldung intern' };

const txt = (v, max = 200) => String(v ?? '').replace(/\s+$/g, '').trim().slice(0, max);
const istDatum = s => /^\d{4}-\d{2}-\d{2}$/.test(s);
const istZeit = s => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

export function pikettMinuten(p) {
  if (!p || !istZeit(p.von) || !istZeit(p.bis)) return 0;
  const [h1, m1] = p.von.split(':').map(Number), [h2, m2] = p.bis.split(':').map(Number);
  let d = (h2 * 60 + m2) - (h1 * 60 + m1); if (d < 0) d += 1440; return d;
}
const hhmm = min => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
const dezStd = min => (min / 60).toFixed(2);
const datumIso = s => { if (!s) return '—'; const [y, m, d] = s.split('-'); return `${d}.${m}.${y}`; };
const zh = (d, o) => new Date(d).toLocaleString('de-CH', { timeZone: 'Europe/Zurich', ...o });

/* Eingabe vom Handy prüfen und auf erlaubte Felder beschränken */
export function bereinige(e) {
  const art = e && ARTEN[e.art] ? e.art : null;
  if (!art) throw fehler('art');
  const intern = art === 'intern';
  const m = { art, objekt: txt(e.objekt, 12), text: txt(e.text, 4000) };
  if (!m.objekt) throw fehler('objekt');
  if (!intern) {
    m.hausnr = txt(e.hausnr, 40); if (!m.hausnr) throw fehler('hausnr');
    m.ort = ORTE[e.ort] ? e.ort : null; if (!m.ort) throw fehler('ort');
    m.mieter = m.ort === 'mieter' ? txt(e.mieter, 120) : '';
    m.andere = m.ort === 'andere' ? txt(e.andere, 200) : '';
    if (m.ort === 'mieter' && !m.mieter) throw fehler('mieter');
    if (m.ort === 'andere' && !m.andere) throw fehler('andere');
    m.bereich = BEREICHE[e.bereich] ? e.bereich : null; if (!m.bereich) throw fehler('bereich');
    if (m.text.length < 3) throw fehler('text');
  } else {
    m.hausnr = ''; m.ort = null; m.mieter = ''; m.andere = ''; m.bereich = null;
    const i = e.intern || {};
    if (!istDatum(i.datum) || !istZeit(i.zeit)) throw fehler('zeit');
    m.intern = { datum: i.datum, zeit: i.zeit };
  }
  m.intern = m.intern || null;
  if (UNTERARTEN[art]) {
    m.unterart = UNTERARTEN[art][e.unterart] ? e.unterart : null; if (!m.unterart) throw fehler('unterart');
    m.unterartAndere = m.unterart === 'andere' ? txt(e.unterartAndere, 200) : '';
    if (m.unterart === 'andere' && !m.unterartAndere) throw fehler('unterart_andere');
  } else { m.unterart = ''; m.unterartAndere = ''; }
  if (art === 'pikett') {
    const p = e.pikett || {};
    m.pikett = { datum: p.datum, von: p.von, bis: p.bis, auftraggeber: txt(p.auftraggeber, 200) };
    if (!m.pikett.auftraggeber) throw fehler('auftrag');
    if (!istDatum(p.datum) || !istZeit(p.von) || !istZeit(p.bis) || !pikettMinuten(m.pikett)) throw fehler('pikett');
  } else m.pikett = null;
  return m;
}
export function bereinigeFotos(f) {
  return (Array.isArray(f) ? f : []).filter(x => typeof x === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(x) && x.length < 1_600_000).slice(0, 6);
}
function fehler(feld) { const e = new Error('Angabe fehlt oder ungültig: ' + feld); e.status = 400; e.code = 'e_' + feld; return e; }

/* Anzeige-Texte (Deutsch) */
export function unterartText(m) {
  if (!m.unterart) return '';
  if (m.unterart === 'andere') return m.unterartAndereDe || m.unterartAndere || 'Andere';
  return (UNTERARTEN[m.art] || {})[m.unterart] || m.unterart;
}
export function ortText(m) {
  if (m.ort === 'mieter') return `Mieter: ${m.mieter}`;
  if (m.ort === 'andere' && m.andere) return m.andereDe || m.andere;
  return ORTE[m.ort] || '';
}
export const deutschOk = m => ['ok', 'manuell', 'nicht_noetig'].includes(m.uebersetzung);

/* Daten für Mail und PDF – gleiche Struktur wie bisher von der App geliefert */
export function mailDaten(m, o) {
  const e = m.pikett ? pikettMinuten(m.pikett) : 0, tot = e + ADMIN_MIN_PIKETT;
  const ok = deutschOk(m);
  return {
    nr: m.nr, art: ARTEN[m.art], artId: m.art, unterart: unterartText(m),
    objekt: { nr: m.objekt, strasse: o.strasse, ort: o.ort, kunde: o.kunde, email: '' },
    hausnr: m.hausnr || '', stockwerk: m.bereich ? BEREICHE[m.bereich] : '', bereich: m.ort ? ortText(m) : '',
    zeitpunkt: m.intern ? `${datumIso(m.intern.datum)}, ${m.intern.zeit} Uhr` : '',
    pikett: m.pikett ? {
      auftraggeber: m.pikett.auftraggeber, datum: datumIso(m.pikett.datum), von: m.pikett.von, bis: m.pikett.bis,
      dauer: `${hhmm(tot)} h (${dezStd(tot)} Std.)`, dauerKurz: hhmm(e) + ' h', adminKurz: MIT_ADMIN ? hhmm(ADMIN_MIN_PIKETT) + ' h' : '',
      totalKurz: `${hhmm(tot)} h (${dezStd(tot)} Std.)`
    } : null,
    gemeldetDatum: zh(m.gemeldet, { day: '2-digit', month: '2-digit', year: 'numeric' }).split(',')[0],
    deutschOk: ok, textDe: ok ? (m.textDe || m.text) : m.text, textOriginal: m.text, sprache: m.sprache || '',
    uebersetzt: m.uebersetzung !== 'nicht_noetig', hauswart: m.hwName, pnr: m.pnr,
    gemeldet: zh(m.gemeldet, { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }),
    fotos: (m.fotos || []).slice(0, 6)
  };
}
