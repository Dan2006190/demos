/* =====================================================================
   «Псевдо-3D» на главной: кадры из Blender вместо живого 3D.
   Облёт посёлка — свайп/перетаскивание (72 кадра через 5°), метки домов
   по manifest; нажатие — докрутка к ракурсу дома → подлёт (видео) →
   облёт дома свайпом в чистом секторе → «назад» (обратное видео).
   Файлы — media/ (собирает blender/make_media.py), грузятся лениво:
   сначала маленькие кадры для свайпа, крупные — для текущего кадра и соседей.
   Живое 3D — запасной режим по ?3d=1 (village.js).
   Для страницы ведёт себя как village.js: события village:phase / house /
   thumbs и window.__village { flyTo, backToVillage, mode, count }.
   ===================================================================== */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const SITE = window.SITE || {};
  const BASE = 'media/';
  const hero = $('#hero'), loader = $('#loader'), bar = $('#loader i'), card = $('#card');
  const emit = (name, detail) => dispatchEvent(new CustomEvent('village:' + name, { detail }));
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const net = navigator.connection || {};
  const SLOW = net.saveData || /(^|-)2g$/.test(net.effectiveType || '');
  const COARSE = matchMedia('(pointer:coarse)').matches;
  const mln = n => (Math.round(n / 1e5) / 10).toString().replace('.', ',') + ' млн ₽';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const pad = k => String(k).padStart(3, '0');

  let M = null;                      // manifest
  let mode = 'intro', current = -1;  // aerial | flying | house | intro
  let vf = 0;                        // кадр облёта посёлка (дробный)
  let hf = 0;                        // кадр облёта дома относительно 0 (дробный, в пределах сектора)
  let need = true;                   // перерисовать

  /* ---------- холст и раскладка кадра ---------- */
  const wrap = document.createElement('div'); wrap.id = 'pseudo';
  const cv = document.createElement('canvas'); cv.setAttribute('aria-label', 'Посёлок: перетащите, чтобы облететь; нажмите на дом');
  const vid = document.createElement('video');
  vid.muted = true; vid.playsInline = true; vid.setAttribute('playsinline', ''); vid.preload = 'auto'; vid.className = 'off';
  const spin = document.createElement('i'); spin.className = 'spin off';
  wrap.append(cv, vid, spin);
  hero.insertBefore(wrap, $('#scene').nextSibling);
  const ctx = cv.getContext('2d');
  const tiny = document.createElement('canvas'); tiny.width = 48; tiny.height = 27; // размытая подложка (телефон стоя)
  const tctx = tiny.getContext('2d');
  let W = 1, H = 1, DPR = 1, R = { x: 0, y: 0, w: 1, h: 1 };  // R — прямоугольник кадра в CSS-пикселях

  function layout() {
    DPR = Math.min(devicePixelRatio || 1, 2);
    W = hero.clientWidth; H = hero.clientHeight;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    const ar = 16 / 9;
    if (W / H >= 1.15) { // экран шире высоты: кадр на весь экран (обрезка по краям)
      const s = Math.max(W / ar, H); R = { w: s * ar, h: s }; R.x = (W - R.w) / 2; R.y = (H - R.h) / 2;
    } else { // телефон стоя: кадр крупно по центру (видно ~42 % ширины), сверху и снизу — размытое продолжение
      R.w = Math.min(W * 2.4, H * .78 * ar); R.h = R.w / ar;
      R.x = (W - R.w) / 2;
      const cy = mode === 'house' || mode === 'flying' ? .36 : .46; // карточка снизу — дом выше
      R.y = clamp(H * cy - R.h / 2, 0, H - R.h);
    }
    Object.assign(vid.style, { left: R.x + 'px', top: R.y + 'px', width: R.w + 'px', height: R.h + 'px' });
    need = true;
  }
  addEventListener('resize', layout);
  new ResizeObserver(layout).observe(hero);
  // размер файла под экран: ширина кадра на экране в пикселях устройства
  function want() {
    const px = R.w * DPR;
    let s = px > 1500 ? 'hd' : px > 700 ? 'md' : 'sm';
    if (SLOW && s !== 'sm') s = 'md';
    return s;
  }
  const SIZES = ['sm', 'md', 'hd'];

  /* ---------- загрузка кадров: очередь с приоритетом ---------- */
  const cache = new Map();            // url → { img, ok }
  const queue = []; let active = 0;
  const LIMIT = COARSE ? 4 : 6;
  function url(set, size, k) { // set: 'v' — посёлок, номер дома 1..6 — облёт дома
    if (set === 'v') return BASE + M.village.orbit.pattern.replace('{size}', size).replace('{000}', pad(k));
    const h = M.houses[set - 1]; return BASE + h.orbit.pattern.replace('{size}', size).replace('{000}', pad(k));
  }
  function want_(u, prio) {
    const c = cache.get(u);
    if (c) { if (!c.started && prio < c.prio) { c.prio = prio; queue.sort((a, b) => a.prio - b.prio); } return c; }
    const e = { u, prio, img: null, ok: false, started: false }; cache.set(u, e); queue.push(e); queue.sort((a, b) => a.prio - b.prio); pump(); return e;
  }
  function pump() {
    while (active < LIMIT && queue.length) {
      const e = queue.shift(); e.started = true; active++;
      const img = new Image(); img.decoding = 'async';
      img.onload = () => { (img.decode ? img.decode() : Promise.resolve()).catch(() => { }).then(() => { e.img = img; e.ok = true; active--; need = true; pump(); if (!/\/sm\//.test(e.u)) evict(); }); };
      img.onerror = () => { active--; pump(); };
      img.src = e.u;
    }
  }
  const got = u => { const c = cache.get(u); return c && c.ok ? c.img : null; };
  // память: крупные кадры держим только рядом с текущим (раскодированный 1920×1080 — ~8 МБ)
  const KEEP = COARSE ? 16 : 28;
  function evict() {
    const big = [...cache.values()].filter(e => e.ok && !/\/sm\//.test(e.u));
    if (big.length <= KEEP) return;
    const cur = mode === 'house' || (fly && fly.house) ? url(current + 1, 'sm', hk(current, hf)) : url('v', 'sm', wrapK(Math.round(vf)));
    const num = u => +u.match(/(\d{3})\.webp$/)[1], same = (a, b) => a.replace(/\/(sm|md|hd)\/\d{3}\.webp$/, '') === b.replace(/\/sm\/\d{3}\.webp$/, '');
    const dist = e => same(e.u, cur) ? Math.min(Math.abs(num(e.u) - num(cur)), 72 - Math.abs(num(e.u) - num(cur))) : 999;
    big.sort((a, b) => dist(a) - dist(b)).slice(KEEP).forEach(e => cache.delete(e.u));
  }
  // лучший уже загруженный файл кадра: нужного размера, иначе меньше/больше
  function best(set, k) {
    const s = want(), order = [s, ...SIZES.filter(x => x !== s).reverse()];
    for (const z of order) { const im = got(url(set, z, k)); if (im) return im; }
    return null;
  }

  /* ---------- облёт дома: сектор без ёлок ---------- */
  const H_ = i => M.houses[i];
  const hk = (i, off) => { const s = H_(i).orbit.sector, z = s.indexOf(0); return s[clamp(Math.round(off), -z, s.length - 1 - z) + z]; };
  const hkf = (i, off) => { const s = H_(i).orbit.sector, z = s.indexOf(0), j = clamp(off, -z, s.length - 1 - z) + z; return [s[Math.floor(j)], s[Math.min(s.length - 1, Math.floor(j) + 1)], j - Math.floor(j)]; };

  /* ---------- рисование ---------- */
  const N = () => M.village.orbit.frames;
  const wrapK = k => ((k % N()) + N()) % N();
  function frameImgs() { // [img0, img1, доля второго] для текущего состояния
    if (mode === 'house' || (mode === 'flying' && fly && fly.house)) {
      const [a, b, t] = hkf(current, hf); return [best(current + 1, a) || nearest(current + 1, a), best(current + 1, b), t];
    }
    const a = wrapK(Math.floor(vf)), b = wrapK(a + 1), t = vf - Math.floor(vf);
    return [best('v', a) || nearest('v', a), best('v', b), t];
  }
  function nearest(set, k) { // кадр ещё не пришёл — показываем ближайший готовый
    const list = set === 'v' ? [...Array(N()).keys()] : H_(set - 1).orbit.sector;
    let bestIm = null, d = 1e9;
    for (const j of list) { const im = best(set, j); if (im) { const dd = Math.min(Math.abs(j - k), N() - Math.abs(j - k)); if (dd < d) { d = dd; bestIm = im; } } }
    return bestIm;
  }
  let lastBg = null;
  function draw() {
    const [a, b, t] = frameImgs();
    if (!a) return;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (R.w < W - 1 || R.h < H - 1 || R.x > 0 || R.y > 0) { // подложка: тот же кадр, растянутый из 48×27 — мягкое размытие
      if (lastBg !== a) { tctx.drawImage(a, 0, 0, tiny.width, tiny.height); lastBg = a; }
      ctx.imageSmoothingEnabled = true; ctx.filter = 'none';
      ctx.drawImage(tiny, 0, 0, W, H);
      ctx.fillStyle = 'rgba(18,18,18,.18)'; ctx.fillRect(0, 0, W, H);
    }
    ctx.globalAlpha = 1; ctx.drawImage(a, R.x, R.y, R.w, R.h);
    if (b && t > .01 && b !== a) { ctx.globalAlpha = t; ctx.drawImage(b, R.x, R.y, R.w, R.h); ctx.globalAlpha = 1; }
  }

  /* ---------- метки домов ---------- */
  const pinsBox = $('#pins');
  let pins = [];
  function makePins() {
    pins = (SITE.houses || []).slice(0, M.houses.length).map((h, i) => {
      const el = document.createElement('button'); el.className = 'pin'; el.type = 'button';
      el.innerHTML = `<b>${h.name}</b><span>от ${mln(h.price)}</span>`;
      el.setAttribute('aria-label', h.name + ', показать дом');
      el.onclick = e => { e.stopPropagation(); flyTo(i); };
      pinsBox.appendChild(el); return el;
    });
  }
  function labelAt(i) { // координаты метки дома i на текущем (дробном) кадре облёта, в CSS-пикселях
    const L = M.village.orbit.labels, a = wrapK(Math.floor(vf)), b = wrapK(a + 1), t = vf - Math.floor(vf);
    const p = L[a][i], q = L[b][i];
    if (!p[2] && !q[2]) return null;
    const fx = p[0] + (q[0] - p[0]) * t, fy = p[1] + (q[1] - p[1]) * t;
    const x = R.x + fx * R.w, y = R.y + fy * R.h;
    return x < 8 || x > W - 8 || y < 60 || y > H - 20 ? null : { x, y };
  }
  function updatePins() {
    pins.forEach((el, i) => {
      const p = mode === 'aerial' ? labelAt(i) : null;
      el.classList.toggle('on', !!p);
      if (p) { // у края экрана метку прижимаем внутрь, чтобы не обрезалась
        const hw = (el.offsetWidth || 120) / 2 + 6, x = clamp(p.x, hw, W - hw);
        el.style.transform = `translate(${x}px,${p.y}px) translate(-50%,-100%) translateY(-18px)`;
      }
    });
  }

  /* ---------- свайп / перетаскивание ---------- */
  let drag = null, vel = 0, lastMove = 0, idleSince = performance.now();
  const perPx = () => (mode === 'house' ? 48 : N()) / (Math.max(W, 360) * (COARSE ? 1.6 : 2.2)); // кадров на пиксель
  cv.addEventListener('pointerdown', e => {
    if (mode !== 'aerial' && mode !== 'house') return;
    drag = { x: e.clientX, y: e.clientY, x0: e.clientX, t: performance.now(), moved: false, id: e.pointerId };
    vel = 0; idleSince = performance.now();
  });
  addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, now = performance.now();
    if (!drag.moved && Math.abs(e.clientX - drag.x0) > 6) { drag.moved = true; try { cv.setPointerCapture(e.pointerId); } catch (_) { } }
    if (!drag.moved) return;
    const df = -dx * perPx(); // вправо — передний план идёт за пальцем
    move(df);
    vel = .8 * vel + .2 * (df / Math.max(1, now - drag.t) * 16);
    drag.x = e.clientX; drag.t = now; lastMove = now; idleSince = now;
  });
  const up = e => {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    const tap = !drag.moved; drag = null; idleSince = performance.now();
    if (tap && e && e.type === 'pointerup') onTap(e);
    if (performance.now() - lastMove > 80) vel = 0;
  };
  addEventListener('pointerup', up); addEventListener('pointercancel', up);
  function move(df) {
    if (mode === 'aerial') vf = vf + df;
    else if (mode === 'house') { // мягкий упор у края чистого сектора
      const h = H_(current).orbit, lo = h.min, hi = h.max;
      const over = hf < lo ? lo - hf : hf > hi ? hf - hi : 0;
      hf += df * (over > 0 && Math.sign(df) === Math.sign(hf - (lo + hi) / 2) ? Math.max(.08, 1 - over / .9) : 1);
      hf = clamp(hf, lo - 1, hi + 1);
    }
    need = true; prefetchAround();
  }
  addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input,textarea,select')) return;
    if (hero.getBoundingClientRect().bottom < 80) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { const d = e.key === 'ArrowLeft' ? -1 : 1; if (mode === 'aerial' || mode === 'house') { glide(d); e.preventDefault(); } }
    if (e.key === 'Escape' && mode === 'house') backToVillage();
  });
  function glide(d) { vel = 0; anim = { from: mode === 'house' ? hf : vf, to: Math.round(mode === 'house' ? hf : vf) + d, t0: performance.now(), dur: 260 }; }
  let anim = null;
  function onTap(e) { // нажали на картинку: ближайшая метка в радиусе — к этому дому
    if (mode !== 'aerial') return;
    const rc = cv.getBoundingClientRect(), x = e.clientX - rc.left, y = e.clientY - rc.top;
    let bi = -1, bd = COARSE ? 70 : 55;
    pins.forEach((_, i) => { const p = labelAt(i); if (!p) return; const d = Math.hypot(p.x - x, p.y + 30 - y); if (d < bd) { bd = d; bi = i; } });
    if (bi >= 0) flyTo(bi);
  }
  cv.addEventListener('pointermove', e => { // наведение мышью: подсветка метки
    if (COARSE || mode !== 'aerial' || drag) return;
    const rc = cv.getBoundingClientRect(), x = e.clientX - rc.left, y = e.clientY - rc.top;
    let bi = -1; pins.forEach((_, i) => { const p = labelAt(i); if (p && Math.hypot(p.x - x, p.y + 30 - y) < 55) bi = i; });
    pins.forEach((p, i) => p.classList.toggle('hot', i === bi)); cv.style.cursor = bi >= 0 ? 'pointer' : 'grab';
  });

  /* ---------- предзагрузка ---------- */
  function prefetchAround() {
    const s = want();
    if (mode === 'house' || (mode === 'flying' && fly && fly.house)) {
      const sec = H_(current).orbit.sector, z = sec.indexOf(0), j = clamp(Math.round(hf), -z, sec.length - 1 - z) + z;
      sec.forEach((k, n) => { want_(url(current + 1, 'sm', k), 20 + Math.abs(n - j)); if (Math.abs(n - j) <= 3) want_(url(current + 1, s, k), 10 + Math.abs(n - j)); });
      return;
    }
    const c = wrapK(Math.round(vf));
    for (let d = -4; d <= 4; d++) want_(url('v', s, wrapK(c + d)), 10 + Math.abs(d));
  }
  function prefetchVillage() { // все маленькие кадры облёта — по удалённости от текущего
    const c = wrapK(Math.round(vf));
    for (let d = 0; d <= N() / 2; d++) { want_(url('v', 'sm', wrapK(c + d)), 30 + d); want_(url('v', 'sm', wrapK(c - d)), 30 + d); }
  }
  const vsize = () => (R.w * DPR > 1500 && !SLOW ? 'hd' : 'md');
  const vurl = (i, rev) => BASE + (rev ? H_(i).approach.reverse : H_(i).approach.file).replace('{size}', vsize());

  /* ---------- подлёт к дому и обратно ---------- */
  let fly = null;
  function setVideo(src) { return new Promise(res => {
    let done = false; const ok = () => { if (!done) { done = true; res(true); } };
    vid.oncanplaythrough = ok; vid.onloadeddata = () => setTimeout(ok, 300); vid.onerror = () => { if (!done) { done = true; res(false); } };
    // iOS Safari не догружает видео до запуска — не ждём «готово», через 1,5 с запускаем (догрузит на ходу)
    setTimeout(ok, 1500);
    if (vid.getAttribute('src') !== src) { vid.src = src; vid.load(); } else if (vid.readyState >= 3) ok();
  }); }
  function playVideo() { return new Promise(res => {
    vid.currentTime = 0; vid.classList.remove('off');
    let fin = false; const end = () => { if (fin) return; fin = true; vid.onended = null; res(); };
    vid.onended = end;
    const p = vid.play(); if (p && p.catch) p.catch(end);
    setTimeout(end, (vid.duration || 4) * 1000 + 1500);
  }); }
  async function flyTo(i) {
    if (fly || !M || i < 0 || i >= M.houses.length) return;
    if (mode === 'house') { if (i === current) return; return switchHouse(i); }
    if (mode !== 'aerial') return;
    mode = 'flying'; current = i; fly = { house: false };
    $('#hint').classList.add('off'); closeCard(); updatePins();
    // параллельно: видео подлёта и первые кадры облёта дома
    const vReady = setVideo(vurl(i, false));
    want_(url(i + 1, want(), 0), 1); want_(url(i + 1, 'sm', 0), 0);
    // докрутка облёта посёлка к ракурсу дома (кратчайшим путём)
    const k = H_(i).orbitFrame; let d = wrapK(k - vf); if (d > N() / 2) d -= N();
    await tween(v => { vf = v; }, vf, vf + d, RM ? 1 : Math.min(1400, 350 + Math.abs(d) * 45));
    vf = k; need = true;
    spin.classList.remove('off'); const ok = await vReady; spin.classList.add('off');
    layout(); // на телефоне стоя кадр поднимается выше карточки
    if (ok) await playVideo();
    await until(() => got(url(i + 1, 'sm', 0)) || got(url(i + 1, want(), 0)), 6000); // стык: кадр облёта дома уже здесь
    hf = 0; fly.house = true; need = true; draw();
    vid.classList.add('off');
    mode = 'house'; fly = null; openCard(i); prefetchAround();
    setTimeout(() => { if (mode === 'house' && current === i) setVideo(vurl(i, true)); }, 1200); // обратный подлёт — заранее
  }
  async function backToVillage() {
    if (fly || mode !== 'house') return;
    const i = current; mode = 'flying'; fly = { house: true }; closeCard();
    const vReady = setVideo(vurl(i, true));
    await tween(v => { hf = v; }, hf, 0, RM ? 1 : Math.min(900, 200 + Math.abs(hf) * 40));
    hf = 0; need = true;
    spin.classList.remove('off'); const ok = await vReady; spin.classList.add('off');
    fly.house = false; vf = H_(i).orbitFrame; layout();
    if (ok) await playVideo();
    vid.classList.add('off'); need = true;
    mode = 'aerial'; current = -1; fly = null; idleSince = performance.now(); layout();
    $('#hint').classList.remove('off'); prefetchAround();
  }
  async function switchHouse(i) { // «следующий / предыдущий» в карточке: сразу к облёту другого дома
    mode = 'flying'; fly = { house: true }; closeCard();
    want_(url(i + 1, 'sm', 0), 0); want_(url(i + 1, want(), 0), 1);
    await new Promise(r => { const t0 = performance.now(); (function w() { if (got(url(i + 1, 'sm', 0)) || performance.now() - t0 > 6000) r(); else setTimeout(w, 50); })(); });
    wrap.classList.add('fade'); await new Promise(r => setTimeout(r, 220));
    current = i; hf = 0; need = true; draw(); wrap.classList.remove('fade');
    mode = 'house'; fly = null; openCard(i); prefetchAround();
    setTimeout(() => { if (mode === 'house' && current === i) setVideo(vurl(i, true)); }, 1200);
  }
  function tween(set, from, to, dur) { return new Promise(res => { anim = { from, to, t0: performance.now(), dur, set, res }; }); }

  /* ---------- карточка (как в 3D) ---------- */
  function openCard(i) {
    const d = SITE.houses[i];
    $('#c-name').textContent = d.name;
    const cl = $('#c-lead'); if (cl) cl.textContent = d.lead || '';
    $('#c-specs').innerHTML = d.specs.map(s => `<span>${s}</span>`).join('');
    $('#c-price').textContent = 'от ' + mln(d.price);
    $('#c-calc').dataset.i = i; $('#c-want').dataset.i = i;
    emit('house', { i });
    card.classList.add('on'); $('#back').classList.add('on'); hero.classList.add('in-house');
  }
  function closeCard() { card.classList.remove('on'); $('#back').classList.remove('on'); hero.classList.remove('in-house'); emit('house', { i: -1 }); }
  $('#back').onclick = backToVillage;
  $('#c-prev').onclick = () => { if (mode === 'house') switchHouse((current + M.houses.length - 1) % M.houses.length); };
  $('#c-next').onclick = () => { if (mode === 'house') switchHouse((current + 1) % M.houses.length); };

  /* ---------- цикл ---------- */
  let visible = true;
  new IntersectionObserver(es => { visible = es[0].isIntersecting; }).observe(hero);
  function loop(now) {
    requestAnimationFrame(loop);
    if (!M || !visible) return;
    if (anim) {
      const t = clamp((now - anim.t0) / anim.dur, 0, 1), v = anim.from + (anim.to - anim.from) * ease(t);
      if (anim.set) anim.set(v); else if (mode === 'house') hf = v; else vf = v;
      need = true;
      if (t >= 1) { const r = anim.res; anim = null; r && r(); }
    } else if (!drag && Math.abs(vel) > .002 && (mode === 'aerial' || mode === 'house')) { // инерция
      move(vel); vel *= .92;
    } else if (!drag && mode === 'house') { // упор: возвращаемся в сектор
      const h = H_(current).orbit;
      if (hf < h.min - .001 || hf > h.max + .001) { hf += (clamp(hf, h.min, h.max) - hf) * .18; need = true; }
    } else if (!drag && mode === 'aerial' && !RM && now - idleSince > 5000) { // медленный облёт сам по себе
      vf += .012; need = true; if (Math.floor(vf * 4) !== Math.floor((vf - .012) * 4)) prefetchAround();
    }
    if (need) { need = false; draw(); updatePins(); }
  }

  /* ---------- старт ---------- */
  const step = p => { if (bar) bar.style.width = Math.round(p * 100) + '%'; };
  window.__village = { flyTo, backToVillage, get mode() { return mode === 'intro' ? 'intro' : mode; }, count: (SITE.houses || []).length };
  const introOn = !!window.__introRunning;
  async function start() {
    try {
      M = await (await fetch(BASE + 'manifest.json')).json();
    } catch (e) { return fallback3d(); }
    layout(); makePins();
    want_(url('v', 'sm', 0), 0); want_(url('v', want(), 0), 1);
    prefetchAround(); prefetchVillage();
    requestAnimationFrame(loop);
    if (!introOn) step(.3);
    await until(() => got(url('v', 'sm', 0)) || got(url('v', want(), 0)), 15000);
    if (!introOn) {
      step(1); loader.classList.add('off');
      mode = 'aerial'; need = true; emit('phase', { phase: 'short' });
      setTimeout(() => { emit('phase', { phase: 'ready' }); $('#hint').classList.remove('off'); }, 900);
      try { localStorage.setItem('estate-intro', '1'); } catch (e) { }
    }
    // рендеры каталога и сцены для секций — после первого кадра, чтобы не мешали
    setTimeout(thumbs, introOn ? 9000 : 1500);
  }
  function thumbs() {
    const s = innerWidth * Math.min(devicePixelRatio || 1, 2) > 1600 ? 'hd' : 'md';
    emit('thumbs', {
      images: M.houses.map((h, i) => url(i + 1, 'md', 0)),
      scenes: { wide: url('v', s, 36), street: url(2, s, 6) }
    });
  }
  const until = (f, ms) => new Promise(r => { const t0 = performance.now(); (function w() { if (f() || performance.now() - t0 > ms) r(); else setTimeout(w, 40); })(); });
  function fallback3d() { // нет кадров — живое 3D
    wrap.remove(); window.VILLAGE_INTRO = false; delete window.__village;
    const s = document.createElement('script'); s.src = 'village.js'; document.body.appendChild(s);
  }

  // вступление сквозь облака (живое 3D, village.js): кадр облёта проступает, пока камера опускается под облака
  if (introOn) {
    wrap.classList.add('hidden');
    let shown = false;
    const reveal = () => {
      if (shown) return; shown = true;
      wrap.classList.remove('hidden'); wrap.classList.add('reveal');
      setTimeout(() => { wrap.classList.remove('reveal'); window.__villageIntro && window.__villageIntro.stop(); }, 2200);
    };
    addEventListener('village:phase', e => {
      const ph = e.detail.phase;
      if (ph === 'clouds') setTimeout(() => until(() => M && got(url('v', 'sm', 0)), 8000).then(reveal), COARSE ? 1700 : 2000);
      if (ph === 'ready') { reveal(); mode = 'aerial'; need = true; idleSince = performance.now(); }
      if (ph === 'failed') { reveal(); loader.classList.add('off'); mode = 'aerial'; need = true; emit('phase', { phase: 'ready' }); }
    });
  }
  start();
})();
