// A lightweight, continuous visual time-of-day palette; no images or network calls.
const stops=[[0,0],[4,0],[5.5,.15],[6.5,.65],[9,1],[12,1],[15,1],[17,.7],[18.5,.2],[20,0],[24,0]];
const rgb=hex=>hex.match(/[a-f\d]{2}/gi).map(n=>parseInt(n,16));
const blend=(a,b,t)=>rgb(a).map((v,i)=>Math.round(v+(rgb(b)[i]-v)*t));
const luminance=rgb=>rgb.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
export function clockSky(time){
 const [h,m]=time.split(':').map(Number),hour=((h*60+m)%1440+1440)%1440/60;
 const i=stops.findIndex(s=>s[0]>hour),a=stops[i-1],b=stops[i],t=(hour-a[0])/(b[0]-a[0]);
 const daylight=a[1]+(b[1]-a[1])*t;
 const colors=[blend('#bed5ed','#b5dff6',daylight),blend('#e9c7c6','#f8dfb6',daylight),blend('#2c416b','#4d628a',daylight)];
 const candidates=['#24364e','#f8fbff'];
 const scores=candidates.map(c=>Math.min(...colors.map(bg=>contrast(rgb(c),bg))));
 const ink=candidates[scores[0]>=scores[1]?0:1];
 return {colors,top:`rgb(${colors[0].join(' ')})`,middle:`rgb(${colors[1].join(' ')})`,bottom:`rgb(${colors[2].join(' ')})`,ink,daylight,contrast:Math.max(...scores),label:hour<5?'밤':hour<7?'새벽':hour<12?'오전':hour<17?'낮':hour<20?'노을':'밤'};
}
export function applyClockSky(dial,time){
 const sky=clockSky(time);dial.dataset.sky=sky.label;dial.dataset.skyTime=time;
 for(const key of ['top','middle','bottom','ink'])dial.style.setProperty('--clock-'+key,sky[key]);
 dial.style.setProperty('--clock-sun',String(.35+.65*sky.daylight));dial.style.setProperty('--clock-moon',String(1-.65*sky.daylight));return sky;
}

export function clockNumberInk(sky,y){
 const t=y<35?0:y<48?(y-35)/13:y<65?(y-48)/17:1,a=sky.colors[y<48?0:1],b=sky.colors[y<48?1:2],bg=a.map((v,i)=>v+(b[i]-v)*t);
 const choices=['#24364e','#f8fbff','#000000'];
 return choices.find(c=>contrast(rgb(c),bg)>=4.5)||'#000000';
}
