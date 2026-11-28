import {Transformer,ENGINE} from './engine.mjs';
import {get,list,save,saveTest} from './storage.mjs';

let model, lastSave, timer, running=false, phase='ready', lastUpdate=0, savedStep=0;
let pending=Promise.resolve();
let targetStep=0, generation;

function enqueue(fn) {
  pending=pending.then(fn).catch(error=>{
    running=false;
    phase='paused';
    clearTimeout(timer);
    log(error.message,'오류');
    postMessage({type:'error',message:error.message});
  });
}

function log(message,level='정보') {
  if(model) model.logs.push({time:new Date().toISOString(),level,message,step:model.step,currentText:model.currentText});
}

async function catalog() {
  const models=(await list('models')).sort((a,b)=>b.savedAt.localeCompare(a.savedAt));
  if(!model) return {models,checkpoints:[],tests:[]};
  const checkpoints=await list('checkpoints',model.id);
  if(lastSave?.reason==='자동') checkpoints.push(lastSave);
  const tests=await list('tests',model.id);
  return {models,checkpoints:checkpoints.sort((a,b)=>b.savedAt.localeCompare(a.savedAt)),
    tests:tests.sort((a,b)=>b.savedAt.localeCompare(a.savedAt))};
}

async function state(extra={}) {
  // The active model remains usable when browser storage is unavailable.
  let library;
  try { library=await catalog(); }
  catch(error) { library={models:[],checkpoints:[],tests:[],storageError:error.message}; }
  return {model:model?.summary(),docs:model?.documents,saved:lastSave?.savedAt,running,phase,targetStep,...library,...extra,engine:ENGINE};
}

async function checkpoint(reason) {
  if(!model) throw Error('먼저 모델을 만들어 주세요.');
  const {id,name,count,createdAt,config,datasetName,step,tokens,history}=model.summary();
  const validation=history.findLast(metric=>metric.val!==undefined);
  lastSave=await save(model.checkpoint(),{id,name,count,createdAt,config,datasetName,step,tokens,
    train:history.at(-1)?.train,val:validation?.val,fixed:validation?.fixed},lastSave?.key,reason);
  savedStep=step;
  return lastSave;
}

function schedule() {
  timer=setTimeout(()=>enqueue(async()=>{
    if(!running) return;
    const start=performance.now();
    for(let i=0;i<4 && model.step<targetStep && performance.now()-start<20;i++) model.train();
    const now=performance.now();
    if(model.step-savedStep>=100||now-lastUpdate>=150) {
      postMessage({type:'progress',metrics:model.history.slice(schedule.sent??0),step:model.step});
      schedule.sent=model.step;
      lastUpdate=now;
    }
    if(model.step-savedStep>=100) {
      await checkpoint('자동');
      postMessage({type:'saved',saved:lastSave.savedAt,record:lastSave});
    }
    if(model.step>=targetStep) {
      stop();
      phase='completed';
      const evaluation=model.evaluate(model.dataset.validating);
      Object.assign(model.history.at(-1),{val:evaluation.loss,validationPerplexity:Math.exp(evaluation.loss),validationAccuracy:evaluation.accuracy});
      log('선택한 학습 횟수 완료');
      await checkpoint('완료');
      postMessage({type:'completed',state:await state()});
    } else if(running) schedule();
  }),12);
}

function stop() {
  running=false;
  clearTimeout(timer);
}

async function openModel(id,key) {
  const record=await get('models',id);
  if(!record) throw Error('저장된 모델을 찾을 수 없습니다.');
  const chosen=key??record.key;
  const snapshot=await get('states',chosen);
  if(!snapshot||snapshot.id!==id) throw Error('해당 모델의 체크포인트를 찾을 수 없습니다.');
  return {record,snapshot,chosen};
}

async function dispatch(action,args) {
  switch(action) {
    case 'init': {
      let models=[];
      try { models=await list('models'); }
      catch(error) { return state({storageError:error.message}); }
      const record=models.find(m=>m.id===args.active)??models.sort((a,b)=>b.savedAt.localeCompare(a.savedAt))[0];
      if(record) return dispatch('restore',{id:record.id});
      return state();
    }
    case 'create':
    case 'reset': {
      const source=action==='reset' ? model : args;
      if(!source) throw Error('초기화할 모델이 없습니다.');
      const next=new Transformer({name:action==='reset'?source.name+' · 초기화':source.name,
        documents:source.documents,datasetName:source.datasetName,config:source.config,
        vocabulary:source.tokenizer?.vocabulary,partitions:source.dataset?.partitions,id:crypto.randomUUID(),seed:crypto.getRandomValues(new Uint32Array(1))[0]});
      stop();
      model=next;
      targetStep=0;
      phase='ready';
      schedule.sent=0;
      savedStep=0;
      lastSave=undefined;
      log('새 모델 생성');
      try { await checkpoint('생성'); }
      catch(error) { return state({storageError:error.message}); }
      return state();
    }
    case 'restore': {
      const {record,snapshot,chosen}=await openModel(args.id,args.key);
      const next=new Transformer(snapshot,snapshot);
      stop();
      model=next;
      targetStep=0;
      lastSave=record;
      phase=(chosen===record.key&&record.reason==='종료') ? 'stopped' : next.step ? 'paused' : 'ready';
      if(chosen!==record.key) {
        model.id=crypto.randomUUID();
        model.name+=' · '+model.step+' Step 복원';
        model.createdAt=new Date().toISOString();
        lastSave=undefined;
        log('이전 체크포인트에서 분기');
        try { await checkpoint('복원'); }
        catch(error) { return state({storageError:error.message}); }
      }
      schedule.sent=model.step;
      savedStep=model.step;
      return state();
    }
    case 'start':
      if(!model) throw Error('먼저 모델을 만들어 주세요.');
      if(!running) {
        const count=Number(args.steps??500);
        if(!Number.isInteger(count)||count<1||count>100000) throw Error('학습 횟수는 1~100,000으로 입력하세요.');
        targetStep=args.resume&&targetStep>model.step ? targetStep : model.step+count;
        running=true;
        phase='running';
        log('학습 시작 또는 재개');
        schedule();
      }
      return state();
    case 'pause':
    case 'stop':
      stop();
      phase=action==='stop'?'stopped':'paused';
      log(action==='pause'?'학습 일시정지':'학습 종료');
      await checkpoint(action==='pause'?'일시정지':'종료');
      return state();
    case 'save':
      await checkpoint('수동');
      return state();
    case 'dataset': {
      if(running) throw Error('데이터셋을 변경하려면 학습을 일시정지해 주세요.');
      if(!model) throw Error('먼저 모델을 만들어 주세요.');
      const previous={dataset:model.dataset,documents:model.documents,datasetVersion:model.datasetVersion,datasetName:model.datasetName};
      model.replaceDataset(args.documents);
      model.datasetName=args.datasetName;
      log('데이터셋 버전 변경');
      try { await checkpoint('데이터 변경'); }
      catch(error) {
        Object.assign(model,previous);
        model.logs.pop();
        throw error;
      }
      return state();
    }
    case 'generationStart': {
      let snapshot=model.checkpoint();
      if(args.key) snapshot=(await openModel(model.id,args.key)).snapshot;
      generation={token:crypto.randomUUID(),model:new Transformer(snapshot,snapshot),prompt:args.prompt,options:args.options};
      return {token:generation.token,step:generation.model.step};
    }
    case 'generationNext': {
      if(!generation||generation.token!==args.token) throw Error('생성 세션이 종료되었습니다.');
      const result=generation.model.predict(generation.prompt,{...generation.options,length:1,
        seed:crypto.getRandomValues(new Uint32Array(1))[0]});
      generation.prompt+=result.generated;
      return {current:result,vocabulary:generation.model.tokenizer.vocabulary};
    }
    case 'predict': {
      let source=model;
      if(args.key) {
        const {snapshot}=await openModel(model.id,args.key);
        source=new Transformer(snapshot,snapshot);
      }
      const initial=new Transformer({id:source.id,name:source.name,documents:source.documents,
        config:source.config,seed:source.seed,vocabulary:source.tokenizer.vocabulary,partitions:source.dataset.partitions});
      const options=args.options;
      return {current:source.predict(args.prompt,options),initial:initial.predict(args.prompt,options),
        vocabulary:source.tokenizer.vocabulary,config:source.config,key:args.key,id:model.id};
    }
    case 'inspect':
      return {...model.inspect(args.name,args.offset),step:model.step};
    case 'evaluate':
      return {step:model.step,validation:model.evaluate(model.dataset.validating),fixed:model.evaluate(model.dataset.fixed)};
    case 'saveTest': {
      if(args.result.id!==model.id) throw Error('현재 모델을 다시 테스트해 주세요.');
      const {current,initial,key}=args.result;
      await saveTest({id:model.id,key:crypto.randomUUID(),checkpoint:key,
        time:new Date().toISOString(),step:current.step,prompt:current.prompt,
        current:current.generated,initial:initial.generated,options:args.options});
      return state();
    }
    case 'state':
      return state();
    default:
      throw Error('지원되지 않는 학습 명령입니다.');
  }
}

self.onmessage=({data})=>enqueue(async()=>{
  const {id,action,args}=data;
  try { postMessage({type:'response',id,result:await dispatch(action,args)}); }
  catch(error) {
    log(error.message,'오류');
    postMessage({type:'response',id,error:error.message});
  }
});
