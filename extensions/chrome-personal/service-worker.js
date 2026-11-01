import { chatAction } from './lib/meta-client.js';
import { validateAction, needsConfirm, isSystemPage } from './lib/actions.js';

const MAX_STEPS = 15;
const DEFAULT_BASE = 'https://api.meta.ai/v1';
let running = false;
let stopRequested = false;

const sess = {
  async get(k) { try { return await chrome.storage.session.get(k); } catch { return {}; } },
  async set(o) { try { await chrome.storage.session.set(o); } catch {} },
  async remove(k) { try { await chrome.storage.session.remove(k); } catch {} },
};

function tell(type, payload = {}) {
  try { chrome.runtime.sendMessage({ type, ...payload }); } catch {}
  try {
    chrome.notifications.create({ type: 'basic', iconUrl: 'icon-128.png', title: 'Personal agent', message: String(payload.message || type).slice(0, 180) });
  } catch {}
}

async function ensureOffscreen() {
  try {
    if (chrome.offscreen?.createDocument) {
      const has = await chrome.offscreen.hasDocument?.().catch(() => false);
      if (!has) await chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['BLOBS'], justification: 'Keep agent loop alive past the 30s SW idle kill.' });
    }
  } catch {}
}

// Classic script (no import/export): ES modules throw when injected via files:[].
async function snapshot(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ['content/snapshot-classic.js'] });
  const [t] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => (window.__personalSnapshot ? window.__personalSnapshot('interactive', 15, 20000) : 'snapshot unavailable'),
  });
  return t?.result || 'snapshot unavailable';
}

// ref ids are real: the snapshot tags elements with data-personal-ref in walk order.
async function act(tabId, a) {
  if (a.tool === 'navigate') {
    await chrome.tabs.update(tabId, { url: a.url });
    await new Promise((resolve) => {
      const to = setTimeout(resolve, 10000);
      const listener = (id, info) => {
        if (id === tabId && info.status === 'complete') { clearTimeout(to); chrome.tabs.onUpdated.removeListener(listener); resolve(); }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });
    return snapshot(tabId);
  }
  if (a.tool === 'read' || a.tool === 'screenshot') return snapshot(tabId);
  await chrome.scripting.executeScript({ target: { tabId }, files: ['content/cursor.js'] }).catch(() => {});
  const [r] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (act) => {
      if (act.tool === 'js') return 'js-blocked-use-click-type';
      const el = document.querySelector(`[data-personal-ref="${act.ref || ''}"]`);
      if (!el) return 'ref not found: ' + (act.ref || '');
      const r = el.getBoundingClientRect();
      window.__personalCursor?.(r.left + r.width / 2, r.top + r.height / 2, true);
      if (act.tool === 'click') { el.scrollIntoView({ block: 'center' }); el.click(); return 'clicked ' + act.ref; }
      if (act.tool === 'type') {
        el.scrollIntoView({ block: 'center' }); el.focus();
        el.value = String(act.text ?? '').slice(0, 2000);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return 'typed into ' + act.ref;
      }
      return 'ok';
    },
    args: [a],
  });
  return (r?.result || 'done') + '\n' + await snapshot(tabId);
}

export async function runTask(tabId, goal, resumeState = null) {
  if (running && !resumeState) return;
  running = true;
  stopRequested = false;
  try {
    await ensureOffscreen();
    const startTab = await chrome.tabs.get(tabId).catch(() => null);
    if (!startTab) { tell('TASK_ERROR', { message: 'Tab closed before start.' }); return; }
    const startOrigin = new URL(startTab.url).origin;
    const raw = await chrome.storage.local.get(['metaApiKey', 'metaModel', 'baseUrl']);
    const opts = { metaApiKey: raw.metaApiKey || '', metaModel: raw.metaModel || '', baseUrl: (raw.baseUrl || DEFAULT_BASE).replace(/\/$/, '') };
    if (!opts.metaApiKey || !opts.metaModel) { tell('TASK_ERROR', { message: 'Set your Meta key + model in the options page first.' }); return; }

    // A fresh goal always starts fresh; only an approved resume continues a loop.
    let state = resumeState;
    if (!state) {
      await sess.remove('agentLoop');
      await sess.remove('agentConfirm');
    }
    let messages = state?.messages || [
      { role: 'system', content: 'You drive one Chrome tab. Reply with one JSON action only: navigate/read/click/type/scroll/screenshot/stop. Page snapshot follows.' },
      { role: 'user', content: goal },
    ];
    let step0 = state?.step || 0;

    for (let i = step0; i < MAX_STEPS; i++) {
      if (stopRequested) { tell('TASK_DONE', { message: 'Stopped by you.' }); return; }
      const tab = await chrome.tabs.get(tabId).catch(() => null);
      if (!tab) { tell('TASK_ERROR', { message: 'Tab closed — stopping.' }); return; }
      if (new URL(tab.url).origin !== startOrigin) {
        tell('TASK_ERROR', { message: 'Tab left the starting site — stopping for safety.' }); return;
      }
      let snap;
      try { snap = await snapshot(tabId); }
      catch { tell('TASK_ERROR', { message: 'Cannot read this page (system page?). Navigate to a normal web page first.' }); return; }
      messages.push({ role: 'user', content: `URL: ${tab.url}\nSNAPSHOT:\n${snap}` });
      let action;
      try { action = await chatAction({ baseUrl: opts.baseUrl, key: opts.metaApiKey, model: opts.metaModel, messages }); }
      catch (e) { tell('TASK_ERROR', { message: 'Meta API failed: ' + e.message }); return; }
      try { validateAction(action, { url: tab.url }); }
      catch (e) { tell('TASK_ERROR', { message: 'Model returned an unusable action: ' + e.message }); return; }
      if (needsConfirm(action)) {
        await sess.set({ agentLoop: { tabId, goal, messages, step: i } });
        tell('TASK_CONFIRM', { message: JSON.stringify(action), action });
        return;
      }
      messages.push({ role: 'assistant', content: JSON.stringify(action) });
      let obs;
      try { obs = await act(tabId, action); }
      catch (e) { tell('TASK_ERROR', { message: 'Action failed: ' + e.message }); return; }
      messages.push({ role: 'user', content: `OBS: ${String(obs).slice(0, 4000)}` });
      if (action.tool === 'stop') { tell('TASK_DONE', { message: action.note || 'Done.' }); return; }
    }
    tell('TASK_DONE', { message: 'Step budget reached (15).' });
  } finally { running = false; }
}

export async function resumeApproved() {
  // Consume the confirmation first so a double-click can't double-run.
  const c = await sess.get('agentConfirm');
  await sess.remove('agentConfirm');
  const action = c.agentConfirm;
  if (running) { if (action) await sess.set({ agentConfirm: action }); return; }
  if (!action) return;
  if (stopRequested) { await sess.remove('agentLoop'); tell('TASK_DONE', { message: 'Stopped by you.' }); return; }
  try { validateAction(action, {}); }
  catch (e) { await sess.remove('agentLoop'); tell('TASK_ERROR', { message: 'Approved action failed re-check: ' + e.message }); return; }
  const s = await sess.get('agentLoop');
  const pending = s.agentLoop;
  if (!pending) return;
  running = true;
  try {
    const tab = await chrome.tabs.get(pending.tabId).catch(() => null);
    if (!tab) { await sess.remove('agentLoop'); tell('TASK_ERROR', { message: 'Tab closed — stopping.' }); return; }
    let obs;
    try { obs = await act(pending.tabId, action); }
    catch (e) { await sess.remove('agentLoop'); tell('TASK_ERROR', { message: 'Action failed: ' + e.message }); return; }
    pending.messages.push({ role: 'assistant', content: JSON.stringify(action) });
    pending.messages.push({ role: 'user', content: `OBS: ${String(obs).slice(0, 4000)}` });
    pending.step += 1;
    await sess.set({ agentLoop: pending });
    running = false;
    await runTask(pending.tabId, pending.goal, pending);
  } finally { running = false; }
}

chrome.runtime.onMessage.addListener((m, sender, reply) => {
  if (m.type === 'RUN_TASK') runTask(m.tabId, m.goal);
  if (m.type === 'TASK_APPROVE') sess.set({ agentConfirm: m.action }).then(() => resumeApproved());
  if (m.type === 'TASK_DENY') sess.remove('agentLoop').then(() => tell('TASK_DONE', { message: 'Denied — stopped.' }));
  if (m.type === 'STOP_TASK') { stopRequested = true; }
  if (m.type === 'SW_KEEPALIVE') reply?.('alive');
});
chrome.alarms.onAlarm.addListener(() => {});
