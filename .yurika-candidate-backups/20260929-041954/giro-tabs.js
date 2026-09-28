(() => {
  'use strict';

  const main = document.querySelector('main');
  if (!main || document.querySelector('#giroAppShell')) return;

  document.body.classList.add('giro-v2');
  const header = main.querySelector(':scope > header');
  const children = Array.from(main.children).filter(el => el !== header);

  const shell = document.createElement('section');
  shell.id = 'giroAppShell';
  shell.setAttribute('aria-label','YURIKA Audio モナティアム操作パネル');
  shell.innerHTML = `
    <div class="giro-shell-top" id="giroDragHandle" title="ドラッグでパネルを少し移動 / ダブルクリックで中央へ戻す">
      <div class="giro-title-sticker">
        <span class="giro-title-mark" aria-hidden="true">♪</span>
        <div><strong>YURIKA Audio</strong><small>モナティアム音響広場</small></div>
      </div>
      <div class="giro-drag-note" aria-hidden="true">↕ つまんで移動</div>
    </div>
    <div class="giro-tabs" id="giroTabs" role="tablist" aria-label="オーディオ設定タブ"></div>
    <div class="giro-shell-body">
      <aside class="giro-scene" id="giroScene" aria-label="ジーロキャラクターエリア"></aside>
    </div>
    <div class="giro-action-toast" id="giroActionToast" role="status" aria-live="polite" data-state="idle">操作状態: 待機中</div>`;

  document.body.appendChild(shell);
  const top = shell.querySelector('.giro-shell-top');
  const tabStrip = shell.querySelector('#giroTabs');
  const shellBody = shell.querySelector('.giro-shell-body');
  const scene = shell.querySelector('#giroScene');

  if (header) {
    header.classList.add('giro-original-header');
    const oldTitle = header.querySelector('h1');
    const oldSubtitle = header.querySelector('p');
    if (oldTitle) oldTitle.textContent = '音響制御';
    if (oldSubtitle) oldSubtitle.textContent = 'ローカル処理 / 既存DSPを維持';
    top.appendChild(header);
  }
  shellBody.appendChild(main);

  const groups = [
    { id:'home', label:'ホーム', accent:'sun', nodes:[0,1,2] },
    { id:'sound', label:'音づくり', accent:'mint', nodes:[3,4,5,6,7,8,9] },
    { id:'scene', label:'演出', accent:'lilac', nodes:[10,11,12] },
    { id:'space', label:'空間', accent:'blue', nodes:[13,14,15,16] },
    { id:'mix', label:'ミックス', accent:'coral', nodes:[17,18] },
    { id:'diag', label:'診断', accent:'leaf', nodes:[19,20] }
  ];

  const panels = new Map();
  groups.forEach((g, idx) => {
    const btn = document.createElement('button');
    const panelId=`giroPanel-${g.id}`, tabId=`giroTab-${g.id}`;
    btn.type = 'button'; btn.id=tabId;
    btn.className = `giro-tab giro-tab-${g.accent}`;
    btn.dataset.tab = g.id;
    btn.setAttribute('role','tab');
    btn.setAttribute('aria-controls',panelId);
    btn.setAttribute('aria-selected', idx === 0 ? 'true' : 'false');
    btn.tabIndex = idx===0 ? 0 : -1;
    btn.draggable = true;
    btn.innerHTML = `<span class="giro-tab-dot" aria-hidden="true"></span><span>${g.label}</span>`;
    tabStrip.appendChild(btn);

    const panel = document.createElement('section');
    panel.id=panelId;
    panel.className = 'giro-tab-panel';
    panel.dataset.panel = g.id;
    panel.setAttribute('role','tabpanel');
    panel.setAttribute('aria-labelledby',tabId);
    panel.hidden = idx !== 0;
    panels.set(g.id,panel);
    main.appendChild(panel);
    g.nodes.forEach(i => { if (children[i]) panel.appendChild(children[i]); });
  });

  function tabButtons(){ return Array.from(tabStrip.querySelectorAll('.giro-tab')); }
  function activate(id, focus=false) {
    let activeButton=null;
    for (const btn of tabButtons()) {
      const on = btn.dataset.tab === id;
      btn.setAttribute('aria-selected', String(on));
      btn.tabIndex=on?0:-1;
      btn.classList.toggle('active', on);
      if(on) activeButton=btn;
    }
    for (const [key,panel] of panels) panel.hidden = key !== id;
    main.scrollTop = 0;
    if(focus) activeButton?.focus({preventScroll:true});
    window.dispatchEvent(new CustomEvent('giroTabChanged',{detail:{id}}));
  }
  activate('home');

  let suppressClickUntil=0;
  tabStrip.addEventListener('click', e => {
    const btn = e.target.closest('.giro-tab');
    if (!btn || performance.now()<suppressClickUntil) return;
    activate(btn.dataset.tab);
  });
  tabStrip.addEventListener('keydown',e=>{
    const current=e.target.closest('.giro-tab');
    if(!current) return;
    const buttons=tabButtons(); const index=buttons.indexOf(current);
    let next=-1;
    if(e.key==='ArrowRight') next=(index+1)%buttons.length;
    else if(e.key==='ArrowLeft') next=(index-1+buttons.length)%buttons.length;
    else if(e.key==='Home') next=0;
    else if(e.key==='End') next=buttons.length-1;
    if(next>=0){e.preventDefault();activate(buttons[next].dataset.tab,true);}
  });

  // Drag tabs to reorder. Order is intentionally session-only.
  let dragTab = null;
  tabStrip.addEventListener('dragstart', e => {
    const btn = e.target.closest('.giro-tab');
    if (!btn) return;
    dragTab = btn; btn.classList.add('dragging');
    if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain',btn.dataset.tab || ''); }
  });
  tabStrip.addEventListener('dragend', () => {
    dragTab?.classList.remove('dragging'); dragTab = null; suppressClickUntil=performance.now()+180;
  });
  tabStrip.addEventListener('dragover', e => {
    e.preventDefault();
    if (!dragTab) return;
    const over = e.target.closest('.giro-tab');
    if (!over || over === dragTab) return;
    const r = over.getBoundingClientRect();
    tabStrip.insertBefore(dragTab, e.clientX < r.left + r.width/2 ? over : over.nextSibling);
  });

  // Drag whole group, while keeping the board fully inside the 800x600 canvas.
  let draggingShell = false, sx=0, sy=0, ox=0, oy=0;
  const pos = {x:0,y:0};
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function bounds(){
    const pad=8, left=shell.offsetLeft, topPx=shell.offsetTop;
    return {
      minX:pad-left,
      maxX:window.innerWidth-pad-left-shell.offsetWidth,
      minY:pad-topPx,
      maxY:window.innerHeight-pad-topPx-shell.offsetHeight
    };
  }
  function clampShell(){
    const b=bounds();
    pos.x=clamp(pos.x,Math.min(b.minX,b.maxX),Math.max(b.minX,b.maxX));
    pos.y=clamp(pos.y,Math.min(b.minY,b.maxY),Math.max(b.minY,b.maxY));
  }
  function applyShellPos() { clampShell(); shell.style.transform = `translate3d(${pos.x}px,${pos.y}px,0)`; }
  function resetShell(){pos.x=0;pos.y=0;applyShellPos();}

  top.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.target.closest('button,input,label,select,a')) return;
    draggingShell = true; sx=e.clientX; sy=e.clientY; ox=pos.x; oy=pos.y;
    top.setPointerCapture?.(e.pointerId); shell.classList.add('moving');
  });
  top.addEventListener('pointermove', e => {
    if (!draggingShell) return;
    pos.x=ox + e.clientX - sx; pos.y=oy + e.clientY - sy; applyShellPos();
  });
  function endShellDrag(){ draggingShell=false; shell.classList.remove('moving'); }
  top.addEventListener('pointerup',endShellDrag);
  top.addEventListener('pointercancel',endShellDrag);
  top.addEventListener('lostpointercapture',endShellDrag);
  top.addEventListener('dblclick',e=>{if(!e.target.closest('button,input,label,select,a')) resetShell();});
  window.addEventListener('resize',applyShellPos,{passive:true});

  window.dispatchEvent(new CustomEvent('giroShellReady',{detail:{scene,shell,tabStrip}}));
})();
