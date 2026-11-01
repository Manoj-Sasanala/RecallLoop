const ALLOWED_TOOLS = new Set(['navigate', 'read', 'click', 'type', 'scroll', 'js', 'screenshot', 'stop']);

// Balanced-brace scan; first valid action wins so chatty replies stay safe.
export function parseAction(text) {
  const s = String(text || '');
  let unknown = null;
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '{') continue;
    let depth = 0, inStr = false, esc = false, end = -1;
    for (let j = i; j < s.length; j++) {
      const c = s[j];
      if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; }
      else if (c === '"') inStr = true;
      else if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) { end = j; break; } }
    }
    if (end < 0) break;
    let o;
    try { o = JSON.parse(s.slice(i, end + 1)); } catch { i = end; continue; }
    if (o.tool && ALLOWED_TOOLS.has(o.tool)) return o;
    if (o.tool) unknown = o.tool;
    i = end;
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
    body: JSON.stringify({ model, messages, temperature: 0.2, max_tokens: 4096 }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) throw new Error('Meta API error: ' + res.status);
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content || '';
  try { return parseAction(content); }
  catch (e) {
    if (/unknown tool/.test(e.message)) throw new Error('Meta model used an unknown action: ' + e.message);
    return { tool: 'stop', note: content.slice(0, 2000) };
  }
}
