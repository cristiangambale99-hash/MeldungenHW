// Zugriff auf die Supabase-Datenbank «Hauswartung» – nur über die abgesicherten Funktionen (RPC).
// Umgebungsvariablen: SUPABASE_URL, SUPABASE_KEY (Publishable Key), HW_DB_SECRET (Server-Geheimnis)
export function dbBereit() {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_KEY && process.env.HW_DB_SECRET);
}

export async function rpc(funktion, parameter = {}) {
  const url = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_KEY;
  if (!url || !key || !process.env.HW_DB_SECRET) throw new Error('Datenbank nicht konfiguriert (SUPABASE_URL, SUPABASE_KEY, HW_DB_SECRET)');
  const kopf = { apikey: key, 'Content-Type': 'application/json' };
  if (key.startsWith('eyJ')) kopf.Authorization = 'Bearer ' + key;   // alter «anon»-Schlüssel
  const r = await fetch(`${url}/rest/v1/rpc/${funktion}`, {
    method: 'POST', headers: kopf,
    body: JSON.stringify({ p_s: process.env.HW_DB_SECRET, ...parameter })
  });
  const text = await r.text();
  let j = null; try { j = text ? JSON.parse(text) : null; } catch (_) { }
  if (!r.ok) {
    const e = new Error((j && (j.message || j.hint)) || text || ('Datenbank ' + r.status));
    e.code = (j && j.message) || 'db_' + r.status; e.status = r.status;
    throw e;
  }
  return j;
}
