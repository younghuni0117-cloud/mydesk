import test from 'node:test';import assert from 'node:assert/strict';
import {chartData} from '../cartpole-evolution-chart.mjs';
test('chart shows ten-trial average and real fixed evaluation instead of individual reward and thirty-trial average',()=>{
 const rows=Array.from({length:20},(_,i)=>({episode:i+1,reward:i+1})),d=chartData(rows,[{episode:5,mean:7},{episode:15,mean:12}],5);
 assert.equal(d.average[0].value,11.5);assert.equal(d.latestAverage,15.5);assert.equal(d.latestValidated.value,12);assert.deepEqual(d.validated,[]);
 assert.deepEqual(chartData(rows,[{episode:18,mean:9}],5).validated,[{episode:18,value:9}]);
 assert.equal(chartData([],[],0).latestValidated,null);assert.equal(chartData([],[],0).latestAverage,null);
});
