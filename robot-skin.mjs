// Cel shaded side-view explorer. The cached artwork follows each physical rigid body.
const sprites=new Map();
const ink='#263b50',cream='#f3e4c6',orange='#ec9b53',blue='#4e93af',dark='#344f68';
function sprite(part){
 const key=[part.name,part.w,part.h].join(':');if(sprites.has(key))return sprites.get(key);
 const canvas=document.createElement('canvas');canvas.width=192;canvas.height=256;const c=canvas.getContext('2d');
 const unit=260,w=part.w*unit,h=part.h*unit,name=part.name,rear=name.startsWith('left');c.translate(96,128);c.lineWidth=3;c.lineJoin='round';c.lineCap='round';c.strokeStyle=ink;
 function blob(points,fill){c.beginPath();for(let i=0;i<points.length;i++){const p=points[i];if(i===0)c.moveTo(...p);else if(p.length===4)c.quadraticCurveTo(...p);else c.lineTo(...p);}c.closePath();c.fillStyle=fill;c.fill();c.stroke();}
 function round(x,y,width,height,r,fill){c.beginPath();c.roundRect(x,y,width,height,r);c.fillStyle=fill;c.fill();c.stroke();}
 function line(points,color=ink,width=2){c.strokeStyle=color;c.lineWidth=width;c.beginPath();points.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.stroke();c.strokeStyle=ink;c.lineWidth=3;}
 function disk(x,y,r,fill){c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fillStyle=fill;c.fill();c.stroke();}
 if(name==='head'){
  // Rounded helmet, side face, ear assembly, expression and a short antenna.
  blob([[-w*.72,-w*.8],[-w*.2,-w*1.2,w*.62,-w*.72],[w*.92,-w*.2],[w*1.12,w*.16],[w*.82,w*.3],[w*.68,w*.75],[0,w*.95,-w*.65,w*.48],[-w*.85,0]],cream);
  blob([[-w*.72,-w*.15],[-w*.85,-w*.9,w*.05,-w*1.04],[w*.8,-w*.9,w*.87,-w*.46],[w*.34,-w*.55],[-w*.1,-w*.3]],rear?'#476c85':blue);
  round(-w*.02,-w*.3,w*.77,w*.4,5,dark);line([[w*.19,-w*.13],[w*.51,-w*.13]],'#a7f1ee',3);disk(-w*.48,0,w*.22,orange);disk(-w*.48,0,w*.08,cream);
  line([[w*.47,w*.47],[w*.71,w*.45]],ink,2);line([[-w*.36,-w*.93],[-w*.55,-w*1.27]],ink,3);disk(-w*.56,-w*1.3,3,orange);
 }else if(name==='torso'){
  // Jacket silhouette, padded chest, side backpack and seams.
  round(-w*.18,-h*.66,w*.36,h*.25,3,cream);
  round(-w*.66,-h*.26,w*.37,h*.65,7,dark);
  blob([[-w*.46,-h*.42],[-w*.28,-h*.57,w*.3,-h*.45],[w*.64,-h*.28],[w*.56,h*.12],[w*.35,h*.46],[-w*.38,h*.46],[-w*.54,h*.1]],cream);
  blob([[-w*.42,-h*.42],[w*.3,-h*.44],[w*.53,-h*.28],[w*.46,-h*.05],[-w*.44,-h*.08]],blue);
  line([[w*.25,-h*.03],[w*.22,h*.31]],'#a9987a',2);round(w*.17,h*.05,w*.24,h*.19,3,orange);line([[-w*.28,h*.29],[w*.1,h*.29]],'#a9987a',2);
  round(-w*.4,-h*.48,w*.75,h*.1,3,orange);disk(w*.32,-h*.21,4,'#b2f1e3');
 }else if(name==='pelvis'){
  blob([[-w*.5,-h*.45],[w*.44,-h*.45],[w*.55,h*.18],[w*.28,h*.55],[-w*.42,h*.4]],dark);round(-w*.53,-h*.5,w*1.05,h*.28,3,orange);round(w*.15,-h*.5,w*.23,h*.28,2,cream);line([[-w*.35,h*.15],[w*.25,h*.27]],'#7196ac',2);
 }else if(name.includes('Foot')||name.includes('ToePart')){
  blob([[-w*.55,-h*.55],[w*.19,-h*.55],[w*.6,-h*.09],[w*.61,h*.5],[-w*.54,h*.5]],rear?'#3d5b70':dark);line([[-w*.48,h*.35],[w*.54,h*.35]],orange,4);line([[0,-h*.4],[w*.17,0]],cream,2);
 }else if(name.includes('Hand')){
  blob([[-w*.5,-h*.48],[w*.38,-h*.5],[w*.6,-h*.14],[w*.53,h*.39],[0,h*.54],[-w*.46,h*.3]],rear?'#a87848':orange);line([[w*.12,-h*.04],[w*.12,h*.27]],ink,2);
 }else{
  const leg=name.includes('Thigh')||name.includes('Shin'),upper=name.includes('Thigh')||name.includes('UpperArm');
  const base=rear?(leg?'#3e617b':'#afac99'):(leg?blue:cream);
  blob([[-w*.38,-h*.51],[w*.39,-h*.51],[w*.55,-h*.24],[w*.38,h*.49],[-w*.32,h*.49],[-w*.52,h*.12]],base);
  blob([[-w*.4,-h*.48],[-w*.05,-h*.5],[-w*.06,h*.46],[-w*.32,h*.48],[-w*.5,h*.1]],rear?'#304c63':leg?'#39708b':'#cebea0');
  round(-w*.43,upper?-h*.42:h*.18,w*.86,h*.2,3,rear?'#ad754b':orange);
  disk(0,-h*.43,Math.min(w*.35,8),rear?'#48667d':cream);line([[w*.13,-h*.12],[w*.1,h*.1]],rear?'#5c7e92':'#b6d7dc',2);
 }
 const result={canvas,unit};sprites.set(key,result);return result;
}
export function drawRobotSkin(ctx,parts,poses,X,Y,scale){
 // Rear limbs sit behind the same hip/shoulder axis; front limbs overlay the outfit.
 const layer=n=>n.startsWith('left')?0:n.startsWith('right')?2:1;
 for(const {part,i}of parts.map((part,i)=>({part,i})).sort((a,b)=>layer(a.part.name)-layer(b.part.name))){const p=poses[i],art=sprite(part),s=scale/art.unit;ctx.save();ctx.translate(X(p[0])+(part.name.startsWith('left')?-scale*.012:0),Y(p[1]));ctx.rotate(-p[2]);ctx.drawImage(art.canvas,-96*s,-128*s,192*s,256*s);ctx.restore();}
}
