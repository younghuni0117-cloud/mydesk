import test from 'node:test';import assert from 'node:assert/strict';import {TerrainLayer} from '../robot-terrain-layer.mjs';
test('terrain raster keeps only latest pending view, reuses geometry and releases replaced bitmaps',async()=>{
 const original=globalThis.Worker,sent=[],draws=[];let worker;globalThis.Worker=class{constructor(){worker=this;}postMessage(data){sent.push(data);}terminate(){this.terminated=true;}};
 try{const layer=new TerrainLayer(Promise.resolve(false),()=>[]),ctx=new Proxy({drawImage:(...a)=>draws.push(a)},{get:(o,k)=>k in o?o[k]:()=>{},set:(o,k,v)=>(o[k]=v,true)}),terrain={segments:[{x0:-10,x1:10,y0:0,y1:1}]},obstacles=[],a={W:300,H:400,scale:100,camera:0,ground:350,terrain,obstacles,X:x=>150+x*100,Y:y=>350-y*100};
  assert.equal(layer.draw(ctx,a),true);assert.equal(sent.length,1);layer.draw(ctx,{...a,camera:1});layer.draw(ctx,{...a,camera:2});assert.equal(sent.length,1);let closed=0;const first={close(){closed++;}};worker.onmessage({data:{type:'painted',id:sent[0].id,bitmap:first}});assert.equal(sent.length,2);assert.equal(sent[1].args.camera,2);assert.equal(sent[1].args.terrain,null);
  const second={close(){closed++;}};worker.onmessage({data:{type:'painted',id:sent[1].id,bitmap:second}});assert.equal(closed,1);layer.draw(ctx,{...a,camera:2});assert.equal(sent.length,2);assert.equal(draws.at(-1)[0],second);
  const count=draws.length;layer.draw(ctx,{...a,terrain:{...terrain}});assert.equal(draws.length,count);assert.ok(sent.at(-1).args.terrain);worker.onerror({preventDefault(){}});assert.equal(layer.failed,true);assert.equal(closed,2);assert.equal(layer.draw(ctx,a),false);
 }finally{globalThis.Worker=original;}
});
