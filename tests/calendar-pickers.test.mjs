import {test} from 'node:test';
import assert from 'node:assert/strict';
import {minuteChoices,proposedEnd,validTimeRange} from '../calendar-pickers.mjs';
test('ten minute choices preserve saved odd minutes',()=>{assert.deepEqual(minuteChoices(0),[0,10,20,30,40,50]);assert.deepEqual(minuteChoices(13),[0,10,13,20,30,40,50]);});
test('one hour default rolls midnight and retains a selected multi-day end',()=>{assert.deepEqual(proposedEnd('2026-11-19','23:50','2026-11-19'),{day:'2026-11-20',time:'00:50'});assert.deepEqual(proposedEnd('2026-11-19','09:20','2026-11-22'),{day:'2026-11-22',time:'10:20'});});
test('equal end time is invalid, overnight range valid',()=>{assert.equal(validTimeRange('2026-11-19','09:20','2026-11-19','09:20'),false);assert.equal(validTimeRange('2026-11-19','23:50','2026-11-20','00:50'),true);});
