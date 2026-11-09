// Run against local or deployed assets. All shared data requests are intercepted.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{
 const {RobotLearner}=await import('../robot-learning.mjs'),{DEFAULT_MENUS}=await import('../navigation-data.mjs');
 const fixture=new RobotLearner(null,42).snapshot();fixture.rewardVersion=6;fixture.attempts=12345;fixture.taskAttempts.walk=12345;fixture.focus='walk';fixture.algorithmAttempts.ppo=12345;fixture.history.forEach(r=>r.rewardVersion=6);fixture.abilities.walk.meanReward=370;for(const c of fixture.abilities.walk.cases)for(const key of ['walkingTime','supportedDistance','finalUpright','stableTime'])delete c.metrics[key];
 const base=process.env.ROBOT_BASE_URL||'http://127.0.0.1:8000',proxy=base.startsWith('https:')?(process.env.HTTPS_PROXY||process.env.HTTP_PROXY):null;
 const b=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox'],...(proxy?{proxy:{server:proxy}}:{})});
 try{
 const p=await b.newPage({viewport:{width:1280,height:900},ignoreHTTPSErrors:true}),errors=[];p.on('pageerror',e=>errors.push(e.message));let row={id:'main',model:fixture,revision:1},requests=0;
 await p.route('**/rest/v1/**',async route=>{const r=route.request();requests++;if(r.url().includes('/site_navigation'))return route.fulfill({json:[{id:'main',menus:DEFAULT_MENUS,revision:1}]});assert.ok(r.url().includes('/robot_shared_model'),'unexpected API');if(r.method()==='POST')row={...row,model:r.postDataJSON().model,revision:row.revision+1};const keys=new URL(r.url()).searchParams.get('select')?.split(',');await route.fulfill({json:[keys?Object.fromEntries(keys.map(k=>[k,row[k]])):row]});});
 await p.goto(base+'/robot.html?verify=robot37');await p.waitForFunction(()=>!document.querySelector('#rb-train').disabled,null,{timeout:120000});
 const model=await p.evaluate(()=>JSON.parse(localStorage.getItem('mydesk.robot.v5')).model);assert.equal(model.rewardVersion,8);assert.equal(model.attempts,12345);assert.deepEqual(model.weights,fixture.weights);assert.notEqual(model.abilities.walk.meanReward,370);assert.ok(model.history.some(r=>r.rewardVersion===6));assert.ok(model.history.some(r=>r.rewardVersion===8));
 assert.equal(await p.locator('#rb-count').inputValue(),'10000');assert.equal(await p.locator('#rb-focus').inputValue(),'walk');assert.ok(model.abilities.walk.cases.every(c=>Number.isFinite(c.metrics.walkingTime)));for(const stage of ['balance','recover','walk','run','obstacles']){await p.locator('#rb-focus').selectOption(stage);assert.equal(await p.locator('#rb-count').inputValue(),'10000');}assert.ok((await p.locator('#rb-reward-tasks').textContent()).includes('지지 품질을 반영한 순전진'));
 const help=await p.locator('#rb-reward-common').textContent();assert.ok(help.includes('−30'));assert.ok(help.includes('−8'));assert.ok(help.includes('누적 점수'));assert.ok(help.includes('일어서기와 이동 과제의 회복 보상은 유지'));
 await p.setViewportSize({width:390,height:844});await p.waitForTimeout(400);assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.screenshot({path:'/tmp/robot37-mobile.png'});assert.deepEqual(errors,[]);assert.ok(requests>=2);
 console.log('PASS actual worker walk migration/re-evaluation, preserved weights/counts/history, 10000 default across all skills, walk help and mobile layout. All shared APIs mocked.');
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exit(1)});
