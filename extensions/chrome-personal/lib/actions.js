const CORE = new Set(['navigate', 'read', 'click', 'type', 'scroll', 'screenshot', 'stop']);

export function isSystemPage(url = '') {
  return /^(chrome:\/\/|chrome-extension:\/\/|about:|edge:\/\/|devtools:\/\/|chrome-untrusted:\/\/|view-source:)/.test(url) ||
    url.includes('chromewebstore.google.com') || url.includes('chrome.google.com/webstore');
}

export function validateAction(a, { url = '' } = {}) {
  if (!a || !CORE.has(a.tool)) throw new Error('unknown tool: ' + a?.tool);
  if (isSystemPage(url) && a.tool !== 'navigate') throw new Error('system pages: navigate only');
  if (a.tool === 'click' && !a.ref) throw new Error('click requires ref');
  if (a.tool === 'type' && (!a.ref || a.text == null)) throw new Error('type requires ref + text');
  if (a.tool === 'navigate' && !a.url) throw new Error('navigate requires url');
  if (a.tool === 'navigate' && !/^https?:\/\//.test(a.url)) throw new Error('navigate requires http(s) url');
  if (a.tool === 'js' && !a.code) throw new Error('js requires code');
  return true;
}

// Ask-first for anything that changes the page; read-only stays silent.
export function needsConfirm(a) {
  return !(a.tool === 'read' || a.tool === 'screenshot' || a.tool === 'stop');
}
