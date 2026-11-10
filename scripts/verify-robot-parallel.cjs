// Real coordinator + nested physics workers. Every data endpoint is isolated.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{
 const {RobotLearner}=await import('../robot-learning.mjs'),{DEFAULT_MENUS}=await import('../navigation-data.mjs'),{loadTaskSettings,taskEnvironments}=await import('../robot-task-settings.mjs');
 const taskSettings=loadTaskSettings({});for(const profile of Object.values(taskSettings)){profile.trainingSeconds=1;profile.validationSeconds=6;profile.monitorSeconds=10;profile.balanceEarlyStop=false;profile.curriculum=false;profile.autoPush=false;}
 const fixture=new RobotLearner(null,42,{terrain:'meadow',courseVersion:10,visionVersion:3,bodyVersion:6,taskEnvironments:taskEnvironments(taskSettings)}).snapshot();fixture.taskSettings=taskSettings;
 fixture.attempts=321;fixture.taskAttempts.balance=321;fixture.algorithmAttempts.ppo=321;
 let row={id:'main',model:fixture,revision:1};
 const base=process.env.ROBOT_BASE_URL||'http://127.0.0.1:8000',proxy=base.startsWith('https:')?(process.env.HTTPS_PROXY||process.env.HTTP_PROXY):null;
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox'],...(proxy?{proxy:{server:proxy}}:{})});
 try{
  const p=await browser.newPage({viewport:{width:1080,height:720}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.route('**/rest/v1/**',route=>{const request=route.request();if(request.url().includes('/site_navigation'))return route.fulfill({json:[{id:'main',menus:DEFAULT_MENUS,revision:1}]});assert.ok(request.url().includes('/robot_shared_model'));if(request.method()==='POST')row={...row,model:request.postDataJSON().model,revision:row.revision+1};const keys=new URL(request.url()).searchParams.get('select')?.split(',');return route.fulfill({json:[keys?Object.fromEntries(keys.map(k=>[k,row[k]])):row]});});
  await p.addInitScript(({taskSettings})=>{
   if(!localStorage.getItem('mydesk.robot.options'))localStorage.setItem('mydesk.robot.options',JSON.stringify({focus:'balance',robots:1,taskSettingsVersion:1,taskSettings}));
   const Native=Worker;window.__messages=[];window.__workers=[];window.__stopAfter=0;window.Worker=class extends Native{constructor(...args){super(...args);window.__workers.push(this);this.addEventListener('message',({data})=>{window.__messages.push(data);if(data.type==='progress'&&window.__stopAfter&&data.completed>=window.__stopAfter){window.__stopAfter=0;this.postMessage({type:'stop'});}});}};
   window.__spriteDraws=[];const draw=CanvasRenderingContext2D.prototype.drawImage;CanvasRenderingContext2D.prototype.drawImage=function(...args){if(this.canvas.id==='rb-canvas'){const m=this.getTransform();window.__spriteDraws.push({alpha:this.globalAlpha,x:m.e,y:m.f});if(window.__spriteDraws.length>3000)window.__spriteDraws.splice(0,1000);}return draw.apply(this,args);};
  },{taskSettings});
  const ready=()=>p.waitForFunction(()=>!document.querySelector('#rb-train').disabled,null,{timeout:180000});
  await p.goto(base+'/robot.html?verify=robot53');await ready();await p.locator('#rb-details').evaluate(e=>e.open=true);
  assert.equal(await p.locator('#rb-robots').inputValue(),'1');assert.equal(await p.locator('#rb-robots option').count(),5);
  await p.locator('#rb-robots').selectOption('5');await ready();
  assert.equal(await p.evaluate(()=>window.__messages.filter(m=>m.type==='ready').at(-1).parallelism),5);
  assert.equal(row.model.id,fixture.id);assert.equal(row.model.attempts,321);assert.deepEqual(row.model.weights,fixture.weights);
  // On the same origin, four ghosts render behind one opaque representative.
  await p.evaluate(()=>window.__spriteDraws=[]);await p.waitForFunction(()=>window.__spriteDraws.some(r=>Math.abs(r.alpha-.18)<.001)&&window.__spriteDraws.some(r=>r.alpha===1));
  const draws=await p.evaluate(()=>window.__spriteDraws);assert.ok(draws.some(r=>Math.abs(r.alpha-.18)<.001));
  await p.locator('#rb-details').evaluate(e=>e.open=false);await p.screenshot({path:'/tmp/robot53-desktop.png'});
  await p.locator('#rb-count').selectOption('100');await p.evaluate(()=>window.__stopAfter=5);await p.locator('#rb-train').click();
  await p.waitForFunction(()=>window.__messages.some(m=>m.type==='done'),null,{timeout:180000});await ready();
  const messages=await p.evaluate(()=>window.__messages),done=messages.filter(m=>m.type==='done').at(-1),model=messages.filter(m=>m.type==='model').at(-1).model,preview=messages.filter(m=>m.type==='preview'&&m.scenes?.length===5).at(-1);
  assert.ok(done.completed>=5&&done.completed<=10&&done.completed%5===0);const total=321+done.completed;assert.equal(model.attempts,total);assert.equal(model.taskAttempts.balance,total);assert.equal(model.algorithmAttempts.ppo,total);assert.equal(model.id,fixture.id);assert.ok(RobotLearner.valid(model));assert.equal(preview.scenes.length,5);assert.ok(preview.scenes.every(s=>s.trace.length>0));assert.notDeepEqual(preview.scenes[0].trace,preview.scenes[1].trace);assert.equal(model.ppo.buffer.length,done.completed*20);
  await p.locator('#rb-run').click();await p.waitForTimeout(200);await p.setViewportSize({width:390,height:844});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.screenshot({path:'/tmp/robot53-mobile.png'});
  await p.reload();await ready();await p.locator('#rb-details').evaluate(e=>e.open=true);assert.equal(await p.locator('#rb-robots').inputValue(),'5');
  await p.locator('#rb-task-defaults').click();await ready();assert.equal(await p.locator('#rb-robots').inputValue(),'5');assert.equal(row.model.attempts,total);
  await p.locator('#rb-robots').selectOption('1');await ready();assert.equal(await p.evaluate(()=>window.__messages.filter(m=>m.type==='ready').at(-1).parallelism),1);assert.equal(row.model.attempts,total);
  await p.evaluate(()=>window.__spriteDraws=[]);await p.waitForTimeout(200);assert.ok((await p.evaluate(()=>window.__spriteDraws)).every(r=>r.alpha!==.18));assert.deepEqual(errors,[]);
  console.log('PASS 1–5 device-persistent selection, real five-worker PPO collection into one existing model, all in-flight attempts counted after stop, five distinct actual traces, transparent overlapping ghosts behind representative, retained learning on count change/reset/reload, mobile/desktop layout; all APIs isolated.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
