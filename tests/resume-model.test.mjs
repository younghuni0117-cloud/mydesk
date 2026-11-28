import test from 'node:test';import assert from 'node:assert/strict';
import {CATEGORIES,emptyDocument,validDocument,importBlocks,saveItem,removeItem,resumeText} from '../resume-model.mjs';
test('resume categories support adding, editing, removing without changing original document',()=>{
 const original=emptyDocument();assert.equal(CATEGORIES.length,11);assert.ok(validDocument(original));
 const a=saveItem(original,'papers',{id:'p1',fields:{title:'Synthetic paper',details:'Verified test'}});
 assert.equal(original.sections.papers.length,0);assert.equal(a.sections.papers.length,1);
 const b=saveItem(a,'papers',{id:'p1',fields:{title:'Edited paper'}});assert.equal(b.sections.papers.length,1);assert.equal(b.sections.papers[0].fields.title,'Edited paper');
 assert.equal(removeItem(b,'papers','p1').sections.papers.length,0);assert.ok(resumeText(a).includes('논문명: Synthetic paper'));
});
test('legacy blocks are classified, retained as unverified source facts, and not invented as structured credentials',()=>{
 const doc=importBlocks([{title:'직장 경력',details:'Synthetic career text'},{title:'논문 발표',details:'Synthetic publication'},{title:'자기소개서 초안',details:'Synthetic draft'},{title:'기타 메모',details:'Unclassified source'}]);
 assert.equal(doc.sections.career[0].fields.details,'Synthetic career text');assert.equal(doc.sections.papers.length,1);assert.equal(doc.sections.essays.length,1);assert.equal(doc.sections.archive.length,1);assert.equal(doc.sections.career[0].fields.status,'원문 확인 필요');assert.equal(doc.sections.career[0].fields.position,undefined);assert.ok(validDocument(doc));
});
test('invalid values and oversized entries are rejected',()=>{
 assert.throws(()=>saveItem(emptyDocument(),'patents',{id:'p',fields:{title:123}}));
 assert.throws(()=>saveItem(emptyDocument(),'patents',{id:'p',fields:{title:'a'.repeat(20001)}}));
 assert.equal(validDocument({version:1,sections:{}}),false);
});
