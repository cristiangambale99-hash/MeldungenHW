// Vercel Serverless Function: übersetzt den Einsatzbeschrieb der Hauswarte ins Deutsche.
// Benötigt die Umgebungsvariable DEEPL_API_KEY (Vercel > Project > Settings > Environment Variables).
// Free-Keys enden auf ":fx" und laufen automatisch über api-free.deepl.com.

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Nur POST erlaubt' });

  // Nur Aufrufe von der eigenen App zulassen (schützt das Übersetzungskontingent)
  const origin = req.headers.origin || '';
  const host = req.headers.host || '';
  if (origin && !origin.endsWith('//' + host)) return res.status(403).json({ error: 'Nicht erlaubt' });

  const text = req.body && typeof req.body.text === 'string' ? req.body.text.trim() : '';
  if (!text) return res.status(400).json({ error: 'Text fehlt' });
  if (text.length > 5000) return res.status(413).json({ error: 'Text zu lang' });

  const key = process.env.DEEPL_API_KEY;
  if (!key) return res.status(500).json({ error: 'DEEPL_API_KEY ist nicht gesetzt' });
  const base = key.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com';

  try {
    const r = await fetch(base + '/v2/translate', {
      method: 'POST',
      headers: { Authorization: 'DeepL-Auth-Key ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: [text], target_lang: 'DE', preserve_formatting: true })
    });
    if (!r.ok) return res.status(502).json({ error: 'DeepL antwortet mit ' + r.status });
    const j = await r.json();
    const t = j.translations && j.translations[0];
    // Schweizer Schreibweise: ss statt ß
    return res.status(200).json({ text_de: (t.text || '').replace(/ß/g, 'ss'), sprache: t.detected_source_language || '' });
  } catch (e) {
    return res.status(502).json({ error: 'Übersetzung nicht erreichbar' });
  }
}
