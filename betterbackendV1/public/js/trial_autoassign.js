// CravAche TRIAL module: trial_autoassign
// ---------------------------------------------------------------------------
// A big-ticket OPS upgrade. Buyable from week 3 (after week 2) for Rs 3,00,000.
// Once owned, an "ops manager" routes tray briefs to the fastest free, on-clock,
// capable staffer all by itself. The player learns assignment by hand for two
// weeks first, then can buy their way out of the busywork.
//
//   • A chip lives in the HUD:
//       - locked (week < 3)      -> hidden
//       - affordable & unowned   -> "AUTO-ASSIGN - Rs 3L" (pulses), click to buy
//       - owned                  -> toggle "AUTO ON" / "AUTO OFF" (player can pause it)
//   • The router only fires while the sim is live (it wraps G.briefs.update,
//     which only ticks inside simTick), so pause / gameOver / modals freeze it.
//   • It places ONE brief at a time on a short cooldown, picking the most urgent
//     brief and the fastest worker who can legally take it - never wrong-dept,
//     never an off-clock or already-busy staffer.
//
// Pure runtime monkey-patch on window.G, all guarded. Loaded by index.html +
// trial.html AFTER the systems + main + hud, so it can wrap update + add the chip.
// ---------------------------------------------------------------------------
(function(){
  "use strict";
  if(!window.G) return;
  var G = window.G;

  var COST   = (G.BAL && G.BAL.AUTOASSIGN_COST)        || 300000;
  var UNLOCK = (G.BAL && G.BAL.AUTOASSIGN_UNLOCK_WEEK) || 3;

  var PLACE_EVERY = 0.35;  // sim-seconds between auto-placements (no audio pileup)
  var placeAcc = 0;

  // ----------------------------------------------------------------- styles
  function injectStyle(){
    if(document.getElementById('aa-style')) return;
    var css = [
      '#aa-chip{cursor:pointer;border:none;font-family:inherit;display:none;align-items:center;gap:5px;}',
      '#aa-chip.aa-show{display:inline-flex;}',
      '#aa-chip.aa-buy{outline:2px solid var(--brass);outline-offset:1px;border-radius:5px;',
        'animation:aaPulse 1.1s ease-in-out infinite;}',
      '#aa-chip.aa-on  .chip-val{color:var(--brass,#ffe066);}',
      '#aa-chip.aa-off .chip-val{color:#8a93a8;}',
      '@keyframes aaPulse{0%,100%{box-shadow:0 0 0 0 rgba(255,224,102,.0);}',
        '50%{box-shadow:0 0 10px 2px rgba(255,224,102,.55);}}'
    ].join('');
    var st = document.createElement('style');
    st.id = 'aa-style'; st.textContent = css;
    document.head.appendChild(st);
  }

  // ----------------------------------------------------------------- the chip
  var chip = null;
  function ensureChip(){
    if(chip) return chip;
    var hud = document.getElementById('hud');
    if(!hud) return null;
    injectStyle();
    chip = document.createElement('button');
    chip.id = 'aa-chip';
    chip.className = 'chip';
    chip.innerHTML = '<span class="chip-val" id="aa-chip-val"></span>';
    chip.title = 'Auto-assign briefs to free, capable staff';
    chip.addEventListener('click', onClick);
    hud.appendChild(chip);
    return chip;
  }

  function onClick(){
    var s = G.state; if(!s) return;
    if(s.upgrades && s.upgrades.autoassign){ toggle(); return; }
    if(s.week < UNLOCK){
      info('NOT YET', 'Auto-assign opens in week ' + UNLOCK + '. Learn the desks by hand first.', 'bad');
      decline(); return;
    }
    if(s.money < COST){
      info('NOT ENOUGH CASH', 'Auto-assign costs ' + money(COST) + '. The ops manager does not work for exposure.', 'bad');
      decline(); return;
    }
    G.economy.spend(COST);
    s.upgrades.autoassign = true;
    s.autoAssignOn = true;
    try{ G.hud.poke('money'); }catch(e){}
    info('AUTO-ASSIGN ONLINE', 'An ops manager now routes tray briefs to whoever is free and fastest. Tap the chip to pause it.', 'good');
    try{ (G.audio.payday || G.audio.chaChing || function(){})(); }catch(e){}
    paint();
  }

  function toggle(){
    var s = G.state; if(!s) return;
    s.autoAssignOn = !s.autoAssignOn;
    info(s.autoAssignOn ? 'AUTO-ASSIGN ON' : 'AUTO-ASSIGN OFF',
         s.autoAssignOn ? 'Tray briefs route themselves again.' : 'Back to placing briefs by hand.',
         s.autoAssignOn ? 'good' : '');
    try{ (G.audio.tap || G.audio.click || function(){})(); }catch(e){}
    paint();
  }

  // refresh chip label/visibility from state (called each render frame)
  function paint(){
    var c = ensureChip(); var s = G.state;
    if(!c || !s){ return; }
    var owned  = !!(s.upgrades && s.upgrades.autoassign);
    var live   = s.running && !s.gameOver;
    var unlocked = s.week >= UNLOCK;
    var val = c.querySelector('#aa-chip-val');

    c.classList.remove('aa-show','aa-buy','aa-on','aa-off');
    if(!live || (!owned && !unlocked)){ return; }       // hidden until relevant
    c.classList.add('aa-show');

    if(owned){
      var on = s.autoAssignOn !== false;
      c.classList.add(on ? 'aa-on' : 'aa-off');
      val.textContent = on ? '🤖 AUTO ON' : '🤖 AUTO OFF';
      c.title = on ? 'Auto-assign is ON - tap to pause' : 'Auto-assign is OFF - tap to resume';
    } else {
      var afford = s.money >= COST;
      if(afford) c.classList.add('aa-buy');
      val.textContent = '🤖 AUTO-ASSIGN · ' + shortMoney(COST);
      c.title = 'Buy auto-assign for ' + money(COST);
    }
  }

  // ----------------------------------------------------------------- the router
  function place(){
    var s = G.state;
    if(!s || !s.upgrades || !s.upgrades.autoassign || s.autoAssignOn === false) return;
    var tray = G.briefs.trayBriefs();
    if(!tray.length) return;

    // most urgent first: least deadline remaining
    tray.sort(function(a,b){ return (a.deadlineLeft||1e9) - (b.deadlineLeft||1e9); });

    for(var i=0;i<tray.length;i++){
      var brief = tray[i];
      var best = null, bestSpeed = -1;
      for(var j=0;j<s.staff.length;j++){
        var st = s.staff[j];
        if(st.briefId) continue;                 // already on a job
        if(!G.time.onClock(st)) continue;         // asleep / gone home
        if(!G.staff.canWork(st, brief)) continue; // wrong department
        var sp = G.staff.effectiveSpeed(st, brief);
        if(sp > bestSpeed){ bestSpeed = sp; best = st; }
      }
      if(best){ G.briefs.assign(brief, best); return; } // one per cooldown tick
    }
  }

  // ----------------------------------------------------------------- wiring
  function wrapUpdate(){
    if(!G.briefs || G.briefs._aaWrapped) return;
    var orig = G.briefs.update;
    if(typeof orig !== 'function') return;
    G.briefs.update = function(dt){
      orig.call(G.briefs, dt);                    // normal brief sim first
      var s = G.state;
      if(s && s.upgrades && s.upgrades.autoassign && s.autoAssignOn !== false){
        placeAcc += dt;
        if(placeAcc >= PLACE_EVERY){ placeAcc = 0; place(); }
      }
    };
    G.briefs._aaWrapped = true;
  }

  function wrapHud(){
    if(!G.hud || G.hud._aaWrapped) return;
    var orig = G.hud.update;
    G.hud.update = function(rdt){
      if(typeof orig === 'function') orig.call(G.hud, rdt);
      paint();
    };
    G.hud._aaWrapped = true;
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

  function boot(){ ensureChip(); wrapUpdate(); wrapHud(); paint(); }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
