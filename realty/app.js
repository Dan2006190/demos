/* Демо сайта агентства: 3D-карта Тамбова, карточки объектов, ипотека, 3D-квартира. */
import * as THREE from 'three';

const CFG = { phone: '+7 (000) 000-00-00' };
const fmt = n => Math.round(n).toLocaleString('ru-RU');
const mln = n => (n / 1e6).toFixed(1).replace('.', ',') + ' млн';
const $ = s => document.querySelector(s);
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Объекты — ПРИМЕРЫ для демонстрации, координаты примерные */
const OBJ = [
  { id: 1, type: 2, title: '2-комнатная у Кольцевой', area: 58, floor: '5/9', price: 5400000, district: 'Центр', addr: 'ул. Советская', ll: [41.4528, 52.7238], near: ['Кольцевая — 3 мин', 'Школа — 5 мин', 'Остановка — 2 мин'] },
  { id: 2, type: 1, title: '1-комнатная с ремонтом', area: 38, floor: '7/10', price: 3600000, district: 'Северный', addr: 'Северный мкр.', ll: [41.4300, 52.7505], near: ['ТЦ — 4 мин', 'Детсад во дворе', 'Парковка'] },
  { id: 3, type: 3, title: '3-комнатная у Цны', area: 82, floor: '3/5', price: 7900000, district: 'Набережная', addr: 'у набережной Цны', ll: [41.4720, 52.7170], near: ['Набережная — 2 мин', 'Парк — 5 мин', 'Тихий двор'] },
  { id: 4, type: 2, title: '2-комнатная в новостройке', area: 61, floor: '12/17', price: 6300000, district: 'Мичуринская', addr: 'ул. Мичуринская', ll: [41.4255, 52.7300], near: ['Новый дом', 'Подземный паркинг', 'Школа — 7 мин'] },
  { id: 5, type: 1, title: 'Студия для старта', area: 27, floor: '2/9', price: 2700000, district: 'Телевышка', addr: 'р-н Телевышки', ll: [41.4650, 52.7030], near: ['Остановка — 1 мин', 'Магазины', 'Подходит под ипотеку'] },
  { id: 6, type: 4, title: 'Дом 140 м² в Слободе', area: 140, floor: '2 эт.', price: 11500000, district: 'Пригород', addr: 'мкр. Слобода', ll: [41.4930, 52.7590], near: ['Участок 8 соток', 'Газ, вода', '10 мин до центра'] },
];
const OFFICE = { ll: [41.4588, 52.7206], title: 'Офис агентства' };
const TYPE = { 1: '1-комн.', 2: '2-комн.', 3: '3-комн.', 4: 'Дом' };
const HOUSE_SVG = '<svg viewBox="0 0 200 120"><rect x="20" y="40" width="70" height="80" fill="#9aa5b2"/><rect x="100" y="10" width="80" height="110" fill="#7d8896"/><g fill="#e8ecf0">' +
  Array.from({ length: 24 }, (_, i) => `<rect x="${108 + (i % 4) * 18}" y="${18 + Math.floor(i / 4) * 16}" width="10" height="9"/>`).join('') +
  Array.from({ length: 12 }, (_, i) => `<rect x="${28 + (i % 3) * 20}" y="${48 + Math.floor(i / 3) * 17}" width="11" height="9"/>`).join('') + '</g></svg>';

/* ---------- ипотека ---------- */
const monthly = (sum, ratePct, years) => { const r = ratePct / 100 / 12, n = years * 12; return r ? sum * r / (1 - Math.pow(1 + r, -n)) : sum / n; };
let rate = 6;
function calc() {
  const price = +$('#price').value, down = +$('#down').value, term = +$('#term').value;
  $('#vPrice').textContent = fmt(price) + ' ₽'; $('#vDown').textContent = down + '% · ' + fmt(price * down / 100) + ' ₽'; $('#vTerm').textContent = term + ' лет';
  const loan = price * (1 - down / 100), m = monthly(loan, rate, term);
  $('#pay').innerHTML = fmt(m) + ' <small>₽/мес</small>';
  $('#paySub').textContent = `Кредит ${fmt(loan)} ₽ под ${rate}% на ${term} лет · переплата ${fmt(m * term * 12 - loan)} ₽`;
}
['price', 'down', 'term'].forEach(id => $('#' + id).addEventListener('input', calc));
$('#prog').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; rate = +b.dataset.r; $('#prog').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); calc(); });
calc();

/* ---------- каталог ---------- */
let filter = 0;
$('#filters').innerHTML = [[0, 'Все'], [1, '1-комн. и студии'], [2, '2-комн.'], [3, '3-комн.'], [4, 'Дома']].map(([v, t]) => `<button type="button" data-f="${v}" aria-pressed="${v === 0}">${t}</button>`).join('');
$('#filters').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; filter = +b.dataset.f; $('#filters').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); renderGrid(); });
function renderGrid() {
  $('#grid').innerHTML = OBJ.filter(o => !filter || o.type === filter).map(o => `<article class="card" data-id="${o.id}"><div class="ph">${HOUSE_SVG}<span class="price">${mln(o.price)}</span></div><div class="in"><h3>${o.title}</h3><p>${o.district} · ${o.area} м² · ${o.floor}</p><p style="margin-top:6px">от ${fmt(monthly(o.price * .8, 6, 20))} ₽/мес в ипотеку</p></div></article>`).join('');
}
$('#grid').addEventListener('click', e => { const c = e.target.closest('.card'); if (!c) return; const o = OBJ.find(x => x.id === +c.dataset.id); scrollTo({ top: 0, behavior: still ? 'auto' : 'smooth' }); setTimeout(() => openObj(o), still ? 0 : 500); });
renderGrid();

/* ---------- карта ---------- */
const HOME = { center: [41.4560, 52.7255], zoom: 13.4, pitch: 58, bearing: -28 };
let map, spinning = !still, markers = {};
function initMap() {
  if (!window.maplibregl) return;
  map = new maplibregl.Map({ container: 'map', style: 'https://tiles.openfreemap.org/styles/positron', ...HOME, maxPitch: 75, attributionControl: { compact: true }, antialias: true });
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
  map.on('load', () => {
    for (const l of map.getStyle().layers) {
      if (l.layout && l.layout['text-field']) map.setLayoutProperty(l.id, 'text-field', ['coalesce', ['get', 'name:ru'], ['get', 'name']]);
    }
    if (map.getLayer('building')) map.setLayoutProperty('building', 'visibility', 'none');
    map.setPaintProperty('water', 'fill-color', '#b9cbdc');
    map.addLayer({ id: 'b3d', type: 'fill-extrusion', source: 'openmaptiles', 'source-layer': 'building', minzoom: 12,
      paint: {
        'fill-extrusion-color': ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 6], 0, '#e7eaee', 20, '#d5dbe2', 50, '#c3ccd6'],
        'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 12, 0, 13.2, ['coalesce', ['get', 'render_height'], 6]],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
        'fill-extrusion-opacity': 0.92 } });
    for (const o of OBJ) markers[o.id] = addPin(o.ll, `${TYPE[o.type]} · ${mln(o.price)}`, o.district, () => openObj(o));
    addPin(OFFICE.ll, 'Офис', 'агентства', () => map.flyTo({ center: OFFICE.ll, zoom: 17, pitch: 60, duration: 3000 }), 'office');
    if (spinning) requestAnimationFrame(spin);
  });
  ['mousedown', 'touchstart', 'wheel'].forEach(ev => map.on(ev, () => { spinning = false; }));
}
function addPin(ll, text, sub, onClick, cls = '') {
  const el = document.createElement('div'); el.className = 'pin ' + cls;
  el.innerHTML = `<div class="tag">${text}<small>${sub}</small></div>`;
  el.addEventListener('click', e => { e.stopPropagation(); onClick(); });
  return { el, m: new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat(ll).addTo(map) };
}
let lastT = 0;
function spin(t) { if (!spinning) return; if (lastT) map.setBearing(map.getBearing() + (t - lastT) * 0.0025); lastT = t; requestAnimationFrame(spin); }

function openObj(o) {
  spinning = false;
  Object.values(markers).forEach(p => p.el.classList.remove('on')); markers[o.id]?.el.classList.add('on');
  map?.flyTo({ center: o.ll, zoom: o.type === 4 ? 16.6 : 17.4, pitch: 64, bearing: (o.id * 47) % 360 - 180, duration: still ? 0 : 3800, essential: true });
  const m = monthly(o.price * .8, 6, 20);
  $('#panel').innerHTML = `<div class="ph">${HOUSE_SVG}<span class="price">${fmt(o.price)} ₽</span><button class="x" type="button" aria-label="Закрыть">✕</button></div>
    <div class="pb"><h3>${o.title}</h3><p class="mut" style="margin:0">${o.addr}, ${o.district} · пример объекта</p>
    <div class="facts"><div><b>${TYPE[o.type]}</b><span>комнат</span></div><div><b>${o.area} м²</b><span>площадь</span></div><div><b>${o.floor}</b><span>этаж</span></div></div>
    <div class="near">${o.near.map(n => `<span>${n}</span>`).join('')}</div>
    <div class="mini"><span class="mut" style="font-size:13px">Семейная ипотека 6%, взнос 20%, 20 лет</span><br><b>${fmt(m)} ₽/мес</b></div>
    <button class="btn dark" type="button" data-tour>Квартира в 3D →</button>
    <a class="btn" href="#contacts">Записаться на просмотр</a></div>`;
  $('#panel').classList.add('on'); $('#back').classList.add('on'); $('#hint').style.display = 'none'; $('.hero-card').classList.add('off');
  $('#panel .x').onclick = closeObj;
  $('#panel [data-tour]').onclick = () => openTour(o);
}
function closeObj() {
  $('#panel').classList.remove('on'); $('#back').classList.remove('on'); $('#hint').style.display = ''; $('.hero-card').classList.remove('off');
  Object.values(markers).forEach(p => p.el.classList.remove('on'));
  map?.flyTo({ ...HOME, duration: still ? 0 : 2600 });
}
$('#back').onclick = closeObj;
initMap();

/* ---------- 3D-квартира ---------- */
/* комнаты: x, z, ширина, глубина (м); door: сторона (t,b,l,r) и смещение центра проёма */
const PLANS = {
  1: [ { n: 'Кухня', k: 'kitchen', x: 0, z: 0, w: 3.4, d: 3.4, door: ['b', 1.7] },
       { n: 'Комната', k: 'living', x: 3.4, z: 0, w: 4.4, d: 5.4, door: ['l', 4.4] },
       { n: 'Прихожая', k: 'hall', x: 0, z: 3.4, w: 3.4, d: 2, open: true },
       { n: 'Санузел', k: 'bath', x: 0, z: 5.4, w: 2.2, d: 2, door: ['t', 1.1] } ],
  2: [ { n: 'Кухня', k: 'kitchen', x: 0, z: 0, w: 3.8, d: 3.4, door: ['b', 1.9] },
       { n: 'Гостиная', k: 'living', x: 3.8, z: 0, w: 4.4, d: 5.2, door: ['l', 4.3] },
       { n: 'Прихожая', k: 'hall', x: 0, z: 3.4, w: 3.8, d: 1.8, open: true },
       { n: 'Санузел', k: 'bath', x: 0, z: 5.2, w: 2, d: 2.4, door: ['t', 1] },
       { n: 'Спальня', k: 'bed', x: 2, z: 5.2, w: 6.2, d: 3.4, door: ['t', 1] } ],
  3: [ { n: 'Кухня', k: 'kitchen', x: 0, z: 0, w: 3.8, d: 3.6, door: ['b', 1.9] },
       { n: 'Гостиная', k: 'living', x: 3.8, z: 0, w: 5, d: 5.4, door: ['l', 4.5] },
       { n: 'Детская', k: 'bed', x: 8.8, z: 0, w: 3.4, d: 4.2, door: ['l', 3.3] },
       { n: 'Прихожая', k: 'hall', x: 0, z: 3.6, w: 3.8, d: 1.8, open: true },
       { n: 'Санузел', k: 'bath', x: 0, z: 5.4, w: 2.2, d: 2.6, door: ['t', 1.1] },
       { n: 'Спальня', k: 'bed', x: 2.2, z: 5.4, w: 6.6, d: 3.6, door: ['t', 0.9] } ],
};
PLANS[4] = PLANS[3];
const FLOOR = { kitchen: 0xd9d4cc, living: 0xc79d74, bed: 0xbf9670, hall: 0xb8a28a, bath: 0xdfe5ea };
let tour = null;

function openTour(o) {
  const box = $('#tour'); box.classList.add('on');
  $('#tourTitle').textContent = `${o.title} · ${o.area} м² · 3D-планировка (пример)`;
  if (tour) tour.dispose();
  tour = buildTour(PLANS[o.type], box);
}
$('#tourClose').onclick = () => { $('#tour').classList.remove('on'); tour?.dispose(); tour = null; };

function buildTour(plan, box) {
  const W = Math.max(...plan.map(r => r.x + r.w)), D = Math.max(...plan.map(r => r.z + r.d));
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  box.prepend(renderer.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0f1319);
  const cam = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.05, 200);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3f47, 1.6));
  const sun = new THREE.DirectionalLight(0xfff2dd, 2.2); sun.position.set(W, 12, -4); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12 }); scene.add(sun);
  const g = new THREE.Group(); g.position.set(-W / 2, 0, -D / 2); scene.add(g);
  const wallM = new THREE.MeshStandardMaterial({ color: 0xf4f1ec, roughness: .9, emissive: 0x2a2826 });
  scene.add(new THREE.AmbientLight(0xffffff, .9));
  const ceilM = new THREE.MeshStandardMaterial({ color: 0xfbfaf8, emissive: 0x3a3936, side: THREE.DoubleSide }); const ceils = [];
  const H = 2.7, T = 0.12;
  const box3 = (w, h, d, x, y, z, m) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = b.receiveShadow = true; g.add(b); return b; };
  const mat = c => new THREE.MeshStandardMaterial({ color: c, roughness: .7 });
  const outer = (r, side) => side === 't' ? r.z === 0 : side === 'l' ? r.x === 0 : side === 'r' ? Math.abs(r.x + r.w - W) < .01 : Math.abs(r.z + r.d - D) < .01;
  for (const r of plan) {
    box3(r.w, .04, r.d, r.x + r.w / 2, .02, r.z + r.d / 2, mat(FLOOR[r.k]));
    { const c = new THREE.Mesh(new THREE.PlaneGeometry(r.w, r.d), ceilM); c.rotation.x = Math.PI / 2; c.position.set(r.x + r.w / 2, H, r.z + r.d / 2); c.visible = false; g.add(c); ceils.push(c);
      const lamp = new THREE.PointLight(0xfff1dc, 6, 6, 1.6); lamp.position.set(r.x + r.w / 2, H - .3, r.z + r.d / 2); lamp.visible = false; g.add(lamp); ceils.push(lamp); }
    if (r.open) continue;
    for (const side of ['t', 'b', 'l', 'r']) {
      const horiz = side === 't' || side === 'b', len = horiz ? r.w : r.d;
      const fixed = side === 't' ? r.z : side === 'b' ? r.z + r.d : side === 'l' ? r.x : r.x + r.w;
      const segs = r.door && r.door[0] === side ? [[0, r.door[1] - .45], [r.door[1] + .45, len]] : [[0, len]];
      for (const [a, b] of segs) {
        if (b - a < .05) continue;
        const c = (a + b) / 2, L = b - a;
        if (horiz) box3(L, H, T, (side === 't' || side === 'b') ? r.x + c : 0, H / 2, fixed, wallM);
        else box3(T, H, L, fixed, H / 2, r.z + c, wallM);
      }
      if (outer(r, side) && ['living', 'bed', 'kitchen'].includes(r.k)) {   // окно
        const glass = new THREE.MeshStandardMaterial({ color: 0x9fc4e8, emissive: 0x6f9fd0, emissiveIntensity: .6, transparent: true, opacity: .85 });
        if (horiz) box3(Math.min(1.6, len - .6), 1.4, T + .02, r.x + len / 2, 1.5, fixed, glass);
        else box3(T + .02, 1.4, Math.min(1.6, len - .6), fixed, 1.5, r.z + len / 2, glass);
      }
    }
    furnish(r, box3, mat);
  }
  // подписи комнат
  const labels = plan.map(r => { const el = document.createElement('div'); el.className = 'lbl'; el.textContent = `${r.n} ${(r.w * r.d).toFixed(1).replace('.', ',')} м²`; box.append(el);
    return { el, p: new THREE.Vector3(r.x + r.w / 2 - W / 2, .3, r.z + r.d / 2 - D / 2) }; });

  // точки камеры: обзор + каждая комната
  const shots = [{ n: 'Обзор', pos: new THREE.Vector3(W * .15, Math.max(W, D) * 1.15, D * .95), look: new THREE.Vector3(0, 0, 0) }]
    .concat(plan.filter(r => !r.open).map(r => {
      const cx = r.x + r.w / 2 - W / 2, cz = r.z + r.d / 2 - D / 2;
      return { n: r.n, pos: new THREE.Vector3(cx - r.w * .32, 1.6, cz + r.d * .34), look: new THREE.Vector3(cx + r.w * .3, 1.1, cz - r.d * .3) };
    }));
  const rooms = $('#tourRooms');
  rooms.innerHTML = shots.map((s, i) => `<button type="button" data-i="${i}" aria-pressed="${i === 0}">${s.n}</button>`).join('') + '<button type="button" data-auto>▶ Пролёт</button>';
  let from = { pos: shots[0].pos.clone().add(new THREE.Vector3(6, 6, 6)), look: shots[0].look.clone() }, to = shots[0], t0 = performance.now(), dur = still ? 1 : 2200, auto = !still, idx = 0, autoTimer;
  const curPos = from.pos.clone(), curLook = from.look.clone();
  function go(i) { idx = i; from = { pos: curPos.clone(), look: curLook.clone() }; to = shots[i]; t0 = performance.now(); rooms.querySelectorAll('[data-i]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.i === i))); }
  rooms.onclick = e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.auto != null) { auto = true; go(1); return; } auto = false; go(+b.dataset.i); };
  const ease = k => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  let raf, alive = true;
  function loop(t) {
    if (!alive) return; raf = requestAnimationFrame(loop);
    const k = Math.min(1, (t - t0) / dur), e = ease(k);
    curPos.lerpVectors(from.pos, to.pos, e); curLook.lerpVectors(from.look, to.look, e);
    if (k >= 1 && idx === 0) { const a = t / 9000; curPos.x = Math.sin(a) * Math.max(W, D) * .5; curPos.z = Math.cos(a) * Math.max(W, D) * .95; }
    cam.position.copy(curPos); cam.lookAt(curLook);
    const inside = idx > 0 && k > .6; ceils.forEach(c => c.visible = inside);
    if (auto && k >= 1 && t - t0 > dur + 1600) go(idx + 1 >= shots.length ? 0 : idx + 1);
    renderer.render(scene, cam);
    for (const l of labels) { const v = l.p.clone().project(cam); l.el.style.display = idx === 0 && v.z < 1 ? '' : 'none'; l.el.style.left = (v.x + 1) / 2 * innerWidth + 'px'; l.el.style.top = (1 - v.y) / 2 * innerHeight + 'px'; }
  }
  raf = requestAnimationFrame(loop);
  if (auto) autoTimer = setTimeout(() => go(1), 2600);
  const onR = () => { renderer.setSize(innerWidth, innerHeight); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); };
  addEventListener('resize', onR);
  return { dispose() { alive = false; cancelAnimationFrame(raf); clearTimeout(autoTimer); removeEventListener('resize', onR); labels.forEach(l => l.el.remove()); renderer.dispose(); renderer.domElement.remove(); } };
}

function furnish(r, box3, mat) {
  const x = r.x, z = r.z, w = r.w, d = r.d;
  const wood = mat(0x8b6b4e), fab = mat(0x5f6f82), white = mat(0xf5f5f2), dark = mat(0x2b2f36);
  if (r.k === 'kitchen') { box3(w - .3, .9, .6, x + w / 2, .45, z + .4, white); box3(w - .3, .04, .62, x + w / 2, .92, z + .4, dark); box3(1.1, .75, .8, x + w / 2, .38, z + d / 2 + .3, wood); }
  if (r.k === 'living') { box3(2.2, .45, .9, x + w / 2, .23, z + d - .7, fab); box3(2.2, .45, .2, x + w / 2, .55, z + d - .3, fab); box3(1.6, .5, .4, x + w / 2, .25, z + .45, dark); box3(1.4, .8, .05, x + w / 2, 1.2, z + .2, dark); box3(2, .01, 1.4, x + w / 2, .05, z + d / 2 + .3, mat(0xb9b2a6)); }
  if (r.k === 'bed') { box3(1.7, .45, 2.1, x + w * .62, .23, z + d - 1.2, white); box3(1.7, .7, .1, x + w * .62, .45, z + d - .15, wood); box3(.6, .5, 2, x + w * .62 - 1.25, .25, z + d - 1.2, mat(0x7c8da3)); box3(1.8, 2.2, .6, x + .5 + .9, 1.1, z + .4, wood); }
  if (r.k === 'bath') { box3(.75, .55, 1.6, x + .45, .28, z + d / 2 + .2, white); box3(.5, .85, .45, x + w - .4, .43, z + d - .35, white); }
}

/* ---------- прочее ---------- */
document.querySelectorAll('[data-c="phone"]').forEach(e => e.textContent = CFG.phone);
$('#form').addEventListener('submit', e => { e.preventDefault(); const p = e.target.phone; if (p.value.replace(/\D/g, '').length < 10) { p.focus(); p.style.outline = '2px solid #e5484d'; return; } p.style.outline = ''; $('#ok').style.display = 'block'; e.target.querySelector('button').disabled = true; });
const io = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { threshold: .12 });
document.querySelectorAll('.rv').forEach(el => io.observe(el));
