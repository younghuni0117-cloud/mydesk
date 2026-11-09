import {walkingSupport,WALK_CRITERIA} from './robot-performance.mjs?v=robot45';
export const REWARD_VERSION=9;
export const REWARDS=Object.freeze({gaze:.3,distalMotion:.35,distalChange:.06,walkUpright:.2,walkQuality:.5,walkSpeed:4,walkForward:10,walkFall:30,walkDown:8,upright:2,balanceUpright:10,balanceUnstable:2,balanceFall:30,balanceDown:8,balanceQuality:8,motionQuality:4,lowQuality:4,remainingFailure:6,alive:.1,speed:2,speedVariance:.3,tilt:1.2,lowHeight:.8,heightReference:.9,drift:.8,forward:5,crawl:.1,maxStepDistance:.08,rise:2,recovery:8,fall:12,pushStanding:1.5,pushDown:.5,pushWindow:1.5,impact:.5,impactImpulse:.06,impactCap:4,effort:.003,obstacle:10,obstacleClearance:.2,arrival:2,posture:2,lowPostureHeight:.62,impactSpeed:.6,impactEnergy:.06,recoveryProgress:6,postureProgress:2});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function rewardBreakdown(stage,s){const c=REWARDS,moving=Math.abs(s.target)>0,walk=(stage==='walk'||stage==='run'),walkMoving=walk&&moving,support=walkingSupport(s),forward=walk?c.walkForward:c.forward,progress=p=>forward*(walk&&p>0?p*support:p);const terms={
 support:s.dt*((stage==='balance'?c.balanceQuality:walkMoving?c.walkQuality:c.motionQuality)*(s.motionQuality??(s.upright?1:0))**2-c.lowQuality*(1-(s.motionQuality??(s.upright?1:0)))),
 standing:s.dt*(s.upright?(stage==='balance'?c.balanceUpright:walkMoving?c.walkUpright:c.upright):(stage==='balance'?-c.balanceUnstable:c.alive)),
 stall:walkMoving?-s.dt*4*Math.max(0,1-Math.max(0,Math.sign(s.target)*s.speed)/Math.max(.1,Math.abs(s.target)*.4)):0,
 speed:s.dt*(stage==='run'?6:walk?c.walkSpeed:c.speed)*Math.exp(-((s.speed-s.target)**2)/c.speedVariance)*(walk?support:(s.quality??(s.upright?1:0))),
 tilt:-s.dt*c.tilt*s.angle*s.angle,
 lowHeight:-s.dt*c.lowHeight*Math.max(0,(s.lowPosture?c.lowPostureHeight:c.heightReference)-s.height),
 movement:s.commanded&&s.positioned?progress(s.goalProgress)-s.dt*c.drift*Math.abs(s.goalError):moving?progress(s.boundedProgress??Math.sign(s.target)*s.dx):-s.dt*c.drift*Math.abs(s.distance),
 overspeed:-s.dt*(8*Math.max(0,Math.abs(s.speed)-Math.abs(s.target)-.05)+2*Math.max(0,Math.abs(s.speed)-Math.abs(s.target)-.05)**2),
 torque:-.05*(s.torqueLoad??0),
 smoothness:-.02*(s.actionChange??0),
 gaze:s.dt*c.gaze*clamp(s.visionCoverage??0,0,1)*clamp(s.motionQuality??0,0,1),
 distalMotion:-s.dt*c.distalMotion*(s.distalMotion??0)*((s.down||s.afterPush)? .25:1),
 distalChange:-c.distalChange*(s.distalChange??0)*((s.down||s.afterPush)? .25:1),
 rise:stage==='recover'?c.recoveryProgress*(s.heightProgress??0)+c.postureProgress*(s.postureProgress??0):0,
 fall:s.newFall?-(stage==='balance'?c.balanceFall:walk?c.walkFall:c.fall):0,
 down:s.down&&(stage==='balance'||walk)?-s.dt*(walk?c.walkDown:c.balanceDown):0,
 recovery:s.recovered&&stage!=='balance'?c.recovery:0,
 push:s.afterPush?s.dt*(s.upright?c.pushStanding:-c.pushDown):0,
 impact:-c.impactEnergy*s.impactCost,
 effort:-c.effort*s.work,
 arrival:s.commanded&&s.positioned&&Math.abs(s.goalError)<.15&&Math.abs(s.speed)<.15&&s.upright?s.dt*c.arrival:0,
 posture:s.lowPosture&&s.upright?s.dt*c.posture*Math.max(0,1-Math.abs(s.height-c.lowPostureHeight)/.4)*(walkMoving?clamp(Math.max(0,Math.sign(s.target)*s.speed)/Math.abs(s.target),0,1):1):0,
 obstacle:stage==='obstacles'?c.obstacle*s.passed:0,
};
 // Once balance has failed, no positive component can repay that failure.
 if(stage==='balance'&&(s.failedBalance||s.newFall))for(const key of Object.keys(terms))terms[key]=Math.min(0,terms[key]);
 return terms;
}
export function rewardHelp(stages){const c=REWARDS;return {
 attention:`실제 눈 센서가 관측한 지형 범위에 자세 품질을 곱해 초당 최대 +${c.gaze}점입니다. 목의 과도한 회전과 제어 급변에는 작은 비용을 줍니다. 머리 목표각이나 기본 보행 동작은 지정하지 않습니다.`,
 standing:`균형은 서 있기 초당 +10점과 자세 품질 8q²−4(1−q)점입니다. 이동 목표가 있는 걷기·달리기는 서 있기 +0.2점, 자세 품질 0.5q²−4(1−q)점만 적용합니다. 다른 과제와 명시적인 정지 명령은 기존 자세 보상을 유지합니다.`,
 speed:`걷기 목표 0.55m/s에는 초당 최대 +4점, 달리기 목표 1.4m/s에는 최대 +6점의 속도 일치 보상을 줍니다. 이동 보상은 실제 목표 방향 진행 1m당 최대 +10점에 지지 품질을 곱합니다. 쓰러져 미끄러질 때의 양의 이동·속도 보상은 0입니다. 되돌아간 거리는 전액 감점합니다.`,
 penalties:`걷기·달리기에서 전진 속도가 목표의 40%보다 느리면 부족한 비율에 따라 초당 최대 −4점입니다. 제자리 정지는 순벌점, 정상 전진은 순보상이 되도록 설계했습니다. 단, 정지·도착 명령의 멈춤은 벌하지 않습니다. 균형·걷기·달리기는 넘어짐 −30점과 쓰러져 있는 동안 초당 −8점입니다. 균형은 첫 실패에 누적 가점을 회수하고 이후 가점을 차단합니다. 기울기·낮은 높이·충격·에너지·제어 급변 비용도 적용합니다.`,
 push:`밀린 뒤 1.5초 동안 서 있으면 초당 +1.5점, 쓰러져 있으면 −0.5점입니다. 자동 밀기를 꺼도 검증 외력 조건은 같습니다.`,
 commands:`명령은 목표 방향·속도·위치·낮은 자세를 정하며 관절 모션을 지정하지 않습니다. 목표 위치로 접근하면 속도가 줄고 도착해 안정되면 보상을 줍니다. 낮은 자세 보상은 이동 명령 중 실제 전진 속도에 비례합니다. 균형 학습의 조기 실패는 남은 시간 비용도 적용합니다.`,
 tasks:Object.entries(stages).map(([id,t])=>({id,label:t.label,duration:t.duration,target:t.speed,
 positive:id==='balance'?'넘어지지 않고 제자리를 유지한 시간을 우선합니다.':id==='recover'?'골반 높이와 자세 품질이 개선되면 보상하고, 다시 서서 0.8초 안정되면 +8점입니다.':'정지 자세보다 실제 지지하며 전진하고 목표 속도를 유지하는 행동을 우선합니다. 같은 구간 왕복으로 진행 가점을 벌 수 없습니다.',
 negative:['walk','run'].includes(id)?'목표 방향의 전진 부족·역방향 이동·넘어짐·충격·불필요한 제어에 비용을 줍니다.':'기울기·높이 부족·충격·불필요한 제어와 해당 과제의 실패 비용입니다.',
 validation:id==='balance'?'전체 시간 완주, 서 있는 비율 95% 초과, 넘어짐 0회, 거리 절댓값 1m 미만, 마지막 골반 높이 0.75m 초과.':id==='recover'?'전체 시간 완주, 1회 이상 회복하고 마지막 높이 0.75m 초과.':id==='walk'?'전체 완주, 초당 0.275m 이상 순전진·지지된 전진 0.22m 이상, 50% 이상 실제 전진, 80% 이상 서 있음, 넘어짐 0회와 마지막 안정 자세.':id==='run'?'전체 완주, 초당 0.7m 이상 순전진·지지된 전진 0.49m 이상, 45% 이상 실제 전진, 70% 이상 서 있음, 넘어짐 0회와 마지막 안정 자세.':'실제 장애물 1개 이상 통과하고 절반 이상 서 있는 상태로 완주합니다.'}))};}
