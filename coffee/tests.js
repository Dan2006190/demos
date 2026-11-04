'use strict';
/* Автотест: проходит весь путь заказа и начисление бонусов через те же функции, что вызывают экраны.
   Запуск: открыть test.html в браузере или выполнить «node tests.js».
   Демо-данные не затрагиваются: у теста своё хранилище в памяти и свои часы. */
(function(global){
const isNode=typeof require==='function'&&typeof module==='object';
const C=isNode?require('./core.js'):global.Coffee;
const Q=isNode?require('./qr.js'):global.QR;

function run(print){
  let pass=0,fail=0;
  const eq=(name,got,want)=>{
    const ok=JSON.stringify(got)===JSON.stringify(want);
    if(ok)pass++;else fail++;
    print(ok,name+(ok?'':' — получено '+JSON.stringify(got)+', ожидалось '+JSON.stringify(want)));
  };
  const head=t=>print(null,t);

  /* свои часы и хранилище */
  const mem={};
  C._setStore({getItem:k=>k in mem?mem[k]:null,setItem:(k,v)=>{mem[k]=String(v)},removeItem:k=>{delete mem[k]}});
  let T=new Date(2026,10,5,10,3,0).getTime();
  C._setClock(()=>T);
  const at=(h,m,s)=>new Date(2026,10,5,h,m,s||0).getTime();
  const PH='+7 000 555-66-77';
  const latte={id:'c05',s:1,m:2,y:1,q:1};       // 210 + 60 + 60 + 40 = 370
  const syrn={id:'b04',q:1};                    // 320

  head('Меню');
  const n=Object.keys(C.ITEMS).length;
  eq('позиций от 30 до 40',n>=30&&n<=40,true);
  eq('семь категорий',C.MENU.map(c=>c.t),['Кофе','Чай','Завтраки','Бургеры','Пицца','Стейки','Десерты']);
  eq('модификаторы только у кофе',Object.values(C.ITEMS).filter(i=>i.mods).every(i=>i.cat==='coffee'),true);
  eq('цена латте 350 мл, овсяное, ваниль',C.unitPrice(latte),370);
  eq('подпись модификаторов',C.optsText(latte),'350 мл, овсяное, сироп: ваниль');

  head('Время выдачи: шаг 10 минут, не раньше чем через 15');
  eq('10:03 → первый слот 10:20',C.slots(at(10,3))[0],at(10,20));
  eq('10:05:00 → ровно через 15 мин, 10:20',C.slots(at(10,5))[0],at(10,20));
  eq('10:05:30 → 10:30',C.slots(at(10,5,30))[0],at(10,30));
  const sl=C.slots(at(10,3));
  eq('шаг между слотами 10 мин',sl[1]-sl[0],600000);
  eq('до открытия (00:13) → сегодня 08:00',C.slots(at(0,13))[0],at(8,0));
  eq('после закрытия (21:40) → завтра 08:00',C.slots(at(21,40))[0],new Date(2026,10,6,8,0).getTime());
  eq('последний слот дня 21:50',C.slots(at(21,20)).pop(),at(21,50));

  head('Проверки формы');
  const base={lines:[latte],name:'Тест',phone:PH,mode:'pickup',slot:at(10,20)};
  eq('пустая корзина',C.placeOrder({...base,lines:[]}).err,'Корзина пуста');
  eq('нет имени',C.placeOrder({...base,name:' '}).err,'Укажите имя');
  eq('неполный телефон',C.placeOrder({...base,phone:'12345'}).ok,false);
  eq('нет времени',C.placeOrder({...base,slot:null}).err,'Выберите время');
  eq('прошедшее время',C.placeOrder({...base,slot:at(10,0)}).ok,false);
  eq('доставка без адреса',C.placeOrder({...base,mode:'delivery'}).ok,false);
  eq('формы телефона дают одну карту',[C.normPhone('8 (000) 555-66-77'),C.normPhone('+70005556677'),C.normPhone('0005556677')],['0005556677','0005556677','0005556677']);

  head('Заказ 1: латте + сырники, новый гость');
  let r=C.placeOrder({...base,lines:[latte,syrn]});
  eq('заказ принят',r.ok,true);
  const o1=r.order;
  eq('статус «Принят»',o1.st,'acc');
  eq('сумма 690',o1.total,690);
  eq('будет начислено 5%: 34',o1.earn,34);
  let c=C.card(PH);
  eq('до выдачи баллов нет',c.points,0);
  eq('до выдачи штампов нет',c.stamps,0);
  eq('напиток виден как ожидающий',c.pending,1);
  eq('нельзя сразу «Выдан»',C.setStatus(o1.id,'done').ok,false);
  eq('оценка до выдачи запрещена',C.rate(o1.id,5).ok,false);
  eq('Принят → Готовится',C.setStatus(o1.id,'cook').order.st,'cook');
  eq('Готовится → Готов',C.setStatus(o1.id,'ready').order.st,'ready');
  eq('Готов → Выдан',C.setStatus(o1.id,'done').order.st,'done');
  c=C.card(PH);
  eq('после выдачи 34 балла',c.points,34);
  eq('после выдачи 1 штамп',c.stamps,1);
  eq('1 визит',c.visits,1);
  eq('повторная выдача не проходит',C.setStatus(o1.id,'done').ok,false);
  eq('баллы не задвоились',C.card(PH).points,34);

  head('Заказ 2: 4 капучино, списание баллов');
  const cap4={id:'c04',s:0,m:0,y:0,q:4};        // 190 × 4 = 760
  let p=C.price([cap4],PH,'pickup',1000);
  eq('подарка ещё нет',p.gifts,0);
  eq('лишний запрос баллов режется до остатка',p.used,34);
  r=C.placeOrder({...base,lines:[cap4],usePoints:1000});
  const o2=r.order;
  eq('итого 760 − 34 = 726',o2.total,726);
  eq('баллы списаны сразу',C.card(PH).points,0);
  eq('5% от оплаченного: 36',o2.earn,36);
  C.setStatus(o2.id,'cook');C.setStatus(o2.id,'ready');C.setStatus(o2.id,'done');
  c=C.card(PH);
  eq('36 баллов на карте',c.points,36);
  eq('5 штампов',c.stamps,5);
  eq('следующий напиток в подарок',c.toGift,1);

  head('Заказ 3: 6-й напиток в подарок');
  const esp={id:'c01',s:0,q:1},am={id:'c02',s:0,m:0,y:0,q:1};   // 130 и 150
  r=C.placeOrder({...base,lines:[esp,am]});
  const o3=r.order;
  eq('один подарок',o3.gifts,1);
  eq('бесплатен самый недорогой: 130',o3.giftSum,130);
  eq('итого 150',o3.total,150);
  eq('баллы с оплаченных 150: 7',o3.earn,7);

  head('Второй заказ, пока первый не выдан: подарок не повторяется');
  p=C.price([esp],PH,'pickup',0);
  eq('подарка нет',p.gifts,0);
  eq('учтены 7 напитков',p.base,7);
  C.setStatus(o3.id,'ready');C.setStatus(o3.id,'done');
  c=C.card(PH);
  eq('7 напитков всего',c.drinks,7);
  eq('новый круг: 1 штамп',c.stamps,1);
  eq('43 балла',c.points,43);

  head('Отмена возвращает баллы и не начисляет');
  r=C.placeOrder({...base,lines:[latte,syrn],usePoints:10});
  const o4=r.order;
  eq('списано 10',C.card(PH).points,33);
  C.setStatus(o4.id,'cancel');
  c=C.card(PH);
  eq('возвращено 10',c.points,43);
  eq('штампов не прибавилось',c.drinks,7);
  eq('выдать отменённый нельзя',C.setStatus(o4.id,'done').ok,false);

  head('Доставка');
  r=C.placeOrder({...base,mode:'delivery',addr:'ул. Образцовая, 5',lines:[{id:'b03',q:1}]});
  eq('меньше 500 ₽: доставка 100',r.order.fee,100);
  eq('итого 390',r.order.total,390);
  eq('баллы без учёта доставки: 14',r.order.earn,14);
  eq('время доставки не раньше +30 мин',r.order.slot>=T+30*60000,true);
  C.setStatus(r.order.id,'cancel');
  eq('от 500 ₽ доставка бесплатна',C.price([{id:'p01',q:2}],PH,'delivery',0).fee,0);

  head('Стоп-лист');
  C.setOff('b04',true);
  eq('позиция с отметкой',!!C.state().off.b04,true);
  eq('заказать нельзя',C.placeOrder({...base,lines:[syrn]}).ok,false);
  C.setOff('b04',false);
  eq('снова можно',C.placeOrder({...base,lines:[syrn]}).ok,true);

  head('«Как вам?»');
  eq('оценка 5 принята',C.rate(o1.id,5).order.rating,5);
  eq('вторая оценка отклонена',C.rate(o1.id,4).ok,false);
  eq('на оценку 5 жалоба не открывается',C.complain(o1.id,'Плохой кофе').ok,false);
  C.rate(o2.id,2);
  eq('пустая жалоба отклонена',C.complain(o2.id,'  ').ok,false);
  r=C.complain(o2.id,'Капучино остыл');
  eq('жалоба принята',r.ok,true);
  eq('жалоба дошла до панели',C.state().complaints.map(x=>[x.no,x.rating,x.text]),[[o2.no,2,'Капучино остыл']]);
  eq('вторая жалоба отклонена',C.complain(o2.id,'Ещё раз').ok,false);

  head('Демо-гости и вкладка «Гости»');
  const g=C.guests();
  const anna=C.card('+7 000 100-00-01');
  eq('Анна: 5 штампов',anna.stamps,5);
  eq('Анна: 51 балл (21 + 30)',anna.points,51);
  eq('Анне следующий напиток в подарок',C.price([esp],'+7 000 100-00-01','pickup',0).gifts,1);
  eq('предел 30%: с заказа 150 ₽ спишется 45 из 51 балла',C.price([{id:'d01',q:1}],'+7 000 100-00-01','pickup',1000).used,45);
  eq('давно не были: Игорь, Дмитрий, Марина',g.filter(x=>x.absent).map(x=>x.name).sort(),['Дмитрий','Игорь','Марина']);
  eq('новый гость есть в списке',g.some(x=>x.phone==='0005556677'),true);
  eq('число штампов в списке совпадает с картой',g.find(x=>x.phone==='0005556677').stamps,C.card(PH).stamps);
  eq('стартовые заказы на панели',C.state().orders.filter(o=>o.src==='demo').length,3);

  head('Устаревшие заказы закрываются с возвратом баллов');
  r=C.placeOrder({...base,lines:[latte],usePoints:5});
  const pts=C.card(PH).points;
  T+=20*3600e3;
  eq('через 20 часов заказ отменён',C.getOrder(r.order.id).st,'cancel');
  eq('баллы вернулись',C.card(PH).points,pts+5);
  T-=20*3600e3;

  head('QR-код');
  eq('коррекция ошибок: контрольный пример стандарта',Q._rs([32,91,11,120,209,114,220,77,67,64,236,17,236,17,236,17],10),[196,35,39,119,235,215,231,226,93,23]);
  eq('биты формата M, маска 0',Q._formatBits(0),0x5412);
  eq('биты версии 7',Q._versionBits(7),0x07C94);
  eq('выравнивание версии 7',Q._align(7),[6,22,38]);
  eq('ёмкость версии 15, уровень M',Q._dataCapacity(15),415);
  const url='https://example.org/coffee-demo/index.html';
  const qr=Q.encode(url);
  eq('размер соответствует версии',qr.size,qr.version*4+17);
  const m=qr.modules,s=qr.size;
  const finder=(x,y)=>[0,1,2,3,4,5,6].every(i=>m[y+i][x]&&m[y][x+i]&&m[y+6][x+i]&&m[y+i][x+6])&&m[y+3][x+3]&&!m[y+1][x+1];
  eq('три поисковых узора',[finder(0,0),finder(s-7,0),finder(0,s-7)],[true,true,true]);
  eq('длинный адрес вызывает ошибку',(()=>{try{Q.encode('x'.repeat(500));return false}catch(e){return true}})(),true);
  eq('SVG содержит белое поле и код',/<svg[\s\S]*<rect[\s\S]*<path/.test(Q.toSvg(url)),true);

  print(null,'Итог: прошло '+pass+', ошибок '+fail);
  return {pass,fail};
}

if(isNode&&require.main===module){
  const res=run((ok,t)=>console.log(ok===null?'\n== '+t:(ok?'  OK   ':'  FAIL ')+t));
  process.exit(res.fail?1:0);
}
if(isNode)module.exports=run;else global.runCoffeeTests=run;
})(typeof self!=='undefined'?self:globalThis);
