// Versand einer Hauswart-Meldung per E-Mail an die Hauswartung – und bei «Meldung (Verwaltung)»
// und «Pikettdienst» zusätzlich direkt an die Verwaltung (Adresse aus der Datenbank).
// Gestaltung identisch mit den Mails der App «angebot-pfs» (csRahmen, Verdana, Logo, Signaturblock).
//
// Umgebungsvariablen:
//   RESEND_API_KEY oder API_RESEND_KEY   Schlüssel von resend.com (Domain clean-service.ch verifiziert)
//   MAIL_TO     optional, Standard: hauswartung@clean-service.ch
//   MAIL_FROM   optional, Standard: Hauswartung Clean Service <meldungen@clean-service.ch>
//   VERWALTUNG_DIREKT  optional: "aus" schaltet den Direktversand an die Verwaltungen ab
//   Alternativ SMTP: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
import nodemailer from 'nodemailer';
import { erstelleRapportPdf } from './rapport-pdf.js';
import { LOGO_PNG } from './ressourcen.js';

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

// m: Mail-Daten (siehe lib/meldung.js → mailDaten)
// optionen.verwaltungEmail: Adresse aus der Datenbank · optionen.intern: false = interne Mail nicht (nochmals) senden
export async function versendeMeldung(m, { verwaltungEmail = '', intern: internSenden = true, verwaltung: verwaltungSenden = true } = {}) {
  if (!m.nr || !m.objekt) throw new Error('Meldung unvollständig');
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  const RESEND_API_KEY = process.env.RESEND_API_KEY || process.env.API_RESEND_KEY;
  if (!RESEND_API_KEY && (!SMTP_HOST || !SMTP_USER || !SMTP_PASS)) throw new Error('Mailversand ist nicht konfiguriert (RESEND_API_KEY oder SMTP)');
  const an = process.env.MAIL_TO || 'hauswartung@clean-service.ch';
  const von = process.env.MAIL_FROM || ABSENDER;

  const o = m.objekt, pk = !!m.pikett, intern = m.artId === 'intern';
  // Verwaltungs-Adresse ausschliesslich aus der Datenbank (Angaben vom Handy werden ignoriert)
  o.email = String(verwaltungEmail || '').trim();
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

  const versende = async ({ an: empfaenger, betreff: b, html: h, text: t, anhaenge: a, bcc }) => {
    if (RESEND_API_KEY) {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + RESEND_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: von, to: [empfaenger], ...(bcc ? { bcc: [bcc] } : {}), reply_to: ANTWORT_AN, subject: b, html: h, text: t,
          attachments: a.map(x => ({ filename: x.filename, content: x.content.toString('base64'), ...(x.cid ? { content_id: x.cid, disposition: 'inline' } : {}) }))
        })
      });
      if (!r.ok) throw new Error('Resend ' + r.status + ': ' + (await r.text()));
      return 'Resend';
    }
    const transport = nodemailer.createTransport({ host: SMTP_HOST, port: Number(SMTP_PORT || 587), secure: Number(SMTP_PORT) === 465, auth: { user: SMTP_USER, pass: SMTP_PASS } });
    await transport.sendMail({ from: von, to: empfaenger, ...(bcc ? { bcc } : {}), replyTo: ANTWORT_AN, subject: b, html: h, text: t, attachments: a });
    return 'SMTP';
  };

  /* ---- Direktversand an die Verwaltung: Adresse nur aus der Serverliste ---- */
  const vAdresse = o.email;
  let vStatus = 'nicht_vorgesehen';
  if (!intern) {
    if (process.env.VERWALTUNG_DIREKT === 'aus') vStatus = 'abgeschaltet';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(vAdresse)) vStatus = 'keine_adresse';
    else if (!m.deutschOk) vStatus = 'nicht_uebersetzt';
    else vStatus = 'bereit';
  }

  // Hinweis in der internen Mail, ob die Verwaltung direkt informiert wird
  const vHinweis = {
    bereit: `Die Verwaltung wurde direkt informiert: ${esc(vAdresse)}`,
    keine_adresse: 'Keine Verwaltungs-Adresse hinterlegt – bitte Rapport bei Bedarf selbst weiterleiten.',
    nicht_uebersetzt: 'Nicht an die Verwaltung gesendet, weil noch keine deutsche Übersetzung vorlag – bitte prüfen und weiterleiten.',
    abgeschaltet: 'Direktversand an Verwaltungen ist ausgeschaltet.'
  }[vStatus];
  const htmlIntern = vHinweis ? html.replace('Diese Nachricht wurde automatisch', `${vHinweis}<br>Diese Nachricht wurde automatisch`) : html;

  let via = '';
  if (internSenden) via = await versende({ an, betreff, html: htmlIntern, text, anhaenge });

  if (vStatus === 'bereit' && verwaltungSenden) {
    try {
      const kTitel = pk ? 'Rapport Pikettdienst' : 'Meldung Hauswartung';
      const kBetreff = `${kTitel} · ${o.strasse}${m.hausnr ? ' ' + m.hausnr : ''}, ${o.ort} · Nr. ${m.nr}`;
      const kInhalt = `
    <p style="margin:0 0 16px;">Sehr geehrte Damen und Herren</p>
    <p style="margin:0 0 20px;">${pk ? 'Gerne informieren wir Sie über den folgenden Pikett-Einsatz in Ihrer Liegenschaft.' : 'Gerne informieren wir Sie über die folgende Feststellung unserer Hauswartung in Ihrer Liegenschaft.'} Den ${pk ? 'Rapport' : 'Bericht'} finden Sie zusätzlich als PDF im Anhang.</p>
    ${csKasten(pk ? 'PIKETT-EINSATZ' : esc(m.unterart || 'MELDUNG').toUpperCase(), objektZeile, `${esc(o.ort)} · Obj. ${esc(o.nr)}`)}
    ${csTabelle([
      ['Stockwerk', esc(m.stockwerk)],
      ['Bereich', esc(m.bereich)],
      ['Art der Meldung', pk ? '' : esc(m.unterart)],
      ['Auftrag erteilt von', pk ? esc(m.pikett.auftraggeber) : ''],
      ['Einsatz', pk ? `${esc(m.pikett.datum)}, ${esc(m.pikett.von)} – ${esc(m.pikett.bis)} Uhr` : ''],
      ['Verrechenbar', pk ? esc(m.pikett.dauer) : ''],
      [pk ? '' : 'Festgestellt am', pk ? '' : esc(m.gemeldetDatum)]
    ])}
    <div style="font-family:Verdana,Geneva,sans-serif;font-size:11px;color:${CS_GRAU};letter-spacing:.1em;margin:0 0 6px;">${pk ? 'EINSATZBESCHRIEB' : 'BESCHREIBUNG'}</div>
    <p style="margin:0 0 18px;white-space:pre-wrap;">${esc(m.textDe)}</p>
    <p style="margin:0;">Für Rückfragen stehen wir Ihnen gerne zur Verfügung.</p>`;
      const kHtml = csRahmen(kTitel + ' · Nr. ' + esc(m.nr), kInhalt, 'Antworten auf diese Nachricht gehen direkt an unsere Hauswartung (hauswartung@clean-service.ch).').replace('Hauswartung<br>Meldung aus der App', 'Hauswartung');
      const kText = `Sehr geehrte Damen und Herren\n\n${pk ? 'Gerne informieren wir Sie über den folgenden Pikett-Einsatz in Ihrer Liegenschaft.' : 'Gerne informieren wir Sie über die folgende Feststellung unserer Hauswartung in Ihrer Liegenschaft.'}\n\n${o.strasse}${m.hausnr ? ', Hausnummer ' + m.hausnr : ''}, ${o.ort}\n\n${m.textDe}\n\nDer ${pk ? 'Rapport' : 'Bericht'} liegt als PDF bei.\n\nFreundliche Grüsse\nClean Service Scaramuzzo AG · Hauswartung\nIndustriestrasse 5 · 8307 Effretikon · 0844 355 355`;
      await versende({ an: vAdresse, betreff: kBetreff, html: kHtml, text: kText, anhaenge });
      vStatus = 'gesendet';
      // Kopie an die Hauswartung – klar als Kopie gekennzeichnet (statt Blindkopie)
      try {
        const kopieHinweis = `<div style="font-family:Verdana,Geneva,sans-serif;font-size:12px;color:${CS_DUNKEL};background:#EAF7F7;border-left:4px solid ${CS_FARBE};padding:10px 14px;margin:0 0 18px;">Kopie – diese Nachricht wurde soeben an die Verwaltung gesendet: <strong>${esc(vAdresse)}</strong></div>`;
        await versende({ an, betreff: `Kopie an Verwaltung · ${kBetreff}`, html: kHtml.replace('<p style="margin:0 0 16px;">Sehr geehrte Damen und Herren</p>', kopieHinweis + '<p style="margin:0 0 16px;">Sehr geehrte Damen und Herren</p>'),
          text: `KOPIE – gesendet an ${vAdresse}\n\n${kText}`, anhaenge });
      } catch (e) { console.error('Kopie Hauswartung', e); }
    } catch (e) { console.error('Verwaltung', e); vStatus = 'fehler'; }
  }
  return { ok: true, via, pdf: !intern, verwaltung: vStatus, verwaltungAdresse: vStatus === 'gesendet' ? vAdresse : '' };
}
