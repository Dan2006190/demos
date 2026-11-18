/* Сборка страниц из content.js и интерактивные схемы. Тексты правятся в content.js. */
(function () {
  'use strict';
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;            // только для текстов из content.js
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null) el.append(kid.nodeType ? kid : document.createTextNode(kid));
    return el;
  }
  const svg = (markup, cls) => { const d = h('div', { class: cls || '', html: markup }); return d; };

  /* ---------- главная ---------- */
  function renderIndex() {
    const grid = document.getElementById('course-grid');
    if (grid) for (const m of MODULES) {
      grid.append(h('a', { class: 'card' + (m.soon ? ' soon' : ''), href: 'module.html?m=' + m.id },
        h('span', { class: 'num', 'aria-hidden': 'true' }, m.num),
        h('h3', {}, m.title), h('p', {}, m.short),
        h('div', { class: 'tags' }, (m.tags || []).map((t, i) => h('span', { class: 'tag' + (i === 0 && !m.soon ? ' red' : '') }, t)))));
    }
    const pr = document.getElementById('practice-widgets');
    if (pr) { if (window.MYTHS) pr.append(WIDGETS.myths()); if (window.TRIAGE) pr.append(WIDGETS.triage()); }
    const ev = document.getElementById('events');
    if (ev) for (const e of EVENTS) ev.append(h('article', { class: 'event' }, h('time', {}, e.date), h('h3', {}, e.title), h('p', {}, e.text)));
    fillContacts();
  }

  function fillContacts() {
    const c = document.getElementById('contacts-list');
    if (!c) return;
    c.append(h('a', { class: 'btn', href: CLUB.telegram, target: '_blank', rel: 'noopener' }, 'Telegram-канал'));
    if (CLUB.vk) c.append(h('a', { class: 'btn', href: CLUB.vk, target: '_blank', rel: 'noopener' }, 'Группа ВКонтакте'));
    if (CLUB.phone) c.append(h('span', { class: 'btn' }, CLUB.phone));
  }

  /* ---------- страница модуля ---------- */
  function renderModule() {
    const id = new URLSearchParams(location.search).get('m');
    const i = Math.max(0, MODULES.findIndex(m => m.id === id));
    const m = MODULES[i];
    document.title = m.title + ' — ЦВСП «Молот»';
    document.getElementById('m-num').textContent = 'Модуль ' + m.num;
    document.getElementById('m-title').textContent = m.title;
    document.getElementById('m-lead').textContent = m.lead;
    document.getElementById('m-crumb').textContent = m.title;
    const body = document.getElementById('m-body');
    for (const w of m.widgets || []) body.append(WIDGETS[w]());
    if (m.soon) body.append(h('div', { class: 'note' }, h('b', {}, 'Раздел готовится. '), 'Материал скоро появится — следите за каналом клуба.'));
    for (const b of m.blocks) body.append(block(b));
    if (m.videos) body.append(h('div', { class: 'block' }, h('h2', { class: 'h-display' }, 'Видеоуроки'),
      h('div', { class: 'row' }, m.videos.map(v => h('a', { class: 'btn video', href: v.url, target: '_blank', rel: 'noopener' }, '▶ ' + v.label)))));
    const prev = MODULES[i - 1], next = MODULES[i + 1];
    body.append(h('nav', { class: 'pager', 'aria-label': 'Модули' },
      prev ? h('a', { class: 'btn', href: 'module.html?m=' + prev.id }, '← ' + prev.title) : h('a', { class: 'btn', href: 'index.html#course' }, '← Все модули'),
      next ? h('a', { class: 'btn red', href: 'module.html?m=' + next.id }, next.title + ' →') : h('a', { class: 'btn red', href: 'index.html#course' }, 'Все модули →')));
  }

  function block(b) {
    const wrap = h('section', { class: 'block' + (b.type === 'warn' ? ' warn' : '') });
    wrap.style.border = '0';
    wrap.append(h('h2', { class: 'h-display' }, b.h));
    if (b.type === 'p') wrap.append(h('p', {}, b.text));
    if (b.type === 'ul' || b.type === 'warn') wrap.append(h('ul', {}, b.items.map(t => h('li', { html: t }))));
    if (b.type === 'ol') wrap.append(h('ol', {}, b.items.map(t => h('li', { html: t }))));
    if (b.type === 'pairs') { wrap.className += ' wide'; wrap.append(h('div', { class: 'pairs' }, b.items.map(([t, d]) => h('div', { class: 'pair' }, h('b', {}, t), h('p', {}, d))))); }
    return wrap;
  }

  const widget = (title, hint, ...kids) => h('div', { class: 'widget' }, h('div', { class: 'widget-head' }, h('h3', {}, title), h('span', {}, hint)), kids);

  /* ---------- 1. Артериальное и венозное ---------- */
  function vessels() {
    const art = `
<svg viewBox="0 0 640 230" role="img" aria-label="Артериальное кровотечение — алая пульсирующая струя, венозное — тёмная ровная струя" class="vessel-art">
  <rect x="20" y="30" width="400" height="70" rx="10" fill="#d9a487"/><rect x="20" y="138" width="400" height="70" rx="10" fill="#d9a487"/>
  <path d="M30 65 H392" stroke="#a41212" stroke-width="16" stroke-linecap="round"/>
  <path d="M30 65 H392" stroke="#ff5a5a" stroke-width="5" class="artery-flow"/>
  <ellipse cx="400" cy="65" rx="12" ry="16" fill="#8f0f0f" class="pulse"/>
  <g fill="#ff2e2e"><circle cx="404" cy="58" r="5" class="spurt"/><circle cx="404" cy="58" r="4" class="spurt" style="animation-delay:.18s"/><circle cx="404" cy="58" r="3" class="spurt" style="animation-delay:.36s"/></g>
  <path d="M30 173 H392" stroke="#4a0c18" stroke-width="16" stroke-linecap="round"/>
  <path d="M30 173 H392" stroke="#7c2033" stroke-width="5" class="vein-flow"/>
  <ellipse cx="400" cy="173" rx="12" ry="14" fill="#3b0812"/>
  <g fill="#5c0f1d"><circle cx="400" cy="186" r="5" class="drip"/><circle cx="400" cy="186" r="4" class="drip" style="animation-delay:.6s"/><circle cx="400" cy="186" r="4" class="drip" style="animation-delay:1.2s"/></g>
  <text x="450" y="58" fill="#ff8b8b" font-family="Oswald, sans-serif" font-size="22" font-weight="700">АРТЕРИАЛЬНОЕ</text>
  <text x="450" y="82" fill="#9b978f" font-family="Inter, sans-serif" font-size="13">алая · пульсирует фонтаном</text>
  <text x="450" y="166" fill="#c98b97" font-family="Oswald, sans-serif" font-size="22" font-weight="700">ВЕНОЗНОЕ</text>
  <text x="450" y="190" fill="#9b978f" font-family="Inter, sans-serif" font-size="13">тёмная · течёт ровно</text>
</svg>`;
    return widget('Как отличить', 'по цвету и струе', svg(art));
  }


  /* ---------- 1б. Карта артерий: пальцевое прижатие ---------- */
  function arteries() {
    const A = window.ARTERIES || [];
    const P = { carotid: [141, 104], subclavian: [116, 129], axillary: [97, 160], brachial: [85, 205], femoral: [131, 330] };
    const HL = {
      carotid: 'M150 138 L143 118 L141 84',
      subclavian: 'M150 138 L117 131 L99 142',
      axillary: 'M99 142 L93 170',
      brachial: 'M93 170 L81 214 L72 262 L62 322',
      femoral: 'M150 300 L136 314 L130 340 L126 440 L121 548',
    };
    const tree = 'M150 138 V300 M150 300 L164 314 L170 340 L174 440 L179 548 M150 138 L157 118 L159 84 M150 138 L183 131 L201 142 L207 170 L219 214 L228 262 L238 322';
    const art = `
<svg viewBox="0 0 300 580" class="amap-body" role="img" aria-label="Силуэт человека с точками прижатия артерий">
  <g fill="#2a2a2f" stroke="#2a2a2f" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="150" cy="58" r="36" stroke="none"/>
    <rect x="135" y="88" width="30" height="40" rx="8" stroke="none"/>
    <path d="M94 128 Q150 114 206 128 L214 146 L204 322 Q150 336 96 322 L86 146 Z" stroke-width="2"/>
    <polyline points="98,142 81,214 62,322" fill="none" stroke-width="28"/>
    <polyline points="202,142 219,214 238,322" fill="none" stroke-width="28"/>
    <circle cx="58" cy="344" r="17" stroke="none"/><circle cx="242" cy="344" r="17" stroke="none"/>
    <polyline points="126,318 124,440 120,552" fill="none" stroke-width="44"/>
    <polyline points="174,318 176,440 180,552" fill="none" stroke-width="44"/>
  </g>
  <path d="${tree} ${Object.values(HL).join(' ')}" fill="none" stroke="#7d1b1b" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity=".75"/>
  ${Object.entries(HL).map(([k, d]) => `<path class="hl" data-k="${k}" d="${d}" fill="none" stroke="#ff4040" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`).join('')}
  ${A.map(a => { const [x, y] = P[a.k] || [0, 0]; return `<g class="pt" data-k="${a.k}" tabindex="0" role="button" aria-label="${a.name}"><circle class="ring" cx="${x}" cy="${y}" r="10"/><circle class="dot" cx="${x}" cy="${y}" r="9"/><circle cx="${x}" cy="${y}" r="22" fill="transparent"/></g>`; }).join('')}
</svg>`;
    const body = svg(art, 'amap-fig');
    const s = body.querySelector('svg');
    const title = h('h4', {}), zone = h('p', { class: 'amap-zone' });
    const rows = h('dl', {});
    const chips = h('div', { class: 'amap-chips' }, A.map(a => h('button', { class: 'chip', type: 'button', 'data-k': a.k, onclick: () => pick(a.k) }, a.name.replace(' артерия', ''))));
    function pick(k) {
      const a = A.find(x => x.k === k); if (!a) return;
      s.querySelectorAll('.pt,.hl').forEach(el => el.classList.toggle('on', el.dataset.k === k));
      chips.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', String(c.dataset.k === k)));
      title.textContent = a.name; zone.textContent = a.zone;
      rows.replaceChildren(
        h('dt', {}, 'Где'), h('dd', { html: a.where }),
        h('dt', {}, 'Как'), h('dd', { html: a.how }),
        h('dt', {}, 'Дальше'), h('dd', { html: a.next }));
    }
    s.querySelectorAll('.pt').forEach(g => {
      g.addEventListener('click', () => pick(g.dataset.k));
      g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(g.dataset.k); } });
    });
    const info = h('div', { class: 'amap-info', 'aria-live': 'polite' }, chips, title, zone, rows,
      h('p', { class: 'amap-note' }, 'Пальцевое прижатие — это первые секунды: кровь останавливается сразу, пока готовят жгут или повязку. Давите между раной и сердцем.'));
    pick((A.find(a => a.k === 'femoral') || A[0] || {}).k);
    return widget('Куда давить', 'нажмите на точку', h('div', { class: 'amap' }, body, info));
  }

  /* ---------- 2. Жгут по шагам ---------- */
  function tourniquet() {
    const steps = ['Наложить выше раны, ближе к туловищу', 'Затянуть до остановки кровотечения', 'Записать время наложения', 'Вызвать скорую, жгут не снимать'];
    const art = `
<svg viewBox="0 0 640 240" class="tq" data-step="0" role="img" aria-label="Наложение жгута по шагам">
  <text x="30" y="226" fill="#9b978f" font-family="Inter, sans-serif" font-size="12">← к телу</text>
  <text x="560" y="226" fill="#9b978f" font-family="Inter, sans-serif" font-size="12">к кисти →</text>
  <rect x="30" y="80" width="580" height="96" rx="48" fill="#d9a487"/>
  <ellipse class="wound" cx="470" cy="128" rx="20" ry="11" fill="#b31a1a"/>
  <g class="drops" fill="#c41e1e"><circle cx="470" cy="142" r="5"/><circle cx="462" cy="142" r="4"/><circle cx="478" cy="142" r="4"/></g>
  <g class="band">
    <rect x="322" y="68" width="30" height="120" rx="6" fill="#26262b" stroke="#d42a2a" stroke-width="2"/>
    <rect x="322" y="176" width="30" height="12" rx="3" fill="#d42a2a"/>
  </g>
  <g class="tight">
    <rect x="300" y="122" width="74" height="12" rx="6" fill="#5b5b62"/>
    <path d="M286 100 l12 0 m-6 -6 l6 6 l-6 6 M388 100 l-12 0 m6 -6 l-6 6 l6 6" stroke="#ece8e1" stroke-width="2" fill="none"/>
    <text x="440" y="70" fill="#4fb36b" font-family="Inter, sans-serif" font-size="13" font-weight="600">кровь остановлена</text>
  </g>
  <g class="timecard">
    <path d="M337 46 V68" stroke="#ece8e1" stroke-width="1.5"/>
    <rect x="262" y="14" width="150" height="32" fill="#ece8e1"/>
    <text x="337" y="36" text-anchor="middle" fill="#0c0c0d" font-family="Oswald, sans-serif" font-size="17" font-weight="700" class="tq-time">ЖГУТ 00:00</text>
  </g>
  <g class="call"><text x="470" y="212" text-anchor="middle" fill="#ff8b8b" font-family="Oswald, sans-serif" font-size="20" font-weight="700">СКОРАЯ: 103 / 112</text></g>
</svg>`;
    const art_ = svg(art);
    const s = art_.querySelector('svg');
    const list = h('ol', { class: 'tq-steps' }, steps.map(t => h('li', {}, t)));
    let step = 0;
    const back = h('button', { class: 'btn', type: 'button' }, '← Назад');
    const next = h('button', { class: 'btn red', type: 'button' }, 'Шаг 1 →');
    const now = new Date();
    s.querySelector('.tq-time').textContent = 'ЖГУТ ' + String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    function set(n) {
      step = Math.max(0, Math.min(4, n));
      s.dataset.step = step;
      [...list.children].forEach((li, k) => (k === step - 1 ? li.setAttribute('aria-current', 'step') : li.removeAttribute('aria-current')));
      back.disabled = step === 0;
      next.textContent = step === 4 ? 'Сначала ↺' : 'Шаг ' + (step + 1) + ' →';
    }
    back.addEventListener('click', () => set(step - 1));
    next.addEventListener('click', () => set(step === 4 ? 0 : step + 1));
    set(0);
    return widget('Жгут за четыре шага', 'нажимайте «Шаг» по очереди', art_, list, h('div', { class: 'row' }, back, next));
  }

  /* ---------- 3. Рентген-линза: виды переломов ---------- */
  // Предплечье: локоть слева, кисть справа. Лучевая кость сверху, локтевая снизу.
  const SKIN_PATH = 'M0,96 C150,82 300,96 450,120 C560,136 640,141 690,143 C730,128 772,132 794,152 L797,232 C772,254 730,254 690,238 C640,240 560,246 450,252 C300,264 150,286 0,276 Z';
  const RAD = { x1: 34, y1: 152, x2: 690, y2: 172, w: 24 };
  const ULN = { x1: 18, y1: 226, x2: 690, y2: 206, w: 21 };

  function boneMarkup(b, extra) {
    return `<g ${extra || ''}><line x1="${b.x1}" y1="${b.y1}" x2="${b.x2}" y2="${b.y2}" stroke="#e7f0ff" stroke-width="${b.w}" stroke-linecap="round"/>
      <line x1="${b.x1 + 14}" y1="${b.y1}" x2="${b.x2 - 14}" y2="${b.y2}" stroke="#8494ab" stroke-width="${b.w * .36}" stroke-linecap="round" opacity=".55"/></g>`;
  }
  const yAt = (b, x) => b.y1 + (b.y2 - b.y1) * (x - b.x1) / (b.x2 - b.x1);
  function zig(xb, y0, y1, amp, n) {
    const pts = []; for (let k = 0; k <= n; k++) pts.push([xb + (k % 2 ? amp : -amp), y0 + (y1 - y0) * k / n]); return pts;
  }
  // Кость, разрезанная по линии line (точки сверху вниз); правая часть смещается transform.
  function brokenBone(id, b, line, transform) {
    const L = [[-60, -60], ...line, [-60, 460]].map(p => p.join(',')).join(' ');
    const R = [[860, -60], ...line, [860, 460]].map(p => p.join(',')).join(' ');
    return `<clipPath id="${id}L"><polygon points="${L}"/></clipPath><clipPath id="${id}R"><polygon points="${R}"/></clipPath>
      ${boneMarkup(b, `clip-path="url(#${id}L)"`)}<g transform="${transform || ''}">${boneMarkup(b, `clip-path="url(#${id}R)"`)}</g>`;
  }
  function hand() {
    let s = '';
    const carp = [[706, 160], [722, 156], [738, 162], [708, 182], [726, 184], [742, 186], [716, 204], [734, 210]];
    for (const [x, y] of carp) s += `<ellipse cx="${x}" cy="${y}" rx="9" ry="8" fill="#dfe9f9" opacity=".92"/>`;
    for (let k = 0; k < 4; k++) s += `<line x1="750" y1="${160 + k * 18}" x2="796" y2="${150 + k * 22}" stroke="#e7f0ff" stroke-width="8" stroke-linecap="round"/>`;
    return s;
  }
  const TYPES = [
    { title: 'Закрытый без смещения', tag: 'Закрытый', text: 'Трещина, кость на месте, кожа цела. Снаружи — отёк и гематома. Больно двигать, но деформации может не быть, поэтому такой перелом легко принять за ушиб.',
      bones: () => boneMarkup(ULN) + boneMarkup(RAD) + `<polyline points="${zig(380, 136, 186, 4, 6).map(p => p.join(',')).join(' ')}" fill="none" stroke="#04070b" stroke-width="3"/>`,
      skin: '<ellipse cx="380" cy="150" rx="70" ry="32" fill="#6b3f6e" opacity=".32"/>' },
    { title: 'Со смещением', tag: 'Закрытый', text: 'Отломки разошлись. Видна деформация, конечность в неестественном положении. Фиксируют как есть — вправляет только врач.',
      bones: (id) => brokenBone(id + 'r', RAD, zig(390, 130, 196, 6, 6), 'translate(6 18)') + brokenBone(id + 'u', ULN, zig(410, 190, 246, 6, 6), 'translate(4 16)'),
      skin: '<ellipse cx="400" cy="170" rx="96" ry="44" fill="#6b3f6e" opacity=".36"/>' },
    { title: 'Открытый', tag: 'Открытый', text: 'Отломок прорвал кожу. Высокий риск кровотечения и инфекции. Сначала остановить кровь и закрыть рану стерильной повязкой, затем шина.',
      bones: (id) => brokenBone(id + 'r', RAD, zig(392, 130, 196, 5, 6), 'translate(4 10)') + brokenBone(id + 'u', ULN, zig(386, 186, 250, 6, 6), 'rotate(-13 690 206)'),
      skin: `<ellipse cx="384" cy="257" rx="26" ry="11" fill="#7d1010"/><path d="M372 247 L382 284 L395 282 L390 248 Z" fill="#efe6d8" stroke="#bfb2a0"/>
             <g fill="#b31a1a"><circle cx="372" cy="270" r="4"/><circle cx="398" cy="276" r="3"/></g>` },
    { title: 'Оскольчатый', tag: 'Закрытый', text: 'Кость разбита на несколько осколков. Часто бывает при сильном ударе. Обездвижить максимально бережно — осколки могут повредить сосуды и нервы.',
      bones: (id) => brokenBone(id + 'r', RAD, zig(366, 128, 196, 4, 4), 'translate(30 3)') +
        '<polygon points="368,152 384,146 390,164 372,170" fill="#e7f0ff"/><polygon points="378,172 392,168 396,182 380,184" fill="#e7f0ff" opacity=".9"/><polygon points="386,140 396,140 394,150" fill="#e7f0ff"/>' + boneMarkup(ULN),
      skin: '<ellipse cx="380" cy="150" rx="90" ry="40" fill="#6b3f6e" opacity=".36"/>' },
    { title: 'Косой', tag: 'Закрытый', text: 'Линия перелома идёт наискосок — бывает при скручивании. Отломки легко соскальзывают, поэтому важна надёжная шина через два сустава.',
      bones: (id) => brokenBone(id + 'r', RAD, [[350, 128], [420, 196]], 'translate(6 8)') + boneMarkup(ULN),
      skin: '<ellipse cx="385" cy="152" rx="80" ry="34" fill="#6b3f6e" opacity=".3"/>' },
    { title: '«Зелёная ветка»', tag: 'У детей', text: 'Детская кость гибкая: она надламывается с одной стороны, как молодая ветка. Снаружи может быть почти незаметно — но это перелом, нужен врач.',
      bones: () => `<path d="M34 152 Q390 120 690 172" fill="none" stroke="#e7f0ff" stroke-width="24" stroke-linecap="round"/>
        <path d="M48 152 Q390 121 676 170" fill="none" stroke="#8494ab" stroke-width="8" opacity=".55"/>
        <path d="M376 128 l4 10 l-4 8" stroke="#04070b" stroke-width="3" fill="none"/>` + boneMarkup(ULN),
      skin: '<ellipse cx="380" cy="140" rx="60" ry="26" fill="#6b3f6e" opacity=".22"/>' },
  ];

  function xrayCarousel() {
    const slides = TYPES.map((t, k) => ({ ...t, svgBones: (id => `<svg viewBox="0 0 800 360" preserveAspectRatio="xMidYMid slice"><rect width="800" height="360" fill="#04070b"/><path d="${SKIN_PATH}" fill="#16212c" opacity=".9"/><g filter="url(#glow${id})">${t.bones(id)}${hand()}</g><defs><filter id="glow${id}"><feGaussianBlur stdDeviation="1.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs></svg>`)('x' + k) }));
    for (const r of (window.REAL_XRAY || [])) slides.push({ title: r.title, tag: 'Настоящий рентген', text: r.text, img: r.src, skin: '' });

    const skinSvg = extra => `<svg viewBox="0 0 800 360" preserveAspectRatio="xMidYMid slice"><rect width="800" height="360" fill="#121214"/>
      <defs><linearGradient id="sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e3b195"/><stop offset=".6" stop-color="#d49b7e"/><stop offset="1" stop-color="#b47a5f"/></linearGradient></defs>
      <path d="${SKIN_PATH}" fill="url(#sk)"/>${extra || ''}</svg>`;

    const track = h('div', { class: 'xray-track', tabindex: '0', 'aria-label': 'Виды переломов' });
    const lenses = [];
    slides.forEach((s, k) => {
      const lens = h('div', { class: 'xray', role: 'img', 'aria-label': s.title + ': под рентген-линзой видна кость' },
        s.img ? h('div', { class: 'bones' }, h('img', { src: s.img, alt: '', loading: 'lazy' })) : svg(s.svgBones, 'bones'),
        svg(skinSvg(s.skin), 'skin'), h('div', { class: 'ring', 'aria-hidden': 'true' }), h('div', { class: 'hint', 'aria-hidden': 'true' }, 'Водите курсором или пальцем'));
      lenses.push(lens);
      const full = h('button', { class: 'btn', type: 'button', 'aria-pressed': 'false' }, 'Показать снимок целиком');
      const setFull = on => { lens.classList.toggle('full', on); full.setAttribute('aria-pressed', on); full.textContent = on ? 'Включить линзу' : 'Показать снимок целиком'; };
      full.addEventListener('click', () => setFull(!lens.classList.contains('full')));
      if (s.img) setFull(true);  // настоящий снимок показываем сразу целиком
      track.append(h('div', { class: 'xray-slide', role: 'group', 'aria-label': (k + 1) + ' из ' + slides.length },
        lens, h('div', { class: 'xray-info' }, h('span', { class: 'tag red' }, s.tag), h('h4', {}, s.title), h('p', {}, s.text), full)));
    });
    for (const lens of lenses) {
      const move = e => {
        const r = lens.getBoundingClientRect();
        lens.style.setProperty('--x', (e.clientX - r.left) + 'px');
        lens.style.setProperty('--y', (e.clientY - r.top) + 'px');
        lens.classList.add('touched');
      };
      lens.addEventListener('pointermove', move);
      lens.addEventListener('pointerdown', e => { move(e); lens.setPointerCapture(e.pointerId); });
    }
    const dots = h('div', { class: 'dots' }, slides.map((s, k) => h('button', { type: 'button', 'aria-label': s.title, onclick: () => go(k) })));
    const prev = h('button', { class: 'btn', type: 'button', 'aria-label': 'Предыдущий' }, '←');
    const next = h('button', { class: 'btn red', type: 'button', 'aria-label': 'Следующий' }, '→');
    let cur = 0;
    function go(k) { cur = (k + slides.length) % slides.length; track.scrollTo({ left: cur * track.clientWidth, behavior: reduce ? 'auto' : 'smooth' }); mark(); }
    function mark() { [...dots.children].forEach((d, k) => d.setAttribute('aria-current', k === cur)); }
    prev.addEventListener('click', () => go(cur - 1));
    next.addEventListener('click', () => go(cur + 1));
    track.addEventListener('scroll', () => { const k = Math.round(track.scrollLeft / track.clientWidth); if (k !== cur) { cur = k; mark(); } }, { passive: true });
    track.addEventListener('keydown', e => { if (e.key === 'ArrowRight') go(cur + 1); if (e.key === 'ArrowLeft') go(cur - 1); });
    mark();
    return widget('Рентген-линза', 'наведите на руку — увидите кость', h('div', { class: 'xray-carousel' }, track,
      h('div', { class: 'xray-nav' }, dots, h('div', { class: 'row' }, prev, next))));
  }

  /* ---------- 4. Ожоги по слоям ---------- */
  function burns() {
    const DEG = [
      [0.10, '1 степень — только внешний слой кожи: покраснение, небольшой отёк, боль.'],
      [0.20, '2 степень — весь верхний (роговой) слой кожи, вплоть до следующего: боль, покраснение, пузыри.'],
      [0.55, '3 степень — глубокие слои кожи и верхние слои подкожной клетчатки: пузыри и струпья.'],
      [1.00, '4 степень — гибель всех слоёв кожи и тканей под ними, обугливание мышц, костей, клетчатки.'],
    ];
    const art = `
<svg viewBox="0 0 640 270" class="burn" role="img" aria-label="Срез кожи и глубина ожога по степеням">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff5a2a" stop-opacity=".85"/><stop offset=".6" stop-color="#9c1a12" stop-opacity=".9"/><stop offset="1" stop-color="#1c0b08"/></linearGradient></defs>
  <rect x="40" y="40" width="400" height="22" fill="#eac0a8"/><rect x="40" y="62" width="400" height="58" fill="#d48d78"/>
  <rect x="40" y="120" width="400" height="60" fill="#e9cf88"/><rect x="40" y="180" width="400" height="60" fill="#9c3038"/>
  <ellipse cx="240" cy="226" rx="120" ry="10" fill="#ece3d6" opacity=".7"/>
  <rect class="depth" x="150" y="40" width="180" height="200" fill="url(#bg)" style="transform-box:fill-box;transform-origin:top;transform:scaleY(.1)"/>
  <g font-family="Inter, sans-serif" font-size="13" fill="#9b978f">
    <text x="460" y="56">эпидермис</text><text x="460" y="96">дерма</text><text x="460" y="155">подкожная клетчатка</text><text x="460" y="215">мышцы и кость</text>
  </g>
  <g stroke="#2b2b30"><path d="M444 52 H456 M444 92 H456 M444 151 H456 M444 211 H456"/></g>
</svg>`;
    const box = svg(art);
    const depth = box.querySelector('.depth');
    const text = h('p', { class: 'burn-text' });
    const btns = DEG.map((d, k) => h('button', { class: 'btn', type: 'button', 'aria-pressed': 'false', onclick: () => set(k) }, (k + 1) + ' степень'));
    function set(k) { depth.style.transform = 'scaleY(' + DEG[k][0] + ')'; text.textContent = DEG[k][1]; btns.forEach((b, j) => b.setAttribute('aria-pressed', j === k)); }
    set(0);
    return widget('Насколько глубоко', 'выберите степень', box, h('div', { class: 'row' }, btns), text);
  }

  /* ---------- 5. Тренажёр ритма СЛР ---------- */
  function cpr() {
    const hands = `<svg viewBox="0 0 120 90" aria-hidden="true"><rect x="20" y="30" width="80" height="44" rx="16" fill="#d9a487"/><rect x="26" y="14" width="68" height="40" rx="14" fill="#e3b195"/><path d="M34 34 h52" stroke="#b47a5f" stroke-width="3"/></svg>`;
    const chest = h('button', { class: 'chest', type: 'button', 'aria-label': 'Нажать на грудную клетку' }, svg(hands, 'hands'), h('span', { class: 'beat', 'aria-hidden': 'true' }));
    const count = h('div', { class: 'cpr-count', 'aria-live': 'polite' }, '0');
    const phase = h('div', { class: 'cpr-phase' }, 'Нажимайте в ритм');
    const tempo = h('p', { class: 'tempo' }, 'Цель — 100–120 нажатий в минуту.');
    const metro = h('button', { class: 'btn', type: 'button', 'aria-pressed': 'false' }, 'Метроном 110');
    const reset = h('button', { class: 'btn', type: 'button' }, 'Сначала');
    let n = 0, breaths = 0, cycles = 0, mode = 'press', times = [], timer = null, ctx = null;
    const beat = chest.querySelector('.beat');
    function pulse() { beat.classList.remove('on'); void beat.offsetWidth; beat.classList.add('on'); }
    function click() {
      try { ctx = ctx || new (window.AudioContext || window.webkitAudioContext)(); const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = 880; g.gain.value = .08; o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + .04); } catch (e) { /* без звука */ }
    }
    function press() {
      chest.classList.add('press'); setTimeout(() => chest.classList.remove('press'), 110);
      if (mode === 'press') {
        n++; count.textContent = n; const t = performance.now(); times.push(t); times = times.slice(-7);
        if (times.length > 3) {
          const avg = (times[times.length - 1] - times[0]) / (times.length - 1), bpm = Math.round(60000 / avg);
          tempo.className = 'tempo ' + (bpm >= 100 && bpm <= 120 ? 'ok' : 'bad');
          tempo.textContent = bpm < 100 ? 'Быстрее: ' + bpm + ' в минуту' : bpm > 120 ? 'Медленнее: ' + bpm + ' в минуту' : 'В ритме: ' + bpm + ' в минуту';
        }
        if (n >= 30) { mode = 'breath'; breaths = 0; phase.textContent = '2 вдувания — нажмите дважды'; count.textContent = 'Вдох'; times = []; }
      } else {
        breaths++; count.textContent = 'Вдох ' + breaths + '/2';
        if (breaths >= 2) { cycles++; mode = 'press'; n = 0; count.textContent = '0';
          phase.textContent = cycles % 5 === 0 ? cycles + ' циклов — проверьте дыхание' : 'Цикл ' + (cycles + 1) + ': 30 нажатий'; }
      }
    }
    chest.addEventListener('pointerdown', e => { e.preventDefault(); press(); });
    chest.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); press(); } });
    metro.addEventListener('click', () => {
      if (timer) { clearInterval(timer); timer = null; metro.setAttribute('aria-pressed', 'false'); return; }
      metro.setAttribute('aria-pressed', 'true'); timer = setInterval(() => { pulse(); click(); }, 60000 / 110);
    });
    reset.addEventListener('click', () => { n = 0; breaths = 0; cycles = 0; mode = 'press'; times = []; count.textContent = '0'; phase.textContent = 'Нажимайте в ритм'; tempo.className = 'tempo'; tempo.textContent = 'Цель — 100–120 нажатий в минуту.'; });
    return widget('Тренажёр ритма', 'кликайте, тапайте или жмите пробел',
      h('div', { class: 'cpr' }, chest, h('div', {}, count, phase, tempo, h('div', { class: 'row' }, metro, reset))),
      h('p', { class: 'muted', style: 'margin:14px 0 0;font-size:13px' }, 'Это тренажёр темпа, а не замена практике на манекене.'));
  }


  /* ---------- 6. Миф или правда ---------- */
  function myths() {
    const M = window.MYTHS || [];
    let i = 0, score = 0, answered = false;
    const card = h('div', { class: 'myth-card', tabindex: '0' });
    const q = h('p', { class: 'myth-q' }), verdict = h('p', { class: 'myth-v' }), expl = h('p', { class: 'myth-a' });
    const counter = h('span', { class: 'myth-n' });
    card.append(counter, q, verdict, expl);
    const no = h('button', { class: 'btn', type: 'button', onclick: () => answer(false) }, '← Миф');
    const yes = h('button', { class: 'btn', type: 'button', onclick: () => answer(true) }, 'Правда →');
    const next = h('button', { class: 'btn red', type: 'button', onclick: () => show(i + 1) }, 'Дальше');
    const ctr = h('div', { class: 'row myth-btns' }, no, yes, next);
    function show(n) {
      i = n; answered = false; card.className = 'myth-card'; card.style.transform = '';
      if (i >= M.length) {
        counter.textContent = 'Итог'; q.textContent = score + ' из ' + M.length;
        verdict.textContent = score >= M.length - 1 ? 'Отлично — мифы вас не проведут.' : score >= M.length / 2 ? 'Неплохо, но пара мифов вас подловила.' : 'Мифы пока сильнее — пройдите модули курса.';
        expl.textContent = ''; no.hidden = yes.hidden = true; next.hidden = false; next.textContent = 'Ещё раз';
        next.onclick = () => { score = 0; next.onclick = () => show(i + 1); show(0); };
        return;
      }
      counter.textContent = (i + 1) + ' / ' + M.length; q.textContent = M[i].q; verdict.textContent = ''; expl.textContent = '';
      no.hidden = yes.hidden = false; next.hidden = true; next.textContent = 'Дальше';
    }
    function answer(t) {
      if (answered || i >= M.length) return; answered = true;
      const ok = t === M[i].truth; if (ok) score++;
      card.classList.add(ok ? 'ok' : 'bad', t ? 'went-r' : 'went-l');
      verdict.textContent = (ok ? 'Верно! ' : 'Нет. ') + (M[i].truth ? 'Это правда.' : 'Это миф.');
      expl.textContent = M[i].a; no.hidden = yes.hidden = true; next.hidden = false;
    }
    let x0 = null;
    card.addEventListener('pointerdown', e => { if (answered) return; x0 = e.clientX; card.setPointerCapture(e.pointerId); card.classList.add('drag'); });
    card.addEventListener('pointermove', e => { if (x0 == null) return; const dx = e.clientX - x0; card.style.transform = `translateX(${dx}px) rotate(${dx / 18}deg)`; card.dataset.lean = dx > 40 ? 'r' : dx < -40 ? 'l' : ''; });
    const end = e => { if (x0 == null) return; const dx = e.clientX - x0; x0 = null; card.classList.remove('drag'); card.style.transform = ''; card.dataset.lean = '';
      if (Math.abs(dx) > 90) answer(dx > 0); };
    card.addEventListener('pointerup', end); card.addEventListener('pointercancel', end);
    card.addEventListener('keydown', e => { if (e.key === 'ArrowLeft') answer(false); if (e.key === 'ArrowRight') answer(true); if (e.key === 'Enter' && answered) show(i + 1); });
    show(0);
    return widget('Миф или правда', 'смахните карточку или нажмите кнопку', h('div', { class: 'myths' }, card, ctr));
  }

  /* ---------- 7. Собери аптечку ---------- */
  function kitbuilder() {
    const K = window.KIT_ITEMS || [];
    const need = K.filter(k => k.ok).length;
    let got = 0, miss = 0;
    const bagList = h('div', { class: 'kit-in' });
    const bag = h('div', { class: 'kit-bag', 'aria-label': 'Аптечка' }, h('div', { class: 'kit-bag-head' }, h('b', {}, 'Аптечка'), h('span', { class: 'kit-count' }, '0 / ' + need)), bagList,
      h('p', { class: 'kit-drop' }, 'Перетащите сюда или нажмите на вещь'));
    const fb = h('p', { class: 'kit-fb', 'aria-live': 'polite' }, 'Соберите аптечку: всё нужное — внутрь, лишнее оставьте на полке.');
    const shelf = h('div', { class: 'kit-shelf' });
    const order = K.map((_, n) => n).sort(() => Math.random() - .5);
    function put(n, btn) {
      const it = K[n]; if (btn.disabled) return;
      if (it.ok) {
        btn.disabled = true; btn.classList.add('used'); got++;
        bagList.append(h('span', { class: 'kit-chip' }, it.icon + ' ' + it.name));
        fb.className = 'kit-fb ok'; fb.textContent = '✓ ' + it.name + ': ' + it.why;
      } else {
        miss++; btn.classList.remove('shake'); void btn.offsetWidth; btn.classList.add('shake', 'wrong');
        fb.className = 'kit-fb bad'; fb.textContent = '✗ ' + it.name + ': ' + it.why;
      }
      bag.querySelector('.kit-count').textContent = got + ' / ' + need;
      if (got === need) { bag.classList.add('done'); fb.className = 'kit-fb ok';
        fb.textContent = 'Аптечка собрана! ' + (miss ? 'Ошибок: ' + miss + ' — перечитайте, почему эти вещи лишние.' : 'Без единой ошибки.'); }
    }
    for (const n of order) {
      const it = K[n];
      const b = h('button', { class: 'kit-item', type: 'button', draggable: 'true' }, h('span', { class: 'kit-ic', 'aria-hidden': 'true' }, it.icon), it.name);
      b.addEventListener('click', () => put(n, b));
      b.addEventListener('dragstart', e => e.dataTransfer.setData('text/plain', String(n)));
      shelf.append(b);
    }
    bag.addEventListener('dragover', e => { e.preventDefault(); bag.classList.add('over'); });
    bag.addEventListener('dragleave', () => bag.classList.remove('over'));
    bag.addEventListener('drop', e => { e.preventDefault(); bag.classList.remove('over'); const n = +e.dataTransfer.getData('text/plain'); put(n, shelf.children[order.indexOf(n)]); });
    const again = h('button', { class: 'btn', type: 'button', onclick: () => { const w = kitbuilder(); root.replaceWith(w); } }, '↺ Заново');
    const root = widget('Собери аптечку', 'что положите, а что оставите?', h('div', { class: 'kit' }, shelf, bag), fb, h('div', { class: 'row' }, again));
    return root;
  }

  /* ---------- 8. Сколько крови теряется ---------- */
  function bloodloss() {
    const B = window.BLOODLOSS; const SPEED = 6; // 1 секунда на экране = 6 секунд
    let type = B.types[0], lost = 0, simT = 0, timer = null, last = 0;
    const fill = h('div', { class: 'bl-fill' }), mark = h('div', { class: 'bl-marks' },
      B.stages.map(st => h('i', { style: `bottom:${(1 - st.at / B.total) * 100}%` }, '−' + st.at + ' л')));
    const tank = h('div', { class: 'bl-tank', role: 'img', 'aria-label': 'Объём крови в организме' }, fill, mark);
    const big = h('div', { class: 'bl-big' }), sub = h('div', { class: 'bl-sub' });
    const stages = h('ol', { class: 'bl-stages' }, B.stages.map(st => h('li', {}, h('b', {}, '−' + st.at + ' л'), ' ', st.text)));
    const types = h('div', { class: 'row bl-types' }, B.types.map(t => h('button', { class: 'btn', type: 'button', 'aria-pressed': String(t === type), onclick: e => { type = t; types.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === e.currentTarget))); reset(); } }, t.name)));
    const go = h('button', { class: 'btn red', type: 'button' }, '▶ Началось кровотечение');
    const fmt = t => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
    function draw() {
      const left = Math.max(0, B.total - lost);
      fill.style.height = (left / B.total * 100) + '%'; fill.style.background = type.color;
      big.textContent = left.toFixed(2).replace('.', ',') + ' л';
      sub.textContent = 'Прошло ' + fmt(simT) + ' · потеряно ' + lost.toFixed(2).replace('.', ',') + ' л';
      [...stages.children].forEach((li, k) => li.classList.toggle('on', lost >= B.stages[k].at));
    }
    function tick(now) {
      const dt = (now - last) / 1000 * SPEED; last = now; simT += dt; lost = Math.min(B.total, lost + type.rate * dt / 60); draw();
      if (lost >= B.stages[B.stages.length - 1].at) { stop('Без помощи — критическая кровопотеря через ' + fmt(simT) + '.'); return; }
      timer = requestAnimationFrame(tick);
    }
    function stop(msg) { cancelAnimationFrame(timer); timer = null; go.textContent = '↺ Сначала'; tank.classList.remove('run'); sub.textContent = msg; }
    function reset() { cancelAnimationFrame(timer); timer = null; lost = 0; simT = 0; tank.classList.remove('run'); go.textContent = '▶ Началось кровотечение'; draw(); }
    go.addEventListener('click', () => {
      if (timer) { stop('Остановили за ' + fmt(simT) + '. Потеряно ' + lost.toFixed(2).replace('.', ',') + ' л.'); return; }
      if (lost > 0) { reset(); return; }
      go.textContent = '■ Кровь остановлена (жгут)'; tank.classList.add('run'); last = performance.now(); timer = requestAnimationFrame(tick);
    });
    reset();
    return widget('Сколько крови теряется', 'время ускорено ×' + SPEED,
      types, h('div', { class: 'bl' }, tank, h('div', {}, big, sub, stages, h('div', { class: 'row' }, go))),
      h('p', { class: 'muted', style: 'margin:14px 0 0;font-size:13px' }, 'В теле взрослого около 5 литров крови. Нажмите старт, а потом — «остановлена», как будто наложили жгут. Скорости условные, для наглядности.'));
  }

  /* ---------- 9. Сортировка пострадавших ---------- */
  function triage() {
    const T = window.TRIAGE; const P = T.people.slice().sort(() => Math.random() - .5);
    let picks = [];
    const cards = h('div', { class: 'tri' });
    const res = h('p', { class: 'tri-res', 'aria-live': 'polite' });
    const check = h('button', { class: 'btn red', type: 'button', disabled: true }, 'Проверить');
    const again = h('button', { class: 'btn', type: 'button', onclick: () => { picks = []; res.textContent = ''; render(); } }, '↺ Заново');
    function render(done) {
      cards.replaceChildren(...P.map(p => {
        const n = picks.indexOf(p.id) + 1;
        const c = h('button', { class: 'tri-card' + (n ? ' picked' : '') + (done ? (p.order === n ? ' ok' : ' bad') : ''), type: 'button', disabled: done || null },
          h('span', { class: 'tri-n' }, n || '·'), h('b', {}, p.name), h('p', {}, p.state),
          done ? h('p', { class: 'tri-why' }, (p.order === n ? '✓ ' : '✗ Правильно: ' + p.order + '. ') + p.why) : null);
        c.addEventListener('click', () => { picks = n ? picks.filter(x => x !== p.id) : picks.concat(p.id); render(); });
        return c;
      }));
      check.disabled = done || picks.length !== P.length;
    }
    check.addEventListener('click', () => {
      const right = P.filter(p => picks.indexOf(p.id) + 1 === p.order).length;
      res.textContent = right === P.length ? 'Всё верно — вы действовали бы как спасатель.' : 'Верно ' + right + ' из ' + P.length + '. Смотрите разбор на карточках.';
      render(true);
    });
    render();
    return widget('Кому помогать первым', 'нажимайте по порядку', h('p', { class: 'tri-intro' }, T.intro), cards, res, h('div', { class: 'row' }, check, again));
  }

  const WIDGETS = { vessels, arteries, tourniquet, myths, kitbuilder, bloodloss, triage, xray: xrayCarousel, burns, cpr };

  document.addEventListener('DOMContentLoaded', () => {
    if (document.body.dataset.page === 'module') renderModule(); else renderIndex();
    if (document.body.dataset.page === 'module') fillContacts();
    const y = document.getElementById('year'); if (y) y.textContent = new Date().getFullYear();
  });
})();
