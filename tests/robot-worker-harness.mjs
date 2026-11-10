import {Worker,parentPort} from 'node:worker_threads';
class BrowserWorker {
 constructor(){this.worker=new Worker(new URL('./robot-rollout-harness.mjs',import.meta.url));this.worker.on('message',data=>this.onmessage?.({data}));this.worker.on('error',error=>this.onerror?.({error,preventDefault(){}}));}
 postMessage(data){this.worker.postMessage(data);}
 terminate(){this.worker.terminate();}
}
globalThis.Worker=BrowserWorker;globalThis.self=globalThis;globalThis.postMessage=data=>parentPort.postMessage(data);
await import('../robot-worker.mjs');parentPort.on('message',data=>self.onmessage({data}));parentPort.postMessage({type:'harness-ready'});
