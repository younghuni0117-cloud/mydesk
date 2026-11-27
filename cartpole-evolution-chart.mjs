export function chartData(history=[],evaluations=[],range=0){
 const averages=history.map((row,i)=>({episode:row.episode,value:history.slice(Math.max(0,i-9),i+1).reduce((sum,r)=>sum+r.reward,0)/Math.min(10,i+1)}));
 const visible=range?averages.slice(-range):averages;
 const start=visible[0]?.episode??0,end=visible.at(-1)?.episode??0;
 const checks=evaluations.filter(r=>Number.isFinite(r.episode)&&Number.isFinite(r.mean)).map(r=>({episode:r.episode,value:r.mean}));
 const validated=checks.filter(r=>r.episode>=start&&r.episode<=end);
 return {average:visible,validated,start,end,latestAverage:averages.at(-1)?.value??null,latestValidated:checks.at(-1)??null};
}
