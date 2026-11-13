import {parentPort} from 'node:worker_threads';
globalThis.self=globalThis;globalThis.postMessage=data=>parentPort.postMessage(data);
await import('../robot-observation-worker.mjs');
parentPort.on('message',data=>self.onmessage({data}));parentPort.postMessage({type:'harness-ready'});
