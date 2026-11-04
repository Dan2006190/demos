/* =====================================================================
   СтройДемо — «Ремонт в 3D» (демо): режимы «Комната» и «Дом снаружи».
   Цены — PRICES.finish и PRICES.exterior из prices.js (тот же объект,
   что у калькулятора).
   three.js подключается через importmap в viz.html и грузится
   динамическим import(): так страница работает и при открытии файла
   двойным щелчком (file://), где обычный <script type="module" src>
   блокируется браузером. Всё строится кодом: моделей и картинок нет.
   ===================================================================== */
(function () {
  'use strict';

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const F = PRICES.finish;
  const nf0 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const nf2 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
  const CUR = ' ' + PRICES.currency;
  const money = n => nf0.format(n) + CUR;
  const range = (lo, hi) => nf0.format(lo) + ' – ' + nf0.format(hi) + CUR;
  const r100 = n => Math.round(n / 100) * 100;
  const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const unitPrice = it => it.work + it.mat;
  const isTouch = window.matchMedia('(pointer: coarse)').matches;

  /* ---------- visual presets (цены — в prices.js) ---------- */
  const WALL_COLORS = [
    { name: 'Белый',        hex: '#efede7' },
    { name: 'Тёплый серый', hex: '#cdc6bb' },
    { name: 'Песочный',     hex: '#e1cba6' },
    { name: 'Шалфей',       hex: '#a7b398' },
    { name: 'Голубой туман', hex: '#b5c5ce' },
    { name: 'Терракота',    hex: '#c27c5c' },
    { name: 'Графит',       hex: '#50555c' },
    { name: 'Тёмно-синий',  hex: '#34465d' }
  ];
  const WALLPAPERS = [{ name: 'Полоска' }, { name: 'Ромб' }, { name: 'Листья' }];
  const WALL_NAMES = { back: 'Дальняя', left: 'Левая', right: 'Правая', front: 'Ближняя' };
  const DIMS = {
    L: { name: 'Длина',  min: 1.5, max: 8,   step: 0.05 },
    W: { name: 'Ширина', min: 1.5, max: 6,   step: 0.05 },
    H: { name: 'Высота', min: 2.4, max: 3.5, step: 0.05 }
  };
  const TEMPLATES = {
    room: {
      name: 'Комната', L: 4, W: 3, H: 2.7,
      win: { wall: 'back', pos: 50, w: 1.4, h: 1.5, sill: 0.85 },
      door: { wall: 'front', pos: 15, w: 0.8, h: 2.05 },
      floor: 'lam_light', walls: 'wallpaper', wallColor: 0, wallpaper: 1, ceiling: 'paint'
    },
    kitchen: {
      name: 'Кухня', L: 3.4, W: 2.8, H: 2.7,
      win: { wall: 'back', pos: 65, w: 1.2, h: 1.4, sill: 0.9 },
      door: { wall: 'left', pos: 20, w: 0.8, h: 2.05 },
      floor: 'tile', walls: 'paint', wallColor: 3, wallpaper: 0, ceiling: 'paint'
    },
    bath: {
      name: 'Ванная', L: 2.2, W: 1.8, H: 2.6,
      win: { wall: 'back', pos: 50, w: 0.6, h: 0.6, sill: 1.5 },
      door: { wall: 'front', pos: 80, w: 0.7, h: 2.0 },
      floor: 'tile', walls: 'tile', wallColor: 0, wallpaper: 0, ceiling: 'stretch'
    }
  };

  const S = {};
  function applyTemplate(k) {
    const t = TEMPLATES[k];
    Object.assign(S, {
      tpl: k, L: t.L, W: t.W, H: t.H,
      win: Object.assign({}, t.win), door: Object.assign({}, t.door),
      floor: t.floor, walls: t.walls, wallColor: t.wallColor, wallpaper: t.wallpaper, ceiling: t.ceiling
    });
  }

  /* ---------- room math (без three.js) ---------- */
  function wallLen(w) { return w === 'back' || w === 'front' ? S.L : S.W; }
  // Проём в координатах стены: u — вдоль стены (м), v — вверх от пола (м).
  // Ползунок 0% = левый (или ближний) угол, 100% = правый (или дальний).
  function opening(o, isWin) {
    if (!o || o.wall === 'none') return null;
    const len = wallLen(o.wall);
    const w = Math.min(o.w, len - 0.2);
    const v0 = isWin ? Math.min(o.sill, S.H - 0.5) : 0;
    const h = isWin ? Math.min(o.h, S.H - v0 - 0.15) : Math.min(o.h, S.H - 0.1);
    const t = o.pos / 100, flip = o.wall === 'front' || o.wall === 'right';
    const c0 = w / 2 + 0.1, c1 = len - w / 2 - 0.1;
    const uc = c0 + (c1 - c0) * (flip ? 1 - t : t);
    return { wall: o.wall, u0: uc - w / 2, u1: uc + w / 2, v0: v0, v1: v0 + h, w: w, h: h };
  }
  function overlap(a, b) {
    return !!(a && b && a.wall === b.wall && a.u0 < b.u1 + 0.1 && b.u0 < a.u1 + 0.1 && a.v0 < b.v1 && b.v0 < a.v1);
  }
  function areas() {
    const win = opening(S.win, true), door = opening(S.door, false);
    const floor = S.L * S.W, per = 2 * (S.L + S.W);
    const walls = per * S.H - (win ? win.w * win.h : 0) - (door ? door.w * door.h : 0);
    return { floor: floor, ceil: floor, walls: Math.max(0, walls), skirt: Math.max(0, per - (door ? door.w : 0)), win: win, door: door };
  }

  function wallLabel() {
    if (S.walls === 'paint') return 'покраска, «' + WALL_COLORS[S.wallColor].name + '»';
    if (S.walls === 'wallpaper') return 'обои «' + WALLPAPERS[S.wallpaper].name + '»';
    return F.walls.tile.name.toLowerCase();
  }
  function estimate() {
    const a = areas(), sp = PRICES.spread, rows = [];
    function add(title, what, item, qty, unit) {
      rows.push({ title: title, what: what, qty: qty, unit: unit, price: unitPrice(item),
        work: item.work * qty, mat: item.mat * qty, sum: unitPrice(item) * qty });
    }
    add('Пол', F.floor[S.floor].name.toLowerCase(), F.floor[S.floor], a.floor, 'м²');
    add('Стены', wallLabel(), F.walls[S.walls], a.walls, 'м²');
    add('Потолок', F.ceiling[S.ceiling].name.toLowerCase(), F.ceiling[S.ceiling], a.ceil, 'м²');
    if (S.walls !== 'tile') add(F.skirting.name, 'по периметру без двери', F.skirting, a.skirt, F.skirting.unit);
    let base = 0, work = 0, mat = 0;
    rows.forEach(r => { base += r.sum; work += r.work; mat += r.mat; });
    return { rows: rows, a: a, base: base, work: work, mat: mat, lo: r100(base * (1 - sp)), hi: r100(base * (1 + sp)) };
  }
  function summaryLines() {
    const a = areas();
    return [
      TEMPLATES[S.tpl].name + ': ' + nf2.format(S.L) + ' × ' + nf2.format(S.W) + ' м, потолок ' + nf2.format(S.H) + ' м',
      'Пол: ' + F.floor[S.floor].name.toLowerCase(),
      'Стены: ' + wallLabel(),
      'Потолок: ' + F.ceiling[S.ceiling].name.toLowerCase(),
      'Окно: ' + (a.win ? WALL_NAMES[a.win.wall].toLowerCase() + ' стена' : 'нет') +
        ' · дверь: ' + WALL_NAMES[a.door.wall].toLowerCase() + ' стена'
    ];
  }

  /* ---------- procedural textures (canvas) ---------- */
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function cnv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16), f = v => Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k);
    return 'rgb(' + f(n >> 16) + ',' + f((n >> 8) & 255) + ',' + f(n & 255) + ')';
  }
  function grain(ctx, w, h, amp, seed) {
    const r = rng(seed), img = ctx.getImageData(0, 0, w, h), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * amp; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    ctx.putImageData(img, 0, 0);
  }

  // Доски: canvas w×h соответствует size[0]×size[1] метров, строк rows, доска длиной len px.
  function planks(o) {
    const c = cnv(o.w, o.h), x = c.getContext('2d'), rowH = o.h / o.rows, n = o.w / o.len;
    for (let row = 0; row < o.rows; row++) {
      const y0 = row * rowH, off = Math.floor(rng(o.seed + row * 13)() * o.len);
      for (let k = -1; k * o.len + off < o.w; k++) {
        const idx = ((k % n) + n) % n, r = rng(o.seed * 1000 + row * 97 + idx); // одинаковая доска при переносе через край
        const px = k * o.len + off;
        x.save();
        x.beginPath(); x.rect(px, y0, o.len, rowH); x.clip();
        x.fillStyle = shade(o.colors[Math.floor(r() * o.colors.length)], (r() - 0.5) * 0.14);
        x.fillRect(px, y0, o.len, rowH);
        for (let g = 0; g < o.lines; g++) {
          const gy = y0 + r() * rowH, amp = 0.6 + r() * 2.4, ph = r() * 6.28, fr = (1 + r() * 3) * 6.28 / o.len;
          x.strokeStyle = r() < 0.65 ? 'rgba(55,32,14,' + (0.04 + r() * 0.09) + ')' : 'rgba(255,244,226,' + (0.05 + r() * 0.07) + ')';
          x.lineWidth = 0.6 + r() * 1.8;
          x.beginPath();
          for (let s = 0; s <= o.len; s += 16) {
            const yy = gy + Math.sin(ph + s * fr) * amp;
            if (s === 0) x.moveTo(px + s, yy); else x.lineTo(px + s, yy);
          }
          x.stroke();
        }
        if (r() < o.knots) {
          const kx = px + 30 + r() * (o.len - 60), ky = y0 + rowH * (0.3 + r() * 0.4), kr = 3 + r() * 5;
          x.fillStyle = 'rgba(60,35,15,.28)';
          x.beginPath(); x.ellipse(kx, ky, kr * 2.2, kr, 0, 0, 6.29); x.fill();
        }
        x.fillStyle = 'rgba(255,255,255,.12)'; x.fillRect(px, y0 + 2, o.len, 1.5);
        x.fillStyle = o.seam; x.fillRect(px, y0, 2, rowH);
        x.restore();
      }
      x.fillStyle = o.seam; x.fillRect(0, y0, o.w, 2);
    }
    grain(x, o.w, o.h, 8, o.seed);
    return { canvas: c, size: o.size };
  }

  // Плитка: cols×rows плиток на canvas, швы шириной gw px.
  function tiles(o) {
    const c = cnv(o.w, o.h), x = c.getContext('2d'), r = rng(o.seed), tw = o.w / o.cols, th = o.h / o.rows;
    for (let i = 0; i < o.cols; i++) for (let j = 0; j < o.rows; j++) {
      const tx = i * tw, ty = j * th;
      const gr = x.createLinearGradient(tx, ty, tx + tw, ty + th);
      const k = (r() - 0.5) * o.vary;
      gr.addColorStop(0, shade(o.color, k + o.gloss)); gr.addColorStop(1, shade(o.color, k - o.gloss * 0.5));
      x.fillStyle = gr; x.fillRect(tx, ty, tw, th);
      for (let s = 0; s < o.speck; s++) {
        x.fillStyle = r() < 0.5 ? 'rgba(0,0,0,' + (0.03 + r() * 0.06) + ')' : 'rgba(255,255,255,' + (0.05 + r() * 0.08) + ')';
        x.fillRect(tx + r() * tw, ty + r() * th, 1 + r() * 2, 1 + r() * 2);
      }
      if (o.veins) {
        x.strokeStyle = 'rgba(120,115,105,.10)'; x.lineWidth = 1 + r() * 1.5;
        x.beginPath(); x.moveTo(tx, ty + r() * th);
        x.bezierCurveTo(tx + tw * 0.3, ty + r() * th, tx + tw * 0.7, ty + r() * th, tx + tw, ty + r() * th);
        x.stroke();
      }
    }
    x.fillStyle = o.grout;
    for (let i = 0; i <= o.cols; i++) x.fillRect(i * tw - o.gw / 2, 0, o.gw, o.h);
    for (let j = 0; j <= o.rows; j++) x.fillRect(0, j * th - o.gw / 2, o.w, o.gw);
    return { canvas: c, size: o.size };
  }

  function paintTex() {
    const c = cnv(256, 256), x = c.getContext('2d');
    x.fillStyle = '#f3f3f3'; x.fillRect(0, 0, 256, 256);
    grain(x, 256, 256, 14, 7);
    return { canvas: c, size: [1, 1] };
  }

  // Обои: canvas 512×512 = ширина рулона 0,53 м.
  function wallpaper(kind) {
    const c = cnv(512, 512), x = c.getContext('2d');
    if (kind === 0) {
      x.fillStyle = '#ece3d3'; x.fillRect(0, 0, 512, 512);
      for (let s = 0; s < 512; s += 128) {
        x.fillStyle = '#e1d4bd'; x.fillRect(s, 0, 52, 512);
        x.fillStyle = '#c7b08a'; x.fillRect(s + 62, 0, 3, 512);
        x.fillStyle = '#d5c3a2'; x.fillRect(s + 70, 0, 1.5, 512);
      }
    } else if (kind === 1) {
      x.fillStyle = '#dde3dc'; x.fillRect(0, 0, 512, 512);
      x.strokeStyle = '#b3beb0'; x.lineWidth = 3;
      for (let i = -4; i <= 8; i++) {
        x.beginPath(); x.moveTo(i * 128, 0); x.lineTo(i * 128 + 512, 512); x.stroke();
        x.beginPath(); x.moveTo(i * 128, 0); x.lineTo(i * 128 - 512, 512); x.stroke();
      }
      x.fillStyle = '#c9a77a';
      for (let m = 0; m <= 4; m++) for (let n = 0; n <= 4; n++) {
        x.beginPath(); x.arc(m * 128 + 64, n * 128, 5, 0, 6.29); x.fill();
        x.beginPath(); x.arc(m * 128, n * 128 + 64, 5, 0, 6.29); x.fill();
      }
    } else {
      x.fillStyle = '#f1ebdf'; x.fillRect(0, 0, 512, 512);
      const sprig = (cx, cy, seed) => {
        const r = rng(seed), rot = (r() - 0.5) * 1.2, len = 70 + r() * 20;
        x.save(); x.translate(cx, cy); x.rotate(rot);
        x.strokeStyle = '#8a9877'; x.lineWidth = 2;
        x.beginPath(); x.moveTo(0, len / 2); x.quadraticCurveTo(8, 0, 0, -len / 2); x.stroke();
        for (let i = 0; i < 5; i++) {
          const t = -len / 2 + 10 + i * (len - 18) / 4, side = i % 2 ? 1 : -1;
          x.save(); x.translate(2, t); x.rotate(side * 0.9);
          x.fillStyle = i % 3 === 0 ? '#b7c3a1' : '#9eae88';
          x.beginPath(); x.ellipse(side * 11, 0, 12, 5, 0, 0, 6.29); x.fill();
          x.restore();
        }
        x.fillStyle = '#cfae84';
        x.beginPath(); x.arc(1, -len / 2 - 4, 4, 0, 6.29); x.fill();
        x.restore();
      };
      for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) {
        const cx = col * 128 + (row % 2 ? 64 : 0) + 32, cy = row * 128 + 64, seed = 50 + row * 4 + col;
        for (let dx = -512; dx <= 512; dx += 512) for (let dy = -512; dy <= 512; dy += 512) sprig(cx + dx, cy + dy, seed);
      }
    }
    grain(x, 512, 512, 6, 11 + kind);
    return { canvas: c, size: [0.53, 0.53] };
  }

  const TX = {
    lam_light: planks({ w: 1024, h: 512, rows: 6, len: 512, size: [2.4, 1.2], seed: 3, lines: 34, knots: 0.25,
      colors: ['#d8bf98', '#cfb48a', '#e0c9a6', '#d3b88f'], seam: 'rgba(90,62,30,.45)' }),
    lam_dark: planks({ w: 1024, h: 512, rows: 6, len: 512, size: [2.4, 1.2], seed: 5, lines: 34, knots: 0.3,
      colors: ['#6e4b33', '#5f3f2a', '#78523a', '#674630'], seam: 'rgba(25,14,6,.6)' }),
    spc: planks({ w: 1024, h: 512, rows: 6, len: 512, size: [2.44, 1.08], seed: 9, lines: 26, knots: 0.1,
      colors: ['#b9ab98', '#a99b88', '#c2b5a3', '#b0a290'], seam: 'rgba(60,50,40,.5)' }),
    tile: tiles({ w: 512, h: 512, cols: 2, rows: 2, size: [1.2, 1.2], seed: 4, color: '#d9d5cd', vary: 0.05,
      gloss: 0.04, speck: 900, veins: true, grout: '#a9a49b', gw: 3 }),
    wallTile: tiles({ w: 512, h: 512, cols: 2, rows: 4, size: [1.2, 1.2], seed: 8, color: '#eef1f0', vary: 0.03,
      gloss: 0.06, speck: 120, veins: false, grout: '#c3c7c6', gw: 3 }),
    paint: paintTex(),
    wp: [wallpaper(0), wallpaper(1), wallpaper(2)]
  };

  // Образец: квадрат примерно 0,6 м реального размера.
  function preview(t, meters) {
    const p = cnv(96, 96), x = p.getContext('2d');
    const sw = Math.min(t.canvas.width, t.canvas.width * meters / t.size[0]);
    const sh = Math.min(t.canvas.height, t.canvas.height * meters / t.size[1]);
    x.drawImage(t.canvas, 0, 0, sw, sh, 0, 0, 96, 96);
    return p;
  }

  /* ---------- UI ---------- */
  let view = null; // 3D-часть, появляется после загрузки three.js

  // Шаблоны
  const tplGrid = $('#tplGrid');
  tplGrid.innerHTML = Object.keys(TEMPLATES).map(k => {
    const t = TEMPLATES[k];
    return '<label class="choice"><input type="radio" name="tpl" value="' + k + '">' +
      '<span class="choice-body"><b>' + esc(t.name) + '</b><small>' + nf2.format(t.L) + ' × ' + nf2.format(t.W) + ' м</small></span></label>';
  }).join('');
  tplGrid.addEventListener('change', e => {
    if (e.target.name !== 'tpl') return;
    applyTemplate(e.target.value);
    syncUI();
    changed(true);
  });

  // Размеры
  const dimHint = $('#dimHint');
  function baseDimHint() {
    dimHint.textContent = 'Длина ' + nf2.format(DIMS.L.min) + '–' + nf2.format(DIMS.L.max) + ' м, ширина ' +
      nf2.format(DIMS.W.min) + '–' + nf2.format(DIMS.W.max) + ' м, высота ' + nf2.format(DIMS.H.min) + '–' + nf2.format(DIMS.H.max) + ' м.';
    dimHint.classList.remove('warn');
  }
  Object.keys(DIMS).forEach(k => {
    const d = DIMS[k], rg = $('#rng' + k), inp = $('#inp' + k);
    rg.min = d.min; rg.max = d.max; rg.step = d.step;
    rg.addEventListener('input', () => {
      S[k] = parseFloat(rg.value);
      inp.value = nf2.format(S[k]);
      baseDimHint();
      changed();
    });
    inp.addEventListener('input', () => {
      const v = parseFloat(inp.value.replace(',', '.').replace(/\s/g, ''));
      if (!isFinite(v) || v <= 0) { dimHint.textContent = 'Введите число больше нуля'; dimHint.classList.add('warn'); return; }
      const c = clamp(v, d.min, d.max);
      S[k] = c; rg.value = c;
      if (c !== v) {
        dimHint.textContent = d.name + ': допустимо от ' + nf2.format(d.min) + ' до ' + nf2.format(d.max) + ' м — считаем по ' + nf2.format(c) + ' м';
        dimHint.classList.add('warn');
      } else baseDimHint();
      changed();
    });
    inp.addEventListener('change', () => { inp.value = nf2.format(S[k]); baseDimHint(); });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
  });

  // Окно и дверь
  function segHTML(keys, labels) {
    return keys.map(k => '<button type="button" data-v="' + k + '" aria-pressed="false">' + esc(labels[k]) + '</button>').join('');
  }
  const winWall = $('#winWall'), doorWall = $('#doorWall'), winPos = $('#winPos'), doorPos = $('#doorPos');
  winWall.innerHTML = segHTML(['back', 'left', 'right', 'front', 'none'], Object.assign({ none: 'Без окна' }, WALL_NAMES));
  doorWall.innerHTML = segHTML(['back', 'left', 'right', 'front'], WALL_NAMES);
  winWall.addEventListener('click', e => {
    const b = e.target.closest('button[data-v]'); if (!b) return;
    S.win.wall = b.dataset.v; syncUI(); changed();
  });
  doorWall.addEventListener('click', e => {
    const b = e.target.closest('button[data-v]'); if (!b) return;
    S.door.wall = b.dataset.v; syncUI(); changed();
  });
  winPos.addEventListener('input', () => { S.win.pos = parseFloat(winPos.value); changed(); });
  doorPos.addEventListener('input', () => { S.door.pos = parseFloat(doorPos.value); changed(); });

  // Отделка
  function swBtn(group, val, img, name, price) {
    return '<button type="button" class="sw" data-g="' + group + '" data-v="' + val + '" aria-pressed="false">' +
      '<span class="sw-img"' + (img ? ' data-img="' + img + '"' : '') + '></span>' +
      '<span class="sw-name">' + esc(name) + '</span>' + (price ? '<span class="sw-price">' + price + '</span>' : '') + '</button>';
  }
  const perM2 = it => nf0.format(unitPrice(it)) + ' ₽/м²';
  const floorSw = $('#floorSw'), wallType = $('#wallType'), wallSw = $('#wallSw'), ceilSw = $('#ceilSw');
  floorSw.innerHTML = Object.keys(F.floor).map(k => swBtn('floor', k, k, F.floor[k].name, perM2(F.floor[k]))).join('');
  ceilSw.innerHTML = Object.keys(F.ceiling).map(k => swBtn('ceiling', k, 'ceil_' + k, F.ceiling[k].name, perM2(F.ceiling[k]))).join('');
  wallType.innerHTML = Object.keys(F.walls).map(k =>
    '<button type="button" data-v="' + k + '" aria-pressed="false">' + esc(F.walls[k].name) + ' · ' + perM2(F.walls[k]) + '</button>').join('');

  function fillImages(root) {
    $$('[data-img]', root).forEach(el => {
      const k = el.dataset.img;
      let p = null;
      if (TX[k]) p = preview(TX[k], 0.6);
      else if (k.indexOf('wp') === 0) p = preview(TX.wp[+k.slice(2)], 0.53);
      else if (k === 'ceil_paint') { el.style.background = '#f4f3ef'; return; }
      else if (k === 'ceil_stretch') { el.style.background = 'linear-gradient(135deg,#fff 0%,#e9eef2 45%,#fff 55%,#dfe4e8 100%)'; return; }
      else if (k.indexOf('c') === 0) { el.style.background = WALL_COLORS[+k.slice(1)].hex; return; }
      if (p) el.appendChild(p);
    });
  }
  function renderWallSw() {
    wallSw.classList.toggle('colors', S.walls === 'paint');
    if (S.walls === 'paint') wallSw.innerHTML = WALL_COLORS.map((c, i) => swBtn('wallColor', i, 'c' + i, c.name)).join('');
    else if (S.walls === 'wallpaper') wallSw.innerHTML = WALLPAPERS.map((w, i) => swBtn('wallpaper', i, 'wp' + i, w.name)).join('');
    else wallSw.innerHTML = swBtn('wallTile', 0, 'wallTile', 'Белая 30×60', 'для ванной');
    fillImages(wallSw);
    wallSw.dataset.type = S.walls;
  }
  fillImages(floorSw);
  fillImages(ceilSw);

  function onSwatch(e) {
    const b = e.target.closest('.sw'); if (!b) return;
    const g = b.dataset.g, v = b.dataset.v;
    if (g === 'floor') S.floor = v;
    else if (g === 'ceiling') S.ceiling = v;
    else if (g === 'wallColor') S.wallColor = +v;
    else if (g === 'wallpaper') S.wallpaper = +v;
    else return;
    syncUI(); changed();
  }
  floorSw.addEventListener('click', onSwatch);
  wallSw.addEventListener('click', onSwatch);
  ceilSw.addEventListener('click', onSwatch);
  wallType.addEventListener('click', e => {
    const b = e.target.closest('button[data-v]'); if (!b) return;
    S.walls = b.dataset.v; syncUI(); changed();
  });

  function press(root, attrVal) {
    $$('[data-v]', root).forEach(b => b.setAttribute('aria-pressed', b.dataset.v === String(attrVal) ? 'true' : 'false'));
  }
  function syncUI() {
    const r = tplGrid.querySelector('input[value="' + S.tpl + '"]'); if (r) r.checked = true;
    Object.keys(DIMS).forEach(k => { $('#rng' + k).value = S[k]; $('#inp' + k).value = nf2.format(S[k]); });
    press(winWall, S.win.wall); press(doorWall, S.door.wall);
    winPos.value = S.win.pos; doorPos.value = S.door.pos;
    winPos.disabled = S.win.wall === 'none';
    press(floorSw, S.floor); press(ceilSw, S.ceiling); press(wallType, S.walls);
    if (wallSw.dataset.type !== S.walls) renderWallSw();
    press(wallSw, S.walls === 'paint' ? S.wallColor : S.walls === 'wallpaper' ? S.wallpaper : 0);
  }

  // Смета
  function renderEstimate() {
    const e = estimate(), a = e.a;
    $('#estPrice').textContent = range(e.lo, e.hi);
    $('#estAreas').innerHTML = 'Пол <b>' + nf1.format(a.floor) + ' м²</b> · стены <b>' + nf1.format(a.walls) +
      ' м²</b> · потолок <b>' + nf1.format(a.ceil) + ' м²</b>';
    $('#estBody').innerHTML = e.rows.map(r =>
      '<tr><td>' + esc(r.title) + ': ' + esc(r.what) + '<small>' + nf1.format(r.qty) + ' ' + r.unit + ' × ' + money(r.price) + '</small></td>' +
      '<td>' + money(r100(r.sum)) + '</td></tr>').join('') +
      '<tr><td>Работы / материалы</td><td>' + money(r100(e.work)) + '<br>' + money(r100(e.mat)) + '</td></tr>' +
      '<tr class="total"><td>Итого (вилка ±' + Math.round(PRICES.spread * 100) + '%)</td><td>' + range(e.lo, e.hi) + '</td></tr>';
    $('#stageTotal').innerHTML = 'Смета ≈ <b>' + money(r100(e.base)) + '</b>';
    $('#stageDims').textContent = nf2.format(S.L) + ' × ' + nf2.format(S.W) + ' × ' + nf2.format(S.H) + ' м';
    const oh = $('#openHint');
    if (overlap(a.win, a.door)) {
      oh.textContent = 'Окно и дверь пересекаются — сдвиньте ползунок или выберите другую стену.';
      oh.classList.add('warn');
    } else {
      oh.textContent = 'Ползунок: от левого (ближнего) угла стены к правому (дальнему). Окно ' +
        (a.win ? nf2.format(a.win.w) + ' × ' + nf2.format(a.win.h) + ' м' : 'не выбрано') + ', дверь ' + nf2.format(a.door.w) + ' × ' + nf2.format(a.door.h) + ' м.';
      oh.classList.remove('warn');
    }
  }

  function changed(resetCam) {
    renderEstimate();
    if (view) view.update(!!resetCam);
  }

  /* ---------- mobile menu ---------- */
  const burger = $('#burger'), menu = $('#menu');
  function closeMenu() { menu.classList.remove('open'); burger.setAttribute('aria-expanded', 'false'); }
  burger.addEventListener('click', () => {
    const open = menu.classList.toggle('open');
    burger.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  document.addEventListener('click', e => {
    if (menu.classList.contains('open') && !e.target.closest('#menu') && !e.target.closest('#burger')) closeMenu();
  });

  /* ---------- «Хочу так» ---------- */
  const modal = $('#modal'), form = $('#wantForm'), submitBtn = $('#submitBtn');
  const fName = $('#fName'), fPhone = $('#fPhone');
  let lastFocus = null, sendTimer = null;

  function setErr(input, msg) {
    const f = input.closest('.field');
    f.classList.toggle('err', !!msg);
    f.querySelector('.err-msg').textContent = msg || '';
  }
  function openWant() {
    lastFocus = document.activeElement;
    if (document.pointerLockElement) document.exitPointerLock();
    const img = view ? view.snapshot() : '';
    const snap = $('#snapImg'), house = appMode === 'house';
    snap.hidden = !img;
    if (img) snap.src = img;
    snap.alt = house ? 'Снимок дома из 3D' : 'Снимок комнаты из 3D';
    $('#modalTitle').textContent = house ? 'Хочу такой дом' : 'Хочу такой ремонт';
    const e = house ? hEstimate() : estimate();
    $('#wantSum').innerHTML = '<ul>' + (house ? hSummary() : summaryLines()).map(l => '<li>' + esc(l) + '</li>').join('') + '</ul>' +
      (house ? 'Смета на дом (пример): <b>' : 'Смета на отделку: <b>') + range(e.lo, e.hi) + '</b>';
    $('#formView').hidden = false;
    $('#okView').hidden = true;
    submitBtn.disabled = false;
    submitBtn.textContent = 'Отправить заявку';
    [fName, fPhone].forEach(i => setErr(i, ''));
    modal.hidden = false;
    document.body.classList.add('no-scroll');
    closeMenu();
    setTimeout(() => fName.focus(), 60);
  }
  function closeModal() {
    if (modal.hidden) return;
    clearTimeout(sendTimer);
    modal.hidden = true;
    if (!(view && view.isFP())) document.body.classList.remove('no-scroll');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  $$('[data-want]').forEach(b => b.addEventListener('click', openWant));
  modal.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeModal(); });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!modal.hidden) closeModal();
    else if (view && view.isFP() && !document.pointerLockElement) view.exitFP();
    closeMenu();
  });

  function phoneDigits(v) { return v.replace(/\D/g, ''); }
  function fmtPhone(v) {
    let d = phoneDigits(v);
    if (!d) return '';
    if (d[0] === '8') d = '7' + d.slice(1);
    if (d[0] !== '7') d = '7' + d;
    d = d.slice(0, 11);
    let s = '+7';
    if (d.length > 1) s += ' (' + d.slice(1, 4);
    if (d.length >= 4) s += ')';
    if (d.length > 4) s += ' ' + d.slice(4, 7);
    if (d.length > 7) s += '-' + d.slice(7, 9);
    if (d.length > 9) s += '-' + d.slice(9, 11);
    return s;
  }
  fPhone.addEventListener('input', e => {
    if (e.inputType && e.inputType.indexOf('delete') === 0) return;
    fPhone.value = fmtPhone(fPhone.value);
  });
  fPhone.addEventListener('focus', () => { if (!fPhone.value) fPhone.value = '+7 '; });
  fPhone.addEventListener('blur', () => { fPhone.value = phoneDigits(fPhone.value).length > 1 ? fmtPhone(fPhone.value) : ''; });
  [fName, fPhone].forEach(i => i.addEventListener('input', () => setErr(i, '')));

  form.addEventListener('submit', e => {
    e.preventDefault();
    const name = fName.value.trim(), phone = fmtPhone(fPhone.value), digits = phoneDigits(phone);
    const bad = [];
    if (name.length < 2) { setErr(fName, 'Укажите имя'); bad.push(fName); }
    if (digits.length !== 11) { setErr(fPhone, 'Введите номер полностью: +7 (XXX) XXX-XX-XX'); bad.push(fPhone); }
    else fPhone.value = phone;
    if (bad.length) { bad[0].focus(); return; }
    const house = appMode === 'house';
    const est = house ? hEstimate() : estimate();
    const lines = (house ? hSummary() : summaryLines()).slice(1, 4);
    submitBtn.disabled = true;
    submitBtn.textContent = 'Отправляем…';
    // Demo: a real site would POST snapshot (dataURL) + materials + estimate to its backend -> Telegram bot.
    sendTimer = setTimeout(() => {
      $('#okText').textContent = name + ', спасибо! Снимок ' + (house ? 'дома' : 'комнаты') + ', материалы (' + lines.join('; ').toLowerCase() +
        ') и смета ' + range(est.lo, est.hi) + ' отправлены менеджеру. Мы перезвоним на ' + phone + '.';
      $('#formView').hidden = true;
      $('#okView').hidden = false;
      form.reset();
      $('#okView .btn-acc').focus();
    }, 900);
  });

  /* =====================================================================
     ДОМ СНАРУЖИ: расчёт и панель (работают и без three.js)
     Оси: x — вдоль длины L (конёк), z — вдоль ширины W, y — вверх.
     Фасад «Перед» смотрит в +z. Смета и 3D берут геометрию из hGeo() и
     layout(), поэтому площадь в смете — это площадь построенной модели.
     ===================================================================== */
  const X = PRICES.exterior;
  const KNEE = 1.2;        // высота стены мансарды (колено), м
  const EAVE_DROP = 0.3;   // карниз не ниже верха этажа больше чем на столько, м
  const SLOPE_T = 0.14, FLAT_T = 0.3, ROOF_LIFT = 0.03;
  const WIN_W = 1.2, WIN_H = 1.3, SILL = 0.85, MAN_H = 1.2, MAN_SILL = 0.7, DOOR_W = 1.0, DOOR_H = 2.1, CELL = 1.7;
  const FACADES = ['front', 'back', 'left', 'right'];
  const FAC_NAMES = { front: 'Перед', back: 'Зад', left: 'Слева', right: 'Справа' };
  const STOREYS = { '1': '1 этаж', '1.5': '1,5 — мансарда', '2': '2 этажа' };
  const ROOF_TYPES = {
    gable: { name: 'Двускатная', hint: 'Два ската и конёк вдоль длины дома, по торцам — фронтоны.' },
    hip:   { name: 'Вальмовая', hint: 'Два ската-трапеции и два треугольных ската-вальмы с одним уклоном.' },
    tent:  { name: 'Четырёхскатная', hint: 'Шатёр: четыре треугольных ската сходятся в одну точку. Угол задан для скатов над фасадами «Перед» и «Зад», торцевые скаты на вытянутом доме положе.' },
    flat:  { name: 'Плоская', hint: 'На плоской крыше считаем мягкую кровлю, мансарды нет. Угол не задаётся.' }
  };
  const ROOF_VIS = {
    tile_red:      { tx: 'tile', color: '#c2503f', metal: 0.3, rough: 0.42 },
    tile_graphite: { tx: 'tile', color: '#565b62', metal: 0.3, rough: 0.42 },
    tile_brown:    { tx: 'tile', color: '#7a5543', metal: 0.3, rough: 0.42 },
    prof:          { tx: 'prof', color: '#66866f', metal: 0.3, rough: 0.5 },
    soft:          { tx: 'soft', color: '#ffffff', cap: '#5f4f43', metal: 0, rough: 0.95 },
    seam:          { tx: 'seam', color: '#8a9096', metal: 0.5, rough: 0.42 }
  };
  const PLINTH_TX = { plaster: 'plaster_grey', stone: 'p_stone', clinker: 'p_clinker' };
  const GUT_COLORS = {
    white:    { name: 'Белые', hex: '#eeeeea' },
    brown:    { name: 'Коричневые', hex: '#5b4032' },
    graphite: { name: 'Графитовые', hex: '#3f4449' }
  };
  const HS = {
    L: 10, W: 8, floorH: 2.8, storeys: '1.5',
    roof: 'gable', angle: 35, ovE: 0.5, ovG: 0.35,
    win: { front: 3, back: 3, left: 2, right: 2 },
    door: { front: 1, back: 0, left: 0, right: 0 },
    porch: 'canopy',
    roofMat: 'tile_red', facade: 'siding_light',
    gutterOn: true, gutterColor: 'white',
    plinth: 'plaster', plinthH: 0.5, demo: false
  };
  let appMode = 'room';

  const v3 = (x, y, z) => ({ x: x, y: y, z: z });
  const vSub = (a, b) => v3(a.x - b.x, a.y - b.y, a.z - b.z);
  const vAdd = (a, b, k) => v3(a.x + b.x * k, a.y + b.y * k, a.z + b.z * k);
  const vDot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
  const vCross = (a, b) => v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
  const vLen = a => Math.hypot(a.x, a.y, a.z);
  const vNorm = a => { const l = vLen(a) || 1; return v3(a.x / l, a.y / l, a.z / l); };
  const V_UP = v3(0, 1, 0);

  const roofKey = () => (HS.roof === 'flat' ? 'soft' : HS.roofMat);
  const gableFace = k => HS.roof === 'gable' && (k === 'left' || k === 'right');
  const facLen = k => (k === 'front' || k === 'back' ? HS.L : HS.W);
  const rowCap = len => Math.max(1, Math.floor((len - 0.4) / CELL));
  function polyArea(p) {
    let s = 0;
    for (let i = 1; i < p.length - 1; i++) s += vLen(vCross(vSub(p[i], p[0]), vSub(p[i + 1], p[0]))) / 2;
    return s;
  }

  // Геометрия дома: стены и скаты. Плоскость ската проходит через верх наружной грани стены.
  function hGeo() {
    const L = HS.L, W = HS.W, PL = HS.plinthH, fh = HS.floorH, flat = HS.roof === 'flat';
    const tanA = flat ? 0 : Math.tan(HS.angle * Math.PI / 180);
    const yE = PL + (HS.storeys === '2' ? 2 * fh : HS.storeys === '1.5' ? fh + KNEE : fh);
    let ovX = HS.ovE, ovZ = HS.ovE;
    if (HS.roof === 'gable') ovX = HS.ovG;
    if (HS.roof === 'tent') ovZ = HS.ovE * W / L; // контур шатра подобен плану, иначе карниз не будет горизонтальным
    // Если свес при большом угле опустился бы слишком низко, стена становится выше на разницу.
    const wallTop = flat ? yE : yE + Math.max(0, ovZ * tanA - EAVE_DROP);
    const thick = flat ? FLAT_T : SLOPE_T;
    const eaveTop = flat ? wallTop + FLAT_T : wallTop - ovZ * tanA + ROOF_LIFT;
    const topY = flat ? eaveTop : wallTop + (W / 2) * tanA + ROOF_LIFT;
    const x = L / 2 + ovX, z = W / 2 + ovZ;
    const fl = v3(-x, eaveTop, z), fr = v3(x, eaveTop, z), br = v3(x, eaveTop, -z), bl = v3(-x, eaveTop, -z);
    let faces, rim, ridges, eaves;
    if (HS.roof === 'gable') {
      const a = v3(-x, topY, 0), b = v3(x, topY, 0);
      faces = [[fl, fr, b, a], [br, bl, a, b]];
      rim = [fl, fr, b, br, bl, a];
      ridges = [[a, b]];
      eaves = [[fl, fr], [br, bl]];
    } else {
      eaves = [[fl, fr], [fr, br], [br, bl], [bl, fl]];
      rim = [fl, fr, br, bl];
      if (HS.roof === 'hip') {
        const rx = L / 2 - W / 2, a = v3(-rx, topY, 0), b = v3(rx, topY, 0);
        faces = [[fl, fr, b, a], [br, bl, a, b], [fr, br, b], [bl, fl, a]];
        ridges = [[fl, a], [bl, a], [fr, b], [br, b]];
        if (rx > 0.01) ridges.push([a, b]);
      } else if (HS.roof === 'tent') {
        const a = v3(0, topY, 0);
        faces = [[fl, fr, a], [fr, br, a], [br, bl, a], [bl, fl, a]];
        ridges = [[fl, a], [fr, a], [br, a], [bl, a]];
      } else {
        faces = [[fl, fr, br, bl]];
        ridges = [];
      }
    }
    return {
      tanA: tanA, ovX: ovX, ovZ: ovZ, wallTop: wallTop, thick: thick, eaveTop: eaveTop, eaveBottom: eaveTop - thick, topY: topY,
      triH: HS.roof === 'gable' ? (W / 2) * tanA : 0, faces: faces, rim: rim, ridges: ridges, eaves: eaves,
      roofArea: faces.reduce((s, f) => s + polyArea(f), 0)
    };
  }

  // Окна и двери фасада. Нижний ряд — двери и окна, верхний — окна 2 этажа или мансарды во фронтоне.
  function layout(k, g) {
    const len = facLen(k), PL = HS.plinthH, fh = HS.floorH, c0 = rowCap(len), d = Math.min(HS.door[k], c0);
    let upCap = 0, usable = len, upV0 = 0, upH = WIN_H;
    if (HS.storeys === '2') {
      upCap = c0; upV0 = PL + fh + SILL;
    } else if (HS.storeys === '1.5' && gableFace(k) && g.tanA > 0) {
      upV0 = PL + fh + MAN_SILL; upH = MAN_H;
      const over = Math.max(0, upV0 + upH + 0.15 - g.wallTop); // сколько окно заходит в треугольник фронтона
      usable = len - 2 * over / g.tanA - 0.4;
      upCap = usable >= WIN_W ? Math.floor((usable + 0.5) / CELL) : 0;
    }
    const cap = c0 - d + upCap, n = Math.min(HS.win[k], cap);
    let r0 = Math.min(c0 - d, Math.ceil(n / 2));
    const r1 = Math.min(upCap, n - r0);
    r0 = Math.min(c0 - d, n - r1);
    const ops = [], m = r0 + d;
    const p1 = d === 2 ? Math.floor((m - 1) / 3) : Math.floor(m / 2), p2 = d === 2 ? m - 1 - p1 : -1;
    for (let i = 0; i < m; i++) {
      const uc = len * (i + 0.5) / m, isDoor = d > 0 && (i === p1 || i === p2);
      const w = isDoor ? DOOR_W : WIN_W, h = isDoor ? DOOR_H : WIN_H, v0 = PL + (isDoor ? 0 : SILL);
      ops.push({ type: isDoor ? 'door' : 'win', u0: uc - w / 2, u1: uc + w / 2, v0: v0, v1: v0 + h, w: w, h: h });
    }
    for (let i = 0; i < r1; i++) {
      const uc = (len - usable) / 2 + usable * (i + 0.5) / r1;
      ops.push({ type: 'win', u0: uc - WIN_W / 2, u1: uc + WIN_W / 2, v0: upV0, v1: upV0 + upH, w: WIN_W, h: upH });
    }
    return { ops: ops, cap: cap, n: n, doors: d, c0: c0 };
  }

  // Водосточные трубы: по одной у каждого угла на длинных стенах.
  function pipeRuns(g) {
    const px = HS.L / 2 - 0.14, zWall = HS.W / 2 + 0.06, zOut = HS.W / 2 + g.ovZ + 0.04, yG = g.eaveBottom - 0.02;
    const yBend = yG - 0.35;
    return { px: px, zWall: zWall, zOut: zOut, yG: yG, yBend: yBend,
      len: 4 * (Math.hypot(Math.max(zOut - zWall, 0), 0.35) + Math.max(yBend - 0.12, 0)) };
  }

  function hAreas() {
    const g = hGeo(), L = HS.L, W = HS.W, PL = HS.plinthH, per = 2 * (L + W);
    let open = 0, windows = 0, doors = 0;
    FACADES.forEach(k => layout(k, g).ops.forEach(o => {
      open += o.w * o.h;
      if (o.type === 'win') windows++; else doors++;
    }));
    const gross = per * (g.wallTop - PL) + (HS.roof === 'gable' ? 2 * (W * g.triH / 2) : 0);
    const gutter = g.eaves.reduce((s, e) => s + vLen(vSub(e[1], e[0])), 0) + pipeRuns(g).len;
    return { g: g, roof: g.roofArea, gross: gross, open: open, facade: Math.max(0, gross - open), plinth: per * PL,
      gutter: gutter, windows: windows, doors: doors };
  }

  function hEstimate() {
    const a = hAreas(), sp = PRICES.spread, rows = [], rk = roofKey();
    function add(title, what, item, qty, unit) {
      rows.push({ title: title, what: what, qty: qty, unit: unit, price: unitPrice(item),
        work: item.work * qty, mat: item.mat * qty, sum: unitPrice(item) * qty });
    }
    add('Кровля', X.roof[rk].name.toLowerCase(), X.roof[rk], a.roof, 'м²');
    if (HS.demo) add('Демонтаж', 'старая кровля', X.demoRoof, a.roof, X.demoRoof.unit);
    add('Фасад', X.facade[HS.facade].name.toLowerCase(), X.facade[HS.facade], a.facade, 'м²');
    add('Цоколь', X.plinth[HS.plinth].name.toLowerCase(), X.plinth[HS.plinth], a.plinth, 'м²');
    if (HS.gutterOn) add('Водостоки', 'желоба и трубы, ' + GUT_COLORS[HS.gutterColor].name.toLowerCase(), X.gutter, a.gutter, X.gutter.unit);
    if (HS.porch !== 'none' && a.doors > 0) add('Крыльцо', X.porch[HS.porch].name.toLowerCase(), X.porch[HS.porch], a.doors, X.porch[HS.porch].unit);
    let base = 0, work = 0, mat = 0;
    rows.forEach(r => { base += r.sum; work += r.work; mat += r.mat; });
    return { rows: rows, a: a, base: base, work: work, mat: mat, lo: r100(base * (1 - sp)), hi: r100(base * (1 + sp)) };
  }

  function hSummary() {
    const a = hAreas(), flat = HS.roof === 'flat';
    return [
      'Дом ' + nf2.format(HS.L) + ' × ' + nf2.format(HS.W) + ' м, ' + STOREYS[HS.storeys].toLowerCase() + ', высота этажа ' + nf2.format(HS.floorH) + ' м',
      'Крыша: ' + ROOF_TYPES[HS.roof].name.toLowerCase() + (flat ? '' : ', ' + HS.angle + '°') + ', свес ' + nf2.format(HS.ovE) + ' м',
      'Кровля: ' + X.roof[roofKey()].name.toLowerCase() + ', ' + nf1.format(a.roof) + ' м²',
      'Фасад: ' + X.facade[HS.facade].name.toLowerCase() + ', ' + nf1.format(a.facade) + ' м²',
      'Окна: ' + a.windows + ', двери: ' + a.doors + ', крыльцо: ' + (HS.porch === 'none' ? 'нет' : X.porch[HS.porch].name.toLowerCase()),
      'Цоколь: ' + X.plinth[HS.plinth].name.toLowerCase() + ', ' + nf2.format(HS.plinthH) + ' м',
      'Водостоки: ' + (HS.gutterOn ? GUT_COLORS[HS.gutterColor].name.toLowerCase() : 'нет'),
      'Демонтаж старой кровли: ' + (HS.demo ? 'да' : 'нет')
    ];
  }

  function renderHouseEstimate() {
    const e = hEstimate(), a = e.a;
    $('#estPrice').textContent = range(e.lo, e.hi);
    $('#estAreas').innerHTML = 'Кровля <b>' + nf1.format(a.roof) + ' м²</b> · фасад <b>' + nf1.format(a.facade) +
      ' м²</b> · цоколь <b>' + nf1.format(a.plinth) + ' м²</b>';
    $('#estBody').innerHTML = e.rows.map(r =>
      '<tr><td>' + esc(r.title) + ': ' + esc(r.what) + '<small>' + (r.unit === 'шт.' ? nf0 : nf1).format(r.qty) + ' ' + r.unit + ' × ' + money(r.price) + '</small></td>' +
      '<td>' + money(r100(r.sum)) + '</td></tr>').join('') +
      '<tr><td>Работы / материалы</td><td>' + money(r100(e.work)) + '<br>' + money(r100(e.mat)) + '</td></tr>' +
      '<tr class="total"><td>Итого (вилка ±' + Math.round(PRICES.spread * 100) + '%)</td><td>' + range(e.lo, e.hi) + '</td></tr>';
    $('#stageTotal').innerHTML = 'Смета ≈ <b>' + money(r100(e.base)) + '</b>';
    $('#stageDims').textContent = nf2.format(HS.L) + ' × ' + nf2.format(HS.W) + ' м · высота ' + nf1.format(a.g.topY) + ' м';
  }

  /* процедурные текстуры дома: создаются при первом открытии режима */
  function reliefTex(w, h, size, f, amp, base, gain) {
    const hm = new Float32Array(w * h);
    let mn = Infinity, mx = -Infinity;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const val = f((x + 0.5) / w, 1 - (y + 0.5) / h);
      hm[y * w + x] = val;
      if (val < mn) mn = val;
      if (val > mx) mx = val;
    }
    const color = cnv(w, h), normal = cnv(w, h), cc = color.getContext('2d'), nc = normal.getContext('2d');
    const ic = cc.createImageData(w, h), inn = nc.createImageData(w, h);
    const sx = amp / (2 * size[0] / w), sy = amp / (2 * size[1] / h), span = (mx - mn) || 1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const hl = hm[y * w + (x - 1 + w) % w], hr = hm[y * w + (x + 1) % w];
      const hu = hm[((y - 1 + h) % h) * w + x], hd = hm[((y + 1) % h) * w + x];
      const nx = -clamp((hr - hl) * sx, -3, 3), ny = clamp((hd - hu) * sy, -3, 3);
      const il = 1 / Math.sqrt(nx * nx + ny * ny + 1), i = (y * w + x) * 4;
      inn.data[i] = (nx * il * 0.5 + 0.5) * 255;
      inn.data[i + 1] = (ny * il * 0.5 + 0.5) * 255;
      inn.data[i + 2] = (il * 0.5 + 0.5) * 255;
      inn.data[i + 3] = 255;
      const lum = 255 * (base + gain * (hm[y * w + x] - mn) / span);
      ic.data[i] = ic.data[i + 1] = ic.data[i + 2] = lum;
      ic.data[i + 3] = 255;
    }
    cc.putImageData(ic, 0, 0);
    nc.putImageData(inn, 0, 0);
    return { canvas: color, normal: normal, size: size };
  }
  function softColor() {
    const c = cnv(512, 512), x = c.getContext('2d'), rows = 6, rowH = 512 / rows, tw = 512 / 3;
    const pal = ['#6d5a4c', '#7a6554', '#5f4e42', '#84705e'];
    for (let row = 0; row < rows; row++) {
      const y0 = row * rowH, off = row % 2 ? tw / 2 : 0;
      for (let k = -1; k < 3; k++) {
        const r = rng(row * 31 + ((k % 3) + 3) % 3 + 7);
        x.fillStyle = shade(pal[Math.floor(r() * pal.length)], (r() - 0.5) * 0.12);
        x.fillRect(k * tw + off, y0, tw, rowH);
        x.fillStyle = 'rgba(25,18,12,.55)';
        x.fillRect(k * tw + off - 1.5, y0 + rowH * 0.35, 3, rowH * 0.65);
      }
      x.fillStyle = 'rgba(0,0,0,.28)';
      x.fillRect(0, y0, 512, 6);
    }
    grain(x, 512, 512, 26, 21);
    return c;
  }
  function sidingTex(hex, seed) {
    const c = cnv(256, 256), x = c.getContext('2d'), n = 5, bh = 256 / n;
    for (let i = 0; i < n; i++) {
      const y = i * bh, gr = x.createLinearGradient(0, y, 0, y + bh);
      gr.addColorStop(0, shade(hex, 0.07)); gr.addColorStop(1, shade(hex, -0.09));
      x.fillStyle = gr; x.fillRect(0, y, 256, bh);
      x.fillStyle = 'rgba(0,0,0,.3)'; x.fillRect(0, y + bh - 5, 256, 5);
      x.fillStyle = 'rgba(255,255,255,.16)'; x.fillRect(0, y, 256, 2);
    }
    grain(x, 256, 256, 4, seed);
    return { canvas: c, size: [1, 1] };
  }
  function brickTex(pal, mortar, seed) {
    const c = cnv(512, 512), x = c.getContext('2d'), rows = 12, rowH = 512 / rows, bw = 128;
    x.fillStyle = mortar; x.fillRect(0, 0, 512, 512);
    for (let row = 0; row < rows; row++) {
      const off = row % 2 ? bw / 2 : 0;
      for (let k = -1; k < 4; k++) {
        const r = rng(seed + row * 17 + ((k % 4) + 4) % 4);
        x.fillStyle = shade(pal[Math.floor(r() * pal.length)], (r() - 0.5) * 0.16);
        x.fillRect(k * bw + off + 2.5, row * rowH + 2.5, bw - 5, rowH - 5);
      }
    }
    grain(x, 512, 512, 12, seed);
    return { canvas: c, size: [1.04, 0.9] };
  }
  function stoneTex(pal, mortar, seed) {
    const c = cnv(512, 512), x = c.getContext('2d'), hs = [72, 96, 64, 88, 104, 88];
    const r = rng(seed);
    x.fillStyle = mortar; x.fillRect(0, 0, 512, 512);
    let y = 0;
    hs.forEach(h => {
      const off = r() * 512;
      let s = 0;
      while (s < 512) {
        let w = 90 + r() * 100;
        if (512 - s - w < 70) w = 512 - s;
        const col = shade(pal[Math.floor(r() * pal.length)], (r() - 0.5) * 0.2);
        for (let dx = -512; dx <= 0; dx += 512) {
          x.fillStyle = col;
          x.fillRect(s + off + dx + 3, y + 3, w - 6, h - 6);
        }
        s += w;
      }
      y += h;
    });
    grain(x, 512, 512, 16, seed + 1);
    return { canvas: c, size: [1.2, 1.2] };
  }
  function plasterTex(hex, seed) {
    const c = cnv(256, 256), x = c.getContext('2d');
    x.fillStyle = hex; x.fillRect(0, 0, 256, 256);
    grain(x, 256, 256, 10, seed);
    return { canvas: c, size: [0.8, 0.8] };
  }
  function lawnTex() {
    const c = cnv(512, 512), x = c.getContext('2d'), r = rng(77);
    x.fillStyle = '#6c9446'; x.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 26; i++) {
      const cx = r() * 512, cy = r() * 512, rad = 40 + r() * 90, dark = r() < 0.5;
      for (let dx = -512; dx <= 512; dx += 512) for (let dy = -512; dy <= 512; dy += 512) {
        const gr = x.createRadialGradient(cx + dx, cy + dy, 0, cx + dx, cy + dy, rad);
        gr.addColorStop(0, dark ? 'rgba(62,98,44,.28)' : 'rgba(136,170,84,.26)');
        gr.addColorStop(1, 'rgba(100,140,70,0)');
        x.fillStyle = gr;
        x.fillRect(cx + dx - rad, cy + dy - rad, rad * 2, rad * 2);
      }
    }
    for (let i = 0; i < 7000; i++) {
      x.fillStyle = r() < 0.5 ? 'rgba(42,72,28,.32)' : 'rgba(164,194,104,.28)';
      x.fillRect(r() * 512, r() * 512, 1, 2 + r() * 4);
    }
    return { canvas: c, size: [5, 5] };
  }
  function skyTex() {
    const c = cnv(512, 256), x = c.getContext('2d'), r = rng(12);
    const gr = x.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, '#5f9bd6'); gr.addColorStop(0.75, '#b4d3e8'); gr.addColorStop(1, '#dfeaf0');
    x.fillStyle = gr; x.fillRect(0, 0, 512, 128);
    x.fillStyle = '#dfeaf0'; x.fillRect(0, 128, 512, 128);
    for (let i = 0; i < 30; i++) {
      const cx = r() * 512, cy = 45 + r() * 68, rad = 14 + r() * 26;
      for (let dx = -512; dx <= 512; dx += 512) {
        x.save();
        x.translate(cx + dx, cy);
        x.scale(2.6, 0.7);
        const g = x.createRadialGradient(0, 0, 0, 0, 0, rad);
        g.addColorStop(0, 'rgba(255,255,255,.75)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = g;
        x.fillRect(-rad, -rad, rad * 2, rad * 2);
        x.restore();
      }
    }
    return { canvas: c, size: [1, 1] };
  }
  const HX_GEN = {
    tile: () => reliefTex(256, 256, [0.35, 0.35], (u, v) => {
      const wave = 0.5 + 0.5 * Math.cos(2 * Math.PI * (u - 0.5));
      return 0.6 * wave * (0.7 + 0.3 * Math.sin(Math.PI * v)) + 0.4 * Math.pow(1 - v, 0.8);
    }, 0.1, 0.7, 0.3),
    prof: () => reliefTex(128, 4, [0.25, 0.25], u => {
      if (u < 0.28) return 1;
      if (u < 0.4) return 1 - (u - 0.28) / 0.12;
      if (u < 0.88) return u > 0.62 && u < 0.66 ? 0.08 : 0;
      return (u - 0.88) / 0.12;
    }, 0.026, 0.76, 0.24),
    seam: () => reliefTex(256, 4, [0.45, 0.45], u => {
      const d = Math.abs(u - 0.5);
      return d < 0.03 ? 1 : d < 0.04 ? (0.04 - d) / 0.01 : 0;
    }, 0.035, 0.82, 0.18),
    soft: () => {
      const t = reliefTex(256, 256, [1, 1], (u, v) => 1 - (v * 6 - Math.floor(v * 6)), 0.01, 1, 0);
      t.canvas = softColor();
      return t;
    },
    siding_light: () => sidingTex('#e7e3d7', 31),
    siding_dark: () => sidingTex('#5d6367', 32),
    brick: () => brickTex(['#a65a41', '#b26a4c', '#94503a', '#bb7758'], '#cbc3b5', 41),
    stone: () => stoneTex(['#b9ae9d', '#a59a89', '#c7bdac', '#928878'], '#6d675d', 51),
    plaster_white: () => plasterTex('#f0eee8', 61),
    plaster_grey: () => plasterTex('#b4b4ae', 62),
    p_stone: () => stoneTex(['#7f7b73', '#6d6962', '#8d8980', '#5f5b55'], '#44413c', 52),
    p_clinker: () => brickTex(['#4f3a33', '#5c443a', '#44322c', '#67503f'], '#8f8a80', 42),
    lawn: lawnTex,
    sky: skyTex
  };
  const hxCache = {};
  function hx(k) {
    if (!hxCache[k]) hxCache[k] = HX_GEN[k]();
    return hxCache[k];
  }
  function swatchOf(t, meters, tint) {
    const p = cnv(96, 96), x = p.getContext('2d'), k = 96 / meters;
    const sx = k * t.size[0] / t.canvas.width, sy = k * t.size[1] / t.canvas.height;
    x.save();
    x.scale(sx, sy);
    x.fillStyle = x.createPattern(t.canvas, 'repeat');
    x.fillRect(0, 0, 96 / sx, 96 / sy);
    x.restore();
    if (tint) {
      x.globalCompositeOperation = 'multiply';
      x.fillStyle = tint;
      x.fillRect(0, 0, 96, 96);
    }
    return p;
  }

  /* панель: создаётся при первом открытии режима */
  const hSliders = [];
  let housePanelReady = false;
  function hSlider(host, o) {
    const id = 'hs_' + o.id;
    host.insertAdjacentHTML('beforeend',
      '<div class="dim hs"><div class="hs-top"><label for="' + id + '">' + esc(o.label) + '</label><output id="' + id + '_o"></output></div>' +
      '<div class="qty-row"><input type="range" id="' + id + '" min="' + o.min + '" max="' + o.max + '" step="' + o.step + '"></div></div>');
    const r = $('#' + id);
    r.addEventListener('input', () => { o.set(parseFloat(r.value)); houseChanged(); });
    hSliders.push({ o: o, r: r, out: $('#' + id + '_o') });
  }
  function hSeg(g, keys, labels) {
    return keys.map(k => '<button type="button" data-g="' + g + '" data-v="' + k + '" aria-pressed="false">' + esc(labels[k]) + '</button>').join('');
  }
  function initHousePanel() {
    if (housePanelReady) return;
    housePanelReady = true;
    const m = v => nf2.format(v) + ' м';
    const dims = $('#hDims'), rs = $('#hRoofSl'), open = $('#hOpen');
    hSlider(dims, { id: 'L', label: 'Длина', min: 5, max: 15, step: 0.5, fmt: m, get: () => HS.L,
      set: v => { HS.L = v; if (HS.W > v) HS.W = v; } });
    hSlider(dims, { id: 'W', label: 'Ширина (не больше длины)', min: 4, max: 12, step: 0.5, fmt: m, get: () => HS.W,
      maxFn: () => Math.min(12, HS.L), set: v => { HS.W = v; } });
    hSlider(dims, { id: 'floorH', label: 'Высота этажа', min: 2.5, max: 3.5, step: 0.1, fmt: m, get: () => HS.floorH,
      set: v => { HS.floorH = v; } });
    hSlider(rs, { id: 'angle', label: 'Угол наклона', min: 15, max: 60, step: 1, fmt: v => v + '°', get: () => HS.angle,
      off: () => HS.roof === 'flat', set: v => { HS.angle = v; } });
    hSlider(rs, { id: 'ovE', label: 'Свес карниза', min: 0.2, max: 0.8, step: 0.05, fmt: m, get: () => HS.ovE,
      set: v => { HS.ovE = v; } });
    hSlider(rs, { id: 'ovG', label: 'Свес фронтона', min: 0.1, max: 0.6, step: 0.05, fmt: m, get: () => HS.ovG,
      off: () => HS.roof !== 'gable', set: v => { HS.ovG = v; } });
    FACADES.forEach(k => {
      open.insertAdjacentHTML('beforeend', '<div class="sub">' + esc(FAC_NAMES[k]) + '</div><div class="fac-row" id="fac_' + k + '"></div>');
      const row = $('#fac_' + k);
      hSlider(row, { id: 'win_' + k, label: 'Окна', min: 0, max: 8, step: 1, fmt: String,
        get: () => layout(k, hGeo()).n, maxFn: () => layout(k, hGeo()).cap, set: v => { HS.win[k] = v; } });
      hSlider(row, { id: 'door_' + k, label: 'Двери', min: 0, max: 2, step: 1, fmt: String,
        get: () => layout(k, hGeo()).doors, maxFn: () => Math.min(2, rowCap(facLen(k))), set: v => { HS.door[k] = v; } });
    });
    hSlider($('#hPlH'), { id: 'plinthH', label: 'Высота цоколя', min: 0.3, max: 1, step: 0.05, fmt: m, get: () => HS.plinthH,
      set: v => { HS.plinthH = v; } });

    $('#hStoreys').innerHTML = hSeg('storeys', Object.keys(STOREYS), STOREYS);
    const roofNames = {};
    Object.keys(ROOF_TYPES).forEach(k => { roofNames[k] = ROOF_TYPES[k].name; });
    $('#hRoof').innerHTML = hSeg('roof', Object.keys(ROOF_TYPES), roofNames);
    $('#hPorch').innerHTML = hSeg('porch', ['none', 'plain', 'canopy'], {
      none: 'Нет',
      plain: X.porch.plain.name + ' · ' + money(unitPrice(X.porch.plain)),
      canopy: X.porch.canopy.name + ' · ' + money(unitPrice(X.porch.canopy))
    });
    $('#hGut').innerHTML = hSeg('gutterOn', ['1', '0'], { '1': 'Есть · ' + nf0.format(unitPrice(X.gutter)) + ' ₽/пог. м', '0': 'Нет' });
    $('#hDemo').innerHTML = hSeg('demo', ['0', '1'], { '0': 'Не снимаем', '1': 'Снять · ' + perM2(X.demoRoof) });

    const fill = (root, group, items, draw) => {
      root.innerHTML = Object.keys(items).map(k => swBtn(group, k, '', items[k].name, items[k].work === undefined ? '' : perM2(items[k]))).join('');
      Object.keys(items).forEach(k => {
        const box = root.querySelector('[data-v="' + k + '"] .sw-img'), c = draw(k);
        if (c) box.appendChild(c); else box.style.background = items[k].hex;
      });
    };
    fill($('#hRoofSw'), 'roofMat', X.roof, k => {
      const v = ROOF_VIS[k];
      return swatchOf(hx(v.tx), v.tx === 'soft' ? 0.8 : 0.9, v.tx === 'soft' ? null : v.color);
    });
    fill($('#hFacSw'), 'facade', X.facade, k => swatchOf(hx(k), 1));
    fill($('#hPlSw'), 'plinth', X.plinth, k => swatchOf(hx(PLINTH_TX[k]), 1));
    fill($('#hGutSw'), 'gutterColor', GUT_COLORS, () => null);

    $('#panelHouse').addEventListener('click', e => {
      const b = e.target.closest('button[data-g]');
      if (!b || b.disabled) return;
      const g = b.dataset.g, v = b.dataset.v;
      if (g === 'roof') {
        HS.roof = v;
        if (v === 'flat' && HS.storeys === '1.5') HS.storeys = '2';
      } else if (g === 'gutterOn') HS.gutterOn = v === '1';
      else if (g === 'demo') HS.demo = v === '1';
      else HS[g] = v;
      houseChanged();
    });
  }
  function syncHouseUI() {
    hSliders.forEach(s => {
      const o = s.o;
      if (o.maxFn) s.r.max = o.maxFn();
      s.r.disabled = o.off ? o.off() : Number(s.r.max) <= Number(s.r.min);
      const val = o.get();
      s.r.value = val;
      s.out.textContent = o.fmt(val);
    });
    const flat = HS.roof === 'flat';
    press($('#hStoreys'), HS.storeys);
    $('#hStoreys [data-v="1.5"]').disabled = flat;
    press($('#hRoof'), HS.roof);
    press($('#hPorch'), HS.porch);
    press($('#hGut'), HS.gutterOn ? '1' : '0');
    press($('#hDemo'), HS.demo ? '1' : '0');
    press($('#hRoofSw'), roofKey());
    $$('#hRoofSw .sw').forEach(b => { b.disabled = flat && b.dataset.v !== 'soft'; });
    press($('#hFacSw'), HS.facade);
    press($('#hPlSw'), HS.plinth);
    press($('#hGutSw'), HS.gutterColor);
    $('#hGutSw').hidden = !HS.gutterOn;
    $('#hRoofHint').textContent = ROOF_TYPES[HS.roof].hint;
    const a = hAreas(), oh = $('#hOpenHint');
    if (a.doors === 0) {
      oh.textContent = 'Ни одной двери: добавьте дверь хотя бы на один фасад.';
      oh.classList.add('warn');
    } else {
      oh.textContent = 'Окно ' + nf2.format(WIN_W) + ' × ' + nf2.format(WIN_H) + ' м, дверь ' + nf2.format(DOOR_W) + ' × ' + nf2.format(DOOR_H) +
        ' м. Предел ползунка зависит от длины фасада и этажности.' +
        (HS.storeys === '1.5' ? ' У мансарды верхний ряд окон есть только во фронтонах двускатной крыши.' : '') +
        (HS.porch === 'none' ? ' Без крыльца дверь окажется на высоте цоколя.' : '');
      oh.classList.remove('warn');
    }
  }
  function houseChanged() {
    syncHouseUI();
    renderHouseEstimate();
    if (view) view.houseDirty();
  }

  /* переключатель режимов */
  const ROOM_TEXT = {
    title: $('#pageTitle').textContent, lead: $('#pageLead').textContent,
    lbl: $('#estLbl').textContent, note: $('#estNote').textContent
  };
  const HOUSE_TEXT = {
    title: 'Дом снаружи в 3D',
    lead: 'Задайте размеры, этажность и крышу, расставьте окна и двери, выберите кровлю и фасад. Цены — из того же файла, что у калькулятора, и все они пример.',
    lbl: 'Смета на дом (пример)',
    note: 'Цены примерные (демо) — компания заменит их на свои. Площадь кровли считается по скатам модели с учётом угла и свесов, фасада — за вычетом окон и дверей. Сами окна, двери и утепление в смету не входят. Точная смета — после бесплатного замера.'
  };
  function setAppMode(m, keepHash) {
    appMode = m;
    const house = m === 'house', txt = house ? HOUSE_TEXT : ROOM_TEXT;
    if (house) initHousePanel();
    $('#panelRoom').hidden = house;
    $('#panelHouse').hidden = !house;
    $('#btnFP').hidden = house;
    press($('#modeSw'), m);
    $('#pageTitle').textContent = txt.title;
    $('#pageLead').textContent = txt.lead;
    $('#estLbl').textContent = txt.lbl;
    $('#estNote').textContent = txt.note;
    if (house) { syncHouseUI(); renderHouseEstimate(); }
    else { syncUI(); renderEstimate(); }
    if (view) view.setApp(m);
    if (!keepHash) location.replace('#' + m);
  }
  $('#modeSw').addEventListener('click', e => {
    const b = e.target.closest('button[data-v]');
    if (b && b.dataset.v !== appMode) setAppMode(b.dataset.v);
  });

  /* ---------- init UI ---------- */
  $('#year').textContent = new Date().getFullYear();
  applyTemplate('room');
  baseDimHint();
  syncUI();
  renderEstimate();
  if (location.hash === '#house') setAppMode('house', true);

  /* =====================================================================
     3D
     ===================================================================== */
  const stageMsg = $('#stageMsg');
  Promise.all([
    import('three'),
    import('three/addons/controls/OrbitControls.js'),
    import('three/addons/environments/RoomEnvironment.js')
  ]).then(([THREE, oc, re]) => {
    try {
      view = init3D(THREE, oc.OrbitControls, re.RoomEnvironment);
      if (appMode === 'house') view.setApp('house');
    } catch (err) {
      console.error(err);
      stageMsg.textContent = 'Не удалось запустить 3D в этом браузере (нужен WebGL). Смета справа работает.';
    }
  }).catch(err => {
    console.error(err);
    stageMsg.textContent = 'Не удалось загрузить three.js — проверьте интернет и обновите страницу. Смета работает и без 3D.';
  });

  function init3D(THREE, OrbitControls, RoomEnvironment) {
    const stage = $('#stage'), holder = $('#canvasHolder'), btnFP = $('#btnFP'), hint = $('#stageHint');
    const joy = $('#joy'), knob = $('#joyKnob');
    const T = 0.12, UP = new THREE.Vector3(0, 1, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isTouch ? 1.5 : 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false; // тени пересчитываем только при изменении комнаты
    renderer.toneMapping = THREE.NeutralToneMapping;
    holder.appendChild(renderer.domElement);
    const canvas = renderer.domElement;

    const scene = new THREE.Scene();
    const BG_ORBIT = new THREE.Color('#e6e2da'), BG_FP = new THREE.Color('#d3e2ec');
    scene.background = BG_ORBIT;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    scene.environmentIntensity = 0.35;

    const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 100);
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 2;
    controls.maxPolarAngle = 1.38;
    controls.minPolarAngle = 0.12;
    controls.rotateSpeed = 0.8;

    /* lights: мягкий небосвод + солнце из окна с тенями */
    scene.add(new THREE.HemisphereLight('#fff6ea', '#a39a8d', 1.6));
    const sun = new THREE.DirectionalLight('#fff0d8', 3.2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(isTouch ? 1024 : 2048, isTouch ? 1024 : 2048);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    scene.add(sun, sun.target);

    /* materials */
    const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    function tex(t) {
      const x = new THREE.CanvasTexture(t.canvas);
      x.wrapS = x.wrapT = THREE.RepeatWrapping;
      x.colorSpace = THREE.SRGBColorSpace;
      x.anisotropy = aniso;
      x.repeat.set(1 / t.size[0], 1 / t.size[1]); // UV у всех поверхностей — в метрах
      return x;
    }
    const std = o => new THREE.MeshStandardMaterial(o);
    const T3 = { paint: tex(TX.paint), wallTile: tex(TX.wallTile), wp: TX.wp.map(tex) };
    const floorMats = {
      lam_light: std({ map: tex(TX.lam_light), roughness: 0.6 }),
      lam_dark: std({ map: tex(TX.lam_dark), roughness: 0.5 }),
      tile: std({ map: tex(TX.tile), roughness: 0.32 }),
      spc: std({ map: tex(TX.spc), roughness: 0.68 })
    };
    const ceilMats = {
      paint: std({ map: T3.paint, color: '#f6f5f1', roughness: 0.95 }),
      stretch: std({ color: '#fafafa', roughness: 0.06, envMap: envTex, envMapIntensity: 0.9 })
    };
    const wallMat = std({ map: T3.paint, roughness: 0.92 });
    const outerMat = std({ color: '#d6d1c8', roughness: 1 });
    const capMat = std({ color: '#3d434c', roughness: 0.9 });
    const revealMat = std({ color: '#f1f0ec', roughness: 0.9 });
    const trimMat = std({ color: '#f4f3ef', roughness: 0.5 });
    const doorMat = std({ color: '#cbb596', roughness: 0.6 });
    const metalMat = std({ color: '#a2a7ad', roughness: 0.3, metalness: 0.8 });
    const slabMat = std({ color: '#b8b1a5', roughness: 1 });
    const glassMat = std({ color: '#d4e6f0', roughness: 0.05, transparent: true, opacity: 0.18, depthWrite: false,
      side: THREE.DoubleSide, envMap: envTex });
    // Невидимый, но отбрасывает тень: так у «кукольного домика» без потолка остаётся пятно солнца из окна.
    const ghostMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });

    function setWallMat() {
      if (S.walls === 'paint') { wallMat.map = T3.paint; wallMat.color.set(WALL_COLORS[S.wallColor].hex); wallMat.roughness = 0.92; }
      else if (S.walls === 'wallpaper') { wallMat.map = T3.wp[S.wallpaper]; wallMat.color.set('#ffffff'); wallMat.roughness = 0.85; }
      else { wallMat.map = T3.wallTile; wallMat.color.set('#ffffff'); wallMat.roughness = 0.18; }
      wallMat.needsUpdate = true;
    }

    /* geometry helpers */
    class GB {
      constructor() { this.p = []; this.n = []; this.uv = []; this.i = []; }
      quad(a, b, c, d, nrm, uvs) {
        const k = this.p.length / 3;
        [a, b, c, d].forEach(v => this.p.push(v.x, v.y, v.z));
        for (let j = 0; j < 4; j++) this.n.push(nrm.x, nrm.y, nrm.z);
        (uvs || [0, 0, 1, 0, 1, 1, 0, 1]).forEach(v => this.uv.push(v));
        this.i.push(k, k + 1, k + 2, k, k + 2, k + 3);
      }
      // Выпуклый многоугольник (веером); обход — против часовой стрелки со стороны нормали.
      poly(pts, nrm, uvs) {
        const k = this.p.length / 3;
        pts.forEach((v, j) => {
          this.p.push(v.x, v.y, v.z);
          this.n.push(nrm.x, nrm.y, nrm.z);
          this.uv.push(uvs ? uvs[2 * j] : 0, uvs ? uvs[2 * j + 1] : 0);
        });
        for (let j = 1; j < pts.length - 1; j++) this.i.push(k, k + j, k + j + 1);
      }
      build() {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
        g.setIndex(this.i);
        return g;
      }
    }
    // Стена минус проёмы → прямоугольники (работает и при пересечении окна и двери).
    function faceRects(len, H, holes) {
      const us = [0, len];
      holes.forEach(h => { [h.u0, h.u1].forEach(u => { if (u > 0 && u < len) us.push(u); }); });
      us.sort((a, b) => a - b);
      const out = [];
      for (let i = 0; i < us.length - 1; i++) {
        const a = us[i], b = us[i + 1];
        if (b - a < 1e-4) continue;
        const m = (a + b) / 2;
        const cov = holes.filter(h => h.u0 < m && h.u1 > m).map(h => [Math.max(0, h.v0), Math.min(H, h.v1)]).sort((x, y) => x[0] - y[0]);
        let v = 0;
        cov.forEach(c => { if (c[0] > v) out.push({ u0: a, u1: b, v0: v, v1: c[0] }); v = Math.max(v, c[1]); });
        if (v < H) out.push({ u0: a, u1: b, v0: v, v1: H });
      }
      return out;
    }
    // Стены: o — начало внутренней грани, d — направление вдоль стены, n — нормаль внутрь (d × UP = n).
    function wallDefs() {
      const L = S.L, W = S.W, V = (x, y, z) => new THREE.Vector3(x, y, z);
      const defs = {
        back:  { len: L, o: V(-L / 2, 0, -W / 2), d: V(1, 0, 0),  n: V(0, 0, 1) },
        front: { len: L, o: V(L / 2, 0, W / 2),   d: V(-1, 0, 0), n: V(0, 0, -1) },
        left:  { len: W, o: V(-L / 2, 0, W / 2),  d: V(0, 0, -1), n: V(1, 0, 0) },
        right: { len: W, o: V(L / 2, 0, -W / 2),  d: V(0, 0, 1),  n: V(-1, 0, 0) }
      };
      Object.keys(defs).forEach(k => {
        const w = defs[k];
        // off > 0 — вглубь стены (наружу), off < 0 — в комнату
        w.P = (u, v, off) => new THREE.Vector3(w.o.x + w.d.x * u - w.n.x * off, v, w.o.z + w.d.z * u - w.n.z * off);
        w.c = w.P(w.len / 2, S.H / 2, 0);
        w.hidden = false;
        w.parts = [];
      });
      return defs;
    }

    let room = null, WD = null, floorMesh = null, ceilMesh = null;
    let mode = 'orbit', dirty = true;
    const M4 = new THREE.Matrix4();

    function addMesh(geo, mat, cast, recv, parts) {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = !!cast; m.receiveShadow = !!recv; m.userData.mat = mat;
      room.add(m);
      if (parts) parts.push(m);
      return m;
    }
    function orient(m, w, u, v, off) {
      M4.makeBasis(w.d, UP, w.n);
      m.quaternion.setFromRotationMatrix(M4);
      m.position.copy(w.P(u, v, off));
    }
    function boxAt(w, u, v, off, su, sv, sd, mat, cast) {
      const m = addMesh(new THREE.BoxGeometry(su, sv, sd), mat, cast !== false, true, w.parts);
      orient(m, w, u, v, off);
      return m;
    }
    function meterUV(g, sx, sy) {
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * sx, uv.getY(i) * sy);
    }

    function buildWall(w, holes, win, door) {
      const P = w.P, len = w.len, H = S.H;
      const inner = new GB(), outer = new GB(), cap = new GB(), rev = new GB();
      const nOut = w.n.clone().negate(), dNeg = w.d.clone().negate(), down = UP.clone().negate();
      faceRects(len, H, holes).forEach(r => inner.quad(P(r.u0, r.v0, 0), P(r.u1, r.v0, 0), P(r.u1, r.v1, 0), P(r.u0, r.v1, 0), w.n,
        [r.u0, r.v0, r.u1, r.v0, r.u1, r.v1, r.u0, r.v1]));
      const shifted = holes.map(h => ({ u0: h.u0 + T, u1: h.u1 + T, v0: h.v0, v1: h.v1 }));
      faceRects(len + 2 * T, H, shifted).forEach(r => {
        const a = r.u0 - T, b = r.u1 - T;
        outer.quad(P(b, r.v0, T), P(a, r.v0, T), P(a, r.v1, T), P(b, r.v1, T), nOut);
      });
      cap.quad(P(-T, H, 0), P(len + T, H, 0), P(len + T, H, T), P(-T, H, T), UP);
      holes.forEach(h => {
        rev.quad(P(h.u0, h.v0, 0), P(h.u0, h.v0, T), P(h.u0, h.v1, T), P(h.u0, h.v1, 0), w.d);
        rev.quad(P(h.u1, h.v1, 0), P(h.u1, h.v1, T), P(h.u1, h.v0, T), P(h.u1, h.v0, 0), dNeg);
        rev.quad(P(h.u0, h.v1, 0), P(h.u0, h.v1, T), P(h.u1, h.v1, T), P(h.u1, h.v1, 0), down);
        if (h.v0 > 0) rev.quad(P(h.u0, h.v0, 0), P(h.u1, h.v0, 0), P(h.u1, h.v0, T), P(h.u0, h.v0, T), UP);
      });
      addMesh(inner.build(), wallMat, true, true, w.parts);
      addMesh(outer.build(), outerMat, true, true, w.parts);
      addMesh(cap.build(), capMat, true, false, w.parts);
      if (holes.length) addMesh(rev.build(), revealMat, true, true, w.parts);

      if (win && holes.indexOf(win) >= 0) {
        const fw = 0.06, fd = 0.07, off = T * 0.45, uc = (win.u0 + win.u1) / 2, vc = (win.v0 + win.v1) / 2;
        boxAt(w, uc, win.v1 - fw / 2, off, win.w, fw, fd, trimMat);
        boxAt(w, uc, win.v0 + fw / 2, off, win.w, fw, fd, trimMat);
        boxAt(w, win.u0 + fw / 2, vc, off, fw, win.h - 2 * fw, fd, trimMat);
        boxAt(w, win.u1 - fw / 2, vc, off, fw, win.h - 2 * fw, fd, trimMat);
        if (win.w > 0.9) boxAt(w, uc, vc, off, fw * 0.8, win.h - 2 * fw, fd, trimMat);
        const glass = addMesh(new THREE.PlaneGeometry(win.w - 2 * fw, win.h - 2 * fw), glassMat, false, false, w.parts);
        orient(glass, w, uc, vc, off);
        const sd = off + 0.22; // подоконник выступает в комнату на 22 см
        boxAt(w, uc, win.v0 - 0.02, off - sd / 2, win.w + 0.14, 0.04, sd, trimMat);
      }
      if (door && holes.indexOf(door) >= 0) {
        const uc = (door.u0 + door.u1) / 2, cw = 0.07;
        boxAt(w, uc, door.h / 2, T * 0.55, door.w - 0.03, door.h - 0.015, 0.04, doorMat);
        boxAt(w, door.u1 - 0.1, 1.0, T * 0.55 - 0.035, 0.12, 0.022, 0.03, metalMat, false);
        boxAt(w, door.u0 - cw / 2, (door.h + cw) / 2, -0.008, cw, door.h + cw, 0.016, trimMat, false);
        boxAt(w, door.u1 + cw / 2, (door.h + cw) / 2, -0.008, cw, door.h + cw, 0.016, trimMat, false);
        boxAt(w, uc, door.h + cw / 2, -0.008, door.w + 2 * cw, cw, 0.016, trimMat, false);
      }
      if (S.walls !== 'tile') {
        let segs = [[0, len]];
        if (door && holes.indexOf(door) >= 0) segs = [[0, door.u0 - 0.07], [door.u1 + 0.07, len]];
        segs.forEach(s => { if (s[1] - s[0] > 0.02) boxAt(w, (s[0] + s[1]) / 2, 0.035, -0.009, s[1] - s[0], 0.07, 0.018, trimMat, false); });
      }
    }

    function placeSun(win) {
      const R = Math.max(S.L, S.W) + 1;
      if (win) {
        const w = WD[win.wall], pc = w.P((win.u0 + win.u1) / 2, (win.v0 + win.v1) / 2, 0);
        const dir = w.n.clone().addScaledVector(w.d, 0.35).normalize();
        dir.y = -0.75; dir.normalize();
        sun.position.copy(pc).addScaledVector(dir, -9);
        sun.target.position.copy(pc).addScaledVector(dir, 2);
      } else {
        sun.position.set(3, 9, 4);
        sun.target.position.set(0, 0, 0);
      }
      sun.target.updateMatrixWorld();
      const c = sun.shadow.camera;
      c.left = -R; c.right = R; c.top = R; c.bottom = -R; c.near = 0.5; c.far = 30;
      c.updateProjectionMatrix();
    }

    function build() {
      if (room) {
        scene.remove(room);
        room.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
      }
      room = new THREE.Group();
      scene.add(room);
      const L = S.L, W = S.W, H = S.H;
      WD = wallDefs();
      const win = opening(S.win, true), door = opening(S.door, false);

      const fg = new THREE.PlaneGeometry(L, W); fg.rotateX(-Math.PI / 2); meterUV(fg, L, W);
      floorMesh = addMesh(fg, floorMats[S.floor], false, true);
      const cg = new THREE.PlaneGeometry(L, W); cg.rotateX(Math.PI / 2); cg.translate(0, H, 0); meterUV(cg, L, W);
      ceilMesh = addMesh(cg, ceilMats[S.ceiling], true, true);
      const slab = addMesh(new THREE.BoxGeometry(L + 2 * T, 0.16, W + 2 * T), slabMat, false, true);
      slab.position.y = -0.082;

      setWallMat();
      Object.keys(WD).forEach(k => buildWall(WD[k], [win, door].filter(o => o && o.wall === k), win, door));
      placeSun(win);
      applyMode();
      renderer.shadowMap.needsUpdate = true;
      dirty = true;
    }

    /* «кукольный домик»: прячем стены между камерой и комнатой */
    const tmpV = new THREE.Vector3();
    function setHidden(w, hide) {
      if (w.hidden === hide) return;
      w.hidden = hide;
      w.parts.forEach(m => { m.material = hide ? ghostMat : m.userData.mat; });
    }
    function updateGhosts() {
      Object.keys(WD).forEach(k => {
        const w = WD[k];
        tmpV.copy(camera.position).sub(w.c); tmpV.y = 0;
        setHidden(w, mode === 'orbit' && tmpV.dot(w.n) < 0);
      });
    }
    function applyMode() {
      ceilMesh.material = mode === 'fp' ? ceilMats[S.ceiling] : ghostMat;
      scene.background = mode === 'fp' ? BG_FP : BG_ORBIT;
      updateGhosts();
    }

    function resize() {
      const w = holder.clientWidth, h = holder.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      dirty = true;
      if (hv) hv.setAspect(w / h);
    }
    function resetOrbit() {
      let dist = Math.max(S.L, S.W) * 1.35 + S.H * 0.6 + 1.5;
      dist *= Math.max(1, 1.2 / (camera.aspect || 1));
      controls.target.set(0, S.H * 0.32, 0);
      const phi = 0.95, theta = 0.62;
      camera.position.set(Math.sin(phi) * Math.sin(theta) * dist, S.H * 0.32 + Math.cos(phi) * dist, Math.sin(phi) * Math.cos(theta) * dist);
      controls.maxDistance = dist * 2.2;
      controls.update();
      dirty = true;
    }

    /* вид от первого лица */
    const fp = { pos: new THREE.Vector3(), yaw: 0, pitch: 0 }, keys = {}, jv = { x: 0, y: 0 };
    let savedOrbit = null, lookDirty = false, look = null, joyId = null;
    const eye = () => Math.min(1.6, S.H - 0.3);
    function clampFP() {
      fp.pos.x = clamp(fp.pos.x, -S.L / 2 + 0.3, S.L / 2 - 0.3);
      fp.pos.z = clamp(fp.pos.z, -S.W / 2 + 0.3, S.W / 2 - 0.3);
      fp.pos.y = eye();
    }
    function setHint() {
      if (mode === 'fp') {
        hint.textContent = isTouch ? 'Джойстик — идти, проведите пальцем по экрану — осмотреться'
          : 'Кликните по сцене и осматривайтесь мышью · W A S D — идти · Shift — быстрее · Esc — отпустить мышь';
      } else {
        hint.textContent = isTouch ? 'Вращайте пальцем, масштаб — двумя пальцами' : 'Вращайте мышью, колесо — масштаб';
      }
    }
    function enterFP() {
      mode = 'fp';
      savedOrbit = camera.position.clone();
      controls.enabled = false;
      stage.classList.add('is-fp');
      document.body.classList.add('no-scroll');
      camera.fov = 70;
      camera.updateProjectionMatrix();
      // встаём у противоположной окну стены и смотрим на окно
      const win = opening(S.win, true), w = WD[win ? win.wall : 'back'];
      const depth = (w === WD.back || w === WD.front) ? S.W : S.L;
      fp.pos.set(w.c.x + w.n.x * (depth - 0.6), eye(), w.c.z + w.n.z * (depth - 0.6));
      fp.yaw = Math.atan2(w.n.x, w.n.z);
      fp.pitch = -0.06;
      clampFP();
      lookDirty = true;
      btnFP.textContent = '← Вид сверху';
      joy.hidden = !isTouch;
      applyMode();
      setHint();
      resize();
    }
    function exitFP() {
      if (mode !== 'fp') return;
      if (document.pointerLockElement) document.exitPointerLock();
      mode = 'orbit';
      stage.classList.remove('is-fp');
      if (modal.hidden) document.body.classList.remove('no-scroll');
      camera.fov = 45;
      camera.updateProjectionMatrix();
      if (savedOrbit) camera.position.copy(savedOrbit);
      controls.enabled = true;
      controls.update();
      Object.keys(keys).forEach(k => { delete keys[k]; });
      jv.x = jv.y = 0; knob.style.transform = '';
      btnFP.textContent = 'Войти внутрь';
      joy.hidden = true;
      applyMode();
      setHint();
      resize();
    }
    btnFP.addEventListener('click', () => { if (mode === 'fp') exitFP(); else enterFP(); });

    const MOVE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'];
    window.addEventListener('keydown', e => {
      if (mode !== 'fp' || !modal.hidden || MOVE_KEYS.indexOf(e.code) < 0) return;
      keys[e.code] = true;
      e.preventDefault();
    });
    window.addEventListener('keyup', e => { delete keys[e.code]; });
    window.addEventListener('blur', () => { Object.keys(keys).forEach(k => { delete keys[k]; }); });

    canvas.addEventListener('pointerdown', e => {
      if (mode !== 'fp') return;
      if (e.pointerType === 'mouse' && canvas.requestPointerLock && !document.pointerLockElement) {
        try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (_) { /* fallback: drag */ }
      }
      look = { id: e.pointerId, x: e.clientX, y: e.clientY };
    });
    function turn(dx, dy, k) {
      fp.yaw -= dx * k;
      fp.pitch = clamp(fp.pitch - dy * k, -1.4, 1.4);
      lookDirty = true;
    }
    // мышь под pointer lock — через mousemove, перетаскивание (палец, мышь без lock) — через pointermove
    document.addEventListener('mousemove', e => {
      if (mode === 'fp' && document.pointerLockElement === canvas) turn(e.movementX || 0, e.movementY || 0, 0.0024);
    });
    document.addEventListener('pointermove', e => {
      if (mode !== 'fp' || document.pointerLockElement === canvas) return;
      if (look && look.id === e.pointerId) {
        turn(e.clientX - look.x, e.clientY - look.y, isTouch ? 0.006 : 0.004);
        look.x = e.clientX; look.y = e.clientY;
      }
    });
    const endLook = e => { if (look && look.id === e.pointerId) look = null; };
    document.addEventListener('pointerup', endLook);
    document.addEventListener('pointercancel', endLook);

    function moveJoy(e) {
      const r = joy.getBoundingClientRect(), R = r.width / 2, max = R * 0.6;
      let dx = e.clientX - (r.left + R), dy = e.clientY - (r.top + R);
      const l = Math.hypot(dx, dy);
      if (l > max) { dx *= max / l; dy *= max / l; }
      jv.x = dx / max; jv.y = -dy / max;
      knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    }
    joy.addEventListener('pointerdown', e => {
      joyId = e.pointerId;
      joy.setPointerCapture(e.pointerId);
      moveJoy(e);
      e.preventDefault();
      e.stopPropagation();
    });
    joy.addEventListener('pointermove', e => { if (e.pointerId === joyId) moveJoy(e); });
    const endJoy = e => {
      if (e.pointerId !== joyId) return;
      joyId = null; jv.x = jv.y = 0; knob.style.transform = '';
    };
    joy.addEventListener('pointerup', endJoy);
    joy.addEventListener('pointercancel', endJoy);

    function stepFP(dt) {
      let mx = jv.x, my = jv.y;
      if (keys.KeyW || keys.ArrowUp) my += 1;
      if (keys.KeyS || keys.ArrowDown) my -= 1;
      if (keys.KeyD || keys.ArrowRight) mx += 1;
      if (keys.KeyA || keys.ArrowLeft) mx -= 1;
      const l = Math.hypot(mx, my);
      if (l > 1) { mx /= l; my /= l; }
      let moved = lookDirty;
      lookDirty = false;
      if (l > 0.02) {
        const sp = (keys.ShiftLeft || keys.ShiftRight ? 2.6 : 1.4) * dt, sy = Math.sin(fp.yaw), cy = Math.cos(fp.yaw);
        fp.pos.x += (-sy * my + cy * mx) * sp;
        fp.pos.z += (-cy * my - sy * mx) * sp;
        clampFP();
        moved = true;
      }
      if (moved) {
        camera.position.copy(fp.pos);
        camera.rotation.set(fp.pitch, fp.yaw, 0, 'YXZ');
      }
      return moved;
    }

    /* render loop: рисуем только когда что-то изменилось */
    controls.addEventListener('change', () => { dirty = true; });
    let last = performance.now();
    function loop(t) {
      requestAnimationFrame(loop);
      const raw = t - last;
      const dt = Math.min(0.05, raw / 1000);
      last = t;
      if (appMode === 'house' && hv) { hv.frame(raw); return; }
      if (mode === 'orbit') { if (controls.update()) dirty = true; }
      else if (stepFP(dt)) dirty = true;
      if (!dirty) return;
      if (mode === 'orbit') updateGhosts();
      renderer.render(scene, camera);
      dirty = false;
    }

    /* =====================================================================
       ДОМ СНАРУЖИ: своя сцена и камера, тот же renderer.
       Дом — около десятка объединённых геометрий, проёмы в стенах не вырезаются
       (рамы и стёкла лежат поверх стены), кадр рисуется только при изменениях.
       ===================================================================== */
    function createHouse() {
      const sc = new THREE.Scene();
      const skyT = tex(hx('sky'));
      sc.fog = new THREE.Fog('#dfeaf0', 60, 180);
      const sky = new THREE.Mesh(new THREE.SphereGeometry(200, 24, 16),
        new THREE.MeshBasicMaterial({ map: skyT, side: THREE.BackSide, fog: false, toneMapped: false, depthWrite: false }));
      sky.frustumCulled = false;
      sc.add(sky);
      const envSc = new THREE.Scene();
      envSc.add(new THREE.Mesh(new THREE.SphereGeometry(10, 16, 8),
        new THREE.MeshBasicMaterial({ map: skyT, side: THREE.BackSide, toneMapped: false })));
      sc.environment = pmrem.fromScene(envSc, 0.02).texture;
      sc.environmentIntensity = 0.5;

      sc.add(new THREE.HemisphereLight('#e8f0f8', '#8c9668', 1.5));
      const sun2 = new THREE.DirectionalLight('#fff2df', 2.8);
      sun2.castShadow = true;
      sun2.shadow.mapSize.set(isTouch ? 1024 : 2048, isTouch ? 1024 : 2048);
      sun2.shadow.bias = -0.0005;
      sun2.shadow.normalBias = 0.02;
      sc.add(sun2, sun2.target);
      const SUN_DIR = vNorm(v3(-0.45, 0.85, 0.6));

      const lam = o => new THREE.MeshLambertMaterial(o);
      const lawnGeo = new THREE.CircleGeometry(195, 48);
      lawnGeo.rotateX(-Math.PI / 2);
      meterUV(lawnGeo, 390, 390);
      const lawn = new THREE.Mesh(lawnGeo, lam({ map: tex(hx('lawn')) }));
      lawn.receiveShadow = true;
      sc.add(lawn);

      const texCache = new Map(), normCache = new Map();
      const hTex = t => { if (!texCache.has(t)) texCache.set(t, tex(t)); return texCache.get(t); };
      const hNorm = t => {
        if (!normCache.has(t)) {
          const n = new THREE.CanvasTexture(t.normal);
          n.wrapS = n.wrapT = THREE.RepeatWrapping;
          n.anisotropy = aniso;
          n.repeat.set(1 / t.size[0], 1 / t.size[1]);
          normCache.set(t, n);
        }
        return normCache.get(t);
      };
      const firstRoof = hx(ROOF_VIS.tile_red.tx);
      const M = {
        wall: lam({ map: hTex(hx('siding_light')) }),
        plinth: lam({ map: hTex(hx('plaster_grey')) }),
        roof: std({ map: hTex(firstRoof), normalMap: hNorm(firstRoof) }),
        cap: std({ color: '#888888' }),
        under: lam({ color: '#dcd7cc' }),
        fascia: lam({ color: '#ece9e1' }),
        frame: lam({ color: '#f3f2ec' }),
        glass: std({ color: '#2a3b4c', roughness: 0.12, metalness: 0.2, envMapIntensity: 1.4 }),
        door: lam({ color: '#6d4a33' }),
        gutter: lam({ color: '#eeeeea' }),
        conc: lam({ color: '#b9b3a7' })
      };

      const cam = new THREE.PerspectiveCamera(40, camera.aspect || 1, 0.5, 450);
      const ctrl = new OrbitControls(cam, canvas);
      ctrl.enableDamping = true;
      ctrl.dampingFactor = 0.08;
      ctrl.enablePan = false;
      ctrl.rotateSpeed = 0.8;
      ctrl.minPolarAngle = 0.15;
      ctrl.maxPolarAngle = 1.53;
      let userMoved = false, needBuild = true, hDirty = true;
      let pfSum = 0, pfN = 0, drewPrev = false;
      ctrl.addEventListener('start', () => { userMoved = true; });
      ctrl.addEventListener('change', () => { hDirty = true; });

      let fpsChip = null;
      if (/[?&]fps\b/.test(location.search)) { // viz.html?fps#house — счётчик кадров для проверки на телефоне
        fpsChip = document.createElement('span');
        fpsChip.className = 'chip';
        fpsChip.textContent = 'FPS: покрутите дом';
        $('.stage-top').appendChild(fpsChip);
      }

      const house = new THREE.Group();
      sc.add(house);

      /* геометрические помощники: точки — обычные объекты {x, y, z} */
      function facDef(k) {
        const L = HS.L, W = HS.W;
        const f = {
          front: { len: L, ox: -L / 2, oz: W / 2, dx: 1, dz: 0, nx: 0, nz: 1 },
          back:  { len: L, ox: L / 2, oz: -W / 2, dx: -1, dz: 0, nx: 0, nz: -1 },
          right: { len: W, ox: L / 2, oz: W / 2, dx: 0, dz: -1, nx: 1, nz: 0 },
          left:  { len: W, ox: -L / 2, oz: -W / 2, dx: 0, dz: 1, nx: -1, nz: 0 }
        }[k];
        // u — вдоль фасада слева направо, если смотреть снаружи; v — высота; o — отступ от стены наружу.
        f.P = (u, v, o) => v3(f.ox + f.dx * u + f.nx * o, v, f.oz + f.dz * u + f.nz * o);
        f.d = v3(f.dx, 0, f.dz);
        f.n = v3(f.nx, 0, f.nz);
        return f;
      }
      function fbox(gb, f, u0, u1, v0, v1, o0, o1, sides) {
        const P = f.P;
        gb.quad(P(u0, v0, o1), P(u1, v0, o1), P(u1, v1, o1), P(u0, v1, o1), f.n, [u0, v0, u1, v0, u1, v1, u0, v1]);
        gb.quad(P(u0, v1, o1), P(u1, v1, o1), P(u1, v1, o0), P(u0, v1, o0), V_UP, [u0, o1, u1, o1, u1, o0, u0, o0]);
        if (sides === false) return;
        gb.quad(P(u0, v0, o0), P(u0, v0, o1), P(u0, v1, o1), P(u0, v1, o0), vAdd(v3(0, 0, 0), f.d, -1), [o0, v0, o1, v0, o1, v1, o0, v1]);
        gb.quad(P(u1, v0, o1), P(u1, v0, o0), P(u1, v1, o0), P(u1, v1, o1), f.d, [o1, v0, o0, v0, o0, v1, o1, v1]);
        gb.quad(P(u0, v0, o0), P(u1, v0, o0), P(u1, v0, o1), P(u0, v0, o1), v3(0, -1, 0), [u0, o0, u1, o0, u1, o1, u0, o1]);
      }
      // Брус от a до b: полуширина hw, полутолщина hh.
      function bar(gb, a, b, hw, hh) {
        const t = vNorm(vSub(b, a));
        const ref = Math.abs(t.y) > 0.95 ? v3(1, 0, 0) : V_UP;
        const s = vNorm(vCross(t, ref)), n = vCross(s, t);
        const c = (p, ks, kn) => vAdd(vAdd(p, s, ks * hw), n, kn * hh);
        const ms = vAdd(v3(0, 0, 0), s, -1), mn = vAdd(v3(0, 0, 0), n, -1), mt = vAdd(v3(0, 0, 0), t, -1);
        gb.quad(c(a, 1, 1), c(b, 1, 1), c(b, -1, 1), c(a, -1, 1), n);
        gb.quad(c(a, 1, -1), c(b, 1, -1), c(b, 1, 1), c(a, 1, 1), s);
        gb.quad(c(a, -1, -1), c(b, -1, -1), c(b, 1, -1), c(a, 1, -1), mn);
        gb.quad(c(b, -1, -1), c(a, -1, -1), c(a, -1, 1), c(b, -1, 1), ms);
        gb.quad(c(b, 1, -1), c(b, -1, -1), c(b, -1, 1), c(b, 1, 1), t);
        gb.quad(c(a, -1, -1), c(a, 1, -1), c(a, 1, 1), c(a, -1, 1), mt);
      }
      // Скат: UV в метрах, u — вдоль карниза, v — вверх по скату от карниза.
      function roofFace(gbRoof, gbUnder, pts, d) {
        const n = vNorm(vCross(vSub(pts[1], pts[0]), vSub(pts[2], pts[0])));
        const e = vNorm(vSub(pts[1], pts[0])), s = vCross(n, e), uvs = [];
        pts.forEach(p => { uvs.push(vDot(p, e), vDot(vSub(p, pts[0]), s)); });
        gbRoof.poly(pts, n, uvs);
        gbUnder.poly(pts.map(p => v3(p.x, p.y - d, p.z)).reverse(), vAdd(v3(0, 0, 0), n, -1));
      }
      // Торцевая планка по контуру крыши; контур идёт против часовой стрелки, если смотреть сверху.
      function rimStrip(gb, rim, d) {
        rim.forEach((a, i) => {
          const b = rim[(i + 1) % rim.length], n = vNorm(vCross(vSub(b, a), V_UP));
          gb.quad(v3(a.x, a.y - d, a.z), v3(b.x, b.y - d, b.z), b, a, n);
        });
      }
      function addWindow(A, f, o) {
        const fw = 0.07, uc = (o.u0 + o.u1) / 2;
        fbox(A.frame, f, o.u0, o.u1, o.v1 - fw, o.v1, 0, 0.06);
        fbox(A.frame, f, o.u0, o.u1, o.v0, o.v0 + fw, 0, 0.06);
        fbox(A.frame, f, o.u0, o.u0 + fw, o.v0 + fw, o.v1 - fw, 0, 0.06);
        fbox(A.frame, f, o.u1 - fw, o.u1, o.v0 + fw, o.v1 - fw, 0, 0.06);
        fbox(A.frame, f, uc - fw * 0.4, uc + fw * 0.4, o.v0 + fw, o.v1 - fw, 0, 0.05);
        fbox(A.frame, f, o.u0 - 0.05, o.u1 + 0.05, o.v0 - 0.04, o.v0, 0, 0.13);
        const P = f.P, off = 0.025;
        A.glass.quad(P(o.u0 + fw, o.v0 + fw, off), P(o.u1 - fw, o.v0 + fw, off), P(o.u1 - fw, o.v1 - fw, off), P(o.u0 + fw, o.v1 - fw, off), f.n);
      }
      function addDoor(A, f, o, g, k) {
        const cw = 0.07, uc = (o.u0 + o.u1) / 2;
        fbox(A.door, f, o.u0, o.u1, o.v0, o.v1, 0, 0.05);
        fbox(A.door, f, o.u0 + 0.14, o.u1 - 0.14, o.v0 + 0.18, o.v0 + 0.95, 0.05, 0.065);
        fbox(A.glass, f, o.u0 + 0.28, o.u1 - 0.28, o.v0 + 1.25, o.v1 - 0.22, 0.05, 0.056);
        fbox(A.glass, f, o.u1 - 0.17, o.u1 - 0.1, o.v0 + 0.96, o.v0 + 1.12, 0.05, 0.09);
        fbox(A.frame, f, o.u0 - cw, o.u0, o.v0, o.v1 + cw, 0, 0.07);
        fbox(A.frame, f, o.u1, o.u1 + cw, o.v0, o.v1 + cw, 0, 0.07);
        fbox(A.frame, f, o.u0, o.u1, o.v1, o.v1 + cw, 0, 0.07);
        if (HS.porch === 'none') return;
        // Площадка и ступени
        const PL = HS.plinthH, hw = 1.1, depth = 1.4, tread = 0.3;
        fbox(A.conc, f, uc - hw, uc + hw, 0, PL, 0.05, depth);
        const n = Math.max(1, Math.round(PL / 0.17) - 1), rise = PL / (n + 1);
        for (let i = 0; i < n; i++) {
          fbox(A.conc, f, uc - hw, uc + hw, 0, PL - rise * (i + 1), depth + tread * i, depth + tread * (i + 1));
        }
        if (HS.porch !== 'canopy') return;
        // Навес: не выше нижней кромки карниза; на торце с фронтоном ограничения нет.
        let y1 = o.v1 + cw + 0.3;
        if (!gableFace(k)) y1 = Math.min(y1, g.eaveBottom - 0.04);
        const y2 = y1 - 0.22, D = 1.6, ua = uc - hw - 0.1, ub = uc + hw + 0.1, P = f.P;
        const pts = [P(ua, y2, D), P(ub, y2, D), P(ub, y1, 0), P(ua, y1, 0)];
        roofFace(A.roof, A.under, pts, 0.06);
        rimStrip(A.fascia, pts, 0.06);
        const postTop = y2 + 0.22 * (0.35 / D) - 0.06;
        fbox(A.frame, f, uc - hw + 0.02, uc - hw + 0.12, PL, postTop, 1.2, 1.3);
        fbox(A.frame, f, uc + hw - 0.12, uc + hw - 0.02, PL, postTop, 1.2, 1.3);
      }

      function applyFinish() {
        const vis = ROOF_VIS[roofKey()], t = hx(vis.tx);
        M.roof.map = hTex(t);
        M.roof.normalMap = hNorm(t);
        M.roof.color.set(vis.color);
        M.roof.metalness = vis.metal;
        M.roof.roughness = vis.rough;
        M.cap.color.set(vis.cap || vis.color);
        M.cap.metalness = vis.metal;
        M.cap.roughness = vis.rough;
        M.wall.map = hTex(hx(HS.facade));
        M.plinth.map = hTex(hx(PLINTH_TX[HS.plinth]));
        M.gutter.color.set(GUT_COLORS[HS.gutterColor].hex);
      }

      function fit(g) {
        const rad = Math.hypot(HS.L / 2 + g.ovX, HS.W / 2 + g.ovZ, g.topY / 2);
        const halfV = THREE.MathUtils.degToRad(cam.fov / 2), halfH = Math.atan(Math.tan(halfV) * cam.aspect);
        const dist = rad / Math.sin(Math.min(halfV, halfH)) * 1.04;
        ctrl.minDistance = Math.max(HS.L, HS.W) / 2 + 2.5;
        ctrl.maxDistance = Math.max(45, dist * 1.6);
        ctrl.target.set(0, g.topY * 0.42, 0);
        if (!userMoved) {
          const phi = 1.3, theta = 0.65;
          cam.position.set(Math.sin(phi) * Math.sin(theta) * dist, ctrl.target.y + Math.cos(phi) * dist, Math.sin(phi) * Math.cos(theta) * dist);
        }
        ctrl.update();
      }

      function buildHouse() {
        needBuild = false;
        pfSum = pfN = 0; drewPrev = false;
        house.children.slice().forEach(m => { m.geometry.dispose(); house.remove(m); });
        const g = hGeo(), PL = HS.plinthH, top = g.wallTop, A = {};
        Object.keys(M).forEach(k => { A[k] = new GB(); });

        FACADES.forEach(k => {
          const f = facDef(k), len = f.len, P = f.P;
          A.wall.quad(P(0, PL, 0), P(len, PL, 0), P(len, top, 0), P(0, top, 0), f.n, [0, PL, len, PL, len, top, 0, top]);
          if (gableFace(k)) {
            A.wall.poly([P(0, top, 0), P(len, top, 0), P(len / 2, top + g.triH, 0)], f.n, [0, top, len, top, len / 2, top + g.triH]);
          }
          fbox(A.plinth, f, -0.05, len + 0.05, 0, PL, 0, 0.05, false);
          if (HS.facade.indexOf('siding') === 0) {
            fbox(A.frame, f, 0, 0.1, PL, top, 0, 0.03);
            fbox(A.frame, f, len - 0.1, len, PL, top, 0, 0.03);
          }
          layout(k, g).ops.forEach(o => {
            if (o.type === 'win') addWindow(A, f, o);
            else addDoor(A, f, o, g, k);
          });
        });

        g.faces.forEach(pts => roofFace(A.roof, A.under, pts, g.thick));
        rimStrip(A.fascia, g.rim, g.thick);
        g.ridges.forEach(r => bar(A.cap, v3(r[0].x, r[0].y + 0.015, r[0].z), v3(r[1].x, r[1].y + 0.015, r[1].z), 0.09, 0.04));

        if (HS.gutterOn) {
          g.eaves.forEach(e => {
            const dir = vNorm(vSub(e[1], e[0])), out = vCross(dir, V_UP);
            const mk = (p, k) => vAdd(v3(p.x + out.x * 0.05, g.eaveBottom + 0.02, p.z + out.z * 0.05), dir, k);
            bar(A.gutter, mk(e[0], -0.1), mk(e[1], 0.1), 0.06, 0.05);
          });
          const R = pipeRuns(g);
          [-1, 1].forEach(sx => [-1, 1].forEach(sz => {
            const x = sx * R.px, zw = sz * R.zWall;
            bar(A.gutter, v3(x, R.yG, sz * R.zOut), v3(x, R.yBend, zw), 0.045, 0.045);
            bar(A.gutter, v3(x, R.yBend, zw), v3(x, 0.12, zw), 0.045, 0.045);
            bar(A.gutter, v3(x, 0.12, zw), v3(x, 0.07, zw + sz * 0.22), 0.045, 0.045);
          }));
        }

        // В карту теней three.js пишет обратные грани: тень крыши даёт именно её нижняя поверхность (under).
        Object.keys(A).forEach(k => {
          if (!A[k].i.length) return;
          const m = new THREE.Mesh(A[k].build(), M[k]);
          m.castShadow = k !== 'glass';
          m.receiveShadow = k !== 'glass';
          house.add(m);
        });
        applyFinish();

        const R = Math.hypot(HS.L / 2 + g.ovX, HS.W / 2 + g.ovZ) + g.topY * 0.9 + 1, D = R * 2.5;
        sun2.position.set(SUN_DIR.x * D, 2 + SUN_DIR.y * D, SUN_DIR.z * D);
        sun2.target.position.set(0, 2, 0);
        sun2.target.updateMatrixWorld();
        const sc2 = sun2.shadow.camera;
        sc2.left = -R; sc2.right = R; sc2.top = R; sc2.bottom = -R; sc2.near = 0.5; sc2.far = D * 2;
        sc2.updateProjectionMatrix();

        fit(g);
        renderer.shadowMap.needsUpdate = true;
        hDirty = true;
      }

      return {
        ctrl: ctrl,
        invalidate() { hDirty = true; drewPrev = false; pfSum = pfN = 0; },
        markBuild() { needBuild = true; },
        setAspect(a) {
          cam.aspect = a;
          cam.updateProjectionMatrix();
          hDirty = true;
          if (!userMoved) needBuild = true;
        },
        frame(raw) {
          if (needBuild) buildHouse();
          if (ctrl.update()) hDirty = true;
          if (!hDirty) { drewPrev = false; return; }
          renderer.render(sc, cam);
          hDirty = false;
          if (drewPrev && raw < 250) {
            pfSum += raw; pfN++;
            if (pfN >= 40) {
              const avg = pfSum / pfN;
              pfSum = pfN = 0;
              if (fpsChip) {
                const info = renderer.info.render;
                fpsChip.textContent = Math.round(1000 / avg) + ' FPS · ' + info.calls + ' вызовов · ' + info.triangles + ' треуг.';
              }
              // Слабое устройство: снижаем разрешение вместо рывков при вращении.
              if (avg > 26 && renderer.getPixelRatio() > 1) {
                renderer.setPixelRatio(1);
                hDirty = true; // смена размера очищает холст — нужен новый кадр
              }
            }
          }
          drewPrev = true;
        },
        snap() {
          if (needBuild) buildHouse();
          renderer.render(sc, cam);
          return canvas.toDataURL('image/jpeg', 0.85);
        }
      };
    }
    let hv = null;

    new ResizeObserver(resize).observe(holder);
    resize();
    build();
    resetOrbit();
    setHint();
    stageMsg.hidden = true;
    btnFP.disabled = false;
    requestAnimationFrame(loop);

    return {
      update(resetCam) {
        build();
        if (mode === 'fp') { clampFP(); lookDirty = true; }
        else if (resetCam) resetOrbit();
        else { controls.target.y = S.H * 0.32; controls.update(); }
      },
      setApp(m) {
        if (m === 'house') {
          if (mode === 'fp') exitFP();
          if (!hv) hv = createHouse();
          controls.enabled = false;
          hv.ctrl.enabled = true;
          hv.setAspect(camera.aspect || 1);
          hv.invalidate();
          hv.markBuild();
        } else {
          if (hv) hv.ctrl.enabled = false;
          controls.enabled = true;
          controls.update();
          renderer.shadowMap.needsUpdate = true;
          dirty = true;
        }
        setHint();
      },
      houseDirty() { if (hv) hv.markBuild(); },
      snapshot() {
        if (appMode === 'house' && hv) return hv.snap();
        if (mode === 'orbit') updateGhosts();
        renderer.render(scene, camera);
        return canvas.toDataURL('image/jpeg', 0.85);
      },
      isFP: () => mode === 'fp',
      exitFP: exitFP
    };
  }
})();
