import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAction, needsConfirm } from '../lib/actions.js';

test('validateAction allows core tools', () => {
  for (const t of ['navigate', 'read', 'click', 'type', 'scroll', 'js', 'screenshot', 'stop'])
    validateAction({ tool: t });
});

test('validateAction rejects unknown tool', () => {
  assert.throws(() => validateAction({ tool: 'launch' }), /unknown tool/);
});

test('needsConfirm requires approval for click on new domain', () => {
  assert.equal(needsConfirm({ tool: 'click', ref: 'ref_1' }, { approvedDomains: new Set() }), true);
  assert.equal(needsConfirm({ tool: 'read' }, { approvedDomains: new Set() }), false);
});

test('system pages allow navigate only', () => {
  assert.throws(() => validateAction({ tool: 'click' }, { url: 'chrome://settings' }), /navigate only/);
});
