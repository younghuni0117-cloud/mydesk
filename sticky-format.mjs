import {TEXT_COLORS,FONT_SIZES,textStyle} from './sticky-data.mjs?v=format1';
export function applyTextFormat(element,note){const f=textStyle(note);element.style.fontWeight=f.bold?'700':'400';element.style.textDecoration=f.underline?'underline':'none';element.style.fontSize=f.size+'px';element.style.color=TEXT_COLORS[f.color];}
export function formatControls({noteId,paper,text,getNote,save}){
 const toolbar=document.createElement('div');toolbar.className='note-format';toolbar.setAttribute('role','group');toolbar.setAttribute('aria-label','메모 전체 글자 서식');
 const button=(label,title)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.title=title;b.setAttribute('aria-label',title);toolbar.append(b);return b;};
 const bold=button('B','굵게'),underline=button('U','밑줄');bold.className='format-bold';underline.className='format-underline';
 const size=document.createElement('select');size.className='format-size';size.setAttribute('aria-label','메모 글자 크기');size.title='글자 크기';for(const v of FONT_SIZES)size.add(new Option(String(v),String(v)));
 const color=document.createElement('select');color.className='format-color';color.setAttribute('aria-label','메모 글자 색상');color.title='글자 색상';for(const [value,label]of [['red','빨'],['blue','파'],['green','초'],['black','검']])color.add(new Option(label,value));toolbar.append(size,color);
 function update(note){const f=textStyle(note);applyTextFormat(text,note);bold.setAttribute('aria-pressed',String(f.bold));underline.setAttribute('aria-pressed',String(f.underline));size.value=String(f.size);color.value=f.color;color.style.color=TEXT_COLORS[f.color];}
 function change(patch){const n=getNote(noteId);if(!n)return;n.format={...textStyle(n),...patch};save(n);update(n);}
 bold.onclick=()=>change({bold:!textStyle(getNote(noteId)).bold});underline.onclick=()=>change({underline:!textStyle(getNote(noteId)).underline});size.onchange=()=>change({size:Number(size.value)});color.onchange=()=>change({color:color.value});
 toolbar.addEventListener('pointerdown',e=>{e.stopPropagation();if(e.target.closest('button'))e.preventDefault();});
 text.addEventListener('focus',()=>paper.classList.add('is-editing'));
 const finish=()=>queueMicrotask(()=>{if(document.activeElement!==text&&!toolbar.contains(document.activeElement)){text.readOnly=true;paper.classList.remove('is-editing');}});
 text.addEventListener('blur',finish);toolbar.addEventListener('focusout',finish);
 return {element:toolbar,update};
}
