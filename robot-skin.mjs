// Cel shaded side-view explorer. The cached artwork follows each physical rigid body.
const sprites=new Map();
const ink='#263b50',cream='#f3e4c6',orange='#ec9b53',blue='#4e93af',dark='#344f68';
export const posePoint=(pose,x,y)=>[pose[0]+Math.cos(pose[2])*x-Math.sin(pose[2])*y,pose[1]+Math.sin(pose[2])*x+Math.cos(pose[2])*y];
export function waistOutline(pelvis,torso){
 const points=[posePoint(pelvis,-.145,.055),posePoint(pelvis,.145,.055),posePoint(torso,-.145,-.175),posePoint(torso,.145,-.175),posePoint(pelvis,-.12,.09),posePoint(pelvis,.12,.09)].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
 const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]),lower=[],upper=[];
 for(const p of points){while(lower.length>1&&cross(lower.at(-2),lower.at(-1),p)<=0)lower.pop();lower.push(p);}for(const p of [...points].reverse()){while(upper.length>1&&cross(upper.at(-2),upper.at(-1),p)<=0)upper.pop();upper.push(p);}return [...lower.slice(0,-1),...upper.slice(0,-1)];
}
export function shoeOutline(foot,toe){return [...[[-.13,-.05],[-.135,.03],[-.095,.09],[-.055,.1],[.035,.065]].map(p=>posePoint(foot,...p)),...[[-.035,.035],[.025,.033],[.048,.012],[.048,-.02],[.035,-.035],[-.04,-.035]].map(p=>posePoint(toe,...p)),posePoint(foot,.125,-.05)];}
const finishes={explorer:{shoe:'#344f68',sole:'#dc9c5e',waist:'#e5d6b7'},tin:{shoe:'#a6bbc4',sole:'#425968',waist:'#6e8795'},space:{shoe:'#d0ab57',sole:'#685632',waist:'#a38b50'},hiker:{shoe:'#8d6946',sole:'#d5bb83',waist:'#cd6b47'},doyun:{shoe:'#eee8db',sole:'#485365',waist:'#51473f'},seona:{shoe:'#f3ebdd',sole:'#595d67',waist:'#d7bc7e'}};
function sprite(part,skin){
 const key=[skin,part.name,part.w,part.h].join(':');if(sprites.has(key))return sprites.get(key);
 const canvas=document.createElement('canvas');canvas.width=192;canvas.height=256;const c=canvas.getContext('2d');
 const unit=260,w=part.w*unit,h=part.h*unit,name=part.name,rear=name.startsWith('left');c.translate(96,128);c.lineWidth=3;c.lineJoin='round';c.lineCap='round';c.strokeStyle=ink;
 function blob(points,fill){c.beginPath();for(let i=0;i<points.length;i++){const p=points[i];if(i===0)c.moveTo(...p);else if(p.length===4)c.quadraticCurveTo(...p);else c.lineTo(...p);}c.closePath();c.fillStyle=fill;c.fill();c.stroke();}
 function round(x,y,width,height,r,fill){c.beginPath();c.roundRect(x,y,width,height,r);c.fillStyle=fill;c.fill();c.stroke();}
 function line(points,color=ink,width=2){c.strokeStyle=color;c.lineWidth=width;c.beginPath();points.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.stroke();c.strokeStyle=ink;c.lineWidth=3;}
 function disk(x,y,r,fill){c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fillStyle=fill;c.fill();c.stroke();}
 if(skin==='doyun'||skin==='seona'){
  const girl=skin==='seona',flesh=rear?'#d7b39b':'#f3d8bf',hair=girl?'#a98f6c':'#252e40',cloth=girl?(rear?'#b59a66':'#dbc184'):(rear?'#3d3936':'#51473f'),pants=girl?'#55545b':'#4a4b50';
  if(name==='head'){
   if(girl){blob([[-w*.8,-w*.61],[-w*.98,w*.18,-w*.77,w*.67],[-w*.54,w*.95,-w*.8,w*1.2],[-w*1.03,w*1.52,-w*.52,w*1.92],[-w*.35,w*1.94,-w*.29,w*1.51],[w*.02,w*1.99,w*.17,w*1.72],[w*.6,w*1.77,w*.55,w*.73],[w*.91,w*.13,w*.78,-w*.38]],hair);line([[-w*.64,w*.35],[-w*.48,w*.99],[-w*.63,w*1.52]],'#d1b68b',2);}
   blob([[-w*.59,-w*.67],[w*.4,-w*.69],[w*.65,-w*.25],[w*.88,w*.03],[w*.66,w*.24],[w*.58,w*.66],[w*.03,w*.86],[-w*.52,w*.51],[-w*.66,w*.08]],flesh);
   blob([[-w*.76,-w*.2],[-w*.86,-w*.84],[-w*.35,-w*1.05],[w*.34,-w*.99],[w*.74,-w*.61],[w*.7,-w*.18],[w*.4,-w*.43],[w*.27,-w*.1],[w*.02,-w*.47],[-w*.18,-w*.17],[-w*.35,-w*.5],[-w*.43,w*.16]],hair);
   if(girl){line([[-w*.58,-w*.72],[-w*.37,-w*.29]],'#d1b68b',2);line([[-w*.12,-w*.77],[w*.07,-w*.37]],'#d1b68b',2);}else{line([[-w*.57,-w*.69],[-w*.21,-w*.86],[w*.4,-w*.59]],'#52617d',2);}
   disk(-w*.43,w*.12,w*.14,flesh);c.fillStyle='#fff8ef';c.beginPath();c.ellipse(w*.39,w*.01,w*.15,w*.2,0,0,Math.PI*2);c.fill();c.stroke();disk(w*.43,w*.02,w*.09,girl?'#b39843':'#547fa5');disk(w*.45,w*.03,w*.035,'#26374c');line([[w*.2,-w*.24],[w*.57,-w*.22]],hair,2);line([[w*.37,w*.45],[w*.62,w*.43]],'#a47762',1.5);
  }else if(name==='torso'){
   round(-w*.12,-h*.62,w*.26,h*.24,3,flesh);blob([[-w*.43,-h*.45],[w*.37,-h*.45],[w*.52,-h*.25],[w*.43,h*.49],[-w*.42,h*.49],[-w*.53,-h*.08]],cloth);
   blob([[-w*.19,-h*.45],[w*.17,-h*.45],[w*.2,h*.44],[-w*.17,h*.44]],'#f1ede1');blob([[-w*.2,-h*.47],[0,-h*.29],[-w*.12,-h*.15],[-w*.35,-h*.4]],'#fff9e9');blob([[w*.15,-h*.46],[0,-h*.29],[w*.15,-h*.14],[w*.33,-h*.38]],'#fff9e9');
   line([[-w*.36,-h*.39],[-w*.2,-h*.1],[-w*.31,h*.03],[-w*.16,h*.38]],girl?'#f2d99c':'#a69b80',2);line([[w*.31,-h*.39],[w*.18,-h*.12],[w*.32,h*.03],[w*.2,h*.4]],girl?'#b5985d':'#a69b80',2);for(let j=0;j<3;j++)disk(w*.06,h*(-.01+j*.16),1.5,'#8f8879');round(w*.23,-h*.03,w*.19,h*.08,1,'#e5ddc7');line([[-w*.39,h*.34],[-w*.2,h*.34]],girl?'#a68a58':'#39342f',2);
  }else if(name==='pelvis'){
   blob([[-w*.47,-h*.46],[w*.43,-h*.46],[w*.54,h*.55],[-w*.48,h*.55]],pants);round(-w*.49,-h*.46,w*.98,h*.19,2,'#383b42');if(girl){for(let j=0;j<4;j++)line([[-w*.32+j*w*.2,-h*.1],[-w*.4+j*w*.24,h*.5]],'#89858b',1.5);}else line([[0,-h*.07],[w*.03,h*.46]],'#858282',1.5);
  }else if(name.includes('Hand')){
   blob([[-w*.41,-h*.48],[w*.31,-h*.46],[w*.51,-h*.08],[w*.39,h*.4],[-w*.07,h*.49],[-w*.42,h*.15]],flesh);line([[w*.13,-h*.03],[w*.1,h*.27]],'#c6957b',1.5);
  }else{
   const leg=name.includes('Thigh')||name.includes('Shin');blob([[-w*.38,-h*.5],[w*.36,-h*.5],[w*.48,-h*.2],[w*.34,h*.49],[-w*.31,h*.49],[-w*.46,h*.1]],leg?pants:cloth);line([[-w*.2,-h*.33],[-w*.23,h*.28]],leg?'#79777b':girl?'#ecd49b':'#8d8270',1.5);if(name.includes('Forearm'))round(-w*.36,h*.32,w*.72,h*.12,1,'#eee9dd');
  }
 }else if(skin==='hiker'){
  const flesh=rear?'#c68d69':'#edbc96',jacket=rear?'#a8513c':'#dc754b',pants=rear?'#405b51':'#647965',seam='#61493b';
  if(name==='head'){
   // A human face, knit cap, hair and stubble; no visor or mechanical joints.
   blob([[-w*.59,-w*.67],[w*.46,-w*.71],[w*.66,-w*.27],[w*.98,w*.06],[w*.72,w*.25],[w*.61,w*.67],[w*.08,w*.89],[-w*.52,w*.55],[-w*.68,w*.1]],flesh);
   blob([[-w*.7,-w*.47],[-w*.63,-w*.87],[w*.4,-w*.85],[w*.57,-w*.4],[w*.21,-w*.33],[-w*.24,-w*.2],[-w*.32,w*.31],[-w*.61,w*.31]],'#6c4b39');
   blob([[-w*.76,-w*.49],[-w*.76,-w*.99,-w*.09,-w*1.12],[w*.55,-w*1.08,w*.68,-w*.56],[w*.87,-w*.43],[w*.68,-w*.31],[-w*.8,-w*.31]],'#6e8666');
   line([[-w*.61,-w*.57],[w*.56,-w*.57]],'#a3b58d',3);for(let i=0;i<4;i++)line([[-w*.48+i*w*.24,-w*.9],[-w*.42+i*w*.24,-w*.62]],'#526b51',1);
   disk(-w*.38,w*.13,w*.17,flesh);disk(w*.43,-w*.03,w*.055,'#302d2a');line([[w*.24,-w*.19],[w*.55,-w*.2]],'#5f4435',2);line([[w*.35,w*.47],[w*.65,w*.45]],'#8d5440',2);line([[w*.14,w*.61],[w*.36,w*.7],[w*.53,w*.56]],'#a27355',2);
  }else if(name==='torso'){
   round(-w*.13,-h*.61,w*.27,h*.22,3,flesh);round(-w*.76,-h*.35,w*.43,h*.77,7,'#4a6d6b');line([[-w*.62,-h*.25],[-w*.62,h*.29]],'#a8b7a0',3);
   blob([[-w*.44,-h*.45],[-w*.2,-h*.55],[w*.31,-h*.45],[w*.52,-h*.28],[w*.47,h*.43],[-w*.44,h*.43],[-w*.55,h*.06]],jacket);
   blob([[-w*.31,-h*.45],[-w*.03,-h*.35],[w*.2,-h*.46],[w*.14,-h*.23],[-w*.08,-h*.18]],'#ead5a8');line([[w*.03,-h*.24],[w*.07,h*.4]],'#f4d7a2',3);round(w*.18,h*.04,w*.25,h*.2,2,'#c65e40');line([[w*.21,h*.09],[w*.41,h*.08]],'#edb482',2);line([[-w*.31,-h*.32],[-w*.29,h*.2]],'#3f5a54',4);line([[-w*.43,h*.33],[w*.44,h*.33]],'#9c4937',2);
  }else if(name==='pelvis'){
   blob([[-w*.47,-h*.46],[w*.43,-h*.46],[w*.54,h*.44],[-w*.43,h*.47]],pants);round(-w*.5,-h*.42,w,h*.24,2,'#73583c');round(w*.04,-h*.43,w*.22,h*.25,2,'#c6b28b');line([[w*.01,-h*.05],[w*.05,h*.39]],'#3e5549',2);
  }else if(name.includes('Foot')||name.includes('ToePart')){
   blob([[-w*.52,-h*.61],[w*.1,-h*.55],[w*.63,-h*.03],[w*.63,h*.5],[-w*.55,h*.5]],rear?'#614a38':'#8d6946');line([[-w*.47,h*.35],[w*.55,h*.35]],'#d5bb83',4);line([[-w*.1,-h*.25],[w*.18,-h*.1]],'#eee0bb',2);line([[-w*.24,-h*.04],[w*.04,h*.11]],'#eee0bb',2);
  }else if(name.includes('Hand')){
   blob([[-w*.4,-h*.5],[w*.32,-h*.46],[w*.56,-h*.09],[w*.43,h*.4],[-w*.02,h*.49],[-w*.42,h*.19]],flesh);line([[w*.17,-h*.03],[w*.12,h*.26]],'#bb8867',1.5);
  }else{
   const leg=name.includes('Thigh')||name.includes('Shin');blob([[-w*.38,-h*.51],[w*.37,-h*.51],[w*.49,-h*.23],[w*.32,h*.5],[-w*.31,h*.5],[-w*.48,h*.08]],leg?pants:jacket);
   line([[-w*.2,-h*.35],[-w*.24,h*.25]],leg?'#9aa489':'#efab73',2);line([[w*.25,-h*.26],[w*.18,h*.33]],leg?'#3e5549':'#a94f39',2);
   if(name.includes('Thigh')){round(-w*.24,-h*.02,w*.58,h*.25,2,rear?'#354f46':'#526951');line([[-w*.19,h*.01],[w*.3,h*.01]],'#a2a88b',1);}
   if(name.includes('Forearm'))round(-w*.36,h*.34,w*.72,h*.12,2,'#aa4e37');
  }
 }else if(skin==='tin'||skin==='space'){
  const gold=skin==='space',metal=gold?(rear?'#9c732e':'#ddb860'):(rear?'#6d8491':'#bdcbd1'),shade=gold?'#946828':'#6e8795',shine=gold?'#fff0ad':'#edf6f8',joint=gold?'#584d38':'#425968';
  if(name==='head'){
   if(gold){blob([[-w*.65,-w*.76],[-w*.1,-w*1.1,w*.57,-w*.78],[w*.83,-w*.18],[w*1.06,w*.12],[w*.74,w*.28],[w*.62,w*.79],[-w*.15,w*.91],[-w*.73,w*.42]],metal);disk(w*.4,-w*.14,w*.23,joint);disk(w*.4,-w*.14,w*.09,'#ffe2a1');line([[w*.16,w*.45],[w*.67,w*.45]],joint,3);line([[w*.2,w*.57],[w*.6,w*.57]],joint,1);disk(-w*.51,0,w*.21,shade);line([[-w*.14,-w*.75],[-w*.13,w*.36]],shine,2);}
   else{round(-w*.75,-w*.97,w*1.56,w*1.83,8,metal);c.beginPath();c.ellipse(0,-w*.92,w*.78,w*.17,0,0,Math.PI*2);c.fillStyle=shade;c.fill();c.stroke();round(-w*.12,-w*.35,w*1.05,w*.43,5,joint);disk(w*.38,-w*.14,4,'#b4edec');line([[w*.06,w*.5],[w*.67,w*.5]],joint,4);line([[0,-w*1.08],[0,-w*1.4]],ink,3);disk(0,-w*1.46,4,'#ee945b');disk(-w*.69,-w*.08,5,shade);}
  }else if(name==='torso'){
   round(-w*.16,-h*.65,w*.32,h*.22,3,joint);
   blob([[-w*.52,-h*.43],[w*.44,-h*.46],[w*.6,-h*.25],[w*.43,h*.42],[-w*.4,h*.43],[-w*.55,h*.15]],metal);
   round(-w*.34,-h*.32,w*.72,h*.39,5,gold?'#c99b43':'#8fa8b5');
   if(gold){disk(w*.13,-h*.14,w*.14,joint);disk(w*.13,-h*.14,w*.065,'#f7dda0');for(let i=0;i<4;i++)line([[-w*.28+i*w*.16,h*.13],[-w*.3+i*w*.17,h*.38]],['#70472a','#475d70','#a55340','#c1bb89'][i],3);}
   else{round(-w*.18,-h*.22,w*.4,h*.18,3,joint);disk(w*.08,-h*.13,4,'#a0e0df');for(let i=0;i<3;i++)line([[-w*.22,h*(.17+i*.07)],[w*.25,h*(.17+i*.07)]],joint,2);}
   line([[-w*.43,-h*.31],[-w*.43,h*.25]],shine,3);disk(w*.39,-h*.32,2,shade);disk(-w*.35,h*.34,2,shade);
  }else if(name==='pelvis'){
   round(-w*.5,-h*.45,w,h*.9,5,metal);round(-w*.52,-h*.43,w*1.04,h*.22,2,joint);disk(w*.2,0,w*.12,shade);line([[-w*.3,h*.2],[w*.24,h*.2]],shine,2);
  }else if(name.includes('Foot')||name.includes('ToePart')){
   blob([[-w*.53,-h*.55],[w*.24,-h*.5],[w*.58,-h*.12],[w*.6,h*.48],[-w*.53,h*.48]],metal);line([[-w*.45,h*.31],[w*.52,h*.31]],joint,4);line([[-w*.25,-h*.31],[w*.22,-h*.21]],shine,2);
  }else if(name.includes('Hand')){
   round(-w*.45,-h*.46,w*.9,h*.9,4,metal);for(let i=0;i<3;i++)line([[-w*.3+i*w*.25,0],[-w*.3+i*w*.25,h*.33]],joint,1.5);
  }else{
   round(-w*.37,-h*.46,w*.74,h*.92,Math.min(w*.3,7),metal);line([[-w*.17,-h*.26],[-w*.17,h*.28]],shine,3);line([[w*.23,-h*.2],[w*.23,h*.2]],shade,2);disk(0,-h*.44,Math.min(8,w*.38),joint);disk(0,-h*.44,Math.min(4,w*.2),metal);round(-w*.42,h*.25,w*.84,h*.14,2,shade);
  }
 }else if(name==='head'){
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
function drawMesh(ctx,points,X,Y,fill,scale){ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(X(x),Y(y)):ctx.moveTo(X(x),Y(y)));ctx.closePath();ctx.fillStyle=fill;ctx.fill();ctx.strokeStyle=ink;ctx.lineWidth=Math.max(.8,scale*.009);ctx.lineJoin='round';ctx.stroke();}
function drawShoe(ctx,foot,toe,X,Y,scale,skin,rear){const style=finishes[skin]||finishes.explorer,points=shoeOutline(foot,toe);drawMesh(ctx,points,X,Y,style.shoe,scale);ctx.beginPath();for(const [i,index]of [0,11,10,9,8].entries()){const [x,y]=points[index];if(i)ctx.lineTo(X(x),Y(y));else ctx.moveTo(X(x),Y(y));}ctx.strokeStyle=style.sole;ctx.lineWidth=Math.max(1.2,scale*.024);ctx.stroke();
 if(['hiker','doyun','seona'].includes(skin)){ctx.strokeStyle=skin==='hiker'?'#e8d5ae':'#7c8490';ctx.lineWidth=Math.max(.8,scale*.008);for(let i=0;i<3;i++){const a=posePoint(foot,-.035+i*.025,.064-i*.006),b=posePoint(foot,-.008+i*.025,.045-i*.006);ctx.beginPath();ctx.moveTo(X(a[0]),Y(a[1]));ctx.lineTo(X(b[0]),Y(b[1]));ctx.stroke();}}
}
export function drawRobotSkin(ctx,parts,poses,X,Y,scale,skin='explorer'){
 const layer=n=>n.startsWith('left')?0:n.startsWith('right')?2:1,indices=Object.fromEntries(parts.map((p,i)=>[p.name,i])),style=finishes[skin]||finishes.explorer;let waistDrawn=false;
 for(const {part,i}of parts.map((part,i)=>({part,i})).sort((a,b)=>layer(a.part.name)-layer(b.part.name))){
  if(!waistDrawn&&layer(part.name)>=1){drawMesh(ctx,waistOutline(poses[indices.pelvis],poses[indices.torso]),X,Y,style.waist,scale);waistDrawn=true;}
  if(part.name.includes('ToePart'))continue;
  if(part.name.endsWith('Foot')){const toe=poses[indices[part.name.replace('Foot','ToePart')]];drawShoe(ctx,poses[i],toe,X,Y,scale,skin,part.name.startsWith('left'));continue;}
  const p=poses[i],art=sprite(part,skin),s=scale/art.unit;ctx.save();ctx.translate(X(p[0])+(part.name.startsWith('left')?-scale*.012:0),Y(p[1]));ctx.rotate(-p[2]);ctx.drawImage(art.canvas,-96*s,-128*s,192*s,256*s);ctx.restore();
 }
}
