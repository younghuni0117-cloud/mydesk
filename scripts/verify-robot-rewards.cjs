// Exercise multi-robot reward painting with isolated shared data and real physics.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{
 const {RobotLearner}=await import('../robot-learning.mjs'),{DEFAULT_MENUS}=await import('../navigation-data.mjs'),{loadTaskSettings,taskEnvironments}=await import('../robot-task-settings.mjs');
 const taskSettings=loadTaskSettings({});for(const s of Object.values(taskSettings)){s.validationSeconds=6;s.monitorSeconds=10;}
 const fixture=new RobotLearner(null,42,{terrain:'meadow',courseVersion:10,visionVersion:3,bodyVersion:6,taskEnvironments:taskEnvironments(taskSettings)}).snapshot();fixture.taskSettings=taskSettings;fixture.attempts=321;fixture.taskAttempts.balance=321;fixture.algorithmAttempts.ppo=321;
 let row={id:'main',model:fixture,revision:1};const base=process.env.ROBOT_BASE_URL||'http://127.0.0.1:8000',proxy=base.startsWith('https:')?(process.env.HTTPS_PROXY||process.env.HTTP_PROXY):null;
 const b=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox'],...(proxy?{proxy:{server:proxy}}:{})});
 try{
  const p=await b.newPage({viewport:{width:1080,height:720}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.route('**/rest/v1/**',route=>{const r=route.request();if(r.url().includes('/site_navigation'))return route.fulfill({json:[{id:'main',menus:DEFAULT_MENUS,revision:1}]});assert.ok(r.url().includes('/robot_shared_model'));if(r.method()==='POST')row={...row,model:r.postDataJSON().model,revision:row.revision+1};const keys=new URL(r.url()).searchParams.get('select')?.split(',');return route.fulfill({json:[keys?Object.fromEntries(keys.map(k=>[k,row[k]])):row]});});
  await p.addInitScript(taskSettings=>{
   if(!localStorage.getItem('mydesk.robot.options'))localStorage.setItem('mydesk.robot.options',JSON.stringify({robots:5,focus:'balance',taskSettingsVersion:1,taskSettings}));
   const Native=Worker;window.__workers=[];window.Worker=class extends Native{constructor(...args){super(...args);window.__workers.push(this);}};
   window.__scores=[];const fill=CanvasRenderingContext2D.prototype.fillText;
   CanvasRenderingContext2D.prototype.fillText=function(value,x,y,...args){if(this.canvas.id==='rb-canvas'&&['#477fbd','#cb4850'].includes(this.fillStyle)&&this.font.includes('600 10px')){window.__scores.push({text:String(value),x,y,color:this.fillStyle});if(window.__scores.length>2000)window.__scores.splice(0,1000);}return fill.call(this,value,x,y,...args);};
   window.__injectRewards=async()=>{
    const {RobotWorld,robotGeometry,POLICY_SIZE}=await import(new URL('./robot-core.mjs?v=robot55',location.href));
    const world=new RobotWorld('balance',{terrain:'meadow',autoPush:false,spawnRange:0,spawnTilt:0}),pose=world.snapshot(),point=name=>{const p=world.parts[name].getPosition();return [p.x,p.y];};
    const scenes=Array.from({length:5},(_,i)=>{const rewardEvents=[{id:1,time:0,value:3+i,body:'head',point:point('head')},{id:2,time:0,value:-3-i,body:'torso',point:point('torso')}],frame={...pose,rewardEvents};return {...robotGeometry(world),terrain:world.terrain,obstacles:world.obstacles,metrics:{...world.metrics(),time:1},trace:[{...frame,time:0},{...frame,time:1}]};});
    const worker=window.__workers.at(-1);worker.dispatchEvent(new MessageEvent('message',{data:{type:'training',active:true}}));worker.dispatchEvent(new MessageEvent('message',{data:{type:'preview',stage:'balance',source:'candidate',weights:Array(POLICY_SIZE).fill(0),policyVersion:0,attempts:321,scene:scenes[0],scenes,team:5}}));document.querySelector('#rb-preview').click();
   };
  },taskSettings);
  const ready=()=>p.waitForFunction(()=>!document.querySelector('#rb-train').disabled,null,{timeout:180000});
  const fiveScores=()=>p.waitForFunction(()=>[3,4,5,6,7].every(n=>window.__scores.some(s=>s.text==='+'+n)&&window.__scores.some(s=>s.text==='−'+n)),null,{timeout:10000});
  await p.goto(base+'/robot.html?verify=robot55-rewards');await ready();await p.locator('#rb-details').evaluate(e=>e.open=true);
  assert.ok(await p.locator('#rb-reward-visible').isChecked());assert.equal(await p.locator('#rb-focus option[value=recover]').textContent(),'일어나기');assert.equal(await p.locator('#rb-abilities tr').nth(1).locator('th').textContent(),'일어나기');
  await p.evaluate(()=>{window.__scores=[];return window.__injectRewards();});await fiveScores();
  const marks=await p.evaluate(()=>[3,4,5,6,7].map(n=>window.__scores.find(s=>s.text==='+'+n)));for(let i=1;i<marks.length;i++)assert.ok(marks[i].x-marks[i-1].x>80);
  await p.locator('#rb-pause-view').click();await p.screenshot({path:'/tmp/robot55-rewards-desktop.png'});
  await p.locator('#rb-reward-visible').uncheck();await p.evaluate(()=>window.__scores=[]);await p.waitForTimeout(350);assert.deepEqual(await p.evaluate(()=>window.__scores),[]);
  assert.ok(Number(await p.locator('#rb-positive-total').textContent().then(s=>s.replace('+','')))>=0);assert.equal(row.model.id,fixture.id);assert.equal(row.model.attempts,321);assert.deepEqual(row.model.weights,fixture.weights);
  await p.reload();await ready();await p.locator('#rb-details').evaluate(e=>e.open=true);assert.equal(await p.locator('#rb-reward-visible').isChecked(),false);await p.evaluate(()=>window.__scores=[]);await p.waitForTimeout(400);assert.deepEqual(await p.evaluate(()=>window.__scores),[]);
  await p.locator('#rb-reward-visible').check();await p.locator('#rb-run').click();await p.evaluate(()=>window.__scores=[]);await p.waitForFunction(()=>window.__scores.length&&Math.max(...window.__scores.map(s=>s.x))-Math.min(...window.__scores.map(s=>s.x))>350,null,{timeout:10000});
  await p.setViewportSize({width:390,height:844});await p.evaluate(()=>{window.__scores=[];return window.__injectRewards();});await fiveScores();assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.locator('#rb-details').evaluate(e=>e.open=false);await p.screenshot({path:'/tmp/robot55-rewards-mobile.png'});
  assert.equal(row.model.attempts,321);assert.deepEqual(errors,[]);console.log('PASS all five robots show their own positive/negative values at offset positions in training replay and live execution; global show/hide works during training and persists across reload; reward/model data retained; 일어나기 label; desktop/mobile layout. All data APIs isolated.');
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exit(1);});
