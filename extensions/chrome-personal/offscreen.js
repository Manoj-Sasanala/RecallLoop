// Keepalive: MV3 SW dies after ~30s idle; ping every 20s like the original.
setInterval(() => { chrome.runtime.sendMessage({ type: 'SW_KEEPALIVE' }).catch(() => {}); }, 20000);
