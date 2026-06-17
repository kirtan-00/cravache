// CravAche TRIAL module: trial_lifelines
// ---------------------------------------------------------------------------
// Turns the three "you're done" moments into CHOICES instead of hard losses.
// Each one PAUSES the game, leads with a way to KEEP PLAYING, and always offers
// an appealing RETIRE ending (a calm beach send-off).
//
//   1) CHAOS hits 100  -> "CHAOS! You've failed as Client Servicing. Now what?"
//        • [first] "I haven't gotten rid of the itch" -> resume, chaos RESET to 0
//        • "Retire" -> beach ending
//
//   2) REP hits 0      -> "Your reputation is ZERO."
//        • [first] "Rebrand & start again" -> costs 70% of CASH, reputation
//          comes back (reset), the agency gets a fresh name, resume
//        • "Retire" -> beach ending
//
//   3) MONEY hits 0    -> "You're out of money."
//        • [first] "Seek an investor (+Rs 1,00,000)" -> ONCE per run
//        • "Keep grinding" -> resume (suppressed until cash recovers)
//        • "Retire" -> beach ending
//
// Pure runtime monkey-patch on window.G, all guarded. Loaded by index.html +
// trial.html AFTER the systems + main, so it can wrap loseGame and watch state.
// ---------------------------------------------------------------------------
(function(){
  "use strict";
  if(!window.G) return;
  var G = window.G;

  var COL = { navy:'#10131f', cream:'#f4e8cf', teal:'#9fe8ff', gold:'#ffe066',
              red:'#ff5c5c', green:'#7ee08a', dim:'#8a93a8' };

  var run = { busy:false, raf:0, investorUsed:false, moneySuppressed:false };

  var AGENCY_NAMES = ['CravAche 2.0','Phoenix Creatives','Second Wind Studio',
    'Comeback Collective','Fresh Slate Agency','Round Two Creative','Naya Studio'];

  // ---------------------------------------------------------------- styles
  function injectStyle(){
    if(document.getElementById('ll-style')) return;
    var css = [
      // matches the game's own modal chrome (navy + brass border + Silkscreen +
      // chunky px-buttons) via the shared CSS variables, so it reads as native.
      '#ll-overlay{position:absolute;inset:0;z-index:120;display:flex;align-items:center;',
        'justify-content:center;background:rgba(6,8,15,.82);font-family:"VT323",monospace;}',
      '#ll-overlay .ll-card{width:520px;max-width:92%;background:var(--navy);border:3px solid var(--brass);',
        'box-shadow:inset 0 3px 0 rgba(159,232,255,.15),inset 0 -3px 0 rgba(0,0,0,.5),2px 2px 0 #000;',
        'padding:18px 20px 16px;text-align:center;animation:modalin .12s steps(3);}',
      '#ll-overlay .ll-kick{font-family:"Silkscreen",monospace;font-size:10px;color:var(--red);margin-bottom:6px;letter-spacing:.5px;}',
      '#ll-overlay .ll-title{font-family:"Silkscreen",monospace;font-size:20px;color:var(--brass);line-height:1.1;margin-bottom:10px;}',
      '#ll-overlay .ll-sub{font-size:21px;line-height:1.12;color:var(--paper);margin-bottom:14px;}',
      '#ll-overlay .ll-btns{display:flex;flex-direction:column;gap:10px;}',
      '#ll-overlay .ll-btn{font-family:"Silkscreen",monospace;font-size:13px;line-height:1.2;color:var(--ink);',
        'background:var(--brass);border:3px solid var(--ink);padding:11px 14px;cursor:pointer;text-transform:uppercase;',
        'letter-spacing:.5px;box-shadow:inset 0 3px 0 rgba(255,255,255,.45),inset 0 -3px 0 rgba(0,0,0,.3),2px 2px 0 #000;}',
      '#ll-overlay .ll-btn:hover{background:#fff0a0;}',
      '#ll-overlay .ll-btn:active{transform:translate(2px,2px);}',
      '#ll-overlay .ll-btn small{display:block;font-family:"VT323",monospace;font-size:15px;text-transform:none;letter-spacing:0;color:var(--ink);opacity:.75;margin-top:3px;}',
      '#ll-overlay .ll-btn.ghost,#ll-overlay .ll-btn.retire{background:var(--khaki-l);color:var(--paper);}',
      '#ll-overlay .ll-btn.ghost small,#ll-overlay .ll-btn.retire small{color:var(--paper);}',
      '#ll-overlay .ll-btn:disabled{opacity:.45;cursor:not-allowed;}',
      // ---- beach retirement scene ----
      '#ll-beach{position:absolute;inset:0;z-index:130;overflow:hidden;',
        'background:linear-gradient(#fde6c9 0%,#ffd9a0 14%,#ffc27a 26%,#7fd8e8 40%,#49bcd6 60%,#2f9fc4 100%);}',
      // optional real beach loop: drop a clip you have rights to at art/beach.mp4.
      // it covers the animated fallback only once it actually loads.
      '#ll-beach video.bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;display:none;}',
      '#ll-beach.has-video video.bg{display:block;}',
      '#ll-beach.has-video .sun,#ll-beach.has-video .sand,#ll-beach.has-video .wave,#ll-beach.has-video .palm,#ll-beach.has-video .chair{display:none;}',
      // optional real beach still: drop a photo you have rights to at art/beach-bg.jpg.
      // it covers the animated fallback only once it actually loads.
      '#ll-beach img.bg2{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;display:none;}',
      '#ll-beach.has-bgimg img.bg2{display:block;}',
      '#ll-beach.has-bgimg .sun,#ll-beach.has-bgimg .sand,#ll-beach.has-bgimg .wave,#ll-beach.has-bgimg .palm,#ll-beach.has-bgimg .chair{display:none;}',
      // interactive sandbox canvas: above bg/waves, below the farewell text + button.
      '#ll-beach canvas.play{position:absolute;inset:0;width:100%;height:100%;z-index:2;cursor:crosshair;touch-action:none;}',
      // tiny floating hint that fades after a few seconds.
      '#ll-beach .ll-hint{position:absolute;left:50%;bottom:15%;transform:translateX(-50%);z-index:3;',
        'font-family:"VT323",monospace;font-size:18px;color:#0e2a33;text-shadow:0 1px 0 rgba(255,255,255,.55);',
        'background:rgba(255,255,255,.35);padding:5px 12px;border-radius:14px;white-space:nowrap;',
        'opacity:0;transition:opacity 1.2s ease;pointer-events:none;}',
      '#ll-beach .ll-hint.show{opacity:1;}',
      '#ll-beach .sun{position:absolute;top:11%;left:50%;transform:translateX(-50%);width:120px;height:120px;',
        'border-radius:50%;background:radial-gradient(circle,#fff6d8 0%,#ffe48a 55%,rgba(255,228,138,0) 72%);}',
      '#ll-beach .sand{position:absolute;left:0;right:0;bottom:0;height:26%;',
        'background:linear-gradient(#f6dd9e,#e9c878);}',
      '#ll-beach .wave{position:absolute;left:-10%;right:-10%;height:26px;border-radius:50%;',
        'background:rgba(255,255,255,.55);}',
      '#ll-beach .w1{bottom:25%;animation:llw 4.5s ease-in-out infinite;}',
      '#ll-beach .w2{bottom:28%;height:18px;opacity:.7;animation:llw 6s ease-in-out infinite reverse;}',
      '#ll-beach .w3{bottom:31%;height:14px;opacity:.5;animation:llw 7.5s ease-in-out infinite;}',
      '@keyframes llw{0%,100%{transform:translateX(-12px) scaleY(1);}50%{transform:translateX(12px) scaleY(.7);}}',
      '#ll-beach .palm{position:absolute;bottom:24%;font-size:84px;filter:drop-shadow(2px 4px 0 rgba(0,0,0,.15));}',
      '#ll-beach .palm.l{left:7%;}#ll-beach .palm.r{right:7%;transform:scaleX(-1);}',
      '#ll-beach .chair{position:absolute;bottom:18%;left:50%;transform:translateX(-50%);font-size:64px;}',
      '#ll-beach .ll-line{position:absolute;left:0;right:0;top:34%;text-align:center;z-index:3;',
        'font-family:"Silkscreen",monospace;font-size:30px;color:#0e2a33;',
        'text-shadow:0 2px 0 rgba(255,255,255,.5);opacity:0;transition:opacity 1s ease;padding:0 24px;}',
      '#ll-beach .ll-line.show{opacity:1;}',
      '#ll-beach .ll-again{position:absolute;left:50%;bottom:7%;transform:translateX(-50%);opacity:0;z-index:3;',
        'transition:opacity 1s ease;font-family:"Silkscreen",monospace;font-size:13px;cursor:pointer;',
        'background:'+COL.gold+';color:'+COL.navy+';border:none;border-radius:8px;padding:13px 22px;}',
      '#ll-beach .ll-again.show{opacity:1;}'
    ].join('');
    var st = document.createElement('style');
    st.id = 'll-style'; st.textContent = css;
    document.head.appendChild(st);
  }

  function stage(){ return document.getElementById('stage') || document.body; }
  function fmt(n){ return (G.fmtMoney ? G.fmtMoney(n) : ('Rs ' + Math.round(n))); }

  function closeOverlay(){
    var o = document.getElementById('ll-overlay');
    if(o && o.parentNode) o.parentNode.removeChild(o);
  }

  // generic crisis card: cfg = { kicker, title, sub, options:[{label, note, cls, onPick}] }
  function showCrisis(cfg){
    injectStyle();
    if(document.getElementById('ll-overlay')) return;
    run.busy = true;
    if(G.state) G.state.paused = true;        // freeze the sim while deciding
    try{ if(G.audio && G.audio.alarm) G.audio.alarm(); }catch(e){}

    var ov = document.createElement('div');
    ov.id = 'll-overlay';
    var card = document.createElement('div');
    card.className = 'll-card';
    card.innerHTML =
      '<div class="ll-kick">' + (cfg.kicker || '') + '</div>' +
      '<div class="ll-title">' + cfg.title + '</div>' +
      (cfg.sub ? '<div class="ll-sub">' + cfg.sub + '</div>' : '');
    var btns = document.createElement('div');
    btns.className = 'll-btns';
    (cfg.options || []).forEach(function(opt){
      var b = document.createElement('button');
      b.className = 'll-btn ' + (opt.cls || '');
      b.innerHTML = opt.label + (opt.note ? '<small>' + opt.note + '</small>' : '');
      if(opt.disabled){ b.disabled = true; }
      else b.addEventListener('click', function(){
        closeOverlay();
        try{ opt.onPick && opt.onPick(); }catch(e){ try{ console.error('[lifelines]', e); }catch(_){} }
      });
      btns.appendChild(b);
    });
    card.appendChild(btns);
    ov.appendChild(card);
    stage().appendChild(ov);
  }

  // resume the run after a recovery choice
  function resume(){
    run.busy = false;
    if(G.state) G.state.paused = false;
  }

  // ------------------------------------------------------------ the beach
  function retire(){
    run.busy = true;
    closeOverlay();
    injectStyle();
    if(G.state){ G.state.gameOver = { type:'retired' }; G.state.running = false; }
    try{ if(G.audio && G.audio.win) G.audio.win(); }catch(e){}

    var beach = document.createElement('div');
    beach.id = 'll-beach';
    beach.innerHTML =
      '<video class="bg" autoplay muted loop playsinline preload="auto" src="art/beach.mp4"></video>' +
      '<img class="bg2" alt="" src="art/beach-bg.jpg">' +
      '<div class="sun"></div>' +
      '<div class="sand"></div>' +
      '<div class="wave w3"></div><div class="wave w2"></div><div class="wave w1"></div>' +
      '<div class="palm l">🌴</div><div class="palm r">🌴</div>' +
      '<div class="chair">⛱️</div>' +
      '<canvas class="play"></canvas>' +
      '<div class="ll-hint">tap the sand to build · tap the sea for ripples</div>' +
      '<div class="ll-line"></div>' +
      '<button class="ll-again">PUNCH IN AGAIN</button>';
    stage().appendChild(beach);
    // if a real beach loop exists at art/beach.mp4, show it (covers the animated
    // fallback) and keep it looping; otherwise the CSS beach stays.
    var vid = beach.querySelector('video.bg');
    if(vid){
      vid.addEventListener('loadeddata', function(){ beach.classList.add('has-video'); });
      vid.addEventListener('error', function(){ /* no file -> keep animated beach */ });
      try{ var pr = vid.play(); if(pr && pr.catch) pr.catch(function(){}); }catch(e){}
    }
    // if a real beach photo exists at art/beach-bg.jpg, show it as a full-cover
    // backdrop (covers the gradient fallback) once it loads; missing -> keep CSS.
    var bgimg = beach.querySelector('img.bg2');
    if(bgimg){
      bgimg.addEventListener('load', function(){ beach.classList.add('has-bgimg'); });
      bgimg.addEventListener('error', function(){ /* no file -> keep animated beach */ });
    }

    // --------------------------------------------------- interactive sandbox
    // One rAF loop drives gentle waves, ripples, drifting clouds/gull, and the
    // sandcastles the player taps into being. No score, no fail state — relax.
    startSandbox(beach);

    var lineEl = beach.querySelector('.ll-line');
    var againEl = beach.querySelector('.ll-again');
    var LINES = [
      "You've dodged too many bullets.",
      "And taken far too few.",
      "Go call a friend.",
      "Touch some grass.",
      "Thank you for playing."
    ];
    var i = -1;
    function next(){
      i++;
      if(i >= LINES.length) return;
      lineEl.textContent = LINES[i];
      lineEl.classList.add('show');
      var isLast = (i === LINES.length - 1);
      setTimeout(function(){
        if(isLast){ againEl.classList.add('show'); return; }  // keep the last line up + reveal the button
        lineEl.classList.remove('show');
        setTimeout(next, 900);     // gap between lines
      }, isLast ? 2200 : 2300);
    }
    setTimeout(next, 700);

    // float the hint in, then fade it after a few calm seconds.
    var hintEl = beach.querySelector('.ll-hint');
    if(hintEl){
      setTimeout(function(){ hintEl.classList.add('show'); }, 1200);
      setTimeout(function(){ hintEl.classList.remove('show'); }, 6500);
    }

    againEl.addEventListener('click', function(){
      try{ stopSandbox(); }catch(e){}
      try{ window.location.reload(); }catch(e){}
    });
  }

  // ----------------------------------------------------- the sandbox engine
  // state lives on the closure so retire()/stopSandbox() can reach the loop.
  var sandbox = { raf:0, canvas:null };

  function stopSandbox(){
    if(sandbox.raf){ cancelAnimationFrame(sandbox.raf); sandbox.raf = 0; }
    sandbox.canvas = null;
  }

  function startSandbox(beach){
    stopSandbox();   // never run two loops
    var canvas = beach.querySelector('canvas.play');
    if(!canvas) return;
    sandbox.canvas = canvas;
    var ctx = canvas.getContext('2d');
    if(!ctx) return;

    var W = 0, H = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
    function resize(){
      var r = beach.getBoundingClientRect();
      W = Math.max(1, Math.round(r.width));
      H = Math.max(1, Math.round(r.height));
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);

    // the wet-sand / waterline sits where the CSS sand begins (~74% down).
    function waterline(){ return H * 0.74; }

    var castles = [];   // { x, base, taps }
    var ripples = [];   // { x, y, r, max, a }
    var wetbands = [];  // { x, y, w, a }  darker wet-sand left by a wave wash
    var clouds = [
      { x: 0.15, y: 0.12, s: 1.0, spd: 0.0009 },
      { x: 0.62, y: 0.08, s: 0.7, spd: 0.0006 }
    ];
    var gull = { x: -0.2, y: 0.18, spd: 0.00018, glyph: '🐦', wait: 4000 };

    function addCastleAt(x){
      // grow the nearest existing castle if the tap is close, else start one.
      var near = null, best = 60;
      for(var k=0;k<castles.length;k++){
        var d = Math.abs(castles[k].x - x);
        if(d < best){ best = d; near = castles[k]; }
      }
      if(near){ near.taps++; }
      else castles.push({ x: x, base: waterline() + (H - waterline()) * 0.35, taps: 1 });
    }

    function addRipple(x, y){
      ripples.push({ x:x, y:y, r:4, max: 60 + Math.random()*40, a: 0.55 });
    }

    function pointFromEvent(e){
      var r = canvas.getBoundingClientRect();
      var cx = (e.touches && e.touches[0]) ? e.touches[0].clientX : e.clientX;
      var cy = (e.touches && e.touches[0]) ? e.touches[0].clientY : e.clientY;
      return { x: cx - r.left, y: cy - r.top };
    }

    function onTap(e){
      if(e.cancelable) e.preventDefault();
      var p = pointFromEvent(e);
      if(p.y >= waterline()){
        addCastleAt(p.x);                 // tapped the sand -> build
      } else {
        addRipple(p.x, p.y);              // tapped the sea -> ripple
        // a wave-style wash can leave a faint wet band near the waterline
        wetbands.push({ x:p.x, y: waterline()+6, w: 40+Math.random()*30, a:0.28 });
      }
    }
    canvas.addEventListener('pointerdown', onTap);
    // fallback for browsers without pointer events
    if(!('onpointerdown' in canvas)){
      canvas.addEventListener('mousedown', onTap);
      canvas.addEventListener('touchstart', onTap, { passive:false });
    }

    // -------- drawing helpers --------
    function drawCastle(c){
      var cx = c.x, baseY = c.base;
      var taps = c.taps;
      // mound first
      var moundW = 46, moundH = 16;
      ctx.fillStyle = '#d9b463';
      ctx.beginPath();
      ctx.ellipse(cx, baseY + moundH*0.4, moundW, moundH, 0, 0, Math.PI*2);
      ctx.fill();
      // body grows with taps (capped)
      var lvl = Math.min(taps, 6);
      var bodyH = 8 + lvl * 9;
      var bodyW = 34;
      ctx.fillStyle = '#e9c878';
      ctx.fillRect(cx - bodyW/2, baseY - bodyH, bodyW, bodyH);
      // sunlit highlight
      ctx.fillStyle = '#f6dd9e';
      ctx.fillRect(cx - bodyW/2, baseY - bodyH, bodyW*0.45, bodyH);
      // shadow side
      ctx.fillStyle = 'rgba(120,86,30,.28)';
      ctx.fillRect(cx + bodyW/2 - 5, baseY - bodyH, 5, bodyH);
      if(taps >= 2){
        // two towers
        var tw = 11, th = 10 + Math.min(taps,5)*5;
        [[-bodyW/2 - 2, '#e9c878'], [bodyW/2 - tw + 2, '#e0bd6c']].forEach(function(t){
          ctx.fillStyle = t[1];
          ctx.fillRect(cx + t[0], baseY - bodyH - th, tw, th);
          // battlements
          ctx.fillStyle = t[1];
          ctx.fillRect(cx + t[0], baseY - bodyH - th - 4, 4, 4);
          ctx.fillRect(cx + t[0] + tw - 4, baseY - bodyH - th - 4, 4, 4);
        });
      }
      if(taps >= 3){
        // doorway
        ctx.fillStyle = 'rgba(120,86,30,.45)';
        ctx.fillRect(cx - 4, baseY - 11, 8, 11);
      }
      if(taps >= 4){
        // a little flag on top
        var fy = baseY - bodyH - (10 + Math.min(taps,5)*5) - 4;
        ctx.save();
        ctx.font = '18px serif';
        ctx.textAlign = 'center';
        ctx.fillText('🚩', cx, fy);
        ctx.restore();
      }
    }

    var t0 = performance.now();
    function frame(now){
      sandbox.raf = requestAnimationFrame(frame);
      var t = (now - t0);
      ctx.clearRect(0, 0, W, H);

      var wl = waterline();

      // ---- gentle calming waves rolling up the wet sand ----
      // keep them subtle when a realistic bg (video/photo) is showing.
      var realistic = beach.classList.contains('has-video') || beach.classList.contains('has-bgimg');
      var waveAlpha = realistic ? 0.18 : 0.5;
      for(var wv=0; wv<3; wv++){
        var phase = t * (0.0006 + wv*0.0002);
        var amp = 6 + wv*3;
        var baseY = wl - 10 + wv*8 + Math.sin(t*0.0005 + wv)*6;   // slow roll up/down
        ctx.beginPath();
        ctx.moveTo(0, baseY);
        for(var x=0; x<=W; x+=12){
          var y = baseY + Math.sin(x*0.018 + phase + wv)*amp;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
        ctx.fillStyle = 'rgba(' + (realistic ? '210,238,248,' : '255,255,255,') + (waveAlpha - wv*0.08) + ')';
        ctx.fill();
      }

      // ---- wet-sand bands fading ----
      for(var b=wetbands.length-1; b>=0; b--){
        var wb = wetbands[b];
        ctx.fillStyle = 'rgba(150,110,50,' + wb.a + ')';
        ctx.beginPath();
        ctx.ellipse(wb.x, wb.y, wb.w, 8, 0, 0, Math.PI*2);
        ctx.fill();
        wb.a -= 0.0016;
        if(wb.a <= 0) wetbands.splice(b,1);
      }

      // ---- castles (drawn over the wet sand) ----
      for(var ci=0; ci<castles.length; ci++) drawCastle(castles[ci]);

      // ---- ripple rings on the water ----
      for(var ri=ripples.length-1; ri>=0; ri--){
        var rp = ripples[ri];
        ctx.strokeStyle = 'rgba(255,255,255,' + rp.a + ')';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(rp.x, rp.y, rp.r, rp.r*0.42, 0, 0, Math.PI*2);
        ctx.stroke();
        rp.r += 0.7;
        rp.a -= 0.006;
        if(rp.a <= 0 || rp.r > rp.max) ripples.splice(ri,1);
      }

      // ---- softly drifting clouds (only meaningful on the CSS beach) ----
      if(!realistic){
        for(var cl=0; cl<clouds.length; cl++){
          var c = clouds[cl];
          c.x += c.spd * 0.016;
          if(c.x > 1.25) c.x = -0.25;
          var px = c.x * W, py = c.y * H, s = c.s;
          ctx.fillStyle = 'rgba(255,255,255,.7)';
          ctx.beginPath();
          ctx.ellipse(px, py, 38*s, 16*s, 0, 0, Math.PI*2);
          ctx.ellipse(px+30*s, py+4*s, 26*s, 13*s, 0, 0, Math.PI*2);
          ctx.ellipse(px-28*s, py+5*s, 22*s, 12*s, 0, 0, Math.PI*2);
          ctx.fill();
        }
      }

      // ---- occasional seagull drifting across ----
      gull.x += gull.spd * 0.016;
      if(gull.x > 1.3){ gull.x = -0.25; gull.y = 0.08 + Math.random()*0.16; }
      var gx = gull.x * W, gy = gull.y * H + Math.sin(t*0.001)*6;
      ctx.save();
      ctx.font = '22px serif';
      ctx.textAlign = 'center';
      ctx.fillText(gull.glyph, gx, gy);
      ctx.restore();

      sandbox.canvas = canvas;   // keep alive reference
    }
    sandbox.raf = requestAnimationFrame(frame);
  }

  // ----------------------------------------------------------- the three
  function chaosCrisis(){
    if(run.busy) return;
    var cash = (G.state && G.state.money) || 0;
    var cost = Math.max(0, Math.round(cash * 0.70));   // restructuring costs 70% of current cash
    showCrisis({
      kicker: 'THE ROOM IS ON FIRE',
      title: 'CHAOS! You failed as Client Servicing.',
      sub: 'Now what?',
      options: [
        { label: "I HAVEN'T GOTTEN RID OF THE ITCH",
          note: 'restructure — chaos wiped clean · costs ' + fmt(cost) + ' (70% of cash)',
          cls: '',
          onPick: function(){
            if(G.state){
              if(G.economy && G.economy.spend) G.economy.spend(cost); else G.state.money -= cost;
              G.state.chaos = 0;
              if(G.hud){ G.hud.poke('chaos'); G.hud.poke('money'); }
              try{ if(G.dock && G.dock.infoToast) G.dock.infoToast('RESTRUCTURED',
                'Paid ' + fmt(cost) + ' to put the fire out. Chaos cleared.', 'good'); }catch(e){}
            }
            resume();
          } },
        { label: 'RETIRE', note: 'walk into the sunset', cls: 'retire', onPick: retire }
      ]
    });
  }

  function repCrisis(){
    if(run.busy) return;
    var cash = (G.state && G.state.money) || 0;
    var cost = Math.max(0, Math.round(cash * 0.70));
    showCrisis({
      kicker: 'NOBODY IS RETURNING YOUR CALLS',
      title: 'Your reputation is ZERO.',
      sub: 'Burn the logo, change the name, walk back in like it never happened?',
      options: [
        { label: 'REBRAND & START AGAIN',
          note: 'costs ' + fmt(cost) + ' (70% of cash) · reputation comes back',
          cls: '',
          onPick: function(){
            if(G.state){
              if(G.economy && G.economy.spend) G.economy.spend(cost); else G.state.money -= cost;
              G.state.rep = (G.BAL && G.BAL.START_REP) || 50;
              G.state._agencyName = AGENCY_NAMES[Math.floor((G.state.followers || 0) % AGENCY_NAMES.length)];
              if(G.hud){ G.hud.poke('rep'); G.hud.poke('money'); }
              try{ if(G.dock && G.dock.infoToast) G.dock.infoToast('REBRANDED · ' + G.state._agencyName,
                'Fresh name, fresh reputation. The clients have short memories.', 'good'); }catch(e){}
            }
            resume();
          } },
        { label: 'RETIRE', note: 'take the hint, hit the beach', cls: 'retire', onPick: retire }
      ]
    });
  }

  function moneyCrisis(){
    if(run.busy) return;
    var canInvest = !run.investorUsed;
    showCrisis({
      kicker: 'THE ACCOUNT IS EMPTY',
      title: "You're out of money.",
      sub: canInvest ? 'An investor left a voicemail. Risky, but cash is cash.'
                     : 'The investor stopped picking up. It is just you now.',
      options: [
        { label: canInvest ? 'SEEK AN INVESTOR' : 'INVESTOR UNAVAILABLE',
          note: canInvest ? '+' + fmt(100000) + ' · one time only' : 'already cashed in this run',
          cls: '', disabled: !canInvest,
          onPick: function(){
            run.investorUsed = true;
            if(G.state){ if(G.economy && G.economy.earn) G.economy.earn(100000); else G.state.money += 100000;
              if(G.hud) G.hud.poke('money');
              try{ if(G.dock && G.dock.infoToast) G.dock.infoToast('INVESTOR ON BOARD',
                fmt(100000) + ' wired. They said "last time" and meant it.', 'good'); }catch(e){} }
            resume();
          } },
        { label: 'KEEP GRINDING', note: 'no bailout — claw your way back',
          cls: 'ghost',
          onPick: function(){ run.moneySuppressed = true; resume(); } },
        { label: 'RETIRE', note: 'cut your losses, hit the beach', cls: 'retire', onPick: retire }
      ]
    });
  }

  // ----------------------------------------------------------- the watcher
  function tick(){
    run.raf = requestAnimationFrame(tick);
    var s = G.state;
    if(!s || !s.running || s.gameOver || s.paused || s.restructure || run.busy) return;
    // don't stack on top of a hard modal (verdict/report/etc.)
    var root = document.getElementById('modal-root');
    if(root && !root.classList.contains('hidden')) return;

    if(s.rep <= 0){ repCrisis(); return; }
    if(s.money > 0) run.moneySuppressed = false;     // recovered → re-arm
    if(s.money <= 0 && !run.moneySuppressed){ moneyCrisis(); return; }
  }

  function startWatch(){
    run.busy = false; run.investorUsed = false; run.moneySuppressed = false;
    closeOverlay();
    try{ stopSandbox(); }catch(e){}
    var b = document.getElementById('ll-beach'); if(b && b.parentNode) b.parentNode.removeChild(b);
    if(run.raf) cancelAnimationFrame(run.raf);
    run.raf = requestAnimationFrame(tick);
  }

  // CHAOS: intercept the hard loss and turn it into the chaos choice instead.
  function wireLoseGame(){
    if(!G.main || typeof G.main.loseGame !== 'function') return false;
    var _lose = G.main.loseGame;
    G.main.loseGame = function(type){
      if(type === 'chaos' && G.state && !G.state.gameOver){
        chaosCrisis();           // pause + choices, NOT a hard game-over
        return;
      }
      return _lose.call(this, type);
    };
    return true;
  }

  function wireStart(){
    if(!G.main || typeof G.main.start !== 'function') return false;
    var _start = G.main.start;
    G.main.start = function(){
      _start.call(this);
      try{ startWatch(); }catch(e){}
    };
    return true;
  }

  // self-start the watcher loop so the crises fire even when a saved shift is
  // CONTINUED (that path sets G.state directly and never calls G.main.start, so
  // we can't rely on the start hook alone). tick() guards on running/paused.
  function kickoff(){ if(!run.raf){ run.raf = requestAnimationFrame(tick); } }

  function wireAll(){ wireLoseGame(); wireStart(); kickoff(); }
  if(G.main){ wireAll(); }
  else if(document.readyState === 'loading'){ document.addEventListener('DOMContentLoaded', wireAll); }
  else { wireAll(); }

  G.lifelines = {
    chaos: chaosCrisis, rep: repCrisis, money: moneyCrisis, retire: retire,
    _run: run
  };
  console.log('[trial_lifelines] active — chaos/rep/money each offer a recovery + a beach retirement.');
})();
