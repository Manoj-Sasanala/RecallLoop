const CORE = new Set(['navigate', 'read', 'click', 'type', 'scroll', 'js', 'screenshot', 'stop']);

export function isSystemPage(url = '') {
  return /^(chrome:\/\/|chrome-extension:\/\/|about:|edge:\/\/)/.test(url) ||
    url.includes('chromewebstore.google.com');
}

export function validateAction(a, { url = '' } = {}) {
  if (!a || !CORE.has(a.tool)) throw new Error('unknown tool: ' + a?.tool);
  if (isSystemPage(url) && a.tool !== 'navigate') throw new Error('system pages: navigate only');
  return true;
}

// Ask-first on a new domain, and always before click/type/submit-like acts.
export function needsConfirm(a, { approvedDomains = new Set(), domain = '' } = {}) {
  if (a.tool === 'read' || a.tool === 'screenshot' || a.tool === 'stop') return false;
  if (domain && approvedDomains.has(domain)) return ['type'].includes(a.tool) ? true : false;
  return true;
}
