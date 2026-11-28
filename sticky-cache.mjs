export function cache(){let db;
 async function open(){if(db)return db;db=await new Promise((resolve,reject)=>{const r=indexedDB.open('mydesk-sticky-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('boards');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});return db;}
 return {async read(key){const d=await open();return new Promise((resolve,reject)=>{const r=d.transaction('boards').objectStore('boards').get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});},async write(key,value){const d=await open();return new Promise((resolve,reject)=>{const tx=d.transaction('boards','readwrite');tx.objectStore('boards').put(value,key);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}};
}
