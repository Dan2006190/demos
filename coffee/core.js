/* Демо «Заказ заранее + бонусы» — данные и правила. Без работы с разметкой:
   этот файл подключают index.html, admin.html и автотест (test.html / node tests.js).
   Всё состояние лежит одной записью в localStorage этого браузера. Меняется только через tx():
   запись перечитывается перед каждым изменением, поэтому вкладки гостя и бариста не затирают друг друга. */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;else root.Coffee=api;
})(typeof self!=='undefined'?self:this,function(){
'use strict';

/* ---------- условия программы: все значения — пример ---------- */
const RULES={
  stampEvery:6,        // каждый 6-й напиток в подарок
  pointsPct:5,         // баллы: 5% от оплаченного за товары
  pointsMaxShare:.3,   // баллами можно оплатить до 30% заказа
  deliveryFee:100,deliveryFree:500,deliveryLead:30,
  open:8*60,close:22*60,slotStep:10,slotLead:15,slotCount:18,
  absentDays:21
};
const KEY='coffee_demo_v1';

/* ---------- меню: названия и цены — пример ---------- */
const SIZES={
  std:[['250 мл',0],['350 мл',60],['450 мл',110]],
  esp:[['30 мл',0],['60 мл',50]],
  flt:[['250 мл',0],['350 мл',50]],
  ice:[['350 мл',0],['450 мл',50]]
};
const MILKS={
  white:[['обычное молоко',0],['безлактозное',40],['овсяное',60],['кокосовое',70]],
  black:[['без молока',0],['обычное молоко',20],['безлактозное',40],['овсяное',60]]
};
const SYRUPS=[['без сиропа',0],['ваниль',40],['карамель',40],['лесной орех',40],['кокос',40]];

/* [id, название, состав, выход, цена, размеры, молоко, сироп] */
const MENU=[
 {id:'coffee',t:'Кофе',drink:true,items:[
  ['c01','Эспрессо','плотный, с ореховой горчинкой','30 мл',130,'esp',null,false],
  ['c02','Американо','эспрессо и горячая вода','250 мл',150,'std','black',true],
  ['c03','Фильтр-кофе','зерно недели, заваривается порцией','250 мл',170,'flt','black',false],
  ['c04','Капучино','эспрессо и густая молочная пена','250 мл',190,'std','white',true],
  ['c05','Латте','больше молока, мягкий вкус','250 мл',210,'std','white',true],
  ['c06','Флэт уайт','двойной эспрессо, тонкая пена','250 мл',220,'std','white',true],
  ['c07','Айс-латте','эспрессо, молоко, лёд','350 мл',240,'ice','white',true],
  ['c08','Раф ванильный','взбитый со сливками и ванилью','250 мл',250,'std','white',true],
  ['c09','Мокко','эспрессо, молоко, тёмный шоколад','250 мл',260,'std','white',true]]},
 {id:'tea',t:'Чай',drink:true,items:[
  ['t01','Чёрный','листовой, заваривается в чайнике','400 мл',150],
  ['t02','Зелёный','листовой, заваривается в чайнике','400 мл',150],
  ['t03','Травяной','мята, чабрец, липа','400 мл',170],
  ['t04','Имбирный с лимоном','имбирь, лимон, мёд','400 мл',210],
  ['t05','Облепиховый','облепиха, апельсин, мёд','400 мл',220]]},
 {id:'breakfast',t:'Завтраки',items:[
  ['b01','Овсяная каша с ягодами','на молоке, ягоды, мёд','280 г',240],
  ['b02','Круассан с ветчиной и сыром','тёплый, из печи','170 г',280],
  ['b03','Омлет с сыром','три яйца, сыр, зелень, тост','240 г',290],
  ['b04','Сырники со сметаной','творог, сметана, ягодный соус','220 г',320],
  ['b05','Тост с авокадо','хлеб на закваске, авокадо, яйцо пашот','230 г',360],
  ['b06','Яйцо бенедикт','бриошь, ветчина, голландский соус','260 г',390]]},
 {id:'burger',t:'Бургеры',items:[
  ['u01','С курицей','куриное филе, салат, соус ранч','320 г',410],
  ['u02','Классический','говяжья котлета, томат, огурец, соус','340 г',420],
  ['u03','С грибами','говядина, шампиньоны, сливочный соус','350 г',430],
  ['u04','Чизбургер','говядина, чеддер, маринованный огурец','340 г',450]]},
 {id:'pizza',t:'Пицца',items:[
  ['p01','Маргарита','томатный соус, моцарелла, базилик','450 г',490],
  ['p02','Ветчина и грибы','ветчина, шампиньоны, моцарелла','500 г',540],
  ['p03','Пепперони','пепперони, моцарелла, томатный соус','500 г',590],
  ['p04','Четыре сыра','моцарелла, чеддер, пармезан, горгонзола','450 г',620]]},
 {id:'steak',t:'Стейки',items:[
  ['s01','Из индейки','филе бедра, овощи гриль','280 г',690],
  ['s02','Стриплойн','говядина, картофель, перечный соус','320 г',1150],
  ['s03','Рибай','говядина, овощи гриль, масло с травами','350 г',1290]]},
 {id:'dessert',t:'Десерты',items:[
  ['d01','Круассан','сливочный, из печи','70 г',150],
  ['d02','Брауни','тёмный шоколад, грецкий орех','90 г',230],
  ['d03','Медовик','сметанный крем','130 г',270],
  ['d04','Морковный торт','специи, сливочный сыр','130 г',280],
  ['d05','Чизкейк','классический, ягодный соус','130 г',290],
  ['d06','Тирамису','маскарпоне, савоярди, эспрессо','140 г',320]]}
].map(function(c){return {id:c.id,t:c.t,drink:!!c.drink,items:c.items.map(function(a){return {
  id:a[0],n:a[1],d:a[2],w:a[3],p:a[4],cat:c.id,drink:!!c.drink,
  sizes:a[5]?SIZES[a[5]]:null,milks:a[6]?MILKS[a[6]]:null,syrups:a[7]?SYRUPS:null,
  mods:!!a[5]
}})}});
const ITEMS={};MENU.forEach(function(c){c.items.forEach(function(i){ITEMS[i.id]=i})});

/* ---------- хранилище и часы (автотест подменяет их на свои) ---------- */
const mem={};
let store={
  getItem:function(k){let v=null;try{v=localStorage.getItem(k)}catch(e){}return v!==null?v:(k in mem?mem[k]:null)},
  setItem:function(k,v){try{localStorage.setItem(k,v)}catch(e){mem[k]=v}},
  removeItem:function(k){try{localStorage.removeItem(k)}catch(e){}delete mem[k]}
};
let clock=function(){return Date.now()};
const now=function(){return clock()};
const kvGet=function(k,d){try{const v=store.getItem(k);return v===null?d:JSON.parse(v)}catch(e){return d}};
const kvSet=function(k,v){store.setItem(k,JSON.stringify(v))};

/* ---------- мелкие утилиты ---------- */
const esc=function(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})};
const rub=function(n){return Number(n||0).toLocaleString('ru-RU').replace(/,/g,' ')+' ₽'};
const pad=function(n){return String(n).padStart(2,'0')};
const hm=function(ts){const d=new Date(ts);return pad(d.getHours())+':'+pad(d.getMinutes())};
const plural=function(n,a,b,c){n=Math.abs(n);return n%10===1&&n%100!==11?a:n%10>=2&&n%10<=4&&(n%100<12||n%100>14)?b:c};
const uid=function(p){return p+'-'+now().toString(36)+'-'+Math.random().toString(36).slice(2,7)};
const dayStart=function(ts){const d=new Date(ts);return new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime()};
const dayDiff=function(a,b){return Math.round((dayStart(a)-dayStart(b))/86400000)};
function dayWord(ts){
  const d=dayDiff(ts,now());
  if(d===0)return 'сегодня';if(d===1)return 'завтра';if(d===-1)return 'вчера';
  return new Date(ts).toLocaleDateString('ru-RU',{day:'numeric',month:'long'});
}
function dateTime(ts){return dayWord(ts)+', '+hm(ts)}

/* телефон — ключ карты: 10 цифр после кода страны; пустая строка, если номер неполный */
function normPhone(s){
  const d=String(s||'').replace(/\D/g,'');
  if(d.length===11&&(d[0]==='7'||d[0]==='8'))return d.slice(1);
  return d.length===10?d:'';
}
function fmtPhone(p){return p&&p.length===10?'+7 '+p.slice(0,3)+' '+p.slice(3,6)+'-'+p.slice(6,8)+'-'+p.slice(8):String(p||'')}

/* ---------- слоты: шаг 10 минут, ближайший — не раньше чем через 15 минут ---------- */
function slots(at,lead,count){
  at=at==null?now():at;lead=lead==null?RULES.slotLead:lead;count=count||RULES.slotCount;
  const d=new Date(at+lead*60000), step=RULES.slotStep, last=RULES.close-step;
  let m=d.getHours()*60+d.getMinutes()+((d.getSeconds()||d.getMilliseconds())?1:0);
  m=Math.ceil(m/step)*step;
  let y=d.getFullYear(),mo=d.getMonth(),day=d.getDate();
  if(m>last){day+=1;m=RULES.open}
  else if(m<RULES.open)m=RULES.open;
  const out=[];
  for(let t=m;t<=last&&out.length<count;t+=step)out.push(new Date(y,mo,day,0,t).getTime());
  return out;
}

/* ---------- цена строки корзины. Строка: {id, s, m, y, q} — индексы размера, молока, сиропа ---------- */
function lineKey(l){return [l.id,l.s||0,l.m||0,l.y||0].join('|')}
function unitPrice(l){
  const it=ITEMS[l.id];if(!it)return 0;
  let p=it.p;
  if(it.sizes&&it.sizes[l.s||0])p+=it.sizes[l.s||0][1];
  if(it.milks&&it.milks[l.m||0])p+=it.milks[l.m||0][1];
  if(it.syrups&&it.syrups[l.y||0])p+=it.syrups[l.y||0][1];
  return p;
}
function optsText(l){
  const it=ITEMS[l.id];if(!it||!it.mods)return it?it.w:'';
  const a=[it.sizes[l.s||0][0]];
  if(it.milks)a.push(it.milks[l.m||0][0]);
  if(it.syrups&&(l.y||0)>0)a.push('сироп: '+it.syrups[l.y][0]);
  return a.join(', ');
}

/* ---------- состояние ---------- */
const ACTIVE=['acc','cook','ready'];
const isActive=function(o){return ACTIVE.indexOf(o.st)>=0};
const ST_NAME={acc:'Принят',cook:'Готовится',ready:'Готов',done:'Выдан',cancel:'Отменён'};
const FLOW={acc:['cook','ready','cancel'],cook:['acc','ready','cancel'],ready:['cook','done','cancel'],done:[],cancel:[]};

function raw(){return store.getItem(KEY)}
function read(){try{const v=store.getItem(KEY);return v?JSON.parse(v):null}catch(e){return null}}
function write(S){store.setItem(KEY,JSON.stringify(S))}

function ensure(){
  let S=read();
  if(!S||!S.guests||!S.orders){S=seed();write(S);return S}
  /* старые незавершённые заказы (больше 12 часов после времени выдачи) закрываем с возвратом баллов */
  let ch=false;const t=now();
  S.orders.filter(function(o){return isActive(o)&&t-o.slot>12*3600e3}).forEach(function(o){applyStatus(S,o,'cancel',t);ch=true});
  if(ch)write(S);
  return S;
}
function tx(fn){const S=ensure();const r=fn(S);write(S);return r}
function state(){return ensure()}
function reset(){store.removeItem(KEY);return ensure()}

function guestRec(S,phone,name){
  let g=S.guests[phone];
  if(!g){g=S.guests[phone]={phone:phone,name:name||'Гость',drinks:0,points:0,visits:0,lastVisit:null,spent:0,since:now(),history:[]}}
  else if(name)g.name=name;
  return g;
}
function pendingDrinks(S,phone){
  return S.orders.filter(function(o){return o.phone===phone&&isActive(o)}).reduce(function(a,o){return a+o.drinks},0);
}

/* Расчёт заказа. Подарок считается по всем напиткам гостя, включая ещё не выданные заказы,
   иначе два заказа подряд получили бы один и тот же подарок. Бесплатным становится самый недорогой напиток. */
function priceOf(S,lines,phone,mode,usePoints){
  const rows=[],units=[];let goods=0;
  (lines||[]).forEach(function(l){
    const it=ITEMS[l.id];if(!it||!(l.q>0))return;
    const price=unitPrice(l);goods+=price*l.q;
    rows.push({id:l.id,n:it.n,opts:optsText(l),price:price,q:l.q,drink:it.drink});
    if(it.drink)for(let i=0;i<l.q;i++)units.push(price);
  });
  const p=normPhone(phone), g=p?S.guests[p]:null, E=RULES.stampEvery;
  const base=p?(g?g.drinks:0)+pendingDrinks(S,p):0;
  const drinks=units.length;
  const gifts=p?Math.floor((base+drinks)/E)-Math.floor(base/E):0;
  units.sort(function(a,b){return a-b});
  const giftSum=units.slice(0,gifts).reduce(function(a,b){return a+b},0);
  const afterGift=goods-giftSum;
  const avail=g?g.points:0;
  const maxUse=Math.min(avail,Math.floor(afterGift*RULES.pointsMaxShare));
  const want=Math.floor(Number(usePoints)||0);
  const used=Math.max(0,Math.min(want,maxUse));
  const net=afterGift-used;
  const fee=mode==='delivery'&&goods>0&&afterGift<RULES.deliveryFree?RULES.deliveryFee:0;
  const earn=p?Math.floor(net*RULES.pointsPct/100):0;
  return {rows:rows,goods:goods,drinks:drinks,base:base,gifts:gifts,giftSum:giftSum,afterGift:afterGift,
    avail:avail,maxUse:maxUse,used:used,net:net,fee:fee,total:net+fee,earn:earn,phone:p,known:!!g};
}
function price(lines,phone,mode,usePoints){return priceOf(ensure(),lines,phone,mode,usePoints)}

function createOrder(S,d,t){
  const P=priceOf(S,d.lines,d.phone,d.mode,d.usePoints);
  const g=guestRec(S,P.phone,d.name);
  S.seq.order+=1;
  const o={id:uid('o'),no:S.seq.order,ts:t,src:d.src||'guest',name:d.name,phone:P.phone,mode:d.mode,addr:d.addr||'',comment:d.comment||'',
    slot:d.slot,rows:P.rows,goods:P.goods,drinks:P.drinks,gifts:P.gifts,giftSum:P.giftSum,used:P.used,net:P.net,fee:P.fee,total:P.total,earn:P.earn,
    st:'acc',stTs:t,accrued:false,rating:null,complaint:null};
  S.orders.push(o);
  if(P.used>0){g.points-=P.used;g.history.push({ts:t,kind:'spend',no:o.no,points:-P.used,stamps:0})}
  return o;
}

/* Проверки при оформлении. Ответ: {ok:true, order} или {ok:false, err} */
function placeOrder(d){
  d=d||{};
  const lines=(d.lines||[]).filter(function(l){return ITEMS[l.id]&&l.q>0});
  const name=String(d.name||'').trim(), phone=normPhone(d.phone), mode=d.mode==='delivery'?'delivery':'pickup', addr=String(d.addr||'').trim();
  return tx(function(S){
    const t=now();
    if(!lines.length)return {ok:false,err:'Корзина пуста'};
    const off=lines.filter(function(l){return S.off[l.id]});
    if(off.length)return {ok:false,err:'Сегодня нет: '+off.map(function(l){return ITEMS[l.id].n}).join(', ')+'. Уберите из корзины.'};
    if(name.length<2)return {ok:false,err:'Укажите имя'};
    if(!phone)return {ok:false,err:'Укажите телефон: 10 цифр после +7'};
    let slot=d.slot;
    if(mode==='delivery'){
      if(addr.length<5)return {ok:false,err:'Укажите адрес: улица, дом, квартира'};
      slot=slots(t,RULES.deliveryLead,1)[0];
    }else{
      if(!slot)return {ok:false,err:'Выберите время'};
      if(slot<t+5*60000)return {ok:false,err:'Это время уже прошло, выберите другое'};
    }
    const o=createOrder(S,{lines:lines,name:name,phone:phone,mode:mode,addr:addr,slot:slot,usePoints:d.usePoints,comment:String(d.comment||'').trim(),src:d.src},t);
    return {ok:true,order:o};
  });
}

/* Смена статуса. Баллы и штампы начисляются один раз — при выдаче. Отмена возвращает списанные баллы. */
function applyStatus(S,o,st,t){
  o.st=st;o.stTs=t;
  const g=S.guests[o.phone];if(!g)return;
  if(st==='done'&&!o.accrued){
    o.accrued=true;
    g.drinks+=o.drinks;g.points+=o.earn;g.visits+=1;g.lastVisit=t;g.spent+=o.net;
    g.history.push({ts:t,kind:'earn',no:o.no,points:o.earn,stamps:o.drinks,gifts:o.gifts});
  }
  if(st==='cancel'&&o.used>0){
    g.points+=o.used;
    g.history.push({ts:t,kind:'refund',no:o.no,points:o.used,stamps:0});
  }
}
function setStatus(id,st){
  return tx(function(S){
    const o=S.orders.find(function(x){return x.id===id});
    if(!o)return {ok:false,err:'Заказ не найден'};
    if(FLOW[o.st].indexOf(st)<0)return {ok:false,err:'Нельзя перевести заказ №'+o.no+' из «'+ST_NAME[o.st]+'» в «'+ST_NAME[st]+'»'};
    applyStatus(S,o,st,now());
    return {ok:true,order:o};
  });
}

/* ---------- обратная связь ---------- */
function rate(id,n){
  n=Math.round(Number(n));
  return tx(function(S){
    const o=S.orders.find(function(x){return x.id===id});
    if(!o||o.st!=='done')return {ok:false,err:'Оценить можно только выданный заказ'};
    if(o.rating)return {ok:false,err:'Оценка уже есть'};
    if(!(n>=1&&n<=5))return {ok:false,err:'Оценка от 1 до 5'};
    o.rating=n;return {ok:true,order:o};
  });
}
function complain(id,text){
  text=String(text||'').trim();
  return tx(function(S){
    const o=S.orders.find(function(x){return x.id===id});
    if(!o||!o.rating||o.rating>3)return {ok:false,err:'Форма жалобы открывается при оценке от 1 до 3'};
    if(o.complaint)return {ok:false,err:'Жалоба уже отправлена'};
    if(text.length<5)return {ok:false,err:'Опишите, что случилось'};
    const c={id:uid('q'),orderId:o.id,no:o.no,name:o.name,phone:o.phone,rating:o.rating,text:text,ts:now(),st:'new'};
    S.complaints.push(c);o.complaint=c.id;
    return {ok:true,complaint:c};
  });
}
function resolveComplaint(id){
  return tx(function(S){const c=S.complaints.find(function(x){return x.id===id});if(c)c.st=c.st==='new'?'done':'new';return {ok:!!c}});
}

/* ---------- стоп-лист ---------- */
function setOff(id,off){
  return tx(function(S){if(!ITEMS[id])return false;if(off)S.off[id]=1;else delete S.off[id];return true});
}
function clearOff(){return tx(function(S){S.off={};return true})}

/* ---------- карта гостя ---------- */
function card(phone){
  const S=ensure(),p=normPhone(phone);if(!p)return null;
  const g=S.guests[p], pending=pendingDrinks(S,p), E=RULES.stampEvery, drinks=g?g.drinks:0;
  const stamps=drinks%E;
  return {exists:!!g,phone:p,name:g?g.name:'',points:g?g.points:0,drinks:drinks,stamps:stamps,pending:pending,
    toGift:E-(drinks+pending)%E,giftsTaken:Math.floor(drinks/E),visits:g?g.visits:0,lastVisit:g?g.lastVisit:null,spent:g?g.spent:0,
    history:g?g.history.slice().reverse():[]};
}
function getOrder(id){return ensure().orders.find(function(o){return o.id===id})||null}
function ordersOf(phone){const p=normPhone(phone);return ensure().orders.filter(function(o){return o.phone===p}).sort(function(a,b){return b.ts-a.ts})}
function guests(){
  const S=ensure(),t=now();
  return Object.keys(S.guests).map(function(k){
    const g=S.guests[k],days=g.lastVisit?-dayDiff(g.lastVisit,t):null;
    return {phone:g.phone,name:g.name,visits:g.visits,lastVisit:g.lastVisit,days:days,absent:days!==null&&days>=RULES.absentDays,
      points:g.points,drinks:g.drinks,stamps:g.drinks%RULES.stampEvery,spent:g.spent};
  });
}

/* ---------- тестовый заказ для панели ---------- */
function testOrder(){
  return tx(function(S){
    const t=now(),ph=Object.keys(S.guests),p=ph[Math.floor(Math.random()*ph.length)];
    const free=Object.keys(ITEMS).filter(function(id){return !S.off[id]});
    const drink=free.filter(function(id){return ITEMS[id].drink}), food=free.filter(function(id){return !ITEMS[id].drink});
    const lines=[];
    if(drink.length)lines.push({id:drink[Math.floor(Math.random()*drink.length)],q:1,s:0,m:0,y:0});
    if(food.length&&Math.random()<.6)lines.push({id:food[Math.floor(Math.random()*food.length)],q:1,s:0,m:0,y:0});
    if(!lines.length)return {ok:false,err:'Всё меню в стоп-листе'};
    const sl=slots(t);
    return {ok:true,order:createOrder(S,{lines:lines,name:S.guests[p].name,phone:p,mode:'pickup',slot:sl[Math.floor(Math.random()*Math.min(3,sl.length))],src:'test'},t)};
  });
}

/* ---------- демо-данные. Баллы и штампы считаются теми же правилами, а не вписаны руками ---------- */
const DEMO_GUESTS=[
  /* имя, телефон, визиты: [дней назад, напитков, оплачено] */
  ['Анна','0001000001',[[14,2,420],[3,3,610]]],
  ['Игорь','0001000002',[[60,1,190],[46,2,540]]],
  ['Светлана','0001000003',[[20,1,210],[9,2,380],[1,1,260]]],
  ['Дмитрий','0001000004',[[33,3,720],[24,1,150]]],
  ['Ксения','0001000005',[[5,4,960],[2,4,1040],[0,1,240]]],
  ['Павел','0001000006',[[12,1,690]]],
  ['Марина','0001000007',[[90,2,330]]],
  ['Олег','0001000008',[[7,2,410],[4,1,1290]]]
];
function seed(){
  const t=now();
  const S={ver:1,seq:{order:130},off:{},guests:{},orders:[],complaints:[]};
  DEMO_GUESTS.forEach(function(r){
    const g={phone:r[1],name:r[0],drinks:0,points:0,visits:0,lastVisit:null,spent:0,since:t,history:[]};
    r[2].slice().sort(function(a,b){return b[0]-a[0]}).forEach(function(v){
      const ts=t-v[0]*86400000,E=RULES.stampEvery,gifts=Math.floor((g.drinks+v[1])/E)-Math.floor(g.drinks/E),earn=Math.floor(v[2]*RULES.pointsPct/100);
      g.drinks+=v[1];g.points+=earn;g.visits+=1;g.lastVisit=ts;g.spent+=v[2];
      g.history.push({ts:ts,kind:'earn',no:0,points:earn,stamps:v[1],gifts:gifts});
    });
    S.guests[r[1]]=g;
  });
  /* три заказа в работе, чтобы панель не была пустой при первом открытии */
  const ceilTo=function(ts){const step=RULES.slotStep*60000;return Math.ceil(ts/step)*step};
  [
    ['Павел','0001000006',5,'cook',[{id:'c05',q:1,s:1,m:2,y:1},{id:'b04',q:1}],'',''],
    ['Светлана','0001000003',15,'acc',[{id:'c04',q:2,s:0,m:0,y:0},{id:'d05',q:1}],'','Одну порцию без пены'],
    ['Олег','0001000008',25,'acc',[{id:'c02',q:1,s:1,m:0,y:0},{id:'u04',q:1}],'ул. Образцовая, 5, кв. 12','']
  ].forEach(function(r){
    const o=createOrder(S,{lines:r[4],name:r[0],phone:r[1],mode:r[5]?'delivery':'pickup',addr:r[5],slot:ceilTo(t+r[2]*60000),comment:r[6],src:'demo'},t-3*60000);
    o.st=r[3];
  });
  return S;
}

return {
  RULES:RULES,MENU:MENU,ITEMS:ITEMS,ST_NAME:ST_NAME,FLOW:FLOW,
  esc:esc,rub:rub,hm:hm,pad:pad,plural:plural,dayWord:dayWord,dateTime:dateTime,normPhone:normPhone,fmtPhone:fmtPhone,
  now:now,raw:raw,state:state,reset:reset,kvGet:kvGet,kvSet:kvSet,isActive:isActive,
  slots:slots,lineKey:lineKey,unitPrice:unitPrice,optsText:optsText,price:price,placeOrder:placeOrder,setStatus:setStatus,
  rate:rate,complain:complain,resolveComplaint:resolveComplaint,setOff:setOff,clearOff:clearOff,
  card:card,getOrder:getOrder,ordersOf:ordersOf,guests:guests,testOrder:testOrder,
  _setStore:function(s){store=s},_setClock:function(f){clock=f}
};
});
