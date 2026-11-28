import {makeDataset,samples} from './data.mjs';
import {readDocument,validateText} from './import.mjs';
import {help,helpLabels,drawLoss} from './metrics.mjs';
import {connectEngine} from './client.mjs';

const $=id=>document.getElementById(id);
const status=$('status');
const number=(n,d=0)=>Number.isFinite(n)?n.toLocaleString('ko-KR',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const decimal=n=>Number.isFinite(n)?n.toExponential(3):'—';
const percent=n=>Number.isFinite(n)?number(n*100,2)+'%':'—';
const date=value=>value ? new Date(value).toLocaleString('ko-KR') : '—';
const time=n=>Number.isFinite(n)?number(n/1000,1)+'초':'—';
const currentTab=()=>document.querySelector('[role="tab"][aria-selected="true"]').id;
const createDefaults={name:'MyDesk Transformer',datasetName:'한국어 연습 문장',documents:samples};
let state={}, history=[], validation, prediction, testResult, busy=false, docs=samples.slice();
let generating=false, generationCancelled=false;
let weightData, engine, lastDatasetKey, testOptions, lastError='', readingDocuments=false;

function node(tag,text='',className) {
  const element=document.createElement(tag);
  if(text!=='') element.textContent=text;
  if(className) element.className=className;
  return element;
}

function infoButton(key) {
  const button=node('button','?','lab-info');
  button.type='button';
  button.dataset.info=key;
  button.setAttribute('aria-label',help[key][0]+' 설명');
  return button;
}

function setMessage(message,error=false) {
  const element=$('lab-message');
  element.textContent=message;
  element.dataset.error=String(error);
  if(error) {
    lastError=message;
    $('training-log').prepend(node('p',message,'lab-text'));
  }
}

function setStatus(text,kind) {
  status.textContent=text;
  status.dataset.status=kind;
}

function metrics(id, entries) {
  const target=$(id);
  if(!target.children.length) {
    for(const [name,,key] of entries) {
      const row=node('div'), label=node('dt',name);
      if(key) label.append(infoButton(key));
      row.append(label,node('dd'));
      target.append(row);
    }
  }
  entries.forEach(([,value],index)=>target.children[index].lastElementChild.textContent=value);
}

function fillTable(container,headers,rows) {
  const table=node('table','','lab-table');
  const heading=table.createTHead().insertRow();
  heading.append(...headers.map(label=>{
    const th=node('th',label);
    th.scope='col';
    return th;
  }));
  const body=table.createTBody();
  for(const row of rows) {
    const tr=body.insertRow();
    for(const field of row) tr.insertCell().textContent=field;
  }
  container.replaceChildren(table);
}

function options(select,entries) {
  const previous=select.value;
  select.replaceChildren(...entries.map(([id,title])=>new Option(title,id)));
  if(entries.some(([id])=>String(id)===previous)) select.value=previous;
}

function formatToken(id,vocab=state.model?.vocabulary) {
  const token=vocab?.[id];
  return token===' ' ? '␠' : token==='\n' ? '↵' : token??'—';
}

function drawCharts() {
  drawLoss($('loss-chart'),history);
  if($('chart-dialog').open) drawLoss($('expanded-loss'),history);
}

function renderProgress() {
  const m=state.model, latest=history.at(-1);
  $('model-name').textContent=m?.name??'—';
  $('model-name').title=m?.name??'';
  $('parameter-count').textContent=number(m?.count);
  $('status-step').textContent=number(latest?.step??m?.step);
  $('status-tokens').textContent=number(latest?.tokens??m?.tokens);
  $('status-time').textContent=time(latest?.elapsed??m?.elapsed);
  $('status-saved').textContent=date(state.saved);
  $('status-saved').title=date(state.saved);
  metrics('metrics',[
    ['Training Loss',number(latest?.train,3),'train'],
    ['Validation Loss',number(validation?.val,3),'validation'],
    ['누적 학습 시간',time(latest?.elapsed??m?.elapsed),'time']
  ]);
  $('loss-gap').textContent=validation
    ? 'Step '+number(validation.step)+' · 검증 − 학습 '+number(validation.val-validation.train,3)
    : '같은 Step의 검증 − 학습 손실 차이';
  const step=latest?.step??m?.step??0, target=state.targetStep??0;
  $('training-progress').max=Math.max(1,target);
  $('training-progress').value=step;
  $('training-progress-label').textContent=target ? '누적 '+number(step)+' / '+number(target)+'회 · 남은 횟수 '+number(Math.max(0,target-step)) : '학습 횟수를 정하고 시작하세요.';
  const points=history.filter(row=>row.val!==undefined&&row.datasetVersion===m?.datasetVersion);
  let assessment='학습·검증 기록이 쌓이면 최근 추세를 함께 살펴봅니다. 과소적합 여부는 데이터와 모델 크기도 함께 확인해야 합니다.';
  if(points.length>=6) {
    const recent=points.slice(-3), earlier=points.slice(-6,-3);
    const average=(rows,key)=>rows.reduce((sum,row)=>sum+row[key],0)/rows.length;
    const train=average(recent,'train')-average(earlier,'train');
    const valid=average(recent,'val')-average(earlier,'val');
    assessment=train<0&&valid>0 ? '과적합 징후가 보입니다. 최근 학습 손실은 낮아지고 검증 손실은 높아졌습니다. 학습을 멈추거나 글을 늘려 비교해 보세요.' :
      train<0&&valid<0 ? '학습·검증 손실이 함께 낮아지고 있습니다. 현재 구간에서는 두 손실이 함께 개선되고 있습니다.' :
      '최근 손실이 정체되거나 흔들리고 있습니다. 과소적합 가능성과 데이터 차이를 살펴보세요. 이 추세만으로 확정하기는 어렵습니다.';
  }
  $('fit-assessment').textContent=assessment;
  $('active-documents').textContent=m ? m.datasetName+' · '+(state.docs??[]).map(doc=>doc.name).join(' · ') : '학습할 글을 선택하세요.';
  $('chart-empty').hidden=history.length>0;
  drawCharts();
  if(currentTab()==='tab-weights') renderResearch();
  if(currentTab()==='tab-models') renderHistory();
}

function controls() {
  const m=state.model, running=state.running;
  for(const button of document.querySelectorAll('[data-needs-model]')) button.disabled=!m||busy;
  $('train-start').disabled=!m||busy||running;
  $('train-start').textContent=history.length ? '이어 학습' : '학습 시작';
  $('train-pause').disabled=!m||busy||!running;
  $('train-stop').disabled=!m||busy||!running;
  $('apply-data').disabled=!m||busy||running||readingDocuments;
  $('reset-model').disabled=!m||busy||running;
  $('new-model').disabled=$('new-from-data').disabled=busy||running||readingDocuments;
  $('test-save').disabled=!testResult||busy;
  for(const button of document.querySelectorAll('[data-restore]')) button.disabled=busy||running;
}

function accept(next) {
  state=next;
  const m=next.model;
  if(m) try { localStorage.setItem('mydesk.llm.active',m.id); } catch {}
  const key=m ? m.id+'/'+m.datasetVersion : '';
  if(key!==lastDatasetKey) {
    lastDatasetKey=key;
    docs=next.docs?.slice()??samples.slice();
    $('dataset-name').value=m?.datasetName??createDefaults.datasetName;
    prediction=undefined;
    testResult=undefined;
    weightData=undefined;
    $('predict-summary').textContent='입력 문장의 다음 토큰 확률을 계산하세요.';
    $('eval-results').textContent='';
    for(const id of ['probabilities','trace','attention-map','attention-caption','predict-step','weights-table','weight-caption','histograms','test-results','token-loss']) $(id).replaceChildren();
    renderDocuments();
  }
  history=m?.history??[];
  validation=history.findLast(row=>row.val!==undefined&&row.datasetVersion===m.datasetVersion);
  if(m) {
    options($('attention-layer'),Array.from({length:m.config.layers},(_,i)=>[i,i+1]));
    options($('attention-head'),Array.from({length:m.config.heads},(_,i)=>[i,i+1]));
    options($('weight-name'),m.parameters.map(p=>[p.name,p.name+' · '+p.rows+'×'+p.cols]));
  }
  setStatus(next.storageError?'저장 오류':next.running?'학습 중':next.phase==='completed'?'학습 완료':next.phase==='stopped'?'학습 종료':next.phase==='paused'?'일시정지':m?'준비 완료':'모델 없음',
    next.storageError?'error':next.running?'running':'idle');
  renderLibrary();
  renderProgress();
  controls();
}

function onEvent(event) {
  if(event.type==='completed') { accept(event.state);setMessage('선택한 횟수의 학습을 완료하고 저장했습니다.');return; }
  if(event.type==='progress') {
    if(!state.model||!event.metrics.length||event.metrics.at(-1)?.step<=(history.at(-1)?.step??0)) return;
    for(const metric of event.metrics) if(metric.step>(history.at(-1)?.step??0)) {
      history.push(metric);
      if(metric.val!==undefined) validation=metric;
    }
    if(event.currentText) $('current-training-text').textContent=event.currentText;
    renderProgress();
  } else if(event.type==='saved') {
    state.saved=event.saved;
    state.checkpoints=[event.record,...(state.checkpoints??[]).filter(record=>record.reason!=='자동')];
    state.models=[event.record,...(state.models??[]).filter(record=>record.id!==event.record.id)];
    renderLibrary();
    renderProgress();
  } else if(event.type==='error') {
    state.running=false;
    setStatus('학습 중단','error');
    setMessage(event.message,true);
    controls();
  }
}

async function action(name,args,message) {
  if(busy) return false;
  busy=true;
  controls();
  try {
    const next=await engine.request(name,args);
    accept(next);
    setMessage(next.storageError??message??'모델이 준비되었습니다.',Boolean(next.storageError));
    return true;
  } catch(error) {
    if(name==='pause'||name==='stop') {
      state.running=false;
      setStatus('저장 오류','error');
      try { accept(await engine.request('state')); } catch {}
      setStatus('저장 오류','error');
    }
    setMessage(error.message,true);
    return false;
  } finally {
    busy=false;
    controls();
    if(document.hidden&&state.running) setTimeout(pauseHidden,0);
  }
}

function pauseHidden() {
  if(document.hidden&&state.running&&!busy) void action('pause',{},'페이지가 숨겨져 학습을 일시정지하고 저장했습니다.');
}

function listRows(id,items,render,empty) {
  const content=node('div','','lab-list');
  for(const item of items) if(item) content.append(render(item));
  $(id).replaceChildren(items.length ? content : node('p',empty,'lab-hint'));
}

function row(title,subtitle,buttonLabel,callback) {
  const element=node('div','','lab-list-row'), copy=node('div');
  copy.append(node('strong',title),node('small',subtitle));
  element.append(copy);
  if(callback) {
    const button=node('button',buttonLabel);
    button.type='button';
    button.addEventListener('click',callback);
    element.append(button);
  }
  return element;
}

function renderDocuments() {
  const name=$('dataset-name').value.trim();
  let stats, error;
  try {
    stats=docs.length===state.docs?.length&&docs.every((doc,index)=>doc===state.docs[index]) ? state.model.stats : makeDataset(docs).stats;
  }
  catch(e) { error=e.message; }
  metrics('dataset-metrics',[
    ['문서',number(docs.length),'data'],['문자',number(stats?.characters),'data'],
    ['토큰',number(stats&&stats.train+stats.validation),'data'],['어휘',number(stats?.vocabulary),'data'],
    ['학습 / 검증',number(stats?.train)+' / '+number(stats?.validation),'data'],
    ['검증 미등록',number(stats?.validationUnknowns),'data'],
    ['고정 평가',number(stats?.fixed),'data'],['고정 평가 미등록',number(stats?.fixedUnknowns),'data']
  ]);
  $('new-dataset').textContent=error??name+' · 문서 '+docs.length+'개';
  listRows('doc-list',docs,doc=>{
    const element=node('details'), summary=node('summary',doc.name);
    const preview=node('div',Array.from(doc.text).slice(0,1000).join(''),'lab-text');
    const remove=node('button','삭제');
    remove.type='button';
    remove.addEventListener('click',()=>{
      docs=docs.filter(item=>item.id!==doc.id);
      renderDocuments();
    });
    element.append(summary,preview,remove);
    if(doc.warning) element.append(node('p',doc.warning,'lab-hint'));
    return element;
  },'샘플을 선택하거나 학습 문서를 추가하세요.');
}

function renderLibrary() {
  const m=state.model;
  const architecture=$('architecture');
  if(m) {
    const c=m.config;
    const details=node('details');
    details.append(node('summary','파라미터 목록'),node('div',m.parameters.map(p=>p.name+'  '+p.rows+' × '+p.cols).join('\n'),'lab-text'));
    architecture.replaceChildren(node('p','Decoder-only · '+c.layers+' 레이어 · '+c.width+' 차원 · '+c.heads+' 헤드 · 문맥 '+c.context,
      'lab-hint'),node('p','문자 및 위치 임베딩 · Pre-LN · Causal Attention · ReLU FFN · Adam','lab-hint'),
      node('p',m.datasetName+' · 버전 '+m.datasetVersion+' · 어휘 '+number(m.stats.vocabulary)+'개 · '+date(m.createdAt),'lab-hint'),details);
  } else architecture.textContent='생성한 모델이 없습니다.';
  const modelRows=(record,title,subtitle,key)=>{
    const element=row(title,subtitle,'불러오기',()=>{
      void action('restore',{id:record.id,key},'모델을 불러왔습니다.');
    });
    element.lastElementChild.dataset.restore='true';
    element.lastElementChild.disabled=busy||state.running;
    return element;
  };
  listRows('model-library',state.models??[],record=>modelRows(record,record.name,
    number(record.count)+'개 · '+number(record.step)+' Step · '+number(record.tokens)+' 토큰 · '+record.datasetName+' · '+date(record.savedAt)),
    '이 브라우저에 저장된 모델이 없습니다.');
  listRows('checkpoint-library',state.checkpoints??[],record=>modelRows(record,
    record.reason+' · Step '+number(record.step),
    date(record.savedAt)+' · Training '+number(record.train,3)+' · Validation '+number(record.val,3)+' · 고정 평가 '+number(record.fixed,3),record.key),
    '저장된 체크포인트가 없습니다.');
  options($('test-checkpoint'),[['','현재 가중치'],...(state.checkpoints??[]).map(r=>[r.key,r.reason+' · Step '+number(r.step)])]);
  listRows('test-library',state.tests??[],record=>{
    const details=node('details');
    details.append(node('summary','Step '+number(record.step)+' · '+date(record.time)),
      node('p',record.prompt,'lab-text'),node('strong','학습 전'),node('p',record.initial||'∅','lab-text'),
      node('strong','선택한 모델'),node('p',record.current||'∅','lab-text'));
    return details;
  },'저장된 생성 결과가 없습니다.');
  const logs=(m?.logs??[]).slice(-30).reverse().map(item=>date(item.time)+' · '+item.level+' · '+item.message);
  $('training-log').replaceChildren(node('p',logs.join('\n')||lastError||'기록 없음','lab-text'));
  renderHistory();
}

function renderHistory() {
  const recent=history.slice(-20).reverse();
  if(!recent.length) {
    $('training-history').textContent='학습을 시작하면 이력이 기록됩니다.';
    return;
  }
  fillTable($('training-history'),['Step','데이터','Train','Valid','고정 평가','LR','토큰'],recent.map(m=>
    [number(m.step),number(m.datasetVersion),number(m.train,3),number(m.val,3),number(m.fixed,3),decimal(m.rate),number(m.tokens)]));
}

function exportHistory() {
  const columns=['step','datasetVersion','train','val','fixed','accuracy','validationAccuracy','fixedAccuracy','perplexity',
    'validationPerplexity','rate','gradientNorm','weightNorm','updateRatio','clipped','epoch','tokens','tokensPerSecond','elapsed'];
  const csv=[columns.join(','),...history.map(metric=>columns.map(key=>metric[key]??'').join(','))].join('\n');
  const href=URL.createObjectURL(new Blob([csv],{type:'text/csv'})), link=node('a');
  link.href=href;
  link.download='mydesk-llm-history.csv';
  link.click();
  setTimeout(()=>URL.revokeObjectURL(href),1000);
}

function renderPrediction() {
  const {current:m,initial,vocabulary:v,config}=prediction;
  const label=id=>formatToken(id,v);
  $('predict-step').textContent='Step '+number(m.step);
  $('predict-summary').textContent='선택 '+label(m.selected)+' ('+percent(m.selectedProbability)+') · Greedy '+
    label(m.greedy)+' · 확률 합 '+m.sum.toFixed(8)+(m.unknowns?' · 미등록 문자 '+m.unknowns+'개':'');
  const items=m.candidates.slice();
  if(!items.some(item=>item.id===m.selected)) items.push({id:m.selected,probability:m.selectedProbability});
  $('probabilities').replaceChildren(...items.map(({id,probability})=>{
    const item=node('div','','lab-prob');
    item.dataset.selected=String(id===m.selected);
    const bar=node('meter');
    bar.min=0;
    bar.max=1;
    bar.value=probability;
    bar.setAttribute('aria-label',label(id)+' '+percent(probability));
    item.append(node('strong',label(id)),bar,node('span',percent(probability)));
    return item;
  }));
  const vector=(title,values)=>{
    const detail=node('details');
    detail.append(node('summary',title),node('p',
      values.slice(-config.width).map(n=>n.toFixed(4)).join('  '),'lab-text'));
    return detail;
  };
  const logits=node('details'), logitRows=node('div','','lab-scroll');
  logits.append(node('summary','Output Logit와 Softmax'),logitRows);
  fillTable(logitRows,['토큰','ID','Logit','현재 확률','초기 확률'],
    Array.from(m.logits,(logit,id)=>[label(id),id,number(logit,4),percent(m.probabilities[id]),percent(initial.probabilities[id])]));
  const attentionLink=node('button','Attention 보기');
  attentionLink.addEventListener('click',()=>selectTab($('tab-attention'),true));
  $('trace').replaceChildren(
    node('p','입력 토큰 · '+m.input.map(label).join(' '),'lab-text'),
    node('p','문맥에 포함된 Token ID · '+m.input.join(' '),'lab-text'),
    vector('Token + Positional Embedding · 마지막 위치',m.embedding),
    ...m.blocks.map((values,i)=>vector('Transformer Block '+(i+1)+' · 마지막 위치',values)),
    attentionLink,logits,node('p','다음 토큰 · '+label(m.selected)+' / 생성 ID '+m.generatedIds.join(' '),'lab-hint'));
  if(currentTab()==='tab-attention') renderAttention();
}

async function predict(append=false) {
  const modelId=state.model?.id, form=$('predict-form');
  if(!modelId||!form.reportValidity()) return;
  const prompt=$('predict-input').value;
  try {
    const result=await engine.request('predict',{prompt,options:{temperature:+$('predict-temp').value,
      mode:$('predict-mode').value,length:1,seed:crypto.getRandomValues(new Uint32Array(1))[0]}});
    if(state.model?.id!==modelId||$('predict-input').value!==prompt) return;
    prediction=result;
    renderPrediction();
    if(append) $('predict-input').value=(prompt+result.current.generated).slice(-512);
  } catch(error) { setMessage(error.message,true); }
}

function renderAttention() {
  const target=$('attention-map');
  if(!prediction) {
    $('attention-caption').textContent='확률을 계산하면 해당 입력의 Attention을 볼 수 있습니다.';
    target.replaceChildren();
    return;
  }
  const layer=+$('attention-layer').value, head=+$('attention-head').value, source=$('attention-source').value;
  const {current,initial,vocabulary}=prediction;
  const a=current.attention[layer][head], b=initial.attention[layer][head];
  const tokens=current.input.map(id=>formatToken(id,vocabulary));
  const n=tokens.length, table=node('table','','lab-table lab-heat');
  table.setAttribute('aria-label','토큰 간 Attention');
  const headers=table.createTHead().insertRow();
  headers.append(node('th','조회 / 참조'));
  tokens.forEach(token=>headers.append(node('th',token)));
  const body=table.createTBody();
  const caption=$('attention-caption'), description='Step '+number(current.step)+' · '+n+' 토큰';
  caption.textContent=description;
  for(let r=0;r<n;r++) {
    const tr=body.insertRow(), th=node('th',tokens[r]);
    th.scope='row';
    tr.append(th);
    for(let c=0;c<n;c++) {
      const td=tr.insertCell(), i=r*n+c;
      if(c>r) {
        td.textContent='–';
        continue;
      }
      const value=source==='initial'?b[i]:source==='difference'?a[i]-b[i]:a[i];
      const button=node('button',value.toFixed(2));
      button.type='button';
      button.style.backgroundColor=value<0?'rgba(179, 73, 35, '+Math.abs(value)+')':'rgba(64, 93, 194, '+value+')';
      if(Math.abs(value)>.58) button.style.color='white';
      const detail=(r+1)+' '+tokens[r]+' → '+(c+1)+' '+tokens[c]+' · '+value.toFixed(6);
      button.setAttribute('aria-label',detail);
      button.addEventListener('click',()=>caption.textContent=description+' · '+detail);
      td.append(button);
    }
  }
  target.replaceChildren(table);
}

function renderResearch() {
  const latest=history.at(-1);
  metrics('research-metrics',[
    ['Weight Norm',number(latest?.weightNorm,3),'weightNorm'],
    ['Update-to-Weight',decimal(latest?.updateRatio),'updateRatio'],
    ['학습 / 검증 정확도',percent(latest?.accuracy)+' / '+percent(validation?.validationAccuracy),'accuracy'],
    ['클리핑',latest ? latest.clipped?'발생':'미발생':'—','clipping'],
    ['파라미터 배열',weightData?number(weightData.tensorBytes/1024,1)+' KiB':'—','memory'],
    ['브라우저 메모리 / CPU', '미측정','memory'],
    ['고정 평가 손실',number(validation?.fixed,3),'validation'],
    ['고정 평가 정확도',percent(validation?.fixedAccuracy),'accuracy'],
    ['학습 Perplexity',number(latest?.perplexity,2),'perplexity']
  ]);
  const target=$('token-loss');
  const evaluated=validation?.validationByToken;
  if(!evaluated||target.dataset.step===String(validation.step)+'/'+state.model?.id) return;
  target.dataset.step=String(validation.step)+'/'+state.model?.id;
  const train=new Map(validation.byToken);
  const title=node('h3','토큰별 교차 엔트로피 · Step '+validation.step);
  title.append(infoButton('tokenLoss'));
  const scroll=node('div','','lab-scroll');
  const ids=new Set([...evaluated.map(([id])=>id),...train.keys()]);
  const valid=new Map(evaluated);
  const mean=entry=>entry ? number(entry.loss/entry.count,3)+' ('+entry.count+')':'—';
  fillTable(scroll,['정답 토큰','학습 손실 (횟수)','검증 손실 (횟수)'],
    [...ids].map(id=>[formatToken(id),mean(train.get(id)),mean(valid.get(id))]));
  target.replaceChildren(title,scroll);
}

async function inspectWeights() {
  if(!state.model||!$('weight-offset').reportValidity()) return;
  const id=state.model.id, name=$('weight-name').value;
  try {
    const result=await engine.request('inspect',{name,offset:+$('weight-offset').value});
    if(id!==state.model?.id||name!==$('weight-name').value) return;
    weightData=result;
    $('weight-offset').max=result.count-1;
    $('weight-caption').textContent=name+' · '+number(result.count)+'개 원소 · Step '+number(result.step)+'의 클리핑 전 기울기';
    fillTable($('weights-table'),['인덱스','초기값','현재값','초기 대비 Δ','기울기','마지막 업데이트'],result.rows.map(r=>
      [r.index,decimal(r.initial),decimal(r.current),decimal(r.current-r.initial),decimal(r.gradient),decimal(r.update)]));
    $('histograms').replaceChildren(...[['가중치',result.weights],['기울기',result.gradients]].map(([title,distribution])=>{
      const box=node('div'), heading=node('h3',title+' 분포');
      heading.append(infoButton('distribution'));
      box.append(heading);
      if(!distribution) { box.append(node('p','학습을 시작하면 기울기가 기록됩니다.','lab-hint'));return box; }
      const chart=node('div','','lab-histogram'), max=Math.max(...distribution.bins);
      chart.setAttribute('role','img');
      chart.setAttribute('aria-label',title+' 구간별 원소 수 '+distribution.bins.join(', '));
      distribution.bins.forEach((count,index)=>{
        const bar=node('span');
        bar.style.height=(count/max*100)+'%';
        bar.title='구간 '+(index+1)+' · '+number(count)+'개';
        chart.append(bar);
      });
      box.append(chart,node('p','범위 '+decimal(-distribution.extent)+' ~ '+decimal(distribution.extent),'lab-hint'));
      return box;
    }));
    renderResearch();
  } catch(error) { setMessage(error.message,true); }
}

async function generate(single=false) {
  if(generating||!state.model||!$('test-form').reportValidity()) return;
  generating=true;
  generationCancelled=false;
  const modelId=state.model.id, prompt=$('test-input').value;
  const count=single?1:+$('test-length').value;
  const output=node('p',prompt,'lab-text generation-output');
  $('test-results').replaceChildren(output);
  try {
    const session=await engine.request('generationStart',{prompt,key:$('test-checkpoint').value,
      options:{temperature:+$('test-temp').value,mode:$('test-mode').value}});
    for(let i=0;i<count&&!generationCancelled&&state.model?.id===modelId;i++) {
      const result=await engine.request('generationNext',{token:session.token});
      if(generationCancelled||state.model?.id!==modelId) break;
      const current=result.current;
      const candidates=current.candidates.slice(0,6);
      if(!candidates.some(item=>item.id===current.selected)) candidates.push({id:current.selected,probability:current.selectedProbability});
      $('generation-candidates').replaceChildren(...candidates.map(candidate=>{
        const item=node('div','','generation-candidate');
        item.dataset.selected=String(candidate.id===current.selected);
        const meter=node('meter');
        meter.min=0;meter.max=1;meter.value=candidate.probability;
        item.append(node('span',formatToken(candidate.id,result.vocabulary)),meter,node('span',percent(candidate.probability)));
        return item;
      }));
      $('generation-status').textContent='Step '+session.step+'의 가중치 · '+(i+1)+' / '+count+'자 · 선택 '+formatToken(current.selected,result.vocabulary)+' '+percent(current.selectedProbability);
      await new Promise(resolve=>setTimeout(resolve,220));
      output.append(document.createTextNode(current.generated));
      output.scrollTop=output.scrollHeight;
      if(single) $('test-input').value=(prompt+current.generated).slice(-512);
    }
    $('generation-status').append(document.createTextNode(generationCancelled?' · 생성 중지':' · 생성 완료'));
  } catch(error) { setMessage(error.message,true); }
  finally { generating=false; }
}

async function evaluate() {
  try {
    const result=await engine.request('evaluate');
    $('eval-results').textContent='Step '+number(result.step)+' · 검증 '+number(result.validation?.loss,3)+' · 고정 평가 '+number(result.fixed?.loss,3)+
      ' · 평가 토큰 '+number(result.fixed?.tokens)+'개 (어휘 밖 '+number(state.model?.stats.fixedUnknowns)+'개) · 정확도 '+percent(result.fixed?.accuracy);
  } catch(error) { setMessage(error.message,true); }
}

function selectTab(tab,focus=false) {
  for(const item of document.querySelectorAll('[role="tab"]')) {
    const selected=item===tab;
    item.setAttribute('aria-selected',String(selected));
    item.tabIndex=selected?0:-1;
    $(item.getAttribute('aria-controls')).hidden=!selected;
  }
  if(focus) tab.focus();
  if(tab.id==='tab-attention') renderAttention();
  if(tab.id==='tab-weights') void inspectWeights();
  if(tab.id==='tab-models') renderLibrary();
}

function bind() {
  const tabs=[...document.querySelectorAll('[role="tab"]')];
  $('toggle-analysis').addEventListener('click',()=>{
    const open=$('toggle-analysis').getAttribute('aria-expanded')!=='true';
    $('toggle-analysis').setAttribute('aria-expanded',String(open));
    $('toggle-analysis').textContent=open?'상세 분석 접기':'상세 분석 열기';
    for(const id of ['tab-predict','tab-attention','tab-weights']) $(id).hidden=!open;
    if(!open) selectTab($('tab-test'));
  });
  tabs.forEach((tab,index)=>{
    tab.addEventListener('click',()=>selectTab(tab));
    tab.addEventListener('keydown',event=>{
      const next={ArrowLeft:(index+tabs.length-1)%tabs.length,ArrowRight:(index+1)%tabs.length,Home:0,End:tabs.length-1}[event.key];
      if(next===undefined) return;
      event.preventDefault();
      if(!tabs[next].hidden) selectTab(tabs[next],true);
    });
  });
  document.addEventListener('click',event=>{
    const trigger=event.target.closest('[data-info],[data-close]');
    if(!trigger) return;
    if(trigger.dataset.close) return $(trigger.dataset.close).close();
    const [title,...details]=help[trigger.dataset.info];
    $('info-title').textContent=title;
    $('info-content').replaceChildren(...details.flatMap((value,i)=>[node('dt',helpLabels[i]),node('dd',value)]));
    $('info-dialog').showModal();
  });
  $('expand-chart').addEventListener('click',()=>{$('chart-dialog').showModal();drawCharts();});
  new ResizeObserver(drawCharts).observe($('loss-chart'));
  new ResizeObserver(drawCharts).observe($('expanded-loss'));
  document.addEventListener('visibilitychange',pauseHidden);
  for(const [id,name,message] of [
    ['train-start','start','실제 Transformer 가중치를 갱신하고 있습니다.'],
    ['train-pause','pause','일시정지했습니다. 체크포인트를 저장했습니다.'],
    ['train-stop','stop','학습을 종료하고 체크포인트를 저장했습니다.'],
    ['train-save','save','체크포인트를 저장했습니다.'],
    ['reset-model','reset','새 가중치로 모델을 생성했습니다.']
  ]) $(id).addEventListener('click',()=>void action(name,name==='start'?{steps:+$('training-steps').value,resume:false}:{},message));

  $('predict-form').addEventListener('submit',event=>{event.preventDefault();void predict();});
  $('predict-append').addEventListener('click',()=>void predict(true));
  $('attention-refresh').addEventListener('click',()=>void predict());
  for(const id of ['attention-layer','attention-head','attention-source']) $(id).addEventListener('change',renderAttention);
  $('weight-name').addEventListener('change',()=>{$('weight-offset').value=0;void inspectWeights();});
  $('weight-refresh').addEventListener('click',()=>void inspectWeights());
  $('generation-stop').addEventListener('click',()=>generationCancelled=true);
  $('choose-data').addEventListener('click',()=>{selectTab($('tab-data'),true);$('panel-data').scrollIntoView({block:'start',behavior:'smooth'});});
  $('test-form').addEventListener('submit',event=>{event.preventDefault();void generate();});
  $('test-next').addEventListener('click',()=>void generate(true));
  $('test-save').addEventListener('click',()=>void action('saveTest',{result:testResult,options:testOptions},'생성 결과를 저장했습니다.'));
  $('run-eval').addEventListener('click',()=>void evaluate());
  $('export-history').addEventListener('click',exportHistory);

  $('add-samples').addEventListener('click',()=>{
    const selection=new Set(docs.map(doc=>doc.id));
    $('sample-list').replaceChildren(...samples.map(doc=>{
      const label=node('label'), box=node('input');
      box.type='checkbox';
      box.value=doc.id;
      box.checked=selection.has(doc.id);
      label.append(box,document.createTextNode(doc.name));
      return label;
    }));
    $('sample-dialog').showModal();
  });
  $('sample-form').addEventListener('submit',event=>{
    event.preventDefault();
    const selected=new Set([...$('sample-list').querySelectorAll('input:checked')].map(box=>box.value));
    docs=[...samples.filter(doc=>selected.has(doc.id)),...docs.filter(doc=>!doc.id.startsWith('sample-'))];
    renderDocuments();
    $('sample-dialog').close();
  });
  $('dataset-name').addEventListener('input',renderDocuments);
  $('apply-data').addEventListener('click',()=>void action('dataset',
    {documents:docs,datasetName:$('dataset-name').value.trim()||'사용자 데이터셋'},'데이터셋을 적용하고 체크포인트를 저장했습니다.'));
  $('text-form').addEventListener('submit',event=>{
    event.preventDefault();
    try {
      const name=$('doc-name').value.trim()||'직접 입력';
      addDocument({name,text:validateText($('doc-text').value)});
      event.target.reset();
      setMessage('텍스트를 추가했습니다. 현재 모델에 적용하거나 새 모델을 만드세요.');
    } catch(error) { setMessage(error.message,true); }
  });
  $('dataset-files').addEventListener('change',async event=>{
    const input=event.target;
    input.disabled=true;
    readingDocuments=true;
    controls();
    const errors=[];
    for(const file of input.files) {
      try { addDocument({name:file.name,...await readDocument(file)}); }
      catch(error) { errors.push(file.name+' · '+error.message); }
    }
    input.value='';
    input.disabled=false;
    readingDocuments=false;
    controls();
    setMessage(errors.length?errors.join(' / '):'문서를 추가했습니다. 미리 보기에서 본문을 확인하세요.',errors.length>0);
  });
  const showModelDialog=()=>{
    $('model-error').textContent='';
    renderDocuments();
    $('model-dialog').showModal();
  };
  $('new-model').addEventListener('click',showModelDialog);
  $('new-from-data').addEventListener('click',showModelDialog);
  $('model-form').addEventListener('submit',async event=>{
    event.preventDefault();
    const name=$('new-name').value.trim();
    if(!name) { $('model-error').textContent='모델 이름을 입력하세요.';return; }
    const config=Object.fromEntries(['layers','width','heads','context','rate'].map(key=>[key,+$('cfg-'+key).value]));
    const success=await action('create',{name,datasetName:$('dataset-name').value.trim()||'사용자 데이터셋',documents:docs,config},'새 모델을 만들었습니다.');
    if(success) $('model-dialog').close();
    else $('model-error').textContent=lastError;
  });
}

function addDocument(document) {
  if(docs.length>=30||docs.reduce((sum,doc)=>sum+[...doc.text].length,[...document.text].length)>150000) {
    throw Error('데이터셋은 문서 30개, 전체 15만 자까지 사용할 수 있습니다.');
  }
  docs.push({id:crypto.randomUUID(),...document});
  renderDocuments();
}

async function init() {
  bind();
  renderDocuments();
  renderProgress();
  controls();
  try {
    engine=connectEngine(onEvent);
    let active;
    try { active=localStorage.getItem('mydesk.llm.active'); } catch {}
    if(await action('init',{active})) {
      if(!state.model) await action('create',createDefaults,'기본 한국어 데이터셋이 준비되었습니다.');
      if(state.model) void predict();
    } else setStatus('복원 오류','error');
  } catch(error) {
    setStatus('실행 오류','error');
    setMessage(error.message,true);
  }
}

void init();
