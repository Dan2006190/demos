'use strict';
/* Экран гостя: меню, корзина и оформление, статус заказа, оценка, карта. Правила — в core.js. */
const C=window.Coffee, R=C.RULES, esc=C.esc, rub=C.rub, hm=C.hm, plural=C.plural;
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const ico=n=>`<svg class="i" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const CART_KEY='coffee_cart_v1', ME_KEY='coffee_me_v1';
const view=$('#view');

let cart=C.kvGet(CART_KEY,[]).filter(l=>C.ITEMS[l.id]&&l.q>0);
let me=C.kvGet(ME_KEY,{name:'',phone:''});
const F={mode:'pickup',slot:null,name:me.name||'',phone:me.phone?C.fmtPhone(me.phone):'',addr:'',comment:'',use:0,err:''};
let curScreen='menu',arg='';
const drafts={};          // черновики жалоб: не теряются при обновлении экрана
const known={};           // последние увиденные статусы, чтобы сообщить гостю о готовности

/* ---------- корзина ---------- */
const cartCount=()=>cart.reduce((a,l)=>a+l.q,0);
const cartGoods=()=>cart.reduce((a,l)=>a+C.unitPrice(l)*l.q,0);
function saveCart(){C.kvSet(CART_KEY,cart);updateBar()}
function addLine(l,q){
  const k=C.lineKey(l),ex=cart.find(x=>C.lineKey(x)===k);
  if(ex)ex.q=Math.min(99,ex.q+q);else cart.push({id:l.id,s:l.s||0,m:l.m||0,y:l.y||0,q});
  saveCart();
}
function changeLine(k,d){
  const ex=cart.find(x=>C.lineKey(x)===k);if(!ex)return;
  ex.q=Math.min(99,ex.q+d);
  if(ex.q<=0)cart=cart.filter(x=>x!==ex);
  saveCart();
}
function qtyOf(id){return cart.filter(l=>l.id===id).reduce((a,l)=>a+l.q,0)}
function updateBar(){
  const n=cartCount(),b=$('#cartbar'),show=n>0&&curScreen==='menu';
  b.hidden=!show;
  $('#cbN').textContent=n+' '+plural(n,'позиция','позиции','позиций')+' · оформить';
  $('#cbSum').textContent=rub(cartGoods());
}
$('#cartbar').addEventListener('click',()=>{location.hash='#cart'});

let toastT;
function toast(t){const e=$('#toast');e.textContent=t;e.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>{e.hidden=true},2600)}

/* ---------- штампы ---------- */
function cupsHtml(stamps,pending){
  let h='';const E=R.stampEvery;
  for(let i=1;i<=E;i++){
    const on=i<=stamps, wait=!on&&i<=stamps+pending, six=i===E;
    h+=`<span class="cup${on?' on':''}${wait?' wait':''}${six?' six':''}">${ico(six?'gift':'cup')}</span>`;
  }
  return `<div class="cups" role="img" aria-label="Штампов ${stamps} из ${E-1}, шестой напиток в подарок">${h}</div>`;
}

/* ---------- меню ---------- */
function ctlHtml(it,off){
  if(off)return '<span class="nope">сегодня нет</span>';
  const q=qtyOf(it.id);
  if(it.mods)return `<button class="add" data-open="${it.id}">Выбрать${q?` <em>${q}</em>`:''}</button>`;
  const k=C.lineKey({id:it.id});
  if(q)return `<span class="qty"><button class="qb" data-dec="${k}" aria-label="Меньше: ${esc(it.n)}">${ico('minus')}</button><span class="q">${q}</span><button class="qb" data-inc="${k}" aria-label="Больше: ${esc(it.n)}">${ico('plus')}</button></span>`;
  return `<button class="add" data-add="${it.id}">${ico('plus')}Добавить</button>`;
}
function renderMenu(){
  const S=C.state(), c=me.phone?C.card(me.phone):null;
  const line=c&&c.exists?`<a class="cardline" href="#card" style="text-decoration:none;color:inherit">${ico('card')}<div><b>${c.points} ${plural(c.points,'балл','балла','баллов')} · штампов ${c.stamps} из ${R.stampEvery-1}</b><span>Карта ${esc(C.fmtPhone(c.phone))}</span></div>${ico('right')}</a>`:'';
  view.innerHTML=`<section class="lead">
      <h2>Закажите заранее и заберите без очереди</h2>
      <p>Выберите время — заказ будет готов к нему. Каждый 6-й напиток в подарок, 5% от суммы возвращается баллами.</p>
    </section>${line}
    <nav class="chips" id="chips" aria-label="Категории">${C.MENU.map((m,i)=>`<button class="chip${i?'':' on'}" data-cat="${m.id}">${esc(m.t)}</button>`).join('')}</nav>
    ${C.MENU.map(m=>`<section class="cat" id="cat-${m.id}" data-sec="${m.id}">
      <div class="cat-h"><h2>${esc(m.t)}</h2><span class="tag">пример</span></div>
      ${m.items.map(it=>{const off=!!S.off[it.id];return `<article class="it${off?' off':''}">
        <div><h3>${esc(it.n)}</h3><p>${esc(it.d)}</p><span class="w">${esc(it.w)}</span></div>
        <div class="it-r"><b>${it.mods?'от ':''}${rub(it.p)}</b><span data-ctl="${it.id}">${ctlHtml(it,off)}</span></div>
      </article>`}).join('')}
    </section>`).join('')}
    <p class="foot">Фото блюд в демо нет: меню свёрстано текстом. <a href="admin.html">Панель бариста</a> · <a href="qr.html">Тейбл-тент с QR</a></p>`;
  initSpy();updateBar();
}
function refreshCtl(id){
  const S=C.state(),el=$(`[data-ctl="${id}"]`);
  if(el)el.innerHTML=ctlHtml(C.ITEMS[id],!!S.off[id]);
}
let spy=null;
function initSpy(){
  if(spy)spy.disconnect();
  if(!('IntersectionObserver' in window))return;
  spy=new IntersectionObserver(es=>{
    es.forEach(e=>{if(!e.isIntersecting)return;
      const id=e.target.dataset.sec,chips=$('#chips');if(!chips)return;
      $$('.chip',chips).forEach(b=>{const on=b.dataset.cat===id;b.classList.toggle('on',on);
        if(on)chips.scrollLeft=b.offsetLeft-16});
    });
  },{rootMargin:'-20% 0px -70% 0px'});
  $$('[data-sec]').forEach(s=>spy.observe(s));
}

/* ---------- окно модификаторов ---------- */
let M=null;
function openSheet(id){M={id,s:0,m:0,y:0,q:1};renderSheet();$('#sheet').hidden=false;$('#shade').hidden=false;document.body.style.overflow='hidden';const x=$('#sheet .x');if(x)x.focus({preventScroll:true})}
function closeSheet(){M=null;$('#sheet').hidden=true;$('#shade').hidden=true;document.body.style.overflow=''}
function optGroup(title,list,key,val){
  if(!list)return '';
  return `<div class="grp"><h3>${title}</h3><div class="opts">${list.map((o,i)=>`<button class="opt" data-opt="${key}" data-i="${i}" aria-pressed="${i===val}">${esc(o[0])}${o[1]?`<small>+${o[1]} ₽</small>`:''}</button>`).join('')}</div></div>`;
}
function renderSheet(){
  const it=C.ITEMS[M.id];
  $('#sheet').innerHTML=`<div class="sheet-h"><h2>${esc(it.n)}</h2><button class="x" data-closesheet aria-label="Закрыть">${ico('x')}</button></div>
    <p class="mut">${esc(it.d)}</p>
    ${optGroup('Объём',it.sizes,'s',M.s)}${optGroup('Молоко',it.milks,'m',M.m)}${optGroup('Сироп',it.syrups,'y',M.y)}
    <div class="sheet-f"><span class="qty"><button class="qb" data-sq="-1" aria-label="Меньше">${ico('minus')}</button><span class="q">${M.q}</span><button class="qb" data-sq="1" aria-label="Больше">${ico('plus')}</button></span>
    <button class="btn main" data-sheetadd>В корзину · ${rub(C.unitPrice(M)*M.q)}</button></div>`;
}
$('#shade').addEventListener('click',closeSheet);
$('#sheet').addEventListener('click',e=>{
  if(e.target.closest('[data-closesheet]')){closeSheet();return}
  const o=e.target.closest('[data-opt]');
  if(o){M[o.dataset.opt]=+o.dataset.i;renderSheet();return}
  const sq=e.target.closest('[data-sq]');
  if(sq){M.q=Math.max(1,Math.min(20,M.q+ +sq.dataset.sq));renderSheet();return}
  if(e.target.closest('[data-sheetadd]')){
    const id=M.id,q=M.q;addLine(M,q);closeSheet();refreshCtl(id);toast(C.ITEMS[id].n+' в корзине');
  }
});

/* ---------- корзина и оформление ---------- */
function renderCart(){
  if(!cart.length){
    view.innerHTML=`<div class="empty"><h2>В корзине пусто</h2><p>Добавьте напиток или завтрак — время выдачи выберете на следующем шаге.</p><a class="btn main" href="#menu">Открыть меню</a></div>`;
    return;
  }
  view.innerHTML=`<div class="page-h"><h1>Ваш заказ</h1></div>
   <section class="sec"><ul class="lines" id="lines"></ul></section>
   <section class="sec"><h2>Как получить</h2>
     <div class="seg">
       <button data-mode="pickup" aria-pressed="${F.mode==='pickup'}">${ico('clock')}Забрать к…</button>
       <button data-mode="delivery" aria-pressed="${F.mode==='delivery'}">${ico('pin')}Доставка рядом</button>
     </div>
     <div id="modeBody"></div>
   </section>
   <section class="sec"><h2>Контакты</h2>
     <label class="f" style="margin-top:0">Имя<input id="fName" autocomplete="name" value="${esc(F.name)}" placeholder="Как вас позвать у стойки"></label>
     <label class="f">Телефон — он же карта гостя<input id="fPhone" type="tel" inputmode="tel" autocomplete="tel" value="${esc(F.phone)}" placeholder="+7 000 000-00-00"></label>
     <label class="f">Комментарий<input id="fComment" value="${esc(F.comment)}" placeholder="Например, без сахара"></label>
     <div class="bonus" id="bonus"></div>
     <div class="sum" id="sum"></div>
     <p class="err" id="fErr" hidden></p>
     <button class="btn main full" id="pay" style="margin-top:14px"></button>
     <p class="note">Оплата при получении. В демо платежа нет, заказ увидит только панель в этом браузере.</p>
   </section>`;
  renderLines();renderMode();renderBonus();renderSum();
}
function renderLines(){
  const S=C.state(),el=$('#lines');if(!el)return;
  el.innerHTML=cart.map(l=>{const it=C.ITEMS[l.id],k=C.lineKey(l),off=S.off[l.id];
    return `<li><div class="n">${esc(it.n)}<small>${esc(C.optsText(l))} · ${rub(C.unitPrice(l))}</small>${off?'<small class="nope">сегодня нет — уберите из заказа</small>':''}</div>
      <div class="p">${rub(C.unitPrice(l)*l.q)}</div>
      <span class="qty"><button class="qb" data-dec="${esc(k)}" aria-label="Меньше">${ico('minus')}</button><span class="q">${l.q}</span><button class="qb" data-inc="${esc(k)}" aria-label="Больше">${ico('plus')}</button></span></li>`}).join('');
}
function renderMode(){
  const el=$('#modeBody');if(!el)return;
  if(F.mode==='delivery'){
    const t=C.slots(C.now(),R.deliveryLead,1)[0];
    el.innerHTML=`<label class="f">Адрес рядом с кофейней<input id="fAddr" autocomplete="street-address" value="${esc(F.addr)}" placeholder="Улица, дом, квартира"></label>
      <p class="note">Привезём примерно к ${C.dayWord(t)==='сегодня'?'':C.dayWord(t)+' '}${hm(t)}. Доставка ${rub(R.deliveryFee)}, от ${rub(R.deliveryFree)} — бесплатно <span class="tag">пример</span></p>`;
    return;
  }
  const list=C.slots();
  if(list.indexOf(F.slot)<0)F.slot=list[0];
  const word=C.dayWord(list[0]);
  el.innerHTML=`<p class="note">Ближайшее время — ${word==='сегодня'?'':word+' '}${hm(list[0])}. ${word==='сегодня'&&list[0]-C.now()<=25*60000?'На приготовление нужно 15 минут.':'Кофейня работает с 08:00 до 22:00.'}</p>
    <div class="slots" role="group" aria-label="Время выдачи">${list.map(t=>`<button class="slot" data-slot="${t}" aria-pressed="${t===F.slot}">${hm(t)}</button>`).join('')}</div>`;
}
function renderBonus(){
  const el=$('#bonus');if(!el)return;
  const p=C.normPhone(F.phone);
  if(!p){el.innerHTML=`<h3>Карта гостя</h3><p class="note" style="margin:0">Укажите телефон: каждый 6-й напиток в подарок и 5% от суммы баллами. Карта заведётся сама.</p>`;return}
  const c=C.card(p),P=C.price(cart,p,F.mode,F.use);
  let h=`<h3>${c.exists?'Карта: '+esc(c.name||''):'Новая карта'}</h3>${cupsHtml(c.stamps,Math.min(c.pending,R.stampEvery-c.stamps))}`;
  if(c.pending)h+=`<p class="note">Пунктиром — напитки из заказов, которые ещё не выданы: ${c.pending}.</p>`;
  if(P.gifts){
    h+=`<div class="gift">${ico('gift')}<span>${P.gifts>1?P.gifts+' напитка':'Один напиток'} в этом заказе в подарок: −${rub(P.giftSum)}. Бесплатным становится самый недорогой.</span></div>`;
  }else{
    const left=R.stampEvery-((P.base+P.drinks)%R.stampEvery);
    h+=`<p class="note">После этого заказа до подарка: ${left} ${plural(left,'напиток','напитка','напитков')}.</p>`;
  }
  if(P.avail>0&&P.maxUse>0){
    h+=`<div class="points-row"><label class="f">Списать баллы (есть ${P.avail}, можно до ${P.maxUse})<input id="fUse" type="number" inputmode="numeric" min="0" max="${P.maxUse}" value="${F.use||''}" placeholder="0"></label>
      <button class="btn line" data-maxuse style="min-height:48px">Все</button></div>
      <p class="note">1 балл = 1 ₽. Баллами можно оплатить до 30% заказа <span class="tag">пример</span></p>`;
  }else if(P.avail>0){
    h+=`<p class="note">Баллов: ${P.avail}. В этом заказе списать нечего.</p>`;
  }
  el.innerHTML=h;
}
function renderSum(){
  const el=$('#sum');if(!el)return;
  const P=C.price(cart,F.phone,F.mode,F.use);
  let h=`<div><span>Товары</span><span>${rub(P.goods)}</span></div>`;
  if(P.gifts)h+=`<div class="minus"><span>Подарок на карте</span><span>−${rub(P.giftSum)}</span></div>`;
  if(P.used)h+=`<div class="minus"><span>Баллы</span><span>−${rub(P.used)}</span></div>`;
  if(F.mode==='delivery')h+=`<div><span>Доставка</span><span>${P.fee?rub(P.fee):'бесплатно'}</span></div>`;
  h+=`<div class="tot"><span>Итого</span><span>${rub(P.total)}</span></div>`;
  if(P.phone)h+=`<p class="note">После выдачи начислим: ${P.earn} ${plural(P.earn,'балл','балла','баллов')}${P.drinks?` и ${P.drinks} ${plural(P.drinks,'штамп','штампа','штампов')}`:''}.</p>`;
  el.innerHTML=h;
  const pay=$('#pay');if(pay)pay.textContent='Отправить заказ · '+rub(P.total);
}
function showErr(t){const e=$('#fErr');if(!e)return;e.textContent=t;e.hidden=!t;if(t)e.scrollIntoView({block:'center'})}
function submitOrder(){
  /* перед проверкой обновляем список времени: страница могла быть открыта долго */
  const r=C.placeOrder({lines:cart,name:F.name,phone:F.phone,mode:F.mode,addr:F.addr,slot:F.slot,usePoints:F.use,comment:F.comment});
  if(!r.ok){showErr(r.err);if(F.mode==='pickup')renderMode();renderLines();return}
  me={name:r.order.name,phone:r.order.phone};C.kvSet(ME_KEY,me);
  cart=[];saveCart();F.use=0;F.comment='';F.addr='';F.slot=null;F.name=me.name;F.phone=C.fmtPhone(me.phone);
  known[r.order.id]=r.order.st;
  location.hash='#order/'+r.order.id;
}
view.addEventListener('input',e=>{
  const t=e.target;
  if(t.id==='fName')F.name=t.value;
  else if(t.id==='fComment')F.comment=t.value;
  else if(t.id==='fAddr')F.addr=t.value;
  else if(t.id==='fPhone'){F.phone=t.value;F.use=0;renderBonus();renderSum()}
  else if(t.id==='fUse'){F.use=Math.max(0,Math.floor(Number(t.value)||0));renderSum()}
  else if(t.id==='fCompl')drafts[t.dataset.id]=t.value;
  else if(t.id==='cardPhone'){const b=$('#cardGo');if(b)b.disabled=!C.normPhone(t.value)}
});
view.addEventListener('change',e=>{
  /* при выходе из поля показываем, сколько баллов спишется на самом деле */
  if(e.target.id==='fUse'){const P=C.price(cart,F.phone,F.mode,F.use);F.use=P.used;e.target.value=P.used||''}
});

/* ---------- статус заказа ---------- */
const stepsOf=o=>[['acc','Принят','Заказ у бариста'],['cook','Готовится',''],['ready',o.mode==='delivery'?'Готов, курьер выехал':'Готов, заберите у стойки','']];
function orderHtml(o){
  const steps=stepsOf(o),order=['acc','cook','ready'],cur=order.indexOf(o.st);
  const dw=C.dayWord(o.slot),at=(dw==='сегодня'?'':dw+' ')+'к '+hm(o.slot);
  const when=o.mode==='delivery'?`Доставка ${esc(at)}: ${esc(o.addr)}`:`Забрать ${esc(at)}, ул. Образцовая, 1`;
  let body='';
  if(o.st==='cancel'){
    body=`<div class="sec"><p class="err" style="margin:0">Заказ отменён.${o.used?` ${o.used} ${plural(o.used,'балл вернулся','балла вернулись','баллов вернулись')} на карту.`:''}</p></div>`;
  }else if(o.st==='done'){
    body=`<div class="sec"><p class="bigno" style="font-size:27px">Заказ выдан</p>
      <div class="earned">На карту начислено: ${o.earn} ${plural(o.earn,'балл','балла','баллов')}${o.drinks?` и ${o.drinks} ${plural(o.drinks,'штамп','штампа','штампов')}`:''}.</div></div>
      ${feedbackHtml(o)}`;
  }else{
    body=`${o.st==='ready'?`<div class="ready">${esc(steps[2][1])}.${o.mode==='delivery'?'':` Назовите номер ${o.no} и имя.`}</div>`:''}
      <div class="sec"><ol class="track">${steps.map((s,i)=>`<li class="${i<cur?'past':i===cur?'now':''}"${i===cur?' aria-current="step"':''}>${esc(s[1])}</li>`).join('')}</ol></div>`;
  }
  return `<div class="page-h"><p class="mut">Заказ</p><p class="bigno">№${o.no}</p><p class="when">${when}</p></div>${body}
    <section class="sec"><h2>Состав</h2><ul class="lines">${o.rows.map(r=>`<li><div class="n">${esc(r.n)} × ${r.q}<small>${esc(r.opts)}</small></div><div class="p">${rub(r.price*r.q)}</div></li>`).join('')}</ul>
      <div class="sum">
        ${o.gifts?`<div class="minus"><span>Подарок на карте</span><span>−${rub(o.giftSum)}</span></div>`:''}
        ${o.used?`<div class="minus"><span>Баллы</span><span>−${rub(o.used)}</span></div>`:''}
        ${o.mode==='delivery'?`<div><span>Доставка</span><span>${o.fee?rub(o.fee):'бесплатно'}</span></div>`:''}
        <div class="tot"><span>Итого</span><span>${rub(o.total)}</span></div>
        ${C.isActive(o)?`<p class="note">После выдачи начислим: ${o.earn} ${plural(o.earn,'балл','балла','баллов')}${o.drinks?` и ${o.drinks} ${plural(o.drinks,'штамп','штампа','штампов')}`:''}.</p>`:''}
      </div></section>
    ${C.isActive(o)?`<div class="demo-act"><b>Для показа демо.</b> Статус меняет бариста в панели, открытой в этом же браузере. Если показываете с одного телефона, нажмите за него:
      <div class="row"><button class="btn line sm" data-demo-next="${o.id}">${o.st==='acc'?'Готовится':o.st==='cook'?'Готов':'Выдать заказ'}</button><a class="btn line sm" href="admin.html" target="_blank" rel="noopener">Панель бариста</a></div></div>`:''}`;
}
function feedbackHtml(o){
  if(!o.rating){
    return `<section class="sec"><h2>Как вам?</h2><p class="mut">Оцените заказ №${o.no}.</p>
      <div class="stars" role="group" aria-label="Оценка">${[1,2,3,4,5].map(n=>`<button class="star" data-rate="${n}" data-id="${o.id}" aria-label="Оценка ${n} из 5">${ico('star')}${n}</button>`).join('')}</div></section>`;
  }
  if(o.rating>=4){
    return `<section class="sec"><h2>Спасибо за ${o.rating} из 5</h2><p class="mut" style="margin-bottom:12px">Отзыв на картах помогает другим гостям найти кофейню.</p>
      <button class="btn main full" data-review>Оставить отзыв на картах</button></section>`;
  }
  if(o.complaint){
    return `<section class="sec"><h2>Передали администратору</h2><p class="mut">Он увидит вашу жалобу и свяжется по номеру ${esc(C.fmtPhone(o.phone))}.</p></section>`;
  }
  return `<section class="sec"><h2>Жаль, что так вышло</h2><p class="mut">Оценка ${o.rating} из 5. Напишите, что случилось: жалобу прочитает администратор, а не бариста за стойкой.</p>
    <label class="f">Что пошло не так<textarea id="fCompl" data-id="${o.id}" rows="4">${esc(drafts[o.id]||'')}</textarea></label>
    <p class="err" id="complErr" hidden></p>
    <button class="btn main full" style="margin-top:12px" data-complain="${o.id}">Отправить администратору</button></section>`;
}
function renderOrder(){
  let o=arg?C.getOrder(arg):null;
  const mine=me.phone?C.ordersOf(me.phone):[];
  if(!o)o=mine.find(C.isActive)||mine[0]||null;
  if(!o){
    view.innerHTML=`<div class="empty"><h2>Заказов пока нет</h2><p>Оформите заказ — здесь будет видно, когда он готов.</p><a class="btn main" href="#menu">Открыть меню</a></div>`;
    return;
  }
  const others=mine.filter(x=>x.id!==o.id).slice(0,8);
  view.innerHTML=orderHtml(o)+(others.length?`<section class="sec"><h2>Другие заказы</h2><ul class="past-orders">${others.map(x=>`<li><a href="#order/${x.id}"><b>№${x.no}</b>${esc(C.ST_NAME[x.st])}<span>${rub(x.total)}</span></a></li>`).join('')}</ul></section>`:'');
}

/* ---------- карта гостя ---------- */
function histRow(h){
  const pts=h.points;
  let title='',sub='';
  if(h.kind==='earn'){
    title=h.no?`Заказ №${h.no} выдан`:'Визит';
    sub=h.stamps?`${h.stamps} ${plural(h.stamps,'штамп','штампа','штампов')}${h.gifts?`, подарков: ${h.gifts}`:''}`:'без напитков';
  }else if(h.kind==='spend'){title=`Списание, заказ №${h.no}`}
  else{title=`Возврат, заказ №${h.no} отменён`}
  return `<li><div>${esc(title)}<small>${esc(C.dateTime(h.ts))}${sub?' · '+esc(sub):''}</small></div><b class="${pts<0?'down':'up'}">${pts>0?'+':''}${pts} ${plural(pts,'балл','балла','баллов')}</b></li>`;
}
function renderCard(){
  const c=me.phone?C.card(me.phone):null;
  if(!c){
    view.innerHTML=`<div class="page-h"><h1>Карта гостя</h1></div>
      <section class="sec"><p>Карта — это ваш номер телефона. Приложение и пластик не нужны.</p>
        <label class="f">Телефон<input id="cardPhone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+7 000 000-00-00"></label>
        <button class="btn main full" id="cardGo" style="margin-top:12px" disabled>Открыть карту</button>
        <p class="note">В рабочей версии вход подтверждается кодом из СМС; в демо код не спрашиваем.</p>
      </section>
      <section class="sec"><h2>Посмотреть на примере</h2>
        <p class="mut" style="margin-bottom:10px">Демо-гость Анна: 5 штампов, следующий напиток будет в подарок.</p>
        <button class="btn line" data-demo-card="0001000001">Открыть карту Анны</button></section>`;
    return;
  }
  const left=c.toGift;
  view.innerHTML=`<div class="page-h"><h1>${c.name?esc(c.name)+', ваша карта':'Ваша карта'}</h1><p class="mut">${esc(C.fmtPhone(c.phone))}</p></div>
    <section class="sec">
      <h2>Штампы: ${c.stamps} из ${R.stampEvery-1}</h2>
      ${cupsHtml(c.stamps,Math.min(c.pending,R.stampEvery-c.stamps))}
      <p class="note">${c.pending?`В невыданных заказах: ${c.pending} ${plural(c.pending,'напиток','напитка','напитков')}. `:''}${left===R.stampEvery&&c.drinks+c.pending>0?'Подарок получен, собираем следующий.':left===1?'Следующий напиток — в подарок.':`До подарка: ${left} ${plural(left,'напиток','напитка','напитков')}.`} Считаются кофе и чай.</p>
      <div class="big-pts"><b>${c.points}</b><span>${plural(c.points,'балл','балла','баллов')}</span></div>
      <p class="note" style="margin-top:0">1 балл = 1 ₽ при следующем заказе. Визитов: ${c.visits}, напитков: ${c.drinks}.</p>
    </section>
    <section class="sec"><h2>История</h2>${c.history.length?`<ul class="hist">${c.history.slice(0,30).map(histRow).join('')}</ul>`:'<p class="mut">Пока пусто. Штампы и баллы появятся после выдачи первого заказа.</p>'}</section>
    <section class="sec"><h2>Как это работает</h2><ol class="rules">
      <li>Каждый 6-й напиток бесплатно. Штамп ставится при выдаче заказа.</li>
      <li>5% от оплаченной суммы за товары возвращается баллами, доставка не считается.</li>
      <li>Баллами можно оплатить до 30% заказа. <span class="tag">пример</span></li>
    </ol>
    <button class="btn line sm" style="margin-top:14px" data-logout>Другой номер</button></section>`;
}

/* ---------- маршруты ---------- */
function render(){
  if(curScreen==='cart')renderCart();
  else if(curScreen==='order')renderOrder();
  else if(curScreen==='card')renderCard();
  else renderMenu();
  $$('.tabbar a').forEach(a=>{const on=a.dataset.tab===curScreen;a.classList.toggle('on',on);if(on)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current')});
  updateBar();updateDot();
}
function route(){
  const h=location.hash.replace(/^#/,'')||'menu',p=h.split('/');
  curScreen=['menu','cart','order','card'].includes(p[0])?p[0]:'menu';arg=p[1]||'';
  closeSheet();render();window.scrollTo(0,0);
}
window.addEventListener('hashchange',route);

function updateDot(){const d=$('#ordDot');d.hidden=!(me.phone&&C.ordersOf(me.phone).some(C.isActive))}

/* ---------- нажатия ---------- */
document.addEventListener('click',e=>{
  const t=e.target;let b;
  if((b=t.closest('[data-cat]'))){const s=$('#cat-'+b.dataset.cat);if(s)s.scrollIntoView({block:'start'});return}
  if((b=t.closest('[data-open]'))){openSheet(b.dataset.open);return}
  if((b=t.closest('[data-add]'))){const id=b.dataset.add;addLine({id},1);refreshCtl(id);return}
  if((b=t.closest('[data-inc],[data-dec]'))){
    const k=b.dataset.inc||b.dataset.dec,id=k.split('|')[0];
    changeLine(k,b.dataset.inc?1:-1);
    if(curScreen==='cart'){if(cart.length){renderLines();renderBonus();renderSum()}else renderCart()}
    else refreshCtl(id);
    return;
  }
  if((b=t.closest('[data-mode]'))){F.mode=b.dataset.mode;$$('[data-mode]').forEach(x=>x.setAttribute('aria-pressed',x===b));renderMode();renderBonus();renderSum();return}
  if((b=t.closest('[data-slot]'))){F.slot=+b.dataset.slot;$$('[data-slot]').forEach(x=>x.setAttribute('aria-pressed',x===b));return}
  if(t.closest('[data-maxuse]')){const P=C.price(cart,F.phone,F.mode,1e9);F.use=P.maxUse;const i=$('#fUse');if(i)i.value=P.maxUse||'';renderSum();return}
  if(t.closest('#pay')){submitOrder();return}
  if((b=t.closest('[data-demo-next]'))){
    const o=C.getOrder(b.dataset.demoNext);if(!o)return;
    const r=C.setStatus(o.id,{acc:'cook',cook:'ready',ready:'done'}[o.st]);
    if(r.ok)render();
    return;
  }
  if((b=t.closest('[data-rate]'))){C.rate(b.dataset.id,+b.dataset.rate);render();return}
  if(t.closest('[data-review]')){toast('В демо ссылка не подключена: здесь откроется карточка кофейни на картах.');return}
  if((b=t.closest('[data-complain]'))){
    const id=b.dataset.complain,r=C.complain(id,drafts[id]||'');
    if(r.ok){delete drafts[id];render()}
    else{const er=$('#complErr');er.textContent=r.err;er.hidden=false}
    return;
  }
  if(t.closest('#cardGo')){const p=C.normPhone($('#cardPhone').value);if(p){me={name:'',phone:p};C.kvSet(ME_KEY,me);F.phone=C.fmtPhone(p);render()}return}
  if((b=t.closest('[data-demo-card]'))){const p=b.dataset.demoCard,c=C.card(p);me={name:c.name,phone:p};C.kvSet(ME_KEY,me);F.name=c.name;F.phone=C.fmtPhone(p);F.use=0;render();return}
  if(t.closest('[data-logout]')){me={name:'',phone:''};C.kvSet(ME_KEY,me);F.name='';F.phone='';F.use=0;render();return}
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&M)closeSheet()});

/* ---------- обновления от панели бариста (другая вкладка) ---------- */
let sig=C.raw();
function noteReady(){
  if(!me.phone)return;
  C.ordersOf(me.phone).forEach(o=>{
    if(known[o.id]&&known[o.id]!==o.st&&o.st==='ready'){
      toast('Заказ №'+o.no+' готов'+(o.mode==='delivery'?', курьер выехал':', заберите у стойки'));
      if(navigator.vibrate)navigator.vibrate(200);
    }
    known[o.id]=o.st;
  });
}
function onData(){
  noteReady();updateDot();
  const a=document.activeElement,typing=a&&(a.tagName==='TEXTAREA'||a.tagName==='INPUT');
  if(curScreen==='menu'){if(!M){const y=window.scrollY;renderMenu();window.scrollTo(0,y)}}
  else if(curScreen==='cart'){renderLines();if(!typing){renderBonus()}renderSum()}
  else if(!typing)render();
}
function tick(){const r=C.raw();if(r!==sig){sig=r;onData()}}
window.addEventListener('storage',tick);
setInterval(tick,2500);
/* список времени сдвигается сам, пока открыт экран оформления */
setInterval(()=>{if(curScreen==='cart'&&cart.length){const a=document.activeElement;if(!(a&&a.id==='fAddr'))renderMode();renderSum()}},30000);

C.state();sig=C.raw();
if(me.phone)C.ordersOf(me.phone).forEach(o=>{known[o.id]=o.st});
route();
