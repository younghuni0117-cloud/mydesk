import {createView} from './fem-view.mjs?v=3';
import {stressView} from './fem-stress-view.mjs?v=3';
import {STAGES,playbackState,eventMatrix} from './fem-playback.mjs?v=3';
import {elasticMatrix,principal} from './fem-material.mjs?v=1';

const $=id=>document.getElementById(id),fmt=(v,d=3)=>Number(v).toLocaleString('ko-KR',{maximumFractionDigits:d});
let result,index=0,playing=false,last=0,currentMatrix;
const worker=new Worker(new URL('./fem-worker.mjs?v=3',import.meta.url),{type:'module'});
const view=createView($('scene'),i=>{$('follow').checked=false;$('element').value=i;draw();});
const cube=stressView($('stress-cube'));
function stop(){playing=false;$('play').textContent='재생';}
function jump(i){if(!result)return;stop();index=Math.max(0,Math.min(result.events.length-1,i));draw();}
for(let i=0;i<8;i++)$('point').add(new Option('GP '+(i+1),i));
function solve(){playing=false;$('play').textContent='재생';$('solve').disabled=true;$('status').textContent='Worker · 강성 조립 및 선형계 풀이';worker.postMessage({nx:Number($('mesh').value),delta:Math.max(.0001,Math.min(.02,Number($('delta').value)/1000||.005))});}
worker.onmessage=({data})=>{$('solve').disabled=false;if(data.type==='error'){$('status').textContent='계산 실패: '+data.message;return;}result=data.result;index=0;$('time').max=result.events.length-1;$('element').replaceChildren(...result.elements.map((_,i)=>new Option('E '+(i+1),i)));$('event-jump').replaceChildren(...Object.entries(STAGES).map(([stage,[name]])=>new Option(name,result.events.findIndex(e=>e.stage===stage))));$('increment-jump').replaceChildren(...result.frames.map((f,i)=>new Option(`${i} · ${fmt(f.delta*1000)} mm · ${f.phase}`,result.events.findIndex(e=>e.frame===i&&e.stage==='boundary'))));$('status').textContent=`완료 · ${result.elements.length} 요소 · ${result.K.length} DOF · ${result.events.length} 계산 이벤트`;draw();};
worker.onerror=e=>{$('solve').disabled=false;$('status').textContent='Worker 오류: '+e.message;};
function heatmap(A){const c=$('heatmap'),ctx=c.getContext('2d'),rows=A.length,cols=A[0].length,nr=Math.min(64,rows),nc=Math.min(64,cols),cells=Array.from({length:nr},()=>Array(nc).fill(0));c.width=480;c.height=240;let max=0;for(let i=0;i<rows;i++)for(let j=0;j<cols;j++){const v=A[i][j],r=Math.floor(i*nr/rows),k=Math.floor(j*nc/cols);if(Math.abs(v)>Math.abs(cells[r][k]))cells[r][k]=v;max=Math.max(max,Math.abs(v));}max=max||1;ctx.clearRect(0,0,480,240);cells.forEach((r,i)=>r.forEach((v,j)=>{const a=Math.sqrt(Math.abs(v)/max);ctx.fillStyle=v<0?`rgba(222,96,60,${a})`:`rgba(36,111,187,${a})`;ctx.fillRect(j*480/nc,i*240/nr,Math.ceil(480/nc),Math.ceil(240/nr));}));$('matrix-info').textContent=`${rows} × ${cols} · 파랑 + / 주황 − · 최대 |값| ${max.toExponential(3)}${Math.max(rows,cols)>64?' · 블록 최대 절댓값 요약':''}`;currentMatrix=A;probe();}
function probe(){if(!currentMatrix)return;const rows=currentMatrix.length,cols=currentMatrix[0].length;$('matrix-row').max=rows;$('matrix-col').max=cols;const i=Math.min(rows,Math.max(1,Number($('matrix-row').value)||1)),j=Math.min(cols,Math.max(1,Number($('matrix-col').value)||1));$('matrix-row').value=i;$('matrix-col').value=j;$('matrix-value').textContent=`[${i}, ${j}] = ${currentMatrix[i-1][j-1].toExponential(7)}`;}

function chart(id,points,xlabel,ylabel){const c=$(id),w=c.clientWidth||400,h=150;c.width=w*2;c.height=h*2;const ctx=c.getContext('2d');ctx.scale(2,2);ctx.clearRect(0,0,w,h);const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),xmin=Math.min(0,...xs),xmax=Math.max(...xs,1e-9),ymin=Math.min(...ys,0),ymax=Math.max(...ys,1e-9),X=x=>48+(x-xmin)/(xmax-xmin||1)*(w-68),Y=y=>h-30-(y-ymin)/(ymax-ymin||1)*(h-45);ctx.font='10px sans-serif';ctx.fillStyle='#64748b';ctx.strokeStyle='#dde3eb';for(let i=0;i<3;i++){const y=ymin+(ymax-ymin)*i/2;ctx.beginPath();ctx.moveTo(45,Y(y));ctx.lineTo(w-10,Y(y));ctx.stroke();ctx.fillText(fmt(y,2),0,Y(y)+3);}ctx.fillText(xlabel,w-85,h-4);ctx.fillText(ylabel,2,10);ctx.fillText(fmt(xmin),45,h-15);ctx.fillText(fmt(xmax),w-35,h-15);ctx.strokeStyle='#3375ad';ctx.lineWidth=2;ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(X(x),Y(y)):ctx.moveTo(X(x),Y(y)));ctx.stroke();const [x,y]=points.at(-1);ctx.fillStyle='#e67d44';ctx.beginPath();ctx.arc(X(x),Y(y),4,0,Math.PI*2);ctx.fill();}
function draw(){
 if(!result)return;
 const state=playbackState(result,index),{event,display:f}=state;
 if($('follow').checked&&event.element!==undefined)$('element').value=event.element;
 const ei=Number($('element').value),pi=Number($('point').value),p=f.points[ei][pi],actual=result.frames[event.frame].points[ei][pi];
 const range=view.update(result,f,Number($('scale').value),$('contour').value,ei,pi),isU=$('contour').value==='uz',unit=isU?'mm':'MPa',convert=isU?1000:1e-6;
 $('legend').textContent=(!isU&&!state.stressReady)?'응력 계산 전 · 미계산':`${fmt(range.min*convert)} ${unit} — 요소 평균 — ${fmt(range.max*convert)} ${unit}`;
 $('time').value=index;$('step').textContent=`${index+1} / ${result.events.length}`;
 $('event-title').textContent=`${STAGES[event.stage][0]} · ${event.element!==undefined?'요소 '+(event.element+1):'증분 '+event.frame+' · '+result.frames[event.frame].phase}`;
 $('event-jump').value=result.events.findIndex(e=>e.stage===event.stage);
 $('increment-jump').value=result.events.findIndex(e=>e.frame===event.frame&&e.stage==='boundary');
 $('metrics').replaceChildren(...[['끝단 지정 변위',fmt(result.frames[event.frame].delta*1000)+' mm'],['끝단 반력 RZ',state.reactionReady?fmt(f.reaction)+' N':'계산 전'],['자유 DOF 잔차',state.reactionReady?f.residual.toExponential(2)+' N':'계산 전'],['최대 von Mises',state.stressReady?fmt(Math.max(...f.points.flat().map(p=>p.mises))/1e6)+' MPa':'계산 전']].map(([a,b])=>{const e=document.createElement('div');e.textContent=a;const s=document.createElement('strong');s.textContent=b;e.append(s);return e;}));
 const {type,A}=eventMatrix(result,event,ei,pi,$('matrix').value);heatmap(A);
 $('formula').textContent=STAGES[event.stage][1]+' · '+type;
 const gp=result.elements[ei].points[pi];$('point-info').textContent=`GP ${pi+1} · ξηζ: ${gp.natural.map(v=>fmt(v)).join(', ')} · det J: ${gp.det.toExponential(3)} m³ · 각 적분 가중치 1`;
 const s=p.stress.map(v=>v/1e6),rows=[[s[0],s[3],s[5]],[s[3],s[1],s[4]],[s[5],s[4],s[2]]];
 $('tensor').innerHTML=(state.stressReady?'<strong>응력 텐서 · MPa</strong><table>'+rows.map(r=>'<tr>'+r.map(v=>'<td>'+fmt(v,2)+'</td>').join('')+'</tr>').join('')+'</table><p>주응력: '+principal(p.stress).map(v=>fmt(v/1e6,2)).join(' / ')+' MPa<br>von Mises: '+fmt(p.mises/1e6)+' MPa · PEEQ: 0 (탄성)</p>':'<p>응력 계산 전</p>')+(state.strainReady?'<p>ε [xx yy zz xy yz zx]:<br>'+actual.strain.map(v=>v.toExponential(3)).join(' / ')+'</p>':'<p>변형률 계산 전</p>');
 cube.update(p.stress);
 const completed=event.stage==='reaction'?event.frame:event.frame-1,history=result.frames.slice(0,completed+1);
 chart('load-chart',(history.length?history:[result.frames[0]]).map(f=>[f.delta*1000,f.reaction]),'δ (mm)','RZ (N)');
 const stressHistory=result.frames.slice(0,event.frame+(state.stressReady?1:0));chart('stress-chart',(stressHistory.length?stressHistory:[result.frames[0]]).map(f=>[f.points[ei][pi].strain[0],f.points[ei][pi].stress[0]/1e6]),'εxx','σxx MPa');
}
$('solve').onclick=solve;
$('play').onclick=()=>{if(!result||$('solve').disabled)return;playing=!playing;last=performance.now();if(playing&&index===result.events.length-1){index=0;draw();}$('play').textContent=playing?'일시정지':'재생';};
$('previous').onclick=()=>jump(index-1);$('next').onclick=()=>jump(index+1);$('time').oninput=()=>jump(Number($('time').value));
for(const id of ['event-jump','increment-jump'])$(id).onchange=()=>jump(Number($(id).value));
for(const id of ['element','point'])$(id).oninput=()=>{$('follow').checked=false;draw();};
for(const id of ['follow','matrix','contour','scale'])$(id).oninput=draw;
for(const id of ['matrix-row','matrix-col'])$(id).oninput=probe;
function tick(t){if(playing&&result&&t-last>Number($('speed').value)){last=t;if(index<result.events.length-1){index++;draw();}else stop();}requestAnimationFrame(tick);}requestAnimationFrame(tick);
window.addEventListener('resize',()=>{if(result)draw();});document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});solve();
