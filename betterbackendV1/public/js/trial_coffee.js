// CravAche — COFFEE MACHINE mini-game. A self-contained brewing break the
// player opens by tapping the office coffee machine. While it runs the sim is
// PAUSED (time stops, no new briefs) via the modal pause refcount. The player
// turns two dials (STRENGTH + SIZE) into their target bands, presses BREW to
// start pouring, watches the cup FILL rise, then presses again to STOP — aiming
// for the "full" zone without overflowing. A clean cup (good fill + dials in
// band) drops chaos −5; a sloppy cup (over/under-fill) drops chaos −2. Either
// way it burns a daily charge. Quitting before pouring (✕ / Esc) costs nothing.
//
// Isolated: NO always-visible launcher button — entry is only via the exposed
// open() (the office coffee machine taps it). Own absolutely-positioned overlay;
// touches nothing in office_trial.js / modals.js. Per-day cap is tracked on lazy
// G.state fields (_cofDayKey / _cofCount) without editing state.js.
(function(){
  'use strict';
  window.G = window.G || {};

  var MAX_PER_DAY = 3;
  // chaos drop scales with mastery: ★★★ perfect rewards harder than a sloppy cup
  var CHAOS_PERFECT = 6;      // ★★★ — dials dead-on + fill bang in the zone
  var CHAOS_GOOD    = 5;      // ★★  — clean cup (dials in band, fill in zone)
  var CHAOS_OK      = 2;      // ★   — drinkable, barely (over/under-fill or off dials)

  // canvas dimensions (internal pixels; CSS may scale)
  var CW = 460, CH = 340;

  // ---- dials ----------------------------------------------------------------
  // angle range: -135deg .. +135deg (270deg sweep), value 0..1 across it.
  var DIAL_MIN = -135 * Math.PI / 180;
  var DIAL_MAX =  135 * Math.PI / 180;
  var DIAL_R = 38;            // dial radius (px)
  // vertical-drag sensitivity: full 0->1 over ~140px of travel. Predictable,
  // never wraps (unlike mapping raw cursor angle around the knob).
  var DRAG_SPAN = 140;
  // two dials, each with a center + a randomly-placed target band [lo,hi] in 0..1.
  // wasIn / glow drive the safe-cracker "snap into band" feedback.
  var dials = [
    { key:'STRENGTH', cx:120, cy:230, val:0.5, lo:0, hi:0, wasIn:false, glow:0 },
    { key:'SIZE',     cx:340, cy:230, val:0.5, lo:0, hi:0, wasIn:false, glow:0 }
  ];

  // ---- fill -----------------------------------------------------------------
  var FILL_LO = 0.74, FILL_HI = 0.96;   // the "full" target zone (fraction of cup)
  var FILL_RATE = 0.42;                  // cup fills at this fraction per second

  var overlayEl = null;
  var canvasEl = null;
  var ctx = null;
  var playing = false;        // is the mini-game live?
  var paused = false;         // did WE acquire the pause lock?
  var rafId = null;
  var lastT = 0;
  var closing = false;        // guard against double-close

  // run state
  var phase = 'setup';        // 'setup' -> 'pouring' -> 'result' -> (close)
  var fill = 0;               // displayed cup fill 0..1 (eased toward fillTarget)
  var fillTarget = 0;         // where the liquid is actually pouring to
  var overflowed = false;
  var dragDial = -1;          // index of dial being dragged, -1 = none
  var dragStartY = 0;         // canvas-Y at grab
  var dragStartVal = 0;       // dial value at grab (delta is added to this)
  var brewBtn = { x: CW/2 - 70, y: 286, w: 140, h: 38 }; // BREW/STOP button rect
  var mouseDownPt = null;     // last mousedown canvas point (for hit-tests)

  // ---- result / juice -------------------------------------------------------
  var result = null;          // { stars, drop } once a cup is poured
  var resultT = 0;            // time spent on the result beat (s)
  var RESULT_HOLD = 1.05;     // celebratory beat length before auto-close (s)
  var spark = [];             // sparkle particles on a good cup
  var steam = [];             // rising steam wisps off the cup
  var animT = 0;              // free-running clock for steam/shimmer

  function stage(){ return document.getElementById('stage') || document.body; }

  function gameRunning(){
    return !!(G.state && G.state.running && !G.state.gameOver);
  }

  // day key matches the chai station / meditation / table tennis: week*10 + day
  function dayKey(){
    var s = G.state || {};
    return (s.week || 0) * 10 + (s.day || 0);
  }

  // lazy per-day counter on G.state. Resets when the day changes.
  function syncDay(){
    var s = G.state;
    if(!s) return;
    var k = dayKey();
    if(s._cofDayKey !== k){
      s._cofDayKey = k;
      s._cofCount = 0;
    }
  }

  function usedToday(){
    syncDay();
    return (G.state && G.state._cofCount) || 0;
  }

  function modalOpen(){
    return !!(G.modals && G.modals.anyOpen && G.modals.anyOpen());
  }

  function available(){
    if(G.__propBusy && G.__propBusy !== 'coffee') return false;
    return gameRunning() && !playing && !modalOpen() && usedToday() < MAX_PER_DAY;
  }

  function clamp(v, lo, hi){ return v < lo ? lo : (v > hi ? hi : v); }

  // ---------------------------------------------------------------- styles
  function injectCSS(){
    if(document.getElementById('cof-style')) return;
    var st = document.createElement('style');
    st.id = 'cof-style';
    st.textContent = [
      // warm dark backdrop, fade-in (mirrors the other mini-game overlays)
      '#cof-overlay{position:absolute;inset:0;z-index:200;',
        'display:flex;flex-direction:column;align-items:center;justify-content:center;',
        'background:radial-gradient(circle at 50% 45%, rgba(44,30,20,.94), rgba(14,8,5,.97));',
        'opacity:0;transition:opacity .4s ease;}',
      '#cof-overlay.in{opacity:1;}',
      '#cof-overlay .cof-head{color:#f3e3d2;',
        'font:300 16px/1 "Silkscreen",system-ui,sans-serif;letter-spacing:2px;',
        'margin-bottom:12px;text-shadow:0 2px 12px rgba(0,0,0,.6);text-align:center;}',
      '#cof-overlay canvas{background:#1a120c;border-radius:10px;',
        'box-shadow:0 0 50px rgba(210,150,90,.22),0 8px 30px rgba(0,0,0,.6);',
        'cursor:pointer;max-width:92vw;height:auto;image-rendering:pixelated;}',
      '#cof-overlay .cof-leave{margin-top:14px;color:#cdb59c;opacity:.85;cursor:pointer;',
        'font:13px/1 system-ui,sans-serif;letter-spacing:1px;}',
      '#cof-overlay .cof-leave:hover{opacity:1;}'
    ].join('');
    document.head.appendChild(st);
  }

  // ---------------------------------------------------------------- overlay
  function buildOverlay(){
    overlayEl = document.createElement('div');
    overlayEl.id = 'cof-overlay';

    var head = document.createElement('div');
    head.className = 'cof-head';
    head.textContent = 'OFFICE COFFEE — drag dials up/down, then BREW';

    canvasEl = document.createElement('canvas');
    canvasEl.width = CW;
    canvasEl.height = CH;

    var leave = document.createElement('div');
    leave.className = 'cof-leave';
    leave.textContent = '✕ leave (Esc)';
    leave.addEventListener('click', function(){ quit(); });

    overlayEl.appendChild(head);
    overlayEl.appendChild(canvasEl);
    overlayEl.appendChild(leave);
    stage().appendChild(overlayEl);

    ctx = canvasEl.getContext('2d');

    // listeners — tracked so we can rip them all out on close.
    // mouse handled at WINDOW level so dragging a dial keeps working even when
    // the cursor leaves the small canvas box.
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    // capture phase on window so our Esc beats main.js's bubble-phase pause-menu
    // listener (same trick the other mini-games use).
    window.addEventListener('keydown', onKeyDown, true);

    requestAnimationFrame(function(){ if(overlayEl) overlayEl.classList.add('in'); });
  }

  function removeListeners(){
    window.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    window.removeEventListener('keydown', onKeyDown, true);
  }

  // map a window mouse event into internal canvas coords (canvas may be scaled)
  function toCanvas(e){
    if(!canvasEl) return null;
    var r = canvasEl.getBoundingClientRect();
    if(!r.width || !r.height) return null;
    var sx = CW / r.width, sy = CH / r.height;
    return { x:(e.clientX - r.left) * sx, y:(e.clientY - r.top) * sy };
  }

  function inRect(p, rc){
    return p && p.x >= rc.x && p.x <= rc.x + rc.w && p.y >= rc.y && p.y <= rc.y + rc.h;
  }

  // value 0..1 -> needle angle across the -135deg..+135deg sweep (0deg = right,
  // so -90deg = up). Drives the VISUAL needle from the well-behaved value.
  function valToAngle(v){
    return DIAL_MIN + clamp(v, 0, 1) * (DIAL_MAX - DIAL_MIN) - Math.PI / 2;
  }

  // ---------------------------------------------------------------- input
  function onMouseDown(e){
    var p = toCanvas(e);
    if(!p) return;
    mouseDownPt = p;

    if(phase === 'setup'){
      // grab a dial if pressed on/near it — DO NOT snap the value on grab.
      // record the start point + current value; drag applies a smooth delta.
      for(var i=0;i<dials.length;i++){
        var d = dials[i];
        var dx = p.x - d.cx, dy = p.y - d.cy;
        if(dx*dx + dy*dy <= (DIAL_R + 12)*(DIAL_R + 12)){
          dragDial = i;
          dragStartY = p.y;
          dragStartVal = d.val;
          e.preventDefault();
          return;
        }
      }
      // pressed BREW -> start pouring
      if(inRect(p, brewBtn)){
        startPour();
        e.preventDefault();
        return;
      }
    } else if(phase === 'pouring'){
      // pressing anywhere (button or canvas) stops the pour
      stopPour();
      e.preventDefault();
    }
    // phase 'result'/'done': ignore clicks, the beat auto-closes
  }

  function onMouseMove(e){
    if(dragDial < 0) return;
    var p = toCanvas(e);
    if(!p) return;
    var d = dials[dragDial];
    // vertical drag: up = increase, down = decrease. Smooth delta over DRAG_SPAN
    // px of travel, hard-clamped to [0,1] so it physically stops at the ends.
    var delta = (dragStartY - p.y) / DRAG_SPAN;
    d.val = clamp(dragStartVal + delta, 0, 1);
    e.preventDefault();
  }

  function onMouseUp(e){
    dragDial = -1;
  }

  function onKeyDown(e){
    var k = e.key;
    if(k === 'Escape'){ e.preventDefault(); e.stopImmediatePropagation(); quit(); return; }
    if(k === ' ' || k === 'Enter'){
      // space/enter = brew or stop, whichever phase we're in
      e.preventDefault(); e.stopImmediatePropagation();
      if(phase === 'setup') startPour();
      else if(phase === 'pouring') stopPour();
    }
  }

  // ---------------------------------------------------------------- flow bits
  function startPour(){
    if(phase !== 'setup') return;
    phase = 'pouring';
    fill = 0;
    fillTarget = 0;
    overflowed = false;
    dragDial = -1;
    try { if(G.audio && G.audio.waterPour) G.audio.waterPour(); } catch(e){}
  }

  function stopPour(){
    if(phase !== 'pouring') return;
    resolveCup();
  }

  // both dials inside their target bands?
  function dialsGood(){
    for(var i=0;i<dials.length;i++){
      var d = dials[i];
      if(d.val < d.lo || d.val > d.hi) return false;
    }
    return true;
  }

  // how tightly each dial sits in its band: 1 = dead-center, 0 = at the edge.
  function dialTightness(){
    var min = 1;
    for(var i=0;i<dials.length;i++){
      var d = dials[i];
      var mid = (d.lo + d.hi) / 2, half = (d.hi - d.lo) / 2 || 0.0001;
      var t = 1 - Math.min(1, Math.abs(d.val - mid) / half);
      if(t < min) min = t;
    }
    return min;   // worst-of-the-two — both must be tight for a ★★★
  }

  // evaluate the finished cup, score 1..3 stars, kick off the celebratory beat
  function resolveCup(){
    if(phase !== 'pouring') return;

    var fillGood = !overflowed && fill >= FILL_LO && fill <= FILL_HI;
    var inBand = dialsGood();
    var clean = fillGood && inBand;

    var stars, drop, perfect = false;
    if(clean){
      // how centered is the fill in its zone? + how tight are the dials?
      var zMid = (FILL_LO + FILL_HI) / 2, zHalf = (FILL_HI - FILL_LO) / 2;
      var fillTight = 1 - Math.min(1, Math.abs(fill - zMid) / zHalf);
      var tight = Math.min(fillTight, dialTightness());
      if(tight >= 0.55){ stars = 3; drop = CHAOS_PERFECT; perfect = true; }
      else { stars = 2; drop = CHAOS_GOOD; }
    } else {
      stars = 1; drop = CHAOS_OK;
    }

    result = { stars: stars, drop: drop, perfect: perfect, clean: clean };
    resultT = 0;
    phase = 'result';

    // celebratory beat: ding for any drinkable cup, full sparkle arpeggio on ★★★
    spawnSteam();
    if(perfect){
      spawnSparkles(26);
      try { if(G.audio && G.audio.viral) G.audio.viral(); } catch(e){}
    } else if(clean){
      spawnSparkles(12);
      try { if(G.audio && G.audio.accept) G.audio.accept(); } catch(e){}
    } else {
      try { if(G.audio && G.audio.click) G.audio.click(); } catch(e){}
    }
  }

  // ---------------------------------------------------------------- juice
  var cupCenterX = CW/2;
  var cupTopY = 132;

  function spawnSparkles(n){
    spark = [];
    for(var i=0;i<n;i++){
      var ang = Math.random() * Math.PI * 2;
      var spd = 40 + Math.random() * 130;
      spark.push({
        x: cupCenterX, y: cupTopY + 30,
        vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - 50,
        life: 0, max: 0.5 + Math.random() * 0.5,
        s: 1.5 + Math.random() * 2.5
      });
    }
  }

  function spawnSteam(){
    steam = [];
    for(var i=0;i<5;i++){
      steam.push({ x: cupCenterX - 18 + i*9 + (Math.random()*6-3), seed: Math.random()*6.28, sp: 0.7 + Math.random()*0.5 });
    }
  }

  // ---------------------------------------------------------------- update
  function update(dt){
    animT += dt;

    // dial "safe-cracker" feedback — soft click + glow the instant a knob
    // crosses into its target band (only matters while setting up).
    if(phase === 'setup'){
      for(var i=0;i<dials.length;i++){
        var d = dials[i];
        var nowIn = d.val >= d.lo && d.val <= d.hi;
        if(nowIn && !d.wasIn){
          d.glow = 1;
          try { if(G.audio && G.audio.slotTick) G.audio.slotTick(); } catch(e){}
        }
        d.wasIn = nowIn;
        if(d.glow > 0) d.glow = Math.max(0, d.glow - dt * 2.2);
      }
    }

    if(phase === 'pouring'){
      fillTarget += FILL_RATE * dt;
      if(fillTarget >= 1){
        fillTarget = 1;
        overflowed = true;
      }
      // displayed liquid eases smoothly toward the pour target
      fill += (fillTarget - fill) * Math.min(1, dt * 14);
      if(overflowed && fill > 0.985){
        fill = 1;
        resolveCup();   // flooded the pantry — auto-resolve as a sloppy cup
      }
    }

    if(phase === 'result'){
      resultT += dt;
      // crema settle + steam keep moving; sparkles fly out and fade
      for(var s=0;s<spark.length;s++){
        var p = spark[s];
        p.life += dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vy += 160 * dt;       // gentle gravity
      }
      if(resultT >= RESULT_HOLD) finish();
    }
  }

  // ---------------------------------------------------------------- draw
  function roundRect(x,y,w,h,r){
    ctx.beginPath();
    ctx.moveTo(x+r,y);
    ctx.arcTo(x+w,y,x+w,y+h,r);
    ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r);
    ctx.arcTo(x,y,x+w,y,r);
    ctx.closePath();
  }

  // hard-edged pixel steam: stacked squares drifting up + sideways sine sway
  function drawSteam(topY){
    for(var i=0;i<steam.length;i++){
      var w = steam[i];
      for(var j=0;j<5;j++){
        var t = (animT * w.sp + w.seed + j*0.5);
        var sway = Math.sin(t) * 6;
        var yy = topY - 6 - j*9 - ((animT * 14 * w.sp + j*7) % 12);
        var alpha = 0.22 * (1 - j/5);
        ctx.fillStyle = 'rgba(243,227,210,' + alpha.toFixed(3) + ')';
        ctx.fillRect(Math.round(w.x + sway), Math.round(yy), 4, 4);
      }
    }
  }

  function drawDial(d){
    var inBand = d.val >= d.lo && d.val <= d.hi;

    // snap-glow halo when freshly seated in the band (safe-cracker feedback)
    if(d.glow > 0){
      ctx.fillStyle = 'rgba(95,174,106,' + (0.30 * d.glow).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(d.cx, d.cy, DIAL_R + 8 + d.glow * 6, 0, Math.PI*2); ctx.fill();
    }

    // base plate
    ctx.fillStyle = '#2a2018';
    ctx.beginPath(); ctx.arc(d.cx, d.cy, DIAL_R + 6, 0, Math.PI*2); ctx.fill();

    // target band arc (a small lit wedge on the rim) — brightens when seated
    var aLo = valToAngle(d.lo);
    var aHi = valToAngle(d.hi);
    ctx.lineWidth = inBand ? 7 : 6;
    ctx.strokeStyle = inBand ? '#8fe09a' : '#5fae6a';
    ctx.beginPath();
    ctx.arc(d.cx, d.cy, DIAL_R + 3, aLo, aHi);
    ctx.stroke();

    // knob body
    ctx.fillStyle = inBand ? '#caa06a' : '#9a7a52';
    ctx.beginPath(); ctx.arc(d.cx, d.cy, DIAL_R, 0, Math.PI*2); ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = inBand ? '#5fae6a' : '#1a120c';
    ctx.stroke();

    // pointer needle — driven by the well-behaved value
    var a = valToAngle(d.val);
    ctx.strokeStyle = '#1a120c';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(d.cx, d.cy);
    ctx.lineTo(d.cx + Math.cos(a) * (DIAL_R - 8), d.cy + Math.sin(a) * (DIAL_R - 8));
    ctx.stroke();

    // label + value
    ctx.fillStyle = '#f3e3d2';
    ctx.font = '11px "Silkscreen", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(d.key, d.cx, d.cy + DIAL_R + 12);
    ctx.fillStyle = inBand ? '#8fe09a' : '#cdb59c';
    ctx.fillText(Math.round(d.val * 100) + '', d.cx, d.cy - DIAL_R - 22);
  }

  function draw(){
    if(!ctx) return;
    ctx.fillStyle = '#1a120c';
    ctx.fillRect(0,0,CW,CH);

    // ---- machine body (chunky pixel espresso machine) ----
    // back panel
    ctx.fillStyle = '#3a2c20';
    roundRect(40, 24, CW-80, 150, 8); ctx.fill();
    // bean hopper (top-right)
    ctx.fillStyle = '#241a12';
    roundRect(CW-118, 12, 60, 34, 6); ctx.fill();
    ctx.fillStyle = '#5a3d22';
    for(var bx=0; bx<5; bx++){
      ctx.beginPath();
      ctx.arc(CW-108 + bx*10, 30, 3.5, 0, Math.PI*2); ctx.fill();
    }
    // group head (the spout housing, center)
    ctx.fillStyle = '#26201a';
    roundRect(CW/2 - 34, 60, 68, 46, 5); ctx.fill();
    ctx.fillStyle = '#1a120c';
    ctx.fillRect(CW/2 - 6, 104, 12, 16);   // spout

    // ---- the cup + fill, under the spout ----
    var cupW = 70, cupH = 78, cupX = CW/2 - cupW/2, cupY = 132;
    // fill liquid (drawn first, clipped to cup interior)
    var innerX = cupX + 6, innerY = cupY + 6, innerW = cupW - 12, innerH = cupH - 12;
    var liqFrac = clamp(fill, 0, 1);
    var liqH = innerH * liqFrac;
    var liqTopY = innerY + (innerH - liqH);
    ctx.fillStyle = overflowed ? '#8a5a2c' : '#6f4423';
    ctx.fillRect(innerX, liqTopY, innerW, liqH);
    // crema / foam layer on top of the liquid once there's a real pour
    if(liqFrac > 0.04){
      ctx.fillStyle = overflowed ? '#c0712c' : '#c79a5e';
      ctx.fillRect(innerX, liqTopY, innerW, 4);
    }
    // target "full" zone band on the cup (between FILL_LO and FILL_HI)
    var zoneTopY = innerY + innerH * (1 - FILL_HI);
    var zoneBotY = innerY + innerH * (1 - FILL_LO);
    ctx.fillStyle = 'rgba(95,174,106,.30)';
    ctx.fillRect(innerX, zoneTopY, innerW, zoneBotY - zoneTopY);
    ctx.strokeStyle = '#5fae6a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(innerX, zoneTopY); ctx.lineTo(innerX+innerW, zoneTopY);
    ctx.moveTo(innerX, zoneBotY); ctx.lineTo(innerX+innerW, zoneBotY);
    ctx.stroke();
    // cup outline (mug + handle)
    ctx.strokeStyle = '#e8d8c5';
    ctx.lineWidth = 4;
    ctx.strokeRect(cupX, cupY, cupW, cupH);
    ctx.beginPath();
    ctx.arc(cupX + cupW + 10, cupY + cupH/2, 16, -Math.PI/2.2, Math.PI/2.2);
    ctx.stroke();

    // steam wisps off the cup — gentle while pouring, fuller on a finished cup
    if((phase === 'pouring' && liqFrac > 0.2) || phase === 'result'){
      drawSteam(liqTopY);
    }

    // pour stream while brewing
    if(phase === 'pouring' && fillTarget < 1){
      ctx.fillStyle = '#6f4423';
      ctx.fillRect(CW/2 - 2, 120, 4, cupY - 120 + 6);
    }

    // drip tray (base)
    ctx.fillStyle = '#2a2018';
    roundRect(CW/2 - 60, cupY + cupH + 2, 120, 12, 3); ctx.fill();
    ctx.fillStyle = '#1a120c';
    for(var gx=0; gx<11; gx++) ctx.fillRect(CW/2 - 54 + gx*10, cupY+cupH+4, 5, 8);

    // ---- dials ----
    drawDial(dials[0]);
    drawDial(dials[1]);

    // ---- fill gauge (right side, vertical) ----
    var gX = CW - 34, gY = 198, gW = 16, gH = 96;
    ctx.fillStyle = '#241a12';
    roundRect(gX, gY, gW, gH, 4); ctx.fill();
    // target zone on the gauge
    ctx.fillStyle = 'rgba(95,174,106,.30)';
    var zTop = gY + gH * (1 - FILL_HI), zBot = gY + gH * (1 - FILL_LO);
    ctx.fillRect(gX, zTop, gW, zBot - zTop);
    // current level
    var lvlH = gH * clamp(fill, 0, 1);
    ctx.fillStyle = overflowed ? '#c0712c' : '#caa06a';
    ctx.fillRect(gX, gY + gH - lvlH, gW, lvlH);
    ctx.strokeStyle = '#3a2c20'; ctx.lineWidth = 2;
    ctx.strokeRect(gX, gY, gW, gH);
    ctx.fillStyle = '#cdb59c';
    ctx.font = '8px "Silkscreen", monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText('FILL', gX + gW/2, gY - 3);

    // ---- BREW / STOP button ----
    var label, bcol;
    if(phase === 'setup'){ label = 'BREW'; bcol = '#caa06a'; }
    else if(phase === 'pouring'){ label = 'STOP'; bcol = '#d6694a'; }
    else { label = 'DONE'; bcol = '#7a6a55'; }
    ctx.fillStyle = bcol;
    roundRect(brewBtn.x, brewBtn.y, brewBtn.w, brewBtn.h, 7); ctx.fill();
    ctx.strokeStyle = '#1a120c'; ctx.lineWidth = 3;
    roundRect(brewBtn.x, brewBtn.y, brewBtn.w, brewBtn.h, 7); ctx.stroke();
    ctx.fillStyle = '#1a120c';
    ctx.font = '16px "Silkscreen", monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, brewBtn.x + brewBtn.w/2, brewBtn.y + brewBtn.h/2 + 1);

    // hint line — dry CravAche voice, coffee = survival fuel
    ctx.fillStyle = '#cdb59c';
    ctx.font = '9px "Silkscreen", monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    var hint = phase === 'setup'
      ? 'dial it in — the floor runs on caffeine'
      : (phase === 'pouring' ? "STOP at the line — don't flood the pantry" : '');
    if(hint) ctx.fillText(hint, CW/2, brewBtn.y + brewBtn.h + 6);

    // ---- result / reward beat (drawn on top of everything) ----
    if(phase === 'result' && result) drawResult();
  }

  // celebratory payoff: dim the scene, punch a star rating, sparkle on a win
  function drawResult(){
    var prog = Math.min(1, resultT / RESULT_HOLD);
    // ease-out pop-in for the card scale
    var pop = 1 - Math.pow(1 - Math.min(1, resultT / 0.22), 3);

    // dim backdrop fades in
    ctx.fillStyle = 'rgba(14,8,5,' + (0.55 * prog).toFixed(3) + ')';
    ctx.fillRect(0, 0, CW, CH);

    // sparkles (drawn over the dim, behind the card text)
    for(var s=0;s<spark.length;s++){
      var p = spark[s];
      var a = 1 - Math.min(1, p.life / p.max);
      if(a <= 0) continue;
      ctx.fillStyle = (result.perfect ? 'rgba(143,224,154,' : 'rgba(243,227,210,') + a.toFixed(3) + ')';
      var sz = p.s * a;
      ctx.fillRect(Math.round(p.x - sz/2), Math.round(p.y - sz/2), Math.ceil(sz), Math.ceil(sz));
    }

    var cy = CH/2 - 6;
    ctx.save();
    ctx.translate(CW/2, cy);
    ctx.scale(pop, pop);

    // stars: filled gold up to result.stars, dim for the rest of three
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '30px "Silkscreen", monospace';
    var starStr = '';
    for(var i=0;i<3;i++) starStr += (i < result.stars ? '★' : '☆');
    // soft glow pulse behind the stars on a clean cup
    if(result.clean){
      var pulse = 0.4 + 0.3 * Math.sin(animT * 9);
      ctx.fillStyle = (result.perfect ? 'rgba(143,224,154,' : 'rgba(202,160,106,') + (pulse*0.5).toFixed(3) + ')';
      ctx.fillText(starStr, 0, -28);
    }
    ctx.fillStyle = result.perfect ? '#8fe09a' : (result.clean ? '#caa06a' : '#9a7a52');
    ctx.fillText(starStr, 0, -28);

    // headline
    ctx.font = '18px "Silkscreen", monospace';
    ctx.fillStyle = '#f3e3d2';
    var title = result.perfect ? 'PERFECT CUP' : (result.clean ? 'FRESH BREW' : 'DRINKABLE');
    ctx.fillText(title, 0, 8);

    // reward line
    ctx.font = '11px "Silkscreen", monospace';
    ctx.fillStyle = result.clean ? '#8fe09a' : '#cdb59c';
    ctx.fillText('chaos −' + result.drop + '%', 0, 32);

    ctx.restore();
  }

  function loop(now){
    if(!playing) return;
    var dt = (now - lastT) / 1000;
    lastT = now;
    if(dt > 0.05) dt = 0.05;   // clamp big frame gaps (tab switches etc.)
    update(dt);
    draw();
    rafId = requestAnimationFrame(loop);
  }

  // ---------------------------------------------------------------- flow
  function open(){
    if(!available()){
      if(gameRunning() && usedToday() >= MAX_PER_DAY){
        if(G.dock) G.dock.infoToast('COFFEE ☕',
          'That’s enough caffeine for one day. The briefs are waiting.', '');
      }
      return;
    }
    if(modalOpen()) return;

    playing = true;
    closing = false;
    phase = 'setup';
    fill = 0;
    fillTarget = 0;
    overflowed = false;
    dragDial = -1;
    mouseDownPt = null;
    result = null;
    resultT = 0;
    spark = [];
    steam = [];
    animT = 0;

    // randomize each dial's target band + a starting value outside it
    for(var i=0;i<dials.length;i++){
      var d = dials[i];
      var lo = 0.25 + Math.random() * 0.4;   // band start
      var w  = 0.16 + Math.random() * 0.08;  // band width (forgiving)
      d.lo = lo; d.hi = Math.min(0.98, lo + w);
      d.val = Math.random() < 0.5 ? 0.08 : 0.92;  // start clearly outside band
      d.wasIn = false; d.glow = 0;
    }

    try { if(G.audio && G.audio.click) G.audio.click(); } catch(e){}

    // stop the sim: time + brief spawning halt until we release.
    G.__propBusy = 'coffee';   // mutual exclusion: blocks other props
    if(G.modals && G.modals.acquirePause){ G.modals.acquirePause(); paused = true; }

    injectCSS();
    buildOverlay();

    lastT = performance.now();
    rafId = requestAnimationFrame(loop);
  }

  // tear down: stop loop, drop listeners, release pause, remove overlay.
  // consumed=true counts this brew against the daily cap.
  function close(consumed){
    if(closing) return;        // guard double-close
    closing = true;
    playing = false;

    if(rafId){ cancelAnimationFrame(rafId); rafId = null; }
    removeListeners();

    if(overlayEl){
      var el = overlayEl;
      overlayEl = null;
      el.classList.remove('in');
      setTimeout(function(){ if(el && el.parentNode) el.remove(); }, 320);
    }
    canvasEl = null; ctx = null;
    dragDial = -1; mouseDownPt = null;
    spark = []; steam = [];

    // resume the sim
    if(paused && G.modals && G.modals.releasePause){ G.modals.releasePause(); }
    paused = false;
    if(G.__propBusy === 'coffee') G.__propBusy = null;   // release mutual-exclusion lock

    if(consumed){
      syncDay();
      if(G.state) G.state._cofCount = (G.state._cofCount || 0) + 1;
    }
  }

  // the celebratory beat is over — bank the reward and close. Reward scales
  // with the star rating set in resolveCup().
  function finish(){
    if(closing) return;
    var r = result || { stars: 1, drop: CHAOS_OK, perfect: false, clean: false };
    try { if(G.chaos && G.chaos.add) G.chaos.add(-r.drop); } catch(e){}
    if(G.dock){
      if(r.perfect){
        G.dock.infoToast('PERFECT CUP ☕★★★',
          'Dialed in dead-on. The whole floor stands a little taller — chaos −' + r.drop + '%.', 'good');
      } else if(r.clean){
        G.dock.infoToast('FRESH BREW ☕★★',
          'A proper cup. The floor exhales — chaos −' + r.drop + '%.', 'good');
      } else {
        G.dock.infoToast('COFFEE ☕★',
          'Drinkable. Barely. chaos −' + r.drop + '%.', '');
      }
    }
    close(true);               // any poured cup burns a daily charge
  }

  // bailed before pouring a cup — costs no daily charge, no perk
  function quit(){
    if(closing) return;
    close(false);
  }

  // ---------------------------------------------------------------- boot
  function boot(){
    injectCSS();
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // entry interface — the office coffee machine calls open(); available() gates it.
  // (interface intentionally stays exactly { open, available }.)
  G.coffee = {
    open: open,
    available: available
  };

  // dev-only inspection hook (not part of the public interface; lets the
  // Playwright harness read live state without screenshots). Harmless in prod.
  G.__coffeeDebug = {
    state: function(){
      return {
        phase: phase, fill: fill, fillTarget: fillTarget, overflowed: overflowed,
        dragDial: dragDial, vals: dials.map(function(d){ return d.val; }),
        bands: dials.map(function(d){ return [d.lo, d.hi]; }),
        result: result, propBusy: G.__propBusy
      };
    },
    setBands: function(){   // pin both dials' bands near the top for deterministic tests
      for(var i=0;i<dials.length;i++){ dials[i].lo = 0.80; dials[i].hi = 0.96; }
    }
  };
})();
