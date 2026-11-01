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

test('parseAction handles nested braces in text', () => {
  const r = parseAction('do {"tool":"type","ref":"ref_2","text":"say {hello} now"} please');
  assert.deepEqual(r, { tool: 'type', ref: 'ref_2', text: 'say {hello} now' });
});

test('chatAction errors when key is missing', async () => {
  await assert.rejects(() => chatAction({ baseUrl: 'https://x', key: '', model: 'm', messages: [] }), /missing Meta API key/);
});

test('chatAction surfaces unknown tool instead of silent stop', async () => {
  const stub = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '{"tool":"launch_missiles"}' } }] }) });
  await assert.rejects(() => chatAction({ baseUrl: 'https://x', key: 'k', model: 'm', messages: [], fetchImpl: stub }), /unknown action/);
});

test('chatAction requests a budget that fits reasoning models', async () => {
  let body = null;
  const stub = async (url, init) => { body = JSON.parse(init.body); return { ok: true, json: async () => ({ choices: [{ message: { content: '{"tool":"stop"}' } }] }) }; };
  await chatAction({ baseUrl: 'https://x', key: 'k', model: 'm', messages: [], fetchImpl: stub });
  assert.ok(body.max_tokens >= 2048, 'max_tokens=' + body.max_tokens);
});

test('chatAction returns parsed action from stubbed fetch', async () => {
  const stub = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '{"tool":"stop","note":"done"}' } }] }) });
  const r = await chatAction({ baseUrl: 'https://x', key: 'k', model: 'm', messages: [{ role: 'user', content: 'hi' }], fetchImpl: stub });
  assert.equal(r.tool, 'stop');
});
