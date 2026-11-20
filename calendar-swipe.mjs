// Claim only a one-finger horizontal gesture; taps, vertical scrolling and pinch remain native.
export function installMonthSwipe(root,{enabled,navigate}){
 let gesture=null,suppressUntil=0;
 const abort=()=>{if(gesture?.axis==='x')suppressUntil=Date.now()+500;gesture=null;};
 root.addEventListener('touchstart',event=>{if(event.touches.length!==1||!enabled()){abort();return;}const t=event.touches[0];if(t.clientX<16||t.clientX>innerWidth-16){abort();return;}suppressUntil=0;gesture={id:t.identifier,x:t.clientX,y:t.clientY,dx:0,dy:0,axis:null};},{passive:true});
 root.addEventListener('touchmove',event=>{if(!gesture)return;if(event.touches.length!==1||!enabled()){abort();return;}const t=Array.from(event.touches).find(t=>t.identifier===gesture.id);if(!t){abort();return;}gesture.dx=t.clientX-gesture.x;gesture.dy=t.clientY-gesture.y;const x=Math.abs(gesture.dx),y=Math.abs(gesture.dy);if(!gesture.axis&&Math.max(x,y)>12){if(x>y*1.4)gesture.axis='x';else if(y>x*1.15)gesture.axis='y';}if(gesture.axis==='x'&&event.cancelable)event.preventDefault();},{passive:false});
 root.addEventListener('touchend',event=>{if(!gesture)return;if(event.touches.length){abort();return;}const g=gesture;gesture=null;if(g.axis!=='x')return;suppressUntil=Date.now()+500;const t=Array.from(event.changedTouches).find(t=>t.identifier===g.id),dx=t?t.clientX-g.x:g.dx,dy=t?t.clientY-g.y:g.dy,threshold=Math.max(55,Math.min(90,root.clientWidth*.16));if(enabled()&&Math.abs(dx)>=threshold&&Math.abs(dx)>Math.abs(dy)*1.4)navigate(dx<0?1:-1);},{passive:true});
 root.addEventListener('touchcancel',abort,{passive:true});
 root.addEventListener('click',event=>{if(Date.now()<suppressUntil&&event.sourceCapabilities?.firesTouchEvents!==false){event.preventDefault();event.stopImmediatePropagation();}},true);
}
