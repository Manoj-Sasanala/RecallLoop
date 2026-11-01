import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fail = (m) => { console.error('FAIL: ' + m); process.exit(1); };
const mfPath = join(root, 'manifest.json');
if (!existsSync(mfPath)) fail('manifest.json missing');
const mf = JSON.parse(readFileSync(mfPath, 'utf8'));
if (mf.manifest_version !== 3) fail('manifest_version must be 3');
if (!mf.side_panel?.default_path) fail('side_panel.default_path missing');
if (mf.background?.service_worker == null) fail('background.service_worker missing');
const allowed = new Set(['sidePanel','storage','activeTab','scripting','tabs','alarms','notifications','offscreen']);
for (const p of (mf.permissions || [])) if (!allowed.has(p)) fail('permission not allowed for v1: ' + p);
// SW fetch() to the Meta endpoint needs an explicit host permission in MV3.
if (!((mf.host_permissions || []).some((h) => h.includes('api.llama.com')))) fail('host_permissions must cover the Meta API host');
if (!existsSync(join(root, 'options.html'))) fail('options.html missing');
if (!existsSync(join(root, 'options.js'))) fail('options.js missing');
const opt = readFileSync(join(root, 'options.js'), 'utf8');
if (!opt.includes('chrome.storage.local')) fail('options.js must use chrome.storage.local only');
if (opt.includes('chrome.storage.sync')) fail('options.js must not use chrome.storage.sync');
console.log('PASS manifest + options scaffold');
