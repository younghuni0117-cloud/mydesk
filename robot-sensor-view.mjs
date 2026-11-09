// A subdued rangefinder, attached to the physical eye. Every endpoint is a real ray sample.
export function drawEyeSensorGauge(ctx,sensors,X,Y,scale){
 const cx=X(sensors.eye.x),cy=Y(sensors.eye.y),heading=sensors.eye.angle,r=Math.max(21,Math.min(44,scale*.28)),rad=Math.PI/180;
 ctx.save();ctx.lineWidth=.75;ctx.setLineDash([2,5]);ctx.strokeStyle='#70889930';
 for(const s of sensors.samples){ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(X(s.x),Y(s.y));ctx.stroke();}
 ctx.setLineDash([]);
 for(const s of sensors.samples){ctx.strokeStyle=s.side==='left'?'#617f91bb':s.side==='right'?'#9b896dbb':'#858b9bbb';ctx.fillStyle=s.side==='left'?'#617f91':s.side==='right'?'#9b896d':'#858b9b';ctx.lineWidth=.9;ctx.beginPath();ctx.arc(X(s.x),Y(s.y),s.hit?2.4:1.1,0,Math.PI*2);if(s.hit){ctx.stroke();ctx.beginPath();ctx.arc(X(s.x),Y(s.y),.85,0,Math.PI*2);ctx.fill();}else ctx.stroke();}
 ctx.strokeStyle='#637d9299';ctx.lineWidth=.85;ctx.beginPath();ctx.arc(cx,cy,r,-heading-85*rad,-heading+95*rad);ctx.stroke();
 for(let degrees=-90;degrees<=75;degrees+=15){const a=-heading-degrees*rad,major=degrees%30===0,length=major?5:2.5;ctx.beginPath();ctx.moveTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r);ctx.lineTo(cx+Math.cos(a)*(r+length),cy+Math.sin(a)*(r+length));ctx.stroke();}
 const a=-heading;ctx.strokeStyle='#526c85bb';ctx.beginPath();ctx.moveTo(cx+Math.cos(a)*(r-5),cy+Math.sin(a)*(r-5));ctx.lineTo(cx+Math.cos(a)*(r+7),cy+Math.sin(a)*(r+7));ctx.stroke();
 ctx.fillStyle='#60778e';ctx.font='10px "Noto Sans KR", sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(Math.round(Math.atan2(Math.sin(heading),Math.cos(heading))/rad)+'°',cx+Math.cos(a)*(r+20),cy+Math.sin(a)*(r+20));
 ctx.fillStyle='#637d92';ctx.beginPath();ctx.arc(cx,cy,1.4,0,Math.PI*2);ctx.fill();ctx.restore();
}
