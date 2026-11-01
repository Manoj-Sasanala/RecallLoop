import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAction, needsConfirm, isSystemPage } from '../lib/actions.js';

test('validateAction allows core tools', () => {
  validateAction({ tool: 'read' });
  validateAction({ tool: 'stop' });
  validateAction({ tool: 'navigate', url: 'https://example.com' });
  validateAction({ tool: 'click', ref: 'ref_1' });
});

test('validateAction rejects unknown tool', () => {
  assert.throws(() => validateAction({ tool: 'launch' }), /unknown tool/);
});

test('validateAction requires params per tool', () => {
  assert.throws(() => validateAction({ tool: 'click' }), /ref/);
  assert.throws(() => validateAction({ tool: 'navigate' }), /url/);
  assert.throws(() => validateAction({ tool: 'js', }), /code/);
  assert.throws(() => validateAction({ tool: 'type', ref: 'ref_1' }), /text/);
});

test('needsConfirm asks every sensitive action even on approved domains', () => {
  const approved = { approvedDomains: new Set(['x.com']), domain: 'x.com' };
  for (const t of ['click', 'type', 'js', 'navigate', 'scroll'])
    assert.equal(needsConfirm({ tool: t }, approved), true, t);
  assert.equal(needsConfirm({ tool: 'read' }, approved), false);
  assert.equal(needsConfirm({ tool: 'screenshot' }, approved), false);
  assert.equal(needsConfirm({ tool: 'stop' }, approved), false);
});

test('needsConfirm requires approval for click on new domain', () => {
  assert.equal(needsConfirm({ tool: 'click', ref: 'ref_1' }, { approvedDomains: new Set() }), true);
  assert.equal(needsConfirm({ tool: 'read' }, { approvedDomains: new Set() }), false);
});

test('system pages allow navigate only', () => {
  assert.throws(() => validateAction({ tool: 'click', ref: 'ref_1' }, { url: 'chrome://settings' }), /navigate only/);
});

test('isSystemPage covers store, devtools, view-source', () => {
  for (const u of ['devtools://x', 'chrome-untrusted://x', 'view-source:https://y', 'https://chrome.google.com/webstore/z'])
    assert.equal(isSystemPage(u), true, u);
});
