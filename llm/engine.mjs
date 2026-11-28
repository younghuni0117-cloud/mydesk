import {Matrix, Tape, crossEntropy, softmax} from './tensor.mjs';
import {makeDataset} from './data.mjs';

export const ENGINE = 'browser-transformer-v1';
export const defaults = {layers:1, width:24, heads:3, context:16, rate:.003};
const checkpointVersion = 1;

function checkConfig(config) {
  const {layers,width,heads,context,rate} = config;
  if (![layers,width,heads,context].every(Number.isInteger) || layers<1 || layers>3 ||
      width<8 || width>64 || heads<1 || heads>8 || width%heads || context<4 || context>48 ||
      !Number.isFinite(rate) || rate < .00001 || rate > .03) {
    throw Error('레이어 1–3, 은닉 폭 8–64, 헤드 1–8(은닉 폭의 약수), 문맥 4–48, 학습률 0.00001–0.03을 입력하세요.');
  }
}

function histogram(parameters, key) {
  let extent = 0;
  for (const matrix of parameters) for (const value of matrix[key]) extent = Math.max(extent,Math.abs(value));
  const bins = Array(17).fill(0);
  for (const matrix of parameters) for (const value of matrix[key]) {
    const bin = extent ? Math.min(16,Math.floor((value / extent + 1) * 8.5)) : 8;
    bins[bin]++;
  }
  return {extent,bins};
}

export class Transformer {
  constructor({id,name,datasetName='한국어 연습 문장',documents,config=defaults,vocabulary,partitions,seed=92821,createdAt=new Date().toISOString()}, checkpoint) {
    checkConfig(config);
    this.id=id;
    this.name=name;
    this.datasetName=datasetName;
    this.documents=documents;
    this.config={...config};
    this.seed=seed>>>0 || 1;
    this.rng=this.seed;
    this.createdAt=createdAt;
    this.datasetVersion=1;
    this.step=0;
    this.tokens=0;
    this.milliseconds=0;
    this.history=[];
    this.logs=[];
    this.parameters={};
    this.dataset=makeDataset(documents,checkpoint?.vocabulary??vocabulary,checkpoint?.partitions??partitions);
    this.tokenizer=this.dataset.tokenizer;
    this.weights=this.createWeights();
    if (checkpoint) this.load(checkpoint);
  }

  random() {
    let x=this.rng;
    x^=x<<13; x^=x>>>17; x^=x<<5;
    this.rng=x>>>0;
    return this.rng/4294967296;
  }

  parameter(name, rows, cols, scale=0, value=0) {
    const matrix=new Matrix(rows,cols);
    for(let i=0;i<matrix.values.length;i++) matrix.values[i]=scale ? (2*this.random()-1)*scale : value;
    matrix.initial=matrix.values.slice();
    matrix.first=new Float32Array(rows*cols);
    matrix.second=new Float32Array(rows*cols);
    matrix.delta=new Float32Array(rows*cols);
    this.parameters[name]=matrix;
    return matrix;
  }

  createWeights() {
    const {width,context,layers}=this.config;
    const size=this.tokenizer.vocabulary.length;
    const add=(name,r,c,scale,value)=>this.parameter(name,r,c,scale,value);
    const norm=name=>[add(name+'.gain',1,width,0,1),add(name+'.bias',1,width)];
    const project=(name,r,c)=>[add(name+'.weight',r,c,Math.sqrt(6/(r+c))*.55),add(name+'.bias',1,c)];
    const token=add('embedding.token',size,width,.16);
    const position=add('embedding.position',context,width,.12);
    const blocks=Array.from({length:layers},(_,i)=>{
      const p='block.'+(i+1);
      return {norm1:norm(p+'.norm1'),norm2:norm(p+'.norm2'),
        query:project(p+'.query',width,width),key:project(p+'.key',width,width),value:project(p+'.value',width,width),
        attention:project(p+'.attention',width,width),up:project(p+'.ffn.up',width,width*2),
        down:project(p+'.ffn.down',width*2,width)};
    });
    return {token,position,blocks,norm:norm('finalNorm'),output:project('output',width,size)};
  }

  forward(ids,tape,trace) {
    const w=this.weights;
    let hidden=tape.embed(ids,w.token,w.position);
    if(trace) trace.embedding=Array.from(hidden.values);
    for(const block of w.blocks) {
      const normalized=tape.norm(hidden,...block.norm1);
      const attention=tape.attention(tape.linear(normalized,...block.query),
        tape.linear(normalized,...block.key),tape.linear(normalized,...block.value),this.config.heads);
      hidden=tape.add(hidden,tape.linear(attention.output,...block.attention));
      const feed=tape.linear(tape.relu(tape.linear(tape.norm(hidden,...block.norm2),...block.up)),...block.down);
      hidden=tape.add(hidden,feed);
      if(trace) {
        trace.attention.push(attention.scores);
        trace.blocks.push(Array.from(hidden.values));
      }
    }
    return tape.linear(tape.norm(hidden,...w.norm),...w.output);
  }

  train() {
    const now=performance.now();
    const {context,rate}=this.config;
    const pool=this.dataset.training;
    const sequence=pool[Math.floor(this.random()*pool.length)];
    const start=Math.floor(this.random()*Math.max(1,sequence.length-context));
    const chunk=sequence.slice(start,start+context+1);
    const params=Object.values(this.parameters);
    for(const matrix of params) matrix.grad.fill(0);
    const tape=new Tape(true);
    const logits=this.forward(chunk.slice(0,-1),tape);
    const train=crossEntropy(logits,chunk.slice(1),true);
    tape.backward();

    let gradientSquared=0, weightSquared=0, updateSquared=0;
    for(const matrix of params) for(let i=0;i<matrix.values.length;i++) {
      gradientSquared+=matrix.grad[i]**2;
      weightSquared+=matrix.values[i]**2;
    }
    const gradientNorm=Math.sqrt(gradientSquared);
    if(!Number.isFinite(gradientNorm)||!Number.isFinite(train.loss)) throw Error('학습 값이 유한하지 않습니다. 마지막 체크포인트를 확인하세요.');
    const scale=Math.min(1,1/(gradientNorm||1));
    const step=++this.step;
    const correction1=1-.9**step, correction2=1-.999**step;
    for(const m of params) for(let i=0;i<m.values.length;i++) {
      const gradient=m.grad[i]*scale, before=m.values[i];
      m.first[i]=.9*m.first[i]+.1*gradient;
      m.second[i]=.999*m.second[i]+.001*gradient**2;
      m.values[i]-=rate*(m.first[i]/correction1)/(Math.sqrt(m.second[i]/correction2)+1e-8);
      m.delta[i]=m.values[i]-before;
      updateSquared+=m.delta[i]**2;
    }
    this.tokens+=chunk.length-1;
    let validation, evaluation;
    if(step===1||step%10===0||this.history.at(-1)?.datasetVersion!==this.datasetVersion) {
      validation=this.evaluate(this.dataset.validating);
      evaluation=this.evaluate(this.dataset.fixed);
    }
    const elapsed=performance.now()-now;
    this.milliseconds+=elapsed;
    const metric={step,train:train.loss,val:validation?.loss,accuracy:train.accuracy,
      validationAccuracy:validation?.accuracy,fixed:evaluation?.loss,fixedAccuracy:evaluation?.accuracy,
      perplexity:Math.exp(train.loss),validationPerplexity:validation && Math.exp(validation.loss),
      rate,gradientNorm,clipped:scale<1,weightNorm:Math.sqrt(weightSquared),
      updateRatio:Math.sqrt(updateSquared)/(Math.sqrt(weightSquared)||1),
      byToken:validation ? train.byToken : undefined,validationByToken:validation?.byToken,
      tokens:this.tokens,epoch:this.tokens/this.dataset.stats.train,
      tokensPerSecond:(chunk.length-1)*1000/Math.max(elapsed,.001),elapsed:this.milliseconds,
      datasetVersion:this.datasetVersion};
    this.history.push(metric);
    return metric;
  }

  evaluate(sequences) {
    const windows=[];
    for(const sequence of sequences) for(let i=0;i<sequence.length-1;i+=this.config.context) {
      windows.push(sequence.slice(i,i+this.config.context+1));
    }
    const stride=Math.max(1,Math.ceil(windows.length/24));
    let total=0,loss=0,correct=0;
    const byToken=new Map();
    for(let i=0;i<windows.length;i+=stride) {
      const chunk=windows[i], n=chunk.length-1;
      const result=crossEntropy(this.forward(chunk.slice(0,-1),new Tape()),chunk.slice(1));
      total+=n; loss+=n*result.loss; correct+=n*result.accuracy;
      for(const [id,entry] of result.byToken) {
        const sum=byToken.get(id)??{count:0,loss:0};
        sum.count+=entry.count;
        sum.loss+=entry.loss;
        byToken.set(id,sum);
      }
    }
    return total ? {loss:loss/total,accuracy:correct/total,byToken:[...byToken],tokens:total} : undefined;
  }

  replaceDataset(documents) {
    const next=makeDataset(documents,this.tokenizer.vocabulary,this.dataset.partitions);
    this.dataset=next;
    this.documents=documents;
    this.datasetVersion++;
    return next.stats;
  }

  predict(prompt,{temperature=1,mode='greedy',length=1,seed=1}={}) {
    const all=[0,...this.tokenizer.encode(prompt)];
    let random=seed>>>0;
    const generated=[];
    let trace;
    for(let step=0;step<length;step++) {
      const input=all.slice(-this.config.context);
      const detail=step ? undefined : {input,attention:[],blocks:[]};
      const logits=this.forward(input,new Tape(),detail).values.slice(-this.tokenizer.vocabulary.length);
      const probabilities=softmax(logits,temperature);
      const ranked=Array.from(probabilities,(probability,id)=>({id,probability,logit:logits[id]}))
        .sort((a,b)=>b.probability-a.probability);
      let selected=ranked[0].id;
      if(mode==='sample') {
        random=(Math.imul(random,1664525)+1013904223)>>>0;
        let point=random/4294967296;
        for(const candidate of ranked) {
          point-=candidate.probability;
          if(point<0) {selected=candidate.id;break;}
        }
      }
      if(detail) trace={...detail,candidates:ranked.slice(0,10),selected,
        selectedProbability:probabilities[selected],greedy:ranked[0].id,
        sum:probabilities.reduce((a,b)=>a+b,0),probabilities,logits};
      all.push(selected);
      generated.push(selected);
    }
    return {...trace,unknowns:all.slice(0,all.length-generated.length).filter(id=>id===1).length,
      generated:this.tokenizer.decode(generated),generatedIds:generated,prompt,step:this.step};
  }

  inspect(name,offset=0) {
    const matrix=this.parameters[name];
    if(!matrix) throw Error('관찰할 가중치 항목이 없습니다.');
    const params=Object.values(this.parameters);
    const count=matrix.values.length;
    const from=Math.max(0,Math.min(count-1,offset));
    const end=Math.min(count,from+12);
    return {count, rows:Array.from({length:end-from},(_,index)=>{
      const i=from+index;
      return {index:i,initial:matrix.initial[i],current:matrix.values[i],
        gradient:this.step ? matrix.grad[i] : null,update:this.step ? matrix.delta[i] : null};
    }),weights:histogram(params,'values'),gradients:this.step ? histogram(params,'grad') : null,
    tensorBytes:params.reduce((sum,m)=>sum+m.values.byteLength*6,0)};
  }

  summary() {
    const parameters=Object.entries(this.parameters).map(([name,m])=>({name,rows:m.rows,cols:m.cols}));
    return {id:this.id,name:this.name,createdAt:this.createdAt,datasetName:this.datasetName,
      config:this.config,datasetVersion:this.datasetVersion,stats:this.dataset.stats,
      vocabulary:this.tokenizer.vocabulary,parameters,
      count:parameters.reduce((sum,p)=>sum+p.rows*p.cols,0),step:this.step,tokens:this.tokens,
      elapsed:this.milliseconds,history:this.history,logs:this.logs,engine:ENGINE};
  }

  checkpoint() {
    return {version:checkpointVersion, engine:ENGINE,id:this.id,name:this.name,datasetName:this.datasetName,
      documents:this.documents, config:this.config,seed:this.seed,rng:this.rng,createdAt:this.createdAt,
      vocabulary:this.tokenizer.vocabulary,partitions:this.dataset.partitions,step:this.step,tokens:this.tokens,milliseconds:this.milliseconds,
      datasetVersion:this.datasetVersion,history:this.history,logs:this.logs,
      parameters:Object.fromEntries(Object.entries(this.parameters).map(([name,m])=>[name,
        Object.fromEntries(['values','first','second','grad','delta'].map(key=>[key,m[key].slice()]))]))};
  }

  load(checkpoint) {
    if(checkpoint.version!==checkpointVersion || checkpoint.engine!==ENGINE ||
      Object.keys(checkpoint.parameters??{}).length!==Object.keys(this.parameters).length) {
      throw Error('이 엔진과 호환되지 않는 체크포인트입니다.');
    }
    for(const [name,m] of Object.entries(this.parameters)) for(const key of ['values','first','second','grad','delta']) {
      const values=checkpoint.parameters[name]?.[key];
      if(!values||values.length!==m[key].length||!values.every(Number.isFinite)) {
        throw Error('체크포인트의 가중치 또는 Adam 상태를 복원할 수 없습니다.');
      }
      m[key].set(values);
    }
    for(const key of ['rng','step','tokens','milliseconds','datasetVersion','history','logs']) this[key]=checkpoint[key];
  }
}
