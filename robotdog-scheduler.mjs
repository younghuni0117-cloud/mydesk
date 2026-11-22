// Give control messages a turn without sleeping or the nested setTimeout minimum delay.
let channel=null;
const waiting=[];
export function yieldToMessages(){
 if(typeof globalThis.setImmediate==='function')return new Promise(resolve=>setImmediate(resolve));
 if(typeof MessageChannel!=='undefined'){
  if(!channel){channel=new MessageChannel();channel.port1.onmessage=()=>waiting.shift()?.();}
  return new Promise(resolve=>{waiting.push(resolve);channel.port2.postMessage(0);});
 }
 return new Promise(resolve=>setTimeout(resolve,0));
}
