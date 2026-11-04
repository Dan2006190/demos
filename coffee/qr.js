/* Генератор QR-кода без внешних библиотек и сети: байтовый режим, уровень коррекции M, версии 1–15.
   Этого хватает на адрес до 412 байт. Алгоритм — по стандарту ISO/IEC 18004. */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;else root.QR=api;
})(typeof self!=='undefined'?self:this,function(){
'use strict';
/* уровень M: кодовых слов коррекции на блок и число блоков, индекс = версия */
const ECC_PER_BLOCK=[0,10,16,26,18,24,16,18,22,22,26,30,22,22,24,24];
const NUM_BLOCKS=[0,1,1,1,2,2,4,4,4,5,5,5,8,9,9,10];
const MAX_VER=15, EC_M_BITS=0;

function rawModules(v){
  let r=(16*v+128)*v+64;
  if(v>=2){const n=Math.floor(v/7)+2;r-=(25*n-10)*n-55;if(v>=7)r-=36}
  return r;
}
const dataCapacity=function(v){return Math.floor(rawModules(v)/8)-ECC_PER_BLOCK[v]*NUM_BLOCKS[v]};

/* --- арифметика поля GF(256), многочлен 0x11D --- */
function gfMul(a,b){let z=0;for(let i=7;i>=0;i--){z=(z<<1)^((z>>>7)*0x11D);z^=((b>>>i)&1)*a}return z&255}
function rsDivisor(deg){
  const r=new Array(deg).fill(0);r[deg-1]=1;let root=1;
  for(let i=0;i<deg;i++){
    for(let j=0;j<deg;j++){r[j]=gfMul(r[j],root);if(j+1<deg)r[j]^=r[j+1]}
    root=gfMul(root,2);
  }
  return r;
}
function rsRemainder(data,div){
  const r=div.map(function(){return 0});
  data.forEach(function(b){
    const f=b^r.shift();r.push(0);
    div.forEach(function(c,i){r[i]^=gfMul(c,f)});
  });
  return r;
}

/* --- служебные биты --- */
function formatBits(mask){
  const data=(EC_M_BITS<<3)|mask;let rem=data;
  for(let i=0;i<10;i++)rem=(rem<<1)^((rem>>>9)*0x537);
  return ((data<<10)|rem)^0x5412;
}
function versionBits(v){
  let rem=v;for(let i=0;i<12;i++)rem=(rem<<1)^((rem>>>11)*0x1F25);
  return (v<<12)|rem;
}
function alignPositions(v){
  if(v===1)return [];
  const n=Math.floor(v/7)+2, size=v*4+17, step=Math.ceil((v*4+4)/(n*2-2))*2, r=[6];
  for(let p=size-7;r.length<n;p-=step)r.splice(1,0,p);
  return r;
}
const MASKS=[
  function(x,y){return (x+y)%2===0},
  function(x,y){return y%2===0},
  function(x){return x%3===0},
  function(x,y){return (x+y)%3===0},
  function(x,y){return (Math.floor(x/3)+Math.floor(y/2))%2===0},
  function(x,y){return x*y%2+x*y%3===0},
  function(x,y){return (x*y%2+x*y%3)%2===0},
  function(x,y){return ((x+y)%2+x*y%3)%2===0}
];

function utf8(s){
  if(typeof TextEncoder!=='undefined')return Array.from(new TextEncoder().encode(s));
  return unescape(encodeURIComponent(s)).split('').map(function(c){return c.charCodeAt(0)});
}

/* байты данных с заголовком, завершителем и заполнением */
function encodeData(bytes,v){
  const bits=[];
  const put=function(val,n){for(let i=n-1;i>=0;i--)bits.push((val>>>i)&1)};
  put(4,4);put(bytes.length,v<10?8:16);
  bytes.forEach(function(b){put(b,8)});
  const cap=dataCapacity(v)*8;
  put(0,Math.min(4,cap-bits.length));
  put(0,(8-bits.length%8)%8);
  for(let pad=0xEC;bits.length<cap;pad^=0xEC^0x11)put(pad,8);
  const out=[];
  for(let i=0;i<bits.length;i+=8){let b=0;for(let j=0;j<8;j++)b=(b<<1)|bits[i+j];out.push(b)}
  return out;
}
/* деление на блоки, коррекция ошибок, чередование */
function addEcc(data,v){
  const nb=NUM_BLOCKS[v], ec=ECC_PER_BLOCK[v], raw=Math.floor(rawModules(v)/8);
  const shortBlocks=nb-raw%nb, shortLen=Math.floor(raw/nb)-ec;
  const div=rsDivisor(ec), blocks=[], eccs=[];
  for(let i=0,k=0;i<nb;i++){
    const len=shortLen+(i<shortBlocks?0:1), d=data.slice(k,k+len);k+=len;
    blocks.push(d);eccs.push(rsRemainder(d,div));
  }
  const out=[];
  for(let i=0;i<=shortLen;i++)blocks.forEach(function(b){if(i<b.length)out.push(b[i])});
  for(let i=0;i<ec;i++)eccs.forEach(function(e){out.push(e[i])});
  return out;
}

function penalty(m){
  const n=m.length;let score=0,dark=0;
  const line=function(get){
    let run=0,prev=-1,seq=0;
    for(let i=0;i<n;i++){
      const c=get(i)?1:0;
      if(c===prev){run++;if(run===5)score+=3;else if(run>5)score+=1}else{prev=c;run=1}
      seq=((seq<<1)|c)&0x7FF;
      if(i>=10&&(seq===0x5D0||seq===0x05D))score+=40;
    }
  };
  for(let i=0;i<n;i++){line(function(j){return m[i][j]});line(function(j){return m[j][i]})}
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    if(m[y][x])dark++;
    if(y<n-1&&x<n-1){const c=m[y][x];if(c===m[y][x+1]&&c===m[y+1][x]&&c===m[y+1][x+1])score+=3}
  }
  return score+10*Math.floor(Math.abs(dark*20/(n*n)-10));
}

function encode(text){
  const bytes=utf8(text);
  let v=1;
  while(v<=MAX_VER&&bytes.length+(v<10?2:3)>dataCapacity(v))v++;
  if(v>MAX_VER)throw new Error('Адрес слишком длинный для QR-кода');
  const size=v*4+17;
  const mod=[],fn=[];
  for(let y=0;y<size;y++){mod.push(new Array(size).fill(false));fn.push(new Array(size).fill(false))}
  const set=function(x,y,b){mod[y][x]=!!b;fn[y][x]=true};

  /* таймирующие линии */
  for(let i=0;i<size;i++){set(6,i,i%2===0);set(i,6,i%2===0)}
  /* поисковые узоры */
  [[3,3],[size-4,3],[3,size-4]].forEach(function(c){
    for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){
      const x=c[0]+dx,y=c[1]+dy,d=Math.max(Math.abs(dx),Math.abs(dy));
      if(x>=0&&x<size&&y>=0&&y<size)set(x,y,d!==2&&d!==4);
    }
  });
  /* выравнивающие узоры */
  const al=alignPositions(v);
  al.forEach(function(ax,i){al.forEach(function(ay,j){
    if((i===0&&j===0)||(i===0&&j===al.length-1)||(i===al.length-1&&j===0))return;
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)set(ax+dx,ay+dy,Math.max(Math.abs(dx),Math.abs(dy))!==1);
  })});
  /* место формата и версии */
  const drawFormat=function(mask){
    const b=formatBits(mask),bit=function(i){return (b>>>i)&1};
    for(let i=0;i<=5;i++)set(8,i,bit(i));
    set(8,7,bit(6));set(8,8,bit(7));set(7,8,bit(8));
    for(let i=9;i<15;i++)set(14-i,8,bit(i));
    for(let i=0;i<8;i++)set(size-1-i,8,bit(i));
    for(let i=8;i<15;i++)set(8,size-15+i,bit(i));
    set(8,size-8,1);
  };
  drawFormat(0);
  if(v>=7){
    const b=versionBits(v);
    for(let i=0;i<18;i++){
      const bit=(b>>>i)&1,a=size-11+i%3,c=Math.floor(i/3);
      set(a,c,bit);set(c,a,bit);
    }
  }
  /* данные: зигзагом от правого нижнего угла */
  const cw=addEcc(encodeData(bytes,v),v);
  let idx=0;
  for(let right=size-1;right>=1;right-=2){
    if(right===6)right=5;
    for(let vert=0;vert<size;vert++){
      for(let j=0;j<2;j++){
        const x=right-j, up=((right+1)&2)===0, y=up?size-1-vert:vert;
        if(!fn[y][x]&&idx<cw.length*8){
          mod[y][x]=((cw[idx>>>3]>>>(7-(idx&7)))&1)===1;idx++;
        }
      }
    }
  }
  /* выбор маски с наименьшим штрафом */
  const applyMask=function(k){
    for(let y=0;y<size;y++)for(let x=0;x<size;x++)if(!fn[y][x]&&MASKS[k](x,y))mod[y][x]=!mod[y][x];
  };
  let best=0,min=Infinity;
  for(let k=0;k<8;k++){
    applyMask(k);drawFormat(k);
    const s=penalty(mod);
    if(s<min){min=s;best=k}
    applyMask(k);
  }
  applyMask(best);drawFormat(best);
  return {size:size,version:v,mask:best,modules:mod};
}

/* SVG с белым полем 4 модуля — обязательным для считывания */
function toSvg(text,title){
  const q=encode(text),b=4,n=q.size+b*2;let d='';
  for(let y=0;y<q.size;y++)for(let x=0;x<q.size;x++)if(q.modules[y][x])d+='M'+(x+b)+' '+(y+b)+'h1v1h-1z';
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+n+' '+n+'" shape-rendering="crispEdges" role="img" aria-label="'+String(title||'QR-код').replace(/"/g,'&quot;')+'"><rect width="'+n+'" height="'+n+'" fill="#fff"/><path d="'+d+'" fill="#000"/></svg>';
}
return {encode:encode,toSvg:toSvg,_rs:function(d,e){return rsRemainder(d,rsDivisor(e))},_formatBits:formatBits,_versionBits:versionBits,_dataCapacity:dataCapacity,_align:alignPositions,_encodeData:encodeData,_rawModules:rawModules};
});
