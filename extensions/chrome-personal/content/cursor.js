// Own cursor overlay (24px dot), no original assets.
(function () {
  let dot = null;
  function ensure() {
    if (dot) return dot;
    dot = document.createElement('div');
    dot.style.cssText = 'position:fixed;z-index:2147483647;width:24px;height:24px;border-radius:50%;border:2px solid #c15f3c;background:rgba(193,95,60,.25);pointer-events:none;display:none;';
    document.documentElement.appendChild(dot);
    return dot;
  }
  window.__personalCursor = function (x, y, click) {
    const d = ensure();
    d.style.display = 'block';
    d.style.transform = `translate(${x - 12}px, ${y - 12}px)`;
    clearTimeout(d._t);
    d._t = setTimeout(() => { d.style.display = 'none'; }, click ? 400 : 800);
  };
})();
