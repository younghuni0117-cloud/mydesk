import test from 'node:test';import assert from 'node:assert/strict';
import{nodeWidth,subtreeIds,groupPositions,moveGroup,wouldCycle,fitMapView}from'../mindmap-layout.mjs';
test('descendant movement follows edge direction, moves shared children once and preserves disconnected nodes',()=>{const nodes=['a','b','c','d','loose'].map((id,i)=>({id,x:i*100,y:i*20})),edges=[['a','b'],['a','c'],['b','d'],['c','d']],positions=groupPositions(nodes,edges,'a');assert.equal(positions.length,4);moveGroup(nodes,positions,37,-12);assert.deepEqual(nodes.map(n=>[n.x,n.y]),[[37,-12],[137,8],[237,28],[337,48],[400,80]]);const p=groupPositions(nodes,edges,'b');moveGroup(nodes,p,10,5);assert.equal(nodes[0].x,37);assert.equal(nodes[1].x,147);assert.equal(nodes[3].x,347);assert.equal(nodes[2].x,237);});
test('legacy cycles terminate; new parent-child cycles are detected without changing edges',()=>{const n=['a','b','c'].map(id=>({id,x:0,y:0})),edges=[['a','b'],['b','c']];assert.equal(wouldCycle(n,edges,'c','a'),true);assert.equal(wouldCycle(n,edges,'a','c'),false);assert.equal(subtreeIds(n,[...edges,['c','a']],'a').size,3);assert.equal(edges.length,2);});
test('legacy boxes keep their default width and new widths are bounded',()=>{assert.equal(nodeWidth({}),180);assert.equal(nodeWidth({width:300}),300);assert.equal(nodeWidth({width:10}),100);assert.equal(nodeWidth({width:999}),600);});
test('fit keeps every box visible on laptop, portrait and wide screens above the bottom toolbar',()=>{
 const boxes=[{x:-400,y:-200,width:180,height:45},{x:5000,y:2500,width:600,height:120}];
 for(const [w,h,bottom]of [[1366,550,60],[1920,900,60],[360,480,110],[768,650,90]]){
  const v=fitMapView(boxes,w,h,{padding:20,bottom});assert.ok(v.z>0&&v.z<=1);
  for(const b of boxes){assert.ok(v.x+b.x*v.z>=20-1e-8);assert.ok(v.x+(b.x+b.width)*v.z<=w-20+1e-8);assert.ok(v.y+b.y*v.z>=20-1e-8);assert.ok(v.y+(b.y+b.height)*v.z<=h-bottom-20+1e-8);}
 }
 assert.deepEqual(fitMapView([],1000,500),{x:0,y:0,z:1});
 assert.deepEqual(fitMapView(boxes,0,0),{x:0,y:0,z:1});
 assert.deepEqual(fitMapView(boxes,1000,0),{x:0,y:0,z:1});
});
