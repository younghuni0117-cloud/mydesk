// Browser integration with isolated navigation/model APIs. Never writes live data.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const {RobotLearner}=await import('../robot-learning.mjs');
 const {DEFAULT_MENUS}=await import('../navigation-data.mjs');
 const legacy=new RobotLearner(null,42,{terrain:'meadow',courseVersion:10,visionVersion:3,bodyVersion:6,validationSeconds:6,monitorSeconds:6}).snapshot();
 Object.assign(legacy,{version:6,physicsVersion:5,policyKind:'direct-torque-12joint-mlp-v6',attempts:1234,taskAttempts:{balance:1234,recover:0,walk:0,run:0,obstacles:0},algorithmAttempts:{cem:0,ppo:1234}});
 delete legacy.environment.controlKind;delete legacy.controllerArchive;
 legacy.weights[624]=.2;
 const original=JSON.parse(JSON.stringify(legacy));
 let row={id:'main',model:original,revision:1},posts=0;
 const base=process.env.ROBOT_BASE_URL||'http://127.0.0.1:8000';
 const proxy=base.startsWith('https:')?(process.env.HTTPS_PROXY||process.env.HTTP_PROXY):null;
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox'],...(proxy?{proxy:{server:proxy}}:{})});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/rest/v1/**',async route=>{
   const req=route.request();
   if(req.url().includes('/site_navigation'))return route.fulfill({json:[{id:'main',menus:DEFAULT_MENUS,revision:1}]});
   assert.ok(req.url().includes('/robot_shared_model'));
   if(req.method()==='POST'){row={...row,model:req.postDataJSON().model,revision:row.revision+1};posts++;}
   const keys=new URL(req.url()).searchParams.get('select')?.split(',');
   return route.fulfill({json:[keys?Object.fromEntries(keys.map(k=>[k,row[k]])):row]});
  });
  await page.addInitScript(()=>{
   if(!localStorage.getItem('mydesk.robot.options')){
    localStorage.setItem('mydesk.robot.options',JSON.stringify({trainingSeconds:1,validationSeconds:6,monitorSeconds:6,autoPush:false}));
    localStorage.setItem('calendar-preservation-sentinel','unchanged');
   }
   window.__done=false;window.__requests=[];
   const Native=Worker;
   window.Worker=class extends Native{
    constructor(...args){super(...args);this.addEventListener('message',e=>{
     if(e.data.type==='progress'&&e.data.completed>=2)super.postMessage({type:'stop'});
     if(e.data.type==='done')window.__done=true;
    });}
    postMessage(data,...args){if(data.type==='train')window.__requests.push(data);return super.postMessage(data,...args);}
   };
  });
  const ready=()=>page.waitForFunction(()=>!document.querySelector('#rb-train').disabled,null,{timeout:120000});
  const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('mydesk.robot.v6')).model);
  await page.goto(base+'/robot.html?verify=robot49-target');await ready();
  let model=await saved();
  assert.equal(model.version,7);assert.equal(model.attempts,1234);assert.ok(model.weights.every(v=>v===0));
  assert.deepEqual(model.controllerArchive.model,original);assert.equal(posts,0);
  assert.ok(await page.locator('#rb-log').textContent().then(s=>s.includes('목표 각도 + PD')));
  await page.locator('#rb-run').click();
  await page.waitForTimeout(400);
  await page.locator('#rb-train').click();
  await page.waitForFunction(()=>window.__done,null,{timeout:120000});await ready();
  model=await saved();assert.ok(model.attempts>1234&&model.attempts<=1244);
  assert.equal(model.policyKind,'joint-target-pd-12joint-mlp-v7');
  assert.deepEqual(model.controllerArchive.model,original);assert.ok(model.ppo);
  assert.equal(row.model.attempts,model.attempts);assert.ok(posts>0);
  const count=model.attempts,weights=model.weights,ppo=model.ppo;
  await page.reload();await ready();model=await saved();
  assert.equal(model.attempts,count);assert.deepEqual(model.weights,weights);assert.deepEqual(model.ppo,ppo);
  assert.deepEqual(model.controllerArchive.model,original);
  assert.equal(await page.evaluate(()=>localStorage.getItem('calendar-preservation-sentinel')),'unchanged');
  for(const viewport of [{width:390,height:844},{width:1080,height:720}]){
   await page.setViewportSize(viewport);await page.waitForTimeout(150);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.screenshot({path:'/tmp/robot49-target-'+viewport.width+'.png'});
  }
  assert.deepEqual(errors,[]);
  console.log('PASS legacy torque archive/counters, real PPO worker training with target controller, model execution, shared roundtrip and reload, mobile/desktop layout; all data APIs isolated.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
