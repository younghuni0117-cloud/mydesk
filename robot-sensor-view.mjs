// Eye-centered scale at 1.5 times its original radius; physical endpoints share one gray color.
export function drawEyeSensorGauge(ctx,sensors,X,Y,scale){
 const cx=X(sensors.eye.x),cy=Y(sensors.eye.y),heading=sensors.eye.angle,r=1.5*Math.max(21,Math.min(44,scale*.28)),rad=Math.PI/180;
 ctx.save();ctx.setLineDash([]);
 for(const s of sensors.samples){ctx.strokeStyle='#7f8b93';ctx.fillStyle='#7f8b93';ctx.lineWidth=.9;ctx.beginPath();ctx.arc(X(s.x),Y(s.y),s.hit?2.4:1.1,0,Math.PI*2);if(s.hit)ctx.fill();ctx.stroke();}
 ctx.strokeStyle='#637d9299';ctx.lineWidth=.85;ctx.beginPath();ctx.arc(cx,cy,r,-heading-85*rad,-heading+95*rad);ctx.stroke();
 for(let degrees=-90;degrees<=75;degrees+=15){const a=-heading-degrees*rad,major=degrees%30===0,length=major?5:2.5;ctx.beginPath();ctx.moveTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r);ctx.lineTo(cx+Math.cos(a)*(r+length),cy+Math.sin(a)*(r+length));ctx.stroke();}
 const a=-heading;ctx.strokeStyle='#526c85bb';ctx.beginPath();ctx.moveTo(cx+Math.cos(a)*(r-5),cy+Math.sin(a)*(r-5));ctx.lineTo(cx+Math.cos(a)*(r+7),cy+Math.sin(a)*(r+7));ctx.stroke();
 ctx.fillStyle='#637d92';ctx.beginPath();ctx.arc(cx,cy,1.4,0,Math.PI*2);ctx.fill();ctx.restore();
}
