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
  // размер файла под экран. ПК и планшет: сразу 1280, на больших экранах 1920 — без «мыльных» 640.
  // Телефон: 1280 (крупнее не нужно по весу), 640 — только запасной, пока 1280 не пришёл.
  const PHONE = COARSE && Math.min(screen.width, screen.height) < 600;
  function want() {
    if (PHONE || SLOW) return 'md';
    return R.w * DPR > 1500 ? 'hd' : 'md';
  }

  /* ---------- наборы кадров ---------- */
  // посёлок: круг из N кадров (288 через 1,25°), каждый 4-й — настоящий рендер, между ними — досчитанные;
  // дом: цепочка кадров чистого сектора, 0 — ракурс после подлёта (orbit.zero), смещение off ∈ [min, max]
  const N = () => M.village.orbit.frames;
  const EVERY = () => M.village.orbit.originalEvery || 1;
  const wrapK = k => ((k % N()) + N()) % N();
  const H_ = i => M.houses[i];
  const hIdx = (i, off) => H_(i).orbit.zero + clamp(Math.round(off), H_(i).orbit.min, H_(i).orbit.max);
  const setLen = set => set === 'v' ? N() : H_(set - 1).orbit.frames;
  const dist = (set, a, b) => { const d = Math.abs(a - b); return set === 'v' ? Math.min(d, N() - d) : d; };
  const degPerFrame = () => mode === 'house' || (fly && fly.house) ? H_(current).orbit.stepDeg : M.village.orbit.stepDeg;

  /* ---------- загрузка кадров: очередь с приоритетом ---------- */
  const cache = new Map();            // url → { img, ok }
  const queue = []; let active = 0;
  const LIMIT = COARSE ? 4 : 6;
  function url(set, size, k) { // set: 'v' — посёлок, номер дома 1..6 — облёт дома
    const pat = set === 'v' ? M.village.orbit.pattern : H_(set - 1).orbit.pattern;
    return BASE + pat.replace('{size}', size).replace('{000}', pad(k));
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
  // память: крупные кадры держим только рядом с текущим (раскодированный 1280×720 — ~3,7 МБ, 1920×1080 — ~8 МБ)
  const KEEP = () => PHONE ? 24 : want() === 'hd' ? 32 : 56;
  function evict() {
    const big = [...cache.values()].filter(e => e.ok && !/\/sm\//.test(e.u));
    if (big.length <= KEEP()) return;
    const set = mode === 'house' || (fly && fly.house) ? current + 1 : 'v', cur = curIdx();
    const base = url(set, 'X', 0).replace(/X\/000\.webp$/, '');
    const d = e => e.u.startsWith(base) ? dist(set, +e.u.match(/(\d{3})\.webp$/)[1], cur) : 9999;
    big.sort((a, b) => d(a) - d(b)).slice(KEEP()).forEach(e => cache.delete(e.u));
  }
  // кадр k: нужного размера; если ещё не пришёл — ближайший готовый того же размера (не «мыло»);
  // на телефоне в крайнем случае 640
  function pick(set, k) {
    const s = want(), n = setLen(set);
    let im = got(url(set, s, k)) || (s === 'hd' && got(url(set, 'md', k)));
    if (im) return im;
    for (let d = 1; d <= 12; d++) for (const j of [k - d, k + d]) {
      const jj = set === 'v' ? wrapK(j) : j; if (jj < 0 || jj >= n) continue;
      im = got(url(set, s, jj)) || (s === 'hd' && got(url(set, 'md', jj))); if (im) return im;
    }
    return got(url(set, 'sm', k)) || got(url(set, 'md', k)) || got(url(set, 'hd', k));
  }

  /* ---------- рисование: один кадр, смена — подстройка ≤ 80 мс ---------- */
  const curIdx = () => mode === 'house' || (mode === 'flying' && fly && fly.house) ? hIdx(current, hf) : wrapK(Math.round(vf));
  const curSet = () => mode === 'house' || (mode === 'flying' && fly && fly.house) ? current + 1 : 'v';
  let shownImg = null, prevImg = null, swapAt = 0, lastBg = null;
  const SWAP = 80;
  function draw(now = performance.now()) {
    const im = pick(curSet(), curIdx());
    if (!im) return;
    if (im !== shownImg) { prevImg = shownImg; shownImg = im; swapAt = now; }
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (R.w < W - 1 || R.h < H - 1 || R.x > 0 || R.y > 0) { // подложка: тот же кадр, растянутый из 48×27 — мягкое размытие
      if (lastBg !== im) { tctx.drawImage(im, 0, 0, tiny.width, tiny.height); lastBg = im; }
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(tiny, 0, 0, W, H);
      ctx.fillStyle = 'rgba(18,18,18,.18)'; ctx.fillRect(0, 0, W, H);
    }
    const t = prevImg && !RM ? clamp((now - swapAt) / SWAP, 0, 1) : 1;
    if (t < 1) { ctx.drawImage(prevImg, R.x, R.y, R.w, R.h); ctx.globalAlpha = t; need = true; }
    ctx.drawImage(im, R.x, R.y, R.w, R.h); ctx.globalAlpha = 1;
    if (t >= 1) prevImg = null;
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
  function labelAt(i) { // метка дома i на показанном кадре облёта, в CSS-пикселях
    const p = M.village.orbit.labels[wrapK(Math.round(vf))][i];
    if (!p[2]) return null;
    const x = R.x + p[0] * R.w, y = R.y + p[1] * R.h;
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
  // чувствительность: протяжка на всю ширину экрана — 90° (сенсорный экран — 120°)
  let drag = null, vel = 0, lastMove = 0, idleSince = performance.now(), settled = true;
  const perPx = () => (COARSE ? 120 : 90) / Math.max(W, 320) / degPerFrame(); // кадров на пиксель
  cv.addEventListener('pointerdown', e => {
    if (mode !== 'aerial' && mode !== 'house') return;
    drag = { x: e.clientX, y: e.clientY, x0: e.clientX, t: performance.now(), moved: false, id: e.pointerId };
    vel = 0; anim = null; idleSince = performance.now();
  });
  addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, now = performance.now();
    if (!drag.moved && Math.abs(e.clientX - drag.x0) > 6) { drag.moved = true; try { cv.setPointerCapture(e.pointerId); } catch (_) { } }
    if (!drag.moved) return;
    const df = -dx * perPx(); // вправо — передний план идёт за пальцем
    move(df);
    const v = df / Math.max(8, now - drag.t) * 16;   // кадров за 16 мс
    vel = .7 * vel + .3 * v;
    drag.x = e.clientX; drag.t = now; lastMove = now; idleSince = now; settled = false;
  });
  const up = e => {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    const tap = !drag.moved; drag = null; idleSince = performance.now();
    if (tap && e && e.type === 'pointerup') onTap(e);
    if (performance.now() - lastMove > 90) vel = 0;
    vel = clamp(vel, -1.6, 1.6); // мягкая инерция: без рывка после отпускания
  };
  addEventListener('pointerup', up); addEventListener('pointercancel', up);
  function move(df) {
    if (mode === 'aerial') vf = vf + df;
    else if (mode === 'house') { // мягкий упор у края чистого сектора
      const h = H_(current).orbit, lo = h.min, hi = h.max, room = 4;
      const over = hf < lo ? lo - hf : hf > hi ? hf - hi : 0;
      hf += df * (over > 0 && Math.sign(df) === Math.sign(hf - (lo + hi) / 2) ? Math.max(.06, 1 - over / room) : 1);
      hf = clamp(hf, lo - room, hi + room);
    }
    need = true; prefetchAround();
  }
  addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input,textarea,select')) return;
    if (hero.getBoundingClientRect().bottom < 80) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { const d = e.key === 'ArrowLeft' ? -1 : 1; if (mode === 'aerial' || mode === 'house') { glide(d); e.preventDefault(); } }
    if (e.key === 'Escape' && mode === 'house') backToVillage();
  });
  function glide(d) { // стрелки: к соседнему настоящему кадру рендера
    vel = 0; const E = EVERY(), cur = mode === 'house' ? hf : vf, to = (Math.round(cur / E) + d) * E;
    anim = { from: cur, to: mode === 'house' ? clamp(to, H_(current).orbit.min, H_(current).orbit.max) : to, t0: performance.now(), dur: 380 };
  }
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
  // вокруг текущего кадра: сначала настоящие кадры рендера (через 5° / 7,5°), потом досчитанные между ними
  function prefetchAround(wide) {
    const s = want(), set = curSet(), c = curIdx(), n = setLen(set), E = EVERY();
    const R1 = wide ? 32 : 8, R2 = wide ? 8 : 4; // на старте узко (вес), после — шире; дальше — по ходу свайпа
    for (let d = -R1; d <= R1; d++) {
      let k = c + d; if (set === 'v') k = wrapK(k); else if (k < 0 || k >= n) continue;
      const orig = k % E === 0;
      if (orig) want_(url(set, s, k), 10 + Math.abs(d) / E);
      else if (Math.abs(d) <= R2) want_(url(set, s, k), 12 + Math.abs(d));
      if (PHONE && orig) want_(url(set, 'sm', k), 40 + Math.abs(d)); // телефон: запасные 640 для быстрого свайпа
    }
  }
  const vsize = () => (R.w * DPR > 1500 && !SLOW && !PHONE ? 'hd' : 'md');
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
    want_(url(i + 1, want(), hIdx(i, 0)), 1);
    // докрутка облёта посёлка к ракурсу дома (кратчайшим путём)
    const k = H_(i).orbitFrame; let d = wrapK(k - vf); if (d > N() / 2) d -= N();
    await tween(v => { vf = v; }, vf, vf + d, RM ? 1 : Math.min(1500, 350 + Math.abs(d) * 12));
    vf = k; need = true;
    spin.classList.remove('off'); const ok = await vReady; spin.classList.add('off');
    layout(); // на телефоне стоя кадр поднимается выше карточки
    if (ok) await playVideo();
    await until(() => got(url(i + 1, want(), hIdx(i, 0))), 6000); // стык: кадр облёта дома уже здесь
    hf = 0; fly.house = true; need = true; draw();
    vid.classList.add('off');
    mode = 'house'; fly = null; openCard(i); prefetchAround();
    setTimeout(() => { if (mode === 'house' && current === i) { setVideo(vurl(i, true)); prefetchAround(true); } }, 1200); // обратный подлёт и кадры шире — заранее
  }
  async function backToVillage() {
    if (fly || mode !== 'house') return;
    const i = current; mode = 'flying'; fly = { house: true }; closeCard();
    const vReady = setVideo(vurl(i, true));
    await tween(v => { hf = v; }, hf, 0, RM ? 1 : Math.min(1000, 200 + Math.abs(hf) * 12));
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
    want_(url(i + 1, want(), hIdx(i, 0)), 0);
    await until(() => got(url(i + 1, want(), hIdx(i, 0))), 6000);
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
    } else if (!drag && Math.abs(vel) > .04 && (mode === 'aerial' || mode === 'house')) { // инерция, мягко затухает
      move(vel); vel *= .94;
    } else if (!drag && (mode === 'aerial' || mode === 'house') && !settled) {
      // палец отпущен: доезжаем до ближайшего настоящего кадра рендера (в покое — без досчитанных кадров),
      // в облёте дома — заодно возвращаемся из-за края сектора
      vel = 0; settled = true;
      const E = EVERY(), cur = mode === 'house' ? hf : vf;
      let to = Math.round(cur / E) * E;
      if (mode === 'house') to = clamp(to, H_(current).orbit.min, H_(current).orbit.max);
      if (Math.abs(to - cur) > .01) anim = { from: cur, to, t0: now, dur: 160 + Math.abs(to - cur) * 40 };
    } else if (!drag && mode === 'aerial' && !RM && now - idleSince > 6000) { // медленный облёт сам по себе: кадр за кадром
      const before = Math.round(vf); vf += .03; if (Math.round(vf) !== before) { need = true; if (Math.round(vf) % 4 === 0) prefetchAround(); }
    }
    if (need) { need = false; draw(now); updatePins(); }
  }

  /* ---------- старт ---------- */
  const step = p => { if (bar) bar.style.width = Math.round(p * 100) + '%'; };
  if (/[?&]debug=1/.test(location.search)) window.__dbg = () => ({ mode, vf: +vf.toFixed(2), hf: +hf.toFixed(2), frame: curIdx(), size: want() });
  window.__village = { flyTo, backToVillage, get mode() { return mode === 'intro' ? 'intro' : mode; }, count: (SITE.houses || []).length };
  const introOn = !!window.__introRunning;
  async function start() {
    try {
      M = await (await fetch(BASE + 'manifest.json')).json();
    } catch (e) { return fallback3d(); }
    layout(); makePins();
    want_(url('v', want(), 0), 0);
    prefetchAround();
    requestAnimationFrame(loop);
    if (!introOn) step(.3);
    await until(() => got(url('v', want(), 0)), 15000);
    setTimeout(() => prefetchAround(true), 1500); // после старта — шире вокруг
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
      images: M.houses.map((h, i) => url(i + 1, 'md', hIdx(i, 0))),
      scenes: { wide: url('v', s, 144), street: url(2, s, hIdx(1, 24)) }
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
      if (ph === 'clouds') setTimeout(() => until(() => M && got(url('v', want(), 0)), 8000).then(reveal), COARSE ? 1700 : 2000);
      if (ph === 'ready') { reveal(); mode = 'aerial'; need = true; idleSince = performance.now(); }
      if (ph === 'failed') { reveal(); loader.classList.add('off'); mode = 'aerial'; need = true; emit('phase', { phase: 'ready' }); }
    });
  }
  start();
})();
