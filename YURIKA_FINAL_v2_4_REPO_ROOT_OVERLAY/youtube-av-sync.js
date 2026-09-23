(() => {
  "use strict";
  let last=0;
  function sample(){
    const v=document.querySelector('video'); if(!v||!Number.isFinite(v.currentTime))return;
    const now=performance.now(); if(now-last<500)return; last=now;
    chrome.runtime.sendMessage({target:"service-worker",type:"VIDEO_TELEMETRY",payload:{mediaTime:v.currentTime,paused:v.paused,playbackRate:v.playbackRate,readyState:v.readyState,wallTimeMs:Date.now()}}).catch(()=>{});
  }
  setInterval(sample,500); document.addEventListener('visibilitychange',sample,{passive:true});
})();
