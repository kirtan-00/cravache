// CravAche TRIAL module: PER-DEPARTMENT OPS MANAGERS  (was: trial_autoassign)
// ---------------------------------------------------------------------------
// You hire a manager PER DEPARTMENT — ₹3,00,000/month each. A department's
// manager auto-routes that department's tray briefs to its OWN idle, capable
// staff. That is the ONLY thing a manager does: no desk, no briefs of its own.
// Hire a design manager and design briefs route themselves; production still
// needs its own manager; and so on. Each is a separate recurring payroll line.
//
//   • Managers become hireable from week 3 (learn the desks by hand first).
//   • A HUD chip opens a small panel listing each unlocked department with a
//     HIRE ₹3L/mo  /  FIRE toggle and its live on/off state.
//   • Routing fires while the sim is live (it wraps G.briefs.update, which only
//     ticks inside simTick), so pause / gameOver / meditation freeze it. It
//     places ONE brief per short cooldown: most-urgent first, to the fastest
//     idle on-clock staffer IN A MANAGED DEPARTMENT that can legally take it.
//   • Each manager's ₹3L/mo is billed at Friday payroll (economy.payrollTotal).
//
// Pure runtime monkey-patch on window.G, all guarded. Loaded AFTER the systems +
// main + hud so it can wrap update + add the chip.
// ---------------------------------------------------------------------------
(function(){
  "use strict";
  if(!window.G) return;
  var G = window.G;

  var SALARY = (G.BAL && G.BAL.MANAGER_SALARY)      || 300000;
  var UNLOCK = (G.BAL && G.BAL.MANAGER_UNLOCK_WEEK) ||
               (G.BAL && G.BAL.AUTOASSIGN_UNLOCK_WEEK) || 3;
  var PROD_UNLOCK = (G.BAL && G.BAL.PRODUCTION_UNLOCK_WEEK) || 2;

  var DEPTS = [
    { key:'designer',   label:'DESIGN' },
    { key:'editor',     label:'EDIT' },
    { key:'content',    label:'CONTENT' },
    { key:'production', label:'PRODUCTION' }
  ];

  var PLACE_EVERY = 0.35;  // sim-seconds between auto-placements (no audio pileup)
  var placeAcc = 0;

  // managers object on state, lazily created (covers old saves / a missing field)
  function mgrs(){
    var s = G.state; if(!s) return {};
    if(!s.managers || typeof s.managers !== 'object'){
      s.managers = { designer:false, editor:false, content:false, production:false };
    }
    return s.managers;
  }
  function anyHired(){ var m = mgrs(); for(var k in m){ if(m[k]) return true; } return false; }
  function hiredCount(){ var m = mgrs(), n = 0; for(var k in m){ if(m[k]) n++; } return n; }
  function deptVisible(key){
    if(key === 'production') return G.state && G.state.week >= PROD_UNLOCK;
    return true;
  }
  function visibleDepts(){ return DEPTS.filter(function(d){ return deptVisible(d.key); }); }

  // ----------------------------------------------------------------- styles
  function injectStyle(){
    if(document.getElementById('mgr-style')) return;
    var css = [
      '#mgr-chip{cursor:pointer;border:none;font-family:inherit;display:none;align-items:center;gap:5px;}',
      '#mgr-chip.mgr-show{display:inline-flex;}',
      '#mgr-chip.mgr-hire{outline:2px solid var(--brass);outline-offset:1px;border-radius:5px;',
        'animation:mgrPulse 1.1s ease-in-out infinite;}',
      '#mgr-chip.mgr-on .chip-val{color:var(--brass,#ffe066);}',
      '@keyframes mgrPulse{0%,100%{box-shadow:0 0 0 0 rgba(255,224,102,.0);}',
        '50%{box-shadow:0 0 10px 2px rgba(255,224,102,.55);}}',
      // the hire/fire panel
      '#mgr-panel{position:absolute;top:46px;right:14px;z-index:80;display:none;',
        'min-width:236px;padding:9px;border:3px solid #05070f;border-radius:4px;',
        'background:var(--navy-dd,#0d1426);color:var(--paper,#f4e8cf);',
        'font-family:"Silkscreen",monospace;box-shadow:3px 3px 0 #000,0 0 22px rgba(0,0,0,.5);}',
      '#mgr-panel.open{display:block;}',
      '#mgr-panel .mgr-ttl{font-size:10px;letter-spacing:1px;color:#9fb3d6;margin-bottom:7px;text-transform:uppercase;}',
      '#mgr-row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:5px 0;}',
      '.mgr-row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:5px 0;}',
      '.mgr-row .mgr-dept{font-size:11px;letter-spacing:1px;}',
      '.mgr-row .mgr-dept .mgr-dot{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:6px;vertical-align:1px;background:#3a4256;}',
      '.mgr-row.on .mgr-dept .mgr-dot{background:#5fd08a;box-shadow:0 0 6px #5fd08a;}',
      '.mgr-btn{cursor:pointer;border:2px solid #05070f;border-radius:3px;font-family:inherit;',
        'font-size:9px;letter-spacing:.5px;padding:5px 7px;line-height:1;text-transform:uppercase;}',
      '.mgr-btn.hire{background:var(--brass,#ffe066);color:#1a120c;}',
      '.mgr-btn.fire{background:#3a2230;color:#ffb3a0;}',
      '.mgr-foot{font-size:9px;color:#8a93a8;margin-top:8px;letter-spacing:.5px;}'
    ].join('');
    var st = document.createElement('style');
    st.id = 'mgr-style'; st.textContent = css;
    document.head.appendChild(st);
  }

  // ----------------------------------------------------------------- the chip
  var chip = null, panel = null, panelOpen = false;
  function ensureChip(){
    if(chip) return chip;
    var hud = document.getElementById('hud');
    if(!hud) return null;
    injectStyle();
    chip = document.createElement('button');
    chip.id = 'mgr-chip';
    chip.className = 'chip';
    chip.innerHTML = '<span class="chip-val" id="mgr-chip-val"></span>';
    chip.title = 'Hire a manager per department to auto-route that dept’s briefs';
    chip.addEventListener('click', function(e){ e.stopPropagation(); togglePanel(); });
    hud.appendChild(chip);
    return chip;
  }

  function ensurePanel(){
    if(panel) return panel;
    var stage = document.getElementById('stage');
    if(!stage) return null;
    panel = document.createElement('div');
    panel.id = 'mgr-panel';
    stage.appendChild(panel);
    // clicking elsewhere closes the panel
    document.addEventListener('click', function(){ if(panelOpen){ panelOpen = false; renderPanel(); } });
    panel.addEventListener('click', function(e){ e.stopPropagation(); });
    return panel;
  }

  function togglePanel(){
    panelOpen = !panelOpen;
    renderPanel();
    try{ (G.audio.tap || G.audio.click || function(){})(); }catch(e){}
  }

  function renderPanel(){
    var p = ensurePanel(); if(!p) return;
    p.classList.toggle('open', panelOpen);
    if(!panelOpen){ return; }
    var m = mgrs();
    var rows = visibleDepts().map(function(d){
      var on = !!m[d.key];
      return '<div class="mgr-row ' + (on ? 'on' : '') + '">' +
        '<span class="mgr-dept"><span class="mgr-dot"></span>' + d.label + '</span>' +
        '<button class="mgr-btn ' + (on ? 'fire' : 'hire') + '" data-dept="' + d.key + '">' +
          (on ? 'FIRE' : 'HIRE ' + shortMoney(SALARY) + '/mo') + '</button>' +
      '</div>';
    }).join('');
    p.innerHTML = '<div class="mgr-ttl">Ops Managers · auto-assign per dept</div>' + rows +
      '<div class="mgr-foot">each manager: ' + money(SALARY) + '/mo, billed Friday</div>';
    var btns = p.querySelectorAll('.mgr-btn');
    for(var i=0;i<btns.length;i++){
      btns[i].addEventListener('click', function(e){
        e.stopPropagation();
        toggleDept(this.getAttribute('data-dept'));
      });
    }
  }

  function toggleDept(dept){
    var s = G.state; if(!s) return;
    if(s.week < UNLOCK){
      info('NOT YET', 'Managers open in week ' + UNLOCK + '. Learn the desks by hand first.', 'bad');
      decline(); return;
    }
    var m = mgrs();
    if(m[dept]){
      m[dept] = false;
      info('MANAGER LET GO', deptLabel(dept) + ' goes back to hand-assignment — ' + money(SALARY) + '/mo off the books.', '');
      try{ (G.audio.decline || G.audio.tap || function(){})(); }catch(e){}
    } else {
      m[dept] = true;
      info(deptLabel(dept) + ' MANAGER HIRED', 'They route ' + deptLabel(dept).toLowerCase() +
           ' briefs to free, capable ' + deptLabel(dept).toLowerCase() + ' staff. ' + money(SALARY) + '/mo, paid Friday.', 'good');
      try{ (G.audio.accept || G.audio.chaChing || function(){})(); }catch(e){}
    }
    try{ G.hud.poke('money'); }catch(e){}
    renderPanel();
    paint();
  }

  function deptLabel(key){
    for(var i=0;i<DEPTS.length;i++) if(DEPTS[i].key === key) return DEPTS[i].label;
    return key.toUpperCase();
  }

  // refresh chip label/visibility from state (called each render frame)
  function paint(){
    var c = ensureChip(); var s = G.state;
    if(!c || !s){ return; }
    var live = s.running && !s.gameOver;
    var unlocked = s.week >= UNLOCK;
    var val = c.querySelector('#mgr-chip-val');
    var n = hiredCount();

    c.classList.remove('mgr-show','mgr-hire','mgr-on');
    if(!live || (!unlocked && n === 0)){ if(panelOpen){ panelOpen = false; renderPanel(); } return; }
    c.classList.add('mgr-show');

    if(n > 0){
      c.classList.add('mgr-on');
      val.textContent = '🧑‍💼 MANAGERS ' + n + '/' + visibleDepts().length;
      c.title = n + ' department manager(s) on payroll — tap to manage';
    } else {
      c.classList.add('mgr-hire');
      val.textContent = '🧑‍💼 HIRE MANAGERS';
      c.title = 'Hire a manager per department (' + money(SALARY) + '/mo each)';
    }
  }

  // ----------------------------------------------------------------- the router
  function place(){
    var s = G.state;
    var m = mgrs();
    if(!anyHired()) return;
    var tray = G.briefs.trayBriefs();
    if(!tray.length) return;

    // most urgent first: least deadline remaining
    tray.sort(function(a,b){ return (a.deadlineLeft||1e9) - (b.deadlineLeft||1e9); });

    for(var i=0;i<tray.length;i++){
      var brief = tray[i];
      var best = null, bestSpeed = -1;
      for(var j=0;j<s.staff.length;j++){
        var st = s.staff[j];
        if(st.briefId) continue;                  // already on a job
        if(!m[st.dept]) continue;                 // this dept has no manager -> hands off
        if(!G.time.onClock(st)) continue;          // asleep / gone home
        if(!G.staff.canWork(st, brief)) continue;  // wrong department for this brief
        var sp = G.staff.effectiveSpeed(st, brief);
        if(sp > bestSpeed){ bestSpeed = sp; best = st; }
      }
      if(best){ G.briefs.assign(brief, best); return; } // one per cooldown tick
    }
  }

  // ----------------------------------------------------------------- wiring
  function wrapUpdate(){
    if(!G.briefs || G.briefs._mgrWrapped) return;
    var orig = G.briefs.update;
    if(typeof orig !== 'function') return;
    G.briefs.update = function(dt){
      orig.call(G.briefs, dt);                    // normal brief sim first
      if(anyHired()){
        placeAcc += dt;
        if(placeAcc >= PLACE_EVERY){ placeAcc = 0; place(); }
      }
    };
    G.briefs._mgrWrapped = true;
  }

  function wrapHud(){
    if(!G.hud || G.hud._mgrWrapped) return;
    var orig = G.hud.update;
    G.hud.update = function(rdt){
      if(typeof orig === 'function') orig.call(G.hud, rdt);
      paint();
    };
    G.hud._mgrWrapped = true;
  }

  // ----------------------------------------------------------------- helpers
  function info(t,b,k){ try{ G.dock.infoToast(t,b,k||''); }catch(e){} }
  function decline(){ try{ (G.audio.decline||function(){})(); }catch(e){} }
  function money(n){ try{ return G.fmtMoney(n); }catch(e){ return 'Rs ' + n; } }
  function shortMoney(n){
    if(n >= 10000000) return '₹' + (n/10000000) + 'Cr';
    if(n >= 100000)   return '₹' + (n/100000)   + 'L';
    if(n >= 1000)     return '₹' + Math.round(n/1000) + 'k';
    return '₹' + n;
  }

  function boot(){ ensureChip(); ensurePanel(); wrapUpdate(); wrapHud(); paint(); }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
