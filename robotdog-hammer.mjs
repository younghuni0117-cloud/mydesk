import * as T from './vendor/three-0.160.1.module.js';

// Visual feedback for an impulse already applied by the dynamics solver.
// No extra collider or second impulse: the striking face meets the recorded world-space hit point.
export class HammerEffect {
 constructor(scene){
  this.root=new T.Group();this.root.name='disturbance-hammer';this.root.visible=false;scene.add(this.root);
  this.materials=[new T.MeshStandardMaterial({color:'#879395',metalness:.65,roughness:.37}),new T.MeshStandardMaterial({color:'#4a565b',metalness:.48,roughness:.55}),new T.MeshStandardMaterial({color:'#b99568',roughness:.84}),new T.MeshStandardMaterial({color:'#334348',roughness:.9})];
  const add=(geometry,material,position)=>{const mesh=new T.Mesh(geometry,material);mesh.position.set(...position);this.root.add(mesh);return mesh;};
  // The grip is the pivot; +X is the direction of the actual applied impulse.
  this.face=new T.Vector3(.085,-.42,0);
  add(new T.BoxGeometry(.14,.16,.27),this.materials[0],[0,-.42,0]);
  add(new T.BoxGeometry(.03,.17,.28),this.materials[1],[.07,-.42,0]);
  add(new T.BoxGeometry(.025,.17,.28),this.materials[1],[-.07,-.42,0]);
  add(new T.CylinderGeometry(.018,.022,.43,8),this.materials[2],[0,-.16,0]);
  add(new T.CylinderGeometry(.026,.026,.16,8),this.materials[3],[0,.035,0]);
  this.direction=new T.Vector3();this.orientation=new T.Quaternion();this.swing=new T.Quaternion();this.strikePoint=new T.Vector3();
 }
 show(event,now=performance.now()){
  const strength=Number(event.strength)||0;
  if(!Number.isFinite(strength)||strength<=0||event.point?.length!==3||event.impulse?.length!==3||!event.point.every(Number.isFinite)||!event.impulse.every(Number.isFinite)){this.root.visible=false;this.event=null;return;}
  this.direction.fromArray(event.impulse);if(this.direction.lengthSq()<1e-12){this.root.visible=false;this.event=null;return;}
  this.direction.normalize();this.orientation.setFromUnitVectors(new T.Vector3(1,0,0),this.direction);
  this.strikePoint.fromArray(event.point);this.size=.65+1.35*Math.sqrt(Math.min(1,strength/(event.unit==='N'?1000:100)));
  this.root.scale.setScalar(this.size);this.event={id:event.id,point:[...event.point],strength,start:now};this.root.visible=true;this.update(now);
 }
 update(now=performance.now()){
  if(!this.event)return false;const t=Math.max(0,(now-this.event.start)/1000);
  if(t>=.65){this.root.visible=false;this.event=null;return false;}
  // Contact starts at t=0, synchronized with the physical impulse, then the head rebounds and withdraws.
  const recoil=Math.min(1,t/.48),ease=recoil*recoil*(3-2*recoil),gap=.48*ease;
  this.swing.setFromAxisAngle(new T.Vector3(0,0,1),-.85*ease);this.root.quaternion.copy(this.orientation).multiply(this.swing);
  const tip=this.face.clone().multiplyScalar(this.size).applyQuaternion(this.root.quaternion);
  this.root.position.copy(this.strikePoint).sub(tip).addScaledVector(this.direction,-gap);
  const opacity=t<.4?1:Math.max(0,(.65-t)/.25);for(const material of this.materials){material.transparent=opacity<1;material.opacity=opacity;material.depthWrite=opacity>=1;}
  this.root.updateMatrixWorld(true);return true;
 }
 snapshot(){return{visible:this.root.visible,size:this.size||0,point:this.event?.point||null,face:this.face.clone().applyMatrix4(this.root.matrixWorld).toArray(),direction:this.direction.toArray()};}
}
