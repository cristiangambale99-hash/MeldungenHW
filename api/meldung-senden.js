// Vercel Serverless Function: sendet jede Hauswart-Meldung per E-Mail an die Hauswartung.
// Gestaltung identisch mit den Mails der App «angebot-pfs» (csRahmen, Verdana, Logo, Signaturblock).
// Bei Meldungen an die Verwaltung und bei Pikett-Einsätzen liegt der Rapport als PDF auf Briefpapier bei.
//
// Umgebungsvariablen (Vercel > Project > Settings > Environment Variables):
//   RESEND_API_KEY oder API_RESEND_KEY   Schlüssel von resend.com (Domain clean-service.ch verifiziert)
//   MAIL_TO     optional, Standard: hauswartung@clean-service.ch
//   MAIL_FROM   optional, Standard: Hauswartung Clean Service <meldungen@clean-service.ch>
// Alternativ SMTP: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
import nodemailer from 'nodemailer';
import { erstelleRapportPdf } from '../lib/rapport-pdf.js';
import { LOGO_PNG } from '../lib/ressourcen.js';

export const config = { api: { bodyParser: { sizeLimit: '4mb' } } };

const ABSENDER = 'Hauswartung Clean Service <meldungen@clean-service.ch>';
const ANTWORT_AN = 'hauswartung@clean-service.ch';
const CS_FARBE = '#2BB6B7', CS_DUNKEL = '#12797A', CS_TEXT = '#333333', CS_GRAU = '#767676';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---- Vorlage wie angebot-pfs ---- */
function csSignatur() {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-top:26px;">
    <tr><td style="padding-top:18px;border-top:2px solid ${CS_FARBE};">
      <div style="font-family:Verdana,Geneva,sans-serif;font-size:12px;line-height:1.55;color:${CS_GRAU};">
        <strong style="color:${CS_TEXT};">Clean Service Scaramuzzo AG</strong><br>
        Hauswartung<br>
        Industriestrasse 5<br>
        8307 Effretikon<br>
        0844 355 355<br>
        <a href="https://clean-service.ch" style="color:${CS_DUNKEL};text-decoration:none;">clean-service.ch</a>
      </div>
    </td></tr>
  </table>`;
}
function csRahmen(titel, inhalt, hinweis) {
  return `
<div style="background:#F2F4F4;padding:24px 12px;font-family:Verdana,Geneva,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;width:100%;margin:0 auto;background:#FFFFFF;border:1px solid #DDE2E1;border-top:none;">
    <tr><td style="padding:0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;">
        <tr>
          <td style="background:#FFFFFF;padding:26px 36px 20px;vertical-align:middle;">
            <img src="cid:cslogo" width="185" alt="Clean Service Scaramuzzo AG" style="display:block;border:0;width:185px;height:auto;">
          </td>
          <td style="background:#FFFFFF;padding:26px 36px 20px;text-align:right;vertical-align:middle;">
            <div style="font-family:Verdana,Geneva,sans-serif;font-size:10.5px;color:${CS_GRAU};line-height:1.6;">Hauswartung<br>Meldung aus der App</div>
          </td>
        </tr>
      </table>
      <div style="height:3px;background:${CS_FARBE};font-size:0;line-height:0;">&nbsp;</div>
    </td></tr>
    <tr><td style="padding:30px 36px 8px;">
      <div style="font-family:Verdana,Geneva,sans-serif;font-size:16px;font-weight:bold;color:${CS_TEXT};line-height:1.4;">${titel}</div>
    </td></tr>
    <tr><td style="padding:12px 36px 30px;font-family:Verdana,Geneva,sans-serif;font-size:13px;line-height:1.7;color:${CS_TEXT};">
      ${inhalt}
      ${csSignatur()}
    </td></tr>
    ${hinweis ? `<tr><td style="padding:16px 36px;background:#F7F9F9;border-top:1px solid #E5E9E8;font-family:Verdana,Geneva,sans-serif;font-size:11px;color:${CS_GRAU};line-height:1.6;">${hinweis}</td></tr>` : ''}
  </table>
</div>`;
}
function csTabelle(zeilen) {
  const r = zeilen.filter(([, v]) => v).map(([k, v]) => `
    <tr>
      <td style="padding:8px 0;font-family:Verdana,Geneva,sans-serif;font-size:12px;color:${CS_GRAU};width:170px;vertical-align:top;border-bottom:1px solid #EDEFEF;">${k}</td>
      <td style="padding:8px 0;font-family:Verdana,Geneva,sans-serif;font-size:13px;color:${CS_TEXT};font-weight:bold;border-bottom:1px solid #EDEFEF;">${v}</td>
    </tr>`).join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:6px 0 18px;">${r}</table>`;
}
function csKasten(label, haupt, unter) {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0 0 20px;border-collapse:collapse;">
    <tr><td style="border:1px solid #D5E2E1;border-left:4px solid ${CS_FARBE};padding:18px 22px;background:#FBFDFD;">
      <div style="font-family:Verdana,Geneva,sans-serif;font-size:11px;color:${CS_GRAU};letter-spacing:.1em;margin-bottom:8px;">${label}</div>
      <div style="font-family:Verdana,Geneva,sans-serif;font-size:15px;color:${CS_TEXT};font-weight:bold;line-height:1.45;">${haupt}</div>
      ${unter ? `<div style="font-family:Verdana,Geneva,sans-serif;font-size:12px;color:${CS_GRAU};margin-top:4px;">${unter}</div>` : ''}
    </td></tr>
  </table>`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Nur POST erlaubt' });
  const origin = req.headers.origin || '', host = req.headers.host || '';
  if (origin && !origin.endsWith('//' + host)) return res.status(403).json({ error: 'Nicht erlaubt' });

  const m = req.body || {};
  if (!m.nr || !m.objekt) return res.status(400).json({ error: 'Meldung unvollständig' });
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  const RESEND_API_KEY = process.env.RESEND_API_KEY || process.env.API_RESEND_KEY;
  if (!RESEND_API_KEY && (!SMTP_HOST || !SMTP_USER || !SMTP_PASS)) return res.status(500).json({ error: 'Mailversand ist nicht konfiguriert (RESEND_API_KEY oder SMTP)' });
  const an = process.env.MAIL_TO || 'hauswartung@clean-service.ch';
  const von = process.env.MAIL_FROM || ABSENDER;

  const o = m.objekt, pk = !!m.pikett, intern = m.artId === 'intern';
  m.heute = new Date().toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Zurich' });

  /* ---- Mailinhalt ---- */
  const titel = `${esc(m.art)} · Nr. ${esc(m.nr)}`;
  const betreff = `Hauswartung ${m.nr} · ${m.art}${m.unterart ? ' · ' + m.unterart : ''} · ${o.strasse}${m.hausnr ? ' ' + m.hausnr : ''}, ${o.ort}`;
  const objektZeile = `${esc(o.strasse)}${m.hausnr ? ', Hausnummer ' + esc(m.hausnr) : ''}`;
  const inhalt = `
    <p style="margin:0 0 18px;">Die folgende Meldung wurde soeben über die Hauswartungs-App erfasst.</p>
    ${csKasten(esc((m.unterart || m.art)).toUpperCase(), objektZeile, `${esc(o.ort)} · ${esc(o.kunde)} · Obj. ${esc(o.nr)}`)}
    ${csTabelle([
      ['Art', esc(m.art)],
      [pk ? '' : 'Was', esc(m.unterart)],
      ['Stockwerk', esc(m.stockwerk)],
      ['Bereich', esc(m.bereich)],
      ['Auftrag von', pk ? esc(m.pikett.auftraggeber) : ''],
      ['Einsatz', pk ? `${esc(m.pikett.datum)}, ${esc(m.pikett.von)} – ${esc(m.pikett.bis)} Uhr` : ''],
      ['Verrechenbar', pk ? esc(m.pikett.dauer) : ''],
      ['Zeitpunkt', esc(m.zeitpunkt)],
      ['Kunden-E-Mail', o.email ? `<a href="mailto:${esc(o.email)}" style="color:${CS_DUNKEL};text-decoration:none;">${esc(o.email)}</a>` : ''],
      ['Hauswart', `${esc(m.hauswart)} (${esc(m.pnr)})`],
      ['Gemeldet', esc(m.gemeldet)]
    ])}
    ${m.textDe ? `
    <div style="font-family:Verdana,Geneva,sans-serif;font-size:11px;color:${CS_GRAU};letter-spacing:.1em;margin:0 0 6px;">${pk ? 'EINSATZBESCHRIEB' : intern ? 'BEMERKUNG' : 'BESCHREIBUNG'}</div>
    <p style="margin:0 0 14px;white-space:pre-wrap;">${esc(m.textDe)}</p>` : ''}
    ${m.uebersetzt && m.textOriginal && m.textOriginal !== m.textDe ? `
    <p style="margin:0 0 14px;font-size:12px;color:${CS_GRAU};"><em>Original${m.sprache ? ' (' + esc(m.sprache) + ')' : ''}: ${esc(m.textOriginal)}</em></p>` : ''}`;
  const beilagen = [];
  if (!intern) beilagen.push('Verwaltungsrapport als PDF');
  if ((m.fotos || []).length) beilagen.push(`${m.fotos.length} Foto${m.fotos.length > 1 ? 's' : ''}`);
  const hinweis = (beilagen.length ? `Beilage: ${beilagen.join(' · ')}<br>` : '') + 'Diese Nachricht wurde automatisch aus der Hauswartungs-App erstellt.';
  const html = csRahmen(titel, inhalt, hinweis);
  const text = [`${m.art} · Nr. ${m.nr}`, '', `${o.strasse}${m.hausnr ? ', Hausnummer ' + m.hausnr : ''}, ${o.ort}`, `Kunde: ${o.kunde}`,
    m.stockwerk ? `Stockwerk: ${m.stockwerk}` : '', m.bereich ? `Bereich: ${m.bereich}` : '', m.unterart ? `Was: ${m.unterart}` : '',
    pk ? `Auftrag von: ${m.pikett.auftraggeber}\nEinsatz: ${m.pikett.datum}, ${m.pikett.von} – ${m.pikett.bis} Uhr (${m.pikett.dauer})` : '',
    m.zeitpunkt ? `Zeitpunkt: ${m.zeitpunkt}` : '', `Hauswart: ${m.hauswart} (${m.pnr})`, '', m.textDe || '', '',
    'Clean Service Scaramuzzo AG · Hauswartung · Industriestrasse 5 · 8307 Effretikon'].filter(z => z !== null).join('\n');

  /* ---- Anhänge: Logo (inline), Rapport-PDF, Fotos ---- */
  const anhaenge = [{ filename: 'logo.png', content: Buffer.from(LOGO_PNG, 'base64'), cid: 'cslogo', contentType: 'image/png' }];
  if (!intern) {
    try {
      const pdf = await erstelleRapportPdf(m);
      anhaenge.push({ filename: `${pk ? 'Rapport_Pikett' : 'Meldung'}_${m.nr}_${(o.strasse || '').replace(/[^A-Za-z0-9ÄÖÜäöü]+/g, '_')}.pdf`, content: pdf, contentType: 'application/pdf' });
    } catch (e) { console.error('PDF', e); }
  }
  (m.fotos || []).slice(0, 6).forEach((f, i) => {
    const t = /^data:(image\/[a-z]+);base64,(.+)$/.exec(f || '');
    if (t) anhaenge.push({ filename: `Meldung_${m.nr}_Foto_${i + 1}.${t[1].split('/')[1].replace('jpeg', 'jpg')}`, content: Buffer.from(t[2], 'base64'), contentType: t[1] });
  });

  if (RESEND_API_KEY) {
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + RESEND_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: von, to: [an], reply_to: ANTWORT_AN, subject: betreff, html, text,
          attachments: anhaenge.map(a => ({ filename: a.filename, content: a.content.toString('base64'), ...(a.cid ? { content_id: a.cid, disposition: 'inline' } : {}) }))
        })
      });
      if (!r.ok) { const d = await r.text(); console.error('Resend', r.status, d); return res.status(502).json({ error: 'Resend ' + r.status, details: d }); }
      return res.status(200).json({ ok: true, via: 'Resend', pdf: !intern });
    } catch (e) { console.error(e); return res.status(502).json({ error: 'Resend nicht erreichbar' }); }
  }

  try {
    const transport = nodemailer.createTransport({ host: SMTP_HOST, port: Number(SMTP_PORT || 587), secure: Number(SMTP_PORT) === 465, auth: { user: SMTP_USER, pass: SMTP_PASS } });
    await transport.sendMail({ from: von, to: an, replyTo: ANTWORT_AN, subject: betreff, html, text, attachments: anhaenge });
    return res.status(200).json({ ok: true, via: 'SMTP', pdf: !intern });
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: 'E-Mail konnte nicht gesendet werden' });
  }
}
