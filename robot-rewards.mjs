export const REWARD_VERSION=2;
export const REWARDS=Object.freeze({upright:2,alive:.1,speed:2,speedVariance:.3,tilt:1.2,lowHeight:.8,heightReference:.9,drift:.8,forward:5,crawl:.1,maxStepDistance:.08,rise:2,recovery:8,fall:12,pushStanding:1.5,pushDown:.5,pushWindow:1.5,impact:.5,impactImpulse:.06,impactCap:4,effort:.003,obstacle:10,obstacleClearance:.2,arrival:2,posture:2,lowPostureHeight:.62,impactSpeed:.6,impactEnergy:.06,recoveryProgress:6,postureProgress:2});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function rewardBreakdown(stage,s){const c=REWARDS,moving=Math.abs(s.target)>0;return {
 standing:s.dt*(s.upright?c.upright:c.alive),
 speed:s.dt*c.speed*Math.exp(-((s.speed-s.target)**2)/c.speedVariance)*(s.quality??(s.upright?1:0)),
 tilt:-s.dt*c.tilt*s.angle*s.angle,
 lowHeight:-s.dt*c.lowHeight*Math.max(0,(s.lowPosture?c.lowPostureHeight:c.heightReference)-s.height),
 movement:s.commanded&&s.positioned?clamp(s.goalProgress,-c.maxStepDistance,c.maxStepDistance)*(s.upright?c.forward:c.crawl)-s.dt*c.drift*Math.abs(s.goalError):moving?Math.sign(s.target)*clamp(s.dx,-c.maxStepDistance,c.maxStepDistance)*(s.upright?c.forward:c.crawl):-s.dt*c.drift*Math.abs(s.distance),
 rise:stage==='recover'?c.recoveryProgress*(s.heightProgress??0)+c.postureProgress*(s.postureProgress??0):0,
 fall:s.newFall?-c.fall:0,
 recovery:s.recovered?c.recovery:0,
 push:s.afterPush?s.dt*(s.upright?c.pushStanding:-c.pushDown):0,
 impact:-c.impactEnergy*s.impactCost,
 effort:-c.effort*s.work,
 arrival:s.commanded&&s.positioned&&Math.abs(s.goalError)<.15&&Math.abs(s.speed)<.15&&s.upright?s.dt*c.arrival:0,
 posture:s.lowPosture&&s.upright?s.dt*c.posture*Math.max(0,1-Math.abs(s.height-c.lowPostureHeight)/.4):0,
 obstacle:stage==='obstacles'?c.obstacle*s.passed:0,
};}
export function rewardHelp(stages){const c=REWARDS;return {
 standing:`발이 지면에 닿고, 골반 높이가 지면 위 0.75m 초과이며 상체 기울기가 약 29° 미만이면 ‘서 있음’입니다. 서 있으면 초당 +${c.upright}점, 그 외에는 초당 +${c.alive}점입니다.`,
 speed:`목표 속도에 가까울수록 초당 0~+${c.speed}점입니다. 정확히 일치하고 서 있는 자세의 질이 높을 때 최대입니다. 골반 높이·상체 방향·발 지지 상태에 따른 0~1 계수를 곱합니다. 기본 계산식은 ${c.speed} × exp(−(현재 속도−목표 속도)²/${c.speedVariance})입니다.`,
 penalties:`상체 기울기²에 초당 −${c.tilt}점(각도는 라디안), 골반 높이가 ${c.heightReference}m보다 부족한 만큼 초당 −${c.lowHeight}점/m, 새로 넘어질 때 −${c.fall}점입니다. 머리·몸통·골반이 초속 ${c.impactSpeed}m보다 빠르게 새로 충돌할 때 초과 충격 에너지 1J당 −${c.impactEnergy}점입니다. 가만히 닿아 몸을 지탱하는 접촉력에는 충격 벌점이 없습니다. 관절 모터가 쓴 기계적 일에는 −${c.effort}점/J입니다.`,
 push:`밀린 뒤 ${c.pushWindow}초 동안 서 있으면 초당 +${c.pushStanding}점, 그렇지 않으면 초당 −${c.pushDown}점입니다. 자동 밀기를 꺼도 검증의 외력 조건은 동일합니다.`,
 commands:`목표 방향으로 1m 진행하면 서 있을 때 +${c.forward}점(누운 이동은 ${c.crawl}점), 반대 방향이면 감점합니다. 위치 목표·제자리 유지는 목표에서 떨어진 거리 1m당 초당 −${c.drift}점이며, 목표 ±0.15m 안에서 속도 0.15m/s 미만으로 서 있으면 초당 +${c.arrival}점입니다. 목표에 가까워질수록 목표 속도가 줄어듭니다. 낮은 자세는 골반 높이 ${c.lowPostureHeight}m에 가까울수록 초당 최대 +${c.posture}점이며 낮은 높이에 맞춰 서 있기 판정과 높이 벌점도 조정합니다. 목표는 관절 자세나 움직임을 지정하지 않습니다.`,
 tasks:Object.entries(stages).map(([id,task])=>({id,label:task.label,duration:task.duration,target:task.speed,
  positive:id==='balance'?`공통 서 있기·속도 일치 보상. 목표 속도 0m/s로 제자리에 서 있는 상태를 평가합니다.`:id==='recover'?`지면 기준 골반 높이가 올라간 만큼 1m당 +${c.recoveryProgress}점, 상체가 세워지는 자세 품질 증가 1당 +${c.postureProgress}점입니다(되돌아가면 같은 비율로 감점). 넘어진 상태에서 서 있는 자세를 0.8초 넘게 유지하면 +${c.recovery}점입니다. 시작부터 누워 있는 것은 넘어짐 벌점에 포함하지 않습니다.`:`목표 ${task.speed}m/s에 맞춘 이동. 서서 앞으로 1m 이동하면 +${c.forward}점, 뒤로 이동하면 같은 비율로 감점합니다. 서 있지 않은 이동은 1m당 ${c.crawl}점으로 줄어듭니다. 한 물리 프레임의 이동량은 ±${c.maxStepDistance}m로 제한해 점수를 계산합니다.${id==='obstacles'?` 서 있는 상태에서 골반이 실제 돌·물건의 끝보다 ${c.obstacleClearance}m 앞으로 지나갈 때 각각 +${c.obstacle}점입니다.`:''}`,
  negative:id==='balance'||id==='recover'?`출발점에서 벗어난 거리 1m당 초당 −${c.drift}점과 공통 벌점.`:`목표 속도에서 벗어나면 속도 보상이 줄고, 뒤로 이동하면 감점됩니다. 공통 벌점도 적용합니다.`,
  validation:id==='balance'?'서 있는 비율 95% 초과, 넘어짐 0회, 이동 거리 절댓값 1m 미만, 마지막 골반 높이 0.75m 초과.':id==='recover'?'일어서기 성공 1회 이상, 마지막 골반 높이 0.75m 초과.':id==='walk'?'전진 1.5m 초과, 서 있는 비율 60% 초과.':id==='run'?'전진 4m 초과, 서 있는 비율 50% 초과.':'실제 장애물 통과 1개 이상, 서 있는 비율 50% 초과. 장애물이 없는 지형에는 통과 보너스가 없습니다.',
 })),
};}
