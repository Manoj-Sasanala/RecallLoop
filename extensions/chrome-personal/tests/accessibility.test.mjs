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

test('snapshot respects maxChars with truncation note', () => {
  const root = el('DIV', {}, [el('BUTTON', {}, [], 'A'.repeat(100))]);
  const r = snapshotFromNode(root, { maxChars: 40 });
  assert.match(r.tree, /truncated/);
});
