// Per-task preferences and reset, with real workers and fully isolated data APIs.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{
 const {RobotLearner}=await import('../robot-learning.mjs'),{DEFAULT_MENUS}=await import('../navigation-data.mjs');
 const fixture=new RobotLearner(null,42,{terrain:'meadow',courseVersion:10,visionVersion:3,bodyVersion:6,validationSeconds:6,monitorSeconds:10}).snapshot();
 fixture.attempts=321;fixture.taskAttempts.balance=321;fixture.algorithmAttempts.ppo=321;
 let row={id:'main',model:fixture,revision:1};
 const base=process.env.ROBOT_BASE_URL||'http://127.0.0.1:8000',proxy=base.startsWith('https:')?(process.env.HTTPS_PROXY||process.env.HTTP_PROXY):null;
 const b=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox'],...(proxy?{proxy:{server:proxy}}:{})});
 try{
  const p=await b.newPage({viewport:{width:390,height:844}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.route('**/rest/v1/**',route=>{
   const r=route.request();if(r.url().includes('/site_navigation'))return route.fulfill({json:[{id:'main',menus:DEFAULT_MENUS,revision:1}]});assert.ok(r.url().includes('/robot_shared_model'));
   if(r.method()==='POST')row={...row,model:r.postDataJSON().model,revision:row.revision+1};
   const keys=new URL(r.url()).searchParams.get('select')?.split(',');return route.fulfill({json:[keys?Object.fromEntries(keys.map(k=>[k,row[k]])):row]});
  });
  await p.addInitScript(()=>{
   localStorage.setItem('unrelated-app-sentinel','keep');
   const Native=Worker;window.__trainingRequest=null;window.Worker=class extends Native{postMessage(data,...rest){if(data.type==='train'){window.__trainingRequest=data;return;}return super.postMessage(data,...rest);}};
  });
  const ready=()=>p.waitForFunction(()=>!document.querySelector('#rb-train').disabled,null,{timeout:180000});
  const open=()=>p.locator('#rb-details').evaluate(e=>e.open=true);
  const value=id=>p.locator('#rb-'+id).inputValue();
  const change=async(id,n)=>{await p.locator('#rb-'+id).fill(String(n));await p.locator('#rb-'+id).dispatchEvent('change');};
  await p.goto(base+'/robot.html?verify=robot52-task');await ready();await open();
  assert.equal(await value('training-seconds'),'10');assert.equal(await value('validation-seconds'),'10');
  await change('training-seconds',12);
  await p.locator('#rb-focus').selectOption('walk');assert.equal(await value('training-seconds'),'15');
  await change('training-seconds',19);await p.locator('#rb-count').selectOption('500');await p.locator('#rb-algorithm').selectOption('cem');
  await p.locator('#rb-focus').selectOption('recover');
  assert.equal(await value('training-seconds'),'30');assert.equal(await value('validation-seconds'),'30');assert.equal(await value('monitor-seconds'),'60');
  assert.equal(await p.locator('#rb-auto-push').isChecked(),false);assert.equal(await p.locator('#rb-balance-early-stop').isDisabled(),true);
  await change('training-seconds',45);await change('observation-seconds',75);await p.locator('#rb-count').selectOption('200');
  await p.locator('#rb-focus').selectOption('walk');assert.equal(await value('training-seconds'),'19');assert.equal(await value('count'),'500');assert.equal(await value('algorithm'),'cem');
  await p.locator('#rb-focus').selectOption('recover');assert.equal(await value('training-seconds'),'45');assert.equal(await value('count'),'200');assert.equal(await value('observation-seconds'),'75');
  await p.reload();await ready();await open();assert.equal(await value('focus'),'recover');assert.equal(await value('training-seconds'),'45');assert.equal(await value('observation-seconds'),'75');
  await p.locator('#rb-task-defaults').click();await ready();
  assert.equal(await value('training-seconds'),'30');assert.equal(await value('validation-seconds'),'30');assert.equal(await value('observation-seconds'),'60');assert.equal(await value('count'),'10000');assert.equal(await value('algorithm'),'ppo');
  assert.equal(row.model.id,fixture.id);assert.equal(row.model.attempts,321);assert.deepEqual(row.model.weights,fixture.weights);
  assert.equal(row.model.taskSettings.walk.trainingSeconds,19);assert.equal(row.model.environment.taskEnvironments.recover.validationSeconds,30);
  await p.locator('#rb-focus').selectOption('balance');assert.equal(await value('training-seconds'),'12');
  await p.locator('#rb-focus').selectOption('run');assert.equal(await value('training-seconds'),'20');assert.equal(await value('validation-seconds'),'20');assert.equal(await value('target-speed'),'240');
  await p.locator('#rb-focus').selectOption('obstacles');assert.equal(await value('training-seconds'),'30');assert.equal(await p.locator('#rb-auto-push').isChecked(),false);
  await p.locator('#rb-focus').selectOption('walk');assert.equal(await value('training-seconds'),'19');assert.equal(await value('count'),'500');
  await p.locator('#rb-train').click();await p.waitForFunction(()=>window.__trainingRequest!==null);
  const request=await p.evaluate(()=>window.__trainingRequest);assert.equal(request.focus,'walk');assert.equal(request.count,500);assert.equal(request.balanceTraining.trainingSeconds,19);assert.equal(request.algorithm,'cem');
  assert.equal(await p.locator('#rb-task-defaults').isDisabled(),true);
  assert.equal(await p.evaluate(()=>localStorage.getItem('unrelated-app-sentinel')),'keep');
  for(const viewport of [{width:390,height:844},{width:1080,height:720}]){await p.setViewportSize(viewport);assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  assert.deepEqual(errors,[]);console.log('PASS per-ability defaults/custom changes, switching/reload persistence, selected-only reset, preserved model/other-task settings, actual worker settings and mobile/desktop layout; isolated APIs.');
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exit(1);});
