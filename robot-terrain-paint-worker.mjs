import {paintTerrain,setTerrainArt} from './robot-scenery.mjs?v=update87';
let terrain=null,obstacles=[];
self.onmessage=({data})=>{
 try{if(data.type==='art'){setTerrainArt(data.atlas,data.cave);return;}
  if(data.type!=='paint')return;const a=data.args;if(a.terrain)terrain=a.terrain;if(a.obstacles)obstacles=a.obstacles;const canvas=new OffscreenCanvas(Math.max(1,Math.ceil(a.W*a.ratio)),Math.max(1,Math.ceil(a.H*a.ratio))),ctx=canvas.getContext('2d');ctx.setTransform(a.ratio,0,0,a.ratio,0,0);
  paintTerrain(ctx,{...a,terrain,obstacles,X:x=>a.W/2+(x-a.camera)*a.scale,Y:y=>a.ground-y*a.scale});const bitmap=canvas.transferToImageBitmap();postMessage({type:'painted',id:data.id,bitmap},[bitmap]);
 }catch(error){postMessage({type:'error',message:error.message});}
};
