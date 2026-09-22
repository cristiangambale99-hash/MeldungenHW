// Vercel Serverless Function: sendet jede Hauswart-Meldung per E-Mail an die Hauswartung.
// Umgebungsvariablen (Vercel > Project > Settings > Environment Variables):
//   SMTP_HOST   z. B. smtp.office365.com
//   SMTP_PORT   z. B. 587
//   SMTP_USER   Absender-Konto, z. B. hauswartung@clean-service.ch
//   SMTP_PASS   Passwort bzw. App-Passwort dieses Kontos
//   MAIL_TO     optional, Standard: hauswartung@clean-service.ch
//   MAIL_FROM   optional, Standard: SMTP_USER
import nodemailer from 'nodemailer';

export const config = { api: { bodyParser: { sizeLimit: '4mb' } } };

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Nur POST erlaubt' });
  const origin = req.headers.origin || '', host = req.headers.host || '';
  if (origin && !origin.endsWith('//' + host)) return res.status(403).json({ error: 'Nicht erlaubt' });

  const m = req.body || {};
  if (!m.nr || !m.objekt) return res.status(400).json({ error: 'Meldung unvollständig' });
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return res.status(500).json({ error: 'SMTP ist nicht konfiguriert' });
  const an = process.env.MAIL_TO || 'hauswartung@clean-service.ch';

  const o = m.objekt;
  const betreff = `Hauswartung ${m.nr} · ${m.art}${m.unterart ? ' · ' + m.unterart : ''} · ${o.strasse} ${m.hausnr ? '(Nr. ' + m.hausnr + ')' : ''}, ${o.ort}`;
  const z = (k, v) => v ? `<tr><td style="padding:6px 12px 6px 0;color:#5E7273;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:6px 0;vertical-align:top">${v}</td></tr>` : '';
  const html = `
<div style="font-family:Verdana,Arial,sans-serif;font-size:13px;color:#16292A;max-width:640px">
  <div style="background:#0E4344;color:#fff;padding:14px 18px;border-radius:8px 8px 0 0">
    <div style="font-size:12px;opacity:.8">Neue Meldung aus der Hauswartungs-App</div>
    <div style="font-size:17px;font-weight:bold;margin-top:2px">${esc(m.art)}${m.unterart ? ' · ' + esc(m.unterart) : ''} · Nr. ${esc(m.nr)}</div>
  </div>
  <div style="border:1px solid #E3ECEC;border-top:0;padding:16px 18px;border-radius:0 0 8px 8px">
    <table style="border-collapse:collapse;width:100%;font-size:13px">
      ${z('Objekt', `${esc(o.strasse)}, Hausnummer ${esc(m.hausnr)}<br>${esc(o.ort)} (Obj. ${esc(o.nr)})`)}
      ${z('Kunde', esc(o.kunde) + (o.email ? `<br><a href="mailto:${esc(o.email)}">${esc(o.email)}</a>` : ''))}
      ${z('Zeitpunkt', esc(m.zeitpunkt))}
      ${z('Stockwerk', esc(m.stockwerk))}
      ${z('Bereich', esc(m.bereich))}
      ${m.pikett ? z('Auftrag von', esc(m.pikett.auftraggeber)) + z('Einsatz', `${esc(m.pikett.datum)}, ${esc(m.pikett.von)} – ${esc(m.pikett.bis)} Uhr<br><b>${esc(m.pikett.dauer)}</b>`) : ''}
      ${z('Hauswart', `${esc(m.hauswart)} (${esc(m.pnr)})`)}
      ${z('Gemeldet', esc(m.gemeldet))}
    </table>
    <div style="margin-top:14px;padding:12px 14px;background:#EAF6F6;border-radius:6px">
      <div style="font-size:11px;color:#1D8384;font-weight:bold;margin-bottom:4px">${m.pikett ? 'EINSATZBESCHRIEB' : 'BESCHREIBUNG'}${m.uebersetzt ? ' (DEUTSCH)' : ''}</div>
      <div style="white-space:pre-wrap">${esc(m.textDe)}</div>
    </div>
    ${m.uebersetzt && m.textOriginal && m.textOriginal !== m.textDe ? `<div style="margin-top:8px;padding:10px 14px;background:#F3F6F6;border-radius:6px;font-style:italic;color:#5E7273"><div style="font-size:11px;font-style:normal;margin-bottom:4px">Original${m.sprache ? ' (' + esc(m.sprache) + ')' : ''}</div>${esc(m.textOriginal)}</div>` : ''}
    ${(m.fotos || []).length ? `<div style="margin-top:12px;font-size:12px;color:#5E7273">${m.fotos.length} Foto(s) im Anhang</div>` : ''}
  </div>
</div>`;

  const attachments = (m.fotos || []).slice(0, 6).map((f, i) => {
    const t = /^data:(image\/[a-z]+);base64,(.+)$/.exec(f || '');
    return t ? { filename: `meldung-${m.nr}-foto-${i + 1}.${t[1].split('/')[1].replace('jpeg', 'jpg')}`, content: Buffer.from(t[2], 'base64'), contentType: t[1] } : null;
  }).filter(Boolean);

  try {
    const transport = nodemailer.createTransport({ host: SMTP_HOST, port: Number(SMTP_PORT || 587), secure: Number(SMTP_PORT) === 465, auth: { user: SMTP_USER, pass: SMTP_PASS } });
    await transport.sendMail({ from: process.env.MAIL_FROM || `Hauswartung App <${SMTP_USER}>`, to: an, subject: betreff, html, attachments });
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(502).json({ error: 'E-Mail konnte nicht gesendet werden' });
  }
}
