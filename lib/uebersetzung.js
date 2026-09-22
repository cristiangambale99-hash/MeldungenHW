// Übersetzung ins Deutsche: 1. DeepL (DEEPL_API_KEY), sonst automatisch der Ersatzdienst.
import { fachbegriffe } from './glossar.js';

async function deepl(texte, key) {
  const base = key.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com';
  const r = await fetch(base + '/v2/translate', {
    method: 'POST',
    headers: { Authorization: 'DeepL-Auth-Key ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: texte, target_lang: 'DE', preserve_formatting: true })
  });
  if (!r.ok) throw new Error('DeepL ' + r.status);
  const tr = (await r.json()).translations || [];
  return { texte_de: tr.map(t => fachbegriffe(t.text)), sprache: String((tr[0] && tr[0].detected_source_language) || '').toUpperCase(), dienst: 'DeepL' };
}

async function ersatz(texte) {
  const texte_de = []; let sprache = '';
  for (const t of texte) {
    const r = await fetch('https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=de&dt=t&q=' + encodeURIComponent(t));
    if (!r.ok) throw new Error('Ersatzdienst ' + r.status);
    const j = await r.json();
    texte_de.push(fachbegriffe((j[0] || []).map(x => x[0]).join('')));
    if (!sprache) sprache = String(j[2] || '').toUpperCase();
  }
  return { texte_de, sprache, dienst: 'Ersatz' };
}

export async function uebersetzeTexte(texte) {
  const fehler = [];
  const key = process.env.DEEPL_API_KEY;
  if (key) { try { return await deepl(texte, key); } catch (e) { fehler.push(String(e.message || e)); } }
  for (let versuch = 0; versuch < 2; versuch++) {
    try { return await ersatz(texte); }
    catch (e) { fehler.push(String(e.message || e)); await new Promise(r => setTimeout(r, 800)); }
  }
  const e = new Error('Übersetzung nicht erreichbar: ' + fehler.join(' · '));
  e.details = fehler; throw e;
}
