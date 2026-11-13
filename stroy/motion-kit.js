/* motion-kit.js — живые приёмы из дизайн-референсов (docs/design-refs.md), без библиотек.
   Работает по атрибутам, существующую анимацию сайта не трогает. Подключать последним скриптом:
     <script src="motion-kit.js" defer></script>
   data-mk-split            — заголовок проявляется по словам (data-mk-split="chars" — по буквам)
   data-mk-count            — число внутри считается от нуля при появлении: «340+», «4,6», «1 750 ₽», «100%»
   data-mk-words            — абзац проявляется по словам вместе с прокруткой
   data-mk-chips + .mk-chip — стеклянные плашки внутри контейнера появляются по очереди
                              (позиции задаёт сайт; цвет — переменные --mk-chip-bg/--mk-chip-fg/--mk-chip-line)
   При «уменьшить движение» всё показывается сразу. Копия файла лежит в папке каждого сайта. */
(function () {
  'use strict';
  var RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var css = '' +
    '[data-mk-split] .mk-w{display:inline-block;white-space:pre;transition:opacity 1s cubic-bezier(.2,.7,.2,1),transform 1.1s cubic-bezier(.2,.7,.2,1),filter 1s;transition-delay:calc(var(--mk-i)*var(--mk-step,70ms))}' +
    '[data-mk-split]:not(.mk-in) .mk-w{opacity:0;transform:translateY(.35em);filter:blur(8px)}' +
    '[data-mk-words] .mk-v{transition:opacity .45s linear}[data-mk-words] .mk-v.mk-dim{opacity:.2}' +
    '.mk-chip{display:inline-flex;align-items:center;gap:10px;padding:10px 15px 10px 12px;font-size:12px;line-height:1.25;letter-spacing:.04em;white-space:nowrap;' +
    'color:var(--mk-chip-fg,#fff);background:var(--mk-chip-bg,rgba(255,255,255,.14));border:1px solid var(--mk-chip-line,rgba(255,255,255,.32));' +
    '-webkit-backdrop-filter:blur(14px) saturate(1.3);backdrop-filter:blur(14px) saturate(1.3);border-radius:var(--mk-chip-r,999px);' +
    'box-shadow:0 18px 40px -22px rgba(0,0,0,.55);opacity:0;transform:translateY(10px);transition:opacity .8s cubic-bezier(.2,.7,.2,1),transform .8s cubic-bezier(.2,.7,.2,1);pointer-events:none}' +
    '.mk-chip::before{content:"";flex:none;width:6px;height:6px;border-radius:50%;background:var(--mk-dot,#f2c46d);box-shadow:0 0 0 4px color-mix(in srgb,var(--mk-dot,#f2c46d) 25%,transparent)}' +
    '.mk-chip.mk-in{opacity:1;transform:none}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  function seen(el, cb, margin) {
    if (RM || !('IntersectionObserver' in window)) { cb(); return; }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { io.disconnect(); cb(); } });
    }, { rootMargin: margin || '0px 0px -12% 0px' });
    io.observe(el);
  }
  // обернуть слова (или буквы) во всех текстовых узлах, вложенные теги (<em>, <br>) сохраняются
  function wrap(el, chars, cls) {
    var i = 0, walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(function (n) {
      if (!n.nodeValue.trim()) return;
      var f = document.createDocumentFragment();
      n.nodeValue.split(chars ? /(\s+|)/ : /(\s+)/).forEach(function (part) {
        if (!part) return;
        if (/^\s+$/.test(part)) { f.appendChild(document.createTextNode(part)); return; }
        var s = document.createElement('span'); s.className = cls; s.style.setProperty('--mk-i', i++); s.textContent = part; f.appendChild(s);
      });
      n.parentNode.replaceChild(f, n);
    });
    return i;
  }
  function split(el) {
    if (el.__mk) return; el.__mk = 1;
    if (!el.getAttribute('aria-label')) el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());
    wrap(el, el.getAttribute('data-mk-split') === 'chars', 'mk-w');
    if (el.getAttribute('data-mk-split') === 'chars') el.style.setProperty('--mk-step', '45ms');
    requestAnimationFrame(function () { seen(el, function () { el.classList.add('mk-in'); }, '0px'); });
  }
  // число: первое в тексте элемента (вложенные теги вроде <small> не мешают);
  // дробная часть через запятую, тысячи — пробелом, как написано на сайте
  var NUM = /\d(?:[\d\u00a0\u202f ]*\d)?(?:,\d+)?/;
  function count(el) {
    if (el.__mk) return; el.__mk = 1;
    if (RM) return;
    var node = null, w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) if (NUM.test(w.currentNode.nodeValue)) { node = w.currentNode; break; }
    if (!node) return;
    var orig = node.nodeValue, m = orig.match(NUM), raw = m[0];
    var parts = raw.split(','), dec = parts[1] ? parts[1].length : 0;
    var sep = (parts[0].match(/[\u00a0\u202f ]/) || [''])[0];
    var target = parseFloat(parts[0].replace(/\D/g, '') + (dec ? '.' + parts[1] : ''));
    if (!target) return;
    var head = orig.slice(0, m.index), tail = orig.slice(m.index + raw.length);
    var fmt = function (v) {
      var s = v.toFixed(dec).split('.'), n = s[0];
      if (sep) n = n.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
      return head + n + (dec ? ',' + s[1] : '') + tail;
    };
    node.nodeValue = fmt(0);
    seen(el, function () {
      var t0 = performance.now(), D = 1500;
      (function step(now) {
        var k = Math.min(1, Math.max(0, (now - t0) / D)), e = 1 - Math.pow(1 - k, 3);
        node.nodeValue = k < 1 ? fmt(target * e) : orig;
        if (k < 1) requestAnimationFrame(step);
      })(t0);
    }, '0px');
  }
  var wordBlocks = [];
  function words(el) {
    if (el.__mk) return; el.__mk = 1;
    if (RM) return;
    var n = wrap(el, false, 'mk-v'); var vs = el.querySelectorAll('.mk-v');
    for (var i = 0; i < vs.length; i++) vs[i].classList.add('mk-dim');
    wordBlocks.push({ el: el, vs: vs, n: n });
  }
  function onScroll() {
    var H = innerHeight;
    wordBlocks.forEach(function (b) {
      var r = b.el.getBoundingClientRect(), p = Math.min(1, Math.max(0, (H * .92 - r.top) / (H * .6 + r.height * .5)));
      var k = Math.round(p * b.n * 1.1);
      for (var i = 0; i < b.vs.length; i++) b.vs[i].classList.toggle('mk-dim', i >= k);
    });
  }
  function chips(box) {
    if (box.__mk) return; box.__mk = 1;
    var cs = box.querySelectorAll('.mk-chip');
    seen(box, function () {
      for (var i = 0; i < cs.length; i++) (function (c, i) { setTimeout(function () { c.classList.add('mk-in'); }, RM ? 0 : 500 + i * 260); })(cs[i], i);
    }, '0px');
  }
  function init(root) {
    root = root || document;
    var q = function (s, f) { var l = root.querySelectorAll(s); for (var i = 0; i < l.length; i++) f(l[i]); };
    q('[data-mk-split]', split); q('[data-mk-count]', count); q('[data-mk-words]', words); q('[data-mk-chips]', chips);
    onScroll();
  }
  var ticking = false;
  addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(function () { ticking = false; onScroll(); }); } }, { passive: true });
  addEventListener('resize', onScroll);
  window.MotionKit = { init: init };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { init(); });
  else init();
})();
