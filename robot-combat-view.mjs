export const DRILL_LABELS=Object.freeze({bag:'샌드백',limited:'주먹 막기 · 회피',sparring:'제한 대련',selfplay:'자유 자기 대전'});
export function combatResultText(c){if(!c)return '';const counters=c.fighters.map((f,i)=>f.down?`${i?'오른쪽':'왼쪽'} 다운 ${f.count} / 10`:'').filter(Boolean);if(!c.winner)return counters.join(' · ');const reason={health:'체력 소진',count:'10카운트',time:'시간 종료'}[c.reason]||'경기 종료';return `${c.winner==='draw'?'무승부':c.winner==='left'?'왼쪽 승리':'오른쪽 승리'} · ${reason}`;}
export function drawCombatScene(ctx,frame,X,Y,scale){const bag=frame.bag;if(bag){const [x,y]=bag.position;ctx.save();ctx.translate(X(x),Y(y));ctx.rotate(-bag.angle);
 if(bag.glove){
  ctx.scale(bag.direction||-1,1);const r=bag.radius*scale;
  ctx.fillStyle='#625957';ctx.fillRect(-r*1.7,-r*.5,r*1.2,r);ctx.strokeStyle='#4b4645';ctx.lineWidth=1.5;
  const g=ctx.createLinearGradient(0,-r,0,r);g.addColorStop(0,'#c97d69');g.addColorStop(1,'#8c4e47');ctx.fillStyle=g;ctx.beginPath();ctx.ellipse(0,0,r,r*.85,0,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#a96053';ctx.beginPath();ctx.ellipse(-r*.45,r*.65,r*.6,r*.35,-.3,0,Math.PI*2);ctx.fill();ctx.stroke();
 }else{
  const w=bag.radius*2*scale,h=bag.height*scale;const g=ctx.createLinearGradient(-w/2,0,w/2,0);g.addColorStop(0,'#514e53');g.addColorStop(.4,'#9a7670');g.addColorStop(1,'#48454a');ctx.fillStyle=g;ctx.strokeStyle='#48464a';ctx.lineWidth=1.5;ctx.beginPath();ctx.roundRect(-w/2,-h/2,w,h,w*.22);ctx.fill();ctx.stroke();ctx.fillStyle='#d2c4b2';ctx.fillRect(-w/2+1,-h*.3,w-2,h*.07);ctx.fillRect(-w/2+1,h*.28,w-2,h*.04);ctx.strokeStyle='#686c70';ctx.beginPath();ctx.moveTo(-w*.3,-h/2);ctx.lineTo(0,-h*.7);ctx.lineTo(w*.3,-h/2);ctx.stroke();
 }ctx.restore();if(!bag.glove){ctx.save();ctx.strokeStyle='#67717a';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(X(bag.anchor[0]),Y(bag.anchor[1]));ctx.lineTo(X(x-Math.sin(bag.angle)*bag.height*.7),Y(y+Math.cos(bag.angle)*bag.height*.7));ctx.stroke();ctx.restore();}}for(const hit of frame.combatHits||[]){const age=frame.time-hit.time;if(age<0||age>.35)continue;const x=X(hit.point[0]),y=Y(hit.point[1]),a=1-age/.35;ctx.save();ctx.globalAlpha=a;ctx.strokeStyle=hit.blocked?'#679abb':'#d28c57';ctx.lineWidth=1.5;const radius=Math.min(24,5+hit.impulse*.6)*(1+age*2);for(let i=0;i<7;i++){const angle=i*Math.PI*2/7;ctx.beginPath();ctx.moveTo(x+Math.cos(angle)*radius*.4,y+Math.sin(angle)*radius*.4);ctx.lineTo(x+Math.cos(angle)*radius,y+Math.sin(angle)*radius);ctx.stroke();}ctx.font='600 11px sans-serif';ctx.fillStyle='#a8534d';ctx.fillText('−'+hit.damage.toFixed(1),x+radius+3,y-8-age*20);ctx.restore();}}

// Decorative scenery only: no fixtures, sensor objects, or training observations.
export function drawBagStand(ctx,frame,X,Y,scale,groundHeight=()=>0){
 const bag=frame.bag;if(!bag||bag.glove)return;
 const [ax,ay]=bag.anchor,top={x:ax,y:ay+.12},left={x:ax-.98,y:groundHeight(ax-.98)},right={x:ax+.98,y:groundHeight(ax+.98)};
 const point=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
 const beam=(a,b,rear=false)=>{ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();ctx.moveTo(X(a.x),Y(a.y));ctx.lineTo(X(b.x),Y(b.y));ctx.strokeStyle=rear?'#75654e':'#66543f';ctx.lineWidth=Math.max(2,.14*scale);ctx.stroke();ctx.strokeStyle=rear?'#a18a65':'#a7794d';ctx.lineWidth=Math.max(1,.105*scale);ctx.stroke();ctx.beginPath();ctx.moveTo(X(a.x)-.018*scale,Y(a.y));ctx.lineTo(X(b.x)-.018*scale,Y(b.y));ctx.strokeStyle=rear?'#b09a77':'#c79a65';ctx.lineWidth=Math.max(.6,.018*scale);ctx.stroke();};
 const bolt=p=>{ctx.beginPath();ctx.arc(X(p.x),Y(p.y),Math.max(1.1,.024*scale),0,Math.PI*2);ctx.fillStyle='#655f53';ctx.fill();ctx.beginPath();ctx.arc(X(p.x)-.4,Y(p.y)-.4,Math.max(.45,.009*scale),0,Math.PI*2);ctx.fillStyle='#b9b3a2';ctx.fill();};
 ctx.save();ctx.globalAlpha=.14;ctx.fillStyle='#4a493a';for(const foot of [left,right]){ctx.beginPath();ctx.ellipse(X(foot.x+.05),Y(foot.y)+.015*scale,.2*scale,.035*scale,0,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;
 const back={x:right.x+.2,y:groundHeight(right.x+.2)};beam({x:top.x+.08,y:top.y-.06},back,true);beam(point(top,right,.68),point(top,back,.68),true);
 beam(left,top);beam(top,right);const l=point(top,left,.68),r=point(top,right,.68);beam(l,r);for(const p of [top,l,r])bolt(p);
 // Visible hanger joins the existing physical rope anchor to the timber peak.
 ctx.strokeStyle='#65696a';ctx.lineWidth=Math.max(1,.023*scale);ctx.beginPath();ctx.moveTo(X(ax),Y(top.y));ctx.lineTo(X(ax),Y(ay));ctx.stroke();ctx.beginPath();ctx.arc(X(ax),Y(ay),Math.max(1.4,.04*scale),0,Math.PI*2);ctx.stroke();ctx.restore();
}
