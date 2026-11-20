export const DEFAULT_WIDTH=180,MIN_WIDTH=100,MAX_WIDTH=600;
export const nodeWidth=node=>Number.isFinite(node?.width)?Math.max(MIN_WIDTH,Math.min(MAX_WIDTH,node.width)):DEFAULT_WIDTH;
// Stored edge order is parent -> child. A visited set handles shared children and legacy cycles once.
export function subtreeIds(nodes,edges,root){const existing=new Set(nodes.map(n=>n.id)),children=new Map();for(const [a,b]of edges){if(!children.has(a))children.set(a,[]);children.get(a).push(b);}const seen=new Set(),queue=[root];for(let i=0;i<queue.length;i++){const id=queue[i];if(seen.has(id)||!existing.has(id))continue;seen.add(id);queue.push(...(children.get(id)||[]));}return seen;}
export const wouldCycle=(nodes,edges,parent,child)=>parent===child||subtreeIds(nodes,edges,child).has(parent);
export function groupPositions(nodes,edges,root){const ids=subtreeIds(nodes,edges,root);return nodes.filter(n=>ids.has(n.id)).map(n=>({id:n.id,x:n.x,y:n.y}));}
export function moveGroup(nodes,positions,dx,dy){const byId=new Map(nodes.map(n=>[n.id,n]));for(const old of positions){const n=byId.get(old.id);if(n){n.x=old.x+dx;n.y=old.y+dy;}}}
