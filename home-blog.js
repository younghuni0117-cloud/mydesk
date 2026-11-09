import {SHARED_MODEL_URL,SHARED_MODEL_KEY} from './robot-shared-config.mjs';
const list=document.querySelector('.resource-list');
if(list){
 try{
  const response=await fetch(SHARED_MODEL_URL.replace(/robot_shared_model$/,'blog_posts')+'?select=id,title,summary,category,topic&order=created_at.desc,id.asc',{headers:{apikey:SHARED_MODEL_KEY}});
  if(!response.ok)throw Error('Unavailable');
  const posts=await response.json(),topics=[...new Map(posts.map(p=>[p.category+'\0'+p.topic,{category:p.category,topic:p.topic}])).values()];
  const template=list.querySelector('a')?.cloneNode(true);
  list.replaceChildren();
  for(const post of posts.slice(0,3)){
   const a=template?.cloneNode(true)||document.createElement('a');a.href='blog.html?post='+encodeURIComponent(post.id);
   if(template){a.querySelector('h3').textContent=post.title;a.querySelector('p').textContent=post.summary;a.querySelector('.row-category').textContent=post.topic;}else a.textContent=post.title;
   list.append(a);
  }
  if(!posts.length){const p=document.createElement('p');p.textContent='아직 등록된 글이 없습니다.';list.append(p);}
  try{localStorage.setItem('mydesk.blog.topics',JSON.stringify(topics));}catch{}
  window.dispatchEvent(new CustomEvent('blog-topics',{detail:topics}));
 }catch{/* Existing article links remain usable during a temporary outage. */}
}
