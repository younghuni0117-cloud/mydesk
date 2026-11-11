import {loadNavigation,navigationState} from './site-navigation.mjs?v=update69';
import {postMenuId} from './navigation-data.mjs?v=update69';
import {SHARED_MODEL_URL,SHARED_MODEL_KEY} from './robot-shared-config.mjs';
const list=document.querySelector('.resource-list');
if(list){
 try{
  await loadNavigation();
  const response=await fetch(SHARED_MODEL_URL.replace(/robot_shared_model$/,'blog_posts')+'?select=id,title,summary,category,topic,menu_id,is_private&order=created_at.desc,id.asc',{cache:'no-store',headers:{apikey:SHARED_MODEL_KEY}});
  if(!response.ok)throw Error('Unavailable');
  const posts=await response.json();
  const template=document.getElementById('home-post-template')?.content.firstElementChild?.cloneNode(true);
  list.replaceChildren();
  for(const post of posts.slice(0,3)){
   const a=template?.cloneNode(true)||document.createElement('a');a.href='blog.html?post='+encodeURIComponent(post.id);
   if(template){a.querySelector('h3').textContent=(post.is_private?'🔒 ':'')+post.title;a.querySelector('p').textContent=post.summary;a.querySelector('.row-category').textContent=navigationState().menus.find(m=>m.id===postMenuId(post))?.label||post.topic;}else a.textContent=(post.is_private?'🔒 ':'')+post.title;
   list.append(a);
  }
  if(!posts.length){const p=document.createElement('p');p.textContent='아직 등록된 글이 없습니다.';list.append(p);}

 }catch{list.replaceChildren();const p=document.createElement('p');p.textContent='글을 불러오지 못했습니다. 잠시 후 새로고침해 주세요.';list.append(p);}
}
