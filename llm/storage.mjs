const database = 'mydesk-llm-lab';
let opening;

function open() {
  opening ??= new Promise((resolve,reject)=>{
    const request=indexedDB.open(database,2);
    request.onupgradeneeded=({oldVersion})=>{
      const db=request.result;
      if(oldVersion===0) {
        db.createObjectStore('models',{keyPath:'id'});
        db.createObjectStore('states');
        db.createObjectStore('checkpoints',{keyPath:'key'}).createIndex('model','id');
        db.createObjectStore('tests',{keyPath:'key'}).createIndex('model','id');
      }
      db.createObjectStore('history',{keyPath:['model','step']});
    };
    request.onsuccess=()=>{
      const db=request.result;
      db.onversionchange=()=>{db.close();opening=undefined;};
      resolve(db);
    };
    request.onerror=()=>reject(request.error);
    request.onblocked=()=>reject(Error('저장소가 다른 탭에서 열려 있습니다.'));
  }).catch(error=>{opening=undefined;throw error;});
  return opening;
}

function receive(request) {
  return new Promise((resolve,reject)=>{
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
}

export async function get(store,key) {
  const db=await open();
  if(store!=='states') return receive(db.transaction(store).objectStore(store).get(key));
  const tx=db.transaction(['states','history']);
  return new Promise((resolve,reject)=>{
    const request=tx.objectStore('states').get(key);
    request.onsuccess=()=>{
      const state=request.result;
      if(!state?.historySeparate) { resolve(state);return; }
      const interval=IDBKeyRange.bound([state.id,0],[state.id,state.step]);
      receive(tx.objectStore('history').getAll(interval)).then(
        rows=>resolve({...state,history:rows.map(({metric})=>metric)}),reject);
    };
    request.onerror=()=>reject(request.error);
  });
}

export async function list(store,model) {
  const db=await open();
  const records=db.transaction(store).objectStore(store);
  return receive(model ? records.index('model').getAll(model) : records.getAll());
}

export async function save(state,summary,previous,reason) {
  const db=await open();
  const key=crypto.randomUUID(), savedAt=new Date().toISOString();
  const record={...summary,key,savedAt,reason,historySeparate:true};
  const tx=db.transaction(['models','states','checkpoints','history'],'readwrite');
  return new Promise((resolve,reject)=>{
    const models=tx.objectStore('models');
    const lookup=models.get(record.id);
    let failure;
    lookup.onsuccess=()=>{
      if(lookup.result?.key!==previous) {
        failure=Error('다른 탭에서 이 모델이 저장되었습니다. 모델을 다시 불러오세요.');
        tx.abort();
        return;
      }
      try {
        models.put(record);
        const states=tx.objectStore('states');
        const {history,...snapshot}=state;
        states.put({...snapshot,historySeparate:true},key);
        const historyStore=tx.objectStore('history');
        const last=lookup.result?.historySeparate ? lookup.result.step : 0;
        for(const metric of history.slice(last)) historyStore.put({model:record.id,step:metric.step,metric});
        if(reason!=='자동') tx.objectStore('checkpoints').put(record);
        if(lookup.result?.reason==='자동') states.delete(previous);
      } catch(error) {
        failure=error;
        tx.abort();
      }
    };
    tx.oncomplete=()=>resolve(record);
    tx.onabort=()=>reject(failure??tx.error??Error('저장에 실패했습니다. 이전 체크포인트를 유지했습니다.'));
  });
}

export async function saveTest(record) {
  const db=await open();
  const tx=db.transaction('tests','readwrite');
  const done=new Promise((resolve,reject)=>{
    tx.oncomplete=resolve;
    tx.onabort=()=>reject(tx.error??Error('테스트를 저장하지 못했습니다.'));
  });
  tx.objectStore('tests').put(record);
  return done;
}
