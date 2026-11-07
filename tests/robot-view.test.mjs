import test from 'node:test';import assert from 'node:assert/strict';
import {interpolateFrame,traceFrame,chartDomain} from '../robot-view.mjs';
const frame=(time,x,angle)=>({time,parts:[[x,1,angle]],metrics:{time}});
test('playback interpolates actual timestamps even with uneven sample spacing',()=>{const frames=[frame(0,0,0),frame(.03,3,0),frame(.09,9,0)];assert.ok(Math.abs(traceFrame(frames,.06).parts[0][0]-6)<1e-9);assert.equal(traceFrame(frames,0).parts[0][0],0);assert.equal(traceFrame(frames,2).parts[0][0],9);});
test('live interpolation takes the short angular path and does not mutate physics',()=>{const a=frame(0,0,Math.PI-.1),b=frame(1,2,-Math.PI+.1),m=interpolateFrame(a,b,.5);assert.equal(m.parts[0][0],1);assert.ok(Math.abs(m.parts[0][2]-Math.PI)<1e-8);assert.equal(a.parts[0][0],0);assert.equal(b.parts[0][0],2);});
test('chart zooms to small reward changes without flattening them on a 200 point scale',()=>{const [low,high]=chartDomain([{overall:-70,candidate:-71},{overall:-69,candidate:-68}]);assert.ok(high-low<10);assert.ok(low<=-71&&high>=-68);assert.deepEqual(chartDomain([]),[-100,100]);});
