// Runs independently of module loading so a failed import never leaves a silent blank screen.
(()=>{const status=document.getElementById('evo-status'),retry=document.getElementById('evo-startup-retry');let complete=false;
 const fail=message=>{if(complete)return;status.textContent=message;retry.hidden=false;};
 const timer=setTimeout(()=>fail('화면 로딩이 지연되고 있습니다. 학습 데이터를 지우지 않고 화면을 다시 불러올 수 있습니다.'),10000);
 retry.onclick=()=>{const url=new URL(location.href);url.searchParams.set('evo-release','biped7-'+Date.now());location.replace(url.href);};
 window.evolutionStartup={ready(){complete=true;clearTimeout(timer);retry.hidden=true;},fail};
 window.addEventListener('error',e=>{const src=e.target?.src||e.filename||'';if(src.includes('evolution')||(!window.evolutionLab&&e.message))fail('로봇 화면 파일을 불러오지 못했습니다. 아래 버튼으로 다시 불러와 주세요. 기존 학습 데이터는 유지됩니다.');},true);
 window.addEventListener('unhandledrejection',()=>{if(!window.evolutionLab?.frame)fail('로봇 화면 초기화를 완료하지 못했습니다. 기존 학습 데이터는 유지됩니다. 화면을 다시 불러와 주세요.');});
})();
