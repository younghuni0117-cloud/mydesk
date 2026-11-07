export class RobotSync {
 constructor(config,{fetcher=globalThis.fetch,storage=globalThis.localStorage,onRemote=()=>{},onState=()=>{},onConflict=()=>{},onIdentity=()=>{},onEmpty=()=>{},onSaved=()=>{},validate=()=>true}={}){
  this.config=config;this.fetch=fetcher;this.storage=storage;this.onRemote=onRemote;this.onState=onState;this.onConflict=onConflict;this.validate=validate;this.onIdentity=onIdentity;this.onEmpty=onEmpty;this.onSaved=onSaved;this.session=null;this.baseRevision=0;this.pending=null;this.busy=false;this.conflict=null;this.timer=null;this.pollTimer=null;
  this.enabled=Boolean(config.url&&config.publishableKey);if(this.enabled&&!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(config.url))throw Error('잘못된 동기화 서버 주소');
 }
 state(text){this.onState(text)}
 async request(path,options={}){
  const response=await this.fetch(this.config.url+path,{...options,headers:{apikey:this.config.publishableKey,...(this.session?{Authorization:`Bearer ${this.session.access_token}`}:{ }),'Content-Type':'application/json',...options.headers}});
  const body=await response.json().catch(()=>null);if(!response.ok){const error=new Error(body?.msg||body?.message||'서버 연결에 실패했습니다.');error.status=response.status;throw error;}return body;
 }
 saveSession(){if(this.session)this.storage.setItem('mydesk.robot.auth',JSON.stringify(this.session));else this.storage.removeItem('mydesk.robot.auth')}
 async start(hash=''){
  if(!this.enabled){this.state('자동 동기화 서버 연결 대기 · 현재 기기에 저장');return;}
  try{
   const params=new URLSearchParams(hash.replace(/^#/,''));if(params.get('access_token')){this.session={access_token:params.get('access_token'),refresh_token:params.get('refresh_token'),expires_at:Math.floor(Date.now()/1000)+Number(params.get('expires_in')||3600)};}
   else{this.session=JSON.parse(this.storage.getItem('mydesk.robot.auth')||'null');}
   if(!this.session){this.state('로그인하면 기기 간 자동 공유');return;}
   await this.refresh();const user=await this.request('/auth/v1/user');this.session.user=user;this.saveSession();this.onIdentity(user.id);await this.pull();
   clearInterval(this.pollTimer);this.pollTimer=setInterval(()=>this.pull().catch(()=>this.state('오프라인 · 기기 저장 유지')),15000);
  }catch{this.state('로그인 또는 서버 연결을 확인해 주세요. 기기 저장은 유지됩니다.');}
 }
 async refresh(){if(this.session&&this.session.expires_at<Date.now()/1000+60){const data=await this.request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:this.session.refresh_token})});this.session={...data,expires_at:Math.floor(Date.now()/1000)+data.expires_in};this.saveSession();}}
 async login(email,redirect){if(!this.enabled)throw Error('저장 서버가 아직 연결되지 않았습니다.');await this.request('/auth/v1/otp?redirect_to='+encodeURIComponent(redirect),{method:'POST',body:JSON.stringify({email,create_user:true})});this.state('이메일의 로그인 링크를 이 기기에서 열어주세요.');}
 async verify(email,token){const data=await this.request('/auth/v1/verify',{method:'POST',body:JSON.stringify({email,token,type:'email'})});this.session={...data,expires_at:Math.floor(Date.now()/1000)+data.expires_in};this.saveSession();await this.start();}
 async pull(){
  if(!this.session?.user||this.busy||this.conflict)return;await this.refresh();const uid=this.session.user.id;
  const rows=await this.request('/rest/v1/robot_models?select=revision,model,updated_at&user_id=eq.'+encodeURIComponent(uid));const remote=rows?.[0];
  if(!remote){this.baseRevision=0;this.state('계정 연결됨 · 학습 모델 저장 준비');this.onEmpty();if(this.pending)await this.flush();return;}
  if(!this.validate(remote.model))throw Error('지원하지 않는 서버 모델입니다.');
  if(remote.revision===this.baseRevision){if(this.pending)await this.flush();return;}
  if(this.pending){this.conflict=remote;this.state('다른 기기의 새 모델과 충돌 · 선택 필요');this.onConflict(remote,this.pending);return;}
  this.baseRevision=remote.revision;this.onRemote(remote.model,remote);this.state(`동기화 완료 · ${remote.model.attempts.toLocaleString()}회 · 버전 ${remote.revision}`);
 }
 queue(model){this.pending=structuredClone(model);if(!this.enabled||!this.session?.user){this.state(this.enabled?'기기 저장 완료 · 로그인 전':'기기 저장 완료 · 자동 공유 연결 대기');return;}clearTimeout(this.timer);this.timer=setTimeout(()=>this.flush().catch(()=>this.state('서버 저장 대기 · 기기 저장 유지')),10000);}
 async flush(){
  if(!this.pending||!this.session?.user||this.busy||this.conflict)return;this.busy=true;
  const model=this.pending,expected=this.baseRevision;try{
   await this.refresh();const uid=this.session.user.id,revision=expected+1;
   const payload={user_id:uid,revision,model,updated_at:new Date().toISOString()};
   const rows=expected===0?await this.request('/rest/v1/robot_models',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(payload)}):await this.request(`/rest/v1/robot_models?user_id=eq.${encodeURIComponent(uid)}&revision=eq.${expected}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(payload)});
   if(!rows?.length){this.busy=false;await this.pull();return;}
   this.baseRevision=revision;if(this.pending===model)this.pending=null;this.onSaved(model,revision);this.state(`동기화 완료 · ${model.attempts.toLocaleString()}회 · 버전 ${revision}`);
  }catch(error){if(error.status===409){this.busy=false;await this.pull();return;}throw error;}finally{this.busy=false;}
 }
 async resolve(useLocal){const remote=this.conflict;if(!remote)return;this.conflict=null;this.baseRevision=remote.revision;if(useLocal)await this.flush();else{this.pending=null;this.onRemote(remote.model,remote);this.state('다른 기기의 모델을 불러왔습니다.');}}
 async logout(){clearInterval(this.pollTimer);clearTimeout(this.timer);if(this.session)try{await this.request('/auth/v1/logout',{method:'POST'})}catch{}this.session=null;this.pending=null;this.conflict=null;this.baseRevision=0;this.saveSession();this.state('로그아웃 · 현재 기기 모델 유지');}
}
