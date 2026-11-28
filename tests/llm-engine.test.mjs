import assert from 'node:assert/strict';
import test from 'node:test';
import {Transformer,defaults} from '../llm/engine.mjs';
import {samples,makeDataset,fixedEvaluation} from '../llm/data.mjs';
import {Tape,crossEntropy} from '../llm/tensor.mjs';
import {DEFAULT_MENUS,validateMenus,withLLMMenu} from '../navigation-data.mjs';

const make=(extra={})=>new Transformer({id:'test',name:'검증',documents:samples,seed:42,...extra});

test('real decoder training lowers loss and changes next-token probabilities',()=>{
  const model=make();
  const before=model.predict('나는 ');
  const validation=model.evaluate(model.dataset.validating);
  const simpler=make({documents:[{text:'ababababababababababababababababababababababababababababab'}]});
  const beginning=simpler.evaluate(simpler.dataset.validating).loss;
  for(let i=0;i<250;i++) model.train();
  for(let i=0;i<60;i++) simpler.train();
  const after=model.predict('나는 ');
  assert.ok(Math.abs(before.sum-1)<1e-12);
  assert.ok(Math.abs(after.sum-1)<1e-12);
  assert.notDeepEqual(after.probabilities,before.probabilities);
  assert.ok(model.parameters['block.1.query.weight'].values.some((value,i)=>value!==model.parameters['block.1.query.weight'].initial[i]));
  assert.ok(model.evaluate(model.dataset.validating).loss < validation.loss);
  assert.ok(simpler.evaluate(simpler.dataset.validating).loss < beginning/3);
  for(const m of model.history) {
    assert.ok(Number.isFinite(m.train));
    assert.ok(Number.isFinite(m.gradientNorm));
    if(m.step===1||m.step%10===0) assert.ok(Number.isFinite(m.val));
    else assert.equal(m.val,undefined);
  }
});

test('masked attention cannot observe future tokens',()=>{
  const model=make({config:{...defaults,layers:2}});
  const tokens=model.tokenizer.encode('나는 간다.');
  const trace={attention:[],blocks:[]};
  const original=model.forward(tokens,new Tape(),trace);
  const modified=model.forward([...tokens.slice(0,-1),0],new Tape());
  assert.deepEqual(original.values.slice(0,-original.cols),modified.values.slice(0,-modified.cols));
  for(const layer of trace.attention) for(const head of layer) for(let row=0;row<tokens.length;row++) {
    const weights=head.slice(row*tokens.length,(row+1)*tokens.length);
    assert.ok(Math.abs(weights.reduce((sum,value)=>sum+value,0)-1)<1e-6);
    assert.ok(weights.slice(row+1).every(value=>value===0));
  }
});

test('attention, projection and layer normalization gradients agree with finite differences',()=>{
  const model=make();
  const ids=model.tokenizer.encode('나는 학교');
  for(const [name,index] of [['block.1.query.weight',30],['block.1.norm1.gain',4],['output.weight',144]]) {
    const parameter=model.parameters[name];
    for(const p of Object.values(model.parameters)) p.grad.fill(0);
    const tape=new Tape(true);
    crossEntropy(model.forward(ids.slice(0,-1),tape),ids.slice(1),true);
    tape.backward();
    const value=parameter.values[index], epsilon=.002;
    const loss=()=>crossEntropy(model.forward(ids.slice(0,-1),new Tape()),ids.slice(1)).loss;
    parameter.values[index]=value+epsilon;
    const up=loss();
    parameter.values[index]=value-epsilon;
    const down=loss();
    parameter.values[index]=value;
    const numerical=(up-down)/(2*epsilon);
    assert.ok(Math.abs(parameter.grad[index]-numerical)<1e-4,name);
  }
});

test('a copied checkpoint resumes with the same weights, moments, RNG and next update',()=>{
  const model=make();
  for(let i=0;i<25;i++) model.train();
  const checkpoint=structuredClone(model.checkpoint());
  const restored=new Transformer(checkpoint,checkpoint);
  assert.deepEqual(restored.predict('나는 학교').probabilities,model.predict('나는 학교').probabilities);
  assert.deepEqual(restored.checkpoint().parameters,checkpoint.parameters);
  assert.equal(restored.rng,model.rng);
  const first=model.train(), second=restored.train();
  for(const key of ['train','rate','gradientNorm','updateRatio','tokens','step']) assert.equal(first[key],second[key]);
  assert.deepEqual(restored.checkpoint().parameters,model.checkpoint().parameters);
  assert.throws(()=>new Transformer(checkpoint,{...checkpoint,engine:'pytorch'}),/호환/);
});

test('datasets reserve the fixed evaluation, reject incompatible vocabulary and preserve previous split',()=>{
  const model=make();
  const before=new Map(model.dataset.partitions);
  const all=[{text:fixedEvaluation.join('\n')},...samples,{text:'나는 물을 마신다. 나는 밥을 먹는다.'}];
  model.replaceDataset(all);
  for(const [sentence,partition] of before) assert.deepEqual(new Map(model.dataset.partitions).get(sentence),partition);
  for(const text of fixedEvaluation) assert.ok(!new Map(model.dataset.partitions).has(text));
  assert.throws(()=>makeDataset([...samples,{text:'A new character.'}],model.tokenizer.vocabulary,model.dataset.partitions),/어휘/);
  const checkpoint=structuredClone(model.checkpoint());
  const restored=new Transformer(checkpoint,checkpoint);
  assert.deepEqual(restored.dataset.training,model.dataset.training);
  assert.deepEqual(restored.dataset.validating,model.dataset.validating);
});

test('older navigation keeps custom entries and gains the lab hierarchy once',()=>{
  const entries=DEFAULT_MENUS.filter(menu=>!menu.id.startsWith('llm-'));
  entries.push({id:'private-notes',label:'My notes',kind:'link',parent_id:null,href:'index.html',hidden:true});
  const upgraded=validateMenus(withLLMMenu(entries));
  assert.deepEqual(upgraded.slice(0,-2),entries);
  assert.equal(upgraded.at(-1).href,'llm-lab.html');
  assert.equal(upgraded.at(-1).parent_id,upgraded.at(-2).id);
  assert.equal(withLLMMenu(upgraded),upgraded);
});
