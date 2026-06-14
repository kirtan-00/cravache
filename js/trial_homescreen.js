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

    // each sky = [top band, mid band, bottom band]
    var SKIES = [
      ['#2a3a6e', '#7a5a86', '#ffb070'], // morning — warm sunrise
      ['#2f6fd0', '#5aa6e8', '#bfe6ff'], // afternoon — clear blue (golden hour rolls in via cross-fade)
      ['#3a2a66', '#a24a72', '#ff9a56'], // evening — orange/purple sunset
      ['#070b1c', '#0e1738', '#1c2a52']  // night — deep blue
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
      var sky = [
        mixHex(SKIES[i0][0], SKIES[i1][0], s),
        mixHex(SKIES[i0][1], SKIES[i1][1], s),
        mixHex(SKIES[i0][2], SKIES[i1][2], s)
      ];
      var night = 0;
      if (i0 === 3) night = 1 - s;          // night -> morning
      else if (i1 === 3) night = s;         // evening -> night
      night = Math.max(0, Math.min(1, night));
      // sun/moon arc across the whole width
      var arc = (f % 0.5) / 0.5;
      var bx = 60 + arc * (1280 - 120);
      var by = 540 - Math.sin(arc * Math.PI) * 430;
      return { sky: sky, night: night, isNight: night > 0.5, bx: bx, by: by, f: f };
    }

    function draw() {
      var ds = dayState();

      // full-stage sky bands (chunky, flat — fills the entire 1280x720)
      x.fillStyle = ds.sky[0]; x.fillRect(0, 0, 1280, 720 * 0.46);
      x.fillStyle = ds.sky[1]; x.fillRect(0, 720 * 0.46, 1280, 720 * 0.26);
      x.fillStyle = ds.sky[2]; x.fillRect(0, 720 * 0.72, 1280, 720 * 0.28);

      // stars fade in at night
      if (ds.night > 0.02) {
        for (var i = 0; i < stars.length; i++) {
          var tw = (Math.sin(clock * 2 + i * 1.7) + 1) / 2;
          x.fillStyle = 'rgba(220,230,255,' + (ds.night * (0.2 + tw * 0.6)).toFixed(3) + ')';
          x.fillRect(stars[i].x * 1280, stars[i].y * 520, 2, 2);
        }
      }

      // clouds drift in the day, fade at night
      var dayAmt = 1 - ds.night;
      if (dayAmt > 0.05) {
        for (i = 0; i < clouds.length; i++) {
          var cl = clouds[i];
          var px = ((cl.x + clock * cl.sp) % 1.25 - 0.12) * 1280;
          var py = cl.y * 460;
          x.fillStyle = 'rgba(244,244,255,' + (0.24 * dayAmt).toFixed(3) + ')';
          x.fillRect(px, py, cl.w, 12);
          x.fillRect(px + 20, py - 9, cl.w - 44, 12);
        }
      }

      // sun / moon
      if (ds.isNight) {
        glow(ds.bx, ds.by, 70, 'rgba(230,236,255,', (ds.night * 0.5).toFixed(3));
        x.fillStyle = '#e6ecff'; x.fillRect(ds.bx - 18, ds.by - 18, 36, 36);
        x.fillStyle = ds.sky[0]; x.fillRect(ds.bx + 3, ds.by - 11, 11, 11);
      } else {
        var sunCol = (ds.f < 0.12 || (ds.f > 0.38 && ds.f < 0.5)) ? '#ffb060' : '#ffe9b0';
        glow(ds.bx, ds.by, 110, 'rgba(255,210,120,', (0.5 * dayAmt).toFixed(3));
        x.fillStyle = sunCol; x.fillRect(ds.bx - 22, ds.by - 22, 44, 44);
      }

      // chunky pixel-city skyline silhouette across the bottom
      x.fillStyle = 'rgba(7,11,28,0.92)';
      var sky = [[20, 120], [120, 180], [250, 96], [360, 220], [520, 110], [650, 250], [820, 130], [960, 200], [1120, 110], [1230, 170]];
      for (i = 0; i < sky.length; i++) { x.fillRect(sky[i][0], 720 - sky[i][1], 100, sky[i][1]); }
      // lit windows + a blinking aircraft light
      x.fillStyle = 'rgba(255,224,102,' + (0.25 + 0.6 * ds.night).toFixed(2) + ')';
      for (i = 0; i < sky.length; i++) {
        for (var wy = 0; wy < sky[i][1] - 24; wy += 24) {
          if ((i * 7 + wy) % 48 === 0) x.fillRect(sky[i][0] + 18, 720 - sky[i][1] + 14 + wy, 8, 8);
          if ((i * 13 + wy) % 48 === 0) x.fillRect(sky[i][0] + 58, 720 - sky[i][1] + 14 + wy, 8, 8);
        }
      }
      if (Math.floor(clock * 2) % 2 === 0) { x.fillStyle = '#ff5c5c'; x.fillRect(650 + 46, 720 - 250, 4, 4); }

      // soft top + side vignette so the logo/buttons read on top
      var vg = x.createLinearGradient(0, 0, 0, 720);
      vg.addColorStop(0, 'rgba(5,7,15,0.42)'); vg.addColorStop(0.4, 'rgba(5,7,15,0)');
      vg.addColorStop(0.7, 'rgba(5,7,15,0)'); vg.addColorStop(1, 'rgba(5,7,15,0.55)');
      x.fillStyle = vg; x.fillRect(0, 0, 1280, 720);
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
