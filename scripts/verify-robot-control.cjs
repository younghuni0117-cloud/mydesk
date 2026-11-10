// Real app/workers, isolated model API: never changes the public robot model.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{
 const {RobotLearner}=await import('../robot-learning.mjs'),{DEFAULT_MENUS}=await import('../navigation-data.mjs');
 const fixture=new RobotLearner(null,42,{terrain:'meadow',courseVersion:10,visionVersion:3,bodyVersion:6,validationSeconds:6,monitorSeconds:10}).snapshot();
 fixture.attempts=12;fixture.taskAttempts.balance=12;fixture.algorithmAttempts.ppo=12;
 let row={id:'main',model:fixture,revision:1};
 const base=process.env.ROBOT_BASE_URL||'http://127.0.0.1:8000',proxy=base.startsWith('https:')?(process.env.HTTPS_PROXY||process.env.HTTP_PROXY):null;
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox'],...(proxy?{proxy:{server:proxy}}:{})});
 try{
  const p=await browser.newPage({viewport:{width:390,height:844}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.route('**/rest/v1/**',route=>{
   const req=route.request();if(req.url().includes('/site_navigation'))return route.fulfill({json:[{id:'main',menus:DEFAULT_MENUS,revision:1}]});
   assert.ok(req.url().includes('/robot_shared_model'));
   if(req.method()==='POST')row={...row,model:req.postDataJSON().model,revision:row.revision+1};
   const keys=new URL(req.url()).searchParams.get('select')?.split(',');return route.fulfill({json:[keys?Object.fromEntries(keys.map(k=>[k,row[k]])):row]});
  });
  await p.addInitScript(()=>{
   if(!localStorage.getItem('mydesk.robot.options'))localStorage.setItem('mydesk.robot.options',JSON.stringify({validationSeconds:6,monitorSeconds:10,autoPush:true,curriculum:true}));
   const Native=Worker;window.__requests=[];window.Worker=class extends Native{postMessage(data,...rest){if(data.type==='train'){window.__requests.push(data);return;}return super.postMessage(data,...rest);}};
  });
  const ready=()=>p.waitForFunction(()=>!document.querySelector('#rb-train').disabled,null,{timeout:120000});
  const open=()=>p.locator('#rb-details').evaluate(e=>e.open=true);
  await p.goto(base+'/robot.html?verify=robot51-control');await ready();await open();
  assert.equal(await p.locator('#rb-servo-profile').inputValue(),'standard');
  assert.equal(await p.locator('#rb-target-speed').inputValue(),'180');
  assert.equal(await p.locator('#rb-graph-version option[value="previous"]').evaluate(e=>e.disabled),true);
  await p.locator('#rb-curriculum').uncheck();assert.ok((await p.locator('#rb-push-state').textContent()).includes('켜짐'));
  await p.locator('#rb-auto-push').uncheck();assert.ok((await p.locator('#rb-push-state').textContent()).includes('꺼짐'));
  await p.locator('#rb-auto-push').check();
  await p.locator('#rb-algorithm').selectOption('cem');
  await p.locator('#rb-balance-full-every').fill('7');await p.locator('#rb-balance-full-every').dispatchEvent('change');
  assert.equal(await p.locator('#rb-balance-full-every').inputValue(),'8');
  assert.ok((await p.locator('#rb-full-trial-note').textContent()).includes('실제 8회'));
  assert.ok((await p.locator('#rb-full-trial-note').textContent()).includes('좌우 2회'));
  await p.locator('#rb-servo-profile').selectOption('firm');await ready();
  assert.equal(row.model.environment.servoProfile,'firm');assert.equal(row.model.attempts,12);assert.deepEqual(row.model.weights,fixture.weights);
  await p.locator('#rb-target-speed').fill('90');await p.locator('#rb-target-speed').dispatchEvent('change');await ready();
  assert.equal(row.model.environment.targetSpeed,90);assert.equal(row.model.attempts,12);
  assert.equal(await p.locator('#rb-graph-version option[value="previous"]').evaluate(e=>e.disabled),false);
  await p.locator('#rb-graph-version').selectOption('previous');assert.ok((await p.locator('#rb-chart-title').textContent()).includes('이전 기준'));
  await p.locator('#rb-graph-version').selectOption('current');
  await p.reload();await ready();await open();
  assert.equal(await p.locator('#rb-servo-profile').inputValue(),'firm');assert.equal(await p.locator('#rb-target-speed').inputValue(),'90');
  assert.equal(row.model.attempts,12);
  // A model updated on another device controls its replay settings here too.
  const updated=new RobotLearner(row.model,42,{...row.model.environment,servoProfile:'soft',targetSpeed:120}).snapshot();row={id:'main',model:updated,revision:row.revision+1};
  await p.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  await p.waitForFunction(()=>document.querySelector('#rb-servo-profile').value==='soft',null,{timeout:30000});await ready();
  assert.equal(await p.locator('#rb-target-speed').inputValue(),'120');
  await p.locator('#rb-train').click();await p.waitForFunction(()=>window.__requests.length>0);
  assert.equal(await p.locator('#rb-servo-profile').isDisabled(),true);assert.equal(await p.locator('#rb-target-speed').isDisabled(),true);
  for(const viewport of [{width:390,height:844},{width:1080,height:720}]){await p.setViewportSize(viewport);assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  assert.deepEqual(errors,[]);console.log('PASS PD settings shared/reloaded with preserved counts/weights, graph availability, actual-trial periods, effective push status, second-device settings and training locks; isolated APIs.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
