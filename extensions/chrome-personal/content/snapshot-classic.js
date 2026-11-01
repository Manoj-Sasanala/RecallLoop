// Classic (non-module) snapshot for chrome.scripting files:[] injection.
// ES modules throw on `export` in classic context, so this file has no
// import/export. Logic mirrors content/accessibility.js snapshotFromNode.
(function () {
  var ROLE_MAP = { A: 'link', BUTTON: 'button', INPUT: 'textbox', SELECT: 'combobox', TEXTAREA: 'textbox', H1: 'heading', H2: 'heading', H3: 'heading' };
  var SENSITIVE = /pass|secret|token|ssn|card|cc-number|cvv|cvc|iban|account/i;
  var DIGITS = /(\d[\s•*-]*){4}/;
  function snapshot(root, opts) {
    opts = opts || {};
    var maxChars = opts.maxChars || 50000, depth = opts.depth || 15, n = 0, lines = [];
    function name(node) {
      var type = (node.getAttribute('type') || '').toLowerCase();
      var hay = [node.getAttribute('aria-label'), node.getAttribute('name'), node.getAttribute('id'), node.getAttribute('placeholder'), node.getAttribute('autocomplete')].join(' ');
      var raw = ((node.getAttribute('aria-label') || node.getAttribute('placeholder') || node.textContent || '').trim()).slice(0, 80);
      if (type === 'password' || node.tagName === 'TEXTAREA' || SENSITIVE.test(hay) || DIGITS.test(raw)) return '[redacted]';
      return raw;
    }
    function walk(node, d) {
      if (!node || d > depth) return;
      var role = ROLE_MAP[node.tagName] || (node.children && node.children.length ? 'container' : 'text');
      if (role === 'button' || role === 'link' || role === 'textbox' || role === 'combobox' || role === 'heading') {
        n += 1;
        try { node.setAttribute('data-personal-ref', 'ref_' + n); } catch (e) {}
        lines.push(new Array(Math.min(d, 8) + 1).join('  ') + role + ' "' + name(node) + '" [ref_' + n + ']');
      }
      var kids = node.children || [];
      for (var i = 0; i < kids.length; i++) walk(kids[i], d + 1);
    }
    walk(root, 0);
    var tree = lines.join('\n');
    if (tree.length > maxChars) tree = tree.slice(0, maxChars) + '\n…truncated, narrow scope…';
    return tree;
  }
  window.__personalSnapshot = function (filter, depth, maxChars) {
    return snapshot(document.body, { maxChars: maxChars || 50000, depth: depth || 15 });
  };
})();
