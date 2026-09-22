// Vercel Serverless Function: zentrale Schnittstelle der Hauswartungs-App.
// Speichert alles in Supabase, übersetzt ins Deutsche und versendet Mail + PDF (auch direkt an die Verwaltung).
//
// Umgebungsvariablen (Vercel > Project > Settings > Environment Variables):
//   SUPABASE_URL, SUPABASE_KEY, HW_DB_SECRET   Datenbank
//   SESSION_SECRET                              signiert die Anmeldungen
//   ADMIN_CODE                                  Zugangscode Admin-Bereich
//   RESEND_API_KEY / API_RESEND_KEY             Mailversand (siehe lib/mailversand.js)
//   DEEPL_API_KEY                               optional, bessere Übersetzung
import { rpc, dbBereit } from '../lib/db.js';
import { erstelleToken, pruefeToken, gleich } from '../lib/sitzung.js';
import { uebersetzeTexte } from '../lib/uebersetzung.js';
import { versendeMeldung } from '../lib/mailversand.js';
import { bereinige, bereinigeFotos, mailDaten, deutschOk } from '../lib/meldung.js';

export const config = { api: { bodyParser: { sizeLimit: '4.5mb' } } };

const warte = ms => new Promise(r => setTimeout(r, ms));
const ohneEmail = l => l.filter(o => o.aktiv !== false).map(({ email, aktiv, ...o }) => o);
const hwName = h => `${h.nachname}, ${h.vorname}`;
const istUuid = s => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || ''));

class Fehler extends Error { constructor(status, code, text) { super(text || code); this.status = status; this.code = code; } }

/* ---------- Übersetzen + Versenden einer gespeicherten Meldung ---------- */
async function verarbeite(nr, { neuUebersetzen = false } = {}) {
  const m = await rpc('hw_meldung_holen', { p_nr: nr, p_fotos: true });
  if (!m) throw new Fehler(404, 'nicht_gefunden');
  const patch = {};

  // 1. Übersetzung ins Deutsche (automatisch, ohne Zutun)
  const felder = [['text', 'textDe'], ['unterartAndere', 'unterartAndereDe'], ['andere', 'andereDe']].filter(([k]) => m[k]);
  const offen = !m.uebersetzung || m.uebersetzung === 'ausstehend' || m.uebersetzung === 'laeuft' || (neuUebersetzen && m.uebersetzung !== 'nicht_noetig');
  if (offen) {
    if (!felder.length) Object.assign(patch, { textDe: '', sprache: 'DE', uebersetzung: 'nicht_noetig' });
    else {
      const texte = felder.map(([k]) => m[k]);
      try {
        const j = await uebersetzeTexte(texte);
        const sprache = String(j.sprache || '').toUpperCase().slice(0, 2) || '?';
        const deutsch = sprache === 'DE' || j.texte_de.every((x, i) => String(x).trim() === texte[i].trim());
        felder.forEach(([k, kd], i) => { patch[kd] = deutsch ? m[k] : j.texte_de[i]; });
        Object.assign(patch, { sprache, uebersetzung: deutsch ? 'nicht_noetig' : 'ok', uebersetztVia: j.dienst, fehler: '' });
      } catch (e) { Object.assign(patch, { uebersetzung: 'ausstehend', fehler: String(e.message || e).slice(0, 300) }); }
    }
    Object.assign(m, patch);
  }

  // 2. Mail an die Hauswartung (+ Verwaltung), bzw. Verwaltung nachträglich, sobald Deutsch vorliegt
  const o = (await rpc('hw_objekt', { p_nr: m.objekt })) || { nr: m.objekt, strasse: `Objekt ${m.objekt}`, ort: '', kunde: '', email: '' };
  const d = mailDaten(m, o);
  const nurVerwaltung = m.mail === 'gesendet' && ['nicht_uebersetzt', 'fehler'].includes(m.verwaltungMail) && deutschOk(m);
  if (m.mail !== 'gesendet' || nurVerwaltung) {
    try {
      const a = await versendeMeldung(d, { verwaltungEmail: o.email, intern: !nurVerwaltung });
      if (!nurVerwaltung) Object.assign(patch, { mail: 'gesendet', mailVia: a.via, mailZeit: new Date().toISOString(), mailFehler: '' });
      Object.assign(patch, { verwaltungMail: a.verwaltung, verwaltungAdresse: a.verwaltungAdresse || '' });
    } catch (e) {
      console.error('Mail', nr, e);
      if (!nurVerwaltung) Object.assign(patch, { mail: 'wartet', mailFehler: String(e.message || e).slice(0, 300) });
    }
  }
  if (!Object.keys(patch).length) { delete m.fotos; return m; }
  return rpc('hw_meldung_aendern', { p_nr: nr, p_status: null, p_daten: patch });
}

/* ---------- Anmeldung prüfen ---------- */
async function hauswartAus(token) {
  const t = pruefeToken(token);
  if (!t || t.rolle !== 'hw') throw new Fehler(401, 'abgemeldet');
  const h = await rpc('hw_hauswart', { p_pnr: t.pnr });
  if (!h) throw new Fehler(401, 'abgemeldet');
  return h;
}
function adminPruefen(token) {
  const t = pruefeToken(token);
  if (!t || t.rolle !== 'admin') throw new Fehler(401, 'admin_abgemeldet');
}

/* ---------- Aktionen ---------- */
const AKTIONEN = {
  async status() { return { ok: true, db: dbBereit() }; },

  async login({ pnr }) {
    const h = /^\d{3,6}$/.test(String(pnr || '')) ? await rpc('hw_hauswart', { p_pnr: String(pnr) }) : null;
    if (!h) { await warte(900); throw new Fehler(401, 'e_pnr'); }
    const s = await rpc('hw_stammdaten');
    return { hauswart: h, token: erstelleToken({ rolle: 'hw', pnr: h.pnr }, 365), objekte: ohneEmail(s.objekte) };
  },

  async stammdaten({ token }) {
    const h = await hauswartAus(token);
    const s = await rpc('hw_stammdaten');
    return { hauswart: h, objekte: ohneEmail(s.objekte) };
  },

  async meldung_neu({ token, client_id, meldung, fotos }) {
    const h = await hauswartAus(token);
    if (!istUuid(client_id)) throw new Fehler(400, 'client_id');
    const m = bereinige(meldung);
    const f = bereinigeFotos(fotos);
    const daten = { ...m, pnr: h.pnr, hwName: hwName(h), mail: 'offen' };
    const r = await rpc('hw_meldung_neu', { p_client: client_id, p_pnr: h.pnr, p_objekt: m.objekt, p_art: m.art, p_daten: daten, p_fotos: f });
    if (!r.neu && r.meldung.mail === 'gesendet') return { meldung: r.meldung, doppelt: true };
    return { meldung: await verarbeite(r.meldung.nr) };
  },

  async meine({ token }) {
    const h = await hauswartAus(token);
    const l = await rpc('hw_meldungen_liste', { p_pnr: h.pnr, p_tage: 90 });
    return { meldungen: l.map(({ textDe, fehler, mailFehler, verwaltungAdresse, ...m }) => m) };
  },

  async admin_login({ code }) {
    const soll = process.env.ADMIN_CODE;
    if (!soll) throw new Fehler(500, 'ADMIN_CODE ist nicht gesetzt');
    if (!gleich(String(code || ''), soll)) { await warte(900); throw new Fehler(401, 'falscher_code'); }
    return { token: erstelleToken({ rolle: 'admin' }, 0.5) };
  },

  async admin_daten({ token }) {
    adminPruefen(token);
    const [s, l] = await Promise.all([rpc('hw_stammdaten'), rpc('hw_meldungen_liste', { p_pnr: null, p_tage: 730 })]);
    return { objekte: s.objekte, hauswarte: s.hauswarte, meldungen: l };
  },

  async meldung_holen({ token, nr }) {
    adminPruefen(token);
    return { meldung: await rpc('hw_meldung_holen', { p_nr: Number(nr), p_fotos: true }) };
  },

  async meldung_aendern({ token, nr, status, textDe }) {
    adminPruefen(token);
    const patch = {};
    if (typeof textDe === 'string' && textDe.trim()) Object.assign(patch, { textDe: textDe.trim().replace(/ß/g, 'ss').slice(0, 4000), uebersetzung: 'manuell', fehler: '' });
    const st = ['neu', 'inarbeit', 'erledigt'].includes(status) ? status : null;
    let m = await rpc('hw_meldung_aendern', { p_nr: Number(nr), p_status: st, p_daten: patch });
    if (patch.textDe && ['nicht_uebersetzt', 'fehler'].includes(m.verwaltungMail)) m = await verarbeite(Number(nr));
    return { meldung: m };
  },

  async uebersetzen({ token, nr }) { adminPruefen(token); return { meldung: await verarbeite(Number(nr), { neuUebersetzen: true }) }; },
  async senden({ token, nr }) { adminPruefen(token); return { meldung: await verarbeite(Number(nr)) }; },

  // Ausstehende Übersetzungen/Mails automatisch nachholen (wird von der App regelmässig angestossen)
  async nacharbeit({ token }) {
    const t = pruefeToken(token);
    if (!t) throw new Fehler(401, 'abgemeldet');
    const offen = (await rpc('hw_offene_nacharbeit')).slice(0, 5);
    const fertig = [];
    for (const nr of offen) { try { fertig.push(await verarbeite(nr)); } catch (e) { console.error('Nacharbeit', nr, e); } }
    return { bearbeitet: fertig.length, meldungen: t.rolle === 'admin' ? fertig : [] };
  },

  async objekt_speichern({ token, alt, objekt }) {
    adminPruefen(token);
    const o = objekt || {}, w = {};
    ['nr', 'kunde', 'strasse', 'ort', 'email'].forEach(k => { w[k] = String(o[k] ?? '').trim().replace(/\s+/g, ' ').slice(0, 200); });
    if (!/^\d{1,6}$/.test(w.nr) || !w.strasse || !w.kunde || !/^\d{4}\s+\S/.test(w.ort)) throw new Fehler(400, 'objekt_ungueltig');
    if (w.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(w.email)) throw new Fehler(400, 'email_ungueltig');
    return rpc('hw_objekt_speichern', { p_alt: alt || null, p_o: w });
  },
  async objekt_loeschen({ token, nr }) { adminPruefen(token); return rpc('hw_objekt_loeschen', { p_nr: String(nr) }); },

  async hauswart_speichern({ token, alt, hauswart }) {
    adminPruefen(token);
    const h = hauswart || {}, w = {};
    ['pnr', 'nachname', 'vorname'].forEach(k => { w[k] = String(h[k] ?? '').trim().replace(/\s+/g, ' ').slice(0, 100); });
    if (!/^\d{3,6}$/.test(w.pnr) || !w.nachname || !w.vorname) throw new Fehler(400, 'hauswart_ungueltig');
    return rpc('hw_hauswart_speichern', { p_alt: alt || null, p_h: w });
  },
  async hauswart_loeschen({ token, pnr }) { adminPruefen(token); return rpc('hw_hauswart_loeschen', { p_pnr: String(pnr) }); }
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') return res.status(200).json(await AKTIONEN.status());
  if (req.method !== 'POST') return res.status(405).json({ error: 'Nur POST erlaubt' });
  const origin = req.headers.origin || '', host = req.headers.host || '';
  if (origin && !origin.endsWith('//' + host)) return res.status(403).json({ error: 'Nicht erlaubt' });
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const aktion = AKTIONEN[body.aktion];
  if (!aktion) return res.status(400).json({ error: 'Unbekannte Aktion' });
  try { return res.status(200).json(await aktion(body)); }
  catch (e) {
    const status = e.status && e.status < 500 ? e.status : (/nr_vergeben|pnr_vergeben/.test(e.message) ? 409 : 500);
    const code = (e.message.match(/nr_vergeben|pnr_vergeben|nicht_gefunden/) || [])[0] || e.code || 'fehler';
    if (status >= 500) console.error(body.aktion, e);
    return res.status(status).json({ error: code, text: String(e.message || e).slice(0, 300) });
  }
}
