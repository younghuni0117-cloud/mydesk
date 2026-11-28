import {TEXT_COLORS,FONT_SIZES,textStyle} from './sticky-data.mjs?v=format1';
export function applyTextFormat(element,note){const f=textStyle(note);element.style.fontWeight=f.bold?'700':'400';element.style.textDecoration=f.underline?'underline':'none';element.style.fontSize=f.size+'px';element.style.color=TEXT_COLORS[f.color];}
export function formatControls({noteId,paper,text,getNote,save}){
 const toolbar=document.createElement('div');toolbar.className='note-format';toolbar.setAttribute('role','group');toolbar.setAttribute('aria-label','메모 전체 글자 서식');
 const button=(label,title,parent=toolbar)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.title=title;b.setAttribute('aria-label',title);parent.append(b);return b;};
 const bold=button('B','굵게'),underline=button('U','밑줄');bold.className='format-bold';underline.className='format-underline';
 const size=button('18','글자 크기 선택'),color=button('색','글자 색상 선택');size.className='format-size';color.className='format-color';
 const sizeMenu=document.createElement('div'),colorMenu=document.createElement('div');
 for(const [menu,label]of [[sizeMenu,'글자 크기'],[colorMenu,'글자 색상']]){menu.className='note-format-menu';menu.setAttribute('role','group');menu.setAttribute('aria-label',label);menu.hidden=true;toolbar.append(menu);}
 for(const trigger of [size,color]){trigger.setAttribute('aria-haspopup','true');trigger.setAttribute('aria-expanded','false');}
 function closeMenus(){sizeMenu.hidden=colorMenu.hidden=true;size.setAttribute('aria-expanded','false');color.setAttribute('aria-expanded','false');}
 function update(note){const f=textStyle(note);applyTextFormat(text,note);bold.setAttribute('aria-pressed',String(f.bold));underline.setAttribute('aria-pressed',String(f.underline));size.textContent=String(f.size);size.title='글자 크기 '+f.size+'px · 눌러서 선택';color.style.color=TEXT_COLORS[f.color];for(const b of sizeMenu.children)b.setAttribute('aria-pressed',String(Number(b.dataset.size)===f.size));for(const b of colorMenu.children)b.setAttribute('aria-pressed',String(b.dataset.color===f.color));}
 function change(patch){const n=getNote(noteId);if(!n)return;n.format={...textStyle(n),...patch};save(n);update(n);closeMenus();}
 for(const v of FONT_SIZES){const b=button(String(v),v+'px',sizeMenu);b.dataset.size=String(v);b.onclick=()=>change({size:v});}
 for(const [value,label]of [['red','빨'],['blue','파'],['green','초'],['black','검']]){const b=button(label,label+'색',colorMenu);b.dataset.color=value;b.style.color=TEXT_COLORS[value];b.onclick=()=>change({color:value});}
 bold.onclick=()=>change({bold:!textStyle(getNote(noteId)).bold});underline.onclick=()=>change({underline:!textStyle(getNote(noteId)).underline});
 size.onclick=()=>{const open=sizeMenu.hidden;closeMenus();sizeMenu.hidden=!open;size.setAttribute('aria-expanded',String(open));};color.onclick=()=>{const open=colorMenu.hidden;closeMenus();colorMenu.hidden=!open;color.setAttribute('aria-expanded',String(open));};
 // Prevent focus loss before a touch/click; native selects previously hid with the toolbar.
 toolbar.addEventListener('pointerdown',e=>{e.stopPropagation();e.preventDefault();});
 toolbar.addEventListener('mousedown',e=>e.preventDefault());
 text.addEventListener('focus',()=>paper.classList.add('is-editing'));
 const finish=()=>queueMicrotask(()=>{if(document.activeElement!==text&&!toolbar.contains(document.activeElement)){text.readOnly=true;paper.classList.remove('is-editing');closeMenus();}});
 text.addEventListener('blur',finish);toolbar.addEventListener('focusout',finish);
 toolbar.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();closeMenus();text.focus();}});
 return {element:toolbar,update};
}
