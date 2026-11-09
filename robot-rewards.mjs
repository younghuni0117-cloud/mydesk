import {walkingSupport,WALK_CRITERIA} from './robot-performance.mjs?v=robot37';
export const REWARD_VERSION=7;
export const REWARDS=Object.freeze({walkUpright:.5,walkQuality:1,walkSpeed:4,walkForward:8,walkFall:30,walkDown:8,upright:2,balanceUpright:10,balanceUnstable:2,balanceFall:30,balanceDown:8,balanceQuality:8,motionQuality:4,lowQuality:4,remainingFailure:6,alive:.1,speed:2,speedVariance:.3,tilt:1.2,lowHeight:.8,heightReference:.9,drift:.8,forward:5,crawl:.1,maxStepDistance:.08,rise:2,recovery:8,fall:12,pushStanding:1.5,pushDown:.5,pushWindow:1.5,impact:.5,impactImpulse:.06,impactCap:4,effort:.003,obstacle:10,obstacleClearance:.2,arrival:2,posture:2,lowPostureHeight:.62,impactSpeed:.6,impactEnergy:.06,recoveryProgress:6,postureProgress:2});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function rewardBreakdown(stage,s){const c=REWARDS,moving=Math.abs(s.target)>0,walk=stage==='walk',walkMoving=walk&&moving,support=walkingSupport(s),forward=walk?c.walkForward:c.forward,progress=p=>forward*(walk&&p>0?p*support:p);const terms={
 support:s.dt*((stage==='balance'?c.balanceQuality:walkMoving?c.walkQuality:c.motionQuality)*(s.motionQuality??(s.upright?1:0))**2-c.lowQuality*(1-(s.motionQuality??(s.upright?1:0)))),
 standing:s.dt*(s.upright?(stage==='balance'?c.balanceUpright:walkMoving?c.walkUpright:c.upright):(stage==='balance'?-c.balanceUnstable:c.alive)),
 speed:s.dt*(walk?c.walkSpeed:c.speed)*Math.exp(-((s.speed-s.target)**2)/c.speedVariance)*(walk?support:(s.quality??(s.upright?1:0))),
 tilt:-s.dt*c.tilt*s.angle*s.angle,
 lowHeight:-s.dt*c.lowHeight*Math.max(0,(s.lowPosture?c.lowPostureHeight:c.heightReference)-s.height),
 movement:s.commanded&&s.positioned?progress(s.goalProgress)-s.dt*c.drift*Math.abs(s.goalError):moving?progress(s.boundedProgress??Math.sign(s.target)*s.dx):-s.dt*c.drift*Math.abs(s.distance),
 overspeed:-s.dt*(8*Math.max(0,Math.abs(s.speed)-Math.abs(s.target)-.05)+2*Math.max(0,Math.abs(s.speed)-Math.abs(s.target)-.05)**2),
 torque:-.05*(s.torqueLoad??0),
 smoothness:-.02*(s.actionChange??0),
 rise:stage==='recover'?c.recoveryProgress*(s.heightProgress??0)+c.postureProgress*(s.postureProgress??0):0,
 fall:s.newFall?-(stage==='balance'?c.balanceFall:walk?c.walkFall:c.fall):0,
 down:s.down&&(stage==='balance'||walk)?-s.dt*(walk?c.walkDown:c.balanceDown):0,
 recovery:s.recovered&&stage!=='balance'?c.recovery:0,
 push:s.afterPush?s.dt*(s.upright?c.pushStanding:-c.pushDown):0,
 impact:-c.impactEnergy*s.impactCost,
 effort:-c.effort*s.work,
 arrival:s.commanded&&s.positioned&&Math.abs(s.goalError)<.15&&Math.abs(s.speed)<.15&&s.upright?s.dt*c.arrival:0,
 posture:s.lowPosture&&s.upright?s.dt*c.posture*Math.max(0,1-Math.abs(s.height-c.lowPostureHeight)/.4):0,
 obstacle:stage==='obstacles'?c.obstacle*s.passed:0,
};
 // Once balance has failed, no positive component can repay that failure.
 if(stage==='balance'&&(s.failedBalance||s.newFall))for(const key of Object.keys(terms))terms[key]=Math.min(0,terms[key]);
 return terms;
}
export function rewardHelp(stages){const c=REWARDS;return {
 standing:`발이 지면에 닿고, 골반 높이가 지면 위 0.75m 초과이며 상체 기울기가 약 29° 미만이면 ‘서 있음’입니다. 발 지지·골반 높이·몸통 방향·몸통의 바닥 접촉을 함께 반영한 자세 품질 q(0~1)에 균형은 초당 8q²−4(1−q)점, 이동 목표가 있는 걷기는 q²−4(1−q)점, 나머지는 4q²−4(1−q)점을 더합니다. 낮은 자세 명령은 목표 높이를 낮춰 평가합니다. 서 있으면 균형은 초당 +${c.balanceUpright}점, 이동 목표가 있는 걷기는 +${c.walkUpright}점, 나머지는 +${c.upright}점입니다. 서 있지 않으면 균형은 초당 −${c.balanceUnstable}점, 다른 과제는 +${c.alive}점입니다.`,
 speed:`목표 속도에 가까울수록 초당 걷기는 최대 +${c.walkSpeed}점, 다른 과제는 최대 +${c.speed}점입니다. 정확히 일치하고 서 있는 자세의 질이 높을 때 최대입니다. 골반 높이·상체 방향·발 지지 상태에 따른 0~1 계수를 곱합니다. 기본 계산식은 과제별 최대점 × exp(−(현재 속도−목표 속도)²/${c.speedVariance})입니다.`,
 penalties:`상체 기울기²에 초당 −${c.tilt}점(각도는 라디안), 골반 높이가 ${c.heightReference}m보다 부족한 만큼 초당 −${c.lowHeight}점/m, 새로 넘어질 때 일어서기·달리기·장애물 과제에는 −${c.fall}점, 걷기는 −${c.walkFall}점과 쓰러져 있거나 회복 중인 동안 초당 −${c.walkDown}점입니다. 균형잡기는 넘어질 때마다 −${c.balanceFall}점, 쓰러져 있거나 회복 중인 동안 초당 −${c.balanceDown}점입니다. 처음 넘어질 때 그 시도에서 쌓인 양의 누적 점수도 회수합니다. 한 번 실패한 균형 시도에는 이후 서 있기·속도·밀기·회복 등의 가점을 주지 않습니다. 일어서기와 이동 과제의 회복 보상은 유지합니다. 머리·몸통·골반이 초속 ${c.impactSpeed}m보다 빠르게 새로 충돌할 때 초과 충격 에너지 1J당 −${c.impactEnergy}점입니다. 가만히 닿아 몸을 지탱하는 접촉력에는 충격 벌점이 없습니다. 관절 모터가 쓴 기계적 일에는 −${c.effort}점/J입니다. 정규화한 토크 제곱에 초당 최대 −0.05점, 출력 변화 제곱 평균에 −0.02점을 적용합니다. 목표 속도 절댓값을 0.05m/s 넘긴 초과 속도 e에는 초당 −(8e+2e²)점입니다. 조기 이탈·수치 오류는 검증 실패이며 총 보상을 −20−8×예정 시간 이하로 제한합니다.`,
 push:`밀린 뒤 ${c.pushWindow}초 동안 서 있으면 초당 +${c.pushStanding}점, 그렇지 않으면 초당 −${c.pushDown}점입니다. 자동 밀기를 꺼도 검증의 외력 조건은 동일합니다.`,
 commands:`목표 방향으로 1m 진행하면 걷기는 최대 +${c.walkForward}점, 다른 과제는 +${c.forward}점이며 반대 방향이면 감점합니다. 걷기의 양의 진행·속도 보상에는 발 지지·몸 높이·상체 방향의 품질 계수를 곱하고 쓰러짐·몸통 접촉 중에는 주지 않습니다. 뒤로 밀리거나 되돌아간 거리의 벌점은 줄이지 않습니다. 위치 목표·제자리 유지는 목표에서 떨어진 거리 1m당 초당 −${c.drift}점이며, 목표 ±0.15m 안에서 속도 0.15m/s 미만으로 서 있으면 초당 +${c.arrival}점입니다. 목표에 가까워질수록 목표 속도가 줄어듭니다. 낮은 자세는 골반 높이 ${c.lowPostureHeight}m에 가까울수록 초당 최대 +${c.posture}점이며 낮은 높이에 맞춰 서 있기 판정과 높이 벌점도 조정합니다. 목표는 관절 자세나 움직임을 지정하지 않습니다. 균형 학습만 시작 0.2초 이후 서 있기 기준에서 0.2초 넘게 벗어나면 시도를 마치고 남은 예정 시간에 초당 −6점을 적용합니다. 이 균형 상실 중단도 누적 가점을 회수하고 −${c.balanceFall}점 이하로 평가합니다. 일어서기 학습과 관찰·검증은 끝까지 계속합니다.`,
 tasks:Object.entries(stages).map(([id,task])=>({id,label:task.label,duration:task.duration,target:task.speed,
  positive:id==='walk'?`목표 속도 ${WALK_CRITERIA.speed}m/s로 계속 걷는 것을 평가합니다. 이동 목표 중 서 있기는 초당 +${c.walkUpright}점, 자세 품질은 q²−4(1−q)점, 목표 속도 일치는 최대 +${c.walkSpeed}점입니다. 목표 방향 진행 1m당 최대 +${c.walkForward}점에 발 지지·몸 높이·상체 방향 품질을 곱합니다. 쓰러짐·머리/몸통/골반 접촉 중 양의 진행·속도 보상은 0입니다. 되돌아간 거리에는 전액 감점하므로 왕복해서 점수를 벌 수 없습니다. 정지 명령에서는 기존 서 있기·도착 보상을 유지합니다. 다시 일어서서 0.8초 안정되면 +${c.recovery}점이며 회복 후 걷기 보상을 다시 받을 수 있습니다.`:id==='balance'?`넘어지기 전의 서 있기·속도 일치 보상. 목표 속도 0m/s로 제자리에 서 있는 상태를 평가합니다. 끝까지 넘어지지 않고 완주한 시도를 우선 비교하며, 넘어졌다 일어나는 행동으로 점수를 벌 수 없습니다.`:id==='recover'?`지면 기준 골반 높이가 올라간 만큼 1m당 +${c.recoveryProgress}점, 상체가 세워지는 자세 품질 증가 1당 +${c.postureProgress}점입니다(되돌아가면 같은 비율로 감점). 넘어진 상태에서 서 있는 자세를 0.8초 넘게 유지하면 +${c.recovery}점입니다. 시작부터 누워 있는 것은 넘어짐 벌점에 포함하지 않습니다.`:`목표 ${task.speed}m/s에 맞춘 이동. 앞으로 1m 이동하면 +${c.forward}점, 뒤로 이동하면 같은 비율로 감점합니다. 진행 보상은 목표 속도 × 시도 시간에 해당하는 거리까지 계산합니다. 같은 구간을 왕복해서 진행 점수를 벌 수 없습니다.${id==='obstacles'?` 서 있는 상태에서 골반이 실제 돌·물건의 끝보다 ${c.obstacleClearance}m 앞으로 지나갈 때 각각 +${c.obstacle}점입니다.`:''}`,
  negative:id==='walk'?`넘어질 때 −${c.walkFall}점, 쓰러져 있거나 회복 중인 동안 초당 −${c.walkDown}점과 공통 벌점. 이동 방향 반대의 진행은 1m당 −${c.walkForward}점입니다.`:id==='balance'||id==='recover'?`출발점에서 벗어난 거리 1m당 초당 −${c.drift}점과 공통 벌점.`:`목표 속도에서 벗어나면 속도 보상이 줄고, 뒤로 이동하면 감점됩니다. 공통 벌점도 적용합니다.`,
  validation:'예정된 전체 시간을 완료해야 합니다. '+(id==='balance'?'서 있는 비율 95% 초과, 넘어짐 0회, 이동 거리 절댓값 1m 미만, 마지막 골반 높이 0.75m 초과.':id==='recover'?'일어서기 성공 1회 이상, 마지막 골반 높이 0.75m 초과.':id==='walk'?`검증 시간 T초에 대해 전진 ${WALK_CRITERIA.speed*WALK_CRITERIA.distanceRatio}×T m 이상, 지지 품질을 반영한 순전진 ${Number((WALK_CRITERIA.speed*WALK_CRITERIA.supportedRatio).toFixed(3))}×T m 이상, 서 있는 비율 ${WALK_CRITERIA.uprightRatio*100}% 이상, ${WALK_CRITERIA.minSpeed}m/s 이상으로 지지하며 전진한 시간 ${WALK_CRITERIA.movingRatio*100}% 이상, 넘어짐 0회, 종료 시 안정적으로 서 있음(마지막 최소 2초, 짧은 시험은 T/3초). 통합 모델은 완주와 적은 넘어짐을 우선하고 걷는 시간·지지된 전진·자세를 함께 비교합니다.`:id==='run'?'전진 4m 초과, 서 있는 비율 50% 초과.':'실제 장애물 통과 1개 이상, 서 있는 비율 50% 초과. 장애물이 없는 지형에는 통과 보너스가 없습니다.'),
 })),
};}
