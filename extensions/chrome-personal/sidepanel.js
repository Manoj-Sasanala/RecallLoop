const logEl = document.getElementById('log');
const confirmBox = document.createElement('div');
confirmBox.style.display = 'none';
document.body.insertBefore(confirmBox, document.getElementById('goal'));
const log = (t) => { logEl.textContent += t + '\n'; };
let pendingAction = null;

document.getElementById('go').onclick = async () => {
  const s = await chrome.storage.local.get(['metaApiKey', 'metaModel']);
  if (!s.metaApiKey || !s.metaModel) { log('Set your Meta key + model in options first.'); return; }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  log('Running on tab ' + tab.id);
  chrome.runtime.sendMessage({ type: 'RUN_TASK', tabId: tab.id, goal: document.getElementById('goal').value });
};
document.getElementById('stop').onclick = () => {
  chrome.runtime.sendMessage({ type: 'STOP_TASK' });
  log('Stop requested (halts at next step).');
};

chrome.runtime.onMessage.addListener((m) => {
  if (m.type === 'TASK_ERROR' || m.type === 'TASK_DONE') { confirmBox.style.display = 'none'; pendingAction = null; log(m.type + ': ' + m.message); }
  if (m.type === 'TASK_CONFIRM') {
    pendingAction = m.action;
    confirmBox.style.display = 'block';
    confirmBox.innerHTML = '';
    const p = document.createElement('p');
    p.textContent = 'Approve this page action? ' + m.message;
    const ok = document.createElement('button');
    ok.textContent = 'Approve once';
    ok.onclick = () => { chrome.runtime.sendMessage({ type: 'TASK_APPROVE', action: pendingAction }); confirmBox.style.display = 'none'; log('Approved: ' + m.message); };
    const no = document.createElement('button');
    no.textContent = 'Deny';
    no.onclick = () => { chrome.runtime.sendMessage({ type: 'TASK_DENY' }); confirmBox.style.display = 'none'; log('Denied.'); };
    confirmBox.append(p, ok, no);
  }
});
chrome.storage.local.get(['metaApiKey']).then((s) => {
  if (s.metaApiKey) document.getElementById('banner').style.display = 'none';
});
