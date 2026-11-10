// A fixed world-to-screen scale: terrain shape never changes the user's zoom.
export function cameraPreferences(raw={}){const n=(k,d,a,b)=>Number.isFinite(Number(raw?.[k]))?Math.max(a,Math.min(b,Number(raw[k]))):d;return {zoom:n('zoom',1,.04,2.5),panX:n('panX',.4,-10000,10000),panY:n('panY',0,-10000,10000)};}
export function cameraFrame({width,height,zoom,panX,panY,follow,root,datum}){const scale=Math.min(height/2.8,width/3.3)*zoom;return {scale,camera:follow?root[0]:panX,ground:(follow?height*.5+(root[1]-.1)*scale:height*.88+datum*scale)+panY*scale};}
export function reanchorCamera({panX,panY,root,datum,previous}){return previous?{panX:panX+root[0]-previous.x,panY:panY+(root[1]-datum)-previous.relativeY}:{panX,panY};}
