import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'content', 'snapshot-classic.js'), 'utf8');
for (const k of ['__personalSnapshot', 'data-personal-ref', '[redacted]', 'truncated']) {
  if (!src.includes(k)) { console.error('FAIL: snapshot-classic.js missing ' + k); process.exit(1); }
}
if (/^\s*(import|export)\s/m.test(src)) { console.error('FAIL: classic script must not use import/export'); process.exit(1); }
console.log('PASS snapshot classic injectable');
