/* trial_homescreen.js — Minecraft-style start screen for CravAche.
   Owns ONLY the animated day->evening->night timelapse sky that fills the
   #start-screen background, plus wiring for the two bottom-row buttons
   (OPTIONS / SOUND). It must never touch the in-game #game canvas: the sky
   loop checks #start-screen visibility every frame and parks itself the moment
   the start screen is hidden (after PUNCH IN), so it cannot steal cycles or
   draw over the office once the game is running.

   Sky technique is lifted from landing_A.html: 4 keyframe skies (morning /
   afternoon / sunset / night), smoothstep cross-faded across a ~20s loop, with
   stars fading in at night and a sun/moon arcing across, all pixelated. */
(function () {
  function boot() {
    var screen = document.getElementById('start-screen');
    var canvas = document.getElementById('home-sky');
    if (!screen || !canvas) return;

    var x = canvas.getContext('2d');
    x.imageSmoothingEnabled = false;

    // --- timelapse helpers (mirrors landing_A.html) ---
    var clock = 0;
    var DAY = 22; // seconds for a full morning->day->sunset->night->loop

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
      // sun/moon arc — a low, lazy arc that stays near the horizon so its glow
      // pools where the sky warms (it never climbs to the zenith).
      var arc = (f % 0.5) / 0.5;
      var bx = 150 + arc * (1280 - 300);
      var by = 560 - Math.sin(arc * Math.PI) * 230;
      return { sky: sky, night: night, isNight: night > 0.5, bx: bx, by: by, f: f };
    }

    // window framing geometry (full-stage). A chunky outer frame plus a
    // 4-pane-wide x 2-pane-tall mullion grid so the view reads "through glass".
    var FRAME = 26;                      // outer frame thickness
    var GX = [320, 640, 960];            // vertical mullion centres (4 panes wide)
    var GY = [360];                      // horizontal mullion centre (2 panes tall)
    // central UI band (logo + button stack live roughly here); mullions cross it
    // at lowered opacity so they never fight the menu.
    function uiFade(px, py) {
      var inX = px > 300 && px < 980;    // logo/buttons column
      var inY = py > 60 && py < 560;
      return (inX && inY) ? 0.16 : 0.62; // dim where it would cross the UI
    }

    function draw() {
      var ds = dayState();
      var horizonY = 720 * 0.74;         // where land meets sky

      // 1) SMOOTH ATMOSPHERIC SKY — one vertical gradient, 5 stops, no seams.
      var sg = x.createLinearGradient(0, 0, 0, horizonY + 40);
      sg.addColorStop(0.00, ds.sky[0]);
      sg.addColorStop(0.34, ds.sky[1]);
      sg.addColorStop(0.60, ds.sky[2]);
      sg.addColorStop(0.84, ds.sky[3]);
      sg.addColorStop(1.00, ds.sky[4]);
      x.fillStyle = sg; x.fillRect(0, 0, 1280, 720);

      var dayAmt = 1 - ds.night;

      // 2) sun / moon — soft disc with a layered glow halo near the horizon.
      if (ds.isNight) {
        glow(ds.bx, ds.by, 120, 'rgba(210,222,255,', (ds.night * 0.30).toFixed(3));
        glow(ds.bx, ds.by, 60, 'rgba(235,240,255,', (ds.night * 0.55).toFixed(3));
        x.fillStyle = '#e9eeff'; x.fillRect(ds.bx - 17, ds.by - 17, 34, 34);
        x.fillStyle = ds.sky[1]; x.fillRect(ds.bx + 4, ds.by - 10, 10, 10);
      } else {
        var warm = (ds.f < 0.12 || (ds.f > 0.36 && ds.f < 0.5));
        var sunCol = warm ? '#ffbd6c' : '#fff0bc';
        glow(ds.bx, ds.by, 200, 'rgba(255,200,110,', (0.30 * dayAmt).toFixed(3));
        glow(ds.bx, ds.by, 95, 'rgba(255,232,160,', (0.55 * dayAmt).toFixed(3));
        x.fillStyle = sunCol; x.fillRect(ds.bx - 21, ds.by - 21, 42, 42);
      }

      // 3) twinkling stars (fade in/out with the day cycle)
      if (ds.night > 0.02) {
        for (var i = 0; i < stars.length; i++) {
          var tw = (Math.sin(clock * 2 + i * 1.7) + 1) / 2;
          x.fillStyle = 'rgba(222,232,255,' + (ds.night * (0.18 + tw * 0.62)).toFixed(3) + ')';
          x.fillRect(stars[i].x * 1280, stars[i].y * 520, 2, 2);
        }
      }

      // 4) gentle drifting clouds, tinted toward the current sky horizon glow
      if (dayAmt > 0.05) {
        var cloudCol = ds.sky[4];        // pick up the warm/soft horizon tone
        for (i = 0; i < clouds.length; i++) {
          var cl = clouds[i];
          var px = ((cl.x + clock * cl.sp) % 1.25 - 0.12) * 1280;
          var py = cl.y * 440 + 30;
          x.save(); x.globalAlpha = 0.30 * dayAmt;
          x.fillStyle = cloudCol;
          x.fillRect(px, py, cl.w, 12);
          x.fillRect(px + 20, py - 9, cl.w - 44, 12);
          x.fillRect(px + 8, py + 11, cl.w - 16, 6);
          x.restore();
        }
      }

      // 5) DISTANT HAZY SKYLINE — a low silhouette tinted toward the sky, sitting
      // far behind the glass (not a heavy black wall). Mix city base toward the
      // horizon colour so it reads as atmospheric distance.
      var hz = ds.sky[4];
      var hzc = hz.match(/\d+/g) || [120, 120, 140];
      var base = ds.isNight ? 0.55 : 0.42;   // how much of the dark base survives
      var cr = Math.round(lerp(+hzc[0], 16, base));
      var cg = Math.round(lerp(+hzc[1], 20, base));
      var cb = Math.round(lerp(+hzc[2], 34, base));
      x.fillStyle = 'rgba(' + cr + ',' + cg + ',' + cb + ',0.82)';
      var sky = [[20, 70], [120, 110], [250, 56], [360, 130], [520, 64], [650, 150], [820, 78], [960, 120], [1120, 66], [1230, 100]];
      for (i = 0; i < sky.length; i++) { x.fillRect(sky[i][0], 720 - sky[i][1], 100, sky[i][1]); }
      // a soft haze veil over the skyline base, fading up into the sky
      var hzv = x.createLinearGradient(0, 720 - 150, 0, 720 - 40);
      hzv.addColorStop(0, 'rgba(' + cr + ',' + cg + ',' + cb + ',0)');
      hzv.addColorStop(1, 'rgba(' + (cr + 20) + ',' + (cg + 20) + ',' + (cb + 24) + ',0.30)');
      x.fillStyle = hzv; x.fillRect(0, 720 - 150, 1280, 110);
      // lit windows + a blinking aircraft light
      x.fillStyle = 'rgba(255,224,102,' + (0.18 + 0.5 * ds.night).toFixed(2) + ')';
      for (i = 0; i < sky.length; i++) {
        for (var wy = 0; wy < sky[i][1] - 18; wy += 18) {
          if ((i * 7 + wy) % 36 === 0) x.fillRect(sky[i][0] + 18, 720 - sky[i][1] + 12 + wy, 6, 6);
          if ((i * 13 + wy) % 36 === 0) x.fillRect(sky[i][0] + 58, 720 - sky[i][1] + 12 + wy, 6, 6);
        }
      }
      if (Math.floor(clock * 2) % 2 === 0) { x.fillStyle = '#ff5c5c'; x.fillRect(650 + 46, 720 - 150, 4, 4); }

      // ---------- GLASS + WINDOW so it reads as looking THROUGH a window ----------
      // 6) glass sheen: faint diagonal reflection streaks across the panes
      x.save();
      x.globalCompositeOperation = 'lighter';
      var gl = x.createLinearGradient(0, 0, 1280, 720);
      gl.addColorStop(0.00, 'rgba(255,255,255,0)');
      gl.addColorStop(0.30, 'rgba(255,255,255,0.05)');
      gl.addColorStop(0.40, 'rgba(255,255,255,0.10)');
      gl.addColorStop(0.46, 'rgba(255,255,255,0.02)');
      gl.addColorStop(0.62, 'rgba(255,255,255,0.07)');
      gl.addColorStop(0.70, 'rgba(255,255,255,0.13)');
      gl.addColorStop(0.76, 'rgba(255,255,255,0.02)');
      gl.addColorStop(1.00, 'rgba(255,255,255,0)');
      x.fillStyle = gl; x.fillRect(0, 0, 1280, 720);
      x.restore();

      // 7) soft vignette so the logo/buttons read on top + sells the glass depth
      var vg = x.createLinearGradient(0, 0, 0, 720);
      vg.addColorStop(0, 'rgba(5,7,15,0.40)'); vg.addColorStop(0.4, 'rgba(5,7,15,0)');
      vg.addColorStop(0.7, 'rgba(5,7,15,0)'); vg.addColorStop(1, 'rgba(5,7,15,0.50)');
      x.fillStyle = vg; x.fillRect(0, 0, 1280, 720);
      var rv = x.createRadialGradient(640, 360, 360, 640, 360, 820);
      rv.addColorStop(0, 'rgba(5,7,15,0)'); rv.addColorStop(1, 'rgba(5,7,15,0.45)');
      x.fillStyle = rv; x.fillRect(0, 0, 1280, 720);

      // 8) MULLION BARS — thin pixel bars dividing the view into panes. Dimmed
      // where they would cross the centred logo/buttons so the UI stays clean.
      var MUL = 8, INSET = FRAME;
      // verticals
      for (i = 0; i < GX.length; i++) {
        var cx = GX[i];
        // draw in segments so we can fade across the UI band
        for (var yy = INSET; yy < 720 - INSET; yy += 20) {
          var a = uiFade(cx, yy + 10);
          x.fillStyle = 'rgba(24,30,52,' + a + ')';
          x.fillRect(cx - MUL / 2, yy, MUL, 20);
          x.fillStyle = 'rgba(74,90,122,' + (a * 0.55).toFixed(3) + ')';
          x.fillRect(cx - MUL / 2, yy, 2, 20);   // soft highlight edge
        }
      }
      // horizontals
      for (i = 0; i < GY.length; i++) {
        var cy = GY[i];
        for (var xx = INSET; xx < 1280 - INSET; xx += 20) {
          var ah = uiFade(xx + 10, cy);
          x.fillStyle = 'rgba(24,30,52,' + ah + ')';
          x.fillRect(xx, cy - MUL / 2, 20, MUL);
          x.fillStyle = 'rgba(74,90,122,' + (ah * 0.55).toFixed(3) + ')';
          x.fillRect(xx, cy - MUL / 2, 20, 2);
        }
      }

      // 9) OUTER WINDOW FRAME — chunky pixel frame around the stage edges.
      var fOut = '#202842', fIn = '#3a4a6a', fLit = '#586a92';
      x.fillStyle = fOut;
      x.fillRect(0, 0, 1280, FRAME);                 // top
      x.fillRect(0, 720 - FRAME, 1280, FRAME);       // bottom (sill)
      x.fillRect(0, 0, FRAME, 720);                  // left
      x.fillRect(1280 - FRAME, 0, FRAME, 720);       // right
      // inner bevel highlight (light catching the frame edge)
      x.fillStyle = fIn;
      x.fillRect(FRAME - 5, FRAME - 5, 1280 - 2 * (FRAME - 5), 4);
      x.fillRect(FRAME - 5, 720 - FRAME + 1, 1280 - 2 * (FRAME - 5), 4);
      x.fillRect(FRAME - 5, FRAME - 5, 4, 720 - 2 * (FRAME - 5));
      x.fillRect(1280 - FRAME + 1, FRAME - 5, 4, 720 - 2 * (FRAME - 5));
      x.fillStyle = fLit;
      x.fillRect(FRAME - 5, FRAME - 5, 1280 - 2 * (FRAME - 5), 1);
    }

    var last = performance.now();
    function frame(now) {
      // park entirely once the game has started (start screen hidden)
      if (!screen.classList.contains('hidden')) {
        var dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
        clock += dt;
        draw();
      }
      last = now;
      requestAnimationFrame(frame);
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
