export const help = {
  train:['Training Loss','학습에 사용한 다음 토큰의 예측 손실','정답 토큰 확률의 음의 자연로그를 현재 학습 구간에서 평균합니다.','최적화 진행과 수치 안정성을 확인합니다.','다른 구간을 뽑을 때마다 오르내릴 수 있습니다.','지속적인 급증이나 유한하지 않은 값은 학습률과 데이터를 확인할 신호입니다.','한 Step의 값보다 추세를 확인하세요.'],
  validation:['Validation Loss','따로 보관한 문장의 다음 토큰 예측 손실','고정된 검증 창에서 교차 엔트로피를 계산합니다. 큰 데이터에서는 최대 24개 창을 고르게 선택합니다.','학습 중 보지 않은 구간에 일반화하는지 확인합니다.','같은 데이터 버전에서는 완만한 변화나 정체가 가능합니다.','학습 손실이 내려가며 검증 손실이 계속 오르면 과적합을 살펴보세요.','학습 손실은 업데이트 직전, 검증 손실은 같은 Step의 업데이트 직후입니다. 데이터 버전과 미등록 문자 비율을 확인하세요.'],
  perplexity:['Perplexity','평균 예측 불확실성을 해석하는 지표','Perplexity = exp(평균 교차 엔트로피).','예측이 정답에 얼마나 집중되는지 비교합니다.','같은 데이터와 어휘에서는 손실을 따라 움직입니다.','급등 시 어휘, 입력 정리, 학습률을 확인하세요.','토크나이저와 평가 데이터가 같은 결과끼리 비교하세요.'],
  rate:['Learning Rate','Adam이 적용하는 스텝 크기의 계수','지금 버전은 모델 설정의 고정 학습률을 사용합니다.','손실 발산과 느린 수렴을 진단할 때 확인합니다.','고정 설정에서 같은 값이 이어집니다.','손실이 흔들리거나 정체되는 경우 기울기와 함께 보세요.','Adam의 실제 텐서별 업데이트 크기는 모멘트와 기울기의 영향도 받습니다.'],
  gradientNorm:['Gradient Norm','역전파에서 나온 기울기의 전체 크기','클리핑 전 전체 학습 파라미터 기울기의 L2 노름을 계산합니다.','폭주나 학습 신호 약화를 추적합니다.','미니배치마다 다를 수 있습니다.','크기가 반복적으로 치솟거나 거의 0이면 원인을 조사하세요.','모델 차원, 데이터, 손실의 정규화 방식에 따라 달라집니다.'],
  epoch:['Step / Epoch','Step은 완료한 가중치 갱신 횟수입니다. Epoch는 현재 학습 분할 크기 대비 누적 토큰 배수입니다.','처리 토큰 수를 현재 데이터 버전의 학습 토큰 수로 나눕니다.','학습 계산량을 데이터 규모와 함께 비교합니다.','무작위 창을 사용해 모든 위치를 한 번씩 방문한다는 보장은 없습니다.','예상보다 진행이 느리면 데이터 길이와 브라우저 실행 상태를 확인하세요.','데이터 버전 변경 시 분모가 바뀝니다.'],
  tokens:['Tokens Processed','모델이 학습 손실을 계산한 정답 토큰 수','각 스텝의 예측 대상 문자 토큰 수를 누적합니다.','학습한 양을 비교할 때 사용합니다.','반복해서 처리한 토큰도 포함됩니다.','학습 중 장시간 같은 값이면 실행 상태와 로그를 확인하세요.','검증, 고정 평가와 문장 생성 토큰은 학습량 집계에서 제외됩니다.'],
  speed:['Tokens/sec','학습 엔진의 Step당 처리 속도','예측 대상 토큰 수를 해당 Step의 실제 계산 시간으로 나눕니다.','실행 환경과 모델 크기의 영향을 파악합니다.','검증을 함께 수행한 Step과 발열 상태에 따라 달라집니다.','지속 저하는 발열과 다른 탭의 계산 부하를 확인할 계기입니다.','Worker 대기와 체크포인트 I/O를 제외한 계산 속도입니다.'],
  time:['Training Time','학습 엔진이 실제 계산에 사용한 누적 시간','Worker 타이머로 각 Step의 손실·역전파·업데이트와 예약된 평가 시간을 합산합니다.','실험 자원과 처리량 비교에 활용합니다.','평가 Step에서 조금 더 늘어날 수 있습니다.','값이 멈출 때 브라우저가 탭을 일시 중단했는지 확인하세요.','탭 대기, 저장, 생성 시간은 제외합니다.'],
  checkpoint:['Checkpoint','특정 Step에서 계속 학습할 수 있도록 저장한 모델 상태','가중치, Adam 모멘트, 구성, 어휘, 데이터 버전, 난수 상태와 이력을 함께 기록합니다.','학습을 재개하고 같은 모델의 시점을 비교할 수 있습니다.','100 Step마다 자동 저장하고 일시정지·종료 시 저장합니다.','저장 오류가 나면 브라우저 공간 또는 다른 탭에서의 저장 여부를 확인하세요.','같은 브라우저의 저장소에서 복원합니다. 브라우저 데이터 삭제 시 체크포인트도 삭제될 수 있습니다.'],
  weightNorm:['Weight Norm','업데이트 직전 전체 가중치 크기','모든 학습 파라미터의 제곱합에 제곱근을 씌웁니다.','모델의 가중치 규모 변화를 추적합니다.','학습 중 커지거나 작아질 수 있습니다.','갑작스럽게 발산할 경우 학습률과 업데이트 비율을 확인하세요.','레이어별 크기와 초기화가 전체 노름에 영향을 줍니다.'],
  updateRatio:['Update-to-Weight Ratio','마지막 Step에서 가중치가 상대적으로 움직인 크기','실제 업데이트의 L2 노름을 업데이트 직전 가중치 L2 노름으로 나눕니다.','학습률과 Adam 업데이트의 효과를 비교합니다.','초기와 뒷부분의 비율은 달라질 수 있습니다.','급격한 변화는 손실 및 기울기와 함께 조사하세요.','전체 비율은 개별 파라미터의 큰 변화를 가릴 수 있습니다.'],
  accuracy:['토큰 예측 정확도','최고 확률 후보가 정답과 일치한 비율','창에서 각 정답 ID와 최대 logit ID를 비교합니다.','손실과 별개로 정확히 맞춘 문자의 비율을 파악합니다.','손실이 줄어도 1위가 그대로면 정확도는 같을 수 있습니다.','검증 정확도가 계속 떨어지면 일반화와 어휘를 확인하세요.','문장 전체의 정확성이나 언어 이해를 측정하려면 별도의 평가가 필요합니다.'],
  clipping:['Gradient Clipping','기울기 크기 제한 적용 여부','전체 L2 노름이 1보다 클 때 모든 기울기를 같은 계수로 축소합니다.','갱신 안정성과 클리핑 빈도를 추적합니다.','초기나 어려운 데이터에서 나타날 수 있습니다.','대부분의 Step에서 계속 제한되면 학습률과 손실을 살펴보세요.','표시된 원래 기울기와 Adam에 입력된 기울기의 크기가 달라질 수 있습니다.'],
  memory:['파라미터 메모리','엔진이 갖고 있는 파라미터 배열의 크기','현재·초기 가중치, 기울기, 두 Adam 모멘트와 마지막 갱신 배열의 바이트를 합산합니다.','모델 규모가 상주 메모리에 주는 영향을 확인합니다.','같은 모델에서 값은 일정합니다.','탭 전체 메모리가 증가하면 평가나 이력의 보관 비용을 함께 살펴보세요.','브라우저 전체 메모리 및 CPU 사용률은 제공 가능한 공통 브라우저 계측값이 없어 미측정으로 표시합니다.'],
  distribution:['가중치·기울기 분포','현재 텐서 값과 마지막 역전파 기울기의 분포','각 분포에서 절대 최댓값을 기준으로 같은 폭의 구간 17개를 계산합니다.','큰 값과 0 근처에 집중된 값을 확인합니다.','가중치와 기울기는 각자 다른 범위에 놓일 수 있습니다.','범위 급증은 큰 기울기나 발산의 신호일 수 있습니다.','각 그림의 축 범위가 달라질 수 있어 막대 모양과 수치를 함께 확인하세요.'],
  tokenLoss:['토큰별 교차 엔트로피','정답 문자별 평균 예측 손실','검증 및 표본 학습 Step에서 같은 정답 ID의 손실 합계를 등장 횟수로 나눕니다.','어떤 문자에서 모델이 자주 틀리는지 찾습니다.','등장 횟수가 적은 문자에서는 값이 흔들릴 수 있습니다.','빈도가 높은 토큰의 손실이 지속적으로 높으면 데이터와 문맥을 확인하세요.','미등록 토큰은 여러 글자를 한 항목으로 합쳐 표시합니다.'],
  data:['데이터셋 통계','문서, 문자, 토큰, 어휘 및 분할의 크기','정리한 문서에서 문장 중복을 제거하고 학습/검증을 나눈 뒤 문자 토큰을 셉니다.','훈련 범위와 검증에 포함된 미등록 문자를 확인합니다.','자료 변경 시 토큰 수와 검증 분할이 달라집니다.','검증 미등록 비율이 크면 결과가 왜곡될 수 있습니다.','문자 수는 원문 정리본, 토큰 수는 중복 제거 후 분할의 표적을 기준으로 합니다.']
};

export const helpLabels=['의미','계산 원리','확인하는 이유','나타날 수 있는 변화','살펴볼 신호','해석 시 주의점'];

export function drawLoss(canvas,history) {
  if(!canvas.clientWidth||!canvas.clientHeight) return;
  const scale=Math.min(2,window.devicePixelRatio||1), width=canvas.clientWidth, height=canvas.clientHeight;
  canvas.width=Math.round(width*scale);
  canvas.height=Math.round(height*scale);
  const ctx=canvas.getContext('2d');
  ctx.scale(scale,scale);
  const startX=37, endX=width-15, top=12, bottom=height-25;
  const first=history[0]?.step??0, last=Math.max(first+1,history.at(-1)?.step??1);
  let maximum=1;
  for(const m of history) maximum=Math.max(maximum,m.train,m.val??0);
  maximum=maximum>2 ? Math.ceil(maximum) : Math.ceil(maximum*4)/4;
  const x=step=>startX+(step-first)/(last-first)*(endX-startX);
  const y=value=>bottom-(value/maximum)*(bottom-top);
  ctx.font='11px system-ui';
  ctx.textBaseline='middle';
  for(let tick=0;tick<=4;tick++) {
    const value=maximum*tick/4, point=y(value);
    ctx.strokeStyle='#e5eaf2';
    ctx.beginPath();ctx.moveTo(startX,point);ctx.lineTo(endX,point);ctx.stroke();
    if(history.length) {
      ctx.textAlign='right';ctx.fillStyle='#586981';ctx.fillText(value.toFixed(2),startX-5,point);
    }
  }
  if(!history.length) return;
  ctx.fillStyle='#586981';ctx.textAlign='left';ctx.fillText(String(first),startX,bottom+13);
  ctx.textAlign='right';ctx.fillText(String(history.at(-1).step),endX,bottom+13);
  ctx.textAlign='center';ctx.fillText('Step',(startX+endX)/2,bottom+13);

  for(const [key,color] of [['train','#405dc2'],['val','#0b867d']]) {
    ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=key==='val'?2:1.5;
    ctx.beginPath();
    let previous=null, count=0;
    for(const metric of history) {
      if(!Number.isFinite(metric[key])) continue;
      const pointX=x(metric.step), pointY=y(metric[key]);
      if(!previous||previous.datasetVersion!==metric.datasetVersion) ctx.moveTo(pointX,pointY);
      else ctx.lineTo(pointX,pointY);
      previous=metric;
      count++;
    }
    ctx.stroke();
    if(count===1) {
      ctx.beginPath();ctx.arc(x(previous.step),y(previous[key]),3,0,Math.PI*2);ctx.fill();
    }
  }
}
