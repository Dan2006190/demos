'use strict';
/* Колибри & Клондайк — логика сайта.
   Данные меню, корзина, бронь, банкеты, демо Telegram-бота и анимации (библиотека Motion).
   Без motion.js или при prefers-reduced-motion всё работает и всё видно — просто без анимаций. */

/* ---------- утилиты ---------- */
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rub=n=>n.toLocaleString('ru-RU')+' ₽';
const hm=d=>String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
const digits=s=>String(s||'').replace(/\D/g,'').length;
const plural=(n,a,b,c)=>n%10===1&&n%100!==11?a:n%10>=2&&n%10<=4&&(n%100<12||n%100>14)?b:c;
const ico=(n,c='')=>`<svg class="i ${c}"><use href="#i-${n}"/></svg>`;
function load(k,d){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}}
function save(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
let toastT;
function toast(t){let el=$('.toast');if(!el){el=document.createElement('div');el.className='toast';el.setAttribute('role','status');document.body.appendChild(el)}el.textContent=t;el.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>el.hidden=true,2200)}

/* ---------- анимации: включены, только если есть Motion и не просили «меньше движения» ---------- */
const M=window.Motion||null;
const RM=!!(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches);
const FX=!!(M&&M.animate&&M.inView&&M.scroll&&M.stagger&&!RM);
if(FX) document.documentElement.classList.add('fx');
const EASE=[.22,1,.36,1];
const anim=(el,kf,o)=>FX&&el?M.animate(el,kf,Object.assign({duration:.7,ease:EASE},o||{})):null;
function bump(el){if(FX&&el)M.animate(el,{scale:[1,1.4,1]},{duration:.42,ease:'easeOut'})}

const PH_LABEL={kl1:'Зал с зелёными лампами',kl2:'Проигрыватель у окна',kl3:'Стена с часами',kl4:'Зал и бар',menu1:'Меню: пицца, стр. 1',menu2:'Меню: пицца, стр. 2',menu3:'Меню: колбаски и рёбра',menu4:'Меню: салаты',hero:'Зал «Клондайка»'};

/* ---------- меню «Колибри» (перенесено с фото меню) ---------- */
const MENU_RAW=[
 {id:'pizza',t:'Пицца',e:'🍕',items:[
  ['p01','Ветчина с грибами','ветчина, шампиньон, помидор, томатный соус, сыр','500 г',480],
  ['p02','Супер пепперони','много пепперони, много сыра, оливки, томатный соус','650 г',680],
  ['p03','Маргарита','помидор, томатный соус, сыр','450 г',440],
  ['p04','4 сыра','моцарелла, российский, брынза, пармезан, соус бешамель','450 г',545],
  ['p05','Мексиканская','курица, индейка, болгарский перец, томатный соус, сыр, оливки','500 г',545],
  ['p06','Дары моря','кальмар, креветка, мидии, соус бешамель, сыр','450 г',745],
  ['p07','Колибри','ветчина, пепперони, болгарский перец, маслины, томатный соус, сыр, помидоры, шампиньоны','550 г',580],
  ['p08','Супермясная','курица, говядина, бекон, ветчина, томатный соус, сыр','550 г',735],
  ['p09','Двойной бекон','бекон, курица, томатный соус, сыр копчёный','500 г',535],
  ['p10','Каламбур','ветчина с грибами, римская, мексиканская, пепперони','550 г',525],
  ['p11','Римская','ветчина, корнишон, лук красный, томатный соус, сыр','500 г',520],
  ['p12','Курица с ананасом','курица, бекон, ананас, томатный соус, сыр','500 г',495],
  ['p13','Пепперони','пепперони, оливки, томатный соус, сыр','500 г',585,1],
  ['p14','По-тамбовски','ветчина, корнишон, картофель, томатный соус, сыр','450 г',490],
  ['p15','Курица терияки','курица, фирменный соус терияки, сыр, кунжут','450 г',525],
  ['p16','Сладкая','творог, ананас, груша, мёд, шоколад','500 г',460],
  ['p17','Ветчинная','много ветчины, томатный соус, сыр','500 г',510],
  ['p18','С лососем','лосось с/с, сыр сливочный, моцарелла, черри, базилик','500 г',745],
  ['p19','Карбонара','бекон, яйцо, соус «Бешамель», лук красный, чеснок, сыр','550 г',540],
  ['p20','Курица с грибами','цыплёнок, шампиньон, томатный соус, сыр','490 г',535],
  ['p21','Овощная','фасоль стручковая, болгарский перец, помидор, шампиньон, лук красный, томатный соус, сыр','540 г',475],
  ['p22','Цезарь','цыплёнок, помидор, капуста пекинская, соус «Цезарь», сыр','550 г',535]]},
 {id:'sausage',t:'Колбаски собственного производства',e:'🌭',items:[
  ['s01','Старопражские','говядина, говяжья печень, свинина с печёным картофелем, помидор-гриль, горчичный соус','450 г',510],
  ['s02','Жатецкие с сыром','свинина, курица, сыр с печёным картофелем, солёный огурчик, горчичный соус','450 г',525],
  ['s03','Нюрнбергские колбаски','из свинины с тушёной капустой, картофельным пюре, горчичным соусом','450 г',510],
  ['s04','Баварские','свинина, печёный картофель, кислая капуста, аджика, специи','450 г',520],
  ['s05','Словенская','говядина, свинина, курица, шампиньон с картофельным пюре, шампиньон-гриль, соус','450 г',545],
  ['s06','По-пльзеньски','говядина, свинина, копчёный окорок с картофельным пюре, яблоко-гриль, соус BBQ','450 г',565],
  ['s07','По-вацлавски','индейка, курица, базилик, петрушка с печёным картофелем, запечённым перцем, аджикой','450 г',565],
  ['s08','«Метровая колбаса»','свинина, говядина, курица, печёный картофель, соусы, маринованные огурцы. Рекомендуем на троих','1500 г',1600],
  ['s09','«Расколбас»','ароматные колбаски по традиционным рецептам немецких, австрийских и чешских поваров, с печёным картофелем, маринадами и соусами','2500 г',3450,1]]},
 {id:'ribs',t:'Рёбра',e:'🍖',items:[
  ['r01','По-берлински','ароматные рёбра в умеренно остром соусе с картофелем айдахо и свежим луком','500 г',695],
  ['r02','По-чешски','нежнейшие рёбра в мёде с печёной картошечкой','500 г',695],
  ['r03','С клюквенным соусом','аппетитные рёбра с клюквенным соусом и картофелем айдахо','450 г',695],
  ['r04','По-австрийски','рёбра в соусе BBQ, подаются с маринадами и печёным картофелем. Рекомендуем на троих','1400 г',2350],
  ['r05','Сливочные','рёбра в сливочно-грибном соусе с картофельным пюре','450 г',695],
  ['r06','По-канадски','вкуснейшие рёбра с тушёной капустой и соусом','500 г',695],
  ['r07','Ассорти из рёбер','с печёным картофелем, маринадами и соусами','3000 г',4450]]},
 {id:'salad',t:'Салаты',e:'🥗',items:[
  ['l01','Северный цветок','корзинка из сыра, курица, помидор, грибы, яйцо, соус','260 г',465],
  ['l02','Фермерский','свинина, курица, язык свиной, помидор, огурец, черри, пармезан, фирменный соус','200 г',470],
  ['l03','Салат с телятиной и овощами','говядина, сол. огурец, помидор, лук красный, масло','200 г',480],
  ['l04','Салат с ростбифом и жареными баклажанами','ростбиф, баклажан, томат черри, листья салата, соус','180 г',590],
  ['l05','Цезарь с курицей','салат айсберг, соус «Цезарь», черри, курица, сыр пармезан, сухарики','270 г',445],
  ['l06','Цезарь с креветкой','салат айсберг, соус «Цезарь», черри, креветки, сыр пармезан, сухарики','250 г',585],
  ['l07','Цезарь с лососем','салат айсберг, соус «Цезарь», черри, лосось, сыр пармезан, сухарики','250 г',635],
  ['l08','Салат с жареными баклажанами и черри','баклажан, черри, салат, гратен, заправка','200 г',435],
  ['l09','Салат с морепродуктами','кальмар, мидии, креветка, лист салата, помидор, огурец, соус','230 г',575],
  ['l10','Салат с сёмгой','сёмга с/с, лист салата, перец болгарский, помидор, огурец, медовая заправка','170 г',590],
  ['l11','Тёплый салат с курицей','курица, болгарский перец, огурец, соус, кунжут, чеснок, баклажаны, грибы, лук зелёный','200 г',490],
  ['l12','Корсиканский','огурец, помидор, солёный огурец, болгарский перец, маслины, брынза, оливковое масло, лук','260 г',445],
  ['l13','Овощной с кинзой','огурец, помидор, капуста пекинская, кинза, оливковое масло, лук','160 г',390],
  ['l14','Вальдбах','говядина, свинина, курица, язык в горчичном соусе на подушке из листьев салата, огурца и помидора с болгарским перцем','350 г',595,1]]}
];
const MENU=MENU_RAW.map(c=>({id:c.id,t:c.t,e:c.e,items:c.items.map(a=>({id:a[0],n:a[1],d:a[2],w:a[3],p:a[4],hit:!!a[5]}))}));
const ITEMS={};MENU.forEach(c=>c.items.forEach(i=>{i.cat=c;ITEMS[i.id]=i}));
const DELIV={min:600,free:1200,fee:150}; // условия доставки — пример

/* ---------- отзывы (реальные, из 2ГИС и Яндекс Карт) ---------- */
const Y_URL='https://yandex.ru/maps/org/colibri/114232125414/reviews/', G_URL='https://2gis.ru/tambov/firm/70000001034351537/tab/reviews';
const REVIEWS=[
 {a:'Олеся Третьякова',d:'20 декабря 2023',q:'самое лучшее место в Советском районе для бизнес-ланча',t:'',s:'Яндекс Карты',u:Y_URL},
 {a:'Юлия Алтунина',d:'30 августа 2025',q:'Очень быстро приготовили заказ',t:'Чисто, вкусно, приятный персонал.',s:'Яндекс Карты',u:Y_URL},
 {a:'Антон Р.',d:'18 августа 2025',q:'Приятный персонал, хорошее обслуживание и кухня',t:'Приходили семьёй, понравились и цены.',s:'Яндекс Карты',u:Y_URL},
 {a:'Ксения Александрова',d:'20 марта 2025',q:'всегда вежливый и опрятный персонал',t:'Всегда вкусно, цены приемлемые, приятная музыка.',s:'Яндекс Карты',u:Y_URL},
 {a:'Татьяна Грабко',d:'21 января 2025',q:'Запеченые рёбрышки очень вкусные',t:'Новогодний корпоратив: понравились программа, DJ и кухня.',s:'Яндекс Карты',u:Y_URL},
 {a:'Валентина В.',d:'7 ноября 2024',q:'цены более, чем приемлемые',t:'Второй визит, еду приносят быстро. Из минусов: в зале было прохладно.',s:'Яндекс Карты',u:Y_URL},
 {a:'Александр Маштаков',d:'28 мая 2024',q:'Пицца хорошего качества',t:'Ребёнку понравились шашлычки. На троих вышло около 2500–2700 ₽.',s:'Яндекс Карты',u:Y_URL},
 {a:'Эльвира Петухова',d:'2 января 2024',q:'быстро и вкусно выдают бизнес ланч',t:'Любимое семейное место, цены приемлемые.',s:'Яндекс Карты',u:Y_URL},
 {a:'Вячеслав',d:'29 октября 2023',q:'На первом этаже продают свежие и вкусные тортики',t:'Выше можно посидеть всей семьёй.',s:'Яндекс Карты',u:Y_URL},
 {a:'Олеся Б.',d:'13 сентября 2022',q:'Есть детское меню',t:'Удобно, два зала, для детей есть игрушки.',s:'Яндекс Карты',u:Y_URL},
 {a:'Катя Бреева',d:'2020',q:'',t:'Доставили раньше срока, курьер привёз пиццу в термосумке. Для района недорого, пицца вкусная.',s:'2ГИС',u:G_URL},
 {a:'Максим Горбачев',d:'2022',q:'',t:'Разнообразное меню, необычная подача, большие порции. Советует борщ.',s:'2ГИС',u:G_URL}
];

/* ---------- «Клондайк»: афиша, залы, сеты (всё — пример) ---------- */
const EVENTS=[
 {iso:'2026-11-06',d:'пт, 6 ноября',t:'20:00',n:'Кавер-бэнд: рок 80-х и 90-х',s:'Живой звук, вход свободный'},
 {iso:'2026-11-07',d:'сб, 7 ноября',t:'20:00',n:'Блюз-вечер с саксофоном',s:'Депозит на стол уточняйте'},
 {iso:'2026-11-13',d:'пт, 13 ноября',t:'20:00',n:'Акустика: русский рок',s:'Гитара и вокал'},
 {iso:'2026-11-14',d:'сб, 14 ноября',t:'21:00',n:'Ирландский вечер',s:'Фолк, скрипка, крафтовый сидр'},
 {iso:'2026-11-20',d:'пт, 20 ноября',t:'20:00',n:'Джем-сейшн',s:'Приходите со своим инструментом'}
];
const HALLS=[
 {id:'main',n:'Основной зал',cap:'до 50 гостей, фуршет до 70',d:'Кожаные диваны, зелёные лампы, барная стойка',ph:'kl1'},
 {id:'clock',n:'Зал с часами',cap:'до 25 гостей',d:'Кирпичная стена с часами разных городов, круглые столы',ph:'kl3'},
 {id:'vinyl',n:'Уголок у проигрывателя',cap:'до 10 гостей',d:'Стол у окна рядом с винтажной радиолой',ph:'kl2'}
];
const SETS=[
 {n:'«Старатель»',pp:'≈ 1 750 ₽',items:['Салаты: Цезарь с курицей ×3, Фермерский ×3, Вальдбах ×2','Колбаски «Расколбас» 2500 г ×2','Ассорти из рёбер 3000 г ×1','Пицца: Колибри, Пепперони, Карбонара, 4 сыра'],calc:'17 535 ₽ на 10 гостей'},
 {n:'«Золотая жила»',pp:'≈ 1 970 ₽',items:['Салаты: Цезарь с креветкой ×2, с сёмгой ×2, Вальдбах ×2, Северный цветок ×2','Ассорти из рёбер ×1, «Расколбас» ×2, «Метровая колбаса» ×1','Пицца: Дары моря, С лососем, Супермясная'],calc:'19 645 ₽ на 10 гостей'}
];

/* ====================== НАВИГАЦИЯ И ПРОКРУТКА ====================== */
const hdr=$('#hdr'), catsBar=$('#catsBar');
function scrollToId(id){
  if(id==='top'){window.scrollTo({top:0,behavior:RM?'auto':'smooth'});return}
  const el=document.getElementById(id);if(!el)return;
  let off=64;
  const kol=$('#kolibri');
  if(kol.contains(el)&&el!==kol&&!$('.k-intro').contains(el)&&!$('.k-nums').contains(el)) off+=catsBar.offsetHeight;
  const y=el.getBoundingClientRect().top+window.scrollY-off;
  window.scrollTo({top:Math.max(0,y),behavior:RM?'auto':'smooth'});
}
/* совместимость со старыми ссылками #kolibri / #klondike / #bot / #home */
const GO_MAP={home:'top',kolibri:'kolibri',klondike:'klondike',bot:'bot',menu:'menu'};
function go(v,anchor){closeModals();scrollToId(anchor||GO_MAP[v]||'top')}

document.addEventListener('click',e=>{
  const a=e.target.closest('[data-inc],[data-dec],[data-del]');
  if(a){const id=a.dataset.inc||a.dataset.dec||a.dataset.del;
    if(a.dataset.inc){setQty(id,(cart[id]||0)+1);if(!a.closest('.drawer')){toast('В корзине: '+ITEMS[id].n);bumpCart()}}
    else if(a.dataset.dec) setQty(id,(cart[id]||0)-1); else setQty(id,0);
    return}
  if(e.target.closest('[data-open-cart]')){e.preventDefault();openCart();return}
  const g=e.target.closest('[data-go]');
  if(g){e.preventDefault();go(g.dataset.go,g.dataset.anchor);return}
  const s=e.target.closest('[data-scroll]');
  if(s){e.preventDefault();const hadModal=isCartOpen()||$('#mnav').classList.contains('open');closeModals();setTimeout(()=>scrollToId(s.dataset.scroll),hadModal?60:0);return}
  if(e.target.closest('[data-close]')||e.target.closest('[data-mclose]')){closeModals();return}
  const l=e.target.closest('[data-lb]');
  if(l){openLb(l.dataset.lb);return}
});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModals()});

/* мобильное меню */
const mnav=$('#mnav');
$('#burger').addEventListener('click',()=>{mnav.classList.add('open');mnav.setAttribute('aria-hidden','false');$('#burger').setAttribute('aria-expanded','true');document.body.style.overflow='hidden';
  if(FX)M.animate($$('a',mnav),{opacity:[0,1],y:[18,0]},{duration:.5,delay:M.stagger(.05,{startDelay:.08}),ease:EASE})});

function closeModals(){
  $('#cartModal').classList.remove('open');$('#cartModal').setAttribute('aria-hidden','true');$('#cartBack').classList.remove('open');
  $('#lb').hidden=true;
  mnav.classList.remove('open');mnav.setAttribute('aria-hidden','true');$('#burger').setAttribute('aria-expanded','false');
  document.body.style.overflow='';updateCartBar();
}

/* шапка: уменьшается при прокрутке, цвет — по «миру» под ней */
let ticking=false;
function onScroll(){
  ticking=false;
  const y=window.scrollY, kd=$('#klondike').getBoundingClientRect(), ft=$('.foot').getBoundingClientRect(), line=40;
  const dark=(kd.top<line&&kd.bottom>line)||ft.top<line;
  const small=y>40;
  hdr.classList.toggle('small',small);
  hdr.classList.toggle('dark',small&&dark);
  hdr.classList.toggle('light',small&&!dark);
  moveCatsLine();
}
window.addEventListener('scroll',()=>{if(!ticking){ticking=true;requestAnimationFrame(onScroll)}},{passive:true});
window.addEventListener('resize',()=>requestAnimationFrame(onScroll));

/* ---------- лайтбокс ---------- */
function openLb(k){
  const img=$(`img[data-photo="${k}"]`);
  if(!img){toast('Фото появится после запуска build_site.bat');return}
  $('#lbImg').src=img.currentSrc||img.src;$('#lbCap').textContent=PH_LABEL[k]||img.alt||'';$('#lb').hidden=false;document.body.style.overflow='hidden';
  anim($('#lbImg'),{opacity:[0,1],scale:[.96,1]},{duration:.4});
}

/* ====================== МЕНЮ И КОРЗИНА ====================== */
let cart=load('colibri_cart',{});
Object.keys(cart).forEach(id=>{if(!ITEMS[id])delete cart[id]});
function ctlHtml(id){const q=cart[id]||0;return q?`<button class="qb" data-dec="${id}" aria-label="Меньше">${ico('minus')}</button><span class="q">${q}</span><button class="qb" data-inc="${id}" aria-label="Больше">${ico('plus')}</button>`:`<button class="add" data-inc="${id}">${ico('plus')}В корзину</button>`}
function renderMenu(){
  $('#chips').innerHTML=MENU.map(c=>`<button class="cat" data-scroll="cat-${c.id}" data-cat="${c.id}">${esc(c.t.split(' ')[0])}<span class="mut"> · ${c.items.length}</span></button>`).join('')+`<button class="cat cartc" data-open-cart>${ico('bag')}Корзина</button>`;
  /* меню типографское: хит категории — крупным шрифтом, без фото */
  $('#menu').innerHTML=MENU.map(c=>{
    const feat=c.items.filter(i=>i.hit), rest=c.items.filter(i=>!i.hit);
    const fh=feat.map(i=>`<article class="feat" data-reveal>
      <div class="feat-t"><p class="hit">Хит меню · ${i.w}</p><h3>${esc(i.n)}</h3><p>${esc(i.d)}</p></div>
      <div class="feat-f"><b class="p">${rub(i.p)}</b><span class="ctl" data-ctl="${i.id}">${ctlHtml(i.id)}</span></div></article>`).join('');
    return `<div class="cat-sec" id="cat-${c.id}" data-catsec="${c.id}"><div class="cat-h" data-reveal><h2>${esc(c.t)}</h2><span>${c.items.length} ${plural(c.items.length,'позиция','позиции','позиций')}</span></div>${fh}
      <div class="grid" data-stagger>${rest.map(i=>`<article class="dish"><h3>${esc(i.n)}</h3><b class="p">${rub(i.p)}</b><p>${esc(i.d)}</p><span class="w">${i.w}</span><span class="ctl" data-ctl="${i.id}">${ctlHtml(i.id)}</span></article>`).join('')}</div></div>`;
  }).join('');
}
function setQty(id,q){if(!ITEMS[id])return;if(q<=0)delete cart[id];else cart[id]=Math.min(q,99);save('colibri_cart',cart);refreshCart()}
function totals(){
  let n=0,sum=0;for(const id in cart){n+=cart[id];sum+=ITEMS[id].p*cart[id]}
  const m=$('#orderForm input[name=mode]:checked'), mode=m?m.value:'pickup';
  const fee=mode==='delivery'&&sum>0&&sum<DELIV.free?DELIV.fee:0;
  return {n,sum,fee,total:sum+fee,mode};
}
const isCartOpen=()=>$('#cartModal').classList.contains('open');
function refreshCart(){$$('[data-ctl]').forEach(el=>el.innerHTML=ctlHtml(el.dataset.ctl));updateCartBar();if(isCartOpen())renderCart();pzSync()}
let barShown=false;
function updateCartBar(){
  const T=totals(), show=T.n>0&&!botVisible&&!isCartOpen();
  const bar=$('#cartbar');
  if(show&&!barShown){bar.hidden=false;anim(bar,{opacity:[0,1],y:[24,0]},{duration:.45})}
  else if(!show) bar.hidden=true;
  barShown=show;
  $('#cbN').textContent=T.n+' шт.';$('#cbSum').textContent=rub(T.sum);
  const hc=$('#hdrCnt');hc.textContent=T.n;hc.hidden=!T.n;
}
/* счётчик «прыгает» один раз при добавлении */
function bumpCart(){bump($('#hdrCnt'));if(!$('#cartbar').hidden)bump($('#cbN'))}
function openCart(){
  $('#cartDone').hidden=true;fillTimes();renderCart();
  $('#cartModal').classList.add('open');$('#cartModal').setAttribute('aria-hidden','false');$('#cartBack').classList.add('open');
  document.body.style.overflow='hidden';updateCartBar();
  if(FX){const li=$$('#cartLines li');if(li.length)M.animate(li,{opacity:[0,1],x:[24,0]},{duration:.45,delay:M.stagger(.04,{startDelay:.15}),ease:EASE})}
  setTimeout(()=>{const x=$('#cartModal .x');x&&x.focus({preventScroll:true})},60);
}
function renderCart(){
  const T=totals(), empty=!T.n;
  $('#cartEmpty').hidden=!empty||!$('#cartDone').hidden;$('#cartFull').hidden=empty||!$('#cartDone').hidden;
  if(empty) return;
  $('#cartLines').innerHTML=Object.keys(cart).map(id=>{const i=ITEMS[id];return `<li><div class="nm">${esc(i.n)}<small>${i.w} · ${rub(i.p)}</small></div><span class="ctl"><button class="qb" data-dec="${id}" aria-label="Меньше">${ico('minus')}</button><span class="q">${cart[id]}</span><button class="qb" data-inc="${id}" aria-label="Больше">${ico('plus')}</button></span><span class="sum">${rub(i.p*cart[id])}</span><button class="del" data-del="${id}" aria-label="Удалить">${ico('trash')}</button></li>`}).join('');
  let h=`<div><span>Блюда (${T.n} шт.)</span><b>${rub(T.sum)}</b></div>`;
  if(T.mode==='delivery'){h+=`<div><span>Доставка <span class="tag">пример</span></span><b>${T.fee?rub(T.fee):'бесплатно'}</b></div>`;
    if(T.sum<DELIV.min) h+=`<div class="err"><span>Доставка от ${rub(DELIV.min)}, добавьте ещё ${rub(DELIV.min-T.sum)}</span></div>`;
    else if(T.fee) h+=`<div class="mut"><span>До бесплатной доставки: ${rub(DELIV.free-T.sum)}</span></div>`;}
  h+=`<div class="tot"><span>Итого</span><span>${rub(T.total)}</span></div>`;
  $('#sumbox').innerHTML=h;
}
function fillTimes(){
  const sel=$('#timeSel'),now=new Date(),o=['Как можно скорее (40–60 мин)'];
  let t=new Date(now.getTime()+60*60000);t.setMinutes(t.getMinutes()<30?30:60,0,0);
  for(let i=0;i<12;i++){const h=t.getHours();if(h>=11&&(h<21||(h===21&&t.getMinutes()===0)))o.push('Сегодня к '+hm(t));t=new Date(t.getTime()+30*60000)}
  if(o.length<3) for(let h=11;h<=20;h++) o.push('Завтра к '+String(h).padStart(2,'0')+':00');
  sel.innerHTML=o.map(x=>`<option>${x}</option>`).join('');
}
$('#orderForm').addEventListener('change',e=>{if(e.target.name==='mode'){$('#addrWrap').hidden=e.target.value!=='delivery';renderCart()}});
function formErr(f,t){const e=$('.err',f);e.textContent=t||'';e.hidden=!t;if(t)anim(e,{opacity:[0,1],x:[-6,0]},{duration:.3});return !!t}
$('#orderForm').addEventListener('submit',e=>{
  e.preventDefault();const f=e.target,d=Object.fromEntries(new FormData(f)),T=totals();
  if(formErr(f,!T.n?'Корзина пуста':d.name.trim().length<2?'Укажите имя':digits(d.phone)<10?'Укажите телефон: не меньше 10 цифр':
    T.mode==='delivery'&&d.addr.trim().length<5?'Укажите адрес доставки':T.mode==='delivery'&&T.sum<DELIV.min?`Доставка от ${rub(DELIV.min)}: добавьте блюда или выберите самовывоз`:'')) return;
  const o={no:++ORDER_NO,src:'site',name:d.name.trim(),phone:d.phone.trim(),mode:T.mode,addr:d.addr.trim(),time:d.time,comment:d.comment.trim(),items:{...cart},sum:T.total,fee:T.fee,st:'new'};
  adminOrder(o);
  cart={};save('colibri_cart',cart);refreshCart();f.reset();$('#addrWrap').hidden=true;
  $('#cartEmpty').hidden=true;$('#cartFull').hidden=true;
  const done=$('#cartDone');done.hidden=false;
  done.innerHTML=`<div class="okbox"><h3>Заказ №${o.no} отправлен</h3><p>Сумма ${rub(o.sum)}, ${o.mode==='delivery'?'доставка: '+esc(o.addr):'самовывоз с Гастелло, 57А'}, ${esc(o.time.toLowerCase())}.</p><p class="mut">Это демо: заказ появился в чате администраторов. Там его можно принять кнопками.</p><div class="btns"><button class="btn rasp sm" id="seeAdm">Открыть чат админов</button><button class="btn ghost sm" data-close>Закрыть</button></div></div>`;
  anim(done.firstChild,{opacity:[0,1],y:[16,0]},{duration:.5});
  $('#seeAdm').onclick=()=>{go('bot');showPanel('a')};
});

/* подсветка текущей категории в липкой полосе */
let curCat=null;
function moveCatsLine(){
  const line=$('#catsLine'),cats=$('#chips');
  const b=curCat&&$(`.cat[data-cat="${curCat}"]`);
  if(!b){line.style.transform='scaleX(0)';return}
  line.style.transform=`translateX(${b.offsetLeft-cats.scrollLeft}px) scaleX(${b.offsetWidth/100})`;
}
function setCat(id){
  if(id===curCat)return;curCat=id;
  $$('.cat[data-cat]').forEach(b=>b.classList.toggle('on',b.dataset.cat===id));
  const b=id&&$(`.cat[data-cat="${id}"]`),cats=$('#chips');
  if(b&&(b.offsetLeft<cats.scrollLeft||b.offsetLeft+b.offsetWidth>cats.scrollLeft+cats.clientWidth))cats.scrollTo({left:b.offsetLeft-16,behavior:RM?'auto':'smooth'});
  moveCatsLine();
}
function initCatSpy(){
  $('#chips').addEventListener('scroll',()=>requestAnimationFrame(moveCatsLine),{passive:true});
  const vis=new Map();
  const io=new IntersectionObserver(es=>{
    es.forEach(en=>vis.set(en.target.dataset.catsec,en.isIntersecting));
    const first=MENU.find(c=>vis.get(c.id));setCat(first?first.id:null);
  },{rootMargin:'-35% 0px -60% 0px'});
  $$('[data-catsec]').forEach(s=>io.observe(s));
}

/* ====================== КАРУСЕЛЬ ПИЦЦ ====================== */
/* Фото — вырезанные PNG без фона (img/pizza-N.png, 900 px; запасной путь — materials/cut/).
   Пара «фото → блюдо меню» подобрана по виду начинки: [ключ фото, id блюда из MENU_RAW].
   Анимации — Motion, только transform/opacity. При prefers-reduced-motion — без вращения,
   без автопрокрутки, смена слайда мгновенная. */
const PZ_SLIDES=[['pz5','p07'],['pz4','p08'],['pz2','p03'],['pz1','p04'],['pz3','p09']];
const PZ_AUTO=4000, PZ_DUR=.9;
/* версия файлов пицц: браузер не покажет закэшированный старый pizza-2 (новый файл от 02.11.2026) */
const PZ_VER='3';
let pzCur=0,pzItems=[],pzTimer=null,pzSeen=false,pzShown=false;
const pzHold={hover:false,touch:false,focus:false};
const pzN=PZ_SLIDES.length;
/* смещение слайда k относительно текущего c по кругу: -2…2 */
function pzOff(k,c){let d=((k-c)%pzN+pzN)%pzN;if(d>pzN/2)d-=pzN;return d}
function pzState(d){
  const st=$('#pzStage'), w=st.offsetWidth, pz=pzItems[0]?pzItems[0].offsetWidth:400, a=Math.abs(d), mob=w<700;
  const off=Math.min(pz*.9,w*.5);
  return {x:a>1?Math.sign(d)*off*1.7:d*off, scale:a===0?1:a===1?(mob?.5:.56):.4, opacity:a===0?1:a===1?.38:0, rotate:RM?0:d*90};
}
function pzSet(el,s){
  if(FX) M.animate(el,{x:s.x,scale:s.scale,opacity:s.opacity,rotate:s.rotate},{duration:0});
  else {el.style.transform=`translateX(${s.x}px) rotate(${s.rotate}deg) scale(${s.scale})`;el.style.opacity=String(s.opacity)}
}
function pzInfoHtml(){
  const it=ITEMS[PZ_SLIDES[pzCur][1]], q=cart[it.id]||0;
  return `<p class="hit">Пицца · ${esc(it.w)}</p><h3>${esc(it.n)}</h3><p class="d">${esc(it.d)}</p>
    <div class="pz-buy"><b class="p">${rub(it.p)}</b><button class="btn rasp" data-pz-add="${it.id}">${ico('plus')}В корзину</button>${q?`<span class="inc">в корзине: ${q}</span>`:''}</div>`;
}
function pzSync(){const el=$('#pzInfo');if(el&&pzItems.length)el.innerHTML=pzInfoHtml()}
function pzGo(i,user){
  if(!pzItems.length)return;
  const prev=pzCur;pzCur=((i%pzN)+pzN)%pzN;
  if(prev!==pzCur)pzShown=true;   // слайд уже сменился — стартовое «приземление» не нужно
  if(user)$('#pzInfo').setAttribute('aria-live','polite');
  pzItems.forEach((el,k)=>{
    const d0=pzOff(k,prev), d1=pzOff(k,pzCur), s=pzState(d1);
    el.classList.toggle('cur',d1===0);el.setAttribute('aria-hidden',String(d1!==0));
    if(!FX||prev===pzCur||Math.abs(d1-d0)>2||(Math.abs(d0)>1&&Math.abs(d1)>1)){pzSet(el,s);return}
    /* уходящая уезжает и поворачивается на 90°, следующая въезжает с вращением */
    M.animate(el,{x:s.x,rotate:s.rotate,opacity:s.opacity},{duration:PZ_DUR,ease:EASE});
    /* «приземление» новой текущей: scale … → 0.9 → 1 */
    if(d1===0) M.animate(el,{scale:[pzState(d0).scale,.9,1]},{duration:PZ_DUR,times:[0,.7,1],ease:'easeOut'});
    else M.animate(el,{scale:s.scale},{duration:PZ_DUR*.85,ease:EASE});
  });
  $$('.pz-dot').forEach((b,k)=>{b.classList.toggle('on',k===pzCur);b.setAttribute('aria-selected',String(k===pzCur))});
  const info=$('#pzInfo');info.innerHTML=pzInfoHtml();
  if(prev!==pzCur)anim(info,{opacity:[0,1],y:[12,0]},{duration:.55,delay:.15});
  pzSchedule();
}
/* автопрокрутка каждые 4 с; пауза при касании, наведении, фокусе, вне экрана и на скрытой вкладке */
function pzSchedule(){
  clearTimeout(pzTimer);
  if(RM||!pzSeen||document.hidden||pzHold.hover||pzHold.touch||pzHold.focus)return;
  pzTimer=setTimeout(()=>pzGo(pzCur+1),PZ_AUTO);
}
/* миниатюра пиццы летит в корзину в шапке, после посадки счётчик «прыгает» */
function pzFly(done){
  /* цель — значок корзины в шапке; если его не видно (узкий экран) — нижняя плашка корзины */
  const src=$('.pz-item.cur img'), hb=$('.hbtn.cartb'), to=hb&&hb.offsetWidth?hb:$('#cartbar');
  if(!FX||!src||!to||!to.offsetWidth){done();return}
  const a=src.getBoundingClientRect(), b=to.getBoundingClientRect(), S=110;
  const fly=document.createElement('div');fly.className='pz-fly';fly.style.width=fly.style.height=S+'px';
  fly.innerHTML=`<img src="${esc(src.currentSrc||src.src)}" alt="">`;
  document.body.appendChild(fly);
  const x0=a.left+a.width/2-S/2, y0=a.top+a.height/2-S/2, x1=b.left+b.width/2-S/2, y1=b.top+b.height/2-S/2;
  M.animate(fly,{x:[x0,x1]},{duration:.85,ease:[.3,0,.6,1]});
  M.animate(fly,{y:[y0,y1]},{duration:.85,ease:[.4,-.5,.7,1]});   // лёгкая дуга: сначала чуть вниз, потом вверх
  M.animate(fly.firstChild,{scale:[1.5,.28],rotate:[0,240],opacity:[1,1,.35]},{duration:.85,ease:[.4,0,.6,1]});
  setTimeout(()=>{fly.remove();done()},860);
}
function initPizzas(){
  const st=$('#pzStage'), sec=$('#pizzas');if(!st)return;
  st.insertAdjacentHTML('beforeend',PZ_SLIDES.map(([ph,id],k)=>`<div class="pz-item" data-pzi="${k}"><div class="pz-float"><div class="pz-spin"><img src="img/pizza-${ph.slice(2)}.png?v=${PZ_VER}" data-photo="${ph}" alt="Пицца «${esc(ITEMS[id].n)}»" width="900" height="900" decoding="async" draggable="false"></div></div></div>`).join(''));
  pzItems=$$('.pz-item',st);
  $('#pzDots').innerHTML=PZ_SLIDES.map(([,id],k)=>`<button class="pz-dot" role="tab" data-pzd="${k}" aria-label="${esc(ITEMS[id].n)}"></button>`).join('');
  pzGo(0);

  /* первое появление: пицца «приземляется» в центр (скрытое состояние — только из JS) */
  if(FX){const c=pzItems[0];M.animate(c,{opacity:0},{duration:0});
    M.inView(sec,()=>{if(pzShown)return;pzShown=true;M.animate(c,{opacity:[0,1],scale:[.9,1],rotate:[-60,0]},{duration:1.1,ease:EASE})},{margin:'0px 0px -20% 0px'})}

  /* кнопки, точки, клик по соседней пицце, «В корзину» */
  sec.addEventListener('click',e=>{
    const add=e.target.closest('[data-pz-add]');
    if(add){const id=add.dataset.pzAdd;setQty(id,(cart[id]||0)+1);toast('В корзине: '+ITEMS[id].n);pzFly(bumpCart);return}
    const ar=e.target.closest('[data-pz]');if(ar){pzGo(pzCur+(+ar.dataset.pz),true);return}
    const dot=e.target.closest('[data-pzd]');if(dot){pzGo(+dot.dataset.pzd,true);return}
    const it=e.target.closest('.pz-item');
    if(it&&!swiped&&!it.classList.contains('cur')){pzGo(+it.dataset.pzi,true)}
  });
  st.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'){e.preventDefault();pzGo(pzCur-1,true)}else if(e.key==='ArrowRight'){e.preventDefault();pzGo(pzCur+1,true)}});

  /* свайп (палец и мышь); вертикальная прокрутка страницы не блокируется: touch-action: pan-y */
  let sx=null,sy=0,swiped=false,touchT=null;
  st.addEventListener('pointerdown',e=>{sx=e.clientX;sy=e.clientY;swiped=false;
    if(e.pointerType!=='mouse'){clearTimeout(touchT);pzHold.touch=true;pzSchedule()}});
  const end=e=>{
    if(sx!==null&&e.type==='pointerup'){const dx=e.clientX-sx,dy=e.clientY-sy;
      if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.2){swiped=true;pzGo(pzCur+(dx<0?1:-1),true)}}
    sx=null;
    if(e.pointerType!=='mouse'){clearTimeout(touchT);touchT=setTimeout(()=>{pzHold.touch=false;pzSchedule()},6000)}
  };
  st.addEventListener('pointerup',end);st.addEventListener('pointercancel',end);
  sec.addEventListener('pointerenter',e=>{if(e.pointerType==='mouse'){pzHold.hover=true;pzSchedule()}});
  sec.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse'){pzHold.hover=false;pzSchedule()}});
  sec.addEventListener('focusin',()=>{pzHold.focus=true;pzSchedule()});
  sec.addEventListener('focusout',e=>{if(!sec.contains(e.relatedTarget)){pzHold.focus=false;pzSchedule()}});

  new IntersectionObserver(es=>{pzSeen=es[0].isIntersecting;pzSchedule()},{threshold:.35}).observe(sec);
  document.addEventListener('visibilitychange',pzSchedule);
  let rt;window.addEventListener('resize',()=>{clearTimeout(rt);rt=setTimeout(()=>pzItems.forEach((el,k)=>pzSet(el,pzState(pzOff(k,pzCur)))),120)});
}

/* ====================== «КЛОНДАЙК» ====================== */
const isoToday=()=>{const d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,10)};
const fmtIso=s=>{const [y,m,d]=s.split('-');return `${d}.${m}.${y}`};

/* формы с шагами: validate(i, data) возвращает текст ошибки шага i или '' */
function stepper(form,validate){
  const steps=$$('.step',form), ind=$$('.steps-ind li',form);
  const back=$('[data-step="-1"]',form), next=$('[data-step="1"]',form), sub=$('[type=submit]',form);
  ind.forEach((li,i)=>li.insertAdjacentHTML('afterbegin',`<span>${i+1}</span>`));
  let cur=0;
  function show(i,dir){
    cur=Math.max(0,Math.min(steps.length-1,i));
    steps.forEach((s,j)=>s.hidden=j!==cur);
    ind.forEach((li,j)=>{li.classList.toggle('on',j===cur);li.classList.toggle('done',j<cur)});
    back.hidden=cur===0;next.hidden=cur===steps.length-1;sub.hidden=cur!==steps.length-1;
    if(dir)anim(steps[cur],{opacity:[0,1],x:[dir*28,0]},{duration:.45});
  }
  const data=()=>Object.fromEntries(new FormData(form));
  function tryNext(){const er=validate(cur,data());if(formErr(form,er))return false;show(cur+1,1);const f=$('input,select,textarea',steps[cur]);f&&f.focus({preventScroll:true});return true}
  next.addEventListener('click',tryNext);
  back.addEventListener('click',()=>{formErr(form,'');show(cur-1,-1)});
  form._go=i=>{formErr(form,'');show(i,i>cur?1:-1)};
  form._cur=()=>cur;
  form._last=()=>cur===steps.length-1;
  /* полная проверка перед отправкой: при ошибке открываем нужный шаг */
  form._check=()=>{const d=data();for(let i=0;i<steps.length;i++){const er=validate(i,d);if(er){show(i,0);formErr(form,er);return null}}return d};
  form._tryNext=tryNext;
  show(0,0);
}
function initKlondike(){
  $('#bookDate').min=$('#banqDate').min=isoToday();$('#bookDate').value=isoToday();
  const tt=[];for(let h=12;h<=23;h++){tt.push(h+':00');if(h<23)tt.push(h+':30')}
  $('#bookTime').innerHTML=tt.map(t=>`<option${t==='19:00'?' selected':''}>${t}</option>`).join('');
  $('#bookGuests').innerHTML=[1,2,3,4,5,6,7,8,9,10,11,12].map(n=>`<option${n===2?' selected':''}>${n}</option>`).join('')+'<option>больше 12</option>';
  $('#banqHall').innerHTML=HALLS.map(h=>`<option>${esc(h.n)} (${esc(h.cap)})</option>`).join('')+'<option>Подобрать по числу гостей</option>';
  $('#afisha').innerHTML=EVENTS.map((ev,i)=>{const day=ev.iso.slice(8).replace(/^0/,'');return `<article class="ev"><div class="ev-d"><b>${day}</b><span>${esc(ev.d.split(',')[0])} · ${ev.d.replace(/^.*\d+\s/,'')} · ${ev.t}</span></div><h3>${esc(ev.n)}</h3><p>${esc(ev.s)}</p><button class="btn amber-o sm" data-ev="${i}">Стол на этот вечер</button></article>`}).join('');
  $('#halls').innerHTML=HALLS.map(h=>`<article class="hall"><figure class="pframe"><img src="img/${h.ph}.jpg" data-photo="${h.ph}" alt="${esc(h.n)}" loading="lazy"></figure><div><h4>${esc(h.n)}</h4><p class="cap2">${esc(h.cap)}</p><p class="mut">${esc(h.d)}</p></div><button class="btn amber-o sm" data-hall="${esc(h.id)}">Выбрать для банкета</button></article>`).join('');
  $('#sets').innerHTML=SETS.map(s=>`<article class="set"><h4>Сет ${esc(s.n)}</h4><div class="price">${s.pp} <small>/ чел.</small></div><ul>${s.items.map(x=>`<li>${esc(x)}</li>`).join('')}</ul><p class="mut">Расчёт: ${esc(s.calc)}</p></article>`).join('');

  /* лента афиши: стрелки листают на одну карточку */
  $$('[data-afs]').forEach(b=>b.addEventListener('click',()=>{const a=$('#afisha'),c=$('.ev',a);a.scrollBy({left:(+b.dataset.afs)*(c?c.offsetWidth+18:320),behavior:RM?'auto':'smooth'})}));

  const bookF=$('#bookForm'), banqF=$('#banqForm');
  stepper(bookF,(i,d)=>i===0?(!d.date?'Выберите дату':d.date<isoToday()?'Дата уже прошла':''):i===2?(d.name.trim().length<2?'Укажите имя':digits(d.phone)<10?'Укажите телефон: не меньше 10 цифр':''):'');
  stepper(banqF,(i,d)=>{const n=parseInt(d.guests,10);return i===0?(!d.date?'Выберите дату':d.date<isoToday()?'Дата уже прошла':!(n>=5&&n<=150)?'Количество гостей: от 5 до 150':''):i===2?(d.name.trim().length<2?'Укажите имя':digits(d.phone)<10?'Укажите телефон: не меньше 10 цифр':''):''});

  $('#afisha').addEventListener('click',e=>{const b=e.target.closest('[data-ev]');if(!b)return;const ev=EVENTS[+b.dataset.ev];$('#bookDate').value=ev.iso;$('#bookTime').value=ev.t;$('.okbox',bookF).hidden=true;bookF._go(1);scrollToId('kd-book');toast('Дата и время подставлены: '+ev.d+', '+ev.t)});
  $('#halls').addEventListener('click',e=>{const b=e.target.closest('[data-hall]');if(!b)return;const i=HALLS.findIndex(h=>h.id===b.dataset.hall);$('#banqHall').selectedIndex=i;$('.okbox',banqF).hidden=true;banqF._go(1);scrollToId('banqForm');toast('Выбран зал: '+HALLS[i].n)});

  bookF.addEventListener('submit',e=>{
    e.preventDefault();const f=e.target;
    if(!f._last()){f._tryNext();return}   // Enter на промежуточном шаге = «Далее»
    const d=f._check();if(!d)return;
    const b={no:++BOOK_NO,src:'site',name:d.name.trim(),phone:d.phone.trim(),date:fmtIso(d.date),time:d.time,guests:d.guests,wish:d.wish==='Без пожеланий'?'':d.wish};
    adminBooking(b);
    const ok=$('.okbox',f);ok.hidden=false;ok.innerHTML=`Заявка на бронь №Б-${b.no} отправлена: ${b.date}, ${b.time}, гостей ${esc(b.guests)}. Администратор подтвердит звонком.<br><button type="button" class="btn amber sm" data-go="bot">Посмотреть в чате админов</button>`;
    anim(ok,{opacity:[0,1],y:[12,0]},{duration:.5});
    $('[name=name]',f).value='';$('[name=phone]',f).value='';f._go(0);
  });
  banqF.addEventListener('submit',e=>{
    e.preventDefault();const f=e.target;
    if(!f._last()){f._tryNext();return}
    const d=f._check();if(!d)return;const n=parseInt(d.guests,10);
    const q={no:++BANQ_NO,src:'site',name:d.name.trim(),phone:d.phone.trim(),date:fmtIso(d.date),guests:String(n),reason:d.reason,hall:d.hall,comment:d.comment.trim()};
    adminBanquet(q);
    const ok=$('.okbox',f);ok.hidden=false;ok.innerHTML=`Заявка на банкет №${q.no} отправлена. Менеджер перезвонит в течение часа. Если не перезвонит, бот напомнит администраторам.<br><button type="button" class="btn amber sm" data-go="bot">Посмотреть в чате админов</button>`;
    anim(ok,{opacity:[0,1],y:[12,0]},{duration:.5});
    f.reset();f._go(0);
  });
}

/* ---------- отзывы ---------- */
function renderReviews(){
  $('#revs').innerHTML=REVIEWS.map(r=>`<article class="rev">${r.q?`<q>${esc(r.q)}</q>`:''}${r.t?`<p>${esc(r.t)}</p>`:''}<p class="by"><b>${esc(r.a)}</b> · ${esc(r.d)} · <a href="${r.u}" target="_blank" rel="noopener">${r.s}</a></p></article>`).join('');
}

/* ====================== ИМИТАЦИЯ TELEGRAM ====================== */
let ORDER_NO=120, BOOK_NO=40, BANQ_NO=10, tgStarted=false, panel='g', botVisible=false;
const B={cart:{},o:{},bk:{},bq:{},phone:'',expect:null,next:null,fbOrder:null};
const DEMO_PHONE='+7 900 123-45-67', GUEST='Анна (@anna_tmb)', ADMIN='Ольга';
const isMobile=()=>window.matchMedia('(max-width:860px)').matches;
function panelVisible(w){return botVisible&&(!isMobile()||panel===w)}
function box(w){return $('#'+(w==='g'?'tgG':'tgA')+' .tg-msgs')}
function msg(w,html,opt={}){
  const m=document.createElement('div');m.className='tg-m'+(opt.me?' me':'')+(opt.sys?' sys':'');
  fill(m,html,opt.kb);const b=box(w);b.appendChild(m);b.scrollTop=b.scrollHeight;
  if(FX&&panelVisible(w))M.animate(m,{opacity:[0,1],y:[10,0]},{duration:.3,ease:EASE});
  if(w==='a'&&!panelVisible('a')) bumpAdm();
  return m;
}
function fill(m,html,kb,edited){
  m.innerHTML=`<div class="tg-b">${html}<span class="tg-time">${hm(new Date())}${edited?' · изм.':''}</span></div>`;
  if(kb&&kb.length){const k=document.createElement('div');k.className='tg-kb';
    kb.forEach(r=>{const row=document.createElement('div');row.className='tg-row';
      r.forEach(bt=>{let el;
        if(bt.url){el=document.createElement('a');el.href=bt.url;el.target='_blank';el.rel='noopener';el.textContent=bt.t+' ↗'}
        else{el=document.createElement('button');el.type='button';el.textContent=bt.t;el.addEventListener('click',()=>bt.f&&bt.f(el))}
        el.className='tg-btn'+(bt.on?' on':'');row.appendChild(el)});
      k.appendChild(row)});
    m.appendChild(k)}
  const b=m.parentNode;if(b)b.scrollTop=b.scrollHeight;
}
const say=(html,kb)=>msg('g',html,{kb});
const sys=(w,html)=>msg(w,html,{sys:true});
function cbToast(w,t){const p=$(w==='g'?'#tgG':'#tgA');let el=$('.tg-toast',p);if(!el){el=document.createElement('div');el.className='tg-toast';p.appendChild(el)}el.textContent=t;el.hidden=false;clearTimeout(el._t);el._t=setTimeout(()=>el.hidden=true,1800)}
function hint(t){$('#tgHint').textContent=t}
let admCount=0;
function bumpAdm(){admCount++;const a=$('#admBdg');a.textContent=admCount;a.hidden=false;if(!botVisible){const n=$('#navBdg');n.textContent=admCount;n.hidden=false}}
function clearNavBadge(){$('#navBdg').hidden=true;if(!isMobile()||panel==='a'){admCount=0;$('#admBdg').hidden=true}}
function showPanel(w){panel=w;$$('.tg-switch button').forEach(b=>b.classList.toggle('on',b.dataset.panel===w));$('#tgG').classList.toggle('mhide',w!=='g');$('#tgA').classList.toggle('mhide',w!=='a');if(w==='a'){admCount=0;$('#admBdg').hidden=true}const b=box(w);b.scrollTop=b.scrollHeight}
$$('.tg-switch button').forEach(b=>b.addEventListener('click',()=>showPanel(b.dataset.panel)));

/* reply-клавиатура и ввод текста */
function replyKb(rows){const r=$('#tgG .tg-reply');r.innerHTML='';if(!rows){r.hidden=true;return}
  rows.forEach(row=>{const d=document.createElement('div');d.className='tg-row';row.forEach(t=>{const b=document.createElement('button');b.type='button';b.textContent=t;b.addEventListener('click',()=>userText(t));d.appendChild(b)});r.appendChild(d)});r.hidden=false}
$('#tgG .tg-in').addEventListener('submit',e=>{e.preventDefault();const i=$('input',e.target),t=i.value.trim();if(!t)return;i.value='';userText(t)});
$('#tgG [data-cmd]').addEventListener('click',()=>userText('/start'));
$('#tgReset').addEventListener('click',()=>{tgReset();toast('Демо начато заново')});

function userText(t){
  let shown=t;
  if(t==='📱 Отправить мой номер'){shown='📱 Контакт: '+DEMO_PHONE;t=DEMO_PHONE}
  msg('g',esc(shown),{me:true});
  if(t==='/start'||t.toLowerCase()==='старт'){start();return}
  const ex=B.expect;
  if(ex==='addr'){if(t.length<5){say('Похоже, адрес неполный. Напишите улицу и дом.');return}B.o.addr=t;B.expect=null;replyKb(null);askTime();return}
  if(ex==='phone'){if(digits(t)<10){say('В номере должно быть не меньше 10 цифр. Попробуйте ещё раз или нажмите кнопку ниже.');return}
    B.phone=t;B.expect=null;replyKb(null);const n=B.next;B.next=null;n&&n();return}
  if(ex==='bqdate'){B.bq.date=t;B.expect=null;replyKb(null);bqGuests();return}
  if(ex==='bqname'){B.bq.name=t;B.expect=null;replyKb(null);askPhone(bqConfirm);return}
  if(ex==='complaint'){B.expect=null;replyKb(null);complaint(B.fbOrder,t);return}
  say('Я понимаю кнопки 🙂 Выберите, что нужно:',mainKb());
}

/* главное меню бота */
const cartCnt=()=>{const n=Object.values(B.cart).reduce((a,b)=>a+b,0);return n?` (${n})`:''};
function mainKb(){return [[{t:'🍕 Меню и заказ «Колибри»',f:cats}],[{t:'🪑 Бронь стола',f:()=>bookStart()},{t:'🎸 Афиша',f:afisha}],[{t:'🥂 Банкет',f:banqStart},{t:'🛒 Корзина'+cartCnt(),f:showCart}]]}
function start(){B.expect=null;replyKb(null);say('Здравствуйте! 👋 Я бот <b>«Колибри»</b> и <b>«Клондайка»</b>.<br>Здесь можно заказать пиццу и блюда «Колибри» с доставкой или самовывозом, забронировать стол в «Клондайке», посмотреть афишу живой музыки и оставить заявку на банкет.',mainKb())}

/* заказ */
function cats(){say('Выберите категорию:',MENU.map(c=>[{t:`${c.e} ${c.t}`,f:()=>catItems(c)}]).concat([[{t:'🛒 Корзина'+cartCnt(),f:showCart},{t:'⬅️ В начало',f:start}]]))}
function catItems(c){say(`<b>${c.e} ${esc(c.t)}</b><br>Выберите блюдо:`,c.items.map(i=>[{t:`${i.hit?'⭐ ':''}${i.n} · ${i.w} · ${rub(i.p)}`,f:()=>item(i)}]).concat([[{t:'⬅️ Категории',f:cats},{t:'🛒 Корзина'+cartCnt(),f:showCart}]]))}
function bAdd(id,d){const q=(B.cart[id]||0)+d;if(q<=0)delete B.cart[id];else B.cart[id]=Math.min(q,99)}
function item(i){
  const html=`<b>${esc(i.n)}</b>${i.hit?' ⭐ хит':''}<br>${esc(i.d)}<br>${i.w} · <b>${rub(i.p)}</b>`;
  const m=say(html);
  const upd=()=>{const q=B.cart[i.id]||0;const rows=[];
    if(q) rows.push([{t:'➖',f:()=>{bAdd(i.id,-1);upd()}},{t:`В корзине: ${q}`,f:showCart},{t:'➕',f:()=>{bAdd(i.id,1);upd()}}]);
    else rows.push([{t:'➕ В корзину',f:()=>{bAdd(i.id,1);cbToast('g','✅ '+i.n+' в корзине');upd()}}]);
    rows.push([{t:'⬅️ '+i.cat.t.split(' ')[0],f:()=>catItems(i.cat)},{t:'🛒 Оформить'+cartCnt(),f:showCart}]);
    fill(m,html,rows,q>0)};
  upd();
}
function cartLines(c){let s=0;const l=Object.keys(c).map(id=>{const it=ITEMS[id],q=c[id];s+=it.p*q;return `• ${esc(it.n)} × ${q} = ${rub(it.p*q)}`}).join('<br>');return {l,s}}
function showCart(){
  const m=say('');
  const upd=(ed)=>{const ids=Object.keys(B.cart);
    if(!ids.length){fill(m,'🛒 Корзина пуста.',[[{t:'🍕 Открыть меню',f:cats}]],ed);return}
    const {l,s}=cartLines(B.cart);
    const rows=ids.map(id=>{const it=ITEMS[id];return [{t:'➖',f:()=>{bAdd(id,-1);upd(1)}},{t:`${it.n} × ${B.cart[id]}`,f:()=>cbToast('g',it.n+': '+rub(it.p)+' за шт.')},{t:'➕',f:()=>{bAdd(id,1);upd(1)}},{t:'✖',f:()=>{delete B.cart[id];cbToast('g','Удалено: '+it.n);upd(1)}}]});
    rows.push([{t:'✅ Оформить заказ',f:checkout}]);
    rows.push([{t:'🍕 Добавить ещё',f:cats},{t:'🗑 Очистить',f:()=>{B.cart={};upd(1)}}]);
    fill(m,`🛒 <b>Ваша корзина</b><br>${l}<br><b>Итого: ${rub(s)}</b>`,rows,ed)};
  upd(0);
}
function checkout(){
  if(!Object.keys(B.cart).length){say('Корзина пуста.',[[{t:'🍕 Меню',f:cats}]]);return}
  B.o={};say('Как получить заказ?',[[{t:'🏃 Самовывоз — Гастелло, 57А',f:()=>{B.o.mode='pickup';askTime()}}],[{t:'🚗 Доставка',f:()=>{B.o.mode='delivery';askAddr()}}]]);
}
function askAddr(){B.expect='addr';say('Напишите адрес доставки: улица, дом, подъезд, квартира.');replyKb([['ул. Советская, 120, под. 2, кв. 15']])}
function askTime(){B.expect=null;replyKb(null);const st=t=>()=>{B.o.time=t;askPhone(confirmOrder)};
  say('Когда приготовить?',[[{t:'⚡ Как можно скорее',f:st('как можно скорее')}],[{t:'Через 1 час',f:st('через 1 час')},{t:'К 19:00',f:st('к 19:00')},{t:'К 20:00',f:st('к 20:00')}]])}
function askPhone(next){
  B.expect='phone';B.next=next;
  if(B.phone) say(`Номер для связи: <b>${esc(B.phone)}</b>. Верно?`,[[{t:'✅ Да',f:()=>{if(B.expect!=='phone')return;B.expect=null;replyKb(null);const n=B.next;B.next=null;n&&n()}}]]);
  else say('Оставьте номер телефона: нажмите кнопку ниже или напишите его.');
  replyKb([['📱 Отправить мой номер']]);
}
function confirmOrder(){
  const {l,s}=cartLines(B.cart);
  if(!s){say('Корзина пуста.',[[{t:'🍕 Меню',f:cats}]]);return}
  if(B.o.mode==='delivery'&&s<DELIV.min){say(`Доставка от ${rub(DELIV.min)} (условие-пример). Добавьте блюда или заберите сами.`,[[{t:'🍕 Добавить',f:cats},{t:'🏃 Самовывоз',f:()=>{B.o.mode='pickup';confirmOrder()}}]]);return}
  const fee=B.o.mode==='delivery'&&s<DELIV.free?DELIV.fee:0;B.o.sum=s+fee;B.o.fee=fee;
  const html=`<b>Проверьте заказ</b><br>${l}<br>${fee?`Доставка: ${rub(fee)} <i>(пример)</i><br>`:''}<b>Итого: ${rub(s+fee)}</b><br>${B.o.mode==='delivery'?'🚗 Доставка: '+esc(B.o.addr):'🏃 Самовывоз: Гастелло, 57А'}<br>🕒 ${esc(B.o.time)}<br>📞 ${esc(B.phone)}`;
  const m=say(html);
  fill(m,html,[[{t:'✅ Подтвердить',f:()=>{fill(m,html+'<br><i>✅ подтверждено</i>',null,1);placeOrder()}}],[{t:'✏️ Изменить корзину',f:()=>{fill(m,html,null,1);showCart()}},{t:'❌ Отмена',f:()=>{fill(m,html+'<br><i>❌ отменено</i>',null,1);say('Заказ отменён, корзина сохранена.',mainKb())}}]]);
}
function placeOrder(){
  const o={no:++ORDER_NO,src:'tg',name:GUEST,phone:B.phone,mode:B.o.mode,addr:B.o.addr||'',time:B.o.time,comment:'',items:{...B.cart},sum:B.o.sum,fee:B.o.fee,st:'new'};
  B.cart={};
  say(`🧾 Заказ <b>№${o.no}</b> отправлен в «Колибри».<br>Статус: ⏳ ждём подтверждения администратора.`);
  adminOrder(o);
  hint(isMobile()?'Переключитесь на «Чат админов» и нажмите «Принят», потом «Готов» и «Отдан».':'В чате админов справа нажмите «Принят», потом «Готов» и «Отдан».');
}

/* заказ в чате админов */
const ST_ORDER=['new','acc','ready','done'], ST_NAME={new:'🆕 новый',acc:'✅ принят',ready:'👨‍🍳 готов',done:'📦 отдан'}, ST_BTN={acc:'Принят',ready:'Готов',done:'Отдан'};
function adminOrder(o){
  const m=msg('a','');o.log='';
  const html=()=>`🆕 <b>Новый заказ №${o.no}</b> · ${o.src==='tg'?'Telegram':'сайт'}<br>👤 ${esc(o.name)}, ${esc(o.phone)}<br>${o.mode==='delivery'?'🚗 Доставка: '+esc(o.addr):'🏃 Самовывоз'} · 🕒 ${esc(o.time)}<br>${cartLines(o.items).l}${o.fee?`<br>Доставка: ${rub(o.fee)}`:''}<br><b>Итого: ${rub(o.sum)}</b>${o.comment?'<br>💬 '+esc(o.comment):''}<br>Статус: <b>${ST_NAME[o.st]}</b>${o.log}`;
  const kb=()=>o.st==='done'?null:[['acc','ready','done'].map(s=>({t:(ST_ORDER.indexOf(o.st)>=ST_ORDER.indexOf(s)?'✔ ':'')+ST_BTN[s],on:o.st===s,f:()=>setSt(s)}))];
  function setSt(s){
    const cur=ST_ORDER.indexOf(o.st),nx=ST_ORDER.indexOf(s);
    if(nx<=cur){cbToast('a','Этот статус уже стоит');return}
    if(nx>cur+1){cbToast('a','Сначала нажмите «'+ST_BTN[ST_ORDER[cur+1]]+'»');return}
    o.st=s;o.log+=`<br>• ${ST_NAME[s]}: ${ADMIN}, ${hm(new Date())}`;fill(m,html(),kb(),1);
    cbToast('a','Статус: '+ST_NAME[s]);guestStatus(o);
    if(s==='done'){sys('a',`⏰ Через 2 часа бот спросит гостя «Как вам?» (в демо через 5 секунд)`);setTimeout(()=>feedbackAsk(o),5000)}
  }
  fill(m,html(),kb());
}
function guestStatus(o){
  if(o.src!=='tg'){sys('a','Заказ с сайта: администратор сообщает статус гостю по телефону.');return}
  const t={acc:`✅ Заказ <b>№${o.no}</b> принят! Готовим, это займёт 30–40 минут.`,
           ready:o.mode==='delivery'?`👨‍🍳 Заказ <b>№${o.no}</b> готов, курьер выезжает.`:`👨‍🍳 Заказ <b>№${o.no}</b> готов! Ждём вас на Гастелло, 57А.`,
           done:`📦 Заказ <b>№${o.no}</b> ${o.mode==='delivery'?'доставлен':'выдан'}. Приятного аппетита! 🍕`}[o.st];
  say(t);
  if(!panelVisible('g')) cbToast('a','Гостю ушло: '+ST_NAME[o.st]);
}

/* «как вам?» */
const reviewKb=()=>[[{t:'⭐ Яндекс Карты',url:Y_URL},{t:'⭐ 2ГИС',url:G_URL}]];
function feedbackAsk(o){
  if(o.src!=='tg'){sys('a',`Гостю заказа №${o.no} (с сайта) в боевой версии уйдёт SMS со ссылкой на отзыв.`);return}
  const html=`Как вам заказ <b>№${o.no}</b>? Оцените, пожалуйста 🙏`;const m=say(html);
  const pick=(mark,bad)=>()=>{fill(m,html+`<br><i>Ваша оценка: ${mark}</i>`,null,1);if(bad)fbBad(o);else fbGood(o,mark)};
  fill(m,html,[[{t:'😍 Отлично',f:pick('😍 отлично')},{t:'🙂 Нормально',f:pick('🙂 нормально')}],[{t:'😞 Есть жалоба',f:pick('😞 есть жалоба',1)}]]);
  if(isMobile()&&panel!=='g') cbToast('a','Гостю пришёл вопрос «Как вам?»: откройте вкладку «Гость»');
  hint('Бот спросил гостя «Как вам?». Ответьте в чате гостя: при жалобе она сразу придёт админам.');
}
function fbGood(o,mark){msg('a',`💬 Гость оценил заказ №${o.no}: <b>${mark}</b>`);say('Спасибо! Будем рады короткому отзыву на картах, он очень помогает кафе ⭐',reviewKb())}
function fbBad(o){B.expect='complaint';B.fbOrder=o;say('Нам очень жаль 😔 Напишите, что пошло не так. Сообщение сразу получит администратор.');replyKb([['Пицца приехала холодной'],['Долго ждали заказ']])}
function complaint(o,t){
  const m=msg('a','');const html=st=>`⚠️ <b>Жалоба по заказу №${o.no}</b><br>👤 ${esc(o.name)}, ${esc(o.phone)}<br>«${esc(t)}»${st?'<br>'+st:''}`;
  fill(m,html(),[[{t:'📞 Позвонить гостю',f:()=>cbToast('a','Звоним '+o.phone+' (демо)')},{t:'✅ Решено',f:()=>{fill(m,html(`✅ Решено: ${ADMIN}, ${hm(new Date())}`),null,1);say(`Администратор отметил, что вопрос по заказу №${o.no} решён. Спасибо, что сообщили!`)}}]]);
  say('Спасибо, передали администратору, он свяжется с вами. Если захотите, оставьте отзыв на картах, мы читаем все:',reviewKb());
  hint('Жалоба пришла в чат админов. Там можно нажать «Решено».');
}

/* бронь стола */
function nextDays(n){const r=[],wd=['вс','пн','вт','ср','чт','пт','сб'];for(let i=0;i<n;i++){const d=new Date();d.setDate(d.getDate()+i);const s=String(d.getDate()).padStart(2,'0')+'.'+String(d.getMonth()+1).padStart(2,'0');r.push(i===0?'Сегодня, '+s:i===1?'Завтра, '+s:wd[d.getDay()]+', '+s)}return r}
function bookStart(date){
  B.bk={};B.expect=null;replyKb(null);
  if(date){B.bk.date=date;bookTime();return}
  const ds=nextDays(4),pick=d=>({t:d,f:()=>{B.bk.date=d;bookTime()}});
  say('🪑 <b>Бронь стола в «Клондайке»</b><br>На какой день?',[[pick(ds[0]),pick(ds[1])],[pick(ds[2]),pick(ds[3])]]);
}
function bookTime(){say(`📅 ${esc(B.bk.date)}. Во сколько?`,[['18:00','19:00','20:00','21:00'].map(t=>({t,f:()=>{B.bk.time=t;bookGuests()}}))])}
function bookGuests(){say('Сколько будет гостей?',[['2','3–4','5–6','7+'].map(g=>({t:g,f:()=>{B.bk.guests=g;askPhone(bookConfirm)}}))])}
function bookConfirm(){
  const html=`<b>Проверьте бронь</b><br>📅 ${esc(B.bk.date)}, ${esc(B.bk.time)}<br>👥 Гостей: ${esc(B.bk.guests)}<br>📞 ${esc(B.phone)}`;const m=say(html);
  fill(m,html,[[{t:'✅ Отправить',f:()=>{fill(m,html+'<br><i>✅ отправлено</i>',null,1);bookSend()}},{t:'❌ Отмена',f:()=>{fill(m,html+'<br><i>❌ отменено</i>',null,1);say('Бронь отменена.',mainKb())}}]]);
}
function bookSend(){const b={no:++BOOK_NO,src:'tg',name:GUEST,phone:B.phone,date:B.bk.date,time:B.bk.time,guests:B.bk.guests,wish:''};
  say(`📨 Заявка на бронь <b>№Б-${b.no}</b> отправлена. Ждём подтверждения администратора.`);adminBooking(b);hint('Бронь пришла в чат админов. Подтвердите её или нажмите «Нет мест».')}
function adminBooking(b){
  const m=msg('a','');
  const html=()=>`🪑 <b>Бронь стола №Б-${b.no}</b> · ${b.src==='tg'?'Telegram':'сайт'}<br>📅 ${esc(b.date)}, ${esc(b.time)} · 👥 ${esc(b.guests)}<br>👤 ${esc(b.name)}, ${esc(b.phone)}${b.wish?'<br>💬 '+esc(b.wish):''}<br>Статус: <b>${b.st||'🆕 новая'}</b>`;
  const dec=ok=>()=>{if(b.st){cbToast('a','Уже обработана');return}
    b.st=(ok?'✅ подтверждена':'❌ нет мест')+`: ${ADMIN}, ${hm(new Date())}`;fill(m,html(),null,1);
    if(b.src==='tg') say(ok?`✅ Бронь <b>№Б-${b.no}</b> подтверждена! Ждём вас ${esc(b.date)} в ${esc(b.time)}. Держим стол 15 минут.`:`😔 На ${esc(b.date)}, ${esc(b.time)} мест нет. Выберите другое время:`,ok?mainKb():[[{t:'🪑 Другое время',f:()=>bookStart()}]]);
    else sys('a','Бронь с сайта: администратор перезванивает гостю.')};
  fill(m,html(),[[{t:'✅ Подтвердить',f:dec(true)},{t:'❌ Нет мест',f:dec(false)}]]);
}

/* афиша */
function afisha(){say('🎸 <b>Афиша живой музыки «Клондайка»</b> <i>(пример)</i>');EVENTS.forEach(ev=>say(`<b>${ev.d}, ${ev.t}</b><br>${esc(ev.n)}<br><i>${esc(ev.s)}</i>`,[[{t:'🪑 Стол на этот вечер',f:()=>bookStart(ev.d)}]]))}

/* банкет */
function banqStart(){
  B.bq={};B.expect='bqdate';
  say(`🥂 <b>Банкет в «Клондайке»</b><br>Залы <i>(пример)</i>: ${HALLS.map(h=>esc(h.n)+' — '+esc(h.cap)).join('; ')}.<br>Меню на человека: от ${SETS[0].pp} <i>(пример)</i>.<br><br>На какую дату? Напишите, например, <i>21.11</i>.`);
  replyKb([['14.11 (сб)','21.11 (сб)'],['28.11 (сб)']]);
}
function bqGuests(){const p=g=>({t:g,f:()=>{B.bq.guests=g;bqReason()}});say(`📅 ${esc(B.bq.date)}. Сколько будет гостей?`,[[p('до 15'),p('15–30')],[p('30–50'),p('50+')]])}
function bqReason(){const p=r=>({t:r,f:()=>{B.bq.reason=r;B.expect='bqname';say('Как к вам обращаться?');replyKb([['Анна']])}});
  say('Какой повод?',[[p('🎂 День рождения'),p('💼 Корпоратив')],[p('💍 Свадьба'),p('🎓 Выпускной')],[p('Другое')]])}
function bqConfirm(){
  const q=B.bq,html=`<b>Заявка на банкет</b><br>📅 ${esc(q.date)} · 👥 ${esc(q.guests)}<br>Повод: ${esc(q.reason)}<br>👤 ${esc(q.name)}, ${esc(B.phone)}`;const m=say(html);
  fill(m,html,[[{t:'✅ Отправить',f:()=>{fill(m,html+'<br><i>✅ отправлено</i>',null,1);
    const o={no:++BANQ_NO,src:'tg',name:q.name+' (@anna_tmb)',phone:B.phone,date:q.date,guests:q.guests,reason:q.reason,hall:'',comment:''};
    say(`📨 Заявка на банкет <b>№${o.no}</b> отправлена. Менеджер позвонит в течение часа.`);adminBanquet(o);
    hint('Заявка пришла в чат админов. Если не нажать «Взял в работу», через 10 секунд (в жизни через час) бот напомнит.')}},
   {t:'❌ Отмена',f:()=>{fill(m,html+'<br><i>❌ отменено</i>',null,1);say('Заявка отменена.',mainKb())}}]]);
}
function adminBanquet(q){
  const m=msg('a','');
  const html=()=>`🥂 <b>Заявка на банкет №${q.no}</b> · ${q.src==='tg'?'Telegram':'сайт'}<br>📅 ${esc(q.date)} · 👥 ${esc(q.guests)}<br>Повод: ${esc(q.reason)}${q.hall?'<br>Зал: '+esc(q.hall):''}<br>👤 ${esc(q.name)}, ${esc(q.phone)}${q.comment?'<br>💬 '+esc(q.comment):''}<br>Статус: <b>${q.st||'🆕 ждёт ответа'}</b>`;
  const take=()=>{if(q.st){cbToast('a','Уже в работе');return}clearTimeout(q.timer);
    q.st=`🤝 в работе: ${ADMIN}, ${hm(new Date())}`;fill(m,html(),null,1);if(q.rm)fill(q.rm,'⏰ Напоминание снято: заявку взяли в работу.',null,1);
    if(q.src==='tg') say(`🥂 Заявку на банкет <b>№${q.no}</b> взял менеджер ${ADMIN}. Она позвонит, чтобы обсудить зал и меню.`)};
  fill(m,html(),[[{t:'🤝 Взял в работу',f:take}]]);
  q.timer=setTimeout(()=>{if(q.st)return;q.rm=msg('a',`⏰ <b>Напоминание:</b> заявка на банкет №${q.no} (${esc(q.date)}, ${esc(q.guests)} гостей) уже час без ответа <i>(в демо 10 секунд)</i>.`,{kb:[[{t:'🤝 Взять в работу',f:take}]]})},10000);
}

function tgReset(){
  tgStarted=true;Object.assign(B,{cart:{},o:{},bk:{},bq:{},phone:'',expect:null,next:null,fbOrder:null});
  box('g').innerHTML='';box('a').innerHTML='';replyKb(null);
  sys('a','Бот добавлен в группу. Сюда приходят заказы, брони, заявки на банкеты и жалобы. Кнопки могут нажимать только участники этой группы.');
  admCount=0;$('#admBdg').hidden=true;$('#navBdg').hidden=true;
  msg('g','/start',{me:true});start();showPanel('g');
  hint('Начните с кнопки «Меню и заказ „Колибри“» в чате гостя.');
}

/* раздел бота в зоне видимости: бейджи и плашка корзины */
function initBotSpy(){
  new IntersectionObserver(es=>{es.forEach(en=>{botVisible=en.isIntersecting;if(botVisible)clearNavBadge();updateCartBar()})},{threshold:.15}).observe($('#bot'));
}

/* ====================== АНИМАЦИИ (Motion) ====================== */
function initPreloader(){
  const p=$('#pre');
  let done=false;
  function finish(){
    if(done)return;done=true;
    if(p){if(FX){M.animate(p,{opacity:0},{duration:.3,ease:'easeOut'});setTimeout(()=>p.remove(),330)}else p.remove()}
    heroIntro();
  }
  if(!FX){finish();return}
  /* весь прелоадер — не дольше 1,2 с от начала загрузки */
  const t=performance.now();
  setTimeout(finish,Math.max(0,850-t));
  window.addEventListener('load',()=>setTimeout(finish,Math.max(0,450-performance.now())));
  M.animate($$('.pre-in > *'),{opacity:[0,1],y:[10,0]},{duration:.45,delay:M.stagger(.08),ease:EASE});
}

function heroIntro(){
  if(!FX)return;
  const h=$('#heroH');
  M.animate($$('.w',h),{opacity:[0,1],y:[24,0]},{duration:.8,delay:M.stagger(.07,{startDelay:.1}),ease:EASE});
  M.animate($$('[data-hero]'),{opacity:[0,1],y:[18,0]},{duration:.8,delay:M.stagger(.12,{startDelay:.55}),ease:EASE});
}

function initFx(){
  if(!FX)return;
  const {animate,inView,scroll,stagger}=M;

  /* исходное скрытое состояние — только из JS */
  const h=$('#heroH'), text=h.textContent.trim();
  h.setAttribute('aria-label',text);
  h.innerHTML=text.split(/\s+/).map(w=>`<span class="w" aria-hidden="true">${esc(w)}</span>`).join(' ');
  const hide=(els,y)=>els.forEach(el=>{el.style.opacity='0';el.style.transform=`translateY(${y}px)`});
  hide($$('.w',h),24);hide($$('[data-hero]'),18);

  /* Ken Burns: медленное приближение фото первого экрана */
  /* не больше 1.06, чтобы фото не «мылилось» сверх родного размера */
  const hp=$('#heroImg')||$('.hero-ph > .ph');
  if(hp)animate(hp,{scale:[1,1.06]},{duration:20,ease:'linear'});

  /* первый экран при прокрутке: фото уходит медленнее, текст гаснет */
  const hero=$('#top'), heroPh=$('.hero-ph'), heroIn=$('#heroIn');
  scroll(p=>{heroPh.style.transform=`translateY(${p*22}%)`;heroIn.style.opacity=String(Math.max(0,1-p*1.6));heroIn.style.transform=`translateY(${-p*70}px)`},{target:hero,offset:['start start','end start']});

  /* фон перетекает: «Колибри» (крем) → «Клондайк» (почти чёрный) → бот (снова крем) */
  const wd=$('#worldD');let pIn=0,pOut=0;
  const setW=()=>{wd.style.opacity=String(pIn*(1-pOut))};
  scroll(p=>{pIn=p;setW()},{target:$('#klondike'),offset:['start 0.95','start 0.35']});
  scroll(p=>{pOut=p;setW()},{target:$('#bot'),offset:['start 0.95','start 0.4']});

  /* блоки появляются при прокрутке */
  $$('[data-reveal]').forEach(el=>{
    hide([el],32);
    inView(el,()=>{animate(el,{opacity:[0,1],y:[32,0]},{duration:.9,ease:EASE})},{margin:'0px 0px -12% 0px'});
  });
  $$('[data-stagger]').forEach(g=>{
    const kids=[...g.children];if(!kids.length)return;
    hide(kids,26);
    inView(g,()=>{animate(kids,{opacity:[0,1],y:[26,0]},{duration:.75,delay:stagger(.07),ease:EASE})},{margin:'0px 0px -10% 0px'});
  });

  /* лёгкий параллакс фото внутри рамок */
  $$('[data-parallax]').forEach(fr=>{
    const r=fr.dataset.parallax==='slow'?3.5:6;
    scroll(p=>{const im=fr.firstElementChild;if(im)im.style.transform=`translateY(${(-r+2*r*p).toFixed(2)}%)`},{target:fr,offset:['start end','end start']});
  });
}

/* ---------- запуск ---------- */
renderMenu();
renderReviews();
initPizzas();
initKlondike();
initCatSpy();
initBotSpy();
initFx();
initPreloader();
tgReset();
updateCartBar();
onScroll();
/* старые ссылки вида index.html#kolibri / #bot продолжают работать */
(function(){const h=location.hash.slice(1);if(h){const id=GO_MAP[h]||h;if(document.getElementById(id)||id==='top')setTimeout(()=>scrollToId(id),FX?900:0)}})();
window.addEventListener('hashchange',()=>{const h=location.hash.slice(1);if(h)scrollToId(GO_MAP[h]||h)});
