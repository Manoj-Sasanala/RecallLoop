// Clean-room accessibility snapshot. No code from the original extension.
const ROLE_MAP = { A: 'link', BUTTON: 'button', INPUT: 'textbox', SELECT: 'combobox', TEXTAREA: 'textbox', H1: 'heading', H2: 'heading', H3: 'heading' };

const SENSITIVE_ATTRS = /pass|secret|token|ssn|card|cc-number|cvv|cvc|iban|account|ssn/i;
const CARD_DIGITS = /(\d[\s•*-]*){4}/;

export function snapshotFromNode(root, { maxChars = 50000, depth = 15 } = {}) {
  let n = 0;
  const lines = [];
  const walk = (node, d) => {
    if (!node || d > depth) return;
    const role = ROLE_MAP[node.tagName] || (node.children?.length ? 'container' : 'text');
    if (['button', 'link', 'textbox', 'combobox', 'heading'].includes(role)) {
      n += 1;
      try { node.setAttribute?.('data-personal-ref', 'ref_' + n); } catch {}
      const type = (node.getAttribute?.('type') || '').toLowerCase();
      const hay = [node.getAttribute?.('aria-label'), node.getAttribute?.('name'), node.getAttribute?.('id'), node.getAttribute?.('placeholder'), node.getAttribute?.('autocomplete')].join(' ');
      const rawName = (node.getAttribute?.('aria-label') || node.getAttribute?.('placeholder') || node.textContent || '').trim().slice(0, 80);
      const sensitive = type === 'password' || node.tagName === 'TEXTAREA' ||
        SENSITIVE_ATTRS.test(hay) || CARD_DIGITS.test(rawName);
      const name = sensitive ? '[redacted]' : rawName;
      lines.push(`${'  '.repeat(Math.min(d, 8))}${role} "${name}" [ref_${n}]`);
    }
    for (const c of (node.children || [])) walk(c, d + 1);
  };
  walk(root, 0);
  let tree = lines.join('\n');
  if (tree.length > maxChars) tree = tree.slice(0, maxChars) + '\n…truncated, narrow scope…';
  return { tree, refCount: n };
}

// Browser hook: injected via chrome.scripting.executeScript by the worker.
if (typeof window !== 'undefined') {
  window.__personalSnapshot = (filter, depth, maxChars) =>
    snapshotFromNode(document.body, { maxChars: maxChars || 50000, depth: depth || 15 }).tree;
}
