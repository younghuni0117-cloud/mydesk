import {SHARED_MODEL_URL,SHARED_MODEL_KEY} from './robot-shared-config.mjs';
const $=id=>document.getElementById(id),storageKey='mydesk.blog.management';
const rpcBase=SHARED_MODEL_URL.replace(/robot_shared_model$/,'rpc/');
export class BlogManagement {
 constructor({onChange,canDisconnect=()=>true}){
  this.onChange=onChange;this.canDisconnect=canDisconnect;this.token='';this.connected=false;this.passwordSet=false;this.busy=false;
  $('manage-login-form').addEventListener('submit',e=>{e.preventDefault();this.login();});
  $('manage-key-connect').onclick=()=>this.connectLegacy();
  $('manage-password-open').onclick=()=>{$('manage-password-form').hidden=!$('manage-password-form').hidden;if(!$('manage-password-form').hidden)$('manage-new-password').focus();};
  $('manage-password-form').addEventListener('submit',e=>{e.preventDefault();this.setPassword();});
  $('manage-disconnect').onclick=()=>this.disconnect();
  $('manage-close').onclick=()=>{if(!this.busy)$('manage-dialog').close();};
  $('manage-dialog').addEventListener('cancel',e=>{if(this.busy)e.preventDefault();});
  $('manage-dialog').addEventListener('close',()=>this.clearFields());
 }
 message(text,success=false){$('manage-error').textContent=text;$('manage-error').classList.toggle('is-success',success);}
 clearFields(){for(const id of ['manage-password','manage-key','manage-new-password','manage-confirm-password'])$(id).value='';}
 updateUI(){
  $('manage-login-form').hidden=this.connected;$('manage-settings').hidden=!this.connected;
  $('manage-password-open').textContent=this.passwordSet?'비밀번호 변경':'비밀번호 설정';
  $('manage-connected-text').textContent=this.passwordSet?'이 브라우저에서 글을 관리할 수 있습니다.':'기존 관리 키로 연결되었습니다. 기억하기 쉬운 비밀번호를 설정해 주세요.';
  $('manage-legacy').open=!this.passwordSet;
  this.onChange(this.connected?this.token:'');
 }
 persist(){try{if(this.token)localStorage.setItem(storageKey,this.token);else localStorage.removeItem(storageKey);}catch{}}
 async request(name,args={},token=this.token){
  const response=await fetch(rpcBase+'blog_management_'+name,{method:'POST',headers:{apikey:SHARED_MODEL_KEY,'Content-Type':'application/json','x-client-info':token?'mydesk-blog/'+token:'mydesk-blog-reader'},body:JSON.stringify(args)});
  if(!response.ok)throw Error('관리 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.');
  return response.json();
 }
 async run(action){
  if(this.busy)return;this.busy=true;
  for(const button of $('manage-dialog').querySelectorAll('button'))button.disabled=true;
  try{await action();}catch(error){this.message(error.message);}
  finally{this.busy=false;for(const button of $('manage-dialog').querySelectorAll('button'))button.disabled=false;}
 }
 async verify(){
  const state=await this.request('status');this.connected=state.connected===true;this.passwordSet=state.password_set===true;
  if(!this.connected){this.token='';this.persist();}
  this.updateUI();return this.connected;
 }
 async init(){
  try{this.token=localStorage.getItem(storageKey)||'';}catch{}
  const fragment=new URLSearchParams(location.hash.slice(1)),incoming=fragment.get('manage');
  if(incoming&&/^[A-Za-z0-9_-]{43}$/.test(incoming)){this.token=incoming;fragment.delete('manage');history.replaceState(null,'',location.pathname+location.search+(fragment.size?'#'+fragment:''));}
  try{await this.verify();this.persist();}catch{this.connected=false;this.updateUI();}
 }
 async open(){
  this.message('');$('manage-password-form').hidden=true;this.clearFields();$('manage-dialog').showModal();
  await this.run(async()=>{await this.verify();if(!this.connected)$('manage-password').focus();});
 }
 async login(){await this.run(async()=>{
  const result=await this.request('login',{password:$('manage-password').value},'');
  if(!result.ok){this.message(result.message);return;}
  this.token=result.token;this.connected=true;this.passwordSet=true;this.persist();this.clearFields();this.updateUI();$('manage-dialog').close();
 });}
 async connectLegacy(){await this.run(async()=>{
  let value=$('manage-key').value.trim();try{value=new URLSearchParams(new URL(value).hash.slice(1)).get('manage')||value;}catch{}
  if(!/^[A-Za-z0-9_-]{43}$/.test(value)){this.message('기존 관리 링크 또는 관리 키를 입력해 주세요.');return;}
  const state=await this.request('status',{},value);
  if(!state.connected){this.message(state.password_set?'이전 관리 키는 해제되었습니다. 설정한 비밀번호로 연결해 주세요.':'관리 키가 맞지 않습니다.');return;}
  this.token=value;this.connected=true;this.passwordSet=state.password_set;this.persist();this.clearFields();this.updateUI();this.message('관리 키로 연결했습니다. 비밀번호를 설정할 수 있습니다.',true);
 });}
 async setPassword(){await this.run(async()=>{
  const password=$('manage-new-password').value,confirm=$('manage-confirm-password').value;
  if(password!==confirm){this.message('새 비밀번호와 확인 입력이 일치하지 않습니다.');return;}
  if(password.length<8||new TextEncoder().encode(password).length>72){this.message('비밀번호는 8자 이상, 영문 72자 이내로 입력해 주세요. 한글은 24자 이내로 입력해 주세요.');return;}
  const result=await this.request('set_password',{new_password:password});
  if(!result.ok){this.message(result.message);return;}
  this.token=result.token;this.connected=true;this.passwordSet=true;this.persist();this.clearFields();$('manage-password-form').hidden=true;this.updateUI();this.message('비밀번호를 저장했습니다. 다른 브라우저에서는 이 비밀번호로 연결해 주세요.',true);
 });}
 async disconnect(){
  if(!this.canDisconnect())return;
  await this.run(async()=>{
   await this.request('logout');this.token='';this.connected=false;this.persist();this.clearFields();this.updateUI();this.message('이 브라우저의 관리 연결을 해제했습니다.');
  });
 }
}
