// The angular scale follows measured ray endpoints, never the space beside the eye.
export function drawEyeSensorGauge(ctx,sensors,X,Y,scale){
 const colors={left:'#617f91aa',right:'#9b896d99',both:'#858b9baa'};
 ctx.save();ctx.setLineDash([]);ctx.lineWidth=.85;
 for(const side of ['left','right','both']){const points=sensors.samples.filter(s=>s.side===side);ctx.strokeStyle=colors[side];ctx.beginPath();for(let i=0;i<points.length;i++){const s=points[i];if(i===0)ctx.moveTo(X(s.x),Y(s.y));else ctx.lineTo(X(s.x),Y(s.y));}ctx.stroke();
  for(let i=0;i<points.length;i++){const s=points[i],dx=X(s.x)-X(sensors.eye.x),dy=Y(s.y)-Y(sensors.eye.y),distance=Math.hypot(dx,dy)||1,length=i%2===0?5:2.5;ctx.beginPath();ctx.moveTo(X(s.x),Y(s.y));ctx.lineTo(X(s.x)+dx/distance*length,Y(s.y)+dy/distance*length);ctx.stroke();}
 }
 for(const s of sensors.samples){ctx.strokeStyle=colors[s.side];ctx.lineWidth=.9;ctx.beginPath();ctx.arc(X(s.x),Y(s.y),s.hit?2.4:1.1,0,Math.PI*2);if(s.hit){ctx.fillStyle='#f7f9fbd9';ctx.fill();}ctx.stroke();}
 ctx.restore();
}
