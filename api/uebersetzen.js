// Vercel Serverless Function: übersetzt die Texte der Hauswarte automatisch ins Deutsche.
// 1. Wahl: DeepL (Umgebungsvariable DEEPL_API_KEY, Free-Keys enden auf ":fx").
// Ohne Schlüssel oder bei einer Störung von DeepL springt automatisch ein Ersatzdienst ein,
// damit IMMER übersetzt wird. Für den Dauerbetrieb wird DeepL empfohlen (Qualität, Datenschutz).
// Test im Browser: /api/uebersetzen?test=Buongiorno

const schweiz = s => String(s || '').replace(/ß/g, 'ss');

async function deepl(texte, key) {
  const base = key.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com';
  const r = await fetch(base + '/v2/translate', {
    method: 'POST',
    headers: { Authorization: 'DeepL-Auth-Key ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: texte, target_lang: 'DE', preserve_formatting: true })
  });
  if (!r.ok) throw new Error('DeepL ' + r.status);
  const tr = (await r.json()).translations || [];
  return { texte_de: tr.map(t => schweiz(t.text)), sprache: (tr[0] && tr[0].detected_source_language) || '', dienst: 'DeepL' };
}

async function ersatz(texte) {
  const texte_de = []; let sprache = '';
  for (const t of texte) {
    const r = await fetch('https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=de&dt=t&q=' + encodeURIComponent(t));
    if (!r.ok) throw new Error('Ersatzdienst ' + r.status);
    const j = await r.json();
    texte_de.push(schweiz((j[0] || []).map(x => x[0]).join('')));
    if (!sprache) sprache = String(j[2] || '').toUpperCase();
  }
  return { texte_de, sprache, dienst: 'Ersatz' };
}

export default async function handler(req, res) {
  let texte;
  if (req.method === 'GET' && req.query && req.query.test) texte = [String(req.query.test)];
  else if (req.method === 'POST') {
    const origin = req.headers.origin || '', host = req.headers.host || '';
    if (origin && !origin.endsWith('//' + host)) return res.status(403).json({ error: 'Nicht erlaubt' });
    const body = req.body || {};
    texte = (Array.isArray(body.texte) ? body.texte : [body.text]).filter(t => typeof t === 'string' && t.trim()).map(t => t.trim());
  } else return res.status(405).json({ error: 'Nur POST erlaubt' });

  if (!texte.length) return res.status(400).json({ error: 'Text fehlt' });
  if (texte.length > 10 || texte.join('').length > 8000) return res.status(413).json({ error: 'Text zu lang' });

  const fehler = [];
  const key = process.env.DEEPL_API_KEY;
  if (key) { try { return res.status(200).json(await deepl(texte, key)); } catch (e) { fehler.push(String(e.message || e)); } }
  try { const j = await ersatz(texte); return res.status(200).json({ ...j, text_de: j.texte_de[0] }); }
  catch (e) { fehler.push(String(e.message || e)); }
  return res.status(502).json({ error: 'Übersetzung nicht erreichbar', details: fehler });
}
