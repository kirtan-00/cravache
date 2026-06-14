// CravAche — canvas office scene (TRIAL: "cozy night office" art direction).
// Research-driven rework. Three fixes over v16:
//  1) POSE  — staff are drawn SEATED + hunched (procedural), forearms converging
//     on a narrow laptop; the desk is foreground geometry drawn OVER the lower
//     body so you never see legs. Reads as "working at a laptop" even frozen.
//  2) MOTION — body fully anchored (no whole-body bob). Only a 1-2px hand tick on
//     UNEVEN holds, plus blink + head-dip on DESYNCED slow timers. Kills the
//     "vibrating" read (periodic 2-frame flips were the bug).
//  3) LIGHT — each occupied laptop casts a cool blue-white GLOW POOL (additive
//     'lighter' radial, transparent edge) onto the face + desk, plus a tight rim
//     light. The glow is the inviting hook. Active/hover desk glows brightest.
// Public API preserved. Drop-in: trial.html loads THIS instead of office.js.
// Generated seated sprites swap in automatically via key portraitKey+'_seat'.
(function(){
  'use strict';
  window.G = window.G || {};
  G.render = G.render || {};

  // ---- front-on 17-slot layout (4 dept blocks; front-left floor kept clear) ----
  // {x,y} = the DESK CENTRE-TOP anchor. Seated char is drawn behind it; the desk
  // front lip sits below. Spec-fixed coordinates (do not drift).
  var DESKS = [
    // DESIGN (5)
    { x: 110,  y: 300, dept: 'designer' },
    { x: 280,  y: 300, dept: 'designer' },
    { x: 450,  y: 300, dept: 'designer' },
    { x: 110,  y: 450, dept: 'designer' },
    { x: 280,  y: 450, dept: 'designer' },
    // EDIT (5)
    { x: 640,  y: 300, dept: 'editor' },
    { x: 810,  y: 300, dept: 'editor' },
    { x: 450,  y: 450, dept: 'editor' },
    { x: 640,  y: 450, dept: 'editor' },
    { x: 810,  y: 450, dept: 'editor' },
    // CONTENT (3)
    { x: 980,  y: 300, dept: 'content' },
    { x: 1130, y: 300, dept: 'content' },
    { x: 980,  y: 450, dept: 'content' },
    // PRODUCTION (4) — locked until week 3
    { x: 640,  y: 600, dept: 'production' },
    { x: 810,  y: 600, dept: 'production' },
    { x: 980,  y: 600, dept: 'production' },
    { x: 1130, y: 600, dept: 'production' }
  ];
  // DESK_SCALE: shrink each desk's DRAWN size by 20% (0.8) while keeping the grid
  // POSITIONS (d.x/d.y) where they are. Everything that sits on a desk — the
  // seated char, laptop, blue glow, drop hitbox, "empty"/dept labels — is derived
  // from these scaled constants (and SEAT_OVERLAP below), so it all stays aligned.
  var DESK_SCALE = 0.8;
  var DESK_W = Math.round(150 * DESK_SCALE), DESK_H = Math.round(64 * DESK_SCALE); // drawn desk size (front-on)
  var CHAR_W = Math.round(50 * DESK_SCALE), CHAR_H = Math.round(76 * DESK_SCALE);  // staff drawn size (scaled to match)

  // dept cluster labels at the centroid of each block
  var CLUSTERS = [
    { dept: 'designer',   label: 'DESIGN' },
    { dept: 'editor',     label: 'EDIT' },
    { dept: 'content',    label: 'CONTENT' },
    { dept: 'production', label: 'PRODUCTION' }
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
    // wraps the seated char (above the desk) + the desk itself
    return { x: d.x - DESK_W / 2, y: d.y - CHAR_H + 4, w: DESK_W, h: CHAR_H + DESK_H };
  }

  // ---------- sprite helper (THE fallback contract) ----------
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

  // dark pill behind wall/floating labels so light text stays legible on the dark
  // bg. measures the text at the given size/font, draws a translucent dark pill.
  function labelChip(ctx, txt, x, y, size, align, silk){
    ctx.font = size + 'px ' + (silk ? "'Silkscreen', monospace" : "'VT323', monospace");
    var w = ctx.measureText(txt).width;
    var padX = 6, padY = 3, h = size + padY;
    var bx = x;
    if(align === 'center') bx = x - w / 2;
    else if(align === 'right') bx = x - w;
    ctx.fillStyle = 'rgba(6,9,18,0.66)';
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

  // soft filled ellipse helper (floor shadows)
  function ellipse(ctx, cx, cy, rx, ry){
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---------- background: DARK-POP procedural void (no baked bg sprite) ----------
  // "Not a painted room — just color showing the things." Deep near-black navy.
  // Only a faint delineation between an upper wall band and a slightly different
  // floor tone; mostly flat dark. All color comes from window/props/chars/glows.
  var WALL_TOP = '#0a0e1a';     // upper wall (near-black navy)
  var WALL_BOT = '#0c1120';     // lower wall, a touch lifted
  var FLOOR_TOP = '#0e1322';    // floor just below seam (catches a little light)
  var FLOOR_BOT = '#080b15';    // floor far edge — darkest
  var WALL_FLOOR_SEAM = 150;    // y of wall/floor delineation

  function drawBackground(ctx){
    // upper wall band
    var wg = ctx.createLinearGradient(0, 0, 0, WALL_FLOOR_SEAM);
    wg.addColorStop(0, WALL_TOP);
    wg.addColorStop(1, WALL_BOT);
    ctx.fillStyle = wg;
    ctx.fillRect(0, 0, 1280, WALL_FLOOR_SEAM);

    // floor — slightly different tone, darkening toward the bottom
    var fg = ctx.createLinearGradient(0, WALL_FLOOR_SEAM, 0, 720);
    fg.addColorStop(0, FLOOR_TOP);
    fg.addColorStop(1, FLOOR_BOT);
    ctx.fillStyle = fg;
    ctx.fillRect(0, WALL_FLOOR_SEAM, 1280, 720 - WALL_FLOOR_SEAM);

    // faint single delineation line at the seam (the only structural cue)
    ctx.fillStyle = 'rgba(40,52,84,0.55)';
    ctx.fillRect(0, WALL_FLOOR_SEAM - 1, 1280, 2);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, WALL_FLOOR_SEAM + 1, 1280, 3);

    // ATMOSPHERIC DEPTH: ceiling darkens top, floor edges fall off, a centre
    // band stays a touch lifted so the desk zone reads as the focal stage.
    var ceil = ctx.createLinearGradient(0, 0, 0, 120);
    ceil.addColorStop(0, 'rgba(0,0,0,0.55)');
    ceil.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = ceil; ctx.fillRect(0, 0, 1280, 120);
    // side vignette (frames the eye toward centre)
    var vg = ctx.createLinearGradient(0, 0, 1280, 0);
    vg.addColorStop(0,   'rgba(0,0,0,0.45)');
    vg.addColorStop(0.18,'rgba(0,0,0,0)');
    vg.addColorStop(0.82,'rgba(0,0,0,0)');
    vg.addColorStop(1,   'rgba(0,0,0,0.45)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, 1280, 720);
    // faint warm pool spilling from the window onto the back wall + floor
    var lp = ctx.createRadialGradient(WIN.x + WIN.w / 2, WIN.y + WIN.h, 20,
                                      WIN.x + WIN.w / 2, WIN.y + WIN.h, 380);
    lp.addColorStop(0, 'rgba(120,150,210,0.12)');
    lp.addColorStop(1, 'rgba(120,150,210,0)');
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = lp; ctx.fillRect(WIN.x - 240, WIN.y, WIN.w + 480, 500);
    ctx.restore();
  }

  // ---------- ANIMATED WINDOW — true 4-state live sky ----------
  // Framed window on the back wall. Sun/moon arc across the glass over the day,
  // clouds drift and wrap, stars twinkle at night. Clipped to the glass; the
  // mullion grid is redrawn on top so the panes read.
  var WIN = { x: 440, y: 46, w: 459, h: 172 };   // widened +35% to the right (right edge now x=899)
  // vertical mullions split the glass into 3 even panes (recomputed from WIN)
  var WIN_MUL_X = [Math.round(WIN.x + WIN.w / 3), Math.round(WIN.x + 2 * WIN.w / 3)];
  var WIN_MUL_Y = [Math.round(WIN.y + WIN.h / 2)]; // horizontal mullion (mid)
  var WIN_FRAME = '#3a4a6a';                     // cool dark frame (reads on dark wall)
  var WIN_FRAME_SH = '#1a2238';

  var CLOUDS = [
    { y: 0.14, speed: 5.0,  w: 56, x0: 0.05 },
    { y: 0.34, speed: 3.2,  w: 74, x0: 0.55 },
    { y: 0.52, speed: 6.4,  w: 44, x0: 0.30 }
  ];
  // fixed twinkle stars (positions are fractions of the glass)
  var STARS = [
    { x: 0.12, y: 0.16 }, { x: 0.30, y: 0.10 }, { x: 0.48, y: 0.22 },
    { x: 0.66, y: 0.12 }, { x: 0.82, y: 0.28 }, { x: 0.22, y: 0.36 },
    { x: 0.74, y: 0.42 }, { x: 0.40, y: 0.34 }, { x: 0.90, y: 0.18 }
  ];

  function lerp(a, b, f){ return a + (b - a) * f; }
  function rgb(c){ return 'rgb(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ')'; }
  function mixC(a, b, f){ return [lerp(a[0],b[0],f), lerp(a[1],b[1],f), lerp(a[2],b[2],f)]; }

  // ---- celestial flash + colour-shift cycle (sun & moon) ----
  // Every CELESTIAL_PERIOD (~15s) the sun and moon do a gentle brightness FLASH and
  // smoothly TRANSITION to a new tint. ALL changes are lerps (no hard cuts).
  //   - colour: each cycle picks the next tint in CELESTIAL_TINTS; we interpolate
  //     from the previous tint to the new one over the first ~1s of the cycle.
  //   - flash: a short brightness bump at the start of each cycle, eased out (~1s).
  // White tints (mult [1,1,1]) leave the base colour untouched; warm/cool tints
  // gently re-tint the sun/moon. Cheap: a couple of sin/eased scalars per frame.
  var CELESTIAL_PERIOD = 15;          // seconds between flashes
  var CELESTIAL_TINTS = [             // multiplicative tints (per RGB channel)
    [1.00, 1.00, 1.00],              // neutral
    [1.08, 0.98, 0.86],              // warm gold
    [0.90, 0.98, 1.12],              // cool blue
    [1.10, 0.92, 0.96],              // rosy
    [0.96, 1.08, 0.98]               // faint green-white
  ];
  // returns { flash: 0..~0.6 brightness bump, tint:[r,g,b] multiplier } — smooth.
  function celestialFX(){
    var cyc = t / CELESTIAL_PERIOD;
    var idx = Math.floor(cyc);
    var f = cyc - idx;                                  // 0..1 within this cycle
    var prevTint = CELESTIAL_TINTS[((idx - 1) % CELESTIAL_TINTS.length + CELESTIAL_TINTS.length) % CELESTIAL_TINTS.length];
    var curTint  = CELESTIAL_TINTS[idx % CELESTIAL_TINTS.length];
    // smooth colour transition over the first 1s of the cycle (smoothstep)
    var ct = Math.min(1, f * CELESTIAL_PERIOD);         // 0..1 over first second
    ct = ct * ct * (3 - 2 * ct);                        // smoothstep ease
    var tint = mixC(prevTint, curTint, ct);
    // brightness flash: peak at cycle start, eased out over ~1s (no hard cut)
    var fl = f * CELESTIAL_PERIOD;                       // seconds into cycle
    var flash = fl < 1 ? 0.55 * (1 - fl) * (1 - fl) : 0; // quadratic ease-out
    return { flash: flash, tint: tint };
  }
  // apply a per-channel tint multiplier to an [r,g,b] colour, clamped to 255.
  function applyTint(c, tint){
    return [Math.min(255, c[0] * tint[0]), Math.min(255, c[1] * tint[1]), Math.min(255, c[2] * tint[2])];
  }

  // returns { phase, f, top, mid, bot } where phase is morning/afternoon/evening/night
  // and top/mid/bot are the 3 sky band colors. Day = 9..19, night = 19..24.
  function skyState(hour){
    // morning ~6-11, afternoon ~11-16, evening ~16-19, night 19-24
    // game day starts 9 so "morning" reads from 9..11.
    var morning = { top:[245,170,190], mid:[255,200,170], bot:[255,224,180] };
    var afternoon = { top:[ 90,150,225], mid:[130,185,240], bot:[185,220,250] };
    var evening = { top:[ 70, 60,120], mid:[235,120, 80], bot:[255,170, 90] };
    var night   = { top:[  8, 14, 40], mid:[ 14, 22, 56], bot:[ 22, 34, 78] };

    if(hour < 11){
      var f = Math.max(0, (hour - 9) / 2);                 // 9..11 morning->afternoon
      return blend('morning', morning, afternoon, f);
    } else if(hour < 16){
      return blend('afternoon', afternoon, afternoon, 0);
    } else if(hour < 19){
      var g = (hour - 16) / 3;                              // 16..19 afternoon->evening
      return blend('evening', afternoon, evening, g);
    } else {
      var n = Math.min(1, (hour - 19) / 1.5);               // 19..20.5 evening->night
      return blend('night', evening, night, n);
    }
  }
  function blend(phase, a, b, f){
    return {
      phase: phase, f: f,
      top: mixC(a.top, b.top, f),
      mid: mixC(a.mid, b.mid, f),
      bot: mixC(a.bot, b.bot, f)
    };
  }

  // 0..1 progress of the sun/moon arc across the day window (9..24 mapped)
  function dayProgress(hour){
    // sun travels 9..19 (left->right, rising then setting); moon 19..24
    if(hour < 19) return Math.max(0, Math.min(1, (hour - 9) / 10));
    return Math.max(0, Math.min(1, (hour - 19) / 5));
  }

  function drawWindowSky(ctx){
    var w = WIN;
    var hour = G.time.hour();
    var sk = skyState(hour);
    var isNight = sk.phase === 'night';
    var isEvening = sk.phase === 'evening';

    ctx.save();
    ctx.beginPath();
    ctx.rect(w.x, w.y, w.w, w.h);
    ctx.clip();

    // 1) smooth atmospheric sky — one vertical gradient through the existing
    // top/mid/bot tones plus a softened horizon glow, so the old 3-band look is
    // gone. Stays within the clipped glass area; frame/mullions redrawn later.
    var glowC = mixC(sk.bot, isNight ? [40, 40, 60] : [255, 236, 196], isNight ? 0.20 : 0.42);
    var sg = ctx.createLinearGradient(0, w.y, 0, w.y + w.h);
    sg.addColorStop(0.00, rgb(sk.top));
    sg.addColorStop(0.32, rgb(mixC(sk.top, sk.mid, 0.55)));
    sg.addColorStop(0.56, rgb(sk.mid));
    sg.addColorStop(0.80, rgb(mixC(sk.mid, sk.bot, 0.65)));
    sg.addColorStop(1.00, rgb(glowC));
    ctx.fillStyle = sg;
    ctx.fillRect(w.x, w.y, w.w, w.h);
    // faint horizon haze glow pooled at the bottom of the glass
    var hg = ctx.createLinearGradient(0, w.y + w.h * 0.6, 0, w.y + w.h);
    hg.addColorStop(0, 'rgba(' + Math.round(glowC[0]) + ',' + Math.round(glowC[1]) + ',' + Math.round(glowC[2]) + ',0)');
    hg.addColorStop(1, 'rgba(' + Math.round(glowC[0]) + ',' + Math.round(glowC[1]) + ',' + Math.round(glowC[2]) + ',' + (isNight ? 0.18 : 0.34) + ')');
    ctx.fillStyle = hg;
    ctx.fillRect(w.x, w.y + w.h * 0.6, w.w, w.h * 0.4);

    // 2) SUN + MOON as TWO separate bodies, each on its own arc, offset half a
    //    cycle. dayFactor (1=full day .. 0=full night) cross-fades their
    //    brightness so day = bright sun + faint/absent moon, night = bright
    //    crescent moon + sun gone. Both arcs are cheap parabolas (no per-pixel).
    //
    // dayFactor derived from the existing sky phase/blend so the two bodies
    // fade in lock-step with the smooth sky gradient above.
    var dayFactor;
    if(sk.phase === 'morning' || sk.phase === 'afternoon') dayFactor = 1;
    else if(sk.phase === 'evening') dayFactor = 1 - sk.f * 0.65;          // dusk: sun dimming
    else /* night */                dayFactor = Math.max(0, 0.35 - sk.f * 0.35); // -> 0
    var nightFactor = 1 - dayFactor;

    // Sun rides the daytime arc (9..19) left->right; the moon rides the SAME
    // shape but offset half a cycle so it is high when the sun is low.
    function arcPos(prog){
      var ax = w.x + 24 + prog * (w.w - 48);
      // parabola: low at edges, high in the middle
      var ay = w.y + w.h * (0.66 - Math.sin(Math.max(0, Math.min(1, prog)) * Math.PI) * 0.46);
      return { x: ax, y: ay };
    }
    // continuous 0..1 sun progress across the whole visible span (9..24),
    // wrapping so the moon (sun + 0.5) traces the opposite half.
    var sunProg = Math.max(0, Math.min(1, (hour - 9) / 10));   // 9..19 sun across glass
    var moonProg = Math.max(0, Math.min(1, (hour - 17) / 7));  // 17..24 moon across glass
    var sunP = arcPos(sunProg);
    var moonP = arcPos(moonProg);

    // shared flash + tint for sun & moon this frame (smooth, ~15s cycle)
    var fx = celestialFX();

    // ---- SUN (only worth drawing while there's daylight) ----
    if(dayFactor > 0.02){
      var sunBase = isEvening ? [255,138,74] : (sk.phase === 'morning' ? [255,217,138] : [255,242,176]);
      var sunC = applyTint(sunBase, fx.tint);                       // smooth colour shift
      var haloBase = isEvening ? [255,138,74] : [255,240,150];
      var haloC = applyTint(haloBase, fx.tint);
      ctx.save(); ctx.globalAlpha = dayFactor;
      // halo (brightens with the flash)
      ctx.fillStyle = 'rgba(' + Math.round(haloC[0]) + ',' + Math.round(haloC[1]) + ',' + Math.round(haloC[2]) + ',' + (0.30 + fx.flash * 0.5).toFixed(3) + ')';
      ctx.fillRect(sunP.x - 20, sunP.y - 20, 40, 40);
      // disc, lifted toward white by the flash so it gently brightens (no hard cut)
      ctx.fillStyle = rgb(mixC(sunC, [255,255,255], fx.flash));
      ctx.fillRect(sunP.x - 13, sunP.y - 13, 26, 26);   // chunky square sun
      ctx.restore();
    }

    // ---- MOON: a CLEAN CRESCENT, lit edge facing the sun ----
    // Draw the lit disc, then CLIP to the moon circle and draw the sky-coloured
    // shadow disc offset away from the sun INSIDE that clip. Because the shadow is
    // clipped to the moon, its outer edge can never appear over the sky — only a
    // clean crescent remains (no "two circles" read). Craters are drawn on the lit
    // part. Brightness rises with nightFactor; flash/tint shift it smoothly.
    if(nightFactor > 0.04){
      var mr = 13;                       // moon radius
      // unit direction from moon -> sun (where the light comes from)
      var dx = sunP.x - moonP.x, dy = sunP.y - moonP.y;
      var dlen = Math.sqrt(dx * dx + dy * dy) || 1;
      var ux = dx / dlen, uy = dy / dlen;
      // shadow disc pushed AWAY from the sun so the lit limb faces it.
      var shOff = mr * 0.62;             // <r => a fat crescent, not a sliver
      var shx = moonP.x - ux * shOff, shy = moonP.y - uy * shOff;
      // sky colour at the moon's height, for the shadow fill (so the bitten part
      // vanishes seamlessly into the night sky).
      var skyShade = mixC(sk.mid, sk.top, 0.4);
      // lit-moon colour: smooth tint shift + flash lift toward white
      var moonBase = applyTint([230, 236, 255], fx.tint);
      var moonLit = rgb(mixC(moonBase, [255, 255, 255], fx.flash));

      ctx.save(); ctx.globalAlpha = nightFactor;
      // soft halo (brightens with the flash)
      ctx.fillStyle = 'rgba(220,228,255,' + (0.16 + fx.flash * 0.30).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(moonP.x, moonP.y, mr + 6, 0, Math.PI * 2); ctx.fill();
      // lit moon disc
      ctx.fillStyle = moonLit;
      ctx.beginPath(); ctx.arc(moonP.x, moonP.y, mr, 0, Math.PI * 2); ctx.fill();
      // CLIP to the moon circle, then carve the crescent with the shadow disc.
      ctx.save();
      ctx.beginPath(); ctx.arc(moonP.x, moonP.y, mr, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = rgb(skyShade);
      ctx.beginPath(); ctx.arc(shx, shy, mr, 0, Math.PI * 2); ctx.fill();
      // craters on the LIT part (toward the sun side), still inside the clip so
      // they never spill past the moon edge. Subtle, slightly-darker dots.
      ctx.fillStyle = 'rgba(150,160,190,0.45)';
      var cux = ux, cuy = uy;                       // toward the lit limb
      // place a few craters offset toward the lit edge
      var cr = [[cux*5 - cuy*3, cuy*5 + cux*3, 2.2],
                [cux*3 + cuy*4, cuy*3 - cux*4, 1.6],
                [cux*7,        cuy*7,          1.4]];
      for(var ci = 0; ci < cr.length; ci++){
        ctx.beginPath();
        ctx.arc(moonP.x + cr[ci][0], moonP.y + cr[ci][1], cr[ci][2], 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();   // end moon clip
      ctx.restore();   // end alpha
    }

    // 3) night stars (twinkle) + one blinking tower light
    if(isNight){
      for(var s = 0; s < STARS.length; s++){
        var tw = (Math.sin(t * 3 + s * 1.7) + 1) / 2;     // 0..1
        if(tw < 0.25) continue;
        ctx.fillStyle = 'rgba(220,230,255,' + (0.35 + tw * 0.55) + ')';
        ctx.fillRect(w.x + STARS[s].x * w.w, w.y + STARS[s].y * w.h, 2, 2);
      }
      // distant skyline silhouette with one blinking aircraft-warning light
      ctx.fillStyle = '#05070f';
      ctx.fillRect(w.x + 20, w.y + w.h - 30, 22, 30);
      ctx.fillRect(w.x + 60, w.y + w.h - 46, 18, 46);
      ctx.fillRect(w.x + 96, w.y + w.h - 24, 28, 24);
      ctx.fillRect(w.x + 150, w.y + w.h - 40, 22, 40);
      ctx.fillRect(w.x + 190, w.y + w.h - 22, 34, 22);
      if(Math.floor(t * 2) % 2 === 0){
        ctx.fillStyle = '#ff5c5c';
        ctx.fillRect(w.x + 60 + 7, w.y + w.h - 48, 3, 3);  // top of the tall tower
      }
    } else {
      // 4) drifting chunky clouds (afternoon only really pops; faint else)
      var showClouds = sk.phase === 'afternoon' || sk.phase === 'evening';
      if(showClouds){
        var cloudCol = isEvening ? 'rgba(255,200,170,0.80)' : 'rgba(255,255,255,0.9)';
        for(var c = 0; c < CLOUDS.length; c++){
          var cl = CLOUDS[c];
          var span = w.w + cl.w + 24;
          var cx = w.x - cl.w - 12 + ((cl.x0 * span + t * cl.speed) % span);
          var cy = w.y + cl.y * w.h;
          ctx.fillStyle = cloudCol;
          ctx.fillRect(cx,              cy + 7, cl.w,       11);
          ctx.fillRect(cx + cl.w * 0.18, cy,    cl.w * 0.5, 11);
          ctx.fillRect(cx + cl.w * 0.5,  cy + 4, cl.w * 0.4, 10);
        }
      }
    }

    ctx.restore();

    // 5) redraw frame + mullions over the sky so panes still read
    var i;
    ctx.fillStyle = WIN_FRAME;
    for(i = 0; i < WIN_MUL_X.length; i++) ctx.fillRect(WIN_MUL_X[i] - 3, w.y, 6, w.h);
    for(i = 0; i < WIN_MUL_Y.length; i++) ctx.fillRect(w.x, WIN_MUL_Y[i] - 3, w.w, 6);
    ctx.fillStyle = WIN_FRAME_SH;
    for(i = 0; i < WIN_MUL_X.length; i++) ctx.fillRect(WIN_MUL_X[i] + 1, w.y, 2, w.h);
    for(i = 0; i < WIN_MUL_Y.length; i++) ctx.fillRect(w.x, WIN_MUL_Y[i] + 1, w.w, 2);
    // outer frame (chunky) — a real window mounted on the dark wall
    ctx.fillStyle = WIN_FRAME_SH;
    ctx.fillRect(w.x - 10, w.y - 10, w.w + 20, 10);            // top
    ctx.fillRect(w.x - 10, w.y + w.h, w.w + 20, 12);           // sill
    ctx.fillRect(w.x - 10, w.y - 10, 10, w.h + 22);            // left
    ctx.fillRect(w.x + w.w, w.y - 10, 10, w.h + 22);           // right
    ctx.fillStyle = WIN_FRAME;
    ctx.fillRect(w.x - 8, w.y - 8, w.w + 16, 4);
    ctx.fillRect(w.x - 8, w.y + w.h + 2, w.w + 16, 4);
    ctx.lineWidth = 4; ctx.strokeStyle = WIN_FRAME;
    ctx.strokeRect(w.x + 0.5, w.y + 0.5, w.w - 1, w.h - 1);
  }

  // ---------- quotes wall (clickable frames) ----------
  var quoteFrames = [];
  function drawQuotesWall(ctx){
    var quotes = G.state.quotesWall;
    quoteFrames = [];
    var maxFrames = 5;
    var startX = 70, y = 70, fw = 30, fh = 24, gap = 7;
    labelChip(ctx, 'JUST ONE SMALL THING', startX, y - 6, 8, 'left', true);
    pxText(ctx, 'JUST ONE SMALL THING', startX, y - 6, 8, 'rgba(159,232,255,0.8)', 'left', true);
    for(var i = 0; i < maxFrames; i++){
      var x = startX + i * (fw + gap);
      var has = i < quotes.length;
      ctx.fillStyle = '#05070f'; ctx.fillRect(x - 2, y - 2, fw + 4, fh + 4);
      ctx.fillStyle = has ? '#f4e8cf' : '#16203a';
      ctx.fillRect(x, y, fw, fh);
      ctx.strokeStyle = has ? '#ffe066' : '#1a2440';
      ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, fw - 2, fh - 2);
      if(has){
        pxText(ctx, '“”', x + fw / 2, y + 17, 14, '#7a4a21', 'center');
        quoteFrames.push({ x: x, y: y, w: fw, h: fh, idx: i });
      }
    }
  }

  // ---------- department cluster labels + production tape ----------
  function deptBounds(dept){
    var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    DESKS.forEach(function(d){
      if(d.dept !== dept) return;
      minX = Math.min(minX, d.x - DESK_W / 2); maxX = Math.max(maxX, d.x + DESK_W / 2);
      minY = Math.min(minY, d.y - CHAR_H);     maxY = Math.max(maxY, d.y + DESK_H);
    });
    return { minX: minX, maxX: maxX, minY: minY, maxY: maxY };
  }

  // is any desk in this dept currently hovered? (lets a faded label pop back)
  function deptHovered(dept){
    var hd = (G.render.office && G.render.office.hoverDesk);
    if(hd == null || hd < 0) return false;
    var d = DESKS[hd];
    return d && d.dept === dept;
  }

  function drawClusters(ctx){
    // After week 1 the unlocked dept labels are noise — fade them right down
    // (they stay useful for the first week of learning the floor). They pop back
    // to full strength while that cluster is hovered. Locked "OPENS WK n" tape is
    // always kept fully visible — it is still informative.
    var fadeUnlocked = (G.state && G.state.week > 1);
    for(var c = 0; c < CLUSTERS.length; c++){
      var cl = CLUSTERS[c];
      var unlocked = G.staff.deptUnlocked(cl.dept);
      var bb = deptBounds(cl.dept);
      var cx = (bb.minX + bb.maxX) / 2;
      // label sits just under the block on the floor (front edge), out of the way
      var ly = bb.maxY + 18;
      var lblAlpha = 1;
      if(unlocked && fadeUnlocked && !deptHovered(cl.dept)) lblAlpha = 0.35;
      ctx.save();
      ctx.globalAlpha = lblAlpha;
      labelChip(ctx, cl.label, cx, ly, 9, 'center', true);
      pxText(ctx, cl.label, cx, ly, 9,
             unlocked ? 'rgba(159,232,255,0.92)' : 'rgba(255,92,92,0.85)', 'center', true);
      ctx.restore();
      if(!unlocked){
        var minX = bb.minX - 6, maxX = bb.maxX + 6, minY = bb.minY - 6, maxY = bb.maxY + 6;
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

  // ============================================================
  //  SEATED-CHARACTER + LAPTOP-GLOW SYSTEM (the trial rework)
  // ============================================================
  // dept-tinted clothing (dark + low-sat; the screen light defines the edges)
  var DEPT_SHIRT = { designer:'#2a5860', editor:'#3a3460', content:'#5e4824', production:'#5e2e30' };
  var SKIN = ['#7a4a30','#8a5638','#9a6440','#6a4028','#a8744c','#b07c52'];
  var HAIR = ['#15110d','#241a12','#1a1410','#0e0c0a'];

  function hashName(s){ var h=0; for(var k=0;k<s.length;k++) h=(h*31+s.charCodeAt(k))&255; return h; }
  // stable per-staff phase so blink/dip/typing never line up across the room
  function phase(i){ return (i * 2.3994) % 6.2831; }
  // typing tick: irregular 0/1 pattern (uneven holds, not a metronome)
  var TYPE_SEQ = [0,0,1,0,1,1,0,1,0,0,1,1];
  function typingFrame(i){ return TYPE_SEQ[Math.floor(t * 7 + i * 5) % TYPE_SEQ.length]; }

  function lift(hex, amt){
    var r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
    return 'rgb(' + Math.min(255, r+Math.round(amt*0.78)) + ',' +
                    Math.min(255, g+Math.round(amt*0.92)) + ',' +
                    Math.min(255, b+amt) + ')';
  }
  function rrect(ctx,x,y,w,h,r){
    r=Math.min(r,w/2,h/2);
    ctx.beginPath();
    ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); ctx.fill();
  }
  function quad(ctx,x1,y1,x2,y2,x3,y3,x4,y4){
    ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.lineTo(x3,y3);
    ctx.lineTo(x4,y4); ctx.closePath(); ctx.fill();
  }

  // 2.5D desk: dark top band + front face + legs. Sits in the dark, recedes;
  // the laptop glow pool (drawn after) is what lights its surface.
  function draw25Desk(ctx, dx, dyTop){
    var w = DESK_W, h = DESK_H;
    var topBand = Math.round(13 * DESK_SCALE);     // top-surface depth (scaled)
    var legW = Math.round(9 * DESK_SCALE);
    var legH = Math.round(7 * DESK_SCALE);
    var legInset = Math.round(8 * DESK_SCALE);
    ctx.fillStyle = '#241c14'; ctx.fillRect(dx, dyTop, w, topBand);          // top surface (back)
    ctx.fillStyle = '#1a140d'; ctx.fillRect(dx, dyTop + topBand, w, h - topBand); // front face
    ctx.fillStyle = 'rgba(150,180,230,0.10)'; ctx.fillRect(dx, dyTop, w, 2); // cool top edge catch
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(dx, dyTop + topBand - 2, w, 3);   // lip shadow
    ctx.fillStyle = '#120d08';
    ctx.fillRect(dx + legInset, dyTop + h, legW, legH);
    ctx.fillRect(dx + w - legInset - legW, dyTop + h, legW, legH); // legs
  }

  // big soft cool glow pool from a laptop. Additive — only lifts brightness, so
  // it can be drawn AFTER char+desk to light both. radius/strength scale w/ mult.
  function drawDeskGlow(ctx, cx, gy, i, mult){
    var fl = 0.90 + 0.10 * Math.sin(t * 3.2 + phase(i));   // subtle ~10% flicker
    var r = 116 * mult;
    var g = ctx.createRadialGradient(cx, gy, 0, cx, gy, r);
    g.addColorStop(0,    'rgba(155,200,255,' + (0.26 * fl * mult).toFixed(3) + ')');
    g.addColorStop(0.42, 'rgba(98,148,235,'  + (0.12 * fl * mult).toFixed(3) + ')');
    g.addColorStop(1,    'rgba(60,90,180,0)');
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g; ctx.fillRect(cx - r, gy - r, r * 2, r * 2);
    ctx.restore();
  }

  // tight rim light re-lighting the face/chest from the laptop (additive)
  function drawFaceRim(ctx, cx, faceY, i){
    var fl = 0.82 + 0.18 * Math.abs(Math.sin(t * 5 + phase(i)));
    var r = 54;
    var g = ctx.createRadialGradient(cx, faceY, 0, cx, faceY, r);
    g.addColorStop(0, 'rgba(170,208,255,' + (0.20 * fl).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(160,200,255,0)');
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g; ctx.fillRect(cx - r, faceY - r, r * 2, r * 2);
    ctx.restore();
  }

  // a seated, hunched worker drawn BEHIND the desk. midY = desk back edge (dyTop).
  // body is anchored; only hands tap + head dips + eyes blink, all desynced.
  // (Idle/not-working staff get NO illumination now — they sit in the dark; only
  // WORKING staff are lit, by the cool blue laptop glow.)
  function drawSeatedChar(ctx, st, cx, dyTop, i, working){
    // Draw the real pixel-art staff SPRITE, seated behind the desk (committed
    // renderer style). Auto-swap to a dedicated seated sprite when one exists.
    var key = G.data.hasArt(st.portraitKey + '_seat') ? st.portraitKey + '_seat' : st.portraitKey;
    // CALM animation: a slow 2-frame typing flip only (no fast 5Hz flicker), and
    // NO body bob — the laptop glow provides the liveliness, the body stays still.
    var frame = working ? Math.floor(t * 2.4 + i) % 2 : 0;
    var bob = 0;
    var SEAT_OVERLAP = Math.round(32 * DESK_SCALE);   // desk occludes the lower body (scaled with desk)
    drawSprite(ctx, key, cx - CHAR_W/2, dyTop + SEAT_OVERLAP - CHAR_H + bob, CHAR_W, CHAR_H, frame);
  }

  // laptop seen lid-back (worker faces the screen, away from us): a dark lid with
  // a glowing top edge leaking screen light + the Apple logo glowing on the back.
  function drawLaptop(ctx, st, cx, dyTop, i, working){
    // Front-on view: we see the BACK OF THE LID standing upright on the desk.
    // 15" (editor) vs 13" (everyone else). All coords integer + symmetric about cx.
    var editor = (st.dept === 'editor');
    var lw = Math.round((editor ? 44 : 36) * DESK_SCALE);  // lid width (scaled w/ desk)
    var lh = Math.round((editor ? 19 : 16) * DESK_SCALE);  // lid height (short: must NOT cover the seated face)
    var lx = Math.round(cx - lw / 2);   // left edge, snapped & symmetric
    var deckH = 3;                      // keyboard-deck sliver depth
    var hingeH = 2;                     // hinge bar
    // Anchor the WHOLE assembly so it sits flat on the desk: base of deck == dyTop.
    var deckY = Math.round(dyTop - deckH);   // deck sliver rests on desk top
    var hingeY = deckY - hingeH;             // hinge above deck
    var ly = hingeY - lh;                    // lid top
    cx = Math.round(cx);

    // ---- space-gray aluminium palette (3-4 step ramp, flat fills) ----
    var GRAY_HI   = '#54585f'; // top/left highlight edge
    var GRAY_MID  = '#3a3f47'; // body
    var GRAY_LO   = '#2b2f36'; // right edge + lower bevel
    var GRAY_DARK = '#1f2329'; // bottom shade / inner notch

    // ---- LID tilted back from the hinge so it foreshortens + leans away,
    //      revealing the seated face above it ----
    ctx.save();
    ctx.translate(cx, hingeY);
    ctx.transform(1, 0, 0.12, 0.52, 0, 0);   // skewX + scaleY<1 = lean back & foreshorten
    ctx.translate(-cx, -hingeY);
    // Body
    ctx.fillStyle = GRAY_MID;
    ctx.fillRect(lx, ly, lw, lh);
    // Notch the 4 corners by 2px so it reads rounded (carve with darker desk-less holes -> overdraw transparent not possible; instead trim with body bg below)
    // Top-left & top-right highlight edges
    ctx.fillStyle = GRAY_HI;
    ctx.fillRect(lx, ly, lw, 1);        // top edge highlight
    ctx.fillRect(lx, ly, 1, lh);        // left edge highlight
    // Right edge + bottom bevel (darker)
    ctx.fillStyle = GRAY_LO;
    ctx.fillRect(lx + lw - 1, ly, 1, lh);     // right edge
    ctx.fillRect(lx, ly + lh - 1, lw, 1);     // bottom edge
    // Rounded corners: clip 2x2 from each corner back to the dark room tone
    ctx.fillStyle = '#10141b'; // matches dark office back wall so corners read carved
    // top-left
    ctx.fillRect(lx, ly, 2, 1); ctx.fillRect(lx, ly, 1, 2);
    // top-right
    ctx.fillRect(lx + lw - 2, ly, 2, 1); ctx.fillRect(lx + lw - 1, ly, 1, 2);
    // bottom-left
    ctx.fillRect(lx, ly + lh - 1, 2, 1); ctx.fillRect(lx, ly + lh - 2, 1, 2);
    // bottom-right
    ctx.fillRect(lx + lw - 2, ly + lh - 1, 2, 1); ctx.fillRect(lx + lw - 1, ly + lh - 2, 1, 2);

    // ---- HINGE bar (darker, where lid meets deck) ----
    ctx.fillStyle = GRAY_DARK;
    ctx.fillRect(lx + 1, hingeY, lw - 2, hingeH);

    // ---- KEYBOARD DECK sliver in front of hinge (lighter aluminium on desk) ----
    ctx.fillStyle = GRAY_HI;
    ctx.fillRect(lx + 2, deckY, lw - 4, deckH);
    ctx.fillStyle = GRAY_LO;
    ctx.fillRect(lx + 2, deckY + deckH - 1, lw - 4, 1); // deck front shadow line

    // ---- glowing Apple logo, centered on the lid back ----
    var logoFl = working ? (0.78 + 0.22 * Math.abs(Math.sin(t * 4 + phase(i)))) : 1;
    var bright = working
      ? 'rgba(210,228,255,' + (0.92 * logoFl).toFixed(3) + ')'
      : 'rgba(120,134,158,0.42)';
    var acx = cx;                       // apple center x
    var acy = Math.round(ly + lh / 2);  // apple center y
    var s = editor ? 1 : 1;             // 1px unit (apple ~9px tall)
    ctx.fillStyle = bright;
    // body: rounded blob (5 rows), symmetric about acx
    // row offsets from acy: -2..+4 ; widths chosen for an apple silhouette
    ctx.fillRect(acx - 2, acy - 2, 4, 1); // top of body (under leaf)
    ctx.fillRect(acx - 3, acy - 1, 6, 1);
    ctx.fillRect(acx - 3, acy,     6, 1);
    ctx.fillRect(acx - 3, acy + 1, 6, 1);
    ctx.fillRect(acx - 2, acy + 2, 4, 1);
    ctx.fillRect(acx - 2, acy + 3, 4, 1);
    // bite notch on the right (carve with dark body color)
    ctx.fillStyle = GRAY_MID;
    ctx.fillRect(acx + 2, acy - 1, 1, 2);
    // leaf (top), offset right of center stem
    ctx.fillStyle = bright;
    ctx.fillRect(acx, acy - 4, 1, 1);
    ctx.fillRect(acx + 1, acy - 3, 1, 1);
    ctx.restore();   // end lid tilt

    // ---- screen-light leak rising up toward the face (only when working) ----
    if(working){
      var fl = 0.62 + 0.38 * Math.abs(Math.sin(t * 5 + phase(i)));
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // soft RADIAL screen-spill (no hard rectangle) feathering up toward the face
      var gcx = cx, gcy = ly - 1, gr = 30;
      var rg = ctx.createRadialGradient(gcx, gcy, 0, gcx, gcy, gr);
      rg.addColorStop(0, 'rgba(168,206,255,' + (0.24 * fl).toFixed(3) + ')');
      rg.addColorStop(1, 'rgba(150,200,255,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(gcx - gr, gcy - gr, gr * 2, gr * 2);
      ctx.globalCompositeOperation = 'source-over';
      ctx.restore();
    }
  }

  // ---------- desks + seated staff (front-on, v1 feel) ----------
  function drawDesks(ctx){
    var s = G.state;
    for(var i = 0; i < DESKS.length; i++){
      var d = DESKS[i];
      if(!G.staff.deptUnlocked(d.dept)) continue; // taped-off zone draws nothing

      var st = G.staff.atDesk(i);
      var hover = G.dock.dragHoverDesk === i;

      // desk geometry: front-on, centered on d.x, back edge at d.y.
      var dx = d.x - DESK_W / 2;
      var dyTop = d.y;                       // desk top/back edge
      var deskBottom = dyTop + DESK_H;

      // drop highlight (dept-aware)
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

      var home = st && !G.time.onClock(st);
      var away = st && st.away;
      var present = st && !home && !away;
      var working = present && !!st.briefId;

      // 1) floor drop-shadow under the desk (glues it to the floor)
      ctx.fillStyle = 'rgba(0,0,0,0.30)';
      ellipse(ctx, d.x, deskBottom - 2, DESK_W / 2 - 6, 9);

      // 2) production shoot spotlight cone (under the char, over the floor)
      if(working && st.dept === 'production'){
        ctx.fillStyle = 'rgba(255,224,102,0.10)';
        ctx.beginPath();
        ctx.moveTo(d.x - 10, dyTop - CHAR_H - 6);
        ctx.lineTo(d.x - 60, deskBottom);
        ctx.lineTo(d.x + 60, deskBottom);
        ctx.closePath(); ctx.fill();
      }

      // 3) seated staffer BEHIND the desk (procedural; _seat sprite swaps in)
      if(present){
        drawSeatedChar(ctx, st, d.x, dyTop, i, working);
      }

      // 4) the desk (2.5D) — foreground geometry that occludes the lower body
      draw25Desk(ctx, dx, dyTop);

      if(home){
        labelChip(ctx, 'zzz · home', d.x, dyTop - 8, 12, 'center');
        pxText(ctx, 'zzz · home', d.x, dyTop - 8, 12, 'rgba(159,232,255,0.5)', 'center');
        continue;
      }

      if(!st){
        // empty desk: faint outline cue above the desk so the slot reads available
        labelChip(ctx, 'empty', d.x, dyTop - 8, 11, 'center');
        pxText(ctx, 'empty', d.x, dyTop - 8, 11, 'rgba(159,232,255,0.4)', 'center');
        continue;
      }
      if(away) continue; // at the cooler; drawn in drawWanderers

      // 5) laptop + cool screen-glow pool (lights face+desk), then face rim
      if(present){
        var gmult = (G.dock.dragHoverDesk === i) ? 1.18 : 1.0;
        drawLaptop(ctx, st, d.x, dyTop, i, working);
        if(working){
          drawDeskGlow(ctx, d.x, dyTop + 2, i, gmult);   // additive: lifts char+desk (blue laptop glow)
          // face rim tracks the scaled head (head top ≈ dyTop + SEAT_OVERLAP - CHAR_H)
          drawFaceRim(ctx, d.x, dyTop - Math.round(44 * DESK_SCALE), i);  // re-light the lower face (blue)
        }
        // idle (not-working) staff get NO illumination — they sit in the dark.
        if(working && st.dept === 'production' && Math.floor(t * 2) % 2 === 0){
          ctx.fillStyle = '#ff5c5c';
          ctx.fillRect(dx + DESK_W - 20, dyTop + 6, 7, 7);
          pxText(ctx, 'REC', dx + DESK_W - 11, dyTop + 14, 9, '#ff5c5c', 'left', true);
        }
      }

      // ---- per-staff overlays, ALL ABOVE THE HEAD ----
      // DECLUTTER: calm default = stars + one merged bar (+ burnout only if high).
      // Hover reveals name, brief title, deadline number, badges.
      // just above the scaled sprite head (head top ≈ dyTop + SEAT_OVERLAP - CHAR_H)
      var headTop = dyTop + Math.round(32 * DESK_SCALE) - CHAR_H - 2;
      var hovered = G.render.office.hoverDesk === i;

      // assigned brief: ONE merged bar = work progress, colored by deadline urgency.
      if(st.briefId){
        var b = G.briefs.byId(st.briefId);
        if(b){
          var top = headTop - 40;
          var frac = b.deadlineLeft / b.deadlineTotal;
          var col = frac > 0.5 ? '#7ee08a' : (frac > 0.22 ? '#ffe066' : '#ff5c5c');
          // merged bar: fill = work done, color = deadline urgency
          bar(ctx, d.x - 45, top + 6, 90, 6, b.workDone / b.workNeeded, col);
          if(hovered){
            // brief title + deadline number only on hover
            labelChip(ctx, b.title.length > 18 ? b.title.slice(0, 17) + '…' : b.title, d.x, top - 5, 12, 'center');
            pxText(ctx, b.title.length > 18 ? b.title.slice(0, 17) + '…' : b.title, d.x, top - 5, 12, '#f4e8cf', 'center');
            var daysleft = (b.deadlineLeft / G.BAL.DAY_REAL_SECONDS);
            var dtxt = daysleft >= 1 ? daysleft.toFixed(1) + 'd' : Math.ceil(daysleft * 10) * 10 + '%';
            var blink = frac < 0.22 && Math.floor(t * 4) % 2 === 0;
            pxText(ctx, dtxt, d.x + 50, top + 12, 13, blink ? '#ff5c5c' : col, 'left');
          }
        }
      }

      // stars row is the calm always-on element
      var first = st.name.split(' ')[0];
      if(hovered){
        // nameplate + badges only on hover
        labelChip(ctx, first, d.x - 6, headTop - 16, 8, 'center', true);
        pxText(ctx, first, d.x - 6, headTop - 16, 8, '#f4e8cf', 'center', true);
        if(st.badges.length){
          ctx.font = '10px serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
          ctx.fillText(st.badges.map(function(bd){ return bd.icon; }).join(''), d.x + (first.length * 4), headTop - 15);
        }
      }
      pxText(ctx, '★'.repeat(st.skill), d.x, headTop - 6, 9, '#ffe066', 'center');
      // BURNOUT bar only when elevated (>40); healthy staff show no bar
      if(st.burnout > 40){
        bar(ctx, d.x - 30, headTop - 5, 60, 4,
            st.burnout / 100,
            st.burnout > 75 ? '#ff5c5c' : (st.burnout > 45 ? '#ff9a56' : '#7ee08a'));
        if(st.burnout > 75 && Math.floor(t * 4) % 2 === 0){
          pxText(ctx, '!!', d.x + 38, headTop, 14, '#ff5c5c', 'left');
        }
      }

      if(st.bubble){
        drawBubble(ctx, d.x + 26, headTop - 46, st.bubble);
      }
    }
  }

  // staff currently out at the water cooler.
  function drawWanderers(ctx){
    var s = G.state;
    for(var i = 0; i < s.staff.length; i++){
      var st = s.staff[i];
      var a = st.away;
      if(!a) continue;
      var walking = a.mode === 'going' || a.mode === 'returning';
      var frame = walking ? Math.floor(t * 6 + i) % 2 : (Math.floor(t * 1.5 + i) % 2);
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ellipse(ctx, a.x, a.y + 4, 18, 6);
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
    x = Math.max(8, Math.min(x, 1280 - w - 8));
    ctx.fillStyle = '#000'; ctx.fillRect(x - 2, y - h - 2, w + 4, h + 4);
    ctx.fillStyle = '#f4e8cf'; ctx.fillRect(x, y - h, w, h);
    ctx.fillStyle = '#f4e8cf';
    ctx.fillRect(x + 6, y, 8, 7);
    ctx.fillStyle = '#1a1410';
    ctx.font = "16px 'VT323', monospace";
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(text, x + 8, y - 8);
  }

  // ---------- clickable hotspots (relocated to dark walls / open floor) ----------
  // All rects verified against where the art/procedural draws appear.
  var HOTSPOTS = {
    chai:    { x: 800,  y: 194, w: 30,  h: 30  },  // tiny kettle on the RIGHT of the WIDENED windowsill, clear of the right mullion (x≈746)
    alexa:   { x: 836,  y: 194, w: 22,  h: 24  },  // Echo-Dot speaker just right of the kettle (music toggle)
    printer: { x: 1148, y: 272, w: 34,  h: 36  },  // ~40% smaller, sitting ON the back content desk (x:1130,y:300)
    window:  { x: 440,  y: 46,  w: 459, h: 172 },  // the live studio window glass (widened +35%, right edge x=899)
    board:   { x: 14,   y: 55,  w: 337, h: 145 },  // HUSTLE board: x+w match the HUD stat panel (14..351), top 5px below it, bottom on the window line (y200)
    tv:      { x: 920,  y: 60,  w: 200, h: 120 }   // flatscreen on back wall (right) — moved right to clear the widened window (right frame ends x=909)
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

  // word-wrap helper for the board text
  function wrapText(ctx, text, x, y, maxW, lh){
    var words = text.split(' '), line = '', yy = y;
    for(var i = 0; i < words.length; i++){
      var test = line ? line + ' ' + words[i] : words[i];
      if(ctx.measureText(test).width > maxW && line){ ctx.fillText(line, x, yy); line = words[i]; yy += lh; }
      else line = test;
    }
    if(line) ctx.fillText(line, x, yy);
  }

  // THE HUSTLE BOARD — a pinned cork/whiteboard rectangle that DISPLAYS its line
  // directly (auto-rotates every ~5s; clicking just flips to the next one). No
  // click-to-reveal: the agency's "inspiration" is always in your face.
  function drawBoard(ctx){
    var h = HOTSPOTS.board;
    ctx.fillStyle = '#05070f'; ctx.fillRect(h.x - 3, h.y - 3, h.w + 6, h.h + 6);
    ctx.fillStyle = '#f4e8cf'; ctx.fillRect(h.x, h.y, h.w, h.h);
    ctx.strokeStyle = '#ffe066'; ctx.lineWidth = 3;
    ctx.strokeRect(h.x + 1.5, h.y + 1.5, h.w - 3, h.h - 3);
    // header strip
    ctx.fillStyle = '#ffe066'; ctx.fillRect(h.x, h.y, h.w, 20);
    ctx.fillStyle = '#1a1410'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.font = "10px 'Silkscreen', monospace";
    ctx.fillText('THE HUSTLE BOARD', h.x + h.w / 2, h.y + 14);
    // a little pin
    ctx.fillStyle = '#ff5c5c'; ctx.fillRect(h.x + h.w / 2 - 2, h.y + 24, 4, 4);
    // the line, shown directly inside the board, wrapped
    var line = BOARD_LINES[(Math.floor(t / 5) + boardIdx) % BOARD_LINES.length];
    ctx.fillStyle = '#3a2a18'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.font = "15px 'VT323', monospace";
    wrapText(ctx, line, h.x + 10, h.y + 42, h.w - 20, 16);
  }

  // chai — a REALLY SMALL steel kettle resting on the RIGHT of the windowsill,
  // clear of the left-side plant and the window mullions. ~24px wide, with a tiny
  // wisp of steam. Click behaviour is unchanged (handleClick reads HOTSPOTS.chai).
  function drawChaiStation(ctx){
    var s = G.state;
    var h = HOTSPOTS.chai;
    var used = s.chaiDay === s.week * 10 + s.day;
    // kettle body sits ON the sill: base aligns with the sill top (WIN.y+WIN.h=218).
    var SILL_TOP = WIN.y + WIN.h;
    var kw = 24, kh = 16;
    var kx = h.x + Math.round((h.w - kw) / 2);     // centre the 24px kettle in the 30px hotspot
    var ky = SILL_TOP - kh;                         // rest the base on the sill (WIN.y+WIN.h)
    // tiny contact shadow on the sill
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.fillRect(kx + 1, ky + kh - 1, kw - 2, 2);
    // body (steel) + highlight band
    ctx.fillStyle = '#9aa7b8'; ctx.fillRect(kx + 1, ky + 3, kw - 2, kh - 3);
    ctx.fillStyle = '#c4ced8'; ctx.fillRect(kx + 2, ky + 4, kw - 4, 4);   // top highlight
    ctx.fillStyle = '#6a7686'; ctx.fillRect(kx + 1, ky + kh - 3, kw - 2, 2); // base shade
    // spout (right) + handle (top) + lid knob
    ctx.fillStyle = '#7e8a9a'; ctx.fillRect(kx + kw - 1, ky + 6, 4, 3);   // spout
    ctx.fillStyle = '#3a4250'; ctx.fillRect(kx + 5, ky, kw - 10, 3);      // lid
    ctx.fillStyle = '#3a4250'; ctx.fillRect(kx + kw / 2 - 1, ky - 2, 2, 2); // knob
    if(used){
      // dim the kettle when the day's round is spent
      ctx.fillStyle = 'rgba(6,9,18,0.45)';
      ctx.fillRect(kx - 1, ky - 3, kw + 6, kh + 6);
    } else {
      // a single tiny wisp of steam off the spout (minimal animation)
      var sy = Math.floor(t * 3) % 3;
      ctx.fillStyle = 'rgba(244,232,207,0.5)';
      ctx.fillRect(kx + kw, ky + 1 - sy, 2, 2);
      ctx.fillRect(kx + kw + 2, ky - 4 - sy, 2, 2);
    }
    // small label below the kettle, on the wall under the sill
    var lx = h.x + h.w / 2, lyl = SILL_TOP + 18;
    labelChip(ctx, used ? 'CHAI (kal)' : 'CHAI ☕', lx, lyl, 8, 'center', true);
    pxText(ctx, used ? 'CHAI (kal)' : 'CHAI ☕', lx, lyl, 8,
           used ? 'rgba(159,232,255,0.45)' : '#ffe066', 'center', true);
  }

  // Alexa — a tiny Echo-Dot-style smart speaker on the windowsill, just RIGHT of
  // the chai kettle. Squat charcoal-fabric cylinder with a glowing cyan light
  // ring around the top rim. Plays the ambient music (drawAlexa reacts to music
  // state; click toggles it via handleClick reading HOTSPOTS.alexa). It sits on
  // the same sill as the kettle (sill top ~y200), kettle-sized so it does not
  // overlap the kettle or clip the window frame (right frame ends ~x780).
  function drawAlexa(ctx){
    var h = HOTSPOTS.alexa;
    var bw = 18, bh = 12;                          // squat cylinder body
    var bx = h.x + Math.round((h.w - bw) / 2);     // centre body in the hotspot
    var by = (WIN.y + WIN.h) - bh;                 // base rests on the sill top (218)
    var ringY = by + 2;                            // ring sits around the top rim
    var playing = !!(window.G && G.music && !G.music.isMuted());

    // contact shadow on the sill
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.fillRect(bx + 1, by + bh - 1, bw - 2, 2);

    // charcoal fabric body (flat hard pixels) + a darker base shade
    ctx.fillStyle = '#2b2f36'; ctx.fillRect(bx, by + 2, bw, bh - 2);
    ctx.fillStyle = '#23262c'; ctx.fillRect(bx, by + bh - 3, bw, 3);     // base shade
    ctx.fillStyle = '#3a3f47'; ctx.fillRect(bx + 1, by + 3, bw - 2, 1);  // fabric speckle highlight
    // dark top cap (recessed) under the ring
    ctx.fillStyle = '#1a1d22'; ctx.fillRect(bx + 1, ringY + 1, bw - 2, 3);

    if(playing){
      // glowing cyan ring around the top rim, gently pulsing
      var pulse = 0.6 + 0.4 * Math.abs(Math.sin(t * 2.4));
      // soft additive glow halo
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      var gr = 18;
      var rg = ctx.createRadialGradient(bx + bw / 2, ringY + 1, 0, bx + bw / 2, ringY + 1, gr);
      rg.addColorStop(0, 'rgba(159,232,255,' + (0.30 * pulse).toFixed(3) + ')');
      rg.addColorStop(1, 'rgba(159,232,255,0)');
      ctx.fillStyle = rg; ctx.fillRect(bx + bw / 2 - gr, ringY + 1 - gr, gr * 2, gr * 2);
      ctx.restore();
      // the ring itself (bright cyan band on the rim)
      ctx.fillStyle = 'rgba(159,232,255,' + (0.7 + 0.3 * pulse).toFixed(3) + ')';
      ctx.fillRect(bx, ringY, bw, 2);
      ctx.fillStyle = 'rgba(210,245,255,' + (0.6 + 0.4 * pulse).toFixed(3) + ')';
      ctx.fillRect(bx + 2, ringY, bw - 4, 1);

      // 1-3 small cyan sound-wave arcs emanating up-right and fading
      ctx.save();
      ctx.strokeStyle = '#9fe8ff';
      ctx.lineWidth = 1;
      var wcx = bx + bw + 1, wcy = ringY;
      for(var wv = 0; wv < 3; wv++){
        var ph = (t * 1.1 + wv * 0.33) % 1;        // 0..1 expand cycle
        var rad = 3 + ph * 9;
        ctx.globalAlpha = (1 - ph) * 0.8;
        ctx.beginPath();
        ctx.arc(wcx, wcy, rad, -Math.PI * 0.55, -Math.PI * 0.05);
        ctx.stroke();
      }
      ctx.restore();
    } else {
      // muted: dim grey ring, no waves, tiny mute slash
      ctx.fillStyle = 'rgba(120,134,158,0.45)';
      ctx.fillRect(bx, ringY, bw, 2);
      ctx.strokeStyle = 'rgba(180,190,205,0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bx + bw - 3, ringY - 3);
      ctx.lineTo(bx + 3, ringY + 5);
      ctx.stroke();
    }
  }

  // Small desktop printer, resting ON a back office desk (see HOTSPOTS.printer).
  // ~40% smaller than the old floor unit; drawn so it reads as "a little printer
  // on someone's desk" — a flat contact shadow on the desktop, no floor cabinet.
  function drawPrinter(ctx){
    var s = G.state;
    var h = HOTSPOTS.printer;
    var trayH = Math.max(8, Math.round(h.h * 0.30));   // bottom paper-tray band
    // flat contact shadow on the desk surface (not a floor ellipse)
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(h.x - 2, h.y + h.h - 2, h.w + 4, 4);
    if(G.data.hasArt('printer')){
      drawSprite(ctx, 'printer', h.x, h.y, h.w, h.h);
    } else {
      ctx.fillStyle = '#05070f'; ctx.fillRect(h.x - 2, h.y - 2, h.w + 4, h.h + 4); // outline
      ctx.fillStyle = '#8a8a80'; ctx.fillRect(h.x, h.y, h.w, h.h - trayH);          // body
      ctx.fillStyle = '#6a6a62'; ctx.fillRect(h.x, h.y + h.h - trayH, h.w, trayH);  // tray
      ctx.fillStyle = '#f4e8cf'; ctx.fillRect(h.x + 6, h.y + h.h - trayH - 4, h.w - 12, 4); // paper lip
    }
    var ledX = h.x + h.w - 8, ledY = h.y + 4, ledS = 4;   // status LED (scaled)
    if(s.printerJammed){
      if(Math.floor(t * 4) % 2 === 0){
        ctx.fillStyle = '#ff5c5c'; ctx.fillRect(ledX, ledY, ledS, ledS);
        pxText(ctx, 'JAM!', h.x + h.w / 2, h.y - 6, 10, '#ff5c5c', 'center', true);
      }
    } else {
      ctx.fillStyle = '#7ee08a'; ctx.fillRect(ledX, ledY, ledS, ledS);
    }
  }

  function drawTrophies(ctx){
    var tr = G.state.trophies;
    if(!tr || !tr.length) return;
    // shelf on the back wall, left of the TV
    var x0 = 600, y0 = 250, n = Math.min(tr.length, 8);
    labelChip(ctx, 'AWARDS', x0, y0 - 4, 8, 'left', true);
    pxText(ctx, 'AWARDS', x0, y0 - 4, 8, 'rgba(255,224,102,0.7)', 'left', true);
    ctx.fillStyle = '#3a2a14'; ctx.fillRect(x0 - 3, y0 + 18, n * 17 + 6, 4);
    for(var i = 0; i < n; i++){
      var x = x0 + i * 17;
      ctx.fillStyle = '#ffe066';
      ctx.fillRect(x + 3, y0 + 2, 9, 8);
      ctx.fillRect(x + 5, y0 + 10, 5, 4);
      ctx.fillRect(x + 2, y0 + 14, 11, 3);
      ctx.fillStyle = '#b8860b';
      ctx.fillRect(x + 3, y0 + 7, 9, 2);
    }
  }

  // ---------- office TV (wall-mounted, alive) ----------
  var TV_INSET = 10;
  function drawTV(ctx){
    var h = HOTSPOTS.tv;
    // bezel (dark, sits on the dark wall — needs its own frame to read)
    ctx.fillStyle = '#05070f'; ctx.fillRect(h.x - 6, h.y - 6, h.w + 12, h.h + 12);
    ctx.fillStyle = '#1a2030'; ctx.fillRect(h.x - 3, h.y - 3, h.w + 6, h.h + 6);
    var SCR = { x: h.x + TV_INSET, y: h.y + TV_INSET, w: h.w - TV_INSET * 2, h: h.h - TV_INSET * 2 };
    ctx.save();
    ctx.beginPath();
    ctx.rect(SCR.x, SCR.y, SCR.w, SCR.h);
    ctx.clip();
    var chan = (G.state.tvChannel + Math.floor(t / 5)) % 4;
    var sinceFlip = (t / 5) % 1;
    var staticNow = sinceFlip < 0.10 || (Math.floor(t * 13) % 97 === 0);
    if(staticNow){ drawTVStatic(ctx, SCR); }
    else if(chan === 0){ drawTVCricket(ctx, SCR); }
    else if(chan === 1){ drawTVNews(ctx, SCR); }
    else if(chan === 2){ drawTVAd(ctx, SCR); }
    else { drawTVWeather(ctx, SCR); }
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#000';
    for(var sl = 0; sl < SCR.h; sl += 3) ctx.fillRect(SCR.x, SCR.y + sl, SCR.w, 1);
    ctx.globalAlpha = 1;
    ctx.restore();
    pxText(ctx, 'CH' + (chan + 1), h.x + h.w - 4, h.y + h.h + 2, 7, 'rgba(159,232,255,0.5)', 'right', true);
  }

  function drawTVStatic(ctx, h){
    for(var i = 0; i < 140; i++){
      var g = 40 + Math.floor(Math.random() * 180);
      ctx.fillStyle = 'rgb(' + g + ',' + g + ',' + g + ')';
      var sx = h.x + Math.floor(Math.random() * h.w);
      var sy = h.y + Math.floor(Math.random() * h.h);
      ctx.fillRect(sx, sy, 3, 2);
    }
  }

  function drawTVCricket(ctx, h){
    ctx.fillStyle = '#2f5d34'; ctx.fillRect(h.x, h.y, h.w, h.h);
    ctx.fillStyle = '#c9a24e';
    ctx.fillRect(h.x + h.w / 2 - 6, h.y + 14, 12, h.h - 30);
    ctx.fillStyle = '#f4e8cf';
    ctx.fillRect(h.x + h.w / 2 - 4, h.y + 16, 2, 6);
    ctx.fillRect(h.x + h.w / 2, h.y + 16, 2, 6);
    ctx.fillRect(h.x + h.w / 2 + 4, h.y + 16, 2, 6);
    ctx.fillRect(h.x + h.w / 2 - 4, h.y + h.h - 24, 2, 6);
    ctx.fillRect(h.x + h.w / 2, h.y + h.h - 24, 2, 6);
    ctx.fillRect(h.x + h.w / 2 + 4, h.y + h.h - 24, 2, 6);
    var bp = (t * 0.8) % 1;
    var bx = h.x + h.w / 2;
    var by = h.y + 20 + bp * (h.h - 48);
    ctx.fillStyle = '#ff5c5c'; ctx.fillRect(bx - 1, by, 3, 3);
    ctx.fillStyle = '#0a0d16'; ctx.fillRect(h.x, h.y + h.h - 12, h.w, 12);
    var runs = 140 + Math.floor(t) % 60;
    pxText(ctx, 'IND ' + runs + '/4  ov 18.' + (Math.floor(t) % 6), h.x + 4, h.y + h.h - 3, 8, '#ffe066', 'left', true);
    if(Math.floor(t * 2) % 2 === 0){
      ctx.fillStyle = '#ff5c5c'; ctx.fillRect(h.x + h.w - 28, h.y + 4, 4, 4);
    }
    pxText(ctx, 'LIVE', h.x + h.w - 22, h.y + 9, 7, '#ff5c5c', 'left', true);
  }

  function drawTVNews(ctx, h){
    ctx.fillStyle = '#1a2238'; ctx.fillRect(h.x, h.y, h.w, h.h);
    ctx.fillStyle = '#24304e'; ctx.fillRect(h.x + 6, h.y + 6, h.w - 12, h.h - 24);
    var cx = h.x + h.w / 2;
    ctx.fillStyle = '#7a4a21'; ctx.fillRect(cx - 9, h.y + 14, 18, 16);
    ctx.fillStyle = '#2a2018'; ctx.fillRect(cx - 9, h.y + 12, 18, 4);
    ctx.fillStyle = '#0a0d16'; ctx.fillRect(cx - 5, h.y + 20, 2, 2); ctx.fillRect(cx + 3, h.y + 20, 2, 2);
    var open = Math.floor(t * 6) % 2 === 0;
    ctx.fillStyle = '#3a1a1a'; ctx.fillRect(cx - 3, h.y + 25, 6, open ? 3 : 1);
    ctx.fillStyle = '#14304a'; ctx.fillRect(cx - 14, h.y + 30, 28, 14);
    ctx.fillStyle = '#f4e8cf'; ctx.fillRect(cx - 2, h.y + 30, 4, 10);
    ctx.fillStyle = '#ff5c5c'; ctx.fillRect(h.x, h.y + h.h - 24, 40, 12);
    pxText(ctx, 'NEWS', h.x + 3, h.y + h.h - 15, 7, '#fff', 'left', true);
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
    var hot = Math.floor(t * 3) % 2 === 0;
    ctx.fillStyle = hot ? '#d35d6e' : '#ff9a56'; ctx.fillRect(h.x, h.y, h.w, h.h);
    ctx.fillStyle = 'rgba(255,224,102,0.35)';
    for(var i = 0; i < 8; i++) ctx.fillRect(h.x + i * 26 - (Math.floor(t * 8) % 26), h.y, 10, h.h);
    if(Math.floor(t * 4) % 2 === 0){
      pxText(ctx, 'SALE SALE', h.x + h.w / 2, h.y + 36, 18, '#fff', 'center', true);
      pxText(ctx, 'SALE!', h.x + h.w / 2, h.y + 60, 18, '#23304a', 'center', true);
    }
    pxText(ctx, 'upto 90% off*', h.x + h.w / 2, h.y + h.h - 8, 12, '#fff', 'center');
    pxText(ctx, '*nothing', h.x + h.w - 4, h.y + h.h - 2, 7, 'rgba(255,255,255,0.7)', 'right');
  }

  function drawTVWeather(ctx, h){
    ctx.fillStyle = '#14233f'; ctx.fillRect(h.x, h.y, h.w, h.h);
    pxText(ctx, 'AHMEDABAD', h.x + 6, h.y + 18, 9, '#9fe8ff', 'left', true);
    var pulse = 6 + Math.abs(Math.sin(t * 2)) * 3;
    ctx.fillStyle = '#ffe066';
    ctx.fillRect(h.x + h.w - 40, h.y + 20, 20, 20);
    ctx.fillStyle = 'rgba(255,224,102,0.4)';
    ctx.fillRect(h.x + h.w - 40 - pulse, h.y + 20 - pulse / 2, 20 + pulse * 2, 20 + pulse);
    var temp = 40 + Math.floor(t) % 4;
    pxText(ctx, temp + '°C', h.x + 6, h.y + 48, 22, '#ff9a56', 'left', true);
    pxText(ctx, 'feels like a brief', h.x + 6, h.y + 70, 12, '#9aa7c4', 'left');
    ctx.fillStyle = '#0a0d16'; ctx.fillRect(h.x, h.y + h.h - 12, h.w, 12);
    pxText(ctx, 'monsoon: "soon"', h.x + 4, h.y + h.h - 3, 8, '#9fe8ff', 'left', true);
  }

  // ---------- neon sign (custom text, glowing tube) ----------
  function drawNeon(ctx){
    var txt = '~ ' + (G.state.neonText || 'CRAVACHE') + ' ~';
    var cx = 200, cy = 60;   // back wall, upper-left
    var flick = Math.floor(t * 9) % 53;
    var on = flick !== 0 && flick !== 1;
    var dim = Math.floor(t * 3) % 11 === 0;
    var w = 230;
    ctx.fillStyle = '#05070f';
    ctx.fillRect(cx - w / 2, cy - 14, w, 30);
    ctx.strokeStyle = '#1a2440'; ctx.lineWidth = 2;
    ctx.strokeRect(cx - w / 2 + 1, cy - 13, w - 2, 28);
    ctx.font = "16px 'Silkscreen', monospace";
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    if(on){
      ctx.save();
      ctx.shadowColor = '#ff9a56';
      ctx.shadowBlur = dim ? 6 : 16;
      ctx.fillStyle = dim ? '#b85c2e' : '#ff9a56';
      ctx.fillText(txt, cx, cy + 6);
      ctx.restore();
      ctx.lineWidth = 3; ctx.strokeStyle = '#5a2a14';
      ctx.strokeText(txt, cx, cy + 6);
      ctx.fillStyle = dim ? '#ffb27a' : '#ffd9b0';
      ctx.fillText(txt, cx, cy + 6);
      ctx.strokeStyle = on ? 'rgba(255,154,86,0.55)' : 'rgba(255,154,86,0.15)';
      ctx.lineWidth = 2;
      ctx.strokeRect(cx - w / 2 + 5, cy - 11, w - 10, 24);
    } else {
      ctx.fillStyle = '#3a2418';
      ctx.fillText(txt, cx, cy + 6);
    }
  }

  // ---------- water cooler (gossip station) ----------
  var COOLER = { x: 470, y: 558 };   // relocated to clear front floor (between arcade & production)
  var COOLER_S = 0.62;               // shrunk per "make the team thing small"
  G.render.coolerPoint = function(){ return { x: COOLER.x + 20 * COOLER_S, y: COOLER.y + 70 * COOLER_S }; };

  function drawCooler(ctx){
    var cx = COOLER.x, cy = COOLER.y;
    ctx.save();
    ctx.translate(cx, cy); ctx.scale(COOLER_S, COOLER_S); ctx.translate(-cx, -cy);
    ctx.fillStyle = 'rgba(0,0,0,0.30)'; ellipse(ctx, cx + 20, cy + 70, 28, 7);
    if(G.data.hasArt('water_cooler')){
      drawSprite(ctx, 'water_cooler', cx - 3, cy - 4, 46, 74);
      ctx.restore(); return;
    }
    ctx.fillStyle = '#05070f'; ctx.fillRect(cx - 2, cy + 30, 44, 38);
    ctx.fillStyle = '#dfe6ee'; ctx.fillRect(cx, cy + 32, 40, 34);
    ctx.fillStyle = '#aeb8c4'; ctx.fillRect(cx, cy + 32, 40, 4);
    ctx.fillStyle = '#b8c2cc'; ctx.fillRect(cx + 6, cy + 40, 28, 14);
    ctx.fillStyle = '#ff5c5c'; ctx.fillRect(cx + 12, cy + 43, 4, 3);
    ctx.fillStyle = '#3a8ad0'; ctx.fillRect(cx + 24, cy + 43, 4, 3);
    ctx.fillStyle = '#2a3142'; ctx.fillRect(cx + 12, cy + 46, 4, 4);
    ctx.fillStyle = '#2a3142'; ctx.fillRect(cx + 24, cy + 46, 4, 4);
    ctx.fillStyle = '#8a94a0'; ctx.fillRect(cx + 8, cy + 58, 24, 3);
    ctx.fillStyle = '#05070f'; ctx.fillRect(cx + 6, cy - 2, 28, 34);
    ctx.fillStyle = 'rgba(120,180,220,0.85)'; ctx.fillRect(cx + 8, cy, 24, 30);
    ctx.fillStyle = 'rgba(180,220,245,0.9)'; ctx.fillRect(cx + 8, cy + 4, 24, 24);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    var by = (t * 14) % 24;
    ctx.fillRect(cx + 14, cy + 26 - by, 2, 2);
    ctx.fillRect(cx + 22, cy + 28 - ((by + 12) % 24), 2, 2);
    ctx.fillStyle = '#3a6a8a'; ctx.fillRect(cx + 14, cy + 28, 12, 4);
    ctx.restore();
  }

  // ============================================================
  //  NEW PROCEDURAL DECOR PROPS — color against the dark.
  //  Each gated on G.state.upgrades[key] (treat undefined as falsy).
  //  Placed in open areas (front-left floor + walls), clear of desks/labels.
  // ============================================================

  // AQUARIUM — glowing tank on the front-left floor, drifting fish + bubbles.
  function drawAquarium(ctx){
    var ax = 40, ay = 560, aw = 150, ah = 100;
    // glow halo (the tank lights the dark floor)
    ctx.fillStyle = 'rgba(80,170,220,0.10)';
    ctx.fillRect(ax - 24, ay - 24, aw + 48, ah + 48);
    // stand
    ctx.fillStyle = '#241a10'; ctx.fillRect(ax + 6, ay + ah, aw - 12, 16);
    // tank body (water gradient)
    var wg = ctx.createLinearGradient(0, ay, 0, ay + ah);
    wg.addColorStop(0, '#1d6fa0');
    wg.addColorStop(1, '#0c3a58');
    ctx.fillStyle = wg;
    ctx.fillRect(ax, ay, aw, ah);
    // light caustics at the top
    ctx.fillStyle = 'rgba(180,230,255,0.18)';
    ctx.fillRect(ax + 4, ay + 4, aw - 8, 8);
    // gravel
    ctx.fillStyle = '#2a3a22'; ctx.fillRect(ax + 2, ay + ah - 12, aw - 4, 12);
    // a couple of seaweed fronds
    ctx.fillStyle = '#2f8f4a';
    for(var w2 = 0; w2 < 3; w2++){
      var wx = ax + 18 + w2 * 44;
      var sway = Math.sin(t * 1.6 + w2) * 3;
      ctx.fillRect(wx + sway, ay + ah - 40, 5, 30);
      ctx.fillRect(wx + sway * 0.5, ay + ah - 56, 5, 18);
    }
    // 3 drifting fish (wrap horizontally)
    var fishCol = ['#ff9a56', '#ffe066', '#9fe8ff'];
    for(var f = 0; f < 3; f++){
      var span = aw + 30;
      var fx = ax - 14 + ((f * 0.33 * span + t * (14 + f * 6)) % span);
      var fy = ay + 24 + f * 22 + Math.sin(t * 2 + f) * 5;
      ctx.fillStyle = fishCol[f];
      ctx.fillRect(fx, fy, 12, 7);            // body
      ctx.fillRect(fx + 12, fy + 1, 5, 5);    // tail
      ctx.fillStyle = '#05070f';
      ctx.fillRect(fx + 2, fy + 2, 2, 2);     // eye
    }
    // bubble stream
    for(var bb = 0; bb < 5; bb++){
      var bx = ax + 30 + (bb % 2) * 4;
      var byb = ay + ah - ((t * 20 + bb * 20) % ah);
      ctx.fillStyle = 'rgba(220,245,255,0.6)';
      ctx.fillRect(bx, byb, 3, 3);
    }
    // glass frame + glare
    ctx.strokeStyle = '#0a141f'; ctx.lineWidth = 4;
    ctx.strokeRect(ax + 2, ay + 2, aw - 4, ah - 4);
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(ax + aw - 26, ay + 6, 6, ah - 16);
  }

  // COFFEE machine — sprite + NEW rising steam puffs animation.
  function drawCoffee(ctx){
    var cx = 150, cy = 360;
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ellipse(ctx, cx + 23, cy + 66, 24, 7);
    drawSprite(ctx, 'coffee_machine', cx, cy, 46, 64);
    // rising steam puffs from the spout (two staggered columns)
    for(var p = 0; p < 4; p++){
      var ph = (t * 0.6 + p * 0.25) % 1;          // 0..1 rise
      var alpha = 0.5 * (1 - ph);
      var puffY = cy + 20 - ph * 28;
      var drift = Math.sin(t * 2 + p) * 3;
      ctx.fillStyle = 'rgba(230,240,250,' + alpha + ')';
      ctx.fillRect(cx + 14 + drift, puffY, 4, 4);
      ctx.fillRect(cx + 26 - drift, puffY - 4, 4, 4);
    }
  }

  // ARCADE cabinet — glowing screen, on the floor.
  function drawArcade(ctx){
    var ax = 300, ay = 535, aw = 70, ah = 120;
    ctx.fillStyle = 'rgba(0,0,0,0.28)'; ellipse(ctx, ax + aw / 2, ay + ah, aw * 0.5, 9);
    // cabinet body
    ctx.fillStyle = '#1a2030'; ctx.fillRect(ax, ay, aw, ah);
    ctx.fillStyle = '#10141f'; ctx.fillRect(ax + 4, ay + 4, aw - 8, ah - 8);
    // marquee glow strip
    ctx.fillStyle = '#ff5c5c'; ctx.fillRect(ax + 6, ay + 6, aw - 12, 10);
    ctx.fillStyle = 'rgba(255,92,92,0.25)'; ctx.fillRect(ax, ay, aw, 18);
    // glowing screen (cycling color)
    var hue = Math.floor(t * 30) % 360;
    var sx = ax + 10, sy = ay + 22, sw = aw - 20, sh = 34;
    ctx.fillStyle = 'hsl(' + hue + ',70%,55%)';
    ctx.fillRect(sx, sy, sw, sh);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    for(var sl = 0; sl < sh; sl += 3) ctx.fillRect(sx, sy + sl, sw, 1);   // scanlines
    // little pixel sprite bouncing on the screen
    var px = sx + 4 + (Math.abs(((t * 30) % (sw - 12)) - (sw - 12) / 2));
    ctx.fillStyle = '#fff'; ctx.fillRect(px, sy + sh - 8, 4, 4);
    // control panel + joystick + buttons
    ctx.fillStyle = '#2a3346'; ctx.fillRect(ax + 6, ay + 64, aw - 12, 16);
    ctx.fillStyle = '#ff5c5c'; ctx.fillRect(ax + 14, ay + 68, 5, 5);
    ctx.fillStyle = '#ffe066'; ctx.fillRect(ax + 24, ay + 68, 5, 5);
    ctx.fillStyle = '#9fe8ff'; ctx.fillRect(ax + 44, ay + 68, 8, 8);
    // screen glow halo
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(ax - 16, ay + 10, aw + 32, 60);
  }

  // SMALL windowsill plant — a little potted plant sitting ON the window sill
  // (WIN sill bottom ~y=200). Tasteful, pixel-art, minimal 1px leaf sway.
  function drawPlantBig(ctx){
    var pw = 22, ph = 14;             // small pot (~22px wide, ~14 tall)
    var px = 540, py = (WIN.y + WIN.h) - ph;   // pot base rests ON the (now lower, wider) sill
    // contact shadow so it reads as sitting on the sill, not floating
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.fillRect(px + 1, py + ph - 1, pw - 2, 2);
    // pot (terracotta) with a lip rim
    ctx.fillStyle = '#7a4a28'; ctx.fillRect(px + 2, py, pw - 4, ph);
    ctx.fillStyle = '#9a6038'; ctx.fillRect(px, py, pw, 4);     // rim lip
    ctx.fillStyle = '#5e3820'; ctx.fillRect(px + 2, py + ph - 2, pw - 4, 2); // base shade
    // a couple of short stalks
    var cx = px + pw / 2;
    ctx.fillStyle = '#1f5a2e';
    ctx.fillRect(cx - 1, py - 12, 2, 12);
    ctx.fillRect(cx - 5, py - 8, 2, 8);
    ctx.fillRect(cx + 3, py - 8, 2, 8);
    // a few simple leaves with at most a 1px gentle sway
    var sway = Math.round(Math.sin(t * 0.9));   // -1..1, 1px max
    var leaf = ['#2f8f4a', '#36a055', '#267a3e'];
    var L = [[-9, -10], [-2, -16], [5, -12]];   // [dx, dy] of small leaf clusters
    for(var i = 0; i < L.length; i++){
      ctx.fillStyle = leaf[i % 3];
      var lx = cx + L[i][0] + (i % 2 ? sway : -sway);
      var ly = py + L[i][1];
      ctx.fillRect(lx, ly, 7, 5);
      ctx.fillRect(lx + 1, ly - 3, 5, 3);
    }
  }

  // POSTERS — 1-2 framed posters on the back wall.
  function drawPosters(ctx){
    var P = [
      { x: 980, y: 60, w: 64, h: 84, bg: '#d35d6e', t1: 'GO', t2: 'VIRAL' },
      { x: 1060, y: 60, w: 64, h: 84, bg: '#2f6f8f', t1: 'DEAD', t2: 'LINE' }
    ];
    for(var i = 0; i < P.length; i++){
      var p = P[i];
      ctx.fillStyle = '#05070f'; ctx.fillRect(p.x - 3, p.y - 3, p.w + 6, p.h + 6);
      ctx.fillStyle = p.bg; ctx.fillRect(p.x, p.y, p.w, p.h);
      // a chunky graphic block
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(p.x + 8, p.y + 10, p.w - 16, 22);
      ctx.fillStyle = '#fff';
      pxText(ctx, p.t1, p.x + p.w / 2, p.y + 54, 13, '#fff', 'center', true);
      pxText(ctx, p.t2, p.x + p.w / 2, p.y + 72, 13, '#ffe066', 'center', true);
    }
  }

  // STRING LIGHTS — warm fairy-light string along the top wall edge, twinkle.
  function drawStringLights(ctx){
    var y0 = 18, n = 26, gap = 1280 / n;
    // the wire (gentle catenary sag between posts)
    ctx.strokeStyle = 'rgba(40,52,84,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for(var i = 0; i <= n; i++){
      var x = i * gap;
      var sag = Math.sin((i / n) * Math.PI * 5) * 6 + 8;
      if(i === 0) ctx.moveTo(x, y0 + sag); else ctx.lineTo(x, y0 + sag);
    }
    ctx.stroke();
    // the bulbs
    var cols = ['#ffd9b0', '#ff9a56', '#ffe066', '#9fe8ff'];
    for(var b = 0; b < n; b++){
      var bx = b * gap + gap / 2;
      var sag2 = Math.sin((b / n) * Math.PI * 5) * 6 + 12;
      var by = y0 + sag2;
      var tw = (Math.sin(t * 2.5 + b * 0.8) + 1) / 2;     // 0..1 twinkle
      var col = cols[b % cols.length];
      // glow
      ctx.fillStyle = 'rgba(255,200,140,' + (0.06 + tw * 0.10) + ')';
      ctx.fillRect(bx - 6, by - 6, 12, 12);
      // bulb
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.5 + tw * 0.5;
      ctx.fillRect(bx - 2, by, 4, 5);
      ctx.globalAlpha = 1;
    }
  }

  // small office plant — RESTS on the LEFT end of the widened windowsill (sill top
  // = WIN.y + WIN.h). Clear of the kettle/alexa, which sit on the right of the sill.
  // Drawn procedurally (pixel-art pot + leaves) so its base sits flat on the sill —
  // no longer floating. Left mullion is at WIN.x + WIN.w/3 (≈593); we sit left of it.
  function drawPlant(ctx){
    var SILL_TOP = WIN.y + WIN.h;      // sill top surface (218)
    var pw = 20, ph = 13;              // small pot
    var px = WIN.x + 16;               // left end of the sill (clear of the left mullion)
    var py = SILL_TOP - ph;            // pot base rests ON the sill
    // contact shadow on the sill
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.fillRect(px + 1, py + ph - 1, pw - 2, 2);
    // pot (terracotta) with a lip rim
    ctx.fillStyle = '#7a4a28'; ctx.fillRect(px + 2, py, pw - 4, ph);
    ctx.fillStyle = '#9a6038'; ctx.fillRect(px, py, pw, 4);            // rim lip
    ctx.fillStyle = '#5e3820'; ctx.fillRect(px + 2, py + ph - 2, pw - 4, 2); // base shade
    // stalks
    var cx = px + pw / 2;
    ctx.fillStyle = '#1f5a2e';
    ctx.fillRect(cx - 1, py - 11, 2, 11);
    ctx.fillRect(cx - 5, py - 7, 2, 7);
    ctx.fillRect(cx + 3, py - 7, 2, 7);
    // leaves with a 1px gentle sway
    var sway = Math.round(Math.sin(t * 0.9));
    var leaf = ['#2f8f4a', '#36a055', '#267a3e'];
    var L = [[-8, -9], [-2, -15], [5, -11]];
    for(var i = 0; i < L.length; i++){
      ctx.fillStyle = leaf[i % 3];
      var lx = cx + L[i][0] + (i % 2 ? sway : -sway);
      var ly = py + L[i][1];
      ctx.fillRect(lx, ly, 6, 5);
      ctx.fillRect(lx + 1, ly - 3, 4, 3);
    }
  }

  // ---------- props orchestrator ----------
  function drawProps(ctx){
    var s = G.state;
    var u = s.upgrades || {};
    drawBoard(ctx);
    drawChaiStation(ctx);
    drawAlexa(ctx);
    drawPrinter(ctx);
    drawTrophies(ctx);
    // decor (gated; undefined => falsy => not owned)
    if(u.string_lights) drawStringLights(ctx);
    if(u.posters) drawPosters(ctx);
    if(u.aquarium) drawAquarium(ctx);
    if(u.arcade) drawArcade(ctx);
    if(u.plant_big) drawPlantBig(ctx);
    if(u.coffee) drawCoffee(ctx);
    if(u.plant) drawPlant(ctx);
    if(u.tv) drawTV(ctx);
    if(u.cooler) drawCooler(ctx);
    if(u.neon) drawNeon(ctx);
    // phone rings when a call is live (on the printer cabinet)
    if(s.activeCall && Math.floor(t * 8) % 2 === 0){
      drawSprite(ctx, 'phone_prop', HOTSPOTS.printer.x + 8, HOTSPOTS.printer.y - 30, 36, 36);
      pxText(ctx, 'RING', HOTSPOTS.printer.x + 26, HOTSPOTS.printer.y - 38, 10, '#ff5c5c', 'center', true);
    }
  }

  // ---------- fire overlay (chaos) ----------
  function drawFire(ctx){
    var chaos = G.state.chaos;
    if(chaos < 55) return;
    var n = Math.floor((chaos - 50) / 6);
    ctx.font = '40px serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for(var i = 0; i < n; i++){
      var fx = (i * 173 + 90) % 1240 + 20;
      var fy = 660 - (Math.floor(t * 5 + i) % 2) * 8;
      ctx.fillText('🔥', fx, fy);
    }
    if(chaos > 80){
      if(G.data.hasArt('fire_overlay')){
        var rise = (chaos - 80) / 20;
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
      drawBackground(ctx);     // dark navy void (procedural, no baked bg)
      drawWindowSky(ctx);      // live 4-state sky in the back-wall window
      drawProps(ctx);          // wall decor, hotspots, gated decor props
      drawClusters(ctx);       // dept labels + production tape
      drawDesks(ctx);          // seated staff behind desks (front-on)
      drawWanderers(ctx);      // cooler gossipers
      // night: the room goes darker blue, laptops/props are the light source
      if(G.state.night){
        ctx.fillStyle = 'rgba(4,7,18,0.55)';
        ctx.fillRect(0, 0, 1280, 720);
      }
      drawFire(ctx);
    },

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

    handleClick: function(lx, ly){
      var s = G.state;
      function inBox(h){ return lx >= h.x && lx <= h.x + h.w && ly >= h.y && ly <= h.y + h.h; }

      // chai station: one round a day
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

      // alexa: toggle the ambient music
      if(inBox(HOTSPOTS.alexa)){
        if(window.G && G.music){
          var nowMuted = G.music.toggle();
          G.audio.click();
          if(G.dock && G.dock.infoToast){
            G.dock.infoToast('ALEXA', nowMuted ? 'Music off. Just the city now.' : 'Late-night lo-fi, on.', '');
          }
        }
        return;
      }

      // printer: fix the jam
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

      // hustle board: text is always shown; a click just flips to the next line
      if(inBox(HOTSPOTS.board)){
        boardIdx++;
        G.audio.click();
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
