import * as T from './vendor/three-0.160.1.module.js';

// The grip is a real pivot. The physical event's simulation clock controls windup, contact and recoil.
export class HammerEffect {
 constructor(scene){
  this.root=new T.Group();this.root.name='disturbance-hammer';this.root.visible=false;scene.add(this.root);
  this.materials=[new T.MeshStandardMaterial({color:'#a5afb1',metalness:.55,roughness:.48}),new T.MeshStandardMaterial({color:'#536168',metalness:.4,roughness:.6}),new T.MeshStandardMaterial({color:'#ad885a',roughness:.85}),new T.MeshStandardMaterial({color:'#33454a',roughness:.9})];
  const add=(geometry,material,position)=>{const mesh=new T.Mesh(geometry,material);mesh.position.set(...position);this.root.add(mesh);return mesh;};
  this.face=new T.Vector3(.115,-.205,0);
  const head=add(new T.CylinderGeometry(.035,.035,.106,12),this.materials[0],[.06,-.205,0]);head.rotation.z=Math.PI/2;
  for(const x of [.007,.113]){const cap=add(new T.CylinderGeometry(.037,.037,.004,12),this.materials[1],[x,-.205,0]);cap.rotation.z=Math.PI/2;}
  const shaft=add(new T.CylinderGeometry(.010,.013,.2393,8),this.materials[2],[.0225,-.0875,0]);shaft.rotation.z=Math.atan2(.045,.235);
  const grip=add(new T.CylinderGeometry(.016,.016,.07,8),this.materials[3],[-.001,.005,0]);grip.rotation.z=shaft.rotation.z;
  this.direction=new T.Vector3();this.orientation=new T.Quaternion();this.swing=new T.Quaternion();this.strikePoint=new T.Vector3();this.event=null;this.size=0;this.phase='hidden';
 }
 show(event,time=event.started??event.time,resolver=null){return this.update(time,event,resolver);}
 update(time,event=this.event,resolver=null){
  if(!event||!(event.strength>0)||!Number.isFinite(event.strength)||event.point?.length!==3||event.impulse?.length!==3||!event.point.every(Number.isFinite)||!event.impulse.every(Number.isFinite)){this.hide();return false;}
  const newEvent=this.event?.id!==event.id;if(newEvent)this.contactLocked=false;
  this.event=event;this.direction.fromArray(event.impulse);if(this.direction.lengthSq()<1e-12){this.hide();return false;}this.direction.normalize();
  this.size=.65+.45*Math.sqrt(Math.min(1,event.strength/(event.unit==='N'?1000:100)));this.root.scale.setScalar(this.size);
  const impact=event.time,start=event.started??impact-.22,age=time-impact;
  if(age>.42){this.hide();return false;}
  this.phase=event.phase==='windup'?'windup':'recoil';
  if(this.phase==='windup'||!this.contactLocked){
   const resolved=resolver?.(event,this.direction,this.size),point=resolved?.point||event.point;this.strikePoint.fromArray(point);
   const gap=resolved?.ground!=null?point[1]-resolved.ground:1,offset=Math.max(0,Math.min(.035,(.037*this.size+.005-gap)/this.size));this.face.set(.115,-.205-offset,0);
   if(this.phase!=='windup')this.contactLocked=true;
  }
  const up=new T.Vector3(0,1,0);if(Math.abs(up.dot(this.direction))>.95)up.set(0,0,1);
  const z=new T.Vector3().crossVectors(this.direction,up).normalize(),y=new T.Vector3().crossVectors(z,this.direction).normalize();this.orientation.setFromRotationMatrix(new T.Matrix4().makeBasis(this.direction,y,z));
  const p=this.phase==='windup'?T.MathUtils.clamp((time-start)/Math.max(.001,impact-start),0,1):1,recoil=T.MathUtils.clamp(Math.max(0,age)/.32,0,1),angle=this.phase==='windup'?-.95*(1-p*p):-.65*recoil*recoil;
  // Hold the grip pivot steady relative to the moving target during windup. At contact the front cap meets the surface.
  this.root.position.copy(this.strikePoint).sub(this.face.clone().multiplyScalar(this.size).applyQuaternion(this.orientation));
  this.root.position.addScaledVector(this.direction,-.13*recoil*recoil);
  this.swing.setFromAxisAngle(new T.Vector3(0,0,1),angle);this.root.quaternion.copy(this.orientation).multiply(this.swing);
  this.root.visible=true;const opacity=age<.23?1:Math.max(0,(.42-age)/.19);for(const m of this.materials){m.transparent=opacity<1;m.opacity=opacity;m.depthWrite=opacity>=1;}
  this.root.updateMatrixWorld(true);return true;
 }
 hide(){this.root.visible=false;this.phase='hidden';}
 snapshot(){return{visible:this.root.visible,phase:this.phase,size:this.size,point:this.event?.point||null,surface:this.strikePoint.toArray(),face:this.face.clone().applyMatrix4(this.root.matrixWorld).toArray(),direction:this.direction.toArray()};}
}
