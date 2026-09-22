// Vercel Serverless Function: übersetzt den Einsatzbeschrieb der Hauswarte ins Deutsche.
// Benötigt die Umgebungsvariable DEEPL_API_KEY (Vercel > Project > Settings > Environment Variables).
// Free-Keys enden auf ":fx" und laufen automatisch über api-free.deepl.com.

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Nur POST erlaubt' });

  // Nur Aufrufe von der eigenen App zulassen (schützt das Übersetzungskontingent)
  const origin = req.headers.origin || '';
  const host = req.headers.host || '';
  if (origin && !origin.endsWith('//' + host)) return res.status(403).json({ error: 'Nicht erlaubt' });

  // Akzeptiert { texte: [...] } (mehrere Felder) oder { text: '...' }
  const body = req.body || {};
  const texte = (Array.isArray(body.texte) ? body.texte : [body.text]).filter(t => typeof t === 'string' && t.trim()).map(t => t.trim());
  if (!texte.length) return res.status(400).json({ error: 'Text fehlt' });
  if (texte.length > 10 || texte.join('').length > 8000) return res.status(413).json({ error: 'Text zu lang' });

  const key = process.env.DEEPL_API_KEY;
  if (!key) return res.status(500).json({ error: 'DEEPL_API_KEY ist nicht gesetzt' });
  const base = key.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com';

  try {
    const r = await fetch(base + '/v2/translate', {
      method: 'POST',
      headers: { Authorization: 'DeepL-Auth-Key ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: texte, target_lang: 'DE', preserve_formatting: true })
    });
    if (!r.ok) return res.status(502).json({ error: 'DeepL antwortet mit ' + r.status });
    const j = await r.json();
    const tr = j.translations || [];
    // Schweizer Schreibweise: ss statt ß; Sprache wird am Haupttext (erstes Feld) erkannt
    const texte_de = tr.map(t => (t.text || '').replace(/ß/g, 'ss'));
    return res.status(200).json({ texte_de, text_de: texte_de[0] || '', sprache: (tr[0] && tr[0].detected_source_language) || '' });
  } catch (e) {
    return res.status(502).json({ error: 'Übersetzung nicht erreichbar' });
  }
}
