// CravAche — DRIP COFFEE MACHINE mini-game. A self-contained brewing break the
// player opens by tapping the office coffee machine. While it runs the sim is
// PAUSED (time stops, no new briefs) via the modal pause refcount.
//
// It behaves like a real filter/drip machine, with three tactile steps:
//   1) SCOOP grounds into the basket  — tap the SCOOP button; each tap thocks in
//      one scoop and the bed of grounds grows. Aim for the target dose band.
//   2) FILL the water tank            — press-and-HOLD the tank to pour; the level
//      rises while you hold and stops when you let go. Aim for the band, don't
//      overflow (a spill is a sloppy pot).
//   3) FLIP the power switch          — a real rocker that thunks ON and starts
//      the drip. Coffee gurgles down into the carafe, the warming plate glows.
// A clean pot (dose + water both in band) drops chaos more; a sloppy one less.
// Either way it burns a daily charge. Bailing before you flip the switch is free.
//
// Isolated: NO always-visible launcher — entry is only via the exposed open()
// (the office coffee machine taps it). Own absolutely-positioned overlay; touches
// nothing in office_trial.js / modals.js. Per-day cap on lazy G.state fields
// (_cofDayKey / _cofCount) without editing state.js.
(function(){
  'use strict';
  window.G = window.G || {};

  var MAX_PER_DAY = 1;        // one pot a day — a real ritual, not a chaos vending machine

  // a finished pot perks the whole floor up for a minute. Magnitude scales with
  // how good the pot was (rewards nailing the brew); duration is sim-seconds so
  // pause / meditation correctly freeze the countdown.
  var BUFF_SECONDS = 60;
  var BUFF_MULT = { 3: 1.25, 2: 1.15, 1: 1.08 };   // ★★★ +25% · ★★ +15% · ★ +8%
  // chaos drop scales with mastery: a dialled-in pot rewards harder than slop
  var CHAOS_PERFECT = 6;      // ★★★ — dose dead-on + water bang in the band
  var CHAOS_GOOD    = 5;      // ★★  — clean pot (dose in band, water in band)
  var CHAOS_OK      = 2;      // ★   — drinkable, barely (off dose / over/under water)

  // canvas dimensions (internal pixels; CSS may scale)
  var CW = 460, CH = 340;

  // ---- grounds (discrete scoops) -------------------------------------------
  var MAX_SCOOPS = 6;         // basket can hold this many before it mounds over
  var scoops = 0;             // scoops currently in the basket
  var gLo = 3, gHi = 5;       // target dose band (in scoop counts), randomized per run

  // ---- water (hold-to-pour) -------------------------------------------------
  var WATER_RATE = 0.42;      // tank fills this fraction per second while held
  var water = 0;              // tank level 0..1
  var wLo = 0.55, wHi = 0.80; // target water band, randomized per run
  var pouring = false;        // holding on the tank right now?
  var spilled = false;        // overflowed the tank?

  // ---- switch + drip --------------------------------------------------------
  var sw = false;             // power switch on?
  var carafe = 0;             // coffee in the carafe 0..1 (rises during the drip)
  var dripT = 0, dripDur = 0; // drip progress / total duration (scales with water)
  var drops = [];             // falling droplets, basket spout -> carafe

  // feedback flashes (0..1, decay over time)
  var gGlow = 0, wGlow = 0, swGlow = 0;
  var fullFlash = 0;          // "basket full" / "need grounds+water" nudge flash

  // ---- hit regions (kept in sync with draw) --------------------------------
  var scoopBtn = { x: 34,  y: 250, w: 110, h: 40 };
  var swBtn    = { x: 300, y: 250, w: 92,  h: 40 };
  var tankRect = { x: 372, y: 44,  w: 58,  h: 150 };

  var overlayEl = null, canvasEl = null, ctx = null;
  var playing = false, paused = false, rafId = null, lastT = 0, closing = false;
  var phase = 'setup';        // 'setup' -> 'dripping' -> 'result' -> (close)

  // ---- result / juice -------------------------------------------------------
  var result = null, resultT = 0;
  var RESULT_HOLD = 1.1;
  var spark = [], steam = [], animT = 0, dropAcc = 0;

  function stage(){ return document.getElementById('stage') || document.body; }
  function gameRunning(){ return !!(G.state && G.state.running && !G.state.gameOver); }
  function dayKey(){ var s = G.state || {}; return (s.week || 0) * 10 + (s.day || 0); }
  function syncDay(){
    var s = G.state; if(!s) return;
    var k = dayKey();
    if(s._cofDayKey !== k){ s._cofDayKey = k; s._cofCount = 0; }
  }
  function usedToday(){ syncDay(); return (G.state && G.state._cofCount) || 0; }
  function modalOpen(){ return !!(G.modals && G.modals.anyOpen && G.modals.anyOpen()); }
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
    head.textContent = 'OFFICE DRIP COFFEE — scoop, fill, flip the switch';

    canvasEl = document.createElement('canvas');
    canvasEl.width = CW; canvasEl.height = CH;

    var leave = document.createElement('div');
    leave.className = 'cof-leave';
    leave.textContent = '✕ leave (Esc)';
    leave.addEventListener('click', function(){ quit(); });

    overlayEl.appendChild(head);
    overlayEl.appendChild(canvasEl);
    overlayEl.appendChild(leave);
    stage().appendChild(overlayEl);

    ctx = canvasEl.getContext('2d');

    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('keydown', onKeyDown, true);

    requestAnimationFrame(function(){ if(overlayEl) overlayEl.classList.add('in'); });
  }

  function removeListeners(){
    window.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mouseup', onMouseUp);
    window.removeEventListener('keydown', onKeyDown, true);
  }

  function toCanvas(e){
    if(!canvasEl) return null;
    var r = canvasEl.getBoundingClientRect();
    if(!r.width || !r.height) return null;
    var sx = CW / r.width, sy = CH / r.height;
    return { x:(e.clientX - r.left) * sx, y:(e.clientY - r.top) * sy };
  }
  function inRect(p, rc){ return p && p.x >= rc.x && p.x <= rc.x + rc.w && p.y >= rc.y && p.y <= rc.y + rc.h; }

  // ---------------------------------------------------------------- input
  function onMouseDown(e){
    var p = toCanvas(e);
    if(!p) return;

    if(phase === 'setup'){
      if(inRect(p, scoopBtn)){ addScoop(); e.preventDefault(); return; }
      if(inRect(p, swBtn)){ flipSwitch(); e.preventDefault(); return; }
      // press-and-hold the tank to pour water
      if(inRect(p, tankRect)){ pouring = true; e.preventDefault(); return; }
    }
    // dripping / result: no setup input; the pot finishes on its own
  }

  function onMouseUp(){ pouring = false; }

  function onKeyDown(e){
    var k = e.key;
    if(k === 'Escape'){ e.preventDefault(); e.stopImmediatePropagation(); quit(); return; }
    if(phase === 'setup'){
      if(k === ' '){ e.preventDefault(); e.stopImmediatePropagation(); addScoop(); }       // space = scoop
      else if(k === 'Enter'){ e.preventDefault(); e.stopImmediatePropagation(); flipSwitch(); } // enter = flip
    }
  }

  // ---------------------------------------------------------------- actions
  function addScoop(){
    if(phase !== 'setup') return;
    if(scoops >= MAX_SCOOPS){ fullFlash = 1; try { if(G.audio && G.audio.decline) G.audio.decline(); } catch(e){} return; }
    scoops++;
    gGlow = 1;
    try { if(G.audio && G.audio.slotTick) G.audio.slotTick(); else if(G.audio && G.audio.click) G.audio.click(); } catch(e){}
  }

  function flipSwitch(){
    if(phase !== 'setup') return;
    if(scoops < 1 || water <= 0.001){ fullFlash = 1; try { if(G.audio && G.audio.decline) G.audio.decline(); } catch(e){} return; }
    sw = true; swGlow = 1;
    phase = 'dripping';
    dripT = 0;
    dripDur = 1.3 + water * 1.9;   // more water in the tank = longer brew
    carafe = 0;
    drops = [];
    try { if(G.audio && G.audio.waterPour) G.audio.waterPour(); else if(G.audio && G.audio.click) G.audio.click(); } catch(e){}
  }

  function dialsGoodFracs(){
    var gMid = (gLo + gHi) / 2, gHalf = (gHi - gLo) / 2 || 0.5;
    var wMid = (wLo + wHi) / 2, wHalf = (wHi - wLo) / 2 || 0.0001;
    var gTight = 1 - Math.min(1, Math.abs(scoops - gMid) / gHalf);
    var wTight = 1 - Math.min(1, Math.abs(water - wMid) / wHalf);
    return { gTight: gTight, wTight: wTight };
  }

  function resolveCup(){
    if(phase !== 'dripping') return;
    var doseGood  = scoops >= gLo && scoops <= gHi;
    var waterGood = !spilled && water >= wLo && water <= wHi;
    var clean = doseGood && waterGood;

    var stars, drop, perfect = false;
    if(clean){
      var tg = dialsGoodFracs();
      var tight = Math.min(tg.gTight, tg.wTight);
      if(tight >= 0.5){ stars = 3; drop = CHAOS_PERFECT; perfect = true; }
      else { stars = 2; drop = CHAOS_GOOD; }
    } else {
      stars = 1; drop = CHAOS_OK;
    }

    result = { stars: stars, drop: drop, perfect: perfect, clean: clean };
    resultT = 0;
    phase = 'result';

    spawnSteam();
    if(perfect){ spawnSparkles(26); try { if(G.audio && G.audio.viral) G.audio.viral(); } catch(e){} }
    else if(clean){ spawnSparkles(12); try { if(G.audio && G.audio.accept) G.audio.accept(); } catch(e){} }
    else { try { if(G.audio && G.audio.click) G.audio.click(); } catch(e){} }
  }

  // ---------------------------------------------------------------- juice
  var carafeCX = 150, carafeTopY = 150;
  function spawnSparkles(n){
    spark = [];
    for(var i=0;i<n;i++){
      var ang = Math.random() * Math.PI * 2, spd = 40 + Math.random() * 130;
      spark.push({ x: carafeCX, y: carafeTopY + 20, vx: Math.cos(ang)*spd, vy: Math.sin(ang)*spd - 50,
        life: 0, max: 0.5 + Math.random()*0.5, s: 1.5 + Math.random()*2.5 });
    }
  }
  function spawnSteam(){
    steam = [];
    for(var i=0;i<5;i++) steam.push({ x: carafeCX - 18 + i*9 + (Math.random()*6-3), seed: Math.random()*6.28, sp: 0.7 + Math.random()*0.5 });
  }

  // ---------------------------------------------------------------- update
  function update(dt){
    animT += dt;
    if(gGlow > 0) gGlow = Math.max(0, gGlow - dt * 2.2);
    if(wGlow > 0) wGlow = Math.max(0, wGlow - dt * 2.2);
    if(swGlow > 0) swGlow = Math.max(0, swGlow - dt * 1.6);
    if(fullFlash > 0) fullFlash = Math.max(0, fullFlash - dt * 1.8);

    if(phase === 'setup'){
      var wasIn = water >= wLo && water <= wHi;
      if(pouring && !spilled){
        water += WATER_RATE * dt;
        if(water >= 1){ water = 1; spilled = true; pouring = false; try { if(G.audio && G.audio.alarm) G.audio.alarm(); } catch(e){} }
      }
      var nowIn = water >= wLo && water <= wHi;
      if(nowIn && !wasIn){ wGlow = 1; try { if(G.audio && G.audio.slotTick) G.audio.slotTick(); } catch(e){} }
    }

    if(phase === 'dripping'){
      dripT += dt;
      var prog = Math.min(1, dripT / dripDur);
      carafe = water * prog;            // the carafe holds as much as the tank poured through
      // spawn droplets from the basket spout
      dropAcc += dt;
      if(prog < 1 && dropAcc >= 0.085){
        dropAcc = 0;
        drops.push({ x: carafeCX + (Math.random()*6 - 3), y: 124, v: 150 + Math.random()*40 });
      }
      for(var i=drops.length-1;i>=0;i--){
        drops[i].y += drops[i].v * dt;
        if(drops[i].y >= carafeTopY + (96 - 96*carafe)) drops.splice(i, 1);
      }
      if(prog >= 1) resolveCup();
    }

    if(phase === 'result'){
      resultT += dt;
      for(var s=0;s<spark.length;s++){
        var pp = spark[s]; pp.life += dt; pp.x += pp.vx*dt; pp.y += pp.vy*dt; pp.vy += 160*dt;
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

  function drawSteam(topY, cx){
    for(var i=0;i<steam.length;i++){
      var w = steam[i];
      for(var j=0;j<5;j++){
        var t = (animT * w.sp + w.seed + j*0.5);
        var sway = Math.sin(t) * 6;
        var yy = topY - 6 - j*9 - ((animT * 14 * w.sp + j*7) % 12);
        var alpha = 0.22 * (1 - j/5);
        ctx.fillStyle = 'rgba(243,227,210,' + alpha.toFixed(3) + ')';
        ctx.fillRect(Math.round((cx||w.x) + (cx ? (w.x - carafeCX) : 0) + sway), Math.round(yy), 4, 4);
      }
    }
  }

  function drawButton(rc, label, col, lit){
    // chunky pressable button with a dark lip; depresses look when "lit"
    ctx.fillStyle = '#1a120c';
    roundRect(rc.x, rc.y + 3, rc.w, rc.h, 7); ctx.fill();   // shadow lip
    ctx.fillStyle = col;
    roundRect(rc.x, rc.y - (lit ? 0 : 2), rc.w, rc.h, 7); ctx.fill();
    ctx.strokeStyle = '#1a120c'; ctx.lineWidth = 3;
    roundRect(rc.x, rc.y - (lit ? 0 : 2), rc.w, rc.h, 7); ctx.stroke();
    ctx.fillStyle = '#1a120c';
    ctx.font = '14px "Silkscreen", monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, rc.x + rc.w/2, rc.y + rc.h/2 - (lit ? 0 : 2) + 1);
  }

  function draw(){
    if(!ctx) return;
    ctx.fillStyle = '#1a120c'; ctx.fillRect(0,0,CW,CH);

    // ---- machine body ----
    ctx.fillStyle = '#3a2c20'; roundRect(28, 18, CW-56, 218, 12); ctx.fill();
    ctx.fillStyle = '#2a2018'; roundRect(28, 18, CW-56, 22, 12); ctx.fill();  // top moulding
    ctx.fillStyle = '#241a12'; ctx.fillRect(120, 232, CW-240, 8);             // base shelf

    // ---- water tank (right): glass column with level + target band ----
    var tk = tankRect;
    // tank body
    ctx.fillStyle = '#241a12'; roundRect(tk.x-4, tk.y-10, tk.w+8, tk.h+18, 7); ctx.fill();
    ctx.fillStyle = '#0f0a06'; roundRect(tk.x, tk.y, tk.w, tk.h, 5); ctx.fill();
    // target band
    var bTop = tk.y + tk.h * (1 - wHi), bBot = tk.y + tk.h * (1 - wLo);
    ctx.fillStyle = 'rgba(95,174,106,.28)'; ctx.fillRect(tk.x, bTop, tk.w, bBot - bTop);
    ctx.strokeStyle = '#5fae6a'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(tk.x, bTop); ctx.lineTo(tk.x+tk.w, bTop); ctx.moveTo(tk.x, bBot); ctx.lineTo(tk.x+tk.w, bBot); ctx.stroke();
    // water level
    var wH = tk.h * clamp(water, 0, 1), wTopY = tk.y + (tk.h - wH);
    var inBandW = !spilled && water >= wLo && water <= wHi;
    ctx.fillStyle = spilled ? '#3a6f8a' : (inBandW ? '#5aa6c8' : '#3f7fa0');
    ctx.fillRect(tk.x, wTopY, tk.w, wH);
    // surface shimmer
    if(water > 0.02){ ctx.fillStyle = 'rgba(180,225,245,.45)'; ctx.fillRect(tk.x, wTopY, tk.w, 2); }
    if(wGlow > 0){ ctx.strokeStyle = 'rgba(143,224,154,' + (0.7*wGlow).toFixed(3) + ')'; ctx.lineWidth = 3; ctx.strokeRect(tk.x-1, tk.y-1, tk.w+2, tk.h+2); }
    ctx.strokeStyle = '#5a4632'; ctx.lineWidth = 2; ctx.strokeRect(tk.x, tk.y, tk.w, tk.h);
    // label
    ctx.fillStyle = '#cdb59c'; ctx.font = '9px "Silkscreen", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('WATER', tk.x + tk.w/2, tk.y + tk.h + 8);
    if(spilled){ ctx.fillStyle = '#d6694a'; ctx.fillText('SPILL!', tk.x + tk.w/2, tk.y - 22); }

    // ---- filter basket (top-center-left) with grounds bed ----
    var bx = carafeCX, byTop = 56, bw = 92, bh = 40;
    // basket housing (trapezoid-ish)
    ctx.fillStyle = '#26201a';
    ctx.beginPath();
    ctx.moveTo(bx - bw/2, byTop); ctx.lineTo(bx + bw/2, byTop);
    ctx.lineTo(bx + bw/2 - 14, byTop + bh); ctx.lineTo(bx - bw/2 + 14, byTop + bh);
    ctx.closePath(); ctx.fill();
    // grounds bed inside (height grows with scoops)
    var bedMax = bh - 12, bedH = bedMax * Math.min(1, scoops / MAX_SCOOPS);
    if(bedH > 0){
      var over = scoops > gHi;
      ctx.fillStyle = over ? '#7a4a22' : '#4a3118';
      var inset = 12, topW = bw - inset*2, botW = bw - 28 - inset*2;
      var yB = byTop + bh - 5;
      ctx.beginPath();
      ctx.moveTo(bx - topW/2, yB - bedH); ctx.lineTo(bx + topW/2, yB - bedH);
      ctx.lineTo(bx + botW/2, yB); ctx.lineTo(bx - botW/2, yB);
      ctx.closePath(); ctx.fill();
      // speckle the grounds
      ctx.fillStyle = over ? '#9a6432' : '#5e3f20';
      for(var sgi=0; sgi<scoops*3; sgi++){
        var rx = bx - topW/2 + Math.abs(Math.sin(sgi*12.9)) * topW;
        var ry = yB - bedH + Math.abs(Math.cos(sgi*7.3)) * bedH;
        ctx.fillRect(Math.round(rx), Math.round(ry), 2, 2);
      }
    }
    if(gGlow > 0){ ctx.strokeStyle = 'rgba(202,160,106,' + (0.8*gGlow).toFixed(3) + ')'; ctx.lineWidth = 3;
      ctx.strokeRect(bx - bw/2 - 2, byTop - 2, bw + 4, bh + 4); }
    // dose pips above the basket: lit up to scoops, band marked
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '12px "Silkscreen", monospace';
    for(var pi=0; pi<MAX_SCOOPS; pi++){
      var pxp = bx - (MAX_SCOOPS-1)*7 + pi*14, pyp = byTop - 14;
      var inBandDose = (pi+1) >= gLo && (pi+1) <= gHi;
      ctx.fillStyle = pi < scoops ? (scoops > gHi ? '#d6694a' : '#caa06a') : (inBandDose ? '#3a5a3e' : '#2a2018');
      ctx.beginPath(); ctx.arc(pxp, pyp, 4, 0, Math.PI*2); ctx.fill();
      if(inBandDose){ ctx.strokeStyle = '#5fae6a'; ctx.lineWidth = 1.5; ctx.stroke(); }
    }
    ctx.fillStyle = '#cdb59c'; ctx.font = '9px "Silkscreen", monospace'; ctx.textBaseline = 'top';
    ctx.fillText('DOSE', bx, byTop + bh + 4);
    // spout under the basket
    ctx.fillStyle = '#1a120c'; ctx.fillRect(bx - 5, byTop + bh, 10, 18);

    // ---- carafe on the warming plate ----
    var cw = 96, ch = 96, cx = carafeCX - cw/2, cy = carafeTopY;
    // warming plate (glows amber when the switch is on)
    var plateOn = sw && phase === 'dripping';
    ctx.fillStyle = plateOn ? '#7a3a18' : '#2a2018';
    roundRect(cx - 6, cy + ch, cw + 12, 12, 4); ctx.fill();
    if(plateOn){ ctx.fillStyle = 'rgba(232,120,40,' + (0.4 + 0.25*Math.sin(animT*7)).toFixed(3) + ')';
      roundRect(cx - 6, cy + ch, cw + 12, 12, 4); ctx.fill(); }
    // coffee inside the carafe
    var inX = cx + 6, inY = cy + 6, inW = cw - 12, inH = ch - 12;
    var liqH = inH * clamp(carafe, 0, 1), liqTopY = inY + (inH - liqH);
    if(liqH > 0){
      ctx.fillStyle = '#5a3418'; ctx.fillRect(inX, liqTopY, inW, liqH);
      ctx.fillStyle = '#7a4a22'; ctx.fillRect(inX, liqTopY, inW, 3);   // surface
    }
    // glass carafe outline + handle
    ctx.strokeStyle = '#e8d8c5'; ctx.lineWidth = 4; ctx.strokeRect(cx, cy, cw, ch);
    ctx.beginPath(); ctx.arc(cx + cw + 10, cy + ch/2, 17, -Math.PI/2.2, Math.PI/2.2); ctx.stroke();
    // glass highlight
    ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx + 10, cy + 8); ctx.lineTo(cx + 10, cy + ch - 8); ctx.stroke();

    // falling droplets during the drip
    ctx.fillStyle = '#6f4423';
    for(var di=0; di<drops.length; di++) ctx.fillRect(Math.round(drops[di].x - 1.5), Math.round(drops[di].y), 3, 6);

    // steam off a hot carafe (mid-drip and on the finished pot)
    if((phase === 'dripping' && carafe > 0.25) || phase === 'result') drawSteam(liqTopY);

    // ---- SCOOP button + POWER switch ----
    drawButton(scoopBtn, '+ SCOOP', '#caa06a', gGlow > 0.5);

    // power rocker: rocks/glows when ON
    var on = sw;
    ctx.fillStyle = '#1a120c'; roundRect(swBtn.x, swBtn.y + 3, swBtn.w, swBtn.h, 7); ctx.fill();
    ctx.fillStyle = on ? '#cf5a39' : '#5a4632';
    roundRect(swBtn.x, swBtn.y - (on ? 0 : 2), swBtn.w, swBtn.h, 7); ctx.fill();
    if(on){ ctx.fillStyle = 'rgba(255,120,70,' + (0.25 + 0.2*Math.sin(animT*8)).toFixed(3) + ')';
      roundRect(swBtn.x, swBtn.y, swBtn.w, swBtn.h, 7); ctx.fill(); }
    ctx.strokeStyle = '#1a120c'; ctx.lineWidth = 3; roundRect(swBtn.x, swBtn.y - (on ? 0 : 2), swBtn.w, swBtn.h, 7); ctx.stroke();
    // little red LED
    ctx.fillStyle = on ? '#ff7a4a' : '#3a2c20';
    ctx.beginPath(); ctx.arc(swBtn.x + 14, swBtn.y + swBtn.h/2 - (on?0:2), 4, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#1a120c'; ctx.font = '13px "Silkscreen", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(on ? 'ON' : 'POWER', swBtn.x + swBtn.w/2 + 6, swBtn.y + swBtn.h/2 - (on?0:2) + 1);

    // ---- hint line ----
    ctx.fillStyle = fullFlash > 0 ? '#d6694a' : '#cdb59c';
    ctx.font = '9px "Silkscreen", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    var hint;
    if(phase === 'setup'){
      if(fullFlash > 0) hint = (scoops >= MAX_SCOOPS ? 'basket is full — flip the switch' : 'add grounds AND water, then flip POWER');
      else if(scoops < 1) hint = 'tap + SCOOP to dose the basket';
      else if(water <= 0.001) hint = 'hold the WATER tank to pour';
      else hint = 'looks good — flip POWER to brew';
    } else if(phase === 'dripping'){ hint = 'brewing… the floor runs on this'; }
    else hint = '';
    if(hint) ctx.fillText(hint, CW/2, CH - 18);

    if(phase === 'result' && result) drawResult();
  }

  function drawResult(){
    var prog = Math.min(1, resultT / RESULT_HOLD);
    var pop = 1 - Math.pow(1 - Math.min(1, resultT / 0.22), 3);
    ctx.fillStyle = 'rgba(14,8,5,' + (0.55 * prog).toFixed(3) + ')'; ctx.fillRect(0, 0, CW, CH);

    for(var s=0;s<spark.length;s++){
      var p = spark[s]; var a = 1 - Math.min(1, p.life / p.max);
      if(a <= 0) continue;
      ctx.fillStyle = (result.perfect ? 'rgba(143,224,154,' : 'rgba(243,227,210,') + a.toFixed(3) + ')';
      var sz = p.s * a; ctx.fillRect(Math.round(p.x - sz/2), Math.round(p.y - sz/2), Math.ceil(sz), Math.ceil(sz));
    }

    var cyc = CH/2 - 6;
    ctx.save(); ctx.translate(CW/2, cyc); ctx.scale(pop, pop);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '30px "Silkscreen", monospace';
    var starStr = '';
    for(var i=0;i<3;i++) starStr += (i < result.stars ? '★' : '☆');
    if(result.clean){
      var pulse = 0.4 + 0.3 * Math.sin(animT * 9);
      ctx.fillStyle = (result.perfect ? 'rgba(143,224,154,' : 'rgba(202,160,106,') + (pulse*0.5).toFixed(3) + ')';
      ctx.fillText(starStr, 0, -28);
    }
    ctx.fillStyle = result.perfect ? '#8fe09a' : (result.clean ? '#caa06a' : '#9a7a52');
    ctx.fillText(starStr, 0, -28);
    ctx.font = '18px "Silkscreen", monospace'; ctx.fillStyle = '#f3e3d2';
    var title = result.perfect ? 'PERFECT POT' : (result.clean ? 'FRESH POT' : 'DRINKABLE');
    ctx.fillText(title, 0, 8);
    ctx.font = '11px "Silkscreen", monospace'; ctx.fillStyle = result.clean ? '#8fe09a' : '#cdb59c';
    ctx.fillText('chaos −' + result.drop + '%', 0, 32);
    ctx.restore();
  }

  function loop(now){
    if(!playing) return;
    var dt = (now - lastT) / 1000; lastT = now;
    if(dt > 0.05) dt = 0.05;
    update(dt); draw();
    rafId = requestAnimationFrame(loop);
  }

  // ---------------------------------------------------------------- flow
  function open(){
    if(!available()){
      if(gameRunning() && usedToday() >= MAX_PER_DAY){
        if(G.dock) G.dock.infoToast('COFFEE ☕', 'That’s enough caffeine for one day. The briefs are waiting.', '');
      }
      return;
    }
    if(modalOpen()) return;

    playing = true; closing = false; phase = 'setup';
    scoops = 0; water = 0; pouring = false; spilled = false;
    sw = false; carafe = 0; dripT = 0; dripDur = 0; drops = [];
    gGlow = wGlow = swGlow = fullFlash = 0;
    result = null; resultT = 0; spark = []; steam = []; animT = 0; dropAcc = 0;

    // randomize the dose band (3 acceptable scoop counts) + the water band
    gLo = 2 + Math.floor(Math.random() * 2);     // 2 or 3
    gHi = gLo + 2;                               // band width = 3 counts (clear centre)
    var wlo = 0.45 + Math.random() * 0.28;        // water band start
    wLo = wlo; wHi = Math.min(0.92, wlo + 0.18);

    try { if(G.audio && G.audio.click) G.audio.click(); } catch(e){}

    G.__propBusy = 'coffee';
    if(G.modals && G.modals.acquirePause){ G.modals.acquirePause(); paused = true; }

    injectCSS();
    buildOverlay();
    lastT = performance.now();
    rafId = requestAnimationFrame(loop);
  }

  function close(consumed){
    if(closing) return;
    closing = true; playing = false;
    if(rafId){ cancelAnimationFrame(rafId); rafId = null; }
    removeListeners();
    if(overlayEl){
      var el = overlayEl; overlayEl = null;
      el.classList.remove('in');
      setTimeout(function(){ if(el && el.parentNode) el.remove(); }, 320);
    }
    canvasEl = null; ctx = null; pouring = false; spark = []; steam = []; drops = [];
    if(paused && G.modals && G.modals.releasePause){ G.modals.releasePause(); }
    paused = false;
    if(G.__propBusy === 'coffee') G.__propBusy = null;
    if(consumed){ syncDay(); if(G.state) G.state._cofCount = (G.state._cofCount || 0) + 1; }
  }

  function finish(){
    if(closing) return;
    var r = result || { stars: 1, drop: CHAOS_OK, perfect: false, clean: false };
    try { if(G.chaos && G.chaos.add) G.chaos.add(-r.drop); } catch(e){}

    // perk the whole floor up: better pot = bigger boost. Don't let a worse pot
    // stomp a still-active stronger buff — keep the better of the two.
    var mult = BUFF_MULT[r.stars] || 1.08;
    var pct = Math.round((mult - 1) * 100);
    if(G.state){
      var active = (G.state.coffeeBuffLeft || 0) > 0;
      G.state.coffeeBuffMult = active ? Math.max(G.state.coffeeBuffMult || 1, mult) : mult;
      G.state.coffeeBuffLeft = BUFF_SECONDS;
      pct = Math.round(((G.state.coffeeBuffMult) - 1) * 100);   // reflect the buff that actually stuck
    }

    if(G.dock){
      if(r.perfect) G.dock.infoToast('PERFECT POT ☕★★★', 'Dialled in dead-on. The whole floor works +' + pct + '% faster for a minute — chaos −' + r.drop + '%.', 'good');
      else if(r.clean) G.dock.infoToast('FRESH POT ☕★★', 'A proper brew. The floor works +' + pct + '% faster for a minute — chaos −' + r.drop + '%.', 'good');
      else G.dock.infoToast('COFFEE ☕★', 'Drinkable. Barely. Still, +' + pct + '% faster for a minute — chaos −' + r.drop + '%.', '');
    }
    close(true);
  }

  function quit(){ if(closing) return; close(false); }

  // ---------------------------------------------------------------- boot
  function boot(){ injectCSS(); }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  // entry interface — the office coffee machine calls open(); available() gates it.
  G.coffee = { open: open, available: available };

  // dev-only inspection hook (lets the Playwright harness read live state).
  G.__coffeeDebug = {
    state: function(){
      return { phase: phase, scoops: scoops, doseBand: [gLo, gHi], water: water, waterBand: [wLo, wHi],
        spilled: spilled, sw: sw, carafe: carafe, result: result, propBusy: G.__propBusy };
    },
    // pin a perfect setup for deterministic tests
    perfectSetup: function(){ scoops = Math.round((gLo+gHi)/2); water = (wLo+wHi)/2; spilled = false; },
    pour: function(on){ pouring = !!on; },
    flip: function(){ flipSwitch(); }
  };
})();

// ---------------------------------------------------------------------------
// COFFEE BUFF HUD CHIP — passive indicator of the active "+X% faster" boost,
// with a live countdown. Self-contained; mirrors the manager-chip wiring.
// ---------------------------------------------------------------------------
(function(){
  'use strict';
  if(!window.G) return;
  var G = window.G;
  var chip = null;

  function injectStyle(){
    if(document.getElementById('cbuff-style')) return;
    var st = document.createElement('style');
    st.id = 'cbuff-style';
    st.textContent = [
      '#cbuff-chip{display:none;align-items:center;gap:5px;border:none;font-family:inherit;cursor:default;}',
      '#cbuff-chip.cbuff-show{display:inline-flex;}',
      '#cbuff-chip .chip-val{color:var(--brass,#ffe066);}'
    ].join('');
    document.head.appendChild(st);
  }

  function ensureChip(){
    if(chip) return chip;
    var hud = document.getElementById('hud');
    if(!hud) return null;
    injectStyle();
    chip = document.createElement('span');
    chip.id = 'cbuff-chip';
    chip.className = 'chip';
    chip.innerHTML = '<span class="chip-val" id="cbuff-val"></span>';
    chip.title = 'Fresh coffee — the whole floor is working faster';
    hud.appendChild(chip);
    return chip;
  }

  function paint(){
    var c = ensureChip(); var s = G.state;
    if(!c) return;
    var left = (s && s.coffeeBuffLeft) || 0;
    if(left <= 0 || !s.running || s.gameOver){ c.classList.remove('cbuff-show'); return; }
    c.classList.add('cbuff-show');
    var pct = Math.round(((s.coffeeBuffMult || 1) - 1) * 100);
    var sec = Math.ceil(left);
    var m = Math.floor(sec / 60), ss = sec % 60;
    c.querySelector('#cbuff-val').textContent = '☕ +' + pct + '% · ' + m + ':' + (ss < 10 ? '0' : '') + ss;
  }

  function wrapHud(){
    if(!G.hud || G.hud._cbuffWrapped) return;
    var orig = G.hud.update;
    G.hud.update = function(rdt){
      if(typeof orig === 'function') orig.call(G.hud, rdt);
      paint();
    };
    G.hud._cbuffWrapped = true;
  }

  function boot(){ ensureChip(); wrapHud(); paint(); }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
