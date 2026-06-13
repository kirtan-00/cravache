// CravAche — canvas office scene: bg, desks, chars, deadline timers, progress,
// burnout, speech bubbles, quotes wall, props, fire overlay. All sprites go
// through G.data.sprite(key) which returns real art OR colored-rect+emoji
// fallback (parallel build contract).
(function(){
  'use strict';
  window.G = window.G || {};
  G.render = G.render || {};

  // desk slots (centers) grouped in department clusters. Hitboxes derived.
  // Top-down re-camera (spec B4): 17 slots, 4 dept clusters on per-dept rugs.
  // Carpet floor is y 150..600. Desks drawn at 96x72 (1:1), rows >=150px apart.
  var DESKS = [
    // DESIGN (5) — left third, rug ~x60-360
    { x: 120, y: 300, dept: 'designer' },
    { x: 240, y: 300, dept: 'designer' },
    { x: 120, y: 470, dept: 'designer' },
    { x: 240, y: 470, dept: 'designer' },
    { x: 360, y: 380, dept: 'designer' },
    // EDIT BAY (5) — center third, rug ~x400-700
    { x: 460, y: 300, dept: 'editor' },
    { x: 580, y: 300, dept: 'editor' },
    { x: 460, y: 470, dept: 'editor' },
    { x: 580, y: 470, dept: 'editor' },
    { x: 680, y: 385, dept: 'editor' },
    // CONTENT (3) — upper-right (kept LEFT of the production strip so the
    // week<3 production tape never engulfs a content desk)
    { x: 790, y: 300, dept: 'content' },
    { x: 900, y: 300, dept: 'content' },
    { x: 790, y: 460, dept: 'content' },
    // PRODUCTION (4) — front-right studio strip (its own clear zone)
    { x: 940,  y: 520, dept: 'production' },
    { x: 1040, y: 520, dept: 'production' },
    { x: 990,  y: 410, dept: 'production' },
    { x: 1090, y: 470, dept: 'production' }
  ];
  var DESK_W = 96, DESK_H = 72;         // drawn 1:1 (native 96x72)
  var CHAR_W = 32, CHAR_H = 48;         // drawn 1:1 (native 32x48)

  var CLUSTERS = [
    { dept: 'designer',   label: 'DESIGN',     x: 180,  y: 250 },
    { dept: 'editor',     label: 'EDIT BAY',   x: 520,  y: 250 },
    { dept: 'content',    label: 'CONTENT',    x: 860,  y: 250 },
    { dept: 'production', label: 'PRODUCTION', x: 1020, y: 372 }
  ];

  // chair colorway per seat (round-robin, like the Startup Panic ref)
  var CHAIR_KEYS = ['chair_r', 'chair_g', 'chair_b'];

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
    // covers seated staffer torso (above), the 96x72 desk, and the chair in front
    return { x: d.x - 52, y: d.y - 70, w: 104, h: 150 };
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

  // dark underlay behind wall-mounted labels so light text stays legible on the
  // new BRIGHT bg (cream walls + pale window glass would otherwise wash it out).
  // measures the text at the given size/font, draws a translucent dark pill.
  function labelChip(ctx, txt, x, y, size, align, silk){
    ctx.font = size + 'px ' + (silk ? "'Silkscreen', monospace" : "'VT323', monospace");
    var w = ctx.measureText(txt).width;
    var padX = 6, padY = 3, h = size + padY;
    var bx = x;
    if(align === 'center') bx = x - w / 2;
    else if(align === 'right') bx = x - w;
    ctx.fillStyle = 'rgba(17,20,29,0.62)';
    ctx.fillRect(Math.round(bx - padX), Math.round(y - size + 1), Math.round(w + padX * 2), Math.round(h));
  }

  function bar(ctx, x, y, w, h, frac, fg, bg){
    ctx.fillStyle = '#000';
    ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.fillStyle = bg || '#16203a';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = fg;
    ctx.fillRect(x, y, Math.round(w * Math.max(0, Math.min(1, frac))), h);
  }

  // ---------- background (fallback = procedural top-down pixel office) ----------
  function drawBackground(ctx){
    if(G.data.hasArt('office_bg_topdown')){
      drawSprite(ctx, 'office_bg_topdown', 0, 0, 1280, 720);
      return;
    }
    // top-down-ish fallback so the no-art build is not a lie (spec D).
    // back wall band y0..150 (two tones), left return wall, then carpet floor.
    ctx.fillStyle = '#e8dcc0'; ctx.fillRect(0, 0, 1280, 110);          // upper wall
    ctx.fillStyle = '#c9b896'; ctx.fillRect(0, 110, 1280, 36);        // skirting
    ctx.fillStyle = '#a89870'; ctx.fillRect(0, 146, 1280, 4);          // wall/floor seam
    ctx.fillStyle = '#d8ccae'; ctx.fillRect(0, 0, 70, 150);           // left return wall
    // carpet floor: blue-grey 2-tone checker (80px tiles)
    for(var ty = 0; ty < 8; ty++){
      for(var tx = 0; tx < 16; tx++){
        ctx.fillStyle = (tx + ty) % 2 ? '#5a6478' : '#545e72';
        ctx.fillRect(tx * 80, 150 + ty * 72, 80, 72);
      }
    }
    // two soft light pools from the window (skewed parallelograms)
    ctx.fillStyle = 'rgba(120,135,165,0.14)';
    ctx.beginPath();
    ctx.moveTo(200, 150); ctx.lineTo(360, 150); ctx.lineTo(300, 430); ctx.lineTo(120, 430);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(420, 150); ctx.lineTo(560, 150); ctx.lineTo(520, 380); ctx.lineTo(360, 380);
    ctx.closePath(); ctx.fill();
    // window frame box (the live sky paints inside via drawWindowSky's fallback)
    ctx.fillStyle = WIN_FRAME_SH; ctx.fillRect(WIN.x - 8, WIN.y - 8, WIN.w + 16, WIN.h + 16);
    ctx.fillStyle = '#aed8f0'; ctx.fillRect(WIN.x, WIN.y, WIN.w, WIN.h);
    // agency board on wall (left)
    ctx.fillStyle = '#16203a'; ctx.fillRect(600, 30, 200, 48);
    ctx.strokeStyle = '#ffe066'; ctx.lineWidth = 3; ctx.strokeRect(601.5, 31.5, 197, 45);
    pxText(ctx, 'CRAVACHE', 620, 60, 18, '#ffe066', 'left', true);
    pxText(ctx, 'estd. monday', 700, 72, 13, '#9fe8ff');
  }

  // ---------- animated window sky ----------
  // The new top-down bg (office_bg_topdown, native 1280x720) bakes the room,
  // walls, wall props and chai counter. We paint a LIVE hour-tinted sky
  // clipped INSIDE the bg's painted 3-pane studio window glass (measured off the
  // art): x 176..356, y 30..96. Clouds, the odd kite, a rare bird; then the
  // mullion grid is redrawn so the panes read. Night = the existing overlay.
  var WIN = { x: 176, y: 30, w: 180, h: 66 };            // glass rect (logical)
  var WIN_MUL_X = [236, 296];                            // vertical mullions (3 panes)
  var WIN_MUL_Y = [63];                                  // horizontal mullion
  var WIN_FRAME = '#b8814a';                              // matches art frame brown
  var WIN_FRAME_SH = '#7a4a21';

  // a few clouds with their own x/speed/size; positions wrap across the glass.
  // y values are RELATIVE to the glass top, kept inside the (shorter) h110 pane.
  var CLOUDS = [
    { y: 6,  speed: 5.0,  w: 40, x0: 0.05 },
    { y: 22, speed: 3.4,  w: 54, x0: 0.55 },
    { y: 40, speed: 6.6,  w: 32, x0: 0.30 }
  ];

  function lerp(a, b, f){ return a + (b - a) * f; }
  function mix(c1, c2, f){
    return 'rgb(' + Math.round(lerp(c1[0], c2[0], f)) + ',' +
                    Math.round(lerp(c1[1], c2[1], f)) + ',' +
                    Math.round(lerp(c1[2], c2[2], f)) + ')';
  }

  // sky as up-to-3 horizontal bands [topColor, midColor, bottomColor] by hour
  function skyBands(hour){
    // day 9..15 bright; 15..17 golden; 17..19 sunset; night = overlay handles dim
    if(hour < 15){
      // flat bright day — matches the art's pale blue
      return [[150, 205, 240], [186, 224, 248], [206, 237, 250]];
    } else if(hour < 17){
      var f = (hour - 15) / 2;                     // -> golden
      return [
        [lerp(150, 122, f), lerp(205, 170, f), lerp(240, 210, f)],
        [lerp(186, 240, f), lerp(224, 198, f), lerp(248, 150, f)],
        [lerp(206, 255, f), lerp(237, 224, f), lerp(250, 150, f)]
      ];
    } else {
      var g = Math.min(1, (hour - 17) / 2);        // -> sunset bands
      return [
        [lerp(122, 90,  g), lerp(170, 90,  g), lerp(210, 140, g)],
        [lerp(240, 255, g), lerp(198, 154, g), lerp(150, 86,  g)],
        [lerp(255, 211, g), lerp(224, 93,  g), lerp(150, 110, g)]
      ];
    }
  }

  function drawWindowSky(ctx){
    var w = WIN;
    var hour = G.time.hour();

    ctx.save();
    ctx.beginPath();
    ctx.rect(w.x, w.y, w.w, w.h);
    ctx.clip();

    // 1) sky gradient as three flat bands (no smooth gradient — keep it pixel)
    var bands = skyBands(hour);
    var bh = w.h / 3;
    for(var b = 0; b < 3; b++){
      ctx.fillStyle = 'rgb(' + Math.round(bands[b][0]) + ',' +
                               Math.round(bands[b][1]) + ',' +
                               Math.round(bands[b][2]) + ')';
      ctx.fillRect(w.x, w.y + b * bh, w.w, Math.ceil(bh) + 1);
    }

    // golden/sunset sun disc low in the sky after 3pm
    if(hour >= 15){
      var sf = Math.min(1, (hour - 15) / 4);
      var sx = w.x + w.w * 0.5;
      var sy = w.y + w.h * (0.35 + sf * 0.45);
      ctx.fillStyle = hour < 17 ? '#fff0b0' : '#ff9a56';
      var sr = 14;
      ctx.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);          // chunky square sun
      ctx.fillStyle = 'rgba(255,224,102,0.30)';
      ctx.fillRect(sx - sr - 4, sy - sr - 4, sr * 2 + 8, sr * 2 + 8);
    }

    // 2) drifting clouds — chunky 3-rect clusters, wrap horizontally
    var cloudCol = hour >= 17 ? 'rgba(255,210,180,0.85)' : 'rgba(255,255,255,0.9)';
    for(var c = 0; c < CLOUDS.length; c++){
      var cl = CLOUDS[c];
      var span = w.w + cl.w + 20;
      var cx = w.x - cl.w - 10 + ((cl.x0 * span + t * cl.speed) % span);
      var cy = w.y + cl.y;
      ctx.fillStyle = cloudCol;
      ctx.fillRect(cx,            cy + 6, cl.w,            10);
      ctx.fillRect(cx + cl.w * 0.18, cy,     cl.w * 0.5,  10);
      ctx.fillRect(cx + cl.w * 0.5,  cy + 3, cl.w * 0.4,  9);
    }

    // 3) a tiny kite drifts across every ~46s (Ahmedabad uttarayan energy)
    var kitePeriod = 46;
    var kp = (t % kitePeriod) / kitePeriod;
    if(kp < 0.62){
      var kf = kp / 0.62;
      var kx = w.x - 24 + kf * (w.w + 48);
      var ky = w.y + 24 + Math.sin(kf * 7) * 14;             // bob on the breeze
      ctx.fillStyle = '#ff5c5c';
      ctx.fillRect(kx,     ky - 5, 5, 5);
      ctx.fillRect(kx - 5, ky,     5, 5);
      ctx.fillRect(kx + 5, ky,     5, 5);
      ctx.fillRect(kx,     ky + 5, 5, 5);
      ctx.fillStyle = '#ffe066';                              // tail
      ctx.fillRect(kx + 1, ky + 10, 2, 2);
      ctx.fillRect(kx + 3, ky + 14, 2, 2);
    }

    // 4) a rare bird pair flaps past every ~70s, 2-frame wings
    var birdPeriod = 70;
    var bp = (t % birdPeriod) / birdPeriod;
    if(bp < 0.5){
      var bf = bp / 0.5;
      var bx = w.x + w.w + 16 - bf * (w.w + 60);              // fly right->left
      var by = w.y + 30 + Math.sin(bf * 5) * 8;
      var up = Math.floor(t * 6) % 2 === 0;
      ctx.fillStyle = hour >= 17 ? '#3a2a30' : '#33414f';
      for(var k = 0; k < 2; k++){
        var ox = bx + k * 18, oy = by + (k ? 6 : 0);
        if(up){ ctx.fillRect(ox - 4, oy - 2, 3, 2); ctx.fillRect(ox + 1, oy - 2, 3, 2); ctx.fillRect(ox - 1, oy, 2, 2); }
        else  { ctx.fillRect(ox - 4, oy, 3, 2);     ctx.fillRect(ox + 1, oy, 3, 2);     ctx.fillRect(ox - 1, oy - 1, 2, 2); }
      }
    }

    ctx.restore();

    // 5) redraw the window frame + mullions over the sky so panes still read
    var i;
    ctx.fillStyle = WIN_FRAME;
    for(i = 0; i < WIN_MUL_X.length; i++) ctx.fillRect(WIN_MUL_X[i] - 3, w.y, 6, w.h);
    for(i = 0; i < WIN_MUL_Y.length; i++) ctx.fillRect(w.x, WIN_MUL_Y[i] - 3, w.w, 6);
    // mullion shading (lower/right edge) for a touch of depth
    ctx.fillStyle = WIN_FRAME_SH;
    for(i = 0; i < WIN_MUL_X.length; i++) ctx.fillRect(WIN_MUL_X[i] + 1, w.y, 2, w.h);
    for(i = 0; i < WIN_MUL_Y.length; i++) ctx.fillRect(w.x, WIN_MUL_Y[i] + 1, w.w, 2);
    // inner frame border (4px) so the sky never bleeds onto the wall edge
    ctx.lineWidth = 5; ctx.strokeStyle = WIN_FRAME;
    ctx.strokeRect(w.x + 0.5, w.y + 0.5, w.w - 1, w.h - 1);
  }


  // ---------- sunset floor warmth (A3/A4 sin fix) ----------
  // After 17:00, multiply a warm overlay across the whole floor so the ROOM
  // reads as sunset, not just the tiny window. Fades up to a cap by ~19:00.
  function drawFloorWarmth(ctx){
    var hour = G.time.hour();
    if(hour < 17 || G.state.night) return;
    var g = Math.min(1, (hour - 17) / 2);
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = 'rgba(255,150,86,' + (0.10 + 0.18 * g) + ')';
    ctx.fillRect(0, 150, 1280, 470);                 // floor only (below the wall)
    ctx.restore();
  }

  // ---------- quotes wall ----------
  var quoteFrames = []; // computed hitboxes for clicks
  // demoted to a single compact strip under the whiteboard (A1): 5 mini frames,
  // not the whole top row anymore. Still clickable to read the framed quote.
  function drawQuotesWall(ctx){
    var quotes = G.state.quotesWall;
    quoteFrames = [];
    var maxFrames = 5;
    var startX = 600, y = 122, fw = 28, fh = 22, gap = 6;
    labelChip(ctx, 'JUST ONE SMALL THING', startX, y - 4, 8, 'left', true);
    pxText(ctx, 'JUST ONE SMALL THING', startX, y - 4, 8, 'rgba(159,232,255,0.8)', 'left', true);
    for(var i = 0; i < maxFrames; i++){
      var x = startX + i * (fw + gap);
      var has = i < quotes.length;
      ctx.fillStyle = '#16203a'; ctx.fillRect(x - 2, y - 2, fw + 4, fh + 4);
      ctx.fillStyle = has ? '#f4e8cf' : '#2a3654';
      ctx.fillRect(x, y, fw, fh);
      ctx.strokeStyle = has ? '#ffe066' : '#1a2440';
      ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, fw - 2, fh - 2);
      if(has){
        pxText(ctx, '“”', x + fw / 2, y + 16, 14, '#7a4a21', 'center');
        quoteFrames.push({ x: x, y: y, w: fw, h: fh, idx: i });
      }
    }
  }

  // ---------- department clusters + desks + staff ----------
  // per-dept rug rect + tint (Two Point Campus discipline: one hue per zone) so
  // the eye parses regions instantly. Rugs drawn under the desks (drawRugs runs
  // before drawDesks); labels + tape drawn by drawClusters after.
  var RUGS = {
    designer:   { x: 56,  y: 256, w: 360, h: 296, tint: 'rgba(120,150,210,0.13)' },
    editor:     { x: 400, y: 256, w: 300, h: 296, tint: 'rgba(210,120,150,0.12)' },
    content:    { x: 744, y: 256, w: 156, h: 270, tint: 'rgba(126,224,138,0.12)' },
    production: { x: 884, y: 360, w: 264, h: 230, tint: 'rgba(255,154,86,0.13)' }
  };

  function deptBounds(dept){
    var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    DESKS.forEach(function(d){
      if(d.dept !== dept) return;
      minX = Math.min(minX, d.x - 50); maxX = Math.max(maxX, d.x + 50);
      minY = Math.min(minY, d.y - 44); maxY = Math.max(maxY, d.y + 50);
    });
    return { minX: minX, maxX: maxX, minY: minY, maxY: maxY };
  }

  function drawRugs(ctx){
    for(var k in RUGS){
      if(!RUGS.hasOwnProperty(k)) continue;
      if(!G.staff.deptUnlocked(k)) continue;     // taped-off zone shows no rug
      var r = RUGS[k];
      ctx.fillStyle = r.tint;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = 'rgba(0,0,0,0.12)';
      ctx.lineWidth = 2;
      ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
    }
  }

  function drawClusters(ctx){
    for(var c = 0; c < CLUSTERS.length; c++){
      var cl = CLUSTERS[c];
      var unlocked = G.staff.deptUnlocked(cl.dept);
      // cluster label sits on the rug's back edge (B4)
      labelChip(ctx, cl.label, cl.x, cl.y, 9, 'center', true);
      pxText(ctx, cl.label, cl.x, cl.y, 9,
             unlocked ? 'rgba(159,232,255,0.92)' : 'rgba(255,92,92,0.85)', 'center', true);
      if(!unlocked){
        // tape off the locked (production) strip, re-derived from new slots
        var bb = deptBounds(cl.dept);
        var minX = bb.minX - 4, maxX = bb.maxX + 4, minY = bb.minY - 4, maxY = bb.maxY + 4;
        ctx.strokeStyle = 'rgba(255,224,102,0.5)';
        ctx.lineWidth = 3;
        ctx.setLineDash([14, 8]);
        ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
        ctx.setLineDash([]);
        labelChip(ctx, 'OPENS WK ' + G.BAL.PRODUCTION_UNLOCK_WEEK, (minX + maxX) / 2, (minY + maxY) / 2, 14, 'center');
        pxText(ctx, 'OPENS WK ' + G.BAL.PRODUCTION_UNLOCK_WEEK, (minX + maxX) / 2, (minY + maxY) / 2, 14, 'rgba(255,224,102,0.95)', 'center');
      }
    }
  }

  // MacBook size per dept: editors get a 15" (wide), everyone else a 13".
  function macKey(st){ return st.dept === 'editor' ? 'mac_15' : 'mac_13'; }

  function drawDesks(ctx){
    var s = G.state;
    for(var i = 0; i < DESKS.length; i++){
      var d = DESKS[i];
      if(!G.staff.deptUnlocked(d.dept)) continue; // taped-off zone draws nothing

      var st = G.staff.atDesk(i);
      var hover = G.dock.dragHoverDesk === i;

      // desk geometry: 96x72 centered on d. top face top ~ d.y-36.
      var dx = d.x - DESK_W / 2;          // 96 wide
      var dyTop = d.y - DESK_H / 2;        // 72 tall

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
      var present = st && !home && !away;
      var working = present && !!st.briefId;

      // 1) floor drop-shadow under the whole workstation (glues it to carpet)
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ellipse(ctx, d.x, d.y + 40, 50, 12);

      // 2) production shoot spotlight cone (under the sprite, over the floor)
      if(working && st.dept === 'production'){
        ctx.fillStyle = 'rgba(255,224,102,0.10)';
        ctx.beginPath();
        ctx.moveTo(d.x - 8, dyTop - CHAR_H - 8);
        ctx.lineTo(d.x - 46, d.y + 20);
        ctx.lineTo(d.x + 46, d.y + 20);
        ctx.closePath(); ctx.fill();
      }

      // 3) seated staffer BEHIND the desk: the desk + lip (drawn next) overlap
      //    their lower body; head + shoulders + upper torso read above the desk
      //    back edge (Startup Panic look). 1:1 scale (32x48). SEAT_Y = sprite
      //    bottom relative to desk centre; ~ desk back-top edge.
      var SEAT_Y = -20;  // sprite bottom 16px into the desk top: head+torso clear it
      if(present){
        var bob = working ? Math.round(Math.sin(t * 7 + i) * 1) : 0;
        var frame = working ? Math.floor(t * 5 + i) % 2 : 0;
        drawSprite(ctx, st.portraitKey, d.x - CHAR_W / 2, d.y + SEAT_Y - CHAR_H + bob, CHAR_W, CHAR_H, frame);
      }
      if(home){
        // desk drawn empty; sleeping note sits above the desk top
        drawSprite(ctx, 'desk_topdown', dx, dyTop, DESK_W, DESK_H);
        labelChip(ctx, 'zzz · home', d.x, dyTop - 6, 12, 'center');
        pxText(ctx, 'zzz · home', d.x, dyTop - 6, 12, 'rgba(159,232,255,0.5)', 'center');
        seatChair(ctx, d, i);
        continue;
      }

      // 4) the desk itself (its monitor-back + front lip occlude the lower body)
      drawSprite(ctx, 'desk_topdown', dx, dyTop, DESK_W, DESK_H);

      // 5) MacBook on the desk top per dept; lid glows teal while working
      if(present){
        var mk = macKey(st);
        var mw = mk === 'mac_15' ? 38 : 30, mh = mk === 'mac_15' ? 28 : 22;
        var mx = d.x - mw / 2, my = dyTop + 14;     // on the desk surface, in front of the body
        drawSprite(ctx, mk, mx, my, mw, mh);
        if(working && Math.floor(t * 6) % 9 !== 8){
          // teal lid glow (replaces the old monitor_on blink)
          ctx.fillStyle = 'rgba(159,232,255,0.30)';
          ctx.fillRect(mx - 2, my - 2, mw + 4, mh + 4);
          ctx.fillStyle = 'rgba(159,232,255,0.55)';
          ctx.fillRect(mx + mw / 2 - 2, my + mh / 2 - 2, 4, 4);
        }
        // production REC dot + flash sit over the desk while shooting
        if(working && st.dept === 'production'){
          if(Math.floor(t * 2) % 2 === 0){
            ctx.fillStyle = '#ff5c5c';
            ctx.fillRect(dx + DESK_W - 16, dyTop + 4, 6, 6);
            pxText(ctx, 'REC', dx + DESK_W - 8, dyTop + 11, 8, '#ff5c5c', 'left', true);
          }
          if((t + i * 0.7) % 3 < 0.12){
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.fillRect(dx - 6, dyTop - CHAR_H, DESK_W + 12, CHAR_H + DESK_H);
          }
        }
      }

      // 6) chair in front of the desk near edge (covers the sprite's feet)
      seatChair(ctx, d, i);

      if(!st){
        // empty desk: faint outline cue so the slot reads as available
        ctx.strokeStyle = 'rgba(159,232,255,0.12)';
        ctx.lineWidth = 2;
        ctx.strokeRect(dx + 1, dyTop + 1, DESK_W - 2, DESK_H - 2);
        continue;
      }
      if(away) continue; // they are at the cooler; drawn in drawWanderers

      // ---- per-staff overlays, ALL ABOVE THE HEAD (B3) ----
      // head top is ~ d.y + SEAT_Y - CHAR_H = d.y - 50. Stack labels above that.
      var headTop = d.y + SEAT_Y - CHAR_H;   // ~ d.y - 50

      // assigned brief: deadline + work bars float highest (d.y-76..-58 region)
      if(st.briefId){
        var b = G.briefs.byId(st.briefId);
        if(b){
          var top = headTop - 38;            // ~ d.y - 76
          var frac = b.deadlineLeft / b.deadlineTotal;
          var col = frac > 0.5 ? '#7ee08a' : (frac > 0.22 ? '#ffe066' : '#ff5c5c');
          pxText(ctx, b.title.length > 18 ? b.title.slice(0, 17) + '…' : b.title, d.x, top - 5, 12, '#f4e8cf', 'center');
          bar(ctx, d.x - 45, top, 90, 6, frac, col);
          var daysleft = (b.deadlineLeft / G.BAL.DAY_REAL_SECONDS);
          var dtxt = daysleft >= 1 ? daysleft.toFixed(1) + 'd' : Math.ceil(daysleft * 10) * 10 + '%';
          var blink = frac < 0.22 && Math.floor(t * 4) % 2 === 0;
          pxText(ctx, dtxt, d.x + 50, top + 6, 13, blink ? '#ff5c5c' : col, 'left');
          bar(ctx, d.x - 45, top + 10, 90, 4, b.workDone / b.workNeeded, '#9fe8ff');
        }
      }

      // nameplate + badge icons + stars + burnout, ALL above the head:
      // the face stays visible, the paperwork floats over it
      var first = st.name.split(' ')[0];
      labelChip(ctx, first, d.x - 6, headTop - 15, 8, 'center', true);
      pxText(ctx, first, d.x - 6, headTop - 15, 8, '#f4e8cf', 'center', true);
      if(st.badges.length){
        ctx.font = '10px serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        ctx.fillText(st.badges.map(function(bd){ return bd.icon; }).join(''), d.x + (first.length * 4), headTop - 14);
      }
      pxText(ctx, '★'.repeat(st.skill), d.x, headTop - 5, 9, '#ffe066', 'center');
      bar(ctx, d.x - 30, headTop - 4, 60, 4,
          st.burnout / 100,
          st.burnout > 75 ? '#ff5c5c' : (st.burnout > 45 ? '#ff9a56' : '#7ee08a'));
      if(st.burnout > 75 && Math.floor(t * 4) % 2 === 0){
        pxText(ctx, '!!', d.x + 38, headTop + 1, 14, '#ff5c5c', 'left');
      }

      // speech bubble: off to the right, above the head stack
      if(st.bubble){
        drawBubble(ctx, d.x + 26, headTop - 44, st.bubble);
      }
    }
  }

  // soft filled ellipse helper (floor shadows)
  function ellipse(ctx, cx, cy, rx, ry){
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // chair in front of the desk near-edge, colorway round-robin per seat index
  function seatChair(ctx, d, i){
    var key = CHAIR_KEYS[i % CHAIR_KEYS.length];
    // chair 40x40, centered on d.x, its back rising in front of the desk lip
    drawSprite(ctx, key, d.x - 20, d.y + 16, 40, 40);
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
      // floor shadow under the standing figure
      ctx.fillStyle = 'rgba(0,0,0,0.20)';
      ellipse(ctx, a.x, a.y + 4, 16, 5);
      drawSprite(ctx, st.portraitKey, a.x - CHAR_W / 2, a.y - CHAR_H + 4, CHAR_W, CHAR_H, frame);
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
  // hotspots aligned to the baked bg (office_bg_topdown) feature positions.
  var HOTSPOTS = {
    chai:    { x: 36,  y: 96,  w: 96,  h: 70 },  // baked left-wall chai counter
    printer: { x: 1010, y: 150, w: 58, h: 56 },  // drawn on a low cabinet (A4)
    window:  { x: 176, y: 30,  w: 180, h: 66 },  // the baked studio window glass
    board:   { x: 80,  y: 26,  w: 72,  h: 68 },  // baked HUSTLE poster (click only)
    tv:      { x: 872, y: 24,  w: 206, h: 68 }   // baked flatscreen on back wall
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
    // plain ink, no pxText shadow: tiny type on light paper smears otherwise.
    // small poster now (A4) — keep the gag, scale the type down to fit 70x60.
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.font = "11px 'Silkscreen', monospace";
    ctx.fillStyle = '#1a1410';
    ctx.fillText('HUSTLE', h.x + h.w / 2, h.y + 28);
    ctx.font = "11px 'VT323', monospace";
    ctx.fillStyle = '#4a3a28';
    ctx.fillText('mandatory', h.x + h.w / 2, h.y + 42);
    ctx.fillText('inspiration', h.x + h.w / 2, h.y + 52);
  }

  // overlay-only: the bg bakes the chai counter + kettle. We add the live steam
  // (while still on offer), a dim wash + a click label for used/available state.
  function drawChaiStation(ctx){
    var s = G.state;
    var h = HOTSPOTS.chai;
    var used = s.chaiDay === s.week * 10 + s.day;
    if(used){
      ctx.fillStyle = 'rgba(13,20,38,0.40)';
      ctx.fillRect(h.x, h.y, h.w, h.h);   // dim the baked counter when spent
    } else {
      // steam rising off the baked kettle spout
      var sy = Math.floor(t * 3) % 3;
      ctx.fillStyle = 'rgba(244,232,207,0.55)';
      ctx.fillRect(h.x + 36, h.y - 4 - sy * 2, 4, 4);
      ctx.fillRect(h.x + 44, h.y - 8 - sy * 2, 4, 4);
    }
    labelChip(ctx, used ? 'CHAI (kal)' : 'CHAI ☕', h.x + h.w / 2, h.y + h.h + 10, 9, 'center', true);
    pxText(ctx, used ? 'CHAI (kal)' : 'CHAI ☕', h.x + h.w / 2, h.y + h.h + 10, 9,
           used ? 'rgba(159,232,255,0.45)' : '#ffe066', 'center', true);
  }

  function drawPrinter(ctx){
    var s = G.state;
    var h = HOTSPOTS.printer;
    // a low cabinet under the printer so it never floats (A4)
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ellipse(ctx, h.x + h.w / 2, h.y + h.h + 14, h.w * 0.7, 8);
    ctx.fillStyle = '#3a4250'; ctx.fillRect(h.x - 6, h.y + h.h - 4, h.w + 12, 18);
    ctx.fillStyle = '#2a3140'; ctx.fillRect(h.x - 6, h.y + h.h - 4, h.w + 12, 4);
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
    // compact live shelf just under the baked framed-pictures row (clear of TV).
    var x0 = 724, y0 = 100, n = Math.min(tr.length, 8);
    labelChip(ctx, 'AWARDS', x0, y0 - 3, 8, 'left', true);
    pxText(ctx, 'AWARDS', x0, y0 - 3, 8, 'rgba(255,224,102,0.7)', 'left', true);
    // shelf plank
    ctx.fillStyle = '#3a2a14'; ctx.fillRect(x0 - 3, y0 + 18, n * 17 + 6, 4);
    for(var i = 0; i < n; i++){
      var x = x0 + i * 17;
      ctx.fillStyle = '#ffe066';
      ctx.fillRect(x + 3, y0 + 2, 9, 8);    // cup
      ctx.fillRect(x + 5, y0 + 10, 5, 4);   // stem
      ctx.fillRect(x + 2, y0 + 14, 11, 3);  // base
      ctx.fillStyle = '#b8860b';
      ctx.fillRect(x + 3, y0 + 7, 9, 2);    // shading band
    }
  }

  // ---------- office TV (wall-mounted, alive) ----------
  // 4 channels cycle every ~5s unless the player clicks to change it. The
  // screen is procedural pixel scenes, kept small + low-key so it reads as
  // ambient background, not a second game.
  // inner-screen rect of the tv_set sprite, in sprite-logical coords (the sprite
  // is drawn at HOTSPOTS.tv.w x .h = 120x80). Measured off the art: the live
  // channel content + scanlines + clip all use SCR, never the full bezel box.
  // inset from the baked flatscreen bezel to the live glass (HOTSPOTS.tv).
  var TV_INSET = 8;

  function drawTV(ctx){
    var h = HOTSPOTS.tv;
    // the bg bakes the bezel + (off) dark screen. We paint the live channel
    // INSIDE that glass, inset from the baked bezel.
    var SCR = { x: h.x + TV_INSET, y: h.y + TV_INSET, w: h.w - TV_INSET * 2, h: h.h - TV_INSET * 2 };

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
    var cx = 355, cy = 18;   // above the studio window (A4)
    // one-frame buzz/flicker: mostly on, occasionally a dim frame
    var flick = Math.floor(t * 9) % 53;
    var on = flick !== 0 && flick !== 1;          // brief 2-frame buzz-out
    var dim = Math.floor(t * 3) % 11 === 0;       // gentle low-power flutter
    var w = 220;
    // backing board (always there, so a dark sign still reads as a sign).
    // slim header sign tucked in the wall strip above the window (A4).
    ctx.fillStyle = '#0c1322';
    ctx.fillRect(cx - w / 2, cy - 12, w, 26);
    ctx.strokeStyle = '#1a2440'; ctx.lineWidth = 2;
    ctx.strokeRect(cx - w / 2 + 1, cy - 11, w - 2, 24);

    ctx.font = "14px 'Silkscreen', monospace";
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';

    if(on){
      // soft glow halo (shadowBlur used sparingly, single pass)
      ctx.save();
      ctx.shadowColor = '#ff9a56';
      ctx.shadowBlur = dim ? 6 : 16;
      ctx.fillStyle = dim ? '#b85c2e' : '#ff9a56';
      ctx.fillText(txt, cx, cy + 5);
      ctx.restore();
      // dark tube outline for that layered glass look
      ctx.lineWidth = 3; ctx.strokeStyle = '#5a2a14';
      ctx.strokeText(txt, cx, cy + 5);
      // bright core
      ctx.fillStyle = dim ? '#ffb27a' : '#ffd9b0';
      ctx.fillText(txt, cx, cy + 5);
      // tube frame
      ctx.strokeStyle = on ? 'rgba(255,154,86,0.55)' : 'rgba(255,154,86,0.15)';
      ctx.lineWidth = 2;
      ctx.strokeRect(cx - w / 2 + 5, cy - 9, w - 10, 20);
    } else {
      // buzzed-out frame: cold dead tube
      ctx.fillStyle = '#3a2418';
      ctx.fillText(txt, cx, cy + 5);
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

  // floor spot for the cooler (A4): right of the content cluster,
  // above the production strip, clear of every desk. unit ~50x80 from top-left.
  var COOLER = { x: 1046, y: 322 };
  G.render.coolerPoint = function(){ return { x: COOLER.x + 24, y: COOLER.y + 66 }; };

  // (cardboard boxes + bin are baked into office_bg_topdown, A4.)

  // optional server-ish rack behind the production cluster (tech vibe, A4).
  function drawServerRack(ctx){
    var rx = 1080, ry = 470;
    ctx.fillStyle = 'rgba(0,0,0,0.20)'; ellipse(ctx, rx + 30, ry + 92, 34, 9);
    ctx.fillStyle = '#1a2030'; ctx.fillRect(rx, ry, 60, 90);
    ctx.fillStyle = '#11161f'; ctx.fillRect(rx + 4, ry + 4, 52, 82);
    for(var u = 0; u < 6; u++){
      ctx.fillStyle = '#2a3346'; ctx.fillRect(rx + 8, ry + 10 + u * 13, 44, 9);
      // blinking activity LEDs
      var on = (Math.floor(t * 3) + u) % 3 === 0;
      ctx.fillStyle = on ? '#7ee08a' : '#1f6a32';
      ctx.fillRect(rx + 46, ry + 12 + u * 13, 3, 3);
      ctx.fillStyle = (u % 2) ? '#ffe066' : '#9fe8ff';
      ctx.fillRect(rx + 40, ry + 12 + u * 13, 3, 3);
    }
  }

  // ---------- props ----------
  // The bg (office_bg_topdown) BAKES the static wall decor: HUSTLE poster,
  // whiteboard, binders, framed pictures, chai counter, cardboard boxes, the
  // (balcony removed). So those procedural draws are gone — we only paint things that are
  // INTERACTIVE (chai click-state, printer cabinet) or LIVE/UPGRADE (TV, cooler,
  // plant, coffee, neon, trophies that accumulate, the production server rack).
  function drawProps(ctx){
    var s = G.state;
    drawServerRack(ctx);
    drawChaiStation(ctx);
    drawPrinter(ctx);
    drawTrophies(ctx);
    if(s.upgrades.coffee) drawSprite(ctx, 'coffee_machine', 132, 96, 46, 64);   // left-wall counter, beside chai
    if(s.upgrades.plant){
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; ellipse(ctx, 168, 558, 26, 7);
      drawSprite(ctx, 'plant', 144, 492, 48, 68);                                // floor corner (A4)
    }
    if(s.upgrades.tv) drawTV(ctx);
    if(s.upgrades.cooler) drawCooler(ctx);
    if(s.upgrades.neon) drawNeon(ctx);
    // phone rings when a call is live (sits on the printer cabinet)
    if(s.activeCall && Math.floor(t * 8) % 2 === 0){
      drawSprite(ctx, 'phone_prop', 1076, 150, 36, 36);
      pxText(ctx, 'RING', 1094, 142, 10, '#ff5c5c', 'center', true);
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
      drawWindowSky(ctx);    // live hour-tinted sky in the studio window
      drawRugs(ctx);         // per-dept floor tints, under the desks
      drawFloorWarmth(ctx);  // sunset warms the FLOOR after 17:00 (A3 fix)
      // night: the office goes dark blue, laptops become the light source
      if(G.state.night){
        ctx.fillStyle = 'rgba(8,12,28,0.52)';
        ctx.fillRect(0, 0, 1280, 720);
        pxText(ctx, '🌙 NIGHT SHIFT', 640, 130, 12, 'rgba(159,232,255,0.7)', 'center', true);
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
