import {assemble,zeroMatrix} from './fem-core.mjs?v=1';
import {elasticMatrix} from './fem-material.mjs?v=1';
export const STAGES={shape:['형상함수','Nᵢ = (1+ξᵢξ)(1+ηᵢη)(1+ζᵢζ)/8'],B:['변형률 행렬','ε = B uₑ'],D:['재료 행렬','σ = D ε'],Ke:['요소 강성','Kₑ = Σ Bᵀ D B det(J)'],assembly:['전역 조립','K[I,J] += Kₑ[i,j]'],boundary:['경계조건','u꜀ 지정 · bꜰ = −Kꜰ꜀ u꜀'],solve:['선형 풀이','Kꜰꜰ uꜰ = bꜰ · 피벗 LU'],strain:['변형률','ε = B uₑ'],stress:['응력','σ = D ε'],reaction:['반력·평형','R = K u · 자유 DOF 잔차 확인']};
export function partialStiffness(result,count){const K=zeroMatrix(result.K.length);for(let i=0;i<count;i++)assemble(K,result.elementMatrices[i],result.elements[i].dofs);return K;}
export function playbackState(result,eventIndex){const event=result.events[eventIndex],f=result.frames[event.frame],stages=['boundary','solve','strain','stress','reaction'],rank=stages.indexOf(event.stage),geometryReady=rank>=1,stressReady=rank>=3;
 const display=structuredClone(geometryReady?f:result.frames[0]);
 if(event.stage==='boundary'){display.U.fill(0);result.model.nodes.forEach(([x],i)=>{if(x===result.model.L)display.U[3*i+2]=-f.delta;});}
 if(!stressReady)display.points=structuredClone(result.frames[0].points);
 return {event,display,geometryReady,stressReady,reactionReady:event.stage==='reaction',strainReady:rank>=2};
}
// Traction t = σn, on positive and negative faces; engineering Voigt order.
export function tractions(s){const S=[[s[0],s[3],s[5]],[s[3],s[1],s[4]],[s[5],s[4],s[2]]];return [0,1,2].flatMap(axis=>[-1,1].map(sign=>({axis,sign,normal:[0,1,2].map(i=>i===axis?sign:0),traction:S.map(row=>row[axis]*sign)})));}
export function eventMatrix(result,event,element,point,choice='auto'){
 const type=choice==='auto'?({shape:'N',B:'B',D:'D',Ke:'Ke',assembly:'K',boundary:'Kff',solve:'Kff',strain:'B',stress:'D',reaction:'K'}[event.stage]):choice;
 const p=result.elements[element].points[point];
 const setup=['shape','B','D','Ke','assembly'].includes(event.stage),assembled=setup?(event.assembled??event.element):result.elements.length;
 const K=(type==='K'||type==='Kff')&&setup?partialStiffness(result,assembled):result.K;
 const A=type==='N'?[p.N]:type==='J'?p.J:type==='B'?p.B:type==='D'?elasticMatrix():type==='Ke'?result.elementMatrices[element]:type==='Kff'?result.free.map(i=>result.free.map(j=>K[i][j])):K;
 return {type,A};
}
