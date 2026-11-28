import test from 'node:test';import assert from 'node:assert/strict';
import {formatControls} from '../sticky-format.mjs';
class Element extends EventTarget{
 constructor(){super();this.children=[];this.dataset={};this.style={};this.attributes={};this.classes=new Set();this.classList={add:v=>this.classes.add(v),remove:v=>this.classes.delete(v)};}
 append(child){this.children.push(child);}
 setAttribute(k,v){this.attributes[k]=v;}
 contains(n){return n===this||this.children.some(c=>c.contains(n));}
 focus(){document.activeElement=this;this.dispatchEvent(new Event('focus'));}
}
test('format picker opens actual options, applies size/color immediately and preserves focus until editing ends',async()=>{
 const original=globalThis.document;globalThis.document={createElement:()=>new Element(),activeElement:null};
 try{const text=new Element(),paper=new Element();let note={id:'test',text:'memo'},saved=0;
 const control=formatControls({noteId:'test',paper,text,getNote:()=>note,save:n=>{note=n;saved++;}});control.update(note);
 const [bold,underline,size,color,sizes,colors]=control.element.children;text.focus();assert.ok(paper.classes.has('is-editing'));
 size.onclick();assert.equal(sizes.hidden,false);sizes.children.find(b=>b.dataset.size==='24').onclick();assert.equal(note.format.size,24);assert.equal(text.style.fontSize,'24px');assert.equal(sizes.hidden,true);
 color.onclick();assert.equal(colors.hidden,false);colors.children.find(b=>b.dataset.color==='red').onclick();assert.equal(note.format.color,'red');assert.equal(text.style.color,'#c52f32');
 bold.onclick();underline.onclick();assert.equal(note.format.bold,true);assert.equal(note.format.underline,true);assert.equal(saved,4);
 const down=new Event('pointerdown',{cancelable:true});control.element.dispatchEvent(down);assert.equal(down.defaultPrevented,true);
 document.activeElement=color;text.dispatchEvent(new Event('blur'));await Promise.resolve();assert.ok(paper.classes.has('is-editing'));
 size.onclick();document.activeElement=null;control.element.dispatchEvent(new Event('focusout'));await Promise.resolve();assert.equal(sizes.hidden,true);assert.ok(!paper.classes.has('is-editing'));assert.equal(text.readOnly,true);
 }finally{globalThis.document=original;}
});
