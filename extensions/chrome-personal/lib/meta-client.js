const ALLOWED_TOOLS = new Set(['navigate', 'read', 'click', 'type', 'scroll', 'js', 'screenshot', 'stop']);

// Scan candidate {...} blocks; first valid action wins so chatty replies stay safe.
export function parseAction(text) {
  const s = String(text || '');
  let unknown = null;
  for (const m of s.matchAll(/\{[^{}]*\}/g)) {
    let o;
    try { o = JSON.parse(m[0]); } catch { continue; }
    if (o.tool && ALLOWED_TOOLS.has(o.tool)) return o;
    if (o.tool) unknown = o.tool;
  }
  if (unknown) throw new Error('unknown tool: ' + unknown);
  throw new Error('no action JSON found');
}

export async function chatAction({ baseUrl, key, model, messages, fetchImpl }) {
  if (!key) throw new Error('missing Meta API key — paste it in the options page');
  if (!model) throw new Error('missing Meta model — set it in the options page');
  const fetchFn = fetchImpl || fetch;
  const res = await fetchFn(String(baseUrl).replace(/\/$/, '') + '/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
    body: JSON.stringify({ model, messages, temperature: 0.2, max_tokens: 800 }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) throw new Error('Meta API error: ' + res.status);
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content || '';
  try { return parseAction(content); }
  catch { return { tool: 'stop', note: content.slice(0, 2000) }; }
}
