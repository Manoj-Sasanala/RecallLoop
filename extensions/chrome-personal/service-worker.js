import { chatAction } from './lib/meta-client.js';
import { validateAction, needsConfirm } from './lib/actions.js';

const MAX_STEPS = 15;
const approvedDomains = new Set();
let running = false;

async function snapshot(tabId) {
  const [r] = await chrome.scripting.executeScript({
    target: { tabId }, files: ['content/accessibility.js'],
  }).catch(() => [null]);
  const [t] = await chrome.scripting.executeScript({
    target: { tabId }, func: () => (window.__personalSnapshot ? window.__personalSnapshot('interactive', 15, 20000) : 'snapshot unavailable'),
  });
  return t?.result || 'snapshot unavailable';
}

async function act(tabId, a) {
  if (a.tool === 'navigate') return chrome.tabs.update(tabId, { url: a.url });
  if (a.tool === 'read' || a.tool === 'screenshot') return snapshot(tabId);
  await chrome.scripting.executeScript({ target: { tabId }, files: ['content/cursor.js'] }).catch(() => {});
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (act) => {
      if (act.tool === 'click' || act.tool === 'type') window.__personalCursor?.(innerWidth / 2, innerHeight / 2, true);
      if (act.tool === 'js') return eval(act.code);
      return 'ok';
    },
    args: [a],
  });
  return snapshot(tabId);
}

async function runTask(tabId, goal) {
  if (running) return;
  running = true;
  try {
    const tab = await chrome.tabs.get(tabId);
    const opts = await chrome.storage.local.get(['metaApiKey', 'metaModel', 'baseUrl']);
    const messages = [{ role: 'system', content: 'You drive one Chrome tab. Reply with one JSON action only: navigate/read/click/type/scroll/js/screenshot/stop. Page snapshot follows.' }, { role: 'user', content: goal }];
    for (let i = 0; i < MAX_STEPS; i++) {
      const snap = await snapshot(tabId);
      messages.push({ role: 'user', content: `URL: ${tab.url}\nSNAPSHOT:\n${snap}` });
      const action = await chatAction({ baseUrl: opts.baseUrl, key: opts.metaApiKey, model: opts.metaModel, messages });
      validateAction(action, { url: tab.url });
      const domain = new URL(tab.url).hostname;
      if (needsConfirm(action, { approvedDomains, domain })) {
        chrome.notifications.create({ type: 'basic', iconUrl: 'icon-128.png', title: 'Approve action?', message: JSON.stringify(action).slice(0, 180) });
        return;
      }
      approvedDomains.add(domain);
      const obs = await act(tabId, action);
      messages.push({ role: 'user', content: `OBS: ${String(obs).slice(0, 4000)}` });
      if (action.tool === 'stop') return;
    }
  } finally { running = false; }
}

chrome.runtime.onMessage.addListener((m, sender, reply) => {
  if (m.type === 'RUN_TASK') runTask(m.tabId, m.goal);
  if (m.type === 'SW_KEEPALIVE') reply?.('alive');
});
chrome.alarms.onAlarm.addListener(() => {});
