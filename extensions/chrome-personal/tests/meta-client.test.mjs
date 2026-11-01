import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAction, chatAction } from '../lib/meta-client.js';

test('parseAction accepts known click action', () => {
  assert.deepEqual(parseAction('{"tool":"click","ref":"ref_3"}'), { tool: 'click', ref: 'ref_3' });
});

test('parseAction rejects unknown tool', () => {
  assert.throws(() => parseAction('{"tool":"launch_missiles"}'), /unknown tool/);
});

test('parseAction picks first valid action from chatty reply', () => {
  const r = parseAction('Sure:\n{"tool":"read"}\nand also {"tool":"click","ref":"ref_9"}');
  assert.equal(r.tool, 'read');
});

test('chatAction errors when key is missing', async () => {
  await assert.rejects(() => chatAction({ baseUrl: 'https://x', key: '', model: 'm', messages: [] }), /missing Meta API key/);
});

test('chatAction returns parsed action from stubbed fetch', async () => {
  const stub = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '{"tool":"stop","note":"done"}' } }] }) });
  const r = await chatAction({ baseUrl: 'https://x', key: 'k', model: 'm', messages: [{ role: 'user', content: 'hi' }], fetchImpl: stub });
  assert.equal(r.tool, 'stop');
});
