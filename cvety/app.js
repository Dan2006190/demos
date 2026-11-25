import { TYPES, WRAPS, RIBBONS, priceOf, describe, parsePhrase } from './flower3d.js';

const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const nf = new Intl.NumberFormat('ru-RU'), rub = n => nf.format(n) + ' ₽';
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const WA = '70000000000'; // условный номер демо
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem('cvety_' + k)) ?? d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('cvety_' + k, JSON.stringify(v)); } catch (e) { } }
};
const clone = o => JSON.parse(JSON.stringify(o));

/* ---------- каталог: каждый букет — конфигурация 3D ---------- */
const ITEMS = [
  { id: 1, n: 'Нежность', f: ['love', 'mom'], tag: 'Хит', pal: 'blush', k: 'rose', cfg: { items: [{ t: 'rose', c: 'розовые', n: 9 }, { t: 'peony', c: 'розовые', n: 3 }, { t: 'euca', c: 'зелёный', n: 3 }], wrap: 'pink', ribbon: '#7a2e45' } },
  { id: 2, n: 'Классика', f: ['love'], pal: 'ruby', k: 'rose', cfg: { items: [{ t: 'rose', c: 'красные', n: 25 }], wrap: 'black', ribbon: '#141414' } },
  { id: 3, n: 'Сливки', f: ['mom', 'love'], tag: 'Сезон', pal: 'cream', k: 'peony', cfg: { items: [{ t: 'peony', c: 'белые', n: 5 }, { t: 'peony', c: 'кремовые', n: 2 }, { t: 'euca', c: 'зелёный', n: 3 }], wrap: 'white', ribbon: '#c9a24d' } },
  { id: 4, n: 'Закат', f: ['mom', 'work'], pal: 'sunset', k: 'mix', cfg: { items: [{ t: 'rose', c: 'персиковые', n: 7 }, { t: 'tulip', c: 'оранжевые', n: 7 }, { t: 'peony', c: 'коралловые', n: 2 }, { t: 'euca', c: 'зелёный', n: 2 }], wrap: 'kraft', ribbon: '#7a2e45' } },
  { id: 5, n: 'Лаванда', f: ['love', 'mom'], pal: 'lilac', k: 'tulip', cfg: { items: [{ t: 'tulip', c: 'сиреневые', n: 11 }, { t: 'peony', c: 'белые', n: 2 }, { t: 'euca', c: 'зелёный', n: 3 }], wrap: 'white', ribbon: '#2f4a35' } },
  { id: 6, n: 'Весна', f: ['mom', 'work', 'cheap'], tag: 'До 3 000', pal: 'tulip', k: 'tulip', cfg: { items: [{ t: 'tulip', c: 'красные', n: 5 }, { t: 'tulip', c: 'жёлтые', n: 5 }, { t: 'tulip', c: 'розовые', n: 5 }], wrap: 'kraft', ribbon: '#2f4a35' } },
  { id: 7, n: 'Поле', f: ['work', 'cheap'], pal: 'blush', k: 'wild', cfg: { items: [{ t: 'daisy', c: 'белые', n: 11 }, { t: 'tulip', c: 'жёлтые', n: 3 }], wrap: 'kraft', ribbon: '#c9a24d' } },
  { id: 8, n: 'Белая классика', f: ['work', 'mom'], pal: 'mono', k: 'rose', cfg: { items: [{ t: 'rose', c: 'белые', n: 15 }, { t: 'euca', c: 'зелёный', n: 4 }], wrap: 'white', ribbon: '#2f4a35' } }
];
ITEMS.forEach(i => { i.p = priceOf(i.cfg); i.d = describe(i.cfg).split(';')[0]; });
let custom = store.get('custom', {});
const item = id => ITEMS.find(x => x.id == id) || custom[id];
const thumbs = {};
const art = i => thumbs[i.id] ? `<img src="${thumbs[i.id]}" alt="">` : bouquetSVG((+String(i.id).replace(/\D/g, '') || 1) * 7, i.pal || 'blush', i.k || 'mix');

$('#hb1').innerHTML = art(ITEMS[0]); $('#hb2').innerHTML = art(ITEMS[2]); $('#hb3').innerHTML = art(ITEMS[3]);

let filter = 'all';
function drawGrid() {
  const list = ITEMS.filter(i => filter === 'all' || i.f.includes(filter) || (filter === 'cheap' && i.p <= 3000));
  $('#grid').innerHTML = list.map(i => `<article class="card">${i.tag ? `<span class="tag">${esc(i.tag)}</span>` : ''}<div class="art">${art(i)}</div><div class="bd"><h3>${esc(i.n)}</h3><div class="ds">${esc(i.d)}</div><button class="edit" type="button" data-edit="${i.id}">Изменить в конструкторе →</button><div class="row"><span class="pr">${rub(i.p)}</span><button class="add" type="button" data-add="${i.id}" aria-label="В корзину: ${esc(i.n)}">+</button></div></div></article>`).join('');
}
$('#filters').addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return; filter = b.dataset.f; $$('#filters .chip').forEach(x => x.setAttribute('aria-pressed', x === b)); drawGrid(); });
drawGrid();

/* ---------- корзина ---------- */
let cart = store.get('cart', {});
Object.keys(cart).forEach(id => { if (!item(id)) delete cart[id]; });
function drawCart() {
  const ids = Object.keys(cart).filter(id => cart[id] > 0);
  $('#cartN').textContent = ids.reduce((s, id) => s + cart[id], 0);
  $('#lines').innerHTML = ids.length ? ids.map(id => { const i = item(id); return `<div class="ln"><div class="mi">${art(i)}</div><div class="nm">${esc(i.n)}<span>${rub(i.p)}</span></div><div class="qty"><button type="button" data-q="${id}" data-d="-1">−</button><b>${cart[id]}</b><button type="button" data-q="${id}" data-d="1">+</button></div></div>`; }).join('') : '<p style="color:var(--mut)">Пока пусто. Выберите букет в каталоге или соберите свой.</p>';
  $('#tot').textContent = rub(ids.reduce((s, id) => s + item(id).p * cart[id], 0));
  store.set('cart', cart);
}
function add(id, open) { cart[id] = (cart[id] || 0) + 1; drawCart(); toast('Добавили в корзину'); if (open) openCart(); }
const openCart = () => { $('#drawer').classList.add('on'); $('#drawer').setAttribute('aria-hidden', 'false'); };
const closeCart = () => { $('#drawer').classList.remove('on'); $('#drawer').setAttribute('aria-hidden', 'true'); };
document.addEventListener('click', e => {
  const a = e.target.closest('[data-add]'); if (a) { add(a.dataset.add); a.classList.add('ok'); a.textContent = '✓'; setTimeout(() => { a.classList.remove('ok'); a.textContent = '+'; }, 900); }
  const q = e.target.closest('[data-q]'); if (q) { cart[q.dataset.q] = Math.max(0, (cart[q.dataset.q] || 0) + +q.dataset.d); drawCart(); }
  if (e.target.closest('[data-close]')) closeCart();
  const o = e.target.closest('[data-order]'); if (o) { e.preventDefault(); add(o.dataset.order, true); }
  const ed = e.target.closest('[data-edit]'); if (ed) { setCfg(clone(item(ed.dataset.edit).cfg)); $('#build').scrollIntoView({ behavior: 'smooth' }); }
});
$('#cartBtn').onclick = openCart;
$('#od').valueAsDate = new Date();
$('#order').onclick = () => {
  const ids = Object.keys(cart).filter(id => cart[id] > 0);
  if (!ids.length) return toast('Корзина пуста');
  const lines = ids.map(id => { const i = item(id); return `${i.n}${i.custom ? ' (' + i.d + ')' : ''} × ${cart[id]} — ${rub(i.p * cart[id])}`; });
  const sum = ids.reduce((s, id) => s + item(id).p * cart[id], 0);
  const src = sessionStorage.getItem('cvety_src') || (location.hash === '#r' ? 'напоминание' : 'сайт');
  const txt = `Здравствуйте! Хочу заказать:\n${lines.join('\n')}\nИтого: ${rub(sum)}\nАдрес: ${$('#oa').value || '—'}\nДата: ${$('#od').value} ${$('#ot').value}\nОткрытка: ${$('#oc').value || '—'}\nОткуда: ${src}`;
  const orders = store.get('orders', []); orders.unshift({ t: Date.now(), items: lines, sum, addr: $('#oa').value, when: $('#od').value + ' ' + $('#ot').value, src }); store.set('orders', orders);
  window.open('https://wa.me/' + WA + '?text=' + encodeURIComponent(txt), '_blank', 'noopener');
  cart = {}; drawCart(); closeCart(); toast('Заказ отправлен. В демо он появился в панели магазина');
};
drawCart();

/* ---------- конструктор ---------- */
let cfg = clone(ITEMS[0].cfg), viewer = null, pend = 0;
function setCfg(c) { cfg = c; drawBuilder(); queue(); }
function queue() { clearTimeout(pend); pend = setTimeout(() => viewer && viewer.set(cfg), 90); }
function drawBuilder() {
  $('#rows').innerHTML = cfg.items.map((it, k) => {
    const T = TYPES[it.t], cols = Object.entries(T.colors);
    return `<div class="brow" data-r="${k}"><div class="nm">${esc(T.name)}${cols.length > 1 ? ' · ' + esc(it.c) : ''}<small>${rub(T.price)} за шт.</small></div>
      <div class="qty"><button type="button" data-n="-1" aria-label="Меньше">−</button><b>${it.n}</b><button type="button" data-n="1" aria-label="Больше">+</button></div>
      <button class="del" type="button" data-rm aria-label="Убрать">×</button>
      ${cols.length > 1 ? `<div class="cols">${cols.map(([nm, hex]) => `<button class="dot" type="button" data-c="${esc(nm)}" title="${esc(nm)}" aria-label="${esc(nm)}" aria-pressed="${nm === it.c}" style="background:${hex}"></button>`).join('')}</div>` : ''}</div>`;
  }).join('') || '<p style="color:var(--mut);font-size:14px">Добавьте цветы кнопками ниже или опишите букет словами.</p>';
  $('#addt').innerHTML = Object.entries(TYPES).map(([t, T]) => `<button type="button" data-t="${t}">+ ${esc(T.name)}</button>`).join('');
  $('#wraps').innerHTML = Object.entries(WRAPS).map(([k, [nm, c1]]) => `<button type="button" data-w="${k}" aria-pressed="${cfg.wrap === k}"><i style="background:${c1}"></i>${esc(nm)}</button>`).join('');
  $('#ribs').innerHTML = Object.entries(RIBBONS).map(([hex, nm]) => `<button type="button" data-rb="${hex}" aria-pressed="${cfg.ribbon === hex}"><i style="background:${hex}"></i>${esc(nm)}</button>`).join('');
  const n = cfg.items.reduce((s, i) => s + i.n, 0);
  $('#bsum').textContent = rub(priceOf(cfg)); $('#bcnt').textContent = n ? `${n} шт. · упаковка ${rub(300)}` : '';
}
$('#build').addEventListener('click', e => {
  const r = e.target.closest('[data-r]'), k = r ? +r.dataset.r : -1;
  const nb = e.target.closest('[data-n]'); if (nb && r) { const it = cfg.items[k]; it.n = Math.max(1, Math.min(51, it.n + +nb.dataset.n)); return setCfg(cfg); }
  if (e.target.closest('[data-rm]') && r) { cfg.items.splice(k, 1); return setCfg(cfg); }
  const cb = e.target.closest('[data-c]'); if (cb && r) { const it = cfg.items[k], ex = cfg.items.find((x, j) => j !== k && x.t === it.t && x.c === cb.dataset.c); if (ex) { ex.n = Math.min(51, ex.n + it.n); cfg.items.splice(k, 1); } else it.c = cb.dataset.c; return setCfg(cfg); }
  const tb = e.target.closest('[data-t]'); if (tb) { const t = tb.dataset.t, c = Object.keys(TYPES[t].colors)[0], ex = cfg.items.find(x => x.t === t && x.c === c); if (ex) ex.n = Math.min(51, ex.n + (t === 'euca' ? 1 : 3)); else cfg.items.push({ t, c, n: t === 'euca' ? 3 : 5 }); return setCfg(cfg); }
  const wb = e.target.closest('[data-w]'); if (wb) { cfg.wrap = wb.dataset.w; return setCfg(cfg); }
  const rb = e.target.closest('[data-rb]'); if (rb) { cfg.ribbon = rb.dataset.rb; return setCfg(cfg); }
  const xb = e.target.closest('#ex button'); if (xb) { $('#say').value = xb.textContent; return sayGo(); }
});
function sayGo() {
  const c = parsePhrase($('#say').value, cfg);
  if (!c.items.length) return toast('Не понял состав. Пример: «9 розовых роз и 3 пиона»');
  setCfg(c); toast('Собрали: ' + describe(c).split(';')[0]);
}
$('#sayF').addEventListener('submit', e => { e.preventDefault(); sayGo(); });
$('#bAdd').onclick = () => {
  if (!cfg.items.length) return toast('Сначала добавьте цветы');
  const id = 'c' + Date.now().toString(36), it = { id, n: 'Свой букет', d: describe(cfg), p: priceOf(cfg), cfg: clone(cfg), custom: true, pal: 'blush', k: 'mix' };
  custom[id] = it; store.set('custom', custom);
  import('./flower3d.js').then(F => { try { thumbs[id] = F.renderThumbs([cfg], 240)[0]; drawCart(); } catch (e) { } });
  add(id, true);
};
drawBuilder();

/* ---------- 3D: живая сцена, герой и картинки каталога ---------- */
(async () => {
  let F; try { F = await import('./flower3d.js'); } catch (e) { $('#nogl').hidden = false; return; }
  try {
    viewer = new F.Viewer($('#bldCv')); viewer.set(cfg);
    const hero = new F.Viewer($('#heroCv')); hero.set(ITEMS[0].cfg);
    document.body.classList.add('has3d');
    const imgs = F.renderThumbs(ITEMS.map(i => i.cfg));
    ITEMS.forEach((i, k) => thumbs[i.id] = imgs[k]);
    Object.values(custom).forEach(c => { try { thumbs[c.id] = F.renderThumbs([c.cfg], 240)[0]; } catch (e) { } });
    drawGrid(); drawCart(); drawCal(read());
  } catch (e) { $('#nogl').hidden = false; console.warn(e); }
})();

/* ---------- важные даты ---------- */
const ROLES = ['Жена', 'Девушка', 'Мама', 'Тёща', 'Свекровь', 'Дочь', 'Сестра', 'Бабушка', 'Коллега', 'Другое'];
const OCC = ['День рождения', 'Годовщина', 'Именины', 'Другое'];
const LIKES = ['розы', 'пионы', 'тюльпаны', 'полевые', 'не знаю'];
const LIKE_T = { 'розы': 'rose', 'пионы': 'peony', 'тюльпаны': 'tulip', 'полевые': 'daisy' };
const BUD = [['до 3 000 ₽', 3000], ['3–5 тыс.', 5000], ['5–8 тыс.', 8000], ['от 8 тыс.', 99999]];
const MON = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
let pid = 0;
function personRow(p = {}) {
  const i = pid++, sel = (arr, v) => arr.map(x => `<option${x === v ? ' selected' : ''}>${x}</option>`).join('');
  const d = document.createElement('div'); d.className = 'prs'; d.dataset.i = i;
  d.innerHTML = `<div class="top"><span>Человек</span><button type="button" class="del" data-del>Убрать</button></div>
    <div class="two"><div class="fld"><label>Кто вам</label><select data-k="role">${sel(ROLES, p.role || 'Мама')}</select></div><div class="fld"><label>Имя</label><input data-k="name" placeholder="Например, Тамара" value="${esc(p.name || '')}"></div></div>
    <div class="two"><div class="fld"><label>Повод</label><select data-k="occ">${sel(OCC, p.occ || 'День рождения')}</select></div><div class="fld"><label>Дата</label><div class="two" style="gap:6px"><select data-k="day">${Array.from({ length: 31 }, (_, k) => `<option${k + 1 === (p.day || 0) ? ' selected' : ''}>${k + 1}</option>`).join('')}</select><select data-k="mon">${MON.map((m, k) => `<option value="${k}"${k === p.mon ? ' selected' : ''}>${m}</option>`).join('')}</select></div></div></div>
    <div class="fld"><span class="lbl">Что любит</span><div class="opts">${LIKES.map(l => `<label><input type="radio" name="lk${i}" value="${l}"${(p.like || 'не знаю') === l ? ' checked' : ''}><span>${l}</span></label>`).join('')}</div></div>
    <div class="fld"><span class="lbl">Бюджет</span><div class="opts">${BUD.map(([t], k) => `<label><input type="radio" name="bd${i}" value="${k}"${(p.bud ?? 1) === k ? ' checked' : ''}><span>${t}</span></label>`).join('')}</div></div>`;
  $('#people').appendChild(d);
}
const saved = store.get('dates', null);
if (saved && saved.people && saved.people.length) { $('#dn').value = saved.name || ''; $('#dp').value = saved.phone || ''; saved.people.forEach(personRow); }
else { const t3 = new Date(Date.now() + 3 * 864e5); personRow({ role: 'Тёща', name: 'Тамара', occ: 'День рождения', day: t3.getDate(), mon: t3.getMonth(), like: 'пионы', bud: 2 }); personRow({ role: 'Жена', name: 'Аня', occ: 'Годовщина', day: 14, mon: 1, like: 'розы', bud: 2 }); }
$('#addp').onclick = () => personRow();
$('#people').addEventListener('click', e => { if (e.target.closest('[data-del]')) e.target.closest('.prs').remove(); });
function next(day, mon) {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  let d = new Date(now.getFullYear(), mon, Math.min(day, new Date(now.getFullYear(), mon + 1, 0).getDate()));
  if (d < now) d = new Date(now.getFullYear() + 1, mon, Math.min(day, new Date(now.getFullYear() + 1, mon + 1, 0).getDate()));
  return { d, left: Math.round((d - now) / 864e5) };
}
function pick(like, bud) {
  const max = BUD[bud][1], t = LIKE_T[like];
  const ok = ITEMS.filter(i => i.p <= max && (!t || i.cfg.items.some(x => x.t === t)));
  return (ok.length ? ok : ITEMS.filter(i => i.p <= max)).sort((a, b) => b.p - a.p)[0] || ITEMS[6];
}
function read() {
  return $$('#people .prs').map(r => {
    const g = k => r.querySelector(`[data-k="${k}"]`).value, i = r.dataset.i;
    return { role: g('role'), name: g('name').trim(), occ: g('occ'), day: +g('day'), mon: +g('mon'), like: (r.querySelector(`[name="lk${i}"]:checked`) || {}).value || 'не знаю', bud: +((r.querySelector(`[name="bd${i}"]:checked`) || {}).value || 1) };
  });
}
const GEN = { 'жена': 'жены', 'девушка': 'девушки', 'мама': 'мамы', 'тёща': 'тёщи', 'свекровь': 'свекрови', 'дочь': 'дочери', 'сестра': 'сестры', 'бабушка': 'бабушки', 'коллега': 'коллеги' };
const who = p => (p.role === 'Другое' ? '' : GEN[p.role.toLowerCase()] || p.role.toLowerCase()) + (p.name ? ` (${p.name})` : '');
const occG = o => ({ 'День рождения': 'День рождения', 'Годовщина': 'Годовщина', 'Именины': 'Именины', 'Другое': 'Важная дата' }[o]);
function drawCal(list) {
  const evs = list.map(p => ({ p, ...next(p.day, p.mon) })).sort((a, b) => a.left - b.left);
  $('#evs').innerHTML = evs.length ? evs.map(({ p, d, left }) => `<div class="ev"><div class="d"><b>${d.getDate()}</b><span>${MON[d.getMonth()].slice(0, 3)}</span></div><div class="t"><b>${esc(occG(p.occ))}</b> — ${esc(who(p))}<br><span style="color:#b9cdb2">любит ${esc(p.like)} · бюджет ${BUD[p.bud][0]}</span></div><span class="left">${left === 0 ? 'сегодня' : 'через ' + left + ' дн.'}</span></div>`).join('') : '<p class="empty">Пока пусто — заполните анкету справа.</p>';
  const scr = $('#scr'); scr.innerHTML = '<div class="ttl">Цветы «Пример» · бот</div>';
  if (!evs.length) return;
  const { p, d } = evs[0], it = pick(p.like, p.bud), dd = `${d.getDate()} ${MON[d.getMonth()]}`;
  const msgs = [
    [7, `Через неделю, ${dd}, — ${occG(p.occ).toLowerCase()} ${esc(who(p))}. Любит ${esc(p.like === 'не знаю' ? 'красивые букеты' : p.like)}. Подобрали: «${it.n}», ${rub(it.p)}.`],
    [3, `Напоминаем: через 3 дня ${occG(p.occ).toLowerCase()} ${esc(who(p))}. Закажите сейчас — привезём ${dd} к нужному времени.`],
    [0, `Сегодня ${occG(p.occ).toLowerCase()} ${esc(who(p))} 🌸 Ещё успеваем: доставка за 2 часа.`]
  ];
  msgs.forEach(([n, t], k) => setTimeout(() => {
    const m = document.createElement('div'); m.className = 'msg';
    m.innerHTML = `${k === 0 && thumbs[it.id] ? `<img src="${thumbs[it.id]}" alt="" style="width:100%;border-radius:10px;background:#f3ece1;margin-bottom:6px">` : ''}${t}<a class="mb" href="#r" data-order="${it.id}">Заказать «${esc(it.n)}» · ${rub(it.p)}</a><small>${n ? 'за ' + n + ' дн. до даты' : 'утром в день даты'}</small>`;
    scr.appendChild(m);
  }, 350 * k));
}
$('#dform').addEventListener('submit', e => {
  e.preventDefault();
  const list = read().filter(p => p.day && p.mon >= 0);
  if (!$('#agree').checked || !list.length) { $('#derr').style.display = 'block'; return; }
  $('#derr').style.display = 'none';
  const rec = { name: $('#dn').value.trim(), phone: $('#dp').value.trim(), ch: ($('#ch input:checked') || {}).value, people: list, t: Date.now() };
  store.set('dates', rec);
  const all = store.get('clients', []); all.unshift(rec); store.set('clients', all.slice(0, 50));
  drawCal(list); toast('Сохранили. Напомним за 7 дней, за 3 дня и утром');
  document.querySelector('.cal').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
drawCal(read());

$('#pdl').onclick = e => { e.preventDefault(); $('#pd').classList.add('on'); };
$('#pd').addEventListener('click', e => { if (e.target === e.currentTarget || e.target.closest('[data-mclose]')) $('#pd').classList.remove('on'); });
const sp = new URLSearchParams(location.search).get('src'); if (sp) sessionStorage.setItem('cvety_src', { qr: 'QR на открытке', avito: 'Авито', maps: 'Карты' }[sp] || sp);
let tt; function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => el.classList.remove('on'), 2600); }
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeCart(); $('#pd').classList.remove('on'); } });
