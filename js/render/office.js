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

      // staffer behind desk (bob + typing frames while working)
      if(st && !home){
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

  function drawBubble(ctx, x, y, text){
    ctx.font = "16px 'VT323', monospace";
    var w = Math.max(60, ctx.measureText(text).width + 16);
    var h = 26;
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
    board:   { x: 40,  y: 50,  w: 210, h: 58 }
  };

  // motivational poster (the board hotspot needs something to click)
  function drawBoard(ctx){
    var h = HOTSPOTS.board;
    ctx.fillStyle = '#16203a'; ctx.fillRect(h.x - 3, h.y - 3, h.w + 6, h.h + 6);
    ctx.fillStyle = '#f4e8cf'; ctx.fillRect(h.x, h.y, h.w, h.h);
    ctx.strokeStyle = '#ffe066'; ctx.lineWidth = 3;
    ctx.strokeRect(h.x + 1.5, h.y + 1.5, h.w - 3, h.h - 3);
    pxText(ctx, 'HUSTLE™', h.x + h.w / 2, h.y + 26, 14, '#7a4a21', 'center', true);
    pxText(ctx, 'mandatory inspiration', h.x + h.w / 2, h.y + 44, 13, '#5a4632', 'center');
  }

  function drawChaiStation(ctx){
    var s = G.state;
    var h = HOTSPOTS.chai;
    var used = s.chaiDay === s.week * 10 + s.day;
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
    // steam (only while chai is still on offer)
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
    ctx.fillStyle = '#16203a'; ctx.fillRect(h.x - 3, h.y - 3, h.w + 6, h.h + 6);
    ctx.fillStyle = '#8a8a80'; ctx.fillRect(h.x, h.y, h.w, h.h - 14);
    ctx.fillStyle = '#6a6a62'; ctx.fillRect(h.x, h.y + h.h - 14, h.w, 14); // tray
    ctx.fillStyle = '#f4e8cf'; ctx.fillRect(h.x + 10, h.y + h.h - 18, h.w - 20, 6); // paper
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

  // ---------- props ----------
  function drawProps(ctx){
    var s = G.state;
    drawChaiStation(ctx);
    drawPrinter(ctx);
    drawBoard(ctx);
    drawTrophies(ctx);
    if(s.upgrades.coffee) drawSprite(ctx, 'coffee_machine', 16, 150, 60, 80);
    if(s.upgrades.plant) drawSprite(ctx, 'plant', 836, 168, 48, 68);
    if(s.upgrades.neon){
      var on = Math.floor(t * 2) % 7 !== 6; // occasional flicker, it's that kind of sign
      if(on){
        pxText(ctx, '~ CRAVACHE ~', 640, 40, 16, '#ff9a56', 'center', true);
        ctx.strokeStyle = 'rgba(255,154,86,0.5)';
        ctx.lineWidth = 2;
        ctx.strokeRect(520, 14, 240, 38);
      }
    }
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
