// Six arm axes plus one gripper actuator. Row-major transforms in chassis coordinates.
export const ARM_MASS=8,ARM_REST=[0,.10,2.80,0,-2.80,0,.35];
export const ARM_LIMITS=[[-2.6,2.6],[-1.2,1.7],[.08,2.95],[-2.8,2.8],[-2.9,2.4],[-3.1,3.1],[0,1]];
export const ARM_POSES={folded:ARM_REST,reach:[0,.25,.45,0,-.55,0,.65],raised:[0,1.25,.45,0,-.65,0,.45]};
export const armTargets=value=>ARM_REST.map((v,i)=>Math.max(ARM_LIMITS[i][0],Math.min(ARM_LIMITS[i][1],Number.isFinite(value?.[i])?value[i]:v)));
const mul=(a,b)=>Array.from({length:9},(_,i)=>{const r=Math.floor(i/3),c=i%3;return a[r*3]*b[c]+a[r*3+1]*b[c+3]+a[r*3+2]*b[c+6];});
export const armVector=(R,p)=>[0,1,2].map(i=>R[i*3]*p[0]+R[i*3+1]*p[1]+R[i*3+2]*p[2]);
const Rx=a=>[1,0,0,0,Math.cos(a),-Math.sin(a),0,Math.sin(a),Math.cos(a)],Ry=a=>[Math.cos(a),0,Math.sin(a),0,1,0,-Math.sin(a),0,Math.cos(a)],Rz=a=>[Math.cos(a),-Math.sin(a),0,Math.sin(a),Math.cos(a),0,0,0,1];
const add=(a,b)=>a.map((v,i)=>v+b[i]),mid=(a,b)=>a.map((v,i)=>(v+b[i])/2);
export function armKinematics(input=ARM_REST){const q=armTargets(input),base=[-.18,.15,0],shoulder=[-.18,.265,0],A=Ry(q[0]),B=mul(A,Rz(q[1])),elbow=add(shoulder,armVector(B,[.42,0,0])),C=mul(B,Rz(q[2])),wrist=add(elbow,armVector(C,[.36,0,0])),D=mul(C,Rx(q[3])),E=mul(D,Rz(q[4])),F=mul(E,Rx(q[5])),palm=add(wrist,armVector(F,[.23,0,0])),tip=add(palm,armVector(F,[.14,0,0]));return {q,base,shoulder,elbow,wrist,palm,tip,rotations:[A,B,C,D,E,F],axes:[[0,1,0],armVector(A,[0,0,1]),armVector(B,[0,0,1]),armVector(C,[1,0,0]),armVector(D,[0,0,1]),armVector(F,[1,0,0])],masses:[[1.5,base],[2,mid(shoulder,elbow)],[1.7,mid(elbow,wrist)],[1.2,mid(wrist,palm)],[1.6,mid(palm,tip)]]};}
