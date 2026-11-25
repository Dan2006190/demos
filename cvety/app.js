(function () {
  'use strict';
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const nf = new Intl.NumberFormat('ru-RU'), rub = n => nf.format(n) + ' ₽';
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const WA = '70000000000'; // условный номер демо
  const store = {
    get(k, d) { try { return JSON.parse(localStorage.getItem('cvety_' + k)) ?? d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('cvety_' + k, JSON.stringify(v)); } catch (e) { } }
  };

  const ITEMS = [
    { id: 1, n: 'Нежность', d: '15 пионовидных роз, эвкалипт', p: 4900, pal: 'blush', k: 'rose', like: ['розы'], f: ['love', 'mom'], tag: 'Хит' },
    { id: 2, n: 'Классика', d: '25 красных роз, лента', p: 6500, pal: 'ruby', k: 'rose', like: ['розы'], f: ['love'] },
    { id: 3, n: 'Сливки', d: '7 кремовых пионов', p: 5200, pal: 'cream', k: 'peony', like: ['пионы'], f: ['mom', 'love'], tag: 'Сезон' },
    { id: 4, n: 'Закат', d: 'Розы, тюльпаны, пионы — микс', p: 3900, pal: 'sunset', k: 'mix', like: ['розы', 'тюльпаны'], f: ['mom', 'work'] },
    { id: 5, n: 'Лаванда', d: '9 сиреневых пионов', p: 5900, pal: 'lilac', k: 'peony', like: ['пионы'], f: ['love', 'mom'] },
    { id: 7, n: 'Весна', d: '21 тюльпан в крафте', p: 2700, pal: 'tulip', k: 'tulip', like: ['тюльпаны'], f: ['mom', 'work', 'cheap'], tag: 'До 3 000' },
    { id: 8, n: 'Поле', d: 'Ромашки и тюльпаны', p: 1900, pal: 'blush', k: 'wild', like: ['полевые'], f: ['work', 'cheap'] },
    { id: 9, n: 'Коробка', d: '11 роз в шляпной коробке', p: 3500, pal: 'ruby', k: 'box', like: ['розы'], f: ['love', 'work'] }
  ];
  const art = it => bouquetSVG(it.id * 7, it.pal, it.k);

  // герой
  $('#hb1').innerHTML = art(ITEMS[0]); $('#hb2').innerHTML = art(ITEMS[2]); $('#hb3').innerHTML = art(ITEMS[3]);

  // каталог
  let filter = 'all';
  function drawGrid() {
    const list = ITEMS.filter(i => filter === 'all' || i.f.includes(filter) || (filter === 'cheap' && i.p <= 3000));
    $('#grid').innerHTML = list.map(i => `<article class="card">${i.tag ? `<span class="tag">${esc(i.tag)}</span>` : ''}<div class="art">${art(i)}</div><div class="bd"><h3>${esc(i.n)}</h3><div class="ds">${esc(i.d)}</div><div class="row"><span class="pr">${rub(i.p)}</span><button class="add" type="button" data-add="${i.id}" aria-label="В корзину: ${esc(i.n)}">+</button></div></div></article>`).join('');
  }
  $('#filters').addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return; filter = b.dataset.f; $$('#filters .chip').forEach(x => x.setAttribute('aria-pressed', x === b)); drawGrid(); });
  drawGrid();

  // корзина
  let cart = store.get('cart', {});
  const cartN = () => Object.values(cart).reduce((a, b) => a + b, 0);
  function drawCart() {
    $('#cartN').textContent = cartN();
    const ids = Object.keys(cart).filter(id => cart[id] > 0);
    $('#lines').innerHTML = ids.length ? ids.map(id => { const i = ITEMS.find(x => x.id == id); return `<div class="ln"><div class="mi">${art(i)}</div><div class="nm">${esc(i.n)}<span>${rub(i.p)}</span></div><div class="qty"><button type="button" data-q="${id}" data-d="-1">−</button><b>${cart[id]}</b><button type="button" data-q="${id}" data-d="1">+</button></div></div>`; }).join('') : '<p style="color:var(--mut)">Пока пусто. Выберите букет в каталоге.</p>';
    $('#tot').textContent = rub(ids.reduce((s, id) => s + ITEMS.find(x => x.id == id).p * cart[id], 0));
    store.set('cart', cart);
  }
  function add(id, open) { cart[id] = (cart[id] || 0) + 1; drawCart(); toast('Добавили в корзину'); if (open) openCart(); }
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-add]'); if (a) { add(+a.dataset.add); a.classList.add('ok'); a.textContent = '✓'; setTimeout(() => { a.classList.remove('ok'); a.textContent = '+'; }, 900); }
    const q = e.target.closest('[data-q]'); if (q) { cart[q.dataset.q] = Math.max(0, (cart[q.dataset.q] || 0) + +q.dataset.d); drawCart(); }
    if (e.target.closest('[data-close]')) closeCart();
    const o = e.target.closest('[data-order]'); if (o) { e.preventDefault(); add(+o.dataset.order, true); }
  });
  const openCart = () => { $('#drawer').classList.add('on'); $('#drawer').setAttribute('aria-hidden', 'false'); };
  const closeCart = () => { $('#drawer').classList.remove('on'); $('#drawer').setAttribute('aria-hidden', 'true'); };
  $('#cartBtn').onclick = openCart;
  $('#od').valueAsDate = new Date();
  $('#order').onclick = () => {
    const ids = Object.keys(cart).filter(id => cart[id] > 0);
    if (!ids.length) return toast('Корзина пуста');
    const lines = ids.map(id => { const i = ITEMS.find(x => x.id == id); return `${i.n} × ${cart[id]} — ${rub(i.p * cart[id])}`; });
    const sum = ids.reduce((s, id) => s + ITEMS.find(x => x.id == id).p * cart[id], 0);
    const src = sessionStorage.getItem('cvety_src') || (location.hash === '#r' ? 'напоминание' : 'сайт');
    const txt = `Здравствуйте! Хочу заказать:\n${lines.join('\n')}\nИтого: ${rub(sum)}\nАдрес: ${$('#oa').value || '—'}\nДата: ${$('#od').value} ${$('#ot').value}\nОткрытка: ${$('#oc').value || '—'}\nОткуда: ${src}`;
    const orders = store.get('orders', []); orders.unshift({ t: Date.now(), items: lines, sum, addr: $('#oa').value, when: $('#od').value + ' ' + $('#ot').value, src }); store.set('orders', orders);
    window.open('https://wa.me/' + WA + '?text=' + encodeURIComponent(txt), '_blank', 'noopener');
    cart = {}; drawCart(); closeCart(); toast('Заказ отправлен. В демо он появился в панели магазина');
  };
  drawCart();

  // важные даты
  const ROLES = ['Жена', 'Девушка', 'Мама', 'Тёща', 'Свекровь', 'Дочь', 'Сестра', 'Бабушка', 'Коллега', 'Другое'];
  const OCC = ['День рождения', 'Годовщина', 'Именины', 'Другое'];
  const LIKES = ['розы', 'пионы', 'тюльпаны', 'полевые', 'не знаю'];
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
  else { personRow({ role: 'Тёща', name: 'Тамара', occ: 'День рождения', day: new Date(Date.now() + 3 * 864e5).getDate(), mon: new Date(Date.now() + 3 * 864e5).getMonth(), like: 'пионы', bud: 2 }); personRow({ role: 'Жена', name: 'Аня', occ: 'Годовщина', day: 14, mon: 1, like: 'розы', bud: 2 }); }
  $('#addp').onclick = () => personRow();
  $('#people').addEventListener('click', e => { if (e.target.closest('[data-del]')) e.target.closest('.prs').remove(); });

  function next(day, mon) {
    const now = new Date(); now.setHours(0, 0, 0, 0);
    let d = new Date(now.getFullYear(), mon, Math.min(day, new Date(now.getFullYear(), mon + 1, 0).getDate()));
    if (d < now) d = new Date(now.getFullYear() + 1, mon, Math.min(day, new Date(now.getFullYear() + 1, mon + 1, 0).getDate()));
    return { d, left: Math.round((d - now) / 864e5) };
  }
  function pick(like, bud) {
    const max = BUD[bud][1];
    const ok = ITEMS.filter(i => i.p <= max && (like === 'не знаю' || i.like.includes(like)));
    return (ok.length ? ok : ITEMS.filter(i => i.p <= max)).sort((a, b) => b.p - a.p)[0] || ITEMS[7];
  }
  function read() {
    return $$('#people .prs').map(r => {
      const g = k => r.querySelector(`[data-k="${k}"]`).value, i = r.dataset.i;
      return { role: g('role'), name: g('name').trim(), occ: g('occ'), day: +g('day'), mon: +g('mon'), like: (r.querySelector(`[name="lk${i}"]:checked`) || {}).value || 'не знаю', bud: +((r.querySelector(`[name="bd${i}"]:checked`) || {}).value || 1) };
    });
  }
  const who = p => (p.role === 'Другое' ? '' : p.role.toLowerCase().replace('жена', 'жены').replace('девушка', 'девушки').replace('мама', 'мамы').replace('тёща', 'тёщи').replace('свекровь', 'свекрови').replace('дочь', 'дочери').replace('сестра', 'сестры').replace('бабушка', 'бабушки').replace('коллега', 'коллеги')) + (p.name ? ` (${p.name})` : '');
  const occG = o => ({ 'День рождения': 'День рождения', 'Годовщина': 'Годовщина', 'Именины': 'Именины', 'Другое': 'Важная дата' }[o]);
  function drawCal(list) {
    const evs = list.map(p => ({ p, ...next(p.day, p.mon) })).sort((a, b) => a.left - b.left);
    $('#evs').innerHTML = evs.length ? evs.map(({ p, d, left }) => `<div class="ev"><div class="d"><b>${d.getDate()}</b><span>${MON[d.getMonth()].slice(0, 3)}</span></div><div class="t"><b>${esc(occG(p.occ))}</b> — ${esc(who(p))}<br><span style="color:#b9cdb2">любит ${esc(p.like)} · бюджет ${BUD[p.bud][0]}</span></div><span class="left">${left === 0 ? 'сегодня' : 'через ' + left + ' дн.'}</span></div>`).join('') : '<p class="empty">Пока пусто — заполните анкету справа.</p>';
    const scr = $('#scr'); scr.innerHTML = '<div class="ttl">Цветы «Пример» · бот</div>';
    if (!evs.length) return;
    const { p, d, left } = evs[0], it = pick(p.like, p.bud), dd = `${d.getDate()} ${MON[d.getMonth()]}`;
    const msgs = [
      [7, `Через неделю, ${dd}, — ${occG(p.occ).toLowerCase()} ${esc(who(p))}. Она любит ${esc(p.like === 'не знаю' ? 'красивые букеты' : p.like)}. Подобрали вариант: «${it.n}», ${rub(it.p)}.`],
      [3, `Напоминаем: через 3 дня ${occG(p.occ).toLowerCase()} ${esc(who(p))}. Закажите сейчас — привезём ${dd} к нужному времени.`],
      [0, `Сегодня ${occG(p.occ).toLowerCase()} ${esc(who(p))} 🌸 Ещё успеваем: доставка за 2 часа.`]
    ];
    msgs.forEach(([n, t], k) => setTimeout(() => {
      const m = document.createElement('div'); m.className = 'msg';
      m.innerHTML = `${t}<a class="mb" href="#r" data-order="${it.id}">Заказать «${esc(it.n)}» · ${rub(it.p)}</a><small>${n ? 'за ' + n + ' дн. до даты' : 'утром в день даты'}</small>`;
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

  // согласие, источник, тост
  $('#pdl').onclick = e => { e.preventDefault(); $('#pd').classList.add('on'); };
  $('#pd').addEventListener('click', e => { if (e.target === e.currentTarget || e.target.closest('[data-mclose]')) $('#pd').classList.remove('on'); });
  const sp = new URLSearchParams(location.search).get('src'); if (sp) sessionStorage.setItem('cvety_src', { qr: 'QR на открытке', avito: 'Авито', maps: 'Карты' }[sp] || sp);
  let tt; function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => el.classList.remove('on'), 2600); }
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeCart(); $('#pd').classList.remove('on'); } });
})();
