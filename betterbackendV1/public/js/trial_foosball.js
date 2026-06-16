// CravAche — FOOSBALL mini-game. Tapping the office foosball table opens a real,
// player-controlled top-down table-football match (the old auto-play animation is
// gone). While it runs the sim is PAUSED via the modal pause refcount (time stops,
// no new briefs). First to 5 goals ends the match. Win → chaos −8.
//
// Distinct from the table-tennis Pong build: this is top-down foosball with a
// 3-figure rod and goals, not an up/down paddle. Player rod slides UP/DOWN (mouse
// Y / W,S / Arrow Up,Down); CPU rod tracks the puck imperfectly.
//
// Isolated: no always-visible launcher button (entry is only via open()), own
// absolutely-positioned overlay, touches nothing in office_trial.js / modals.js.
// Per-day cap tracked on lazy G.state fields (_fbDayKey / _fbCount), separate from
// meditation's _med* and the table-tennis agent's _tt*.
(function(){
  'use strict';
  window.G = window.G || {};

  var MAX_PER_DAY = 2;
  var GOALS_TO_WIN = 5;

  // canvas geometry
  var CW = 480, CH = 320;
  var WALL = 14;                  // top/bottom rail thickness
  var GOAL_H = 110;               // height of the goal mouths
  var ROD_W = 12;                 // rod bar width
  var FIG_H = 34;                 // figure (foot) height
  var FIG_GAP = 18;               // gap between the 3 figures on a rod
  var PUCK_R = 7;
  var PLAYER_X = 120;             // player's rod x (player attacks toward LEFT goal)
  var CPU_X = CW - 120;           // CPU's rod x
  var PLAYER_SPEED = 7;           // keyboard rod step per frame
  var CPU_SPEED = 3.2;            // CPU rod chase speed (imperfect)

  var overlayEl = null;
  var canvas = null, ctx = null;
  var playing = false;
  var paused = false;             // did WE acquire the pause lock?
  var rafId = null;
  var lastT = 0;

  // input state
  var keyUp = false, keyDown = false;
  var mouseY = null;

  // match state
  var puck = null;
  var playerRodY = 0, cpuRodY = 0;
  var youScore = 0, cpuScore = 0;

  // bound listener handles (so we remove EXACTLY what we added)
  var onKeyDown = null, onKeyUp = null, onMouseMove = null;

  function stage(){ return document.getElementById('stage') || document.body; }

  function gameRunning(){
    return !!(G.state && G.state.running && !G.state.gameOver);
  }

  // day key matches the rest of the office: week*10 + day
  function dayKey(){
    var s = G.state || {};
    return (s.week || 0) * 10 + (s.day || 0);
  }

  // lazy per-day counter on G.state. Resets when the day changes.
  function syncDay(){
    var s = G.state;
    if(!s) return;
    var k = dayKey();
    if(s._fbDayKey !== k){
      s._fbDayKey = k;
      s._fbCount = 0;
    }
  }

  function usedToday(){
    syncDay();
    return (G.state && G.state._fbCount) || 0;
  }

  function available(){
    if(G.__propBusy && G.__propBusy !== 'fb') return false;
    return gameRunning() && !playing &&
      !(G.modals && G.modals.anyOpen && G.modals.anyOpen()) &&
      usedToday() < MAX_PER_DAY;
  }

  // ---------------------------------------------------------------- styles
  function injectCSS(){
    if(document.getElementById('fb-style')) return;
    var st = document.createElement('style');
    st.id = 'fb-style';
    st.textContent = [
      '#fb-overlay{position:absolute;inset:0;z-index:200;',
        'display:flex;flex-direction:column;align-items:center;justify-content:center;',
        'background:radial-gradient(circle at 50% 40%, rgba(18,40,24,.94), rgba(6,12,8,.97));',
        'opacity:0;transition:opacity .35s ease;}',
      '#fb-overlay.in{opacity:1;}',
      '#fb-overlay .fb-head{color:#e9f7ec;margin-bottom:14px;text-align:center;',
        'font:300 18px/1.3 "Silkscreen",system-ui,sans-serif;letter-spacing:2px;',
        'text-shadow:0 2px 10px rgba(0,0,0,.5);}',
      '#fb-overlay .fb-head .fb-sub{display:block;margin-top:7px;color:#9fd0aa;',
        'opacity:.75;font:12px/1.3 system-ui,sans-serif;letter-spacing:1px;}',
      '#fb-overlay canvas{border-radius:10px;box-shadow:0 10px 40px rgba(0,0,0,.55);',
        'image-rendering:pixelated;cursor:none;}',
      '#fb-overlay .fb-leave{margin-top:16px;color:#bfe0c6;opacity:.78;cursor:pointer;',
        'font:13px/1 system-ui,sans-serif;letter-spacing:1px;border:none;background:none;}',
      '#fb-overlay .fb-leave:hover{opacity:1;text-decoration:underline;}'
    ].join('');
    document.head.appendChild(st);
  }

  // ---------------------------------------------------------------- match setup
  function clampRod(y){
    var minY = WALL + 2;
    var maxY = CH - WALL - rodLen() - 2;
    if(y < minY) y = minY;
    if(y > maxY) y = maxY;
    return y;
  }

  // total vertical length covered by the 3 figures + gaps
  function rodLen(){
    return FIG_H * 3 + FIG_GAP * 2;
  }

  function resetPuck(dir){
    puck = {
      x: CW / 2, y: CH / 2,
      vx: (dir || (Math.random() < 0.5 ? -1 : 1)) * 3.4,
      vy: (Math.random() * 2 - 1) * 2.2
    };
  }

  function startMatch(){
    youScore = 0; cpuScore = 0;
    playerRodY = clampRod(CH / 2 - rodLen() / 2);
    cpuRodY = clampRod(CH / 2 - rodLen() / 2);
    keyUp = keyDown = false;
    mouseY = null;
    resetPuck();
  }

  // ---------------------------------------------------------------- input
  function attachInput(){
    onKeyDown = function(e){
      var k = e.key;
      if(k === 'Escape'){ e.preventDefault(); e.stopImmediatePropagation(); quit(); return; }
      if(k === 'ArrowUp' || k === 'w' || k === 'W'){ keyUp = true; e.preventDefault(); }
      if(k === 'ArrowDown' || k === 's' || k === 'S'){ keyDown = true; e.preventDefault(); }
    };
    onKeyUp = function(e){
      var k = e.key;
      if(k === 'ArrowUp' || k === 'w' || k === 'W'){ keyUp = false; }
      if(k === 'ArrowDown' || k === 's' || k === 'S'){ keyDown = false; }
    };
    onMouseMove = function(e){
      if(!canvas) return;
      var r = canvas.getBoundingClientRect();
      // map cursor to canvas-space, account for any CSS scaling
      var scale = CH / r.height;
      mouseY = (e.clientY - r.top) * scale - rodLen() / 2;
    };
    // capture phase so our Esc beats main.js's bubble-phase pause-menu listener
    // (main.js registers its window keydown first, so bubble order would fire it
    // before us — capture runs ahead of both).
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    if(canvas) canvas.addEventListener('mousemove', onMouseMove);
  }

  function detachInput(){
    if(onKeyDown){ window.removeEventListener('keydown', onKeyDown, true); onKeyDown = null; }
    if(onKeyUp){ window.removeEventListener('keyup', onKeyUp, true); onKeyUp = null; }
    if(onMouseMove && canvas){ canvas.removeEventListener('mousemove', onMouseMove); }
    onMouseMove = null;
  }

  // ---------------------------------------------------------------- simulation
  function rodHit(rodX, rodY){
    // is the puck overlapping any of the 3 figures on this rod?
    if(puck.x + PUCK_R < rodX - ROD_W / 2 || puck.x - PUCK_R > rodX + ROD_W / 2){
      return false;
    }
    for(var i = 0; i < 3; i++){
      var fy = rodY + i * (FIG_H + FIG_GAP);
      if(puck.y + PUCK_R >= fy && puck.y - PUCK_R <= fy + FIG_H){
        return true;
      }
    }
    return false;
  }

  function step(){
    // ---- player rod from keyboard + mouse
    if(keyUp) playerRodY -= PLAYER_SPEED;
    if(keyDown) playerRodY += PLAYER_SPEED;
    if(mouseY !== null){
      // ease toward the mouse target for a smooth feel
      playerRodY += (mouseY - playerRodY) * 0.35;
    }
    playerRodY = clampRod(playerRodY);

    // ---- CPU rod tracks puck center imperfectly
    var target = puck.y - rodLen() / 2;
    var dy = target - cpuRodY;
    if(dy > CPU_SPEED) dy = CPU_SPEED;
    if(dy < -CPU_SPEED) dy = -CPU_SPEED;
    cpuRodY = clampRod(cpuRodY + dy);

    // ---- puck motion
    puck.x += puck.vx;
    puck.y += puck.vy;

    // top/bottom rails
    if(puck.y - PUCK_R <= WALL){ puck.y = WALL + PUCK_R; puck.vy = Math.abs(puck.vy); }
    if(puck.y + PUCK_R >= CH - WALL){ puck.y = CH - WALL - PUCK_R; puck.vy = -Math.abs(puck.vy); }

    // player rod (sends puck rightward toward CPU goal)
    if(puck.vx < 0 && rodHit(PLAYER_X, playerRodY)){
      puck.x = PLAYER_X + ROD_W / 2 + PUCK_R;
      puck.vx = Math.abs(puck.vx) + 0.25;
      // angle off where on the rod it struck
      var pCenter = playerRodY + rodLen() / 2;
      puck.vy += (puck.y - pCenter) * 0.05;
    }
    // CPU rod (sends puck leftward toward player goal)
    if(puck.vx > 0 && rodHit(CPU_X, cpuRodY)){
      puck.x = CPU_X - ROD_W / 2 - PUCK_R;
      puck.vx = -(Math.abs(puck.vx) + 0.25);
      var cCenter = cpuRodY + rodLen() / 2;
      puck.vy += (puck.y - cCenter) * 0.05;
    }

    // clamp puck speed so it never goes silly fast
    if(puck.vy > 6) puck.vy = 6;
    if(puck.vy < -6) puck.vy = -6;
    if(puck.vx > 7) puck.vx = 7;
    if(puck.vx < -7) puck.vx = -7;

    // goal mouths (vertically centered)
    var goalTop = (CH - GOAL_H) / 2, goalBot = goalTop + GOAL_H;

    // LEFT goal = CPU's net → YOU score when puck enters it
    if(puck.x - PUCK_R <= 4){
      if(puck.y > goalTop && puck.y < goalBot){
        youScore++;
        if(youScore >= GOALS_TO_WIN){ win(); return; }
        resetPuck(1);
      } else {
        // hit the wall outside the mouth → bounce back
        puck.x = 4 + PUCK_R; puck.vx = Math.abs(puck.vx);
      }
    }
    // RIGHT goal = YOUR net → CPU scores when puck enters it
    if(puck.x + PUCK_R >= CW - 4){
      if(puck.y > goalTop && puck.y < goalBot){
        cpuScore++;
        if(cpuScore >= GOALS_TO_WIN){ lose(); return; }
        resetPuck(-1);
      } else {
        puck.x = CW - 4 - PUCK_R; puck.vx = -Math.abs(puck.vx);
      }
    }
  }

  // ---------------------------------------------------------------- draw
  function drawRod(rodX, rodY, color){
    // the steel rod
    ctx.fillStyle = 'rgba(210,220,225,.55)';
    ctx.fillRect(rodX - 2, WALL, 4, CH - WALL * 2);
    // 3 figures (the little kickers)
    ctx.fillStyle = color;
    for(var i = 0; i < 3; i++){
      var fy = rodY + i * (FIG_H + FIG_GAP);
      ctx.fillRect(rodX - ROD_W / 2, fy, ROD_W, FIG_H);
      // a lighter cap so they read as figures, not just bars
      ctx.fillStyle = 'rgba(255,255,255,.35)';
      ctx.fillRect(rodX - ROD_W / 2, fy, ROD_W, 5);
      ctx.fillStyle = color;
    }
  }

  function draw(){
    // table felt
    ctx.fillStyle = '#1c7a3a';
    ctx.fillRect(0, 0, CW, CH);

    // rails
    ctx.fillStyle = '#0f3d1f';
    ctx.fillRect(0, 0, CW, WALL);
    ctx.fillRect(0, CH - WALL, CW, WALL);

    var goalTop = (CH - GOAL_H) / 2, goalBot = goalTop + GOAL_H;

    // white markings
    ctx.strokeStyle = 'rgba(255,255,255,.7)';
    ctx.lineWidth = 2;
    // center line
    ctx.beginPath();
    ctx.moveTo(CW / 2, WALL);
    ctx.lineTo(CW / 2, CH - WALL);
    ctx.stroke();
    // center circle
    ctx.beginPath();
    ctx.arc(CW / 2, CH / 2, 36, 0, Math.PI * 2);
    ctx.stroke();
    // goal boxes
    ctx.strokeRect(4, goalTop, 40, GOAL_H);
    ctx.strokeRect(CW - 44, goalTop, 40, GOAL_H);

    // goal mouths (dark openings on the side walls)
    ctx.fillStyle = '#06210e';
    ctx.fillRect(0, goalTop, 4, GOAL_H);
    ctx.fillRect(CW - 4, goalTop, 4, GOAL_H);

    // rods
    drawRod(PLAYER_X, playerRodY, '#3a78d8');  // player = blue
    drawRod(CPU_X, cpuRodY, '#d8453a');         // CPU = red

    // puck
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(puck.x, puck.y, PUCK_R, 0, Math.PI * 2);
    ctx.fill();

    // score, Silkscreen
    ctx.fillStyle = '#eafff0';
    ctx.font = '16px "Silkscreen", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('YOU ' + youScore + '   CPU ' + cpuScore, CW / 2, 2);
  }

  // ---------------------------------------------------------------- loop
  function frame(t){
    if(!playing) return;
    var dt = t - lastT;
    lastT = t;
    // fixed-ish stepping; if a tab stalls, cap to avoid tunnelling
    var steps = 1;
    if(dt > 40) steps = 2;
    for(var i = 0; i < steps; i++){
      if(!playing) return;
      step();
    }
    if(!playing) return;       // step() may have ended the match
    draw();
    rafId = requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- overlay
  function showOverlay(){
    overlayEl = document.createElement('div');
    overlayEl.id = 'fb-overlay';

    var head = document.createElement('div');
    head.className = 'fb-head';
    head.innerHTML = 'FOOSBALL ⚽ — first to 5' +
      '<span class="fb-sub">slide your rod: mouse / W,S / ↑,↓ &nbsp;·&nbsp; defend right, score left</span>';

    canvas = document.createElement('canvas');
    canvas.width = CW;
    canvas.height = CH;

    var leave = document.createElement('button');
    leave.type = 'button';
    leave.className = 'fb-leave';
    leave.textContent = '✕ leave (Esc)';
    leave.addEventListener('click', function(){ quit(); });

    overlayEl.appendChild(head);
    overlayEl.appendChild(canvas);
    overlayEl.appendChild(leave);
    stage().appendChild(overlayEl);

    ctx = canvas.getContext('2d');
    requestAnimationFrame(function(){ if(overlayEl) overlayEl.classList.add('in'); });
  }

  function hideOverlay(){
    if(!overlayEl) return;
    var el = overlayEl;
    overlayEl = null;
    el.classList.remove('in');
    setTimeout(function(){ if(el && el.parentNode) el.remove(); }, 320);
  }

  // ---------------------------------------------------------------- flow
  function open(){
    if(!available()) return;

    playing = true;
    try { if(G.audio && G.audio.click) G.audio.click(); } catch(e){}

    // stop the sim: time + brief spawning halt until we release.
    G.__propBusy = 'fb';   // mutual exclusion: blocks table tennis + meditation
    if(G.modals && G.modals.acquirePause){ G.modals.acquirePause(); paused = true; }

    showOverlay();
    startMatch();
    attachInput();

    lastT = performance.now();
    rafId = requestAnimationFrame(frame);
  }

  // shared teardown — release pause, kill loop/input/overlay. Guards double-close.
  function teardown(){
    if(!playing) return false;
    playing = false;

    if(rafId){ cancelAnimationFrame(rafId); rafId = null; }
    detachInput();
    hideOverlay();
    canvas = null; ctx = null;

    if(paused && G.modals && G.modals.releasePause){ G.modals.releasePause(); }
    paused = false;
    if(G.__propBusy === 'fb') G.__propBusy = null;   // release mutual-exclusion lock
    return true;
  }

  function win(){
    if(!teardown()) return;
    // count this play against today's cap
    syncDay();
    if(G.state) G.state._fbCount = (G.state._fbCount || 0) + 1;
    try { if(G.chaos && G.chaos.add) G.chaos.add(-8); } catch(e){}
    if(G.dock) G.dock.infoToast('FOOSBALL ⚽', 'Buried it. Tension gone, chaos −8%.', 'good');
  }

  function lose(){
    if(!teardown()) return;
    // a loss still burns a daily charge — you played it
    syncDay();
    if(G.state) G.state._fbCount = (G.state._fbCount || 0) + 1;
    if(G.dock) G.dock.infoToast('FOOSBALL ⚽', 'They smacked it past you. Back to work.', '');
  }

  // ✕ / Esc before the match ends → no perk, no charge consumed
  function quit(){
    teardown();
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

  // entry point — the office foosball table calls open(); another agent wires it.
  G.foosball = {
    open: open,
    available: available
  };
})();
