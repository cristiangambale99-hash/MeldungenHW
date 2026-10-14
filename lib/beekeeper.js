// Bestätigung an den Hauswart im Beekeeper-Chat: kurzer Text und das PDF, das auch an die Verwaltung geht.
//
// Umgebungsvariablen (Vercel):
//   BEEKEEPER_TOKEN   API-Token des Bots «HW Bot» (Format: 1ecb6997-…)
//   BEEKEEPER_HOST    optional, Standard clean-service.ch.beekeeper.io
//   BEEKEEPER_CHAT    optional: "aus" schaltet den Chat ab
//   BEEKEEPER_KOPIE   optional: Personalnummer, die jede Bestätigung zusätzlich erhält
//
// Ablauf: Benutzer über die Personalnummer suchen → PDF hochladen → Nachricht senden.
// Der Chat ist eine Zugabe: Schlägt er fehl, bleibt die Meldung versendet, es wird nur vermerkt.

const HOST = () => process.env.BEEKEEPER_HOST || 'clean-service.ch.beekeeper.io';
const TOKEN = () => process.env.BEEKEEPER_TOKEN || '';
export const chatBereit = () => !!TOKEN() && process.env.BEEKEEPER_CHAT !== 'aus';

async function bk(pfad, { methode = 'GET', body, form } = {}) {
  const r = await fetch(`https://${HOST()}/api/2${pfad}`, {
    method: methode,
    headers: { Authorization: 'Token ' + TOKEN(), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: form || (body ? JSON.stringify(body) : undefined)
  });
  if (!r.ok) throw new Error(`Beekeeper ${pfad} → ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

/* ---------- Personalnummer → Beekeeper-Benutzer ---------- */
// Die Personalnummer steht bei den meisten Konten im Feld tenantuserid. Fehlt sie dort,
// beginnt der angezeigte Name mit ihr («32675 Mattia Arcolia») – das nehmen wir als zweiten Weg.
const fuehrendeNummer = s => (String(s || '').trim().match(/^(\d{3,8})\b/) || [])[1] || '';
let zwischenspeicher = { zeit: 0, karte: null };

export async function benutzerKarte({ frisch = false } = {}) {
  const alt = Date.now() - zwischenspeicher.zeit < 10 * 60 * 1000;
  if (!frisch && alt && zwischenspeicher.karte) return zwischenspeicher.karte;
  const karte = new Map();
  for (let offset = 0; offset < 2000; offset += 200) {
    const teil = await bk(`/users?limit=200&offset=${offset}`);
    if (!Array.isArray(teil) || !teil.length) break;
    for (const u of teil) {
      if (u.is_bot || u.suspended) continue;
      const nr = String(u.tenantuserid || '').trim() || fuehrendeNummer(u.display_name) || fuehrendeNummer(u.name);
      if (nr && !karte.has(nr)) karte.set(nr, { id: u.id, name: u.display_name || u.name });
    }
    if (teil.length < 200) break;
  }
  zwischenspeicher = { zeit: Date.now(), karte };
  return karte;
}

/* ---------- PDF hochladen ---------- */
async function ladeHoch(datei) {
  if (!datei || !datei.inhalt) return null;
  const form = new FormData();
  form.append('file', new Blob([datei.inhalt], { type: 'application/pdf' }), datei.name || 'Rapport.pdf');
  const f = await bk('/files/attachment_file', { methode: 'POST', form });
  return f && f.key ? f : null;
}

/* ---------- Nachricht senden ---------- */
// pnr: Personalnummer des Hauswarts · text: Nachrichtentext · datei: {name, inhalt} oder null
export async function sendeChat(pnr, text, datei) {
  if (!chatBereit()) return { ok: false, stand: 'aus' };
  if (!String(pnr || '').trim() || !String(text || '').trim()) return { ok: false, stand: 'unvollstaendig' };
  let karte;
  try { karte = await benutzerKarte(); }
  catch (e) { console.error('Beekeeper Benutzerliste', e); return { ok: false, stand: 'fehler', fehler: String(e.message || e).slice(0, 200) }; }
  let u = karte.get(String(pnr).trim());
  if (!u) {                                   // neu angelegte Mitarbeitende: Liste einmal frisch holen
    try { u = (await benutzerKarte({ frisch: true })).get(String(pnr).trim()); } catch (e) { /* unten behandelt */ }
  }
  if (!u) return { ok: false, stand: 'kein_konto' };
  try {
    const anhang = await ladeHoch(datei);
    await bk(`/chats/users/${u.id}/messages?apply_rich_text=false`, {
      methode: 'POST', body: { body: text, ...(anhang ? { attachment: anhang } : {}) }
    });
    return { ok: true, stand: 'gesendet', an: u.name, mitPdf: !!anhang };
  } catch (e) {
    console.error('Beekeeper Chat', e);
    return { ok: false, stand: 'fehler', fehler: String(e.message || e).slice(0, 200) };
  }
}

/* Zusätzliche Kopie an eine feste Personalnummer (z. B. Abteilungsleitung), wenn gesetzt */
export async function sendeKopie(text, datei) {
  const nr = String(process.env.BEEKEEPER_KOPIE || '').trim();
  if (!nr) return null;
  return sendeChat(nr, text, datei);
}
