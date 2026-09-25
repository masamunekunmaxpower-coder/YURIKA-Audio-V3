(() => {
  'use strict';

  const STATUS_POLL_MS = 650;
  const WALK_SPEED = 78;
  const RUN_SPEED = 300;
  const EXPLAIN_MS = 5200;
  const BORED_AFTER_MS = 9000;
  const MUSIC_CONFIRM_MS = 850;
  const MUSIC_RELEASE_MS = 1350;

  const POSES = {
    idle:'assets/giro-poses/giro-idle.webp',
    walk:'assets/giro-poses/giro-walk.webp',
    run:'assets/giro-poses/giro-run.webp',
    sit:'assets/giro-poses/giro-sit.webp',
    music:'assets/giro-poses/giro-music.webp',
    explain:'assets/giro-poses/giro-explain.webp'
  };

  const explain = {
    openV3Guide:['ガイドやな。','迷子になった時用や。ワイも迷うから気持ちは分かる。'],
    autoDetectHeadphone:['出力の自動検出や。','見えている出力名から近い補正プロファイルを選ぶ。透視能力ではないで。'],
    headphoneTestTone:['テスト信号いくで。','小さい信号を鳴らして経路確認するやつ。音量だけは油断せんといてな。'],
    headphoneCalibrate:['測定＆補正や。','測定条件が成立した時だけ補正値を作る。怪しい測定は採用せん。そこは妙に真面目や。'],
    headphoneCalibrationReset:['測定補正を戻すで。','測定で足した補正だけ戻す。元のDSPを消すボタンではない。'],
    autoQuiet:['Quietや。','自動音圧を静かめへ。夜とか、耳を休ませたい時向けやな。'],
    autoReference:['Reference。','自動音圧を基準寄りに戻す。迷った時の無難枠。'],
    autoDj:['DJ Levelや。','ちょい押し出す方向。クリップ大会の開催ボタンではないで。'],
    autoOff:['Auto LevelだけOFF。','ほかのDSP設定は残る。全部消し飛ばす赤いボタンではない。'],
    refreshTabs:['YouTubeタブ一覧を更新や。','対象タブが増えた時に再取得する。人類、タブ増やしすぎ問題。'],
    armDeckA:['Deck Aへ入れるで。','今のタブをA側へ割り当てる。'],
    armDeckB:['Deck Bへ入れるで。','こっちはB側。AとBでミックスする準備やな。'],
    stopDeckA:['Deck A解除。','A側だけ止める。通常DSPは巻き込まん。'],
    stopDeckB:['Deck B解除。','B側だけ解除や。'],
    autoMixAB:['AからBへAUTO MIX。','指定秒数で滑らかに移す。再生ボタンまで勝手に押すほど図々しくはない。'],
    autoMixBA:['BからAへAUTO MIX。','向きが逆なだけで考え方は同じ。'],
    startExternal:['外部入力や。','マイク／ライン入力を使う実験枠。物理フォノ段に変身するわけではないで。']
  };

  const scene = document.querySelector('#giroScene');
  if (!scene) return;

  scene.innerHTML = `
    <div id="giroStage" data-ready="0" data-mode="idle" data-rim-mode="idle">
      <div class="giro-stage-sign"><strong>ジーロの音響散歩</strong><span>MONATIUM / YURIKA Audio</span></div>
      <div class="giro-auto-se" id="giroSeState">SE：操作後ON / 表示中のみ</div>
      <div class="giro-ground"></div>
      <div class="giro-rim-wrap" id="giroRim" aria-hidden="true"><img src="assets/rim-116-ram-companion.webp" alt="" decoding="async"></div>
      <div class="giro-rim-badge" aria-hidden="true">RIM外装 / RAM意匠</div>
      <span class="giro-music-note n1" aria-hidden="true">♪</span><span class="giro-music-note n2" aria-hidden="true">♫</span><span class="giro-music-note n3" aria-hidden="true">♪</span>
      <div class="giro-bubble" id="giroBubble" role="status" aria-live="polite" aria-atomic="true"><span id="giroBubbleText"></span><small id="giroBubbleSub"></small></div>
      <div class="giro-actor pose-idle" id="giroActor" aria-label="ジーロ">
        <div class="giro-pose-stack" id="giroPoseStack">
          <img class="giro-pose-layer active" data-pose="idle" src="${POSES.idle}" alt="ジーロ" decoding="async">
          <img class="giro-pose-layer" data-pose="walk" src="${POSES.walk}" alt="" decoding="async">
          <img class="giro-pose-layer" data-pose="run" src="${POSES.run}" alt="" decoding="async">
          <img class="giro-pose-layer" data-pose="sit" src="${POSES.sit}" alt="" decoding="async">
          <img class="giro-pose-layer" data-pose="music" src="${POSES.music}" alt="" decoding="async">
          <img class="giro-pose-layer" data-pose="explain" src="${POSES.explain}" alt="" decoding="async">
        </div>
      </div>
      <div class="giro-status-ribbon" id="giroStatus" role="status" aria-live="polite">そのへんで音待ち中</div>
    </div>`;

  const ui = {
    stage:scene.querySelector('#giroStage'), actor:scene.querySelector('#giroActor'), rim:scene.querySelector('#giroRim'),
    rimImg:scene.querySelector('#giroRim img'), seState:scene.querySelector('#giroSeState'),
    bubble:scene.querySelector('#giroBubble'), bubbleText:scene.querySelector('#giroBubbleText'), bubbleSub:scene.querySelector('#giroBubbleSub'),
    status:scene.querySelector('#giroStatus'), poseLayers:Array.from(scene.querySelectorAll('.giro-pose-layer'))
  };

  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
  const st = {
    x:24, targetX:24, face:1, mode:'idle', lastFrame:performance.now(), nextWander:performance.now()+1800,
    manualUntil:0, explanation:null, bubbleUntil:0, noMusicSince:performance.now(), rawMusicSince:0, music:false,
    lastTelemetry:null, status:null, audioCtx:null, sfxArmed:document.visibilityState==='visible', lastStep:0, stepNo:0, bored:false,
    relaxUntil:0, nextNoteAt:0, noteBurstUntil:0, rafId:0, pollTimer:0, destroyed:false, diagnosticMode:false
  };

  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const now=()=>performance.now();

  function updateRimModeAttr(){
    if(ui.stage) ui.stage.dataset.rimMode = st.bored ? 'bored' : st.mode;
  }
  function setPose(name){
    if (!POSES[name]) name='idle';
    if (st.mode===name) { updateRimModeAttr(); return; }
    st.mode=name;
    ui.stage.dataset.mode=name;
    ui.actor.className=`giro-actor pose-${name}${st.bored?' bored':''}`;
    for (const layer of ui.poseLayers) layer.classList.toggle('active', layer.dataset.pose===name);
    updateRimModeAttr();
  }
  function decodeImage(img){
    if(!img) return Promise.resolve();
    try{
      if(img.complete && img.naturalWidth>0) return img.decode?.().catch(()=>{}) ?? Promise.resolve();
      if(typeof img.decode==='function') return img.decode().catch(()=>{});
    }catch{}
    return new Promise(resolve=>{
      img.addEventListener('load',resolve,{once:true});
      img.addEventListener('error',resolve,{once:true});
    });
  }
  async function warmVisuals(){
    await Promise.allSettled([...ui.poseLayers.map(decodeImage), decodeImage(ui.rimImg)]);
    if(!st.destroyed) ui.stage.dataset.ready='1';
  }

  function setStatus(t){ ui.status.textContent=t; }
  function showBubble(a,b='',ms=3400){
    ui.bubbleText.textContent=a; ui.bubbleSub.textContent=b; ui.bubbleSub.style.display=b?'block':'none';
    ui.bubble.classList.add('visible'); st.bubbleUntil=now()+ms;
  }
  function hideBubble(){ui.bubble.classList.remove('visible');st.bubbleUntil=0;}

  function chooseWander(){
    if(reduceMotion){st.targetX=24;st.nextWander=now()+8000;return;}
    st.targetX=8+Math.random()*34;
    st.nextWander=now()+3600+Math.random()*4200;
  }

  function generic(el){
    const label=(el.textContent||el.getAttribute('aria-label')||'その操作').trim().replace(/\s+/g,' ').slice(0,42);
    return [`「${label}」やな。`,'元のYURIKA Audio側の処理をそのまま使う。ワイは説明しに来ただけや。'];
  }
  function callForControl(el){
    const pair=explain[el.id]||generic(el);
    st.explanation={title:pair[0],detail:pair[1],arrived:false};
    st.targetX=32; st.manualUntil=now()+EXPLAIN_MS+1800; st.bored=false;
    setPose(reduceMotion?'explain':'run'); setStatus(reduceMotion?'機能説明中':'呼ばれたので駆け付け中'); hideBubble();
    if(reduceMotion){
      st.explanation.arrived=true; showBubble(pair[0],pair[1],EXPLAIN_MS); st.manualUntil=now()+EXPLAIN_MS;
    }
  }

  document.addEventListener('click',e=>{
    const b=e.target.closest?.('button');
    if (!b || b.classList.contains('giro-tab')) return;
    callForControl(b);
  },true);
  document.addEventListener('change',e=>{
    const el=e.target;
    if (el?.id==='enabled' || el?.id==='preset') callForControl(el);
  },true);

  function updateSeState(){
    if(!ui.seState) return;
    if(st.diagnosticMode){ui.seState.textContent='SE：診断中停止';return;}
    if(document.visibilityState!=='visible'){ui.seState.textContent='SE：停止中';return;}
    if(st.audioCtx?.state==='running') ui.seState.textContent='SE：ON / このタブ表示中のみ';
    else ui.seState.textContent='SE：操作後ON / 表示中のみ';
  }
  function unlockAudio(){
    if (st.diagnosticMode || !st.sfxArmed || document.visibilityState!=='visible') return;
    if (!st.audioCtx){
      try{ st.audioCtx=new AudioContext({latencyHint:'interactive'}); }
      catch{ updateSeState(); return; }
    }
    if (st.audioCtx.state==='suspended') st.audioCtx.resume().then(updateSeState).catch(updateSeState);
    else updateSeState();
  }
  function stepSound(running){
    if (st.diagnosticMode || reduceMotion || !st.sfxArmed || document.visibilityState!=='visible' || !st.audioCtx || st.audioCtx.state!=='running') return;
    const ctx=st.audioCtx,t=ctx.currentTime;
    const variance=.97+Math.random()*.06;
    const g=ctx.createGain(),o=ctx.createOscillator(),bp=ctx.createBiquadFilter();
    bp.type='bandpass';bp.frequency.value=(running?1550:1150)*variance;bp.Q.value=5;
    o.type='triangle';o.frequency.setValueAtTime((running?1420:1050)*variance,t);o.frequency.exponentialRampToValueAtTime((running?590:460)*variance,t+.032);
    const peak=(running?.017:.011)*(0.92+Math.random()*.12);
    g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(peak,t+.004);g.gain.exponentialRampToValueAtTime(.0001,t+.052);
    o.connect(bp);bp.connect(g);g.connect(ctx.destination);o.start(t);o.stop(t+.06);
    if ((st.stepNo++%2)===0){
      const c=ctx.createOscillator(),cg=ctx.createGain();c.type='sine';c.frequency.value=(2920+(st.stepNo%3)*190)*variance;
      cg.gain.setValueAtTime(.0001,t+.014);cg.gain.exponentialRampToValueAtTime(.0055,t+.019);cg.gain.exponentialRampToValueAtTime(.0001,t+.07);
      c.connect(cg);cg.connect(ctx.destination);c.start(t+.014);c.stop(t+.075);
    }
  }
  document.addEventListener('pointerdown',unlockAudio,{capture:true,passive:true});

  function freshest(map){
    if (!map||typeof map!=='object') return null;let best=null;
    for(const v of Object.values(map)){if(v&&typeof v==='object'&&(!best||Number(v.wallTimeMs||0)>Number(best.wallTimeMs||0)))best=v;}
    return best;
  }
  function musicUpdate(status){
    st.status=status;const n=now();
    const rms=Number(status?.safetyRms);const rmsOk=Number.isFinite(rms)&&rms>.0012;
    const t=st.lastTelemetry && Date.now()-Number(st.lastTelemetry.wallTimeMs||0)<1800?st.lastTelemetry:freshest(status?.videoTelemetry);
    const playing=Boolean(t&&t.paused===false&&Number(t.readyState||0)>=2&&Date.now()-Number(t.wallTimeMs||0)<2200);
    const raw=playing||(Boolean(status?.active)&&rmsOk);
    if(raw){
      if(!st.rawMusicSince)st.rawMusicSince=n;st.noMusicSince=0;
      if(!st.music&&n-st.rawMusicSince>MUSIC_CONFIRM_MS){st.music=true;st.bored=false;st.explanation=null;st.targetX=14;setPose('music');setStatus('音きた。ノリノリ中');showBubble('お、鳴った！ ええやん。','こういう時間は好きやで。',2400);}
    }else{
      st.rawMusicSince=0;if(!st.noMusicSince)st.noMusicSince=n;
      if(st.music&&n-st.noMusicSince>MUSIC_RELEASE_MS){st.music=false;setStatus('音待ち中');}
    }
  }
  async function poll(){
    if(st.destroyed || st.diagnosticMode || document.visibilityState!=='visible') return;
    try{const s=await chrome.runtime.sendMessage({target:'service-worker',type:'STATUS'});musicUpdate(s||{});}catch{}
  }
  try{chrome.runtime.onMessage.addListener(m=>{if(m?.type==='VIDEO_TELEMETRY'&&m.payload){st.lastTelemetry=m.payload;musicUpdate(st.status||{});}return false;});}catch{}

  function updateMusicNotes(n){
    const active=!st.diagnosticMode && st.music && !st.explanation && document.visibilityState==='visible' && !reduceMotion;
    if(!active){
      ui.stage.classList.remove('music-note-burst');
      st.noteBurstUntil=0; st.nextNoteAt=0; return;
    }
    if(st.noteBurstUntil && n>=st.noteBurstUntil){
      ui.stage.classList.remove('music-note-burst'); st.noteBurstUntil=0;
    }
    if(!st.nextNoteAt) st.nextNoteAt=n+480;
    if(!st.noteBurstUntil && n>=st.nextNoteAt){
      ui.stage.classList.remove('music-note-burst');
      void ui.stage.offsetWidth;
      ui.stage.classList.add('music-note-burst');
      st.noteBurstUntil=n+780;
      st.nextNoteAt=n+2050+Math.random()*1350;
    }
  }

  function tick(n){
    st.rafId=0;
    if(st.destroyed || st.diagnosticMode || document.visibilityState!=='visible') return;
    const dt=clamp((n-st.lastFrame)/1000,.001,.05);st.lastFrame=n;

    if(st.explanation){
      const d=Math.abs(st.targetX-st.x);
      if(!st.explanation.arrived&&d<4){st.explanation.arrived=true;setPose('explain');setStatus('機能説明中');showBubble(st.explanation.title,st.explanation.detail,EXPLAIN_MS);st.manualUntil=n+EXPLAIN_MS;}
      if(st.explanation.arrived&&n>=st.manualUntil){st.explanation=null;st.nextWander=n+1000;}
    }

    if(!st.explanation && !st.music){
      if(st.noMusicSince && n-st.noMusicSince>=BORED_AFTER_MS){
        if(!st.bored){st.bored=true;st.targetX=8;showBubble('……音ないやん。','ワイ、ここで待っとるわ。',3200);}
        setStatus('音がなくて退屈中');
      }else st.bored=false;
      if(n>=st.nextWander && Math.abs(st.targetX-st.x)<5) chooseWander();
    }

    const dx=st.targetX-st.x,dist=Math.abs(dx);
    const running=Boolean(st.explanation&&!st.explanation.arrived&&!reduceMotion);
    if(dist>3 && !reduceMotion){
      const speed=running?RUN_SPEED:WALK_SPEED;const step=Math.min(dist,speed*dt);st.x+=Math.sign(dx)*step;st.face=dx>=0?1:-1;
      st.relaxUntil=0;
      if(!st.music)setPose(running?'run':'walk');
      const interval=running?150:320;if(n-st.lastStep>interval){st.lastStep=n;stepSound(running);}
    }else if(!st.explanation&&!st.music){
      if(st.bored){
        if(st.mode!=='sit') st.relaxUntil=n+2600;
        setPose('sit');
      }else if(st.mode==='sit'){
        if(!st.relaxUntil) st.relaxUntil=n+2200+Math.random()*1800;
        if(n>=st.relaxUntil){ st.relaxUntil=0; setPose('idle'); }
      }else if(st.mode!=='idle'){
        setPose('idle');
      }else if(!reduceMotion && Math.random()<.0012){
        st.relaxUntil=n+2200+Math.random()*2400; setPose('sit');
      }
    }

    if(st.music&&!st.explanation){ st.relaxUntil=0; setPose('music'); }
    updateMusicNotes(n);
    ui.actor.classList.toggle('bored',st.bored); ui.stage.classList.toggle('bored',st.bored); updateRimModeAttr();
    ui.actor.style.transform=`translate3d(${st.x.toFixed(1)}px,162px,0) scaleX(${st.face})`;
    if(ui.rim){
      // RIM is a companion, not a costume layer: keep its silhouette clearly separated on Giro's right.
      const rimX=clamp(st.x+126,126,148);
      const rimY=st.mode==='sit'?300:st.mode==='idle'?294:302;
      ui.rim.style.transform=`translate3d(${rimX.toFixed(1)}px,${rimY}px,0)`;
    }
    if(st.bubbleUntil&&n>=st.bubbleUntil&&!st.explanation)hideBubble();
    st.rafId=requestAnimationFrame(tick);
  }

  function startLoop(){
    if(st.destroyed || st.diagnosticMode || st.rafId || document.visibilityState!=='visible') return;
    st.lastFrame=performance.now(); st.rafId=requestAnimationFrame(tick);
  }
  function stopLoop(){ if(st.rafId){cancelAnimationFrame(st.rafId);st.rafId=0;} }

  document.addEventListener('visibilitychange',()=>{
    st.sfxArmed=document.visibilityState==='visible';
    if (!st.sfxArmed){
      stopLoop();
      ui.stage.classList.remove('music-note-burst');
      if(st.audioCtx?.state==='running') st.audioCtx.suspend().then(updateSeState).catch(updateSeState);
    }else{
      updateSeState(); if(!st.diagnosticMode){startLoop(); void poll();}
    }
  });



  // Diagnostics priority mode: the diagnostics tab already polls STATUS at 500 ms
  // from popup.js, so pause Giro's duplicate polling, rAF DOM work, notes and SFX.
  // This keeps the audio/metrics workers as isolated from decorative UI load as possible.
  window.addEventListener('giroTabChanged',e=>{
    const next=e?.detail?.id==='diag';
    if(next===st.diagnosticMode) return;
    st.diagnosticMode=next;
    ui.stage.dataset.diagnostic=next?'1':'0';
    if(next){
      stopLoop();
      ui.stage.classList.remove('music-note-burst');
      st.noteBurstUntil=0; st.nextNoteAt=0;
      st.explanation=null; hideBubble();
      setPose('sit'); setStatus('診断優先モード');
      if(st.audioCtx?.state==='running') st.audioCtx.suspend().then(updateSeState).catch(updateSeState);
      updateSeState();
    }else{
      st.sfxArmed=document.visibilityState==='visible';
      st.nextWander=now()+1200;
      st.relaxUntil=0;
      setPose(st.music?'music':'idle');
      setStatus(st.music?'音きた。ノリノリ中':'音待ち中');
      updateSeState();
      void poll(); startLoop();
    }
  });

  function destroy(){
    if(st.destroyed) return;
    st.destroyed=true; stopLoop();
    if(st.pollTimer) clearInterval(st.pollTimer);
    try{st.audioCtx?.close();}catch{}
  }
  window.addEventListener('pagehide',destroy,{once:true});

  setPose('idle');setStatus('そのへんで音待ち中');showBubble('開いたな。','ワイはジーロ。ボタン押したら走って説明しに行くで。',3300);updateSeState();
  void poll();
  st.pollTimer=setInterval(()=>{if(document.visibilityState==='visible')void poll();},STATUS_POLL_MS);
  void warmVisuals().finally(()=>{startLoop();});
})();
