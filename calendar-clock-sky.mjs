// A lightweight, continuous visual time-of-day palette; no images or network calls.
const stops=[
 [0,'#263d68','#485f89','#616f90',0],
 [4,'#303e67','#5b6089','#6c6d8c',0],
 [5.5,'#75688f','#bba1bd','#edc2ab',.15],
 [6.5,'#abc8e8','#e0d9e4','#ffe0b3',.65],
 [9,'#b5dff6','#d4e9f3','#fff0ce',1],
 [12,'#a7d7f3','#cee8f6','#f7f1dc',1],
 [15,'#b6daef','#dce6ed','#ffe4bc',1],
 [17,'#afaed5','#e4bfca','#ffd29e',.7],
 [18.5,'#686d9d','#af8fae','#edb59c',.2],
 [20,'#354e7d','#697ba4','#68718c',0],
 [24,'#263d68','#485f89','#616f90',0]
];
const rgb=hex=>hex.match(/[a-f\d]{2}/gi).map(n=>parseInt(n,16));
const blend=(a,b,t)=>rgb(a).map((v,i)=>Math.round(v+(rgb(b)[i]-v)*t));
const luminance=rgb=>rgb.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
export function clockSky(time){
 const [h,m]=time.split(':').map(Number),hour=((h*60+m)%1440+1440)%1440/60;
 const i=stops.findIndex(s=>s[0]>hour),a=stops[i-1],b=stops[i],t=(hour-a[0])/(b[0]-a[0]);
 const colors=[1,2,3].map(k=>blend(a[k],b[k],t));
 const candidates=['#24364e','#f8fbff'];
 const scores=candidates.map(c=>Math.min(...colors.map(bg=>contrast(rgb(c),bg))));
 const ink=candidates[scores[0]>=scores[1]?0:1],daylight=a[4]+(b[4]-a[4])*t;
 return {colors,top:`rgb(${colors[0].join(' ')})`,middle:`rgb(${colors[1].join(' ')})`,bottom:`rgb(${colors[2].join(' ')})`,ink,daylight,contrast:Math.max(...scores),label:hour<5?'밤':hour<7?'새벽':hour<12?'오전':hour<17?'낮':hour<20?'노을':'밤'};
}
export function applyClockSky(dial,time){
 const sky=clockSky(time);dial.dataset.sky=sky.label;dial.dataset.skyTime=time;
 for(const key of ['top','middle','bottom','ink'])dial.style.setProperty('--clock-'+key,sky[key]);
 dial.style.setProperty('--clock-sun',String(sky.daylight));dial.style.setProperty('--clock-moon',String(1-sky.daylight));return sky;
}

export function clockNumberInk(sky,y){
 const t=y<=58?y/58:(y-58)/42,a=sky.colors[y<=58?0:1],b=sky.colors[y<=58?1:2],bg=a.map((v,i)=>v+(b[i]-v)*t);
 const choices=['#24364e','#f8fbff','#000000'];
 return choices.find(c=>contrast(rgb(c),bg)>=4.5)||'#000000';
}
