/* trial_homescreen.js — Minecraft-style start screen for CravAche.
   Owns ONLY the animated day->evening->night timelapse sky that fills the
   #start-screen background, plus wiring for the two bottom-row buttons
   (OPTIONS / SOUND). It must never touch the in-game #game canvas: the sky
   loop checks #start-screen visibility every frame and parks itself the moment
   the start screen is hidden (after PUNCH IN), so it cannot steal cycles or
   draw over the office once the game is running.

   Sky technique is lifted from landing_A.html: 4 keyframe skies (morning /
   afternoon / sunset / night), smoothstep cross-faded across a ~22s loop, with
   stars fading in at night and a SUN + CRESCENT MOON on two separate offset
   arcs, all pixelated.

   PERFORMANCE: the window frame, mullions, glass sheen, vignette and the
   distant skyline silhouette are baked ONCE into an offscreen canvas and
   blitted each frame. The sky gradient is cached and only rebuilt when the
   day-cycle moves past a small threshold. Per frame we only redraw the cheap
   animated bits: sky blit, sun, moon, twinkling stars, drifting clouds and the
   night-dependent lit windows. This pulls the loop from ~42 to ~60 FPS. */
(function () {
  function boot() {
    var screen = document.getElementById('start-screen');
    var canvas = document.getElementById('home-sky');
    if (!screen || !canvas) return;

    var x = canvas.getContext('2d');
    x.imageSmoothingEnabled = false;

    var W = 1280, H = 720;

    // --- timelapse helpers (mirrors landing_A.html) ---
    var clock = 0;
    var DAY = 22; // seconds for a full morning->day->sunset->night->loop
    // expose a clock handle so verification can fast-forward the cycle
    window.__homeSky = {
      setClock: function (v) { clock = v; },
      getClock: function () { return clock; },
      get DAY() { return DAY; }
    };

    function lerp(a, b, t) { return a + (b - a) * t; }
    function mixHex(h1, h2, t) {
      var r1 = parseInt(h1.slice(1, 3), 16), g1 = parseInt(h1.slice(3, 5), 16), b1 = parseInt(h1.slice(5, 7), 16);
      var r2 = parseInt(h2.slice(1, 3), 16), g2 = parseInt(h2.slice(3, 5), 16), b2 = parseInt(h2.slice(5, 7), 16);
      return 'rgb(' + Math.round(lerp(r1, r2, t)) + ',' + Math.round(lerp(g1, g2, t)) + ',' + Math.round(lerp(b1, b2, t)) + ')';
    }

    // Each sky is a smooth multi-stop atmosphere: [zenith, upper-mid, mid, lower,
    // horizon-glow]. We feed these through a single vertical linear gradient so the
    // sky reads as real air — deep at the top, easing to a warm/soft glow at the
    // horizon, with no hard horizontal seams.
    var SKIES = [
      // morning — soft dawn: cool indigo zenith easing to a warm peach horizon
      ['#243a72', '#4a5a92', '#8a6a9a', '#d9926e', '#ffc28a'],
      // afternoon — clear deep blue easing to a pale luminous horizon
      ['#1e5fc4', '#3a82dc', '#74aeea', '#aed5f4', '#dcf0ff'],
      // sunset — violet zenith through magenta into a molten orange/pink horizon
      ['#2c2160', '#5a2e74', '#a8466e', '#f47a4c', '#ffc070'],
      // night — deep indigo zenith → dusty blue → faint warm horizon haze
      ['#060a1e', '#0d142f', '#1a2750', '#2c3a64', '#4a4a66']
    ];

    // ---- SUN + MOON FLASH + COLOUR-SHIFT cycle ----
    // Every ~15s both bodies do a gentle brightness FLASH and smoothly migrate
    // to a fresh tint. Every colour move is a ~1s lerp between an rgb FROM and
    // an rgb TO — never a hard cut. We hold three rgb triples per body (cur =
    // what we draw, from/to = endpoints of the active lerp) plus a lerp clock.
    var FLASH_EVERY = 15;     // seconds between events
    var FLASH_DUR = 1.0;      // colour lerp + flash duration (s)
    function rgb(r, g, b) { return [r, g, b]; }
    function rgbStr(c) { return 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')'; }
    // candidate tints to cross-fade between (warm/cool variations)
    var SUN_TINTS = [rgb(255, 240, 188), rgb(255, 198, 120), rgb(255, 226, 150), rgb(255, 250, 224), rgb(255, 180, 120)];
    var MOON_TINTS = [rgb(238, 243, 255), rgb(214, 226, 255), rgb(255, 244, 224), rgb(226, 236, 255), rgb(208, 248, 240)];
    var sunTint = { cur: SUN_TINTS[0].slice(), from: SUN_TINTS[0].slice(), to: SUN_TINTS[0].slice() };
    var moonTint = { cur: MOON_TINTS[0].slice(), from: MOON_TINTS[0].slice(), to: MOON_TINTS[0].slice() };
    var lerpT = 1;            // 0..1 progress of the active colour lerp (1 = settled)
    var flashT = 1;           // 0..1 progress of the active flash envelope (1 = settled)
    var lastFlashIdx = -1;    // which 15s bucket we last fired in
    var tintIdx = 0;
    // advance the flash/colour state from the global clock; called once/frame.
    function updateFlash(dt) {
      var bucket = Math.floor(clock / FLASH_EVERY);
      if (bucket !== lastFlashIdx) {
        lastFlashIdx = bucket;
        tintIdx = (tintIdx + 1) % SUN_TINTS.length;
        sunTint.from = sunTint.cur.slice(); sunTint.to = SUN_TINTS[tintIdx].slice();
        moonTint.from = moonTint.cur.slice(); moonTint.to = MOON_TINTS[tintIdx].slice();
        lerpT = 0; flashT = 0;
      }
      if (lerpT < 1) {
        lerpT = Math.min(1, lerpT + dt / FLASH_DUR);
        var s = lerpT * lerpT * (3 - 2 * lerpT); // smoothstep
        for (var k = 0; k < 3; k++) {
          sunTint.cur[k] = lerp(sunTint.from[k], sunTint.to[k], s);
          moonTint.cur[k] = lerp(moonTint.from[k], moonTint.to[k], s);
        }
      }
      if (flashT < 1) flashT = Math.min(1, flashT + dt / FLASH_DUR);
    }
    // flash brightness multiplier: a soft single pulse (sin hump) easing back to 1.
    function flashMul() {
      if (flashT >= 1) return 1;
      return 1 + 0.55 * Math.sin(flashT * Math.PI);
    }

    // stars (normalised 0..1 within the upper sky)
    var stars = [];
    for (var i = 0; i < 64; i++) stars.push({ x: Math.random(), y: Math.random() * 0.78 });

    // drifting clouds (normalised)
    var clouds = [];
    for (i = 0; i < 7; i++) clouds.push({ x: Math.random(), y: 0.12 + Math.random() * 0.46, w: 60 + Math.random() * 90, sp: 0.005 + Math.random() * 0.009 });

    function glow(cx, cy, r, col, a) {
      var g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, col + a + ')'); g.addColorStop(1, col + '0)');
      x.save(); x.globalCompositeOperation = 'lighter'; x.fillStyle = g; x.fillRect(cx - r, cy - r, r * 2, r * 2); x.restore();
    }

    var horizonY = H * 0.74;         // where land meets sky

    function dayState() {
      var f = ((clock % DAY) + DAY) % DAY / DAY; // 0..1 through the day (never negative)
      var seg = f * 4;
      var i0 = ((Math.floor(seg) % 4) + 4) % 4, i1 = (i0 + 1) % 4, tt = seg - Math.floor(seg);
      var s = tt * tt * (3 - 2 * tt);       // smoothstep
      // cross-fade all 5 atmospheric stops between the two active keyframe skies
      var sky = [];
      for (var k = 0; k < 5; k++) sky.push(mixHex(SKIES[i0][k], SKIES[i1][k], s));
      var night = 0;
      if (i0 === 3) night = 1 - s;          // night -> morning
      else if (i1 === 3) night = s;         // evening -> night
      night = Math.max(0, Math.min(1, night));

      // -------- SUN and MOON as TWO SEPARATE bodies on offset arcs --------
      // A single phase angle p (0..1) drives the whole sky. The sun rides a
      // bright daytime arc; the moon rides the SAME arc shape but offset by
      // half a cycle, so when the sun is high (day) the moon is low/below the
      // horizon, and at night the moon is high while the sun has set.
      // Each body's y dips below the bottom of the stage when it's "set".
      var sunP = f;            // sun phase
      var moonP = (f + 0.5) % 1; // moon trails the sun by half the day
      // arc(p): x sweeps left->right across the visible cycle, y is a tall arch
      // that rises well above the horizon at the apex and sinks below the stage
      // floor when the body is down. amp 360 + base 760 means the apex sits high
      // (~y 400) and the trough sinks to ~y 1120 (off-screen, below the sill).
      function arcX(p) { return 150 + p * (W - 300); }
      function arcY(p) { return 760 - Math.sin(p * Math.PI) * 360; }
      var sun = { x: arcX(sunP), y: arcY(sunP) };
      var moon = { x: arcX(moonP), y: arcY(moonP) };

      // LUMINANCE cross-fade: brightness tracks the day factor. During the day
      // the sun is at full glow and the moon is a faint ghost; at night the moon
      // is bright and the sun is gone/dim. dayAmt = 1 in full day, 0 at full night.
      var dayAmt = 1 - night;
      var sunLum = dayAmt;             // sun bright by day, dim by night
      var moonLum = night;            // moon bright by night, faint by day

      return {
        sky: sky, night: night, isNight: night > 0.5,
        sun: sun, moon: moon, sunLum: sunLum, moonLum: moonLum,
        dayAmt: dayAmt, f: f
      };
    }

    // ---- CLEAN CRESCENT MOON via clipped shadow disc ----
    // Draw the lit moon disc, then CLIP to the moon circle and paint a
    // sky-coloured shadow disc offset AWAY from the sun *inside the clip*. The
    // clip guarantees the shadow's outer rim can never spill over the sky as a
    // second visible circle — only the leftover sliver inside the moon's own
    // disc remains, a clean crescent whose lit edge faces the sun. A few subtle
    // craters are stippled on the lit part. Still no per-pixel work.
    var craters = [
      { a: 0.20, rd: 0.34, s: 0.22 }, { a: -0.55, rd: 0.50, s: 0.15 },
      { a: 1.05, rd: 0.46, s: 0.13 }, { a: -1.30, rd: 0.28, s: 0.17 },
      { a: 0.65, rd: 0.62, s: 0.11 }
    ];
    function drawCrescentMoon(mx, my, r, sunx, suny, lum, tint, skyShadow) {
      // direction FROM moon TO sun (the lit side faces this way)
      var dx = sunx - mx, dy = suny - my;
      var d = Math.sqrt(dx * dx + dy * dy) || 1;
      var ux = dx / d, uy = dy / d;
      // shadow disc pushed AWAY from the sun. offset ~0.62r => fat, readable
      // crescent. shadow radius == r so its arc reads as the moon's own limb.
      var off = r * 0.62;
      var sx = mx - ux * off, sy = my - uy * off;

      // faint outer halo, brighter at night, lightly tinted
      glow(mx, my, r * 3.0, 'rgba(214,226,255,', (lum * 0.26).toFixed(3));
      glow(mx, my, r * 1.7, 'rgba(236,242,255,', (lum * 0.40).toFixed(3));

      var bodyA = (0.30 + 0.70 * lum);
      x.save();
      // CLIP to the moon disc — nothing drawn after this can leave the circle.
      x.beginPath(); x.arc(mx, my, r, 0, Math.PI * 2); x.clip();

      // 1) lit moon body (tinted toward the active moon colour)
      x.globalAlpha = bodyA;
      x.fillStyle = tint;
      x.fillRect(mx - r, my - r, r * 2, r * 2);

      // 2) subtle craters on the lit part (slightly darker than the body),
      //    placed before the shadow so any that fall in shadow vanish naturally.
      x.globalAlpha = bodyA * 0.30;
      x.fillStyle = 'rgba(120,134,168,1)';
      for (var ci = 0; ci < craters.length; ci++) {
        var cr = craters[ci];
        // bias craters toward the lit (sun-facing) side so they're visible
        var cux = ux * Math.cos(cr.a) - uy * Math.sin(cr.a);
        var cuy = ux * Math.sin(cr.a) + uy * Math.cos(cr.a);
        var cxp = mx + cux * r * cr.rd, cyp = my + cuy * r * cr.rd;
        x.beginPath(); x.arc(cxp, cyp, r * cr.s, 0, Math.PI * 2); x.fill();
      }

      // 3) carve the crescent: sky-coloured shadow disc offset away from sun.
      //    Its outer edge is clipped to the moon, so only a clean crescent of
      //    the lit body survives — no second circle over the sky.
      x.globalAlpha = bodyA;
      x.fillStyle = skyShadow;
      x.beginPath(); x.arc(sx, sy, r, 0, Math.PI * 2); x.fill();
      x.restore();
    }

    // ---------------- STATIC OFFSCREEN LAYER (baked once) ----------------
    // Window frame, mullion bars, glass sheen, vignette and the distant skyline
    // silhouette never change frame-to-frame, so we render them ONCE here and
    // blit the whole sheet each frame. Only the night-dependent lit windows are
    // re-stamped live (cheap rects) on top of the sky.
    var FRAME = 26;                      // outer frame thickness
    var GX = [320, 640, 960];            // vertical mullion centres (4 panes wide)
    var GY = [360];                      // horizontal mullion centre (2 panes tall)
    function uiFade(px, py) {
      var inX = px > 300 && px < 980;    // logo/buttons column
      var inY = py > 60 && py < 560;
      return (inX && inY) ? 0.16 : 0.62; // dim where it would cross the UI
    }

    // skyline silhouette geometry (shared by static bake + live window glow)
    var SKYLINE = [[20, 70], [120, 110], [250, 56], [360, 130], [520, 64], [650, 150], [820, 78], [960, 120], [1120, 66], [1230, 100]];

    var staticCanvas = document.createElement('canvas');
    staticCanvas.width = W; staticCanvas.height = H;
    var sx2 = staticCanvas.getContext('2d');
    sx2.imageSmoothingEnabled = false;

    function bakeStatic() {
      var c = sx2;
      c.clearRect(0, 0, W, H);

      // --- distant hazy skyline silhouette (fixed neutral atmospheric tone) ---
      // We bake the silhouette + haze veil at a neutral mid tint. The lit
      // windows (which pulse with night) are drawn live on the main canvas.
      var cr = 30, cg = 36, cb = 58;
      c.fillStyle = 'rgba(' + cr + ',' + cg + ',' + cb + ',0.78)';
      for (var i = 0; i < SKYLINE.length; i++) c.fillRect(SKYLINE[i][0], H - SKYLINE[i][1], 100, SKYLINE[i][1]);
      var hzv = c.createLinearGradient(0, H - 150, 0, H - 40);
      hzv.addColorStop(0, 'rgba(' + cr + ',' + cg + ',' + cb + ',0)');
      hzv.addColorStop(1, 'rgba(' + (cr + 20) + ',' + (cg + 20) + ',' + (cb + 24) + ',0.28)');
      c.fillStyle = hzv; c.fillRect(0, H - 150, W, 110);

      // --- glass sheen: faint diagonal reflection streaks ---
      c.save();
      c.globalCompositeOperation = 'lighter';
      var gl = c.createLinearGradient(0, 0, W, H);
      gl.addColorStop(0.00, 'rgba(255,255,255,0)');
      gl.addColorStop(0.30, 'rgba(255,255,255,0.05)');
      gl.addColorStop(0.40, 'rgba(255,255,255,0.10)');
      gl.addColorStop(0.46, 'rgba(255,255,255,0.02)');
      gl.addColorStop(0.62, 'rgba(255,255,255,0.07)');
      gl.addColorStop(0.70, 'rgba(255,255,255,0.13)');
      gl.addColorStop(0.76, 'rgba(255,255,255,0.02)');
      gl.addColorStop(1.00, 'rgba(255,255,255,0)');
      c.fillStyle = gl; c.fillRect(0, 0, W, H);
      c.restore();

      // --- vignette (linear + radial) ---
      var vg = c.createLinearGradient(0, 0, 0, H);
      vg.addColorStop(0, 'rgba(5,7,15,0.40)'); vg.addColorStop(0.4, 'rgba(5,7,15,0)');
      vg.addColorStop(0.7, 'rgba(5,7,15,0)'); vg.addColorStop(1, 'rgba(5,7,15,0.50)');
      c.fillStyle = vg; c.fillRect(0, 0, W, H);
      var rv = c.createRadialGradient(640, 360, 360, 640, 360, 820);
      rv.addColorStop(0, 'rgba(5,7,15,0)'); rv.addColorStop(1, 'rgba(5,7,15,0.45)');
      c.fillStyle = rv; c.fillRect(0, 0, W, H);

      // --- mullion bars ---
      var MUL = 8, INSET = FRAME;
      for (i = 0; i < GX.length; i++) {
        var cx = GX[i];
        for (var yy = INSET; yy < H - INSET; yy += 20) {
          var a = uiFade(cx, yy + 10);
          c.fillStyle = 'rgba(24,30,52,' + a + ')';
          c.fillRect(cx - MUL / 2, yy, MUL, 20);
          c.fillStyle = 'rgba(74,90,122,' + (a * 0.55).toFixed(3) + ')';
          c.fillRect(cx - MUL / 2, yy, 2, 20);
        }
      }
      for (i = 0; i < GY.length; i++) {
        var cy = GY[i];
        for (var xx = INSET; xx < W - INSET; xx += 20) {
          var ah = uiFade(xx + 10, cy);
          c.fillStyle = 'rgba(24,30,52,' + ah + ')';
          c.fillRect(xx, cy - MUL / 2, 20, MUL);
          c.fillStyle = 'rgba(74,90,122,' + (ah * 0.55).toFixed(3) + ')';
          c.fillRect(xx, cy - MUL / 2, 20, 2);
        }
      }

      // --- outer window frame ---
      var fOut = '#202842', fIn = '#3a4a6a', fLit = '#586a92';
      c.fillStyle = fOut;
      c.fillRect(0, 0, W, FRAME);
      c.fillRect(0, H - FRAME, W, FRAME);
      c.fillRect(0, 0, FRAME, H);
      c.fillRect(W - FRAME, 0, FRAME, H);
      c.fillStyle = fIn;
      c.fillRect(FRAME - 5, FRAME - 5, W - 2 * (FRAME - 5), 4);
      c.fillRect(FRAME - 5, H - FRAME + 1, W - 2 * (FRAME - 5), 4);
      c.fillRect(FRAME - 5, FRAME - 5, 4, H - 2 * (FRAME - 5));
      c.fillRect(W - FRAME + 1, FRAME - 5, 4, H - 2 * (FRAME - 5));
      c.fillStyle = fLit;
      c.fillRect(FRAME - 5, FRAME - 5, W - 2 * (FRAME - 5), 1);
    }
    bakeStatic();

    // ---------------- SKY GRADIENT CACHE ----------------
    // Rebuilding a 5-stop linear gradient every frame is wasteful: the sky
    // barely changes between adjacent frames. We cache the gradient and only
    // rebuild it when the day factor f moves past a small threshold.
    var skyGradCache = null, skyGradF = -999;
    var SKY_THRESH = 0.0015;             // ~ rebuild a few dozen times per day loop
    function getSkyGradient(ds) {
      if (skyGradCache && Math.abs(ds.f - skyGradF) < SKY_THRESH) return skyGradCache;
      var sg = x.createLinearGradient(0, 0, 0, horizonY + 40);
      sg.addColorStop(0.00, ds.sky[0]);
      sg.addColorStop(0.34, ds.sky[1]);
      sg.addColorStop(0.60, ds.sky[2]);
      sg.addColorStop(0.84, ds.sky[3]);
      sg.addColorStop(1.00, ds.sky[4]);
      skyGradCache = sg; skyGradF = ds.f;
      return sg;
    }

    function draw() {
      var ds = dayState();

      // 1) SKY — cached vertical gradient blit.
      x.fillStyle = getSkyGradient(ds);
      x.fillRect(0, 0, W, H);

      var dayAmt = ds.dayAmt;
      var fm = flashMul();              // shared gentle brightness pulse (1..~1.55)

      // 2a) SUN — bright disc + layered glow halo; luminance fades with day,
      // tint smoothly lerps between palettes, brightness flashes every ~15s.
      if (ds.sunLum > 0.02) {
        var sunCol = rgbStr(sunTint.cur);
        glow(ds.sun.x, ds.sun.y, 200, 'rgba(255,200,110,', (Math.min(0.6, 0.30 * ds.sunLum * fm)).toFixed(3));
        glow(ds.sun.x, ds.sun.y, 95, 'rgba(255,232,160,', (Math.min(0.9, 0.55 * ds.sunLum * fm)).toFixed(3));
        x.save();
        x.globalAlpha = Math.min(1, (0.35 + 0.65 * ds.sunLum) * fm);
        x.fillStyle = sunCol;
        x.fillRect(ds.sun.x - 21, ds.sun.y - 21, 42, 42);
        x.restore();
      }

      // 2b) MOON — clean clipped crescent; lit edge faces the sun, brightness
      // rises at night, tint lerps + flashes in step with the sun.
      if (ds.moonLum > 0.02 || ds.moon.y < horizonY + 80) {
        drawCrescentMoon(ds.moon.x, ds.moon.y, 24, ds.sun.x, ds.sun.y,
          Math.min(1, ds.moonLum * fm), rgbStr(moonTint.cur), ds.sky[1]);
      }

      // 3) twinkling stars (fade in/out with the day cycle)
      if (ds.night > 0.02) {
        for (var i = 0; i < stars.length; i++) {
          var tw = (Math.sin(clock * 2 + i * 1.7) + 1) / 2;
          x.fillStyle = 'rgba(222,232,255,' + (ds.night * (0.18 + tw * 0.62)).toFixed(3) + ')';
          x.fillRect(stars[i].x * W, stars[i].y * 520, 2, 2);
        }
      }

      // 4) gentle drifting clouds, tinted toward the current sky horizon glow
      if (dayAmt > 0.05) {
        var cloudCol = ds.sky[4];
        for (i = 0; i < clouds.length; i++) {
          var cl = clouds[i];
          var px = ((cl.x + clock * cl.sp) % 1.25 - 0.12) * W;
          var py = cl.y * 440 + 30;
          x.save(); x.globalAlpha = 0.30 * dayAmt;
          x.fillStyle = cloudCol;
          x.fillRect(px, py, cl.w, 12);
          x.fillRect(px + 20, py - 9, cl.w - 44, 12);
          x.fillRect(px + 8, py + 11, cl.w - 16, 6);
          x.restore();
        }
      }

      // 5) STATIC SHEET — frame, mullions, glass sheen, vignette, skyline
      // silhouette — blitted in one draw call instead of rebuilt.
      x.drawImage(staticCanvas, 0, 0);

      // 6) lit windows + blinking aircraft light (night-dependent, cheap rects)
      x.fillStyle = 'rgba(255,224,102,' + (0.18 + 0.5 * ds.night).toFixed(2) + ')';
      for (i = 0; i < SKYLINE.length; i++) {
        for (var wy = 0; wy < SKYLINE[i][1] - 18; wy += 18) {
          if ((i * 7 + wy) % 36 === 0) x.fillRect(SKYLINE[i][0] + 18, H - SKYLINE[i][1] + 12 + wy, 6, 6);
          if ((i * 13 + wy) % 36 === 0) x.fillRect(SKYLINE[i][0] + 58, H - SKYLINE[i][1] + 12 + wy, 6, 6);
        }
      }
      if (Math.floor(clock * 2) % 2 === 0) { x.fillStyle = '#ff5c5c'; x.fillRect(650 + 46, H - 150, 4, 4); }
    }

    var last = performance.now();
    function frame(now) {
      // park entirely once the game has started (start screen hidden)
      if (!screen.classList.contains('hidden')) {
        var dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
        clock += dt;
        updateFlash(dt);
        draw();
        last = now;
        requestAnimationFrame(frame);
      } else {
        // stop the loop cleanly when the start screen is hidden (game running)
        last = now;
      }
    }
    requestAnimationFrame(frame);

    // --- bottom-row buttons (Minecraft Options... / Quit Game analog) ---
    // OPTIONS -> open the pause/settings menu if the game exposes one; safe no-op otherwise.
    var opt = document.getElementById('btn-options');
    if (opt) {
      opt.addEventListener('click', function () {
        try { if (window.G && G.audio && G.audio.click) G.audio.click(); } catch (e) {}
        try {
          if (window.G && G.modals && G.modals.showPauseMenu && G.state && G.state.running) {
            G.modals.showPauseMenu();
          }
        } catch (e) {}
      });
    }

    // SOUND -> mute/unmute toggle on the audio engine; reflects state in the label.
    var snd = document.getElementById('btn-sound');
    if (snd) {
      function paintSound() {
        var m = false;
        try { m = !!(window.G && G.audio && G.audio.isMuted && G.audio.isMuted()); } catch (e) {}
        snd.textContent = m ? 'SOUND: OFF' : 'SOUND: ON';
      }
      snd.addEventListener('click', function () {
        try {
          if (window.G && G.audio && G.audio.setMuted) {
            var m = G.audio.isMuted ? G.audio.isMuted() : false;
            G.audio.unlock && G.audio.unlock();
            G.audio.setMuted(!m);
            if (window.G.state) G.state.muted = !m;
            if (!(!m) && G.audio.click) G.audio.click();
          }
        } catch (e) {}
        paintSound();
      });
      paintSound();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
