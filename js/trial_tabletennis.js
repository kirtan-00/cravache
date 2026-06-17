// CravAche — TABLE TENNIS break. A self-contained Pong mini-game the player
// opens by tapping the office table. While it runs the sim is PAUSED (time
// stops, no new briefs) via the modal pause refcount. First to 5 wins: a win
// clears the head and drops chaos −8 (points, matching chai's chaos.add
// convention — points, not percent of current). A loss still counts against
// the daily cap but grants no perk. Quitting early (✕ / Esc) costs nothing.
//
// Isolated: NO always-visible launcher button — entry is only via the exposed
// open() (the office table taps it). Own absolutely-positioned overlay; touches
// nothing in office_trial.js / modals.js. Per-day cap is tracked on lazy
// G.state fields (_ttDayKey / _ttCount) without editing state.js.
(function(){
  'use strict';
  window.G = window.G || {};

  var MAX_PER_DAY = 2;
  var WIN_SCORE = 5;          // first to 5 points takes the match
  var CHAOS_DROP = 8;         // subtract 8 chaos points on a win

  // canvas dimensions (internal pixels; CSS may scale)
  var CW = 480, CH = 320;
  var PADDLE_W = 10, PADDLE_H = 64;
  var BALL = 10;              // square ball size
  var PADDLE_SPEED = 360;     // player keyboard paddle speed (px/s)
  var CPU_SPEED = 260;        // CPU paddle max speed (px/s) — beatable
  var BALL_SPEED = 260;       // base ball speed (px/s)

  var overlayEl = null;
  var canvasEl = null;
  var ctx = null;
  var scoreEl = null;
  var playing = false;        // is the mini-game live?
  var paused = false;         // did WE acquire the pause lock?
  var rafId = null;
  var lastT = 0;
  var closing = false;        // guard against double-close

  // game state
  var py = 0, cy = 0;         // paddle y (top edge)
  var bx = 0, by = 0;         // ball top-left
  var bvx = 0, bvy = 0;       // ball velocity
  var pScore = 0, cScore = 0;
  var ended = false;          // match decided?
  var mouseY = -1;            // last mouse y over canvas (-1 = none)
  var keyUp = false, keyDown = false;

  function stage(){ return document.getElementById('stage') || document.body; }

  function gameRunning(){
    return !!(G.state && G.state.running && !G.state.gameOver);
  }

  // day key matches the chai station / meditation: week*10 + day
  function dayKey(){
    var s = G.state || {};
    return (s.week || 0) * 10 + (s.day || 0);
  }

  // lazy per-day counter on G.state. Resets when the day changes.
  function syncDay(){
    var s = G.state;
    if(!s) return;
    var k = dayKey();
    if(s._ttDayKey !== k){
      s._ttDayKey = k;
      s._ttCount = 0;
    }
  }

  function usedToday(){
    syncDay();
    return (G.state && G.state._ttCount) || 0;
  }

  function modalOpen(){
    return !!(G.modals && G.modals.anyOpen && G.modals.anyOpen());
  }

  function available(){
    if(G.__propBusy && G.__propBusy !== 'tt') return false;
    return gameRunning() && !playing && !modalOpen() && usedToday() < MAX_PER_DAY;
  }

  // ---------------------------------------------------------------- styles
  function injectCSS(){
    if(document.getElementById('tt-style')) return;
    var st = document.createElement('style');
    st.id = 'tt-style';
    st.textContent = [
      // dark radial backdrop, fade-in (mirrors the meditation overlay)
      '#tt-overlay{position:absolute;inset:0;z-index:200;',
        'display:flex;flex-direction:column;align-items:center;justify-content:center;',
        'background:radial-gradient(circle at 50% 45%, rgba(20,28,24,.93), rgba(6,10,8,.97));',
        'opacity:0;transition:opacity .4s ease;}',
      '#tt-overlay.in{opacity:1;}',
      '#tt-overlay .tt-head{color:#dff4ea;',
        'font:300 17px/1 "Silkscreen",system-ui,sans-serif;letter-spacing:3px;',
        'margin-bottom:14px;text-shadow:0 2px 12px rgba(0,0,0,.6);}',
      '#tt-overlay canvas{background:#000;border-radius:8px;',
        'box-shadow:0 0 50px rgba(120,220,180,.25),0 8px 30px rgba(0,0,0,.6);',
        'cursor:none;max-width:92vw;height:auto;image-rendering:pixelated;}',
      '#tt-overlay .tt-leave{margin-top:16px;color:#9fc7b6;opacity:.8;cursor:pointer;',
        'font:13px/1 system-ui,sans-serif;letter-spacing:1px;}',
      '#tt-overlay .tt-leave:hover{opacity:1;}'
    ].join('');
    document.head.appendChild(st);
  }

  // ---------------------------------------------------------------- overlay
  function buildOverlay(){
    overlayEl = document.createElement('div');
    overlayEl.id = 'tt-overlay';

    var head = document.createElement('div');
    head.className = 'tt-head';
    head.textContent = 'OFFICE TABLE TENNIS — first to 5';

    canvasEl = document.createElement('canvas');
    canvasEl.width = CW;
    canvasEl.height = CH;

    scoreEl = head; // header doubles as nothing; score is drawn on canvas

    var leave = document.createElement('div');
    leave.className = 'tt-leave';
    leave.textContent = '✕ leave (Esc)';
    leave.addEventListener('click', function(){ quit(); });

    overlayEl.appendChild(head);
    overlayEl.appendChild(canvasEl);
    overlayEl.appendChild(leave);
    stage().appendChild(overlayEl);

    ctx = canvasEl.getContext('2d');

    // listeners — tracked so we can rip them all out on close
    // mouse drives the paddle from ANYWHERE on screen (window-level), so the
    // player never loses control by drifting the cursor off the small canvas.
    window.addEventListener('mousemove', onMouseMove);
    // capture phase on window so our Esc beats main.js's bubble-phase pause-menu
    // listener (same trick trial_overrides.js uses for its modals).
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);

    // kick the fade-in on next frame
    requestAnimationFrame(function(){ if(overlayEl) overlayEl.classList.add('in'); });
  }

  function removeListeners(){
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('keyup', onKeyUp, true);
  }

  // ---------------------------------------------------------------- input
  function onMouseMove(e){
    if(!canvasEl) return;
    var r = canvasEl.getBoundingClientRect();
    if(!r.height) return;
    // map screen y into internal canvas coords (canvas may be CSS-scaled) and
    // clamp — so the paddle keeps tracking even when the cursor is above/below
    // or beside the canvas box.
    var scale = CH / r.height;
    mouseY = clamp((e.clientY - r.top) * scale, 0, CH);
  }

  function onKeyDown(e){
    var k = e.key;
    if(k === 'Escape'){ e.preventDefault(); e.stopImmediatePropagation(); quit(); return; }
    if(k === 'ArrowUp' || k === 'w' || k === 'W'){ keyUp = true; e.preventDefault(); }
    else if(k === 'ArrowDown' || k === 's' || k === 'S'){ keyDown = true; e.preventDefault(); }
  }

  function onKeyUp(e){
    var k = e.key;
    if(k === 'ArrowUp' || k === 'w' || k === 'W'){ keyUp = false; }
    else if(k === 'ArrowDown' || k === 's' || k === 'S'){ keyDown = false; }
  }

  // ---------------------------------------------------------------- game
  function resetPositions(){
    py = (CH - PADDLE_H) / 2;
    cy = (CH - PADDLE_H) / 2;
    serve(Math.random() < 0.5 ? -1 : 1);
  }

  // launch the ball from center toward dir (-1 player side, +1 cpu side)
  function serve(dir){
    bx = (CW - BALL) / 2;
    by = (CH - BALL) / 2;
    var ang = (Math.random() * 0.7 - 0.35); // shallow vertical angle
    bvx = dir * BALL_SPEED * Math.cos(ang);
    bvy = BALL_SPEED * Math.sin(ang);
  }

  function clamp(v, lo, hi){ return v < lo ? lo : (v > hi ? hi : v); }

  function update(dt){
    if(ended) return;

    // ---- player paddle: mouse Y centers the paddle; keys nudge it ----
    if(mouseY >= 0){
      py = clamp(mouseY - PADDLE_H / 2, 0, CH - PADDLE_H);
    }
    if(keyUp)   py -= PADDLE_SPEED * dt;
    if(keyDown) py += PADDLE_SPEED * dt;
    py = clamp(py, 0, CH - PADDLE_H);

    // ---- CPU paddle: tracks ball center, capped speed (imperfect) ----
    var target = by + BALL / 2 - PADDLE_H / 2;
    var diff = target - cy;
    var step = CPU_SPEED * dt;
    if(diff > step) cy += step;
    else if(diff < -step) cy -= step;
    else cy = target;
    cy = clamp(cy, 0, CH - PADDLE_H);

    // ---- ball ----
    bx += bvx * dt;
    by += bvy * dt;

    // top/bottom walls
    if(by <= 0){ by = 0; bvy = -bvy; }
    else if(by + BALL >= CH){ by = CH - BALL; bvy = -bvy; }

    // left paddle (player) — x in [PADDLE_W .. PADDLE_W+...]
    var pX = 16;
    if(bvx < 0 && bx <= pX + PADDLE_W && bx >= pX - BALL &&
       by + BALL >= py && by <= py + PADDLE_H){
      bx = pX + PADDLE_W;
      bvx = -bvx;
      bvx *= 1.04;            // speed up a touch each hit
      // add english based on where it struck the paddle
      var hitP = ((by + BALL / 2) - (py + PADDLE_H / 2)) / (PADDLE_H / 2);
      bvy += hitP * 120;
    }

    // right paddle (cpu)
    var cX = CW - 16 - PADDLE_W;
    if(bvx > 0 && bx + BALL >= cX && bx + BALL <= cX + PADDLE_W + BALL &&
       by + BALL >= cy && by <= cy + PADDLE_H){
      bx = cX - BALL;
      bvx = -bvx;
      bvx *= 1.04;
      var hitC = ((by + BALL / 2) - (cy + PADDLE_H / 2)) / (PADDLE_H / 2);
      bvy += hitC * 120;
    }

    // scoring — ball past a paddle scores for the other side
    if(bx + BALL < 0){
      cScore++;
      if(cScore >= WIN_SCORE){ ended = true; finish(false); return; }
      serve(1);
    } else if(bx > CW){
      pScore++;
      if(pScore >= WIN_SCORE){ ended = true; finish(true); return; }
      serve(-1);
    }
  }

  function draw(){
    if(!ctx) return;
    // table
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, CW, CH);

    // dashed center line
    ctx.fillStyle = '#2f4a3e';
    var dash = 14, gap = 12, x = CW / 2 - 2;
    for(var y = 6; y < CH; y += dash + gap){
      ctx.fillRect(x, y, 4, dash);
    }

    // score — Silkscreen, chunky
    ctx.fillStyle = '#dff4ea';
    ctx.font = '18px "Silkscreen", monospace';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';
    ctx.fillText('YOU ' + pScore + '   CPU ' + cScore, CW / 2, 10);

    // paddles
    ctx.fillStyle = '#eafff5';
    ctx.fillRect(16, py, PADDLE_W, PADDLE_H);                 // player (left)
    ctx.fillRect(CW - 16 - PADDLE_W, cy, PADDLE_W, PADDLE_H); // cpu (right)

    // ball — white square
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(bx, by, BALL, BALL);
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
        if(G.dock) G.dock.infoToast('TABLE TENNIS 🏓',
          'You’ve played enough today. The briefs are waiting.', '');
      }
      return;
    }
    if(modalOpen()) return;

    playing = true;
    closing = false;
    ended = false;
    pScore = 0; cScore = 0;
    mouseY = -1; keyUp = false; keyDown = false;

    try { if(G.audio && G.audio.click) G.audio.click(); } catch(e){}

    // stop the sim: time + brief spawning halt until we release.
    G.__propBusy = 'tt';   // mutual exclusion: blocks foosball + meditation
    if(G.modals && G.modals.acquirePause){ G.modals.acquirePause(); paused = true; }

    injectCSS();
    buildOverlay();
    resetPositions();

    lastT = performance.now();
    rafId = requestAnimationFrame(loop);
  }

  // tear down: stop loop, drop listeners, release pause, remove overlay.
  // consumed=true counts this play against the daily cap.
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
    canvasEl = null; ctx = null; scoreEl = null;

    // resume the sim
    if(paused && G.modals && G.modals.releasePause){ G.modals.releasePause(); }
    paused = false;
    if(G.__propBusy === 'tt') G.__propBusy = null;   // release mutual-exclusion lock

    if(consumed){
      syncDay();
      if(G.state) G.state._ttCount = (G.state._ttCount || 0) + 1;
    }
  }

  // match decided — won=true if the player reached 5 first
  function finish(won){
    if(closing) return;
    if(won){
      // chaos -8 (points, matching chai's chaos.add convention)
      try { if(G.chaos && G.chaos.add) G.chaos.add(-CHAOS_DROP); } catch(e){}
      if(G.dock) G.dock.infoToast('TABLE TENNIS 🏓',
        'Smashed it. Head clear, chaos −8%.', 'good');
    } else {
      if(G.dock) G.dock.infoToast('TABLE TENNIS 🏓',
        'Lost the rally. Back to work.', '');
    }
    close(true);               // either result burns a daily charge
  }

  // bailed before the match ended — costs no daily charge, no perk
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

  // entry interface — the office table calls open(); available() gates it.
  G.tableTennis = {
    open: open,
    available: available
  };
})();
