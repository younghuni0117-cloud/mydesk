import test from 'node:test';import assert from 'node:assert/strict';
import {connectionKey,connectionLink} from '../mindmap-connection.mjs';
test('device connection preserves capability fragment while stripping stale page versions',()=>{
 const key='a'.repeat(43),base='https://example.test/mydesk/mindmap.html?map-update=old';
 const link=connectionLink(key,base);assert.equal(link,'https://example.test/mydesk/mindmap.html#mindmap='+key);assert.equal(connectionKey(link,base),key);assert.equal(connectionKey('#mindmap='+key,base),key);
});
test('invalid, foreign-origin and other-page links cannot switch a private library',()=>{
 const base='https://example.test/mydesk/mindmap.html';assert.equal(connectionKey('https://evil.test/mydesk/mindmap.html#mindmap='+'a'.repeat(43),base),null);assert.equal(connectionKey('calendar.html#mindmap='+'a'.repeat(43),base),null);assert.equal(connectionKey('#mindmap=short',base),null);assert.throws(()=>connectionLink('invalid',base));
});
