// CravAche — canvas office scene: bg, desks, chars, deadline timers, progress,
// burnout, speech bubbles, quotes wall, props, fire overlay. All sprites go
// through G.data.sprite(key) which returns real art OR colored-rect+emoji
// fallback (parallel build contract).
(function(){
  'use strict';
  window.G = window.G || {};
  G.render = G.render || {};

  // desk slots (centers) grouped in department clusters. Hitboxes derived.
  // Back row ends before the doors (x>860); production = front-right strip.
  var DESKS = [
    // DESIGN (5)
    { x: 80,  y: 335, dept: 'designer' },
    { x: 200, y: 335, dept: 'designer' },
    { x: 320, y: 335, dept: 'designer' },
    { x: 80,  y: 520, dept: 'designer' },
    { x: 200, y: 520, dept: 'designer' },
    // EDIT (5)
    { x: 440, y: 335, dept: 'editor' },
    { x: 560, y: 335, dept: 'editor' },
    { x: 680, y: 335, dept: 'editor' },
    { x: 380, y: 520, dept: 'editor' },
    { x: 500, y: 520, dept: 'editor' },
    // CONTENT (3)
    { x: 800, y: 335, dept: 'content' },
    { x: 660, y: 520, dept: 'content' },
    { x: 780, y: 520, dept: 'content' },
    // PRODUCTION (4) — front-right studio strip
    { x: 940,  y: 520, dept: 'production' },
    { x: 1060, y: 520, dept: 'production' },
    { x: 1180, y: 520, dept: 'production' },
    { x: 1120, y: 400, dept: 'production' }
  ];
  var DESK_W = 104, DESK_H = 64;        // drawn size
  var CHAR_W = 48, CHAR_H = 72;

  var CLUSTERS = [
    { dept: 'designer',   label: 'DESIGN',     x: 200,  y: 222 },
    { dept: 'editor',     label: 'EDIT BAY',   x: 560,  y: 222 },
    { dept: 'content',    label: 'CONTENT',    x: 800,  y: 222 },
    { dept: 'production', label: 'PRODUCTION', x: 1060, y: 418 }
  ];

  var t = 0; // anim clock

  // hotspot flavor rotors (not saved; the city has infinite material)
  var windowIdx = 0, boardIdx = 0, printerIdx = 0;
  var WINDOW_LINES = [
    'SG Highway is jammed. Like your printer.',
    'An auto just overtook a Fortuner. Both honked. Neither moved.',
    'It is 41°C. The client wants "monsoon vibes" by Thursday.',
    'A wedding band is rehearsing somewhere. It is 3 PM on a Tuesday.',
    'The chai tapri downstairs has better client retention than you.',
    'Two pigeons are fighting over samosa. The strong one wins. Nature is an agency.',
    'Somewhere out there, a brand manager is typing "make it pop".',
    'The Sabarmati riverfront looks calm. It has never taken a client call.'
  ];
  var BOARD_LINES = [
    '"HUSTLE IS A MINDSET" (the CEO read this on LinkedIn at 6 AM)',
    '"WE ARE A FAMILY" (families do not have appraisal cycles)',
    '"DO MORE WITH LESS" (the less is you)',
    '"EVERY BRIEF IS AN OPPORTUNITY" (to suffer beautifully)',
    '"CLIENTS FIRST" (sleep last)',
    '"THINK OUTSIDE THE BOX" (the box is your salary band)',
    '"GREAT WORK SPEAKS FOR ITSELF" (it still invoices net-90)'
  ];
  var PRINTER_LINES = [
    'You hit it once, with feeling. It works. You are now IT support.',
    'Paper jam cleared. The printer holds a grudge.',
    'Fixed. It printed someone\'s resume on the way back. Awkward.',
    'Un-jammed. It made the noise anyway, out of spite.'
  ];

  function deskHitbox(i){
    var d = DESKS[i];
    return { x: d.x - 60, y: d.y - 125, w: 120, h: 175 };
  }

  // ---------- sprite helper (THE fallback contract) ----------
  // frame: index into a horizontal sprite sheet (manifest meta.frames > 1)
  function drawSprite(ctx, key, x, y, w, h, frame){
    var sp = G.data.sprite(key);
    if(sp.img){
      ctx.imageSmoothingEnabled = false;
      var frames = sp.meta && sp.meta.frames ? sp.meta.frames : 1;
      if(frames > 1){
        var fw = sp.img.width / frames;
        var f = Math.max(0, Math.min(frames - 1, frame || 0));
        ctx.drawImage(sp.img, f * fw, 0, fw, sp.img.height,
                      Math.round(x), Math.round(y), Math.round(w), Math.round(h));
      } else {
        ctx.drawImage(sp.img, Math.round(x), Math.round(y), Math.round(w), Math.round(h));
      }
      return;
    }
    // colored rect + hard border + emoji glyph
    ctx.fillStyle = sp.color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 3;
    ctx.strokeRect(Math.round(x) + 1.5, Math.round(y) + 1.5, Math.round(w) - 3, Math.round(h) - 3);
    if(sp.emoji){
      ctx.font = Math.round(h * 0.52) + 'px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(sp.emoji, Math.round(x + w / 2), Math.round(y + h / 2 + h * 0.04));
    }
  }
  G.render.drawSprite = drawSprite;

  function pxText(ctx, txt, x, y, size, color, align, silk){
    ctx.font = size + 'px ' + (silk ? "'Silkscreen', monospace" : "'VT323', monospace");
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#000';
    ctx.fillText(txt, x + 2, y + 2);
    ctx.fillStyle = color;
    ctx.fillText(txt, x, y);
  }

  function bar(ctx, x, y, w, h, frac, fg, bg){
    ctx.fillStyle = '#000';
    ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.fillStyle = bg || '#16203a';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = fg;
    ctx.fillRect(x, y, Math.round(w * Math.max(0, Math.min(1, frac))), h);
  }

  // ---------- background (fallback = procedural pixel office) ----------
  function drawBackground(ctx){
    if(G.data.hasArt('office_bg_shoebox')){
      drawSprite(ctx, 'office_bg_shoebox', 0, 0, 1280, 720);
      return;
    }
    // wall
    ctx.fillStyle = '#23304a'; ctx.fillRect(0, 0, 1280, 250);
    ctx.fillStyle = '#1d2940'; ctx.fillRect(0, 230, 1280, 20); // skirting shadow
    // floor: two-tone khaki checker (big chunky tiles)
    for(var ty = 0; ty < 5; ty++){
      for(var tx = 0; tx < 14; tx++){
        ctx.fillStyle = (tx + ty) % 2 ? '#3a3326' : '#473f2f';
        ctx.fillRect(tx * 96, 250 + ty * 96, 96, 96);
      }
    }
    // sunset window: hard color bands
    var wx = 980, wy = 60, ww = 230, wh = 150;
    ctx.fillStyle = '#0d1426'; ctx.fillRect(wx - 8, wy - 8, ww + 16, wh + 16);
    var bands = ['#ffe066', '#ff9a56', '#e87a62', '#d35d6e'];
    for(var b = 0; b < 4; b++){
      ctx.fillStyle = bands[b];
      ctx.fillRect(wx, wy + b * (wh / 4), ww, wh / 4);
    }
    // sun square + frame bars
    ctx.fillStyle = '#fff0a0'; ctx.fillRect(wx + 140, wy + 18, 36, 36);
    ctx.fillStyle = '#16203a';
    ctx.fillRect(wx + ww / 2 - 4, wy, 8, wh);
    ctx.fillRect(wx, wy + wh / 2 - 4, ww, 8);
    // skyline silhouette in lower band
    ctx.fillStyle = '#7a3a4e';
    ctx.fillRect(wx + 10, wy + wh - 38, 28, 38); ctx.fillRect(wx + 50, wy + wh - 56, 22, 56);
    ctx.fillRect(wx + 84, wy + wh - 30, 34, 30); ctx.fillRect(wx + 130, wy + wh - 48, 26, 48);
    ctx.fillRect(wx + 168, wy + wh - 26, 40, 26);
    // agency board on wall
    ctx.fillStyle = '#16203a'; ctx.fillRect(40, 50, 250, 56);
    ctx.strokeStyle = '#ffe066'; ctx.lineWidth = 3; ctx.strokeRect(41.5, 51.5, 247, 53);
    pxText(ctx, 'CRAVACHE', 64, 88, 20, '#ffe066', 'left', true);
    pxText(ctx, 'estd. monday', 196, 86, 16, '#9fe8ff');
  }

  // ---------- quotes wall ----------
  var quoteFrames = []; // computed hitboxes for clicks
  function drawQuotesWall(ctx){
    var quotes = G.state.quotesWall;
    quoteFrames = [];
    var maxFrames = 8;
    var startX = 340, y = 86, fw = 64, fh = 50, gap = 14;
    pxText(ctx, 'WALL OF "JUST ONE SMALL THING"', startX, y - 12, 10, '#9fe8ff', 'left', true);
    for(var i = 0; i < maxFrames; i++){
      var x = startX + i * (fw + gap);
      var has = i < quotes.length;
      ctx.fillStyle = '#16203a'; ctx.fillRect(x - 3, y - 3, fw + 6, fh + 6);
      ctx.fillStyle = has ? '#f4e8cf' : '#2a3654';
      ctx.fillRect(x, y, fw, fh);
      ctx.strokeStyle = has ? '#ffe066' : '#1a2440';
      ctx.lineWidth = 3; ctx.strokeRect(x + 1.5, y + 1.5, fw - 3, fh - 3);
      if(has){
        pxText(ctx, '“ ”', x + fw / 2, y + 32, 22, '#7a4a21', 'center');
        quoteFrames.push({ x: x, y: y, w: fw, h: fh, idx: i });
      }
    }
  }

  // ---------- department clusters + desks + staff ----------
  function drawClusters(ctx){
    for(var c = 0; c < CLUSTERS.length; c++){
      var cl = CLUSTERS[c];
      var unlocked = G.staff.deptUnlocked(cl.dept);
      pxText(ctx, cl.label, cl.x, cl.y, 9,
             unlocked ? 'rgba(159,232,255,0.55)' : 'rgba(255,92,92,0.5)', 'center', true);
      if(!unlocked){
        // tape off the production strip
        var slots = [];
        DESKS.forEach(function(d, i){ if(d.dept === cl.dept) slots.push(d); });
        var minX = 1e9, maxX = 0, minY = 1e9, maxY = 0;
        slots.forEach(function(d){
          minX = Math.min(minX, d.x - 62); maxX = Math.max(maxX, d.x + 62);
          minY = Math.min(minY, d.y - 95); maxY = Math.max(maxY, d.y + 40);
        });
        ctx.strokeStyle = 'rgba(255,224,102,0.5)';
        ctx.lineWidth = 3;
        ctx.setLineDash([14, 8]);
        ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
        ctx.setLineDash([]);
        pxText(ctx, 'OPENS WK ' + G.BAL.PRODUCTION_UNLOCK_WEEK, (minX + maxX) / 2, (minY + maxY) / 2, 14, 'rgba(255,224,102,0.7)', 'center');
      }
    }
  }

  function drawDesks(ctx){
    var s = G.state;
    for(var i = 0; i < DESKS.length; i++){
      var d = DESKS[i];
      if(!G.staff.deptUnlocked(d.dept)) continue; // taped-off zone draws nothing

      var st = G.staff.atDesk(i);
      var hover = G.dock.dragHoverDesk === i;

      // drop highlight (dept-aware: green only if this person can take the brief)
      if(G.dock.dragging){
        var ok = st && !st.briefId && G.staff.canWork(st, G.dock.dragging);
        ctx.fillStyle = hover
          ? (ok ? 'rgba(126,224,138,0.25)' : 'rgba(255,92,92,0.25)')
          : (ok ? 'rgba(159,232,255,0.10)' : 'rgba(0,0,0,0)');
        var hb = deskHitbox(i);
        ctx.fillRect(hb.x, hb.y, hb.w, hb.h);
        if(ok){
          ctx.strokeStyle = hover ? '#7ee08a' : 'rgba(159,232,255,0.5)';
          ctx.lineWidth = 3;
          ctx.strokeRect(hb.x + 1.5, hb.y + 1.5, hb.w - 3, hb.h - 3);
        }
      }

      // at night, off-clock staff are home in bed; their desk sits empty
      var home = st && !G.time.onClock(st);
      // gossiping at the cooler: their desk sits empty, they draw elsewhere
      var away = st && st.away;

      // staffer behind desk (bob + typing frames while working)
      if(st && !home && !away){
        var working = !!st.briefId;
        var bob = working ? Math.round(Math.sin(t * 7 + i) * 2) : 0;
        var frame = working ? Math.floor(t * 5 + i) % 2 : 0;
        drawSprite(ctx, st.portraitKey, d.x - CHAR_W / 2, d.y - DESK_H / 2 - CHAR_H + 16 + bob, CHAR_W, CHAR_H, frame);

        // production at work = a shoot in progress: spotlight, REC dot, flash
        if(st.dept === 'production' && working){
          // spotlight cone from above
          ctx.fillStyle = 'rgba(255,224,102,0.10)';
          ctx.beginPath();
          ctx.moveTo(d.x - 8, d.y - DESK_H / 2 - CHAR_H - 24);
          ctx.lineTo(d.x - 46, d.y + 8);
          ctx.lineTo(d.x + 46, d.y + 8);
          ctx.closePath();
          ctx.fill();
          // blinking REC dot
          if(Math.floor(t * 2) % 2 === 0){
            ctx.fillStyle = '#ff5c5c';
            ctx.fillRect(d.x + DESK_W / 2 - 12, d.y - DESK_H / 2 - 10, 6, 6);
            pxText(ctx, 'REC', d.x + DESK_W / 2 - 4, d.y - DESK_H / 2 - 3, 8, '#ff5c5c', 'left', true);
          }
          // camera flash pop every ~3s
          if((t + i * 0.7) % 3 < 0.12){
            ctx.fillStyle = 'rgba(255,255,255,0.55)';
            ctx.fillRect(d.x - DESK_W / 2 - 8, d.y - DESK_H / 2 - CHAR_H, DESK_W + 16, CHAR_H + DESK_H);
          }
        }
      }
      if(home){
        pxText(ctx, 'zzz · home', d.x, d.y + 4, 12, 'rgba(159,232,255,0.4)', 'center');
      }

      // desk + monitor
      drawSprite(ctx, 'desk', d.x - DESK_W / 2, d.y - DESK_H / 2, DESK_W, DESK_H);
      if(st && st.briefId){
        // steady on, with an occasional one-frame CRT blink
        if(Math.floor(t * 6) % 9 !== 8) drawSprite(ctx, 'monitor_on', d.x - 16, d.y - DESK_H / 2 - 4, 32, 24);
      }

      if(!st){
        ctx.strokeStyle = 'rgba(159,232,255,0.15)';
        ctx.lineWidth = 2;
        ctx.strokeRect(d.x - DESK_W / 2 + 1, d.y - DESK_H / 2 + 1, DESK_W - 2, DESK_H - 2);
        continue;
      }
      if(home) continue; // no nameplate/bars for sleeping staff
      if(away) continue; // they are at the cooler; drawn in drawWanderers

      // name plate + badge icons
      var first = st.name.split(' ')[0];
      pxText(ctx, first, d.x - 6, d.y + DESK_H / 2 + 14, 8, '#f4e8cf', 'center', true);
      if(st.badges.length){
        ctx.font = '11px serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        ctx.fillText(st.badges.map(function(b){ return b.icon; }).join(''), d.x + (first.length * 4.5), d.y + DESK_H / 2 + 15);
      }
      // skill stars
      pxText(ctx, '★'.repeat(st.skill), d.x, d.y + DESK_H / 2 + 26, 9, '#ffe066', 'center');

      // burnout bar (under stars)
      bar(ctx, d.x - 30, d.y + DESK_H / 2 + 31, 60, 5,
          st.burnout / 100,
          st.burnout > 75 ? '#ff5c5c' : (st.burnout > 45 ? '#ff9a56' : '#7ee08a'));
      if(st.burnout > 75 && Math.floor(t * 4) % 2 === 0){
        pxText(ctx, '!!', d.x + 38, d.y + DESK_H / 2 + 38, 14, '#ff5c5c', 'left');
      }

      // assigned brief: deadline timer + progress floating over desk
      if(st.briefId){
        var b = G.briefs.byId(st.briefId);
        if(b){
          var top = d.y - DESK_H / 2 - CHAR_H - 4;
          var frac = b.deadlineLeft / b.deadlineTotal;
          var col = frac > 0.5 ? '#7ee08a' : (frac > 0.22 ? '#ffe066' : '#ff5c5c');
          bar(ctx, d.x - 45, top, 90, 7, frac, col);
          var daysleft = (b.deadlineLeft / G.BAL.DAY_REAL_SECONDS);
          var dtxt = daysleft >= 1 ? daysleft.toFixed(1) + 'd' : Math.ceil(daysleft * 10) * 10 + '%';
          var blink = frac < 0.22 && Math.floor(t * 4) % 2 === 0;
          pxText(ctx, dtxt, d.x + 50, top + 7, 13, blink ? '#ff5c5c' : col, 'left');
          bar(ctx, d.x - 45, top + 11, 90, 5, b.workDone / b.workNeeded, '#9fe8ff');
          pxText(ctx, b.title.length > 18 ? b.title.slice(0, 17) + '…' : b.title, d.x, top - 5, 12, '#f4e8cf', 'center');
        }
      }

      // speech bubble: above the timer bars, off to the right
      if(st.bubble){
        drawBubble(ctx, d.x + 30, d.y - DESK_H / 2 - CHAR_H - 24, st.bubble);
      }
    }
  }

  // staff currently out at the water cooler. Drawn after the desks so they sit
  // on top of the floor/cooler. Just the sprite + (optional) gossip bubble.
  function drawWanderers(ctx){
    var s = G.state;
    for(var i = 0; i < s.staff.length; i++){
      var st = s.staff[i];
      var a = st.away;
      if(!a) continue;
      var walking = a.mode === 'going' || a.mode === 'returning';
      // walk pace frame flip; standing still while chatting
      var frame = walking ? Math.floor(t * 6 + i) % 2 : (Math.floor(t * 1.5 + i) % 2);
      drawSprite(ctx, st.portraitKey, a.x - CHAR_W / 2, a.y - CHAR_H + 8, CHAR_W, CHAR_H, frame);
      if(a.mode === 'chatting' && a.bubble){
        drawBubble(ctx, a.x + 14, a.y - CHAR_H - 2, a.bubble);
      }
    }
  }

  function drawBubble(ctx, x, y, text){
    ctx.font = "16px 'VT323', monospace";
    var w = Math.max(60, ctx.measureText(text).width + 16);
    var h = 26;
    x = Math.max(8, Math.min(x, 1280 - w - 8)); // never clip off-stage
    ctx.fillStyle = '#000'; ctx.fillRect(x - 2, y - h - 2, w + 4, h + 4);
    ctx.fillStyle = '#f4e8cf'; ctx.fillRect(x, y - h, w, h);
    // tail
    ctx.fillStyle = '#f4e8cf';
    ctx.fillRect(x + 6, y, 8, 7);
    ctx.fillStyle = '#1a1410';
    ctx.font = "16px 'VT323', monospace";
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(text, x + 8, y - 8);
  }

  // ---------- clickable hotspots (chai / printer / window / board) ----------
  var HOTSPOTS = {
    chai:    { x: 100, y: 158, w: 72, h: 78 },
    printer: { x: 700, y: 178, w: 60, h: 58 },
    window:  { x: 950, y: 245, w: 100, h: 135 }, // upper door panel: peek outside
    board:   { x: 40,  y: 50,  w: 210, h: 58 },
    tv:      { x: 285, y: 150, w: 120, h: 80 }   // wall-mounted, only when owned
  };

  // absurd ad-industry headlines for the TV news ticker (no real brands)
  var TV_HEADLINES = [
    'BRAND MANAGER ASKS FOR "SAME BUT DIFFERENT", AGENCY COMPLIES IN TEARS',
    'LOCAL STARTUP REBRANDS FOURTH TIME THIS QUARTER, LOGO NOW A CIRCLE',
    'CLIENT WANTS IT "TO GO VIRAL", BUDGET IS ONE THOUSAND RUPEES',
    'STUDY FINDS 9 IN 10 BRIEFS CHANGE AFTER FINAL APPROVAL',
    'CEO SEEN ON LINKEDIN AT 6AM, PRODUCTIVITY UNAFFECTED',
    'NEW REEL TREND DIES BEFORE AGENCY FINISHES MOODBOARD',
    'INTERN PITCHES IDEA, SENIOR PRESENTS IT, BOTH SATISFIED',
    'MAKE IT POP, SAYS NATION, AGAIN'
  ];
  var TV_CHANNEL_LINES = [
    'Cricket. Somebody dropped a catch. Productivity dipped 4%.',
    'The news anchor is angry about something. As usual.',
    'An ad break. The volume is louder. It always is.',
    'Weather: hot. Tomorrow: hot. The client wants snow.'
  ];

  // motivational poster (the board hotspot needs something to click)
  function drawBoard(ctx){
    var h = HOTSPOTS.board;
    ctx.fillStyle = '#16203a'; ctx.fillRect(h.x - 3, h.y - 3, h.w + 6, h.h + 6);
    ctx.fillStyle = '#f4e8cf'; ctx.fillRect(h.x, h.y, h.w, h.h);
    ctx.strokeStyle = '#ffe066'; ctx.lineWidth = 3;
    ctx.strokeRect(h.x + 1.5, h.y + 1.5, h.w - 3, h.h - 3);
    // plain ink, no pxText shadow: tiny type on light paper smears otherwise
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.font = "16px 'Silkscreen', monospace";
    ctx.fillStyle = '#1a1410';
    ctx.fillText('HUSTLE', h.x + h.w / 2, h.y + 27);
    ctx.font = "16px 'VT323', monospace";
    ctx.fillStyle = '#4a3a28';
    ctx.fillText('mandatory inspiration', h.x + h.w / 2, h.y + 46);
  }

  function drawChaiStation(ctx){
    var s = G.state;
    var h = HOTSPOTS.chai;
    var used = s.chaiDay === s.week * 10 + s.day;

    if(G.data.hasArt('chai_station')){
      // hi-bit sprite replaces the procedural counter/kettle/cups; used state
      // dims the whole station, steam + label still ride on top
      if(used) ctx.globalAlpha = 0.55;
      drawSprite(ctx, 'chai_station', h.x, h.y, h.w, h.h);
      ctx.globalAlpha = 1;
    } else {
      // counter
      ctx.fillStyle = '#16203a'; ctx.fillRect(h.x, h.y + 46, h.w, 30);
      ctx.fillStyle = '#2a3654'; ctx.fillRect(h.x + 3, h.y + 49, h.w - 6, 24);
      // kettle
      ctx.fillStyle = used ? '#5a5a52' : '#c0c0b4';
      ctx.fillRect(h.x + 10, h.y + 22, 26, 24);
      ctx.fillRect(h.x + 36, h.y + 28, 8, 6); // spout
      ctx.fillStyle = '#16203a'; ctx.fillRect(h.x + 16, h.y + 16, 14, 6); // lid
      // kulhad glasses
      ctx.fillStyle = '#b06a3a';
      ctx.fillRect(h.x + 48, h.y + 36, 9, 10);
      ctx.fillRect(h.x + 59, h.y + 36, 9, 10);
    }
    // steam (only while chai is still on offer) — rises from the kettle spout
    if(!used){
      var sy = Math.floor(t * 3) % 3;
      ctx.fillStyle = 'rgba(244,232,207,0.5)';
      ctx.fillRect(h.x + 18, h.y + 6 - sy * 2, 4, 4);
      ctx.fillRect(h.x + 26, h.y + 10 - sy * 2, 4, 4);
    }
    pxText(ctx, used ? 'CHAI (kal)' : 'CHAI ☕', h.x + h.w / 2, h.y + h.h + 12, 9,
           used ? 'rgba(159,232,255,0.35)' : '#ffe066', 'center', true);
  }

  function drawPrinter(ctx){
    var s = G.state;
    var h = HOTSPOTS.printer;
    if(G.data.hasArt('printer')){
      // hi-bit sprite; top-right left visually quiet for the status lights below
      drawSprite(ctx, 'printer', h.x, h.y, h.w, h.h);
    } else {
      ctx.fillStyle = '#16203a'; ctx.fillRect(h.x - 3, h.y - 3, h.w + 6, h.h + 6);
      ctx.fillStyle = '#8a8a80'; ctx.fillRect(h.x, h.y, h.w, h.h - 14);
      ctx.fillStyle = '#6a6a62'; ctx.fillRect(h.x, h.y + h.h - 14, h.w, 14); // tray
      ctx.fillStyle = '#f4e8cf'; ctx.fillRect(h.x + 10, h.y + h.h - 18, h.w - 20, 6); // paper
    }
    // status light + jam drama
    if(s.printerJammed){
      if(Math.floor(t * 4) % 2 === 0){
        ctx.fillStyle = '#ff5c5c'; ctx.fillRect(h.x + h.w - 12, h.y + 6, 6, 6);
        pxText(ctx, 'JAM!', h.x + h.w / 2, h.y - 8, 10, '#ff5c5c', 'center', true);
      }
    } else {
      ctx.fillStyle = '#7ee08a'; ctx.fillRect(h.x + h.w - 12, h.y + 6, 6, 6);
    }
  }

  function drawTrophies(ctx){
    var tr = G.state.trophies;
    if(!tr || !tr.length) return;
    var x0 = 46, y0 = 120;
    pxText(ctx, 'AWARD SHELF', x0, y0 - 4, 8, 'rgba(255,224,102,0.6)', 'left', true);
    // shelf plank
    ctx.fillStyle = '#16203a'; ctx.fillRect(x0 - 4, y0 + 24, Math.min(tr.length, 8) * 26 + 8, 5);
    for(var i = 0; i < Math.min(tr.length, 8); i++){
      var x = x0 + i * 26;
      ctx.fillStyle = '#ffe066';
      ctx.fillRect(x + 4, y0 + 2, 12, 10);  // cup
      ctx.fillRect(x + 7, y0 + 12, 6, 5);   // stem
      ctx.fillRect(x + 3, y0 + 17, 14, 4);  // base
      ctx.fillStyle = '#b8860b';
      ctx.fillRect(x + 4, y0 + 9, 12, 3);   // shading band
    }
  }

  // ---------- office TV (wall-mounted, alive) ----------
  // 4 channels cycle every ~5s unless the player clicks to change it. The
  // screen is procedural pixel scenes, kept small + low-key so it reads as
  // ambient background, not a second game.
  // inner-screen rect of the tv_set sprite, in sprite-logical coords (the sprite
  // is drawn at HOTSPOTS.tv.w x .h = 120x80). Measured off the art: the live
  // channel content + scanlines + clip all use SCR, never the full bezel box.
  var TV_SCREEN = { dx: 30, dy: 9, w: 81, h: 52 };

  function drawTV(ctx){
    var h = HOTSPOTS.tv;
    var hasArt = G.data.hasArt('tv_set');

    // SCR = the live-glass rect in game coords. With art it's the sprite's inner
    // screen; without art it's the whole procedural box (legacy fallback).
    var SCR = hasArt
      ? { x: h.x + TV_SCREEN.dx, y: h.y + TV_SCREEN.dy, w: TV_SCREEN.w, h: TV_SCREEN.h }
      : { x: h.x, y: h.y, w: h.w, h: h.h };

    if(hasArt){
      // hi-bit casing sprite (bezel + mount + blank dark screen)
      drawSprite(ctx, 'tv_set', h.x, h.y, h.w, h.h);
    } else {
      // mounting bracket + bezel (procedural fallback)
      ctx.fillStyle = '#0a0d16'; ctx.fillRect(h.x - 6, h.y - 6, h.w + 12, h.h + 12);
      ctx.fillStyle = '#161b28'; ctx.fillRect(h.x - 4, h.y - 4, h.w + 8, h.h + 8);
      ctx.strokeStyle = '#2a3142'; ctx.lineWidth = 2;
      ctx.strokeRect(h.x - 3.5, h.y - 3.5, h.w + 7, h.h + 7);
      // stubby wall mount under it
      ctx.fillStyle = '#0a0d16'; ctx.fillRect(h.x + h.w / 2 - 8, h.y + h.h + 6, 16, 6);
    }

    // clip the screen so scene draws never bleed past the glass
    ctx.save();
    ctx.beginPath();
    ctx.rect(SCR.x, SCR.y, SCR.w, SCR.h);
    ctx.clip();

    // auto-advance the channel ~ every 5s, offset by the manual channel pick
    var chan = (G.state.tvChannel + Math.floor(t / 5)) % 4;
    // a brief static burst at the top of each scene + rare random pops
    var sinceFlip = (t / 5) % 1;
    var staticNow = sinceFlip < 0.10 || (Math.floor(t * 13) % 97 === 0);

    if(staticNow){
      drawTVStatic(ctx, SCR);
    } else if(chan === 0){
      drawTVCricket(ctx, SCR);
    } else if(chan === 1){
      drawTVNews(ctx, SCR);
    } else if(chan === 2){
      drawTVAd(ctx, SCR);
    } else {
      drawTVWeather(ctx, SCR);
    }

    // CRT scanlines + glass glare, very faint
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#000';
    for(var sl = 0; sl < SCR.h; sl += 3) ctx.fillRect(SCR.x, SCR.y + sl, SCR.w, 1);
    ctx.globalAlpha = 1;
    ctx.restore();

    // channel number tab (bottom-right under the casing)
    pxText(ctx, 'CH' + (chan + 1), h.x + h.w - 4, h.y + h.h + 2, 7, 'rgba(159,232,255,0.5)', 'right', true);
  }

  function drawTVStatic(ctx, h){
    for(var i = 0; i < 120; i++){
      var g = 40 + Math.floor(Math.random() * 180);
      ctx.fillStyle = 'rgb(' + g + ',' + g + ',' + g + ')';
      var sx = h.x + Math.floor(Math.random() * h.w);
      var sy = h.y + Math.floor(Math.random() * h.h);
      ctx.fillRect(sx, sy, 3, 2);
    }
  }

  function drawTVCricket(ctx, h){
    // pitch: green field, tan strip
    ctx.fillStyle = '#2f5d34'; ctx.fillRect(h.x, h.y, h.w, h.h);
    ctx.fillStyle = '#c9a24e';
    ctx.fillRect(h.x + h.w / 2 - 6, h.y + 14, 12, h.h - 30); // pitch strip
    // stumps both ends
    ctx.fillStyle = '#f4e8cf';
    ctx.fillRect(h.x + h.w / 2 - 4, h.y + 16, 2, 6);
    ctx.fillRect(h.x + h.w / 2, h.y + 16, 2, 6);
    ctx.fillRect(h.x + h.w / 2 + 4, h.y + 16, 2, 6);
    ctx.fillRect(h.x + h.w / 2 - 4, h.y + h.h - 24, 2, 6);
    ctx.fillRect(h.x + h.w / 2, h.y + h.h - 24, 2, 6);
    ctx.fillRect(h.x + h.w / 2 + 4, h.y + h.h - 24, 2, 6);
    // the ball: bounces down the pitch
    var bp = (t * 0.8) % 1;
    var bx = h.x + h.w / 2;
    var by = h.y + 20 + bp * (h.h - 48);
    ctx.fillStyle = '#ff5c5c'; ctx.fillRect(bx - 1, by, 3, 3);
    // score ticker bar at the bottom
    ctx.fillStyle = '#0a0d16'; ctx.fillRect(h.x, h.y + h.h - 12, h.w, 12);
    var runs = 140 + Math.floor(t) % 60;
    pxText(ctx, 'IND ' + runs + '/4  ov 18.' + (Math.floor(t) % 6), h.x + 4, h.y + h.h - 3, 8, '#ffe066', 'left', true);
    // LIVE dot
    if(Math.floor(t * 2) % 2 === 0){
      ctx.fillStyle = '#ff5c5c'; ctx.fillRect(h.x + h.w - 28, h.y + 4, 4, 4);
    }
    pxText(ctx, 'LIVE', h.x + h.w - 22, h.y + 9, 7, '#ff5c5c', 'left', true);
  }

  function drawTVNews(ctx, h){
    // studio backdrop
    ctx.fillStyle = '#1a2238'; ctx.fillRect(h.x, h.y, h.w, h.h);
    ctx.fillStyle = '#24304e'; ctx.fillRect(h.x + 6, h.y + 6, h.w - 12, h.h - 24);
    // anchor: head + body, mouth flaps
    var cx = h.x + h.w / 2;
    ctx.fillStyle = '#7a4a21'; ctx.fillRect(cx - 9, h.y + 14, 18, 16); // head
    ctx.fillStyle = '#2a2018'; ctx.fillRect(cx - 9, h.y + 12, 18, 4);  // hair
    // eyes
    ctx.fillStyle = '#0a0d16'; ctx.fillRect(cx - 5, h.y + 20, 2, 2); ctx.fillRect(cx + 3, h.y + 20, 2, 2);
    // mouth: open/closed on a fast clock = talking
    var open = Math.floor(t * 6) % 2 === 0;
    ctx.fillStyle = '#3a1a1a'; ctx.fillRect(cx - 3, h.y + 25, 6, open ? 3 : 1);
    // shoulders / suit
    ctx.fillStyle = '#14304a'; ctx.fillRect(cx - 14, h.y + 30, 28, 14);
    ctx.fillStyle = '#f4e8cf'; ctx.fillRect(cx - 2, h.y + 30, 4, 10); // shirt
    // BREAKING banner
    ctx.fillStyle = '#ff5c5c'; ctx.fillRect(h.x, h.y + h.h - 24, 40, 12);
    pxText(ctx, 'NEWS', h.x + 3, h.y + h.h - 15, 7, '#fff', 'left', true);
    // scrolling headline ticker
    ctx.fillStyle = '#0a0d16'; ctx.fillRect(h.x, h.y + h.h - 12, h.w, 12);
    var line = TV_HEADLINES[Math.floor(t / 9) % TV_HEADLINES.length] + '   •   ';
    ctx.font = "11px 'VT323', monospace";
    var lw = ctx.measureText(line).width;
    var scroll = (t * 34) % lw;
    ctx.fillStyle = '#ffe066';
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(line + line, h.x - scroll, h.y + h.h - 3);
    ctx.fillText(line + line, h.x - scroll + lw, h.y + h.h - 3);
  }

  function drawTVAd(ctx, h){
    // loud ad break: blinking SALE on a hot background
    var hot = Math.floor(t * 3) % 2 === 0;
    ctx.fillStyle = hot ? '#d35d6e' : '#ff9a56'; ctx.fillRect(h.x, h.y, h.w, h.h);
    // sunburst-ish bars
    ctx.fillStyle = 'rgba(255,224,102,0.35)';
    for(var i = 0; i < 6; i++) ctx.fillRect(h.x + i * 22 - (Math.floor(t * 8) % 22), h.y, 8, h.h);
    if(Math.floor(t * 4) % 2 === 0){
      pxText(ctx, 'SALE SALE', h.x + h.w / 2, h.y + 30, 16, '#fff', 'center', true);
      pxText(ctx, 'SALE!', h.x + h.w / 2, h.y + 50, 16, '#23304a', 'center', true);
    }
    pxText(ctx, 'upto 90% off*', h.x + h.w / 2, h.y + h.h - 8, 12, '#fff', 'center');
    pxText(ctx, '*nothing', h.x + h.w - 4, h.y + h.h - 2, 7, 'rgba(255,255,255,0.7)', 'right');
  }

  function drawTVWeather(ctx, h){
    ctx.fillStyle = '#14233f'; ctx.fillRect(h.x, h.y, h.w, h.h);
    pxText(ctx, 'AHMEDABAD', h.x + 6, h.y + 16, 9, '#9fe8ff', 'left', true);
    // a relentless sun
    var pulse = 6 + Math.abs(Math.sin(t * 2)) * 3;
    ctx.fillStyle = '#ffe066';
    ctx.fillRect(h.x + h.w - 34, h.y + 18, 18, 18);
    ctx.fillStyle = 'rgba(255,224,102,0.4)';
    ctx.fillRect(h.x + h.w - 34 - pulse, h.y + 18 - pulse / 2, 18 + pulse * 2, 18 + pulse);
    var temp = 40 + Math.floor(t) % 4;
    pxText(ctx, temp + '°C', h.x + 6, h.y + 44, 22, '#ff9a56', 'left', true);
    pxText(ctx, 'feels like a brief', h.x + 6, h.y + 62, 12, '#9aa7c4', 'left');
    ctx.fillStyle = '#0a0d16'; ctx.fillRect(h.x, h.y + h.h - 12, h.w, 12);
    pxText(ctx, 'monsoon: "soon"', h.x + 4, h.y + h.h - 3, 8, '#9fe8ff', 'left', true);
  }

  // ---------- neon sign (proper glowing tube) ----------
  function drawNeon(ctx){
    var txt = '~ ' + (G.state.neonText || 'CRAVACHE') + ' ~';
    var cx = 640, cy = 40;
    // one-frame buzz/flicker: mostly on, occasionally a dim frame
    var flick = Math.floor(t * 9) % 53;
    var on = flick !== 0 && flick !== 1;          // brief 2-frame buzz-out
    var dim = Math.floor(t * 3) % 11 === 0;       // gentle low-power flutter
    var w = 280;
    // backing board (always there, so a dark sign still reads as a sign)
    ctx.fillStyle = '#0c1322';
    ctx.fillRect(cx - w / 2, cy - 24, w, 42);
    ctx.strokeStyle = '#1a2440'; ctx.lineWidth = 2;
    ctx.strokeRect(cx - w / 2 + 1, cy - 23, w - 2, 40);

    ctx.font = "18px 'Silkscreen', monospace";
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';

    if(on){
      // soft glow halo (shadowBlur used sparingly, single pass)
      ctx.save();
      ctx.shadowColor = '#ff9a56';
      ctx.shadowBlur = dim ? 6 : 16;
      ctx.fillStyle = dim ? '#b85c2e' : '#ff9a56';
      ctx.fillText(txt, cx, cy + 6);
      ctx.restore();
      // dark tube outline for that layered glass look
      ctx.lineWidth = 3; ctx.strokeStyle = '#5a2a14';
      ctx.strokeText(txt, cx, cy + 6);
      // bright core
      ctx.fillStyle = dim ? '#ffb27a' : '#ffd9b0';
      ctx.fillText(txt, cx, cy + 6);
      // tube frame
      ctx.strokeStyle = on ? 'rgba(255,154,86,0.55)' : 'rgba(255,154,86,0.15)';
      ctx.lineWidth = 2;
      ctx.strokeRect(cx - w / 2 + 6, cy - 19, w - 12, 32);
    } else {
      // buzzed-out frame: cold dead tube
      ctx.fillStyle = '#3a2418';
      ctx.fillText(txt, cx, cy + 6);
    }
  }

  // ---------- water cooler + chatting staff ----------
  // bottle + base; gossiping staff (st.away) draw themselves over in drawDesks.
  function drawCooler(ctx){
    var cx = COOLER.x, cy = COOLER.y; // top-left of the unit
    // shadow on the floor (kept under both art + procedural)
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(cx - 4, cy + 64, 48, 6);
    if(G.data.hasArt('water_cooler')){
      // hi-bit sprite: bottle (top ~34px) + dispenser align with the old unit.
      // Old unit spanned cy-2 .. cy+68 (h~70) and cx-2 .. cx+42 (w~44).
      drawSprite(ctx, 'water_cooler', cx - 3, cy - 4, 46, 74);
      return;
    }
    // base cabinet (white)
    ctx.fillStyle = '#0a0d16'; ctx.fillRect(cx - 2, cy + 30, 44, 38);
    ctx.fillStyle = '#dfe6ee'; ctx.fillRect(cx, cy + 32, 40, 34);
    ctx.fillStyle = '#aeb8c4'; ctx.fillRect(cx, cy + 32, 40, 4); // top lip
    // recessed dispenser panel + two spigots side by side (hot/cold)
    ctx.fillStyle = '#b8c2cc'; ctx.fillRect(cx + 6, cy + 40, 28, 14);
    ctx.fillStyle = '#ff5c5c'; ctx.fillRect(cx + 12, cy + 43, 4, 3); // hot
    ctx.fillStyle = '#3a8ad0'; ctx.fillRect(cx + 24, cy + 43, 4, 3); // cold
    ctx.fillStyle = '#2a3142'; ctx.fillRect(cx + 12, cy + 46, 4, 4);
    ctx.fillStyle = '#2a3142'; ctx.fillRect(cx + 24, cy + 46, 4, 4);
    // drip grille
    ctx.fillStyle = '#8a94a0'; ctx.fillRect(cx + 8, cy + 58, 24, 3);
    // the blue bottle (inverted)
    ctx.fillStyle = '#0a0d16'; ctx.fillRect(cx + 6, cy - 2, 28, 34);
    ctx.fillStyle = 'rgba(120,180,220,0.85)'; ctx.fillRect(cx + 8, cy, 24, 30);
    // water level + a couple of rising bubbles
    ctx.fillStyle = 'rgba(180,220,245,0.9)'; ctx.fillRect(cx + 8, cy + 4, 24, 24);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    var by = (t * 14) % 24;
    ctx.fillRect(cx + 14, cy + 26 - by, 2, 2);
    ctx.fillRect(cx + 22, cy + 28 - ((by + 12) % 24), 2, 2);
    // cap/neck
    ctx.fillStyle = '#3a6a8a'; ctx.fillRect(cx + 14, cy + 28, 12, 4);
  }

  // floor spot for the cooler: clear lane between content cluster and the door,
  // above the production tape (which is y>=425). Verified against DESKS.
  var COOLER = { x: 884, y: 300 };
  G.render.coolerPoint = function(){ return { x: COOLER.x + 20, y: COOLER.y + 66 }; };

  // ---------- props ----------
  function drawProps(ctx){
    var s = G.state;
    drawChaiStation(ctx);
    drawPrinter(ctx);
    drawBoard(ctx);
    drawTrophies(ctx);
    if(s.upgrades.coffee) drawSprite(ctx, 'coffee_machine', 16, 150, 60, 80);
    if(s.upgrades.plant) drawSprite(ctx, 'plant', 836, 168, 48, 68);
    if(s.upgrades.tv) drawTV(ctx);
    if(s.upgrades.cooler) drawCooler(ctx);
    if(s.upgrades.neon) drawNeon(ctx);
    // phone rings when a call is live
    if(s.activeCall && Math.floor(t * 8) % 2 === 0){
      drawSprite(ctx, 'phone_prop', 905, 170, 40, 40);
      pxText(ctx, 'RING', 925, 162, 10, '#ff5c5c', 'center', true);
    }
  }

  // ---------- fire overlay (chaos) ----------
  function drawFire(ctx){
    var chaos = G.state.chaos;
    if(chaos < 55) return;
    // spot flames creep in from 55%
    var n = Math.floor((chaos - 50) / 6);
    ctx.font = '40px serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for(var i = 0; i < n; i++){
      var fx = (i * 173 + 90) % 1240 + 20;
      var fy = 640 - (Math.floor(t * 5 + i) % 2) * 8;
      ctx.fillText('🔥', fx, fy);
    }
    // past 80%: the full flame band rises from the floor (fire_overlay is a
    // transparent-top full-frame band) + pulsing red wash
    if(chaos > 80){
      if(G.data.hasArt('fire_overlay')){
        var rise = (chaos - 80) / 20; // 0..1
        ctx.globalAlpha = 0.55 + 0.25 * Math.abs(Math.sin(t * 4));
        drawSprite(ctx, 'fire_overlay', 0, Math.round(220 + (1 - rise) * 500), 1280, 720);
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = 'rgba(255,92,92,' + (0.05 + 0.10 * Math.abs(Math.sin(t * 3))) + ')';
      ctx.fillRect(0, 0, 1280, 720);
    }
  }

  G.render.office = {
    DESKS: DESKS,
    deskHitbox: deskHitbox,

    draw: function(ctx, dt){
      t += dt;
      ctx.clearRect(0, 0, 1280, 720);
      drawBackground(ctx);
      // night: the office goes dark blue, monitors become the light source
      if(G.state.night){
        ctx.fillStyle = 'rgba(8,12,28,0.52)';
        ctx.fillRect(0, 0, 1280, 720);
        pxText(ctx, '🌙 NIGHT SHIFT', 640, 60, 12, 'rgba(159,232,255,0.7)', 'center', true);
      }
      drawQuotesWall(ctx);
      drawProps(ctx);
      drawClusters(ctx);
      drawDesks(ctx);
      drawWanderers(ctx);
      drawFire(ctx);
    },

    // pointer hover (for leaning in to listen to an editor)
    hoverDesk: -1,
    setHover: function(lx, ly){
      this.hoverDesk = -1;
      for(var d = 0; d < DESKS.length; d++){
        if(!G.staff.deptUnlocked(DESKS[d].dept)) continue;
        var hb = deskHitbox(d);
        if(lx >= hb.x && lx <= hb.x + hb.w && ly >= hb.y && ly <= hb.y + hb.h){
          this.hoverDesk = d;
          return;
        }
      }
    },

    // canvas click: hotspots, quote frames, staffers (nudge if working), desks
    handleClick: function(lx, ly){
      var s = G.state;

      function inBox(h){ return lx >= h.x && lx <= h.x + h.w && ly >= h.y && ly <= h.y + h.h; }

      // chai station: one round a day, whole office exhales
      if(inBox(HOTSPOTS.chai)){
        var key = s.week * 10 + s.day;
        if(s.chaiDay === key){
          G.dock.infoToast('CHAI', 'One round a day. The chai budget is a line item now.', '');
        } else if(s.money < G.BAL.CHAI_COST){
          G.dock.infoToast('CHAI', 'Cannot afford chai. Let that sink in.', 'bad');
          G.audio.decline();
        } else {
          s.chaiDay = key;
          G.economy.spend(G.BAL.CHAI_COST);
          var sipped = 0;
          s.staff.forEach(function(st){
            if(!G.time.onClock(st)) return;
            st.burnout = Math.max(0, st.burnout - G.BAL.CHAI_RELIEF);
            sipped++;
            if(Math.random() < 0.4) G.staff.say(st, 'chai ☕');
          });
          G.audio.chaChing();
          G.dock.infoToast('CHAI ROUND ☕', sipped + ' cutting chais. Burnout −' + G.BAL.CHAI_RELIEF + '%. Morale: briefly real.', 'good');
        }
        return;
      }

      // printer: fix the jam, calm the room
      if(inBox(HOTSPOTS.printer)){
        if(s.printerJammed){
          s.printerJammed = false;
          G.chaos.add(-G.BAL.PRINTER_FIX_CHAOS);
          G.audio.accept();
          G.dock.infoToast('PRINTER FIXED', PRINTER_LINES[printerIdx++ % PRINTER_LINES.length], 'good');
        } else {
          G.dock.infoToast('PRINTER', 'It works. Nobody knows why. Do not touch it.', '');
          G.audio.click();
        }
        return;
      }

      // window: ahmedabad is out there
      if(inBox(HOTSPOTS.window)){
        G.audio.click();
        G.dock.infoToast('OUT THE WINDOW', WINDOW_LINES[windowIdx++ % WINDOW_LINES.length], '');
        return;
      }

      // agency board: ceo-grade motivation
      if(inBox(HOTSPOTS.board)){
        G.audio.click();
        G.dock.infoToast('THE BOARD SAYS', BOARD_LINES[boardIdx++ % BOARD_LINES.length], '');
        return;
      }

      // office TV: flip the channel manually
      if(s.upgrades.tv && inBox(HOTSPOTS.tv)){
        s.tvChannel = (s.tvChannel + 1) % 4;
        G.audio.click();
        var ch = (s.tvChannel + Math.floor(t / 5)) % 4;
        G.dock.infoToast('TV', TV_CHANNEL_LINES[ch], '');
        return;
      }

      for(var i = 0; i < quoteFrames.length; i++){
        var f = quoteFrames[i];
        if(lx >= f.x && lx <= f.x + f.w && ly >= f.y && ly <= f.y + f.h){
          var q = s.quotesWall[f.idx];
          if(q) G.modals.showQuote(q);
          return;
        }
      }
      for(var d = 0; d < DESKS.length; d++){
        if(!G.staff.deptUnlocked(DESKS[d].dept)) continue;
        var hb = deskHitbox(d);
        if(lx >= hb.x && lx <= hb.x + hb.w && ly >= hb.y && ly <= hb.y + hb.h){
          var st = G.staff.atDesk(d);
          if(st){
            if(st.briefId && G.time.onClock(st)){
              // standing over them: work moves a little, an excuse comes free
              G.staff.nudge(st);
            } else {
              G.staff.say(st, st.trait);
              G.audio.click();
            }
          }
          return;
        }
      }
    }
  };
})();
