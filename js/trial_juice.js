// CravAche TRIAL module: trial_juice — game-feel "juice". Loaded only by trial.html.
// Pure runtime monkey-patch + DOM overlay. Touches no other file.
// Wraps originals (save → call → augment) so it composes with other trial modules.
(function(){
  "use strict";
  if(!window.G) return;
  window.CRAVACHE_TRIAL = true;

  var G = window.G;

  // ---------- idempotent <style> (keyframes + classes) ----------
  var STYLE_ID = 'cravache-juice-style';
  if(!document.getElementById(STYLE_ID)){
    var st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = [
      '#hud-money{display:inline-block;transition:transform .08s ease-out,color .08s ease-out;will-change:transform;transform-origin:center}',
      '#hud-money.juice-up{animation:juiceMoneyUp .22s ease-out}',
      '#hud-money.juice-down{animation:juiceMoneyDown .18s ease-out}',
      '@keyframes juiceMoneyUp{0%{transform:scale(1);color:inherit}40%{transform:scale(1.12);color:#ffd34d}100%{transform:scale(1);color:inherit}}',
      '@keyframes juiceMoneyDown{0%{transform:scale(1);color:inherit}30%{transform:scale(.94);color:#ff5b5b}100%{transform:scale(1);color:inherit}}',
      // floating pop-ups
      '.juice-pop{position:fixed;z-index:90;pointer-events:none;font-family:"VT323","Silkscreen",monospace;font-size:26px;font-weight:700;text-shadow:0 2px 0 rgba(0,0,0,.55);white-space:nowrap;will-change:transform,opacity}',
      '.juice-pop.gain{color:#5ef08a}',
      '.juice-pop.loss{color:#ff6b6b}',
      '.juice-pop.foll{color:#5fd4ff}',
      '.juice-pop.viral{color:#ffd34d;font-size:54px;z-index:92;text-shadow:0 3px 0 rgba(0,0,0,.6),0 0 18px rgba(255,211,77,.8)}',
      // generic floaty particle
      '.juice-particle{position:fixed;z-index:88;pointer-events:none;will-change:transform,opacity}',
      // desk assign squash badge
      '.juice-squash{position:fixed;z-index:89;pointer-events:none;width:64px;height:64px;margin-left:-32px;margin-top:-32px;border:3px solid rgba(255,255,255,.9);border-radius:8px;box-shadow:0 0 0 2px rgba(0,0,0,.5) inset;will-change:transform,opacity}',
      // stage shake (own, in case main.screenShake is weak) + red vignette
      '#stage.juice-shake{animation:juiceShake .32s cubic-bezier(.36,.07,.19,.97)}',
      '@keyframes juiceShake{10%{transform:translate(-3px,2px) rotate(-.4deg)}20%{transform:translate(4px,-2px) rotate(.4deg)}30%{transform:translate(-5px,1px)}40%{transform:translate(5px,-1px)}50%{transform:translate(-3px,2px)}60%{transform:translate(3px,-1px)}70%{transform:translate(-2px,1px)}80%{transform:translate(2px,0)}100%{transform:translate(0,0)}}',
      '.juice-vignette{position:fixed;inset:0;z-index:87;pointer-events:none;box-shadow:inset 0 0 160px 60px rgba(220,30,30,.6);opacity:0;will-change:opacity}'
    ].join('\n');
    (document.head || document.documentElement).appendChild(st);
  }

  // ---------- helpers ----------
  function sfx(name){
    try { if(G.audio && typeof G.audio[name] === 'function') G.audio[name](); } catch(e){}
  }
  function easeOutCubic(t){ return 1 - Math.pow(1 - t, 3); }
  function easeOutBack(t){ var c1=1.70158, c3=c1+1; return 1 + c3*Math.pow(t-1,3) + c1*Math.pow(t-1,2); }

  // anchor near the HUD cash chip; falls back to top-left-ish
  function cashAnchor(){
    var chip = document.getElementById('chip-money') || document.getElementById('hud-money');
    if(chip){
      var r = chip.getBoundingClientRect();
      return { x: r.left + r.width/2, y: r.bottom + 6 };
    }
    return { x: 120, y: 60 };
  }

  // logical (1280x720 stage) coords -> screen px, using #stage rect + scale
  function stageToScreen(lx, ly){
    var stage = document.getElementById('stage');
    if(!stage) return { x: lx, y: ly };
    var r = stage.getBoundingClientRect();
    var sx = r.width / 1280, sy = r.height / 720;
    return { x: r.left + lx * sx, y: r.top + ly * sy };
  }

  function removeSoon(el, ms){
    setTimeout(function(){ if(el && el.parentNode) el.parentNode.removeChild(el); }, ms);
  }

  // ---------- 2) floating number pop-ups ----------
  function spawnPop(text, kind, x, y){
    var el = document.createElement('div');
    el.className = 'juice-pop ' + kind;
    el.textContent = text;
    // slight horizontal jitter so stacked pops don't perfectly overlap
    var jitter = (Math.random()*2 - 1) * 14;
    var startX = x + jitter, startY = y;
    el.style.left = '0px'; el.style.top = '0px';
    el.style.transform = 'translate(' + startX + 'px,' + startY + 'px) translateX(-50%)';
    document.body.appendChild(el);

    var rise = kind === 'viral' ? 54 : 26;
    var dur = kind === 'viral' ? 950 : 700;
    var t0 = performance.now();
    function step(now){
      var p = Math.min(1, (now - t0) / dur);
      var e = easeOutCubic(p);
      var ty = startY - rise * e;
      var scale = kind === 'viral' ? (1 + 0.25 * Math.sin(Math.min(1,p*2)*Math.PI)) : 1;
      el.style.transform = 'translate(' + startX + 'px,' + ty + 'px) translateX(-50%) scale(' + scale + ')';
      el.style.opacity = String(1 - Math.max(0, (p - 0.45)) / 0.55);
      if(p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
    removeSoon(el, dur + 80);
    return el;
  }
  // exposed for the verify harness + reuse
  G.juice = G.juice || {};
  G.juice.pop = spawnPop;

  // ---------- coin / particle bursts ----------
  function spawnParticle(x, y, opts){
    opts = opts || {};
    var el = document.createElement('div');
    el.className = 'juice-particle';
    var size = opts.size || 8;
    el.style.width = size + 'px'; el.style.height = size + 'px';
    el.style.left = '0px'; el.style.top = '0px';
    el.style.background = opts.color || '#ffd34d';
    if(opts.round) el.style.borderRadius = '50%';
    el.style.boxShadow = '0 0 0 1px rgba(0,0,0,.4)';
    document.body.appendChild(el);

    var vx = opts.vx || 0, vy = opts.vy || 0, g = opts.g || 900;
    var dur = opts.dur || 600;
    var rot = (Math.random()*2-1) * 360;
    var t0 = performance.now();
    function step(now){
      var s = (now - t0) / 1000;
      var p = Math.min(1, (now - t0) / dur);
      var px = x + vx * s;
      var py = y + vy * s + 0.5 * g * s * s;
      el.style.transform = 'translate(' + px + 'px,' + py + 'px) rotate(' + (rot*p) + 'deg)';
      el.style.opacity = String(1 - p);
      if(p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
    removeSoon(el, dur + 60);
  }

  function coinBurst(x, y, n){
    for(var i=0;i<(n||6);i++){
      spawnParticle(x, y, {
        color: i % 2 ? '#ffd34d' : '#ffea9c',
        round: true, size: 9,
        vx: (Math.random()*2-1) * 180,
        vy: -(180 + Math.random()*160),
        g: 950, dur: 620 + Math.random()*180
      });
    }
  }

  function confettiBurst(cx, cy){
    // prefer the game's own confetti if present
    var did = false;
    try { if(G.modals && typeof G.modals.confetti === 'function'){ G.modals.confetti(); did = true; } } catch(e){}
    // always add our own colored fall near the burst point too
    var cols = ['#ff5b6e','#ffd34d','#5fd4ff','#5ef08a','#c98bff','#ffffff'];
    for(var i=0;i<(did?10:18);i++){
      spawnParticle(cx + (Math.random()*2-1)*40, cy, {
        color: cols[i % cols.length],
        size: 7 + Math.random()*5,
        vx: (Math.random()*2-1) * 220,
        vy: -(120 + Math.random()*220),
        g: 800, dur: 900 + Math.random()*500
      });
    }
  }

  function vignetteFlash(){
    var stage = document.getElementById('stage');
    var v = document.createElement('div');
    v.className = 'juice-vignette';
    document.body.appendChild(v);
    var t0 = performance.now(), dur = 420;
    function step(now){
      var p = Math.min(1, (now - t0)/dur);
      // quick up then fade
      v.style.opacity = String(p < 0.25 ? p/0.25 : 1 - (p-0.25)/0.75);
      if(p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
    removeSoon(v, dur + 60);
  }

  function ownShake(){
    var stage = document.getElementById('stage');
    if(!stage) return;
    // note: fitStage sets stage.transform = scale(); our keyframe animates transform
    // via the CSS animation layer which composites on top, so it won't fight the inline scale visually for the brief window.
    stage.classList.remove('juice-shake');
    void stage.offsetWidth;
    stage.classList.add('juice-shake');
    setTimeout(function(){ stage.classList.remove('juice-shake'); }, 360);
  }

  // desk squash + dust puff (used by drag-drop feel)
  function deskPop(deskIdx){
    if(deskIdx == null || deskIdx < 0) return;
    var office = G.render && G.render.office;
    if(!office || !office.DESKS || !office.DESKS[deskIdx]) return;
    var hb;
    try { hb = office.deskHitbox(deskIdx); } catch(e){ hb = null; }
    var lx, ly;
    if(hb){ lx = hb.x + hb.w/2; ly = hb.y + hb.h*0.35; }
    else { var d = office.DESKS[deskIdx]; lx = d.x; ly = d.y; }
    var p = stageToScreen(lx, ly);

    // squash badge: 1 -> 1.18 -> 1 with easeOutBack
    var badge = document.createElement('div');
    badge.className = 'juice-squash';
    badge.style.left = '0px'; badge.style.top = '0px';
    badge.style.transform = 'translate(' + p.x + 'px,' + p.y + 'px) scale(0.6)';
    document.body.appendChild(badge);
    var t0 = performance.now(), dur = 220;
    function step(now){
      var t = Math.min(1, (now - t0)/dur);
      var e = easeOutBack(t);
      var scale = 0.6 + (1.0 - 0.6) * e; // grows to ~1, easeOutBack overshoots to ~1.18
      badge.style.transform = 'translate(' + p.x + 'px,' + p.y + 'px) scale(' + scale + ')';
      badge.style.opacity = String(1 - t*0.9);
      if(t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
    removeSoon(badge, dur + 60);

    // 4-6 grey dust rects expanding + fading
    var n = 4 + Math.floor(Math.random()*3);
    for(var i=0;i<n;i++){
      var ang = (Math.PI*2) * (i/n) + Math.random()*0.6;
      spawnParticle(p.x, p.y, {
        color: 'rgba(170,165,158,0.9)', size: 6 + Math.random()*4,
        vx: Math.cos(ang) * (90 + Math.random()*70),
        vy: Math.sin(ang) * (60 + Math.random()*50) - 40,
        g: 120, dur: 220 + Math.random()*120
      });
    }
  }
  G.juice.deskPop = deskPop;

  // ---------- 1) cash counter roll (own rAF, writes after hud.js) ----------
  var displayMoney = null;
  var lastReal = null;
  var moneyAnimT = 0; // 0 = idle

  function moneyLoop(){
    requestAnimationFrame(moneyLoop);
    var moneyEl = document.getElementById('hud-money');
    if(!G.state || !moneyEl) return;
    var real = G.state.money;
    if(displayMoney === null){ displayMoney = real; lastReal = real; }

    // detect a real change to fire the scale/tint class
    if(lastReal !== null && Math.abs(real - lastReal) > 0.5){
      if(real > lastReal){
        moneyEl.classList.remove('juice-down','juice-up'); void moneyEl.offsetWidth;
        moneyEl.classList.add('juice-up');
      } else {
        moneyEl.classList.remove('juice-up','juice-down'); void moneyEl.offsetWidth;
        moneyEl.classList.add('juice-down');
      }
    }
    lastReal = real;

    // lerp ~12% per frame toward real
    var diff = real - displayMoney;
    if(Math.abs(diff) > 0.5){
      displayMoney += diff * 0.12;
      if(Math.abs(real - displayMoney) < 1) displayMoney = real;
    } else {
      displayMoney = real;
    }
    // overwrite whatever hud.js wrote this frame
    moneyEl.textContent = G.fmtMoney(Math.round(displayMoney));
  }
  requestAnimationFrame(moneyLoop);
  G.juice.displayMoney = function(){ return displayMoney; };

  // ---------- 2) hook economy.earn / spend ----------
  if(G.economy){
    var _earn = G.economy.earn;
    G.economy.earn = function(amt, quiet){
      var r = _earn.apply(this, arguments);
      try {
        // quiet = per-frame escrow trickle; don't pop on those (too noisy)
        if(!quiet && amt > 0){
          var a = cashAnchor();
          spawnPop('+' + G.fmtMoney(amt), 'gain', a.x, a.y);
        }
      } catch(e){}
      return r;
    };

    var _spend = G.economy.spend;
    G.economy.spend = function(amt){
      var r = _spend.apply(this, arguments);
      try {
        if(amt > 0){
          var a = cashAnchor();
          spawnPop('-' + G.fmtMoney(amt), 'loss', a.x, a.y);
        }
      } catch(e){}
      return r;
    };

    // ---------- 5) collect feel ----------
    var _collect = G.economy.collect;
    if(typeof _collect === 'function'){
      G.economy.collect = function(inv){
        var r = _collect.apply(this, arguments);
        try {
          var a = cashAnchor();
          coinBurst(a.x, a.y - 4, 7);
          sfx('chaChing');
        } catch(e){}
        return r;
      };
    }
  }

  // ---------- follower-gain pops (wrap gainFollowers) ----------
  if(G.verdict && typeof G.verdict.gainFollowers === 'function'){
    var _gainF = G.verdict.gainFollowers;
    G.verdict.gainFollowers = function(range){
      var before = G.state ? G.state.followers : 0;
      var r = _gainF.apply(this, arguments);
      try {
        var gained = (G.state ? G.state.followers : 0) - before;
        if(gained > 0){
          var a = cashAnchor();
          spawnPop('+' + gained, 'foll', a.x + 40, a.y + 4);
        }
      } catch(e){}
      return r;
    };
  }

  // ---------- 3) verdict weight (wrap applyOutcome) ----------
  if(G.verdict && typeof G.verdict.applyOutcome === 'function'){
    var _apply = G.verdict.applyOutcome;
    G.verdict.applyOutcome = function(brief, staffer, outcome, payout, conflict){
      var r = _apply.apply(this, arguments);
      try {
        var ctr = { x: window.innerWidth/2, y: window.innerHeight*0.42 };
        if(outcome === 'viral'){
          // original already calls screenShake + confetti; reinforce non-blockingly
          try { if(G.main && G.main.screenShake) G.main.screenShake(); } catch(e){}
          ownShake();
          confettiBurst(ctr.x, ctr.y);
          spawnPop('VIRAL!', 'viral', ctr.x, ctr.y);
          // sfx already fired by original (G.audio.viral)
        } else if(outcome === 'scrapped'){
          vignetteFlash();
          // sfx already fired by original (G.audio.scrapped)
        }
        // 'approve' +cash pop is covered by economy.earn / instantPay; 'small' handled by decline sfx.
      } catch(e){}
      return r;
    };
  }

  // ---------- 4) drag-drop feel: rAF watch over staff briefId transitions ----------
  var prevBrief = {}; // staffId -> briefId (or null)
  function assignWatch(){
    requestAnimationFrame(assignWatch);
    if(!G.state || !G.state.staff) return;
    var staff = G.state.staff;
    for(var i=0;i<staff.length;i++){
      var st = staff[i];
      var id = st.id != null ? st.id : i;
      var cur = st.briefId != null ? st.briefId : null;
      var prev = (id in prevBrief) ? prevBrief[id] : undefined;
      if(prev !== undefined && (prev === null || prev === undefined) && cur != null){
        // null -> set transition: a brief just landed on this desk
        if(st.desk != null && st.desk >= 0){
          deskPop(st.desk);
          sfx('drop');
        }
      }
      prevBrief[id] = cur;
    }
  }
  requestAnimationFrame(assignWatch);

})();
