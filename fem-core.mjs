import {elasticMatrix, matvec, MATERIAL} from './fem-material.mjs?v=1';
export const SIGNS = [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]];
export const zeroMatrix = n => Array.from({length:n},()=>Array(n).fill(0));
export function mesh(nx=6, ny=2, nz=2, L=1, W=.12, H=.12) {
  const nodes=[], elements=[], index=(i,j,k)=>i+(nx+1)*(j+(ny+1)*k);
  for(let k=0;k<=nz;k++)for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++)nodes.push([L*i/nx,W*(j/ny-.5),H*(k/nz-.5)]);
  for(let k=0;k<nz;k++)for(let j=0;j<ny;j++)for(let i=0;i<nx;i++) {
    elements.push([[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]].map(([a,b,c])=>index(i+a,j+b,k+c)));
  }
  return {nodes,elements,L,W,H,nx,ny,nz};
}
export function shape(xi, eta, zeta) {
  return {N: SIGNS.map(([a,b,c])=>(1+a*xi)*(1+b*eta)*(1+c*zeta)/8),
    local: SIGNS.map(([a,b,c])=>[a*(1+b*eta)*(1+c*zeta)/8,b*(1+a*xi)*(1+c*zeta)/8,c*(1+a*xi)*(1+b*eta)/8])};
}
export function inverse3(a) {
  const [[a0,b,c],[d,e,f],[g,h,i]]=a;
  const det=a0*(e*i-f*h)-b*(d*i-f*g)+c*(d*h-e*g);
  if (!(det > 1e-16)) throw Error('Hex8 Jacobian이 양수가 아닙니다.');
  return {det, inv:[[e*i-f*h,c*h-b*i,b*f-c*e],[f*g-d*i,a0*i-c*g,c*d-a0*f],[d*h-e*g,b*g-a0*h,a0*e-b*d]].map(row=>row.map(v=>v/det))};
}
export function kinematics(coords, xi, eta, zeta) {
  const {N,local}=shape(xi,eta,zeta), J=zeroMatrix(3);
  for(let i=0;i<3;i++)for(let j=0;j<3;j++)for(let n=0;n<8;n++)J[i][j]+=coords[n][i]*local[n][j];
  const {det,inv}=inverse3(J);
  const gradients=local.map(row=>[0,1,2].map(i=>row.reduce((s,v,j)=>s+v*inv[j][i],0)));
  const B=Array.from({length:6},()=>Array(24).fill(0));
  gradients.forEach(([x,y,z],n)=>{
    const j=n*3;
    B[0][j]=x; B[1][j+1]=y; B[2][j+2]=z;
    B[3][j]=y; B[3][j+1]=x;
    B[4][j+1]=z; B[4][j+2]=y;
    B[5][j]=z; B[5][j+2]=x;
  });
  return {N,J,det,gradients,B,position:[0,1,2].map(i=>N.reduce((s,v,n)=>s+v*coords[n][i],0)),natural:[xi,eta,zeta]};
}
export function prepare(model) {
  const a=1/Math.sqrt(3);
  return model.elements.map(ids=>({ids,dofs:ids.flatMap(n=>[n*3,n*3+1,n*3+2]),
    points:SIGNS.map(s=>kinematics(ids.map(n=>model.nodes[n]),...s.map(v=>v*a)))}));
}
export function stiffness(B,D,volume) {
  const DB=D.map(row=>B[0].map((_,j)=>row.reduce((s,v,k)=>s+v*B[k][j],0)));
  return B[0].map((_,i)=>B[0].map((_,j)=>B.reduce((s,row,k)=>s+row[i]*DB[k][j]*volume,0)));
}
export function elementStiffness(element, D=elasticMatrix()) {
  const K=zeroMatrix(24);
  for(const p of element.points){
    const part=stiffness(p.B,D,p.det);
    for(let i=0;i<24;i++)for(let j=0;j<24;j++)K[i][j]+=part[i][j];
  }
  return K;
}
export function assemble(K, local, dofs) {
  for(let i=0;i<dofs.length;i++)for(let j=0;j<dofs.length;j++)K[dofs[i]][dofs[j]]+=local[i][j];
}
export function constraints(model, delta) {
  const prescribed=new Map();
  model.nodes.forEach(([x],i)=>{
    if(Math.abs(x)<1e-12) for(let j=0;j<3;j++)prescribed.set(i*3+j,0);
    else if(Math.abs(x-model.L)<1e-12)prescribed.set(i*3+2,-delta);
  });
  return {prescribed, free:Array.from({length:model.nodes.length*3},(_,i)=>i).filter(i=>!prescribed.has(i))};
}
export function factor(A) {
  const n=A.length, lu=A.map(row=>row.slice()), piv=Array.from({length:n},(_,i)=>i);
  const scale=Math.max(...lu.map(row=>Math.max(...row.map(Math.abs))));
  for(let k=0;k<n;k++){
    let p=k;
    for(let i=k+1;i<n;i++)if(Math.abs(lu[i][k])>Math.abs(lu[p][k]))p=i;
    if(Math.abs(lu[p][k])<scale*1e-13)throw Error('강성 행렬이 특이하거나 조건이 좋지 않습니다.');
    [lu[p],lu[k]]=[lu[k],lu[p]];[piv[p],piv[k]]=[piv[k],piv[p]];
    for(let i=k+1;i<n;i++){lu[i][k]/=lu[k][k];for(let j=k+1;j<n;j++)lu[i][j]-=lu[i][k]*lu[k][j];}
  }
  return rhs=>{
    const x=piv.map(i=>rhs[i]);
    for(let i=0;i<n;i++)for(let j=0;j<i;j++)x[i]-=lu[i][j]*x[j];
    for(let i=n-1;i>=0;i--){for(let j=i+1;j<n;j++)x[i]-=lu[i][j]*x[j];x[i]/=lu[i][i];}
    if(!x.every(Number.isFinite))throw Error('선형해가 유효하지 않습니다.');
    return x;
  };
}
export function linearSystem(model) {
  const elements=prepare(model), K=zeroMatrix(model.nodes.length*3), D=elasticMatrix(MATERIAL);
  for(const el of elements)assemble(K,elementStiffness(el,D),el.dofs);
  return {elements,K};
}
export {matvec};
