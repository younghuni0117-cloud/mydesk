export const DEFAULT_WIDTH=180,MIN_WIDTH=100,MAX_WIDTH=600;
export const nodeWidth=node=>Number.isFinite(node?.width)?Math.max(MIN_WIDTH,Math.min(MAX_WIDTH,node.width)):DEFAULT_WIDTH;
// Stored edge order is parent -> child. A visited set handles shared children and legacy cycles once.
export function subtreeIds(nodes,edges,root){const existing=new Set(nodes.map(n=>n.id)),children=new Map();for(const [a,b]of edges){if(!children.has(a))children.set(a,[]);children.get(a).push(b);}const seen=new Set(),queue=[root];for(let i=0;i<queue.length;i++){const id=queue[i];if(seen.has(id)||!existing.has(id))continue;seen.add(id);queue.push(...(children.get(id)||[]));}return seen;}
export const wouldCycle=(nodes,edges,parent,child)=>parent===child||subtreeIds(nodes,edges,child).has(parent);
export function reparentEdges(nodes,edges,child,parent){
 if(!nodes.some(n=>n.id===child)||!nodes.some(n=>n.id===parent)||wouldCycle(nodes,edges,parent,child))return null;
 const next=edges.filter(([a,b])=>b!==child);if(next.length>=2000)return null;return [...next,[parent,child]];
}
export function groupPositions(nodes,edges,root){const ids=subtreeIds(nodes,edges,root);return nodes.filter(n=>ids.has(n.id)).map(n=>({id:n.id,x:n.x,y:n.y}));}
export function moveGroup(nodes,positions,dx,dy){const byId=new Map(nodes.map(n=>[n.id,n]));for(const old of positions){const n=byId.get(old.id);if(n){n.x=old.x+dx;n.y=old.y+dy;}}}
export function fitMapView(boxes,width,height,{padding=24,bottom=70}={}){
 if(!boxes.length||!Number.isFinite(width)||!Number.isFinite(height)||width<80||height<80)return {x:0,y:0,z:1};
 const minX=Math.min(...boxes.map(b=>b.x)),minY=Math.min(...boxes.map(b=>b.y)),maxX=Math.max(...boxes.map(b=>b.x+b.width)),maxY=Math.max(...boxes.map(b=>b.y+b.height));
 const availableW=Math.max(1,width-padding*2),availableH=Math.max(1,height-bottom-padding*2),z=Math.min(1,availableW/Math.max(1,maxX-minX),availableH/Math.max(1,maxY-minY));
 return {z,x:padding+(availableW-(maxX-minX)*z)/2-minX*z,y:padding+(availableH-(maxY-minY)*z)/2-minY*z};
}
