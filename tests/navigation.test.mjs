import test from 'node:test';import assert from 'node:assert/strict';
import {DEFAULT_MENUS,validateMenus,menuPath,descendantIds,folderOptions,legacyMenuId,postMenuId,reorderMenu,removeMenu,safeMenuHref} from '../navigation-data.mjs';
test('default hierarchy and old blog links resolve to the same articles',()=>{
 assert.equal(validateMenus(DEFAULT_MENUS),DEFAULT_MENUS);assert.deepEqual(menuPath(DEFAULT_MENUS,'physicsnemo').map(m=>m.label),['학습정보','Simulation','PhysicsNeMo']);
 assert.equal(legacyMenuId(new URLSearchParams('category=structural&topic=PhysicsNeMo'),DEFAULT_MENUS),'physicsnemo');assert.equal(postMenuId({category:'ai'}),'reinforcement-learning');
 assert.ok(descendantIds(DEFAULT_MENUS,'learning').has('physicsnemo'));assert.equal(folderOptions(DEFAULT_MENUS).length,6);
});
test('reject cyclic menus, missing parents, link parents and executable URLs',()=>{
 const cycle=structuredClone(DEFAULT_MENUS);cycle.find(m=>m.id==='learning').parent_id='physicsnemo';assert.throws(()=>validateMenus(cycle),/자기 자신/);
 assert.throws(()=>validateMenus([...DEFAULT_MENUS,{id:'bad',label:'bad',kind:'folder',href:null,parent_id:'missing'}]),/상위 메뉴/);
 assert.throws(()=>validateMenus([...DEFAULT_MENUS,{id:'bad',label:'bad',kind:'folder',href:null,parent_id:'home'}]),/상위 메뉴/);
 for(const href of ['javascript:alert(1)','data:text/html,bad','//evil.test','https://user:pass@example.com','https://example.com/\n'])assert.equal(safeMenuHref(href),false);
 assert.equal(safeMenuHref('calendar.html#family=test'),true);assert.equal(safeMenuHref('https://docs.nvidia.com/'),true);
});
test('reorder only sibling order and deleting a folder preserves its descendants',()=>{
 const moved=reorderMenu(DEFAULT_MENUS,'simulation',-1);assert.deepEqual(moved.filter(m=>m.parent_id==='learning').map(m=>m.id),['simulation','ai']);
 const removed=removeMenu(DEFAULT_MENUS,'simulation');assert.equal(removed.find(m=>m.id==='physicsnemo').parent_id,'learning');assert.equal(removed.length,DEFAULT_MENUS.length-1);validateMenus(removed);assert.equal(DEFAULT_MENUS.find(m=>m.id==='physicsnemo').parent_id,'simulation');
});
