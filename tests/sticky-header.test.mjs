import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
test('shared shortcut puts sticky first after unchanged menu toggle and preserves existing destinations',()=>{
 const shell=readFileSync(new URL('../shell.js',import.meta.url),'utf8'),html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const icons=[...shell.matchAll(/\['(sticky|calendar|mindmap|restaurants)', /g)].map(m=>m[1]);assert.deepEqual(icons,['sticky','calendar','mindmap','restaurants']);assert.ok(shell.includes("child.id !== 'menu-toggle'"));assert.ok(shell.includes('location.append(nav)'));assert.ok(html.includes('id="menu-toggle"'));assert.ok(html.includes('id="sidebar-backdrop"'));
});

test('home embeds compact board, with new memo first in bottom controls and no zoom toolbar',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8'),js=readFileSync(new URL('../sticky.js',import.meta.url),'utf8');
 assert.ok(html.includes('id="sticky-home-board"'));assert.ok(html.indexOf('id="board"')<html.indexOf('class="page-heading"'));
 assert.ok(html.indexOf('class="board-bins"')<html.indexOf('id="new-note"'));assert.ok(html.indexOf('id="new-note"')<html.indexOf('id="archive-bin"'));
 assert.ok(!html.includes('id="zoom-in"'));assert.ok(!html.includes('오늘의 작은 생각들'));assert.ok(!js.includes('for(const color of COLORS)'));
});
