// shortcut: default model/base are guesses, user overrides in options page.
const DEFAULTS = { baseUrl: 'https://api.llama.com/compat/v1', metaModel: '' };

export async function GET_OPTIONS() {
  const s = await chrome.storage.local.get(['metaApiKey', 'metaModel', 'baseUrl']);
  return {
    metaApiKey: s.metaApiKey || '',
    metaModel: s.metaModel || DEFAULTS.metaModel,
    baseUrl: (s.baseUrl || DEFAULTS.baseUrl).replace(/\/$/, ''),
  };
}

async function init() {
  const o = await GET_OPTIONS();
  document.getElementById('key').value = o.metaApiKey;
  document.getElementById('model').value = o.metaModel;
  document.getElementById('base').value = o.baseUrl;
  document.getElementById('save').onclick = async () => {
    await chrome.storage.local.set({
      metaApiKey: document.getElementById('key').value.trim(),
      metaModel: document.getElementById('model').value.trim(),
      baseUrl: document.getElementById('base').value.trim() || DEFAULTS.baseUrl,
    });
    document.getElementById('status').textContent = 'Saved on this machine only.';
  };
}
init();
