import {validConnection} from './mindmap-sync.mjs?v=device2';
export function connectionKey(value,base){try{const current=new URL(base),u=new URL(value,base);if(u.origin!==current.origin||u.pathname!==current.pathname)return null;const key=new URLSearchParams(u.hash.slice(1)).get('mindmap');return validConnection(key)?key:null;}catch{return null;}}
export function connectionLink(key,base){if(!validConnection(key))throw Error('연결된 모바일에서 링크를 복사해 주세요.');const u=new URL(base);u.search='';u.hash='mindmap='+key;return u.href;}
