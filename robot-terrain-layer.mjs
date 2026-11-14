// One in-flight raster and one latest request: fast dragging cannot build a queue.
export class TerrainLayer{
 constructor(artReady,artSources){this.bitmap=null;this.painted=null;this.inFlight=null;this.latest=null;this.serial=0;this.artRevision=0;this.failed=false;this.sentGeometry='';this.terrainIds=new WeakMap();this.nextTerrainId=0;
  try{this.worker=new Worker(new URL('./robot-terrain-paint-worker.mjs?v=update87',import.meta.url),{type:'module'});this.worker.onmessage=({data})=>{if(data.type==='error'){this.fail();return;}if(data.type!=='painted')return;const request=this.inFlight;if(!request||data.id!==request.id){data.bitmap.close();return;}this.inFlight=null;this.bitmap?.close();this.bitmap=data.bitmap;this.painted=request;this.sendLatest();};this.worker.onerror=e=>{e.preventDefault?.();this.fail();};
   Promise.resolve(artReady).then(async()=>{if(this.failed)return;const sources=artSources();if(!sources[0]?.naturalWidth||!sources[1]?.naturalWidth)return;const [atlas,cave]=await Promise.all(sources.map(source=>createImageBitmap(source)));if(this.failed){atlas.close();cave.close();return;}this.worker.postMessage({type:'art',atlas,cave},[atlas,cave]);this.artRevision++;}).catch(()=>{});
  }catch{this.fail();}
 }
 fail(){this.failed=true;this.worker?.terminate();this.worker=null;this.inFlight=null;this.bitmap?.close();this.bitmap=null;}
 id(object){if(!object||typeof object!=='object')return 0;if(!this.terrainIds.has(object))this.terrainIds.set(object,++this.nextTerrainId);return this.terrainIds.get(object);}
 sendLatest(){if(this.failed||this.inFlight||!this.latest||this.painted?.key===this.latest.key)return;this.inFlight=this.latest;const a=this.inFlight.args,geometry=this.id(a.terrain)+':'+this.id(a.obstacles),args=geometry===this.sentGeometry?{...a,terrain:null,obstacles:null}:a;this.sentGeometry=geometry;this.worker.postMessage({type:'paint',id:this.inFlight.id,args});}
 draw(ctx,args){if(this.failed)return false;const ratio=Math.min(2,globalThis.window?.devicePixelRatio||1),key=[args.W,args.H,args.scale,args.camera,args.ground,ratio,this.artRevision,this.id(args.terrain),this.id(args.obstacles)].join(':');
  if(this.latest?.key!==key)this.latest={id:++this.serial,key,args:{W:args.W,H:args.H,scale:args.scale,camera:args.camera,ground:args.ground,terrain:args.terrain,obstacles:args.obstacles,ratio}};this.sendLatest();
  if(this.bitmap&&this.painted&&this.painted.args.terrain===args.terrain&&this.painted.args.obstacles===args.obstacles){const a=this.painted.args,k=args.scale/a.scale,x=args.W/2+(a.camera-args.camera)*args.scale-a.W*k/2,y=args.ground-a.ground*k;ctx.fillStyle='#edf2ed';ctx.fillRect(0,0,args.W,args.H);ctx.drawImage(this.bitmap,x,y,a.W*k,a.H*k);}
  else{ctx.fillStyle='#edf2ed';ctx.fillRect(0,0,args.W,args.H);ctx.fillStyle='#b5a080';ctx.beginPath();ctx.moveTo(0,args.H);const left=args.camera-args.W/(2*args.scale),right=args.camera+args.W/(2*args.scale);for(const segment of args.terrain?.segments||[]){if(segment.x1<left||segment.x0>right)continue;ctx.lineTo(args.X(segment.x0),args.Y(segment.y0));ctx.lineTo(args.X(segment.x1),args.Y(segment.y1));}ctx.lineTo(args.W,args.H);ctx.closePath();ctx.fill();}
  return true;
 }
}
