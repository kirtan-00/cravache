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
  var CHAOS_GOOD = 5;         // subtract on a clean cup
  var CHAOS_OK   = 2;         // subtract on a sloppy cup

  // canvas dimensions (internal pixels; CSS may scale)
  var CW = 460, CH = 340;

  // ---- dials ----------------------------------------------------------------
  // angle range: -135deg .. +135deg (270deg sweep), value 0..1 across it.
  var DIAL_MIN = -135 * Math.PI / 180;
  var DIAL_MAX =  135 * Math.PI / 180;
  var DIAL_R = 38;            // dial radius (px)
  // two dials, each with a center + a randomly-placed target band [lo,hi] in 0..1
  var dials = [
    { key:'STRENGTH', cx:120, cy:230, val:0.5, lo:0, hi:0 },
    { key:'SIZE',     cx:340, cy:230, val:0.5, lo:0, hi:0 }
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
  var phase = 'setup';        // 'setup' -> 'pouring' -> (resolves to close)
  var fill = 0;               // current cup fill 0..1
  var overflowed = false;
  var dragDial = -1;          // index of dial being dragged, -1 = none
  var brewBtn = { x: CW/2 - 70, y: 286, w: 140, h: 38 }; // BREW/STOP button rect
  var mouseDownPt = null;     // last mousedown canvas point (for hit-tests)

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
    head.textContent = 'OFFICE COFFEE — set the dials, then BREW';

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

  // angle from a dial center to point p, mapped onto 0..1 across the dial sweep
  function angleToVal(d, p){
    var a = Math.atan2(p.y - d.cy, p.x - d.cx);
    // rotate so straight-down (pointer rest) sits mid-sweep; our sweep is
    // centered on -90deg (up) is min... use the raw atan2 clamped to the arc.
    // Map a in [DIAL_MIN..DIAL_MAX] where 0rad points right. We want the knob
    // pointer to sweep from lower-left (min) through top to lower-right (max).
    // Shift atan2 by +90deg so "up" => 0, then it ranges around there.
    var rel = a + Math.PI / 2;           // up = 0
    // normalize into [-PI, PI]
    while(rel >  Math.PI) rel -= 2*Math.PI;
    while(rel < -Math.PI) rel += 2*Math.PI;
    rel = clamp(rel, DIAL_MIN, DIAL_MAX);
    return (rel - DIAL_MIN) / (DIAL_MAX - DIAL_MIN);
  }

  // ---------------------------------------------------------------- input
  function onMouseDown(e){
    var p = toCanvas(e);
    if(!p) return;
    mouseDownPt = p;

    if(phase === 'setup'){
      // grab a dial if pressed on/near it
      for(var i=0;i<dials.length;i++){
        var d = dials[i];
        var dx = p.x - d.cx, dy = p.y - d.cy;
        if(dx*dx + dy*dy <= (DIAL_R + 10)*(DIAL_R + 10)){
          dragDial = i;
          d.val = angleToVal(d, p);
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
  }

  function onMouseMove(e){
    if(dragDial < 0) return;
    var p = toCanvas(e);
    if(!p) return;
    dials[dragDial].val = angleToVal(dials[dragDial], p);
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
    overflowed = false;
    dragDial = -1;
    try { if(G.audio && G.audio.click) G.audio.click(); } catch(e){}
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

  // evaluate the finished cup and end the round
  function resolveCup(){
    if(phase !== 'pouring') return;
    phase = 'done';

    var fillGood = !overflowed && fill >= FILL_LO && fill <= FILL_HI;
    var good = fillGood && dialsGood();
    try { if(G.audio && G.audio.click) G.audio.click(); } catch(e){}
    finish(good);
  }

  // ---------------------------------------------------------------- update
  function update(dt){
    if(phase === 'pouring'){
      fill += FILL_RATE * dt;
      if(fill >= 1){
        fill = 1;
        overflowed = true;
        // overflowing auto-stops the pour as a sloppy cup
        resolveCup();
      }
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

  function drawDial(d){
    // base plate
    ctx.fillStyle = '#2a2018';
    ctx.beginPath(); ctx.arc(d.cx, d.cy, DIAL_R + 6, 0, Math.PI*2); ctx.fill();

    // target band arc (a small lit wedge on the rim)
    var aLo = DIAL_MIN + d.lo * (DIAL_MAX - DIAL_MIN) - Math.PI/2;
    var aHi = DIAL_MIN + d.hi * (DIAL_MAX - DIAL_MIN) - Math.PI/2;
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#5fae6a';
    ctx.beginPath();
    ctx.arc(d.cx, d.cy, DIAL_R + 3, aLo, aHi);
    ctx.stroke();

    // knob body
    var inBand = d.val >= d.lo && d.val <= d.hi;
    ctx.fillStyle = inBand ? '#caa06a' : '#9a7a52';
    ctx.beginPath(); ctx.arc(d.cx, d.cy, DIAL_R, 0, Math.PI*2); ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#1a120c';
    ctx.stroke();

    // pointer
    var a = DIAL_MIN + d.val * (DIAL_MAX - DIAL_MIN) - Math.PI/2;
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
    var liqH = innerH * clamp(fill, 0, 1);
    ctx.fillStyle = overflowed ? '#8a5a2c' : '#6f4423';
    ctx.fillRect(innerX, innerY + (innerH - liqH), innerW, liqH);
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

    // pour stream while brewing
    if(phase === 'pouring' && fill < 1){
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
    else { label = '...'; bcol = '#7a6a55'; }
    ctx.fillStyle = bcol;
    roundRect(brewBtn.x, brewBtn.y, brewBtn.w, brewBtn.h, 7); ctx.fill();
    ctx.strokeStyle = '#1a120c'; ctx.lineWidth = 3;
    roundRect(brewBtn.x, brewBtn.y, brewBtn.w, brewBtn.h, 7); ctx.stroke();
    ctx.fillStyle = '#1a120c';
    ctx.font = '16px "Silkscreen", monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, brewBtn.x + brewBtn.w/2, brewBtn.y + brewBtn.h/2 + 1);

    // hint line
    ctx.fillStyle = '#cdb59c';
    ctx.font = '9px "Silkscreen", monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    var hint = phase === 'setup'
      ? 'drag dials into the green band'
      : (phase === 'pouring' ? 'press STOP at the full line' : '');
    ctx.fillText(hint, CW/2, brewBtn.y + brewBtn.h + 6);
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
    overflowed = false;
    dragDial = -1;
    mouseDownPt = null;

    // randomize each dial's target band + a starting value outside it
    for(var i=0;i<dials.length;i++){
      var d = dials[i];
      var lo = 0.25 + Math.random() * 0.4;   // band start
      var w  = 0.16 + Math.random() * 0.08;  // band width (forgiving)
      d.lo = lo; d.hi = Math.min(0.98, lo + w);
      d.val = Math.random() < 0.5 ? 0.08 : 0.92;  // start clearly outside band
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

    // resume the sim
    if(paused && G.modals && G.modals.releasePause){ G.modals.releasePause(); }
    paused = false;
    if(G.__propBusy === 'coffee') G.__propBusy = null;   // release mutual-exclusion lock

    if(consumed){
      syncDay();
      if(G.state) G.state._cofCount = (G.state._cofCount || 0) + 1;
    }
  }

  // a cup was poured — good=true if clean (fill in zone + dials in band)
  function finish(good){
    if(closing) return;
    if(good){
      try { if(G.chaos && G.chaos.add) G.chaos.add(-CHAOS_GOOD); } catch(e){}
      if(G.dock) G.dock.infoToast('FRESH BREW ☕',
        'A proper cup. The floor exhales — chaos −5%.', 'good');
    } else {
      try { if(G.chaos && G.chaos.add) G.chaos.add(-CHAOS_OK); } catch(e){}
      if(G.dock) G.dock.infoToast('COFFEE ☕',
        'Drinkable. Barely. chaos −2%.', '');
    }
    close(true);               // either cup burns a daily charge
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
  G.coffee = {
    open: open,
    available: available
  };
})();
