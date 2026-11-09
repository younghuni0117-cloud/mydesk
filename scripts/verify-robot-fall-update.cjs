// Run against local or deployed assets. All shared data requests are intercepted.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{
 const {RobotLearner}=await import('../robot-learning.mjs'),{DEFAULT_MENUS}=await import('../navigation-data.mjs');
 const fixture=new RobotLearner(null,42).snapshot();fixture.rewardVersion=5;fixture.attempts=12345;fixture.taskAttempts.balance=12345;fixture.algorithmAttempts.ppo=12345;fixture.history.forEach(r=>r.rewardVersion=5);fixture.abilities.balance.meanReward=370;
 const base=process.env.ROBOT_BASE_URL||'http://127.0.0.1:8000',proxy=base.startsWith('https:')?(process.env.HTTPS_PROXY||process.env.HTTP_PROXY):null;
 const b=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox'],...(proxy?{proxy:{server:proxy}}:{})});
 try{
 const p=await b.newPage({viewport:{width:1280,height:900},ignoreHTTPSErrors:true}),errors=[];p.on('pageerror',e=>errors.push(e.message));let row={id:'main',model:fixture,revision:1},requests=0;
 await p.route('**/rest/v1/**',async route=>{const r=route.request();requests++;if(r.url().includes('/site_navigation'))return route.fulfill({json:[{id:'main',menus:DEFAULT_MENUS,revision:1}]});assert.ok(r.url().includes('/robot_shared_model'),'unexpected API');if(r.method()==='POST')row={...row,model:r.postDataJSON().model,revision:row.revision+1};const keys=new URL(r.url()).searchParams.get('select')?.split(',');await route.fulfill({json:[keys?Object.fromEntries(keys.map(k=>[k,row[k]])):row]});});
 await p.goto(base+'/robot.html?verify=robot36');await p.waitForFunction(()=>!document.querySelector('#rb-train').disabled,null,{timeout:120000});
 const model=await p.evaluate(()=>JSON.parse(localStorage.getItem('mydesk.robot.v5')).model);assert.equal(model.rewardVersion,8);assert.equal(model.attempts,12345);assert.deepEqual(model.weights,fixture.weights);assert.notEqual(model.abilities.balance.meanReward,370);assert.ok(model.history.some(r=>r.rewardVersion===5));assert.ok(model.history.some(r=>r.rewardVersion===8));
 const help=await p.locator('#rb-reward-common').textContent();assert.ok(help.includes('−30'));assert.ok(help.includes('−8'));assert.ok(help.includes('누적 점수'));assert.ok(help.includes('일어서기와 이동 과제의 회복 보상은 유지'));
 await p.setViewportSize({width:390,height:844});await p.waitForTimeout(400);assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.screenshot({path:'/tmp/robot36-mobile.png'});assert.deepEqual(errors,[]);assert.ok(requests>=2);
 console.log('PASS actual worker migration/re-evaluation; weights, counts and previous graph retained; new fall help; mobile layout. All shared APIs mocked.');
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exit(1)});
