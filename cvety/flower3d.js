/* 3D-букеты: цветы собираются процедурно (без моделей), букет — из конфигурации.
   Viewer — живая сцена с вращением; renderThumbs — картинки для каталога из одного общего рендерера. */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const TYPES = {
  rose:  { name: 'Розы', one: 'роза', price: 250, size: 1, colors: { 'красные': '#b3122e', 'розовые': '#e98fa3', 'белые': '#e9e3d6', 'кремовые': '#ecd3a8', 'бордовые': '#6e0f1f', 'персиковые': '#f2a07b', 'жёлтые': '#f2c84b' } },
  peony: { name: 'Пионы', one: 'пион', price: 450, size: 1.32, colors: { 'розовые': '#f0a6bb', 'белые': '#ece4d6', 'коралловые': '#f07f6b', 'бордовые': '#8a1530', 'кремовые': '#f1dcc0' } },
  tulip: { name: 'Тюльпаны', one: 'тюльпан', price: 150, size: 0.9, colors: { 'красные': '#d81f3a', 'розовые': '#f07d9a', 'жёлтые': '#f6c234', 'белые': '#ebe6da', 'сиреневые': '#a985d4', 'оранжевые': '#f2833a' } },
  daisy: { name: 'Ромашки', one: 'ромашка', price: 120, size: 0.85, colors: { 'белые': '#ffffff' } },
  euca:  { name: 'Эвкалипт', one: 'ветка эвкалипта', price: 200, size: 1, colors: { 'зелёный': '#8fa89a' } }
};
export const WRAPS = { kraft: ['Крафт', '#c49f6f', '#e7d4b0'], black: ['Чёрная', '#232220', '#3e3b37'], white: ['Белая', '#eeeae2', '#ffffff'], pink: ['Пудровая', '#e3b9bd', '#f5dfdf'] };
export const RIBBONS = { '#7a2e45': 'винная', '#f4f1ea': 'белая', '#2f4a35': 'зелёная', '#c9a24d': 'золотая', '#141414': 'чёрная' };
export const WRAP_PRICE = 300;

export function priceOf(cfg) { return cfg.items.reduce((s, i) => s + TYPES[i.t].price * i.n, 0) + WRAP_PRICE; }
export function describe(cfg) {
  const parts = cfg.items.filter(i => i.n > 0).map(i => { const T = TYPES[i.t], one = Object.keys(T.colors).length === 1; return `${one ? T.name : T.name + ' ' + i.c} ×${i.n}`; });
  const s = parts.join(', ');
  return (s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()) + `; упаковка ${WRAPS[cfg.wrap][0].toLowerCase()}, лента ${RIBBONS[cfg.ribbon] || ''}`;
}

/* ---------- лепесток: изогнутая пластина, основание в нуле, растёт вверх, края загнуты к центру цветка (−Z) ---------- */
function petal(w, len, cup, bend, tip = 0.5) {
  const g = new THREE.PlaneGeometry(w, len, 6, 9), p = g.attributes.position, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = Math.max(0, p.getY(i) + len / 2); const t = Math.min(1, y / len);
    x *= Math.sqrt(Math.max(0, Math.sin(Math.PI * (0.06 + (1 - tip * 0.12) * 0.86 * Math.pow(t, 0.8)))));
    const nx = x / (w / 2), z = -cup * nx * nx * w * 0.5;
    const a = bend * t * t, y2 = y * Math.cos(a) - z * Math.sin(a), z2 = y * Math.sin(a) + z * Math.cos(a);
    p.setXYZ(i, x, y2, z2);
    const k = 0.32 + 0.68 * Math.pow(t, 0.6); col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
function ringGeo(list, rnd) {
  const parts = [];
  for (const r of list) for (let k = 0; k < r.n; k++) {
    const g = petal(r.w, r.len, r.cup, r.bend, r.tip);
    g.rotateX(r.tilt + (rnd() - 0.5) * (r.jit || 0.1)); g.translate(0, r.y || 0, r.r); g.rotateY((k / r.n) * Math.PI * 2 + (r.off || 0) + (rnd() - 0.5) * 0.18);
    parts.push(g);
  }
  const m = mergeGeometries(parts); parts.forEach(g => g.dispose()); m.computeVertexNormals(); return m;
}
function srnd(seed) { let s = seed >>> 0 || 7; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }

const UNIT = {};
function unit(type) {
  if (UNIT[type]) return UNIT[type];
  const R = srnd(type.length * 977);
  let head;
  if (type === 'rose') head = ringGeo([
    { n: 3, w: .26, len: .26, cup: .9, bend: 0, tilt: .02, r: .015, off: 0, tip: .9 },
    { n: 5, w: .34, len: .33, cup: .75, bend: .15, tilt: .28, r: .04, off: .6 },
    { n: 6, w: .42, len: .38, cup: .6, bend: .55, tilt: .62, r: .07, off: .2 },
    { n: 7, w: .48, len: .4, cup: .45, bend: .95, tilt: 1.0, r: .09, off: .9 },
    { n: 7, w: .5, len: .38, cup: .3, bend: 1.15, tilt: 1.3, r: .1, off: .4 }], R);
  else if (type === 'peony') head = ringGeo([
    { n: 6, w: .3, len: .24, cup: 1, bend: .1, tilt: .1, r: .02, jit: .4 },
    { n: 9, w: .36, len: .3, cup: .9, bend: .2, tilt: .4, r: .05, off: .3, jit: .4 },
    { n: 11, w: .42, len: .34, cup: .8, bend: .3, tilt: .75, r: .08, off: .1, jit: .35 },
    { n: 12, w: .46, len: .36, cup: .7, bend: .5, tilt: 1.05, r: .1, off: .5, jit: .3 },
    { n: 10, w: .5, len: .36, cup: .55, bend: .7, tilt: 1.35, r: .12, off: .2, jit: .25 }], R);
  else if (type === 'tulip') head = ringGeo([
    { n: 3, w: .36, len: .56, cup: 1.1, bend: -.12, tilt: .07, r: .02, tip: .2 },
    { n: 3, w: .38, len: .58, cup: 1.0, bend: -.08, tilt: .16, r: .045, off: Math.PI / 3, tip: .2 }], R);
  else if (type === 'daisy') head = ringGeo([
    { n: 18, w: .085, len: .3, cup: .15, bend: .25, tilt: 1.42, r: .07, tip: .6 },
    { n: 14, w: .08, len: .26, cup: .2, bend: .2, tilt: 1.3, r: .06, off: .1, tip: .6 }], R);
  const extra = type === 'daisy' ? (() => { const s = new THREE.SphereGeometry(.1, 18, 10); s.scale(1, .55, 1); s.translate(0, .03, 0); return s; })() : null;
  UNIT[type] = { head, extra };
  return UNIT[type];
}
let EUCA = null;
function eucaGeo() {
  if (EUCA) return EUCA;
  const leaves = [], stem = new THREE.CylinderGeometry(.014, .02, 1.7, 6); stem.translate(0, .85, 0);
  for (let i = 0; i < 10; i++) {
    const y = .3 + i * .145, s = 1.35 - i * .07;
    for (const side of [-1, 1]) {
      const l = new THREE.CircleGeometry(.1 * s, 16); l.rotateY(side * Math.PI / 2 + (i % 2 ? .35 : -.35)); l.rotateZ(side * .35); l.translate(side * .08 * s, y, 0); leaves.push(l);
    }
  }
  EUCA = { leaves: mergeGeometries(leaves), stem };
  return EUCA;
}

/* ---------- материалы с кешем ---------- */
const MAT = {};
function mat(key, make) { return MAT[key] || (MAT[key] = make()); }
const petalMat = c => mat('p' + c, () => new THREE.MeshStandardMaterial({ color: c, vertexColors: true, side: THREE.DoubleSide, roughness: .55, metalness: 0, emissive: new THREE.Color(c).multiplyScalar(.04) }));
const stemMat = () => mat('stem', () => new THREE.MeshStandardMaterial({ color: '#4f6b3f', roughness: .7 }));
const eucaMat = () => mat('euca', () => new THREE.MeshStandardMaterial({ color: '#5f8473', side: THREE.DoubleSide, roughness: .75 }));
const yellowMat = () => mat('yel', () => new THREE.MeshStandardMaterial({ color: '#f2b81f', roughness: .9 }));
const paperMat = c => mat('w' + c, () => new THREE.MeshStandardMaterial({ color: c, side: THREE.DoubleSide, roughness: .92 }));
const ribbonMat = c => mat('r' + c, () => new THREE.MeshStandardMaterial({ color: c, roughness: .35, metalness: .05 }));

/* ---------- обёртка ---------- */
function wrapGeo(R, top, bottom, waves, phase, amp) {
  const seg = 72, rows = 18, pos = [], idx = [];
  for (let j = 0; j <= rows; j++) {
    const t = j / rows;
    for (let i = 0; i <= seg; i++) {
      const th = i / seg * Math.PI * 2;
      const r = (0.13 + (R - 0.13) * Math.pow(t, 1.25)) * (1 + 0.045 * Math.sin(16 * th + phase) * t);
      const y = bottom + (top - bottom) * t + (t > 0.7 ? amp * Math.sin(waves * th + phase) * (t - 0.7) / 0.3 : 0);
      pos.push(r * Math.cos(th), y, r * Math.sin(th));
    }
  }
  for (let j = 0; j < rows; j++) for (let i = 0; i < seg; i++) { const a = j * (seg + 1) + i, b = a + seg + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

/* ---------- букет ---------- */
export function buildBouquet(cfg, seed = 1) {
  const group = new THREE.Group(), own = [], heads = [];
  const R = srnd(seed * 31 + 5);
  const list = [];
  cfg.items.forEach(it => { if (it.t !== 'euca') for (let k = 0; k < it.n; k++) list.push({ t: it.t, c: TYPES[it.t].colors[it.c] || Object.values(TYPES[it.t].colors)[0] }); });
  const eucaN = cfg.items.filter(i => i.t === 'euca').reduce((s, i) => s + i.n, 0);
  list.forEach(f => f.k = TYPES[f.t].size + R() * 0.45);
  list.sort((a, b) => b.k - a.k);
  const avg = list.length ? list.reduce((s, f) => s + TYPES[f.t].size, 0) / list.length : 1;
  const c = 0.27 * avg, Hc = 2.1;
  let maxR = 0.35;
  const stems = [];
  list.forEach((f, i) => {
    const r = c * Math.sqrt(i + 0.35), a = i * 2.39996 + R() * 0.15;
    const x = r * Math.cos(a), z = r * Math.sin(a), y = Hc - 0.3 * r * r + (R() - 0.5) * 0.06;
    maxR = Math.max(maxR, r);
    const head = new THREE.Group(), u = unit(f.t), s = TYPES[f.t].size * 1.18 * (0.92 + R() * 0.16);
    const m = new THREE.Mesh(u.head, petalMat(f.c)); head.add(m);
    if (u.extra) head.add(new THREE.Mesh(u.extra, yellowMat()));
    head.position.set(x, y, z);
    const dir = new THREE.Vector3(x, y + 1.3, z).normalize();
    head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    head.rotateY(R() * Math.PI * 2);
    head.userData.s = s; head.scale.setScalar(s);
    group.add(head); heads.push(head);
    // стебель от цветка к узлу
    const from = new THREE.Vector3(x, y - 0.05, z), to = new THREE.Vector3(x * 0.08, -0.05, z * 0.08);
    const len = from.distanceTo(to), sg = new THREE.CylinderGeometry(0.018, 0.018, len, 5);
    sg.translate(0, len / 2, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), from.clone().sub(to).normalize());
    sg.applyQuaternion(q); sg.translate(to.x, to.y, to.z); stems.push(sg);
  });
  // эвкалипт по краю
  const E = eucaGeo(); let eR = 0;
  for (let k = 0; k < eucaN; k++) {
    const a = (k / Math.max(1, eucaN)) * Math.PI * 2 + 0.4, br = new THREE.Group();
    br.add(new THREE.Mesh(E.leaves, eucaMat()), new THREE.Mesh(E.stem, stemMat()));
    const fr = maxR, by = Hc - 0.3 * fr * fr - 0.25; br.position.set(Math.cos(a) * fr * 0.55, by, Math.sin(a) * fr * 0.55);
    br.rotation.set(0, -a + Math.PI / 2, 0); br.rotateZ(-1.1 - R() * 0.2); br.rotateY(R() * 0.6);
    br.userData.s = 1 + R() * 0.15; br.scale.setScalar(br.userData.s);
    group.add(br); heads.push(br);
    eR = Math.max(eR, fr * 0.55 + 1.7 * Math.sin(1.2) * br.userData.s * 0.45);
  }
  maxR = Math.max(maxR, eR * 0.8);
  const bundle = new THREE.CylinderGeometry(0.17, 0.12, 0.8, 10); bundle.translate(0, -0.45, 0); stems.push(bundle);
  const sm = mergeGeometries(stems); stems.forEach(g => g.dispose()); own.push(sm);
  group.add(new THREE.Mesh(sm, stemMat()));
  // упаковка: внешний лист и внутренний тонкий слой
  const W = WRAPS[cfg.wrap] || WRAPS.kraft, Rw = maxR * 1.02 + 0.32, top = Hc - 0.3 * maxR * maxR - 0.7;
  const g1 = wrapGeo(Rw, top, -0.85, 5, R() * 6, 0.18), g2 = wrapGeo(Rw * 0.93, top + 0.16, -0.7, 6, R() * 6 + 1, 0.13);
  own.push(g1, g2);
  group.add(new THREE.Mesh(g1, paperMat(W[1])), new THREE.Mesh(g2, paperMat(W[2])));
  // лента и бант
  const yr = -0.12, tr = (0.13 + (Rw - 0.13) * Math.pow((yr + 0.85) / (top + 0.85), 1.25)) + 0.02;
  const rib = new THREE.TorusGeometry(tr, 0.035, 8, 56); rib.rotateX(Math.PI / 2); rib.translate(0, yr, 0);
  const bow = [];
  for (const s of [-1, 1]) { const l = new THREE.TorusGeometry(0.12, 0.03, 8, 24); l.scale(1.35, 0.75, 0.6); l.rotateZ(s * 0.35); l.translate(s * 0.15, yr + 0.02, tr + 0.03); bow.push(l);
    const tail = new THREE.BoxGeometry(0.06, 0.42, 0.012); tail.rotateZ(s * 0.28); tail.translate(s * 0.07, yr - 0.24, tr + 0.04); bow.push(tail); }
  const knot = new THREE.SphereGeometry(0.05, 10, 8); knot.translate(0, yr, tr + 0.05); bow.push(knot);
  const rb = mergeGeometries([rib, ...bow]); [rib, ...bow].forEach(g => g.dispose()); own.push(rb);
  group.add(new THREE.Mesh(rb, ribbonMat(cfg.ribbon || '#7a2e45')));
  group.userData = { own, heads };
  return group;
}
function disposeBouquet(g) { if (g && g.userData.own) g.userData.own.forEach(x => x.dispose()); }

function fit(camera, group, margin = 1.12) {
  const box = new THREE.Box3().setFromObject(group), size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
  const h = Math.max(size.y, Math.max(size.x, size.z) / camera.aspect) * margin;
  const dist = h / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) + Math.max(size.x, size.z) * 0.5;
  const dir = new THREE.Vector3(0, 0.62, 1).normalize();
  camera.position.copy(ctr).addScaledVector(dir, dist); camera.lookAt(ctr); return { ctr, dist };
}
function setupScene(renderer) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.88; renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene(), pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.55; pm.dispose();
  const key = new THREE.DirectionalLight('#fff3e6', 1.6); key.position.set(3, 5, 4); scene.add(key);
  const rim = new THREE.DirectionalLight('#dfe9ff', 0.7); rim.position.set(-4, 2, -3); scene.add(rim);
  scene.add(new THREE.HemisphereLight('#ffffff', '#c9b99f', 0.5));
  return scene;
}

/* ---------- живая сцена ---------- */
export class Viewer {
  constructor(canvas, { auto = true } = {}) {
    this.canvas = canvas; this.auto = auto;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.scene = setupScene(this.renderer);
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    this.holder = new THREE.Group(); this.scene.add(this.holder);
    this.rot = 0.5; this.vel = 0; this.drag = null; this.visible = true; this.anim = []; this.sig = '';
    this.seed = 1;
    const ro = new ResizeObserver(() => this.resize()); ro.observe(canvas); this.resize();
    new IntersectionObserver(e => { this.visible = e[0].isIntersecting; }).observe(canvas);
    canvas.addEventListener('pointerdown', e => { this.drag = { x: e.clientX, r: this.rot }; this.vel = 0; this.last = e.clientX; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', e => { if (!this.drag) return; this.rot = this.drag.r + (e.clientX - this.drag.x) * 0.01; this.vel = (e.clientX - this.last) * 0.01; this.last = e.clientX; });
    const up = () => { this.drag = null; this.idle = performance.now(); }; canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    this.idle = 0; this.clock = new THREE.Clock();
    const loop = () => { requestAnimationFrame(loop); if (this.visible) this.frame(); }; loop();
  }
  resize() { const w = this.canvas.clientWidth, h = this.canvas.clientHeight; if (!w || !h) return; this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); if (this.group) fit(this.camera, this.group); }
  set(cfg) {
    const sig = JSON.stringify(cfg.items), pop = sig !== this.sig; this.sig = sig;
    if (this.group) { this.holder.remove(this.group); disposeBouquet(this.group); }
    this.group = buildBouquet(cfg, this.seed); this.holder.add(this.group); fit(this.camera, this.group);
    if (pop && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const t0 = performance.now();
      this.group.userData.heads.forEach((h, i) => { h.scale.setScalar(0.001); this.anim.push({ h, t: t0 + i * 22, s: h.userData.s }); });
    }
  }
  frame() {
    const dt = Math.min(0.05, this.clock.getDelta()), now = performance.now();
    if (!this.drag) { this.rot += this.vel; this.vel *= 0.93; if (this.auto && now - this.idle > 1800) this.rot += dt * 0.35; }
    this.holder.rotation.y = this.rot;
    if (this.anim.length) this.anim = this.anim.filter(a => { const k = Math.min(1, Math.max(0, (now - a.t) / 380)); const e = 1 - Math.pow(1 - k, 3) + Math.sin(k * Math.PI) * 0.12; a.h.scale.setScalar(Math.max(0.001, a.s * e)); return k < 1; });
    this.renderer.render(this.scene, this.camera);
  }
}

/* ---------- картинки для каталога ---------- */
let TR = null;
export function renderThumbs(cfgs, size = 520) {
  if (!TR) {
    const canvas = document.createElement('canvas');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1); renderer.setSize(size, Math.round(size * 1.05), false);
    TR = { renderer, scene: setupScene(renderer), camera: new THREE.PerspectiveCamera(30, 1 / 1.05, 0.1, 100) };
  }
  const out = [];
  cfgs.forEach((cfg, i) => {
    const g = buildBouquet(cfg, i + 3); g.rotation.y = 0.5; TR.scene.add(g); fit(TR.camera, g, 1.04);
    TR.renderer.render(TR.scene, TR.camera); out.push(TR.renderer.domElement.toDataURL('image/webp', 0.86));
    TR.scene.remove(g); disposeBouquet(g);
  });
  return out;
}

/* ---------- букет из фразы: «15 красных роз и 5 белых пионов в чёрной упаковке» ---------- */
const NUMW = { 'один': 1, 'одна': 1, 'одну': 1, 'два': 2, 'две': 2, 'три': 3, 'четыре': 4, 'пять': 5, 'шесть': 6, 'семь': 7, 'восемь': 8, 'девять': 9, 'десять': 10, 'одиннадцать': 11, 'тринадцать': 13, 'пятнадцать': 15, 'семнадцать': 17, 'девятнадцать': 19, 'двадцать': 20, 'двадцать один': 21, 'двадцать одну': 21, 'двадцать пять': 25, 'тридцать': 30, 'пятьдесят один': 51 };
const TYPE_RX = [['rose', /роз/], ['peony', /пион/], ['tulip', /тюльпан/], ['daisy', /ромаш/], ['euca', /эвкалипт|зелен/]];
const COLOR_RX = [['красные', /красн|алы/], ['бордовые', /бордов|винн/], ['розовые', /розов/], ['белые', /бел/], ['кремовые', /крем|молочн/], ['персиковые', /персик/], ['жёлтые', /ж[её]лт/], ['коралловые', /коралл/], ['сиреневые', /сирен|лилов|фиолет/], ['оранжевые', /оранж/]];
export function parsePhrase(text, base) {
  let s = ' ' + text.toLowerCase().replace(/ё/g, 'е') + ' ';
  const cfg = { items: [], wrap: base?.wrap || 'kraft', ribbon: base?.ribbon || '#7a2e45' };
  const wm = s.match(/(черн|бел|розов|пудр|крафт)\S*\s+(упаков|бумаг|обертк|плен)\S*/) || s.match(/(крафт)\S*/);
  if (wm) { cfg.wrap = { черн: 'black', бел: 'white', розов: 'pink', пудр: 'pink', крафт: 'kraft' }[wm[1]]; s = s.replace(wm[0], ' '); }
  const rm = s.match(/(\S+)\s+лент\S*/);
  if (rm) { const map = { винн: '#7a2e45', бордов: '#7a2e45', бел: '#f4f1ea', зелен: '#2f4a35', золот: '#c9a24d', черн: '#141414' }; const k = Object.keys(map).find(k => rm[1].startsWith(k)); if (k) cfg.ribbon = map[k]; s = s.replace(rm[0], ' '); }
  for (const [w, n] of Object.entries(NUMW).sort((a, b) => b[0].length - a[0].length)) s = s.replace(new RegExp('(^|\\s)' + w + '(?=\\s)', 'g'), ' ' + n + ' ');
  let lastType = null;
  for (const chunk of s.split(/,|;|\+|\sи\s|\sплюс\s|\sс\s/)) {
    const t = (TYPE_RX.find(([, rx]) => rx.test(chunk)) || [])[0] || (/(\d+)/.test(chunk) || COLOR_RX.some(([, rx]) => rx.test(chunk)) ? lastType : null);
    if (!t) continue; lastType = t;
    const num = chunk.match(/(\d+)/), n = Math.min(51, num ? +num[1] : (t === 'euca' ? 3 : 5));
    const cName = (COLOR_RX.find(([, rx]) => rx.test(chunk)) || [])[0];
    const pal = Object.keys(TYPES[t].colors), c = pal.includes(cName) ? cName : pal[0];
    const ex = cfg.items.find(i => i.t === t && i.c === c); if (ex) ex.n = Math.min(51, ex.n + n); else cfg.items.push({ t, c, n });
  }
  let total = cfg.items.reduce((a, i) => a + i.n, 0);
  while (total > 61) { const big = cfg.items.reduce((a, b) => (b.n > a.n ? b : a)); big.n--; total--; }
  return cfg;
}
