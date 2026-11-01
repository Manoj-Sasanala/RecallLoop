const log = (t) => { document.getElementById('log').textContent += t + '\n'; };
document.getElementById('go').onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const goal = document.getElementById('goal').value;
  log('Running on tab ' + tab.id);
  chrome.runtime.sendMessage({ type: 'RUN_TASK', tabId: tab.id, goal });
};
document.getElementById('stop').onclick = () => log('Stop requested (next step halts).');
chrome.storage.local.get(['metaApiKey']).then((s) => {
  if (s.metaApiKey) document.getElementById('banner').style.display = 'none';
});
