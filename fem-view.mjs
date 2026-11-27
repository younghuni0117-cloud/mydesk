import * as T from './vendor/three-0.160.1.module.js';
const faces=[[0,3,2,1],[4,5,6,7],[0,1,5,4],[3,7,6,2],[0,4,7,3],[1,2,6,5]];
export function createView(host,onSelect){
 const renderer=new T.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));host.append(renderer.domElement);
 const scene=new T.Scene();scene.background=new T.Color('#f8fafc');scene.up.set(0,0,1);
 const camera=new T.PerspectiveCamera(38,1,.001,100);camera.up.set(0,0,1);
 scene.add(new T.HemisphereLight(0xffffff,0x94a3b8,2));const light=new T.DirectionalLight(0xffffff,2);light.position.set(1,-2,3);scene.add(light);
 let az=-1.1,el=.55,distance=2.2,target=new T.Vector3(.5,0,0),group=new T.Group(),solids=[],last=null,span=0;
 scene.add(group);const ray=new T.Raycaster();let clicked;
 function render(){const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.position.set(target.x+distance*Math.cos(el)*Math.cos(az),target.y+distance*Math.cos(el)*Math.sin(az),target.z+distance*Math.sin(el));camera.lookAt(target);camera.updateProjectionMatrix();renderer.render(scene,camera);}
 const pointers=new Map();host.addEventListener('contextmenu',e=>e.preventDefault());host.addEventListener('pointerdown',e=>{host.setPointerCapture(e.pointerId);pointers.set(e.pointerId,[e.clientX,e.clientY]);last=[e.clientX,e.clientY];clicked=[e.clientX,e.clientY];});
 host.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,[e.clientX,e.clientY]);if(pointers.size===2){const [a,b]=[...pointers.values()],s=Math.hypot(a[0]-b[0],a[1]-b[1]);if(span)distance=Math.max(.3,Math.min(8,distance*span/s));span=s;}else if(last){const dx=e.clientX-last[0],dy=e.clientY-last[1];if(e.buttons===2){target.x-=dx*.0015;target.z+=dy*.0015;}else{az-=dx*.008;el=Math.max(-1.4,Math.min(1.4,el+dy*.008));}}last=[e.clientX,e.clientY];render();});
 host.addEventListener('pointerup',e=>{pointers.delete(e.pointerId);span=0;if(clicked&&Math.hypot(e.clientX-clicked[0],e.clientY-clicked[1])<5){const r=host.getBoundingClientRect();ray.setFromCamera(new T.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),camera);const hit=ray.intersectObjects(solids)[0];if(hit)onSelect(hit.object.userData.element);}last=null;});host.addEventListener('pointercancel',()=>{pointers.clear();last=null;span=0;});
 host.addEventListener('wheel',e=>{e.preventDefault();distance=Math.max(.3,Math.min(8,distance*Math.exp(e.deltaY*.001)));render();},{passive:false});new ResizeObserver(render).observe(host);
 function update(result,frame,scale,field,selected,pointIndex=0){
  scene.remove(group);group.traverse(o=>{o.geometry?.dispose();if(o.material) o.material.dispose();});group=new T.Group();scene.add(group);solids=[];
  const values=result.model.elements.map((ids,i)=>field==='uz'?ids.reduce((s,n)=>s+frame.U[3*n+2],0)/8:frame.points[i].reduce((s,p)=>s+(field==='mises'?p.mises:p.stress[0]),0)/8);
  let min=Math.min(...values),max=Math.max(...values);const range=max-min||1;
  result.model.elements.forEach((ids,i)=>{const points=ids.map(n=>result.model.nodes[n].map((v,j)=>v+scale*frame.U[n*3+j])),verts=[];for(const f of faces)for(const j of [f[0],f[1],f[2],f[0],f[2],f[3]])verts.push(...points[j]);const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(verts,3));g.computeVertexNormals();const color=new T.Color().setHSL(.66*(1-(values[i]-min)/range),.72,.53);const solid=new T.Mesh(g,new T.MeshStandardMaterial({color,roughness:.6,side:T.DoubleSide}));solid.userData.element=i;group.add(solid);solids.push(solid);group.add(new T.LineSegments(new T.EdgesGeometry(g),new T.LineBasicMaterial({color:i===selected?0x111827:0x67788b,transparent:true,opacity:i===selected?1:.35})));});
  // Undeformed outline and actual fixed-node markers.
  const box=new T.Box3(new T.Vector3(0,-.06,-.06),new T.Vector3(1,.06,.06));group.add(new T.Box3Helper(box,0x94a3b8));
  const fixed=result.model.nodes.filter(p=>p[0]===0),gp=new T.BufferGeometry().setFromPoints(fixed.map(p=>new T.Vector3(...p)));group.add(new T.Points(gp,new T.PointsMaterial({color:0x326da9,size:.012})));
  const arrow=new T.ArrowHelper(new T.Vector3(0,0,-1),new T.Vector3(1,0,.16),.12,0xd85a41,.025,.015);group.add(arrow);
  const el=result.elements[selected],gpSelected=el.points[pointIndex],point=gpSelected.position.map((v,j)=>v+scale*gpSelected.N.reduce((s,N,i)=>s+N*frame.U[3*el.ids[i]+j],0));const marker=new T.Mesh(new T.SphereGeometry(.008,8,6),new T.MeshBasicMaterial({color:0x111827}));marker.position.set(...point);group.add(marker);render();return {min,max};
 }
 render();return {update};
}
