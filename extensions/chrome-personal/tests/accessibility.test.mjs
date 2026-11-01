import test from 'node:test';
import assert from 'node:assert/strict';
import { snapshotFromNode } from '../content/accessibility.js';

const el = (tag, attrs = {}, children = [], text = '') => ({
  tagName: tag, children, textContent: text,
  getAttribute: (k) => attrs[k] ?? null,
});

test('snapshot names button with ref and caps output', () => {
  const root = el('DIV', {}, [el('BUTTON', {}, [], 'Search'), el('A', { href: '/x' }, [], 'Go')]);
  const r = snapshotFromNode(root, { maxChars: 50000 });
  assert.match(r.tree, /button "Search" \[ref_1\]/);
  assert.match(r.tree, /link "Go" \[ref_2\]/);
});

test('snapshot redacts password and sensitive inputs', () => {
  const root = el('DIV', {}, [
    el('INPUT', { type: 'password', 'aria-label': 'Secret hunter2' }),
    el('TEXTAREA', {}, [], 'my private diary text'),
  ]);
  const r = snapshotFromNode(root, { maxChars: 50000 });
  assert.doesNotMatch(r.tree, /hunter2/);
  assert.doesNotMatch(r.tree, /private diary/);
  assert.match(r.tree, /\[redacted\]/);
});

test('snapshot redacts card-like digits and sensitive ids', () => {
  const root = el('DIV', {}, [
    el('INPUT', { id: 'cc-number', autocomplete: 'cc-number' }),
    el('BUTTON', {}, [], 'Pay •••• 4242'),
  ]);
  const r = snapshotFromNode(root, { maxChars: 50000 });
  assert.doesNotMatch(r.tree, /4242/);
  assert.match(r.tree, /\[redacted\]/);
});

test('snapshot respects maxChars with truncation note', () => {
  const root = el('DIV', {}, [el('BUTTON', {}, [], 'A'.repeat(100))]);
  const r = snapshotFromNode(root, { maxChars: 40 });
  assert.match(r.tree, /truncated/);
});
