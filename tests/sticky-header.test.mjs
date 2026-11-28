import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
test('shared shortcut puts sticky first after unchanged menu toggle and preserves existing destinations',()=>{
 const shell=readFileSync(new URL('../shell.js',import.meta.url),'utf8'),html=readFileSync(new URL('../sticky.html',import.meta.url),'utf8');
 const icons=[...shell.matchAll(/\['(sticky|calendar|mindmap|restaurants)', /g)].map(m=>m[1]);assert.deepEqual(icons,['sticky','calendar','mindmap','restaurants']);assert.ok(shell.includes("child.id !== 'menu-toggle'"));assert.ok(shell.includes('location.append(nav)'));assert.ok(html.includes('id="menu-toggle"'));assert.ok(html.includes('id="sidebar-backdrop"'));
});
