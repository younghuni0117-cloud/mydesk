import * as T from './vendor/three-0.160.1.module.js';
import {tractions} from './fem-playback.mjs?v=3';
export function stressView(host){
 const renderer=new T.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));host.append(renderer.domElement);
 const scene=new T.Scene(),camera=new T.PerspectiveCamera(36,1,.1,30);camera.up.set(0,0,1);camera.position.set(3,4,3);camera.lookAt(0,0,0);
 const cube=new T.Mesh(new T.BoxGeometry(1,1,1),new T.MeshBasicMaterial({color:0xc7d7e9,transparent:true,opacity:.3,depthWrite:false}));scene.add(cube);scene.add(new T.LineSegments(new T.EdgesGeometry(cube.geometry),new T.LineBasicMaterial({color:0x657a91})));scene.add(new T.AxesHelper(.9));
 let arrows=new T.Group();scene.add(arrows);
 function render(){const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();renderer.render(scene,camera);}
 new ResizeObserver(render).observe(host);
 return {update(stress){scene.remove(arrows);arrows.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});arrows=new T.Group();scene.add(arrows);const max=Math.max(...stress.map(Math.abs));if(max>0)for(const face of tractions(stress))for(let axis=0;axis<3;axis++){const v=face.traction[axis];if(Math.abs(v)<max*1e-7)continue;const direction=new T.Vector3();direction.setComponent(axis,Math.sign(v));const base=new T.Vector3(...face.normal).multiplyScalar(.56);base.setComponent((face.axis+1)%3,axis===face.axis?0:(axis===0?-.17:.17));const length=.55*Math.abs(v)/max;arrows.add(new T.ArrowHelper(direction,base,length,axis===face.axis?0xdd6849:0x2187b0,Math.min(.09,length*.3),Math.min(.05,length*.2)));}render();}};
}
