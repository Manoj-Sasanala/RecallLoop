import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'content', 'cursor.js'), 'utf8');
const need = ['__personalCursor', 'translate(', 'setTimeout'];
for (const k of need) if (!src.includes(k)) { console.error('FAIL: cursor.js missing ' + k); process.exit(1); }
console.log('PASS cursor overlay');
