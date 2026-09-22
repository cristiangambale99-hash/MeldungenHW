// Einfache, signierte Anmelde-Tokens (HMAC-SHA256) für Hauswarte und Admin.
// Umgebungsvariable: SESSION_SECRET
import crypto from 'node:crypto';

const geheim = () => {
  const s = process.env.SESSION_SECRET || process.env.HW_DB_SECRET;
  if (!s) throw new Error('SESSION_SECRET fehlt');
  return s;
};
const b64 = s => Buffer.from(s).toString('base64url');
const sig = daten => crypto.createHmac('sha256', geheim()).update(daten).digest('base64url');

export function erstelleToken(inhalt, tage) {
  const daten = b64(JSON.stringify({ ...inhalt, bis: Date.now() + tage * 864e5 }));
  return daten + '.' + sig(daten);
}

export function pruefeToken(token) {
  const [daten, s] = String(token || '').split('.');
  if (!daten || !s) return null;
  const soll = sig(daten);
  if (s.length !== soll.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(soll))) return null;
  try {
    const j = JSON.parse(Buffer.from(daten, 'base64url').toString());
    return j.bis > Date.now() ? j : null;
  } catch (_) { return null; }
}

export function gleich(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
