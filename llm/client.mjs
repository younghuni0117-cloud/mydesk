// Commands and events carry domain data only. A future remote engine can implement
// this same request/event interface through an authenticated service.
export function connectEngine(onEvent) {
  const worker=new Worker(new URL('./worker.mjs',import.meta.url),{type:'module'});
  const requests=new Map();
  let sequence=0, failure;
  worker.onmessage=({data})=>{
    if(data.type!=='response') return onEvent(data);
    const request=requests.get(data.id);
    if(!request) return;
    requests.delete(data.id);
    if(data.error) request.reject(Error(data.error));
    else request.resolve(data.result);
  };
  worker.onerror=()=>{
    failure=Error('브라우저 학습 엔진을 시작하거나 실행할 수 없습니다.');
    for(const request of requests.values()) request.reject(failure);
    requests.clear();
    onEvent({type:'error',message:failure.message});
  };
  return {
    request(action,args={}) {
      if(failure) return Promise.reject(failure);
      const id=++sequence;
      return new Promise((resolve,reject)=>{
        requests.set(id,{resolve,reject});
        worker.postMessage({id,action,args});
      });
    }
  };
}
