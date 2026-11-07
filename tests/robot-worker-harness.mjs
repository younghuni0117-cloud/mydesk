import {parentPort} from 'node:worker_threads';
globalThis.self=globalThis;
globalThis.postMessage=data=>parentPort.postMessage(data);
await import('../robot-worker.mjs');
parentPort.on('message',data=>self.onmessage({data}));
parentPort.postMessage({type:'wrapper-ready'});
