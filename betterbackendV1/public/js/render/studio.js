// CravAche — PRODUCTION STUDIO scene (ported from mockup_prod_A, wired to the
// real game). One soundstage you enter by tapping the PRODUCTION area in the
// office. Crew = your real hired production staff, drawn with the SAME
// main-screen character art. Drag a production brief from the dock onto the set
// and an idle crew member shoots it (using the real brief/verdict/pay pipeline).
//
// Tappables: crew (status card), the camera (cycle FX-3 / FX-6 / Sony S3), the
// two product turntables (each swaps through its own product roster), the two
// key lights (warm/cool), the cyclorama backdrop (cycle location/photo), and the
// BACK arrow (return to the office).
(function(){
  'use strict';
  window.G = window.G || {};
  G.render = G.render || {};

  // ---------- geometry (1280x720 logical, same canvas as the office) ----------
  var RX = 120, RY = 70, RW = 1040, RH = 540, floorY = 470;
  var CYC = { x: 470, w: 440, top: 100, floor: floorY };
  var SET = { x: 280, y: 150, w: 720, h: 410 }; // drop-zone for briefs

  // ---------- palette ----------
  var C = {
    navyDd:'#0d1426', wall:'#11182b', wall2:'#0d1320', floor:'#161f33', floorDk:'#101727',
    cream:'#f4e8cf', teal:'#9fe8ff', gold:'#ffe066', warm:'#ff9a56', red:'#ff5c5c',
    green:'#7ee08a', metal:'#5a6680', metalDk:'#39425c', wood:'#7a5230'
  };

  // ---------- state ----------
  var t = 0;                       // anim clock (seconds)
  var hits = [];                   // rebuilt each frame
  var lights = { left:'warm', right:'cool' };
  var lightLum = { left:1.0, right:0.72 };
  var LIGHT_PROFILE = { warm:{ rgb:[255,154,86], lum:1.0 }, cool:{ rgb:[159,232,255], lum:0.72 } };

  // products: a roster of 15 increasingly silly "products" an ad agency gets
  // forced to shoot. Only TWO stands are visible at a time; tapping a stand
  // swaps ONLY that stand to the next product in the queue (its own index).
  var PRODUCTS = ['cola','chips','soda','cream','masala','chicken','plunger',
    'banana','whoopee','tproll','chappal','potato','hotsauce','pickle','agarbatti'];
  var PRODUCT_SLOTS = [ { cx:380, baseY:548 }, { cx:600, baseY:548 } ];
  var slotProduct = [0, 5];        // which product each visible stand shows
  var slotSpin = [0, 0];

  // RGB tube wands on a side table (16-colour wheel); tap to cycle, like the keys
  var RGB16 = ['#ff3030','#ff7a1f','#ffc020','#ffe066','#b9ff3a','#5dff5d','#3affa6',
    '#22ffe0','#27c6ff','#3a7bff','#5d3aff','#9b3aff','#ff3aff','#ff3aa6','#ff3a6e','#ffffff'];
  var tubes = [ { idx:0 }, { idx:8 } ];

  // cameras: three real bodies with distinct pixel art
  var CAMERAS = ['Sony FX-3','Sony FX-6','Sony S3'];
  var cameraIdx = 0;

  // backdrops: flat screens + real-photo locations/figures (photos preloaded)
  var BACKDROPS = [
    { id:'green',  label:'GREEN SCREEN', kind:'flat', col:'#00b140', hi:'#13c454' },
    { id:'blue',   label:'BLUE SCREEN',  kind:'flat', col:'#1f49d6', hi:'#2f5ae6' },
    { id:'white',  label:'WHITE',        kind:'soft', col:'#e9e6dc', hi:'#ffffff' },
    { id:'black',  label:'BLACK',        kind:'soft', col:'#0b0e16', hi:'#1a2236' },
    { id:'area51', label:'AREA 51',      kind:'photo', src:'/art/backdrops/area51.jpg' },
    { id:'moon',   label:'THE MOON',     kind:'photo', src:'/art/backdrops/moon.jpg' },
    { id:'mars',   label:'MARS',         kind:'photo', src:'/art/backdrops/mars.jpg' },
    { id:'trump',  label:'DONALD TRUMP', kind:'photo', src:'/art/backdrops/trump.jpg' },
    { id:'modi',   label:'NARENDRA MODI',kind:'photo', src:'/art/backdrops/modi.jpg' },
    { id:'mia',    label:'MIA KHALIFA',  kind:'photo', src:'/art/backdrops/mia.jpg' },
    { id:'kim',    label:'KIM JONG-UN',  kind:'photo', src:'/art/backdrops/kim.jpg' }
  ];
  var backdrop = 0;
  var photoCache = {};             // src -> Image
  function photo(src){
    if(!photoCache[src]){
      var im = new Image();
      im.src = src;
      photoCache[src] = im;
    }
    return photoCache[src];
  }

  var openCardId = null;           // crew status card
  var firstEntry = true;           // show the "be curious, tap things" hint once

  // crew layout marks — first present production staffer is the CAMERA OP (holds
  // the switchable camera); the rest fill supporting marks. Positions are
  // CONSTANT (idle vs working never moves them) so nothing jitters.
  // foot-line marks (y = where their shoes meet the floor). Crew stand OFF the
  // cyclorama (cyc spans x 470-910) so nobody is "in the shot" — the camera op is
  // off to the RIGHT, shooting left toward the backdrop; the rest fill the left.
  var MARKS = [
    { x:1015, y:478, role:'Camera'   },  // camera op: right of the backdrop
    { x:205,  y:492, role:'B-cam'    },  // far left
    { x:120,  y:466, role:'Director' },  // far left, back
    { x:315,  y:506, role:'Gaffer'   }   // left, forward
  ];

  // deterministic per-staffer look so every crew member is a distinct character
  function hashStr(s){ var h=0; s=String(s||''); for(var i=0;i<s.length;i++){ h=(h*31+s.charCodeAt(i))|0; } return Math.abs(h); }
  var SKINS  = ['#e6b387','#caa06f','#b9885a','#8d5e3c','#f0c79c'];
  var HAIRS  = ['#241a14','#3a2418','#10131f','#5a3a1a','#7a6a55'];
  var SHIRTS = ['#3a6ea5','#7b4a8c','#c25a4a','#2a8860','#c08a2a','#4a4a8c','#b5532e'];

  function productionCrew(){
    if(!G.state || !G.state.staff) return [];
    return G.state.staff.filter(function(st){ return st.dept === 'production'; });
  }
  function unlockWeek(){ return (G.BAL && G.BAL.PRODUCTION_UNLOCK_WEEK) || 2; }
  function studioUnlocked(){
    return !!(G.state && G.state.week >= unlockWeek());
  }
  // shown when a player walks in before the studio has unlocked
  function drawLocked(ctx){
    // empty grey cyc behind the lock
    ctx.save(); cycPath(ctx); ctx.clip();
    ctx.fillStyle = '#1a2334'; ctx.fillRect(CYC.x-4, CYC.top-4, CYC.w+8, (CYC.floor+50)-CYC.top);
    ctx.restore();
    ctx.fillStyle = C.metalDk; ctx.fillRect(CYC.x-6, CYC.top-10, CYC.w+12, 12);
    // dim wash
    ctx.fillStyle = 'rgba(5,7,13,0.74)'; ctx.fillRect(0,0,1280,720);
    // lock panel
    ctx.textAlign = 'center';
    ctx.fillStyle = C.gold; ctx.font = "46px 'VT323', monospace";
    ctx.fillText('🔒  PRODUCTION STUDIO', 640, 300);
    ctx.fillStyle = C.teal; ctx.font = "24px 'VT323', monospace";
    ctx.fillText('Locked — unlocks in WEEK ' + unlockWeek() + '.', 640, 338);
    ctx.fillStyle = 'rgba(244,232,207,0.7)'; ctx.font = "18px 'VT323', monospace";
    ctx.fillText('Survive the first week, then come back to shoot.', 640, 366);
  }

  // ---------- helpers ----------
  function rgba(c,a){ return 'rgba('+c[0]+','+c[1]+','+c[2]+','+a+')'; }
  function px(ctx,x,y,w,h,col){ ctx.fillStyle = col; ctx.fillRect(x,y,w,h); }
  function addHit(id,type,x,y,w,h,extra){ hits.push(Object.assign({ id:id, type:type, x:x, y:y, w:w, h:h }, extra||{})); }
  function inBox(h,lx,ly){ return lx>=h.x && lx<=h.x+h.w && ly>=h.y && ly<=h.y+h.h; }
  function toast(head, body, cls){ if(G.dock && G.dock.infoToast) G.dock.infoToast(head, body, cls||''); }

  // ============================================================
  //  ROOM (drawn fresh each frame onto the single game canvas)
  // ============================================================
  function drawRoom(ctx){
    ctx.fillStyle = C.navyDd; ctx.fillRect(0,0,1280,720);
    // back wall stripes
    for(var i=0;i<RW;i+=80){ ctx.fillStyle = (i/80)%2===0 ? C.wall : C.wall2; ctx.fillRect(RX+i,RY,80,floorY-RY); }
    // floor + perspective lines
    ctx.fillStyle = C.floor; ctx.fillRect(RX,floorY,RW,RY+RH-floorY);
    ctx.strokeStyle = 'rgba(255,255,255,.04)'; ctx.lineWidth = 2;
    for(var k=0;k<=RW;k+=104){ ctx.beginPath(); ctx.moveTo(RX+k,floorY); ctx.lineTo(RX+RW/2+(k-RW/2)*1.7, RY+RH); ctx.stroke(); }
    for(var j=floorY;j<RY+RH;j+=34){ ctx.beginPath(); ctx.moveTo(RX,j); ctx.lineTo(RX+RW,j); ctx.stroke(); }
    ctx.fillStyle = C.floorDk; ctx.fillRect(RX,floorY,RW,6);
    // frame
    ctx.lineWidth = 6; ctx.strokeStyle = '#1c2944'; ctx.strokeRect(RX,RY,RW,RH);
    ctx.lineWidth = 2; ctx.strokeStyle = '#28365a'; ctx.strokeRect(RX+5,RY+5,RW-10,RH-10);
    // cable run (atmosphere)
    ctx.strokeStyle = '#0a1120'; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(300,560); ctx.bezierCurveTo(430,540,560,610,690,575); ctx.stroke();
  }

  // ============================================================
  //  CYCLORAMA / BACKDROP
  // ============================================================
  function cycPath(ctx){
    var x=CYC.x, w=CYC.w, top=CYC.top, fl=CYC.floor;
    ctx.beginPath();
    ctx.moveTo(x,top); ctx.lineTo(x+w,top); ctx.lineTo(x+w,fl);
    ctx.quadraticCurveTo(x+w, fl+50, x+w-60, fl+50);
    ctx.lineTo(x+60, fl+50);
    ctx.quadraticCurveTo(x, fl+50, x, fl);
    ctx.closePath();
  }
  function drawBackdrop(ctx){
    var st = BACKDROPS[backdrop];
    var x=CYC.x, w=CYC.w, top=CYC.top, fl=CYC.floor, h=(fl+50)-top;
    ctx.save(); cycPath(ctx); ctx.clip();
    if(st.kind === 'flat'){
      ctx.fillStyle = st.col; ctx.fillRect(x-4,top-4,w+8,h+8);
      ctx.fillStyle = st.hi; ctx.globalAlpha = .18;
      for(var y=top;y<fl+50;y+=18) ctx.fillRect(x, y, w, 2);
      ctx.globalAlpha = 1;
    } else if(st.kind === 'soft'){
      ctx.fillStyle = st.col; ctx.fillRect(x-4,top-4,w+8,h+8);
      var g = ctx.createLinearGradient(0,top,0,fl+40);
      g.addColorStop(0,st.hi); g.addColorStop(1,'rgba(0,0,0,0)');
      ctx.globalAlpha = .5; ctx.fillStyle = g; ctx.fillRect(x-4,top,w+8,h); ctx.globalAlpha = 1;
    } else { // photo — cover-fit, pixelated for art consistency
      var im = photo(st.src);
      ctx.fillStyle = '#05070d'; ctx.fillRect(x-4,top-4,w+8,h+8);
      if(im && im.complete && im.naturalWidth){
        ctx.imageSmoothingEnabled = false;
        var ir = im.naturalWidth/im.naturalHeight, br = w/h, dw, dh, dx, dy;
        if(ir > br){ dh = h; dw = h*ir; dx = x-(dw-w)/2; dy = top; }
        else { dw = w; dh = w/ir; dx = x; dy = top-(dh-h)/2; }
        ctx.drawImage(im, dx, dy, dw, dh);
      } else {
        ctx.fillStyle = C.teal; ctx.font = "14px 'Silkscreen', monospace"; ctx.textAlign='center';
        ctx.fillText('loading…', x+w/2, top+h/2);
      }
    }
    ctx.restore();
    // rig bar across the top
    ctx.fillStyle = C.metalDk; ctx.fillRect(x-6,top-10,w+12,12);
    addHit('backdrop','backdrop',x,top,w,h);
  }

  // ============================================================
  //  KEY LIGHTS (C-stand + head) + floor pools
  // ============================================================
  // ============================================================
  //  LIGHTING — ported verbatim from mockup_prod_A (the reference look):
  //  Godox SL/AD-600 heads on C-stands + RGB tubes + floor key pools. Luminance
  //  and halo size track each light's live state. (mockup t was ms; here t is
  //  seconds, so t/900 -> t*1.1.)
  // ============================================================
  function glow(hex, a){
    var r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }
  function godoxHeadPos(sx, side){
    var riserTop = 150, armY = riserTop + 10, armLen = 76;
    var dir = side === 'left' ? 1 : -1;
    var armEndX = sx + dir * armLen;
    return { hx: armEndX, hy: armY + 34, armEndX: armEndX, armY: armY };
  }
  function drawGodoxHead(ctx, hx, hy, rgb, lum, mode, knuckX, knuckY){
    var col = rgba(rgb, 1), R = 42;
    // yoke arms from knuckle down to the head sides
    ctx.strokeStyle = C.metalDk; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(knuckX, knuckY+10); ctx.lineTo(hx-R+6, hy-6);
    ctx.moveTo(knuckX, knuckY+10); ctx.lineTo(hx+R-6, hy-6); ctx.stroke();
    // round reflector dish
    ctx.fillStyle = '#0e1525'; ctx.beginPath(); ctx.arc(hx,hy,R+4,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = C.metal; ctx.beginPath(); ctx.arc(hx,hy,R,0,Math.PI*2); ctx.fill();
    // glowing LED face — hot white core shrinks as the light dims
    var g = ctx.createRadialGradient(hx,hy,2,hx,hy,R-4);
    g.addColorStop(0, 'rgba(255,255,255,' + (0.55 + 0.45*lum) + ')');
    g.addColorStop(0.20 + 0.18*lum, col);
    g.addColorStop(1, 'rgba(255,255,255,.06)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(hx,hy,R-6,0,Math.PI*2); ctx.fill();
    // concentric LED ring detail
    ctx.strokeStyle = 'rgba(10,14,26,.5)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(hx,hy,R-14,0,Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.arc(hx,hy,R-24,0,Math.PI*2); ctx.stroke();
    // body box + warm/cool LED dot
    ctx.fillStyle = '#2a3346'; ctx.fillRect(hx-12, hy-R-16, 24, 16);
    ctx.fillStyle = mode === 'warm' ? '#ffb070' : '#bfeeff'; ctx.fillRect(hx-4, hy-R-12, 8, 6);
    // soft halo — colour = chromaticity, radius + opacity scale with luminance
    var hr = R * (1.35 + 0.55*lum);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    var hg = ctx.createRadialGradient(hx,hy,4,hx,hy,hr);
    hg.addColorStop(0, rgba(rgb, 0.18 + 0.34*lum)); hg.addColorStop(1, rgba(rgb, 0));
    ctx.fillStyle = hg; ctx.fillRect(hx-hr, hy-hr, hr*2, hr*2);
    ctx.restore();
    return { x: hx-R-6, y: hy-R-6, w: (R+6)*2, h: (R+6)*2 };
  }
  function drawGodoxLight(ctx, sx, side){
    var mode = lights[side], prof = LIGHT_PROFILE[mode], lum = lightLum[side];
    var baseY = floorY + 12, riserTop = 150;
    // floor hub + base
    ctx.fillStyle = '#11182b'; ctx.beginPath(); ctx.ellipse(sx, baseY, 40, 11, 0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = C.metalDk; ctx.fillRect(sx-34, baseY-3, 68, 6); ctx.fillRect(sx-24, baseY-8, 48, 6);
    // vertical riser column
    ctx.fillStyle = C.metalDk; ctx.fillRect(sx-3, riserTop, 6, baseY-riserTop-12);
    ctx.fillStyle = C.metal;   ctx.fillRect(sx-3, riserTop, 6, 8);
    ctx.fillStyle = '#222c44'; ctx.fillRect(sx-6, riserTop+6, 12, 8);
    // horizontal grip arm toward set centre + knuckle clamp
    var dir = side === 'left' ? 1 : -1, armY = riserTop+10, armLen = 76, armEndX = sx + dir*armLen;
    ctx.fillStyle = C.metalDk;
    if(dir > 0) ctx.fillRect(sx, armY, armLen, 6); else ctx.fillRect(sx-armLen, armY, armLen, 6);
    ctx.fillStyle = C.metal;   ctx.fillRect(armEndX-7, armY-6, 14, 18);
    ctx.fillStyle = '#222c44'; ctx.fillRect(armEndX-7, armY-6, 14, 4);
    ctx.fillStyle = '#222c44'; ctx.fillRect(armEndX-7, armY+8, 14, 4);
    var box = drawGodoxHead(ctx, armEndX, armY+34, prof.rgb, lum, mode, armEndX, armY);
    addHit('light-'+side, 'light', box.x, box.y, box.w, box.h, { side:side });
  }
  function drawTube(ctx, baseX, baseY, col){
    var h = 120, w = 14, tx = baseX-w/2, ty = baseY-h;
    ctx.fillStyle = '#15182a'; ctx.fillRect(tx-2, ty-6, w+4, 8);      // top cap
    ctx.fillStyle = '#15182a'; ctx.fillRect(tx-2, baseY-6, w+4, 10);  // base/handle
    var g = ctx.createLinearGradient(tx,ty,tx+w,ty);
    g.addColorStop(0,'rgba(255,255,255,.25)'); g.addColorStop(.5,col); g.addColorStop(1,'rgba(0,0,0,.25)');
    ctx.fillStyle = g; ctx.fillRect(tx,ty,w,h);
    ctx.fillStyle = '#ffffff'; ctx.globalAlpha = .55; ctx.fillRect(tx+w/2-1, ty+4, 2, h-8); ctx.globalAlpha = 1;
    var tg = ctx.createRadialGradient(baseX,baseY-h/2,6,baseX,baseY-h/2,90);
    tg.addColorStop(0, glow(col,.30)); tg.addColorStop(1, glow(col,0));
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = tg; ctx.fillRect(baseX-90, baseY-h/2-90, 180, 180);
    ctx.restore();
    return { x: tx-6, y: ty-8, w: w+12, h: h+18 };
  }
  function drawTubes(ctx){
    var tcx = 1075, ty = 520, w = 120;          // folding side table
    ctx.fillStyle = '#3a2916'; ctx.fillRect(tcx-w/2, ty+12, 8, 56); ctx.fillRect(tcx+w/2-8, ty+12, 8, 56);
    ctx.fillStyle = C.wood; ctx.fillRect(tcx-w/2, ty, w, 12);
    ctx.fillStyle = '#a06a30'; ctx.fillRect(tcx-w/2, ty, w, 4);
    var bx = [1050, 1100];
    for(var i=0;i<tubes.length;i++){
      var box = drawTube(ctx, bx[i], ty, RGB16[tubes[i].idx]);
      addHit('tube-'+i, 'tube', box.x, box.y, box.w, box.h, { tube:i });
    }
  }
  function drawKeyPool(ctx, mode, lum, headX){
    var rgb = LIGHT_PROFILE[mode].rgb;
    var pxn = headX*0.55 + 612*0.45, py = 500;   // pool biased from head toward set
    var pulse = 0.05 * Math.sin(t * 1.1);
    var R = 150 + 110*lum, a0 = (0.10 + 0.26*lum) + pulse;
    var g = ctx.createRadialGradient(pxn,py,10,pxn,py,R);
    g.addColorStop(0, rgba(rgb, a0)); g.addColorStop(1, rgba(rgb, 0));
    ctx.fillStyle = g; ctx.fillRect(pxn-R, py-R, R*2, R*2);
  }
  function drawLightPools(ctx){
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    var pulse = 0.06 * Math.sin(t * 1.1);
    drawKeyPool(ctx, lights.left,  lightLum.left,  godoxHeadPos(250,'left').hx);
    drawKeyPool(ctx, lights.right, lightLum.right, godoxHeadPos(1030,'right').hx);
    // hero centre warm pool (a fixed key, not a toggle)
    var g = ctx.createRadialGradient(612,470,10,612,470,250);
    g.addColorStop(0, 'rgba(255,224,102,' + (0.26+pulse) + ')'); g.addColorStop(1, 'rgba(255,224,102,0)');
    ctx.fillStyle = g; ctx.fillRect(350,260,520,400);
    ctx.restore();
  }
  // dust motes drifting in the light
  var motes = [];
  (function(){ for(var i=0;i<14;i++){ motes.push({ x:300+Math.random()*640, y:200+Math.random()*300, s:0.15+Math.random()*0.3, r:1+Math.random()*2, ph:Math.random()*6 }); } })();
  function drawMotes(ctx){
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for(var i=0;i<motes.length;i++){ var m = motes[i];
      var y = m.y - ((t*25*m.s + m.ph*60) % 420);
      ctx.fillStyle = 'rgba(255,245,210,' + (0.10 + 0.10*Math.sin(t*2 + m.ph)).toFixed(3) + ')';
      ctx.fillRect(m.x, y, m.r, m.r);
    }
    ctx.restore();
  }

  // ============================================================
  //  PRODUCT STANDS (turntable + prop). 2 visible, tap swaps that one.
  // ============================================================
  function drawTurntable(ctx, cx, baseY){
    ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(cx,baseY+4,30,8,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = '#2a3550'; ctx.beginPath(); ctx.ellipse(cx,baseY,28,7,0,0,Math.PI*2); ctx.fill();
  }
  function drawProduct(ctx, key, cx, baseY, spin){
    var wob = Math.sin(spin)*3;        // tiny spin wobble
    ctx.save(); ctx.translate(cx+wob, 0);
    switch(key){
      case 'cola':
        px(ctx,-9,baseY-58,18,58,'#c0202a'); px(ctx,-9,baseY-58,4,58,'#e23b45');
        px(ctx,-9,baseY-40,18,10,'#f4e8cf'); px(ctx,-9,baseY-58,18,5,'#8a1620'); break;
      case 'chips':
        px(ctx,-16,baseY-50,32,50,'#e8a01f'); px(ctx,-16,baseY-50,32,10,'#ffd23a');
        px(ctx,-10,baseY-34,20,14,'#b9311f'); break;
      case 'soda':
        px(ctx,-8,baseY-50,16,50,'#27c6ff'); px(ctx,-8,baseY-50,16,6,'#9fe8ff');
        px(ctx,-8,baseY-34,16,9,'#f4f0e4'); break;
      case 'cream':
        px(ctx,-12,baseY-40,24,40,'#ffd84a'); px(ctx,-7,baseY-50,14,12,'#ffffff');
        px(ctx,-12,baseY-26,24,8,'#e8a01f'); break;
      case 'masala':
        px(ctx,-11,baseY-52,22,52,'#d8492f'); px(ctx,-11,baseY-52,22,8,'#ffd23a');
        px(ctx,-7,baseY-36,14,12,'#7a1d12'); break;
      case 'chicken': // rubber chicken
        px(ctx,-6,baseY-54,12,30,'#ffe23a'); px(ctx,-7,baseY-26,9,26,'#ffe23a');
        px(ctx,-12,baseY-58,12,8,'#ffe23a'); px(ctx,-14,baseY-56,5,4,'#e23b45');
        px(ctx,-3,baseY-55,2,2,'#10131f'); break;
      case 'plunger':
        px(ctx,-3,baseY-52,6,42,'#6a4326'); px(ctx,-13,baseY-12,26,14,'#d2453a');
        px(ctx,-13,baseY-12,26,4,'#e8584c'); break;
      case 'banana':
        ctx.fillStyle='#f4d23a'; ctx.beginPath(); ctx.moveTo(-14,baseY-8);
        ctx.quadraticCurveTo(-6,baseY-56,18,baseY-44); ctx.quadraticCurveTo(-2,baseY-42,-6,baseY-6);
        ctx.closePath(); ctx.fill(); px(ctx,16,baseY-46,4,5,'#6a4d12'); break;
      case 'whoopee':
        ctx.fillStyle='#c43a3a'; ctx.beginPath(); ctx.ellipse(0,baseY-9,18,10,0,0,Math.PI*2); ctx.fill();
        px(ctx,13,baseY-11,13,5,'#9c2a2a'); break;
      case 'tproll':
        px(ctx,-13,baseY-30,26,30,'#f4f0e4'); ctx.fillStyle='#d8d2c4';
        ctx.beginPath(); ctx.ellipse(0,baseY-30,13,5,0,0,Math.PI*2); ctx.fill();
        px(ctx,-4,baseY-30,8,30,'#cfc8b8'); break;
      case 'chappal': // flip-flop
        ctx.fillStyle='#3a6ea5'; ctx.beginPath(); ctx.ellipse(0,baseY-6,16,8,0,0,Math.PI*2); ctx.fill();
        px(ctx,-1,baseY-16,2,12,'#1f3f66'); px(ctx,-9,baseY-13,9,3,'#1f3f66'); break;
      case 'potato':
        ctx.fillStyle='#b98a52'; ctx.beginPath(); ctx.ellipse(0,baseY-16,16,16,0,0,Math.PI*2); ctx.fill();
        px(ctx,-6,baseY-20,3,3,'#7a5a32'); px(ctx,4,baseY-12,3,3,'#7a5a32'); break;
      case 'hotsauce':
        px(ctx,-7,baseY-48,14,48,'#c41e1e'); px(ctx,-3,baseY-56,6,8,'#7a1212');
        px(ctx,-7,baseY-34,14,12,'#ffe066'); break;
      case 'pickle':
        px(ctx,-10,baseY-46,20,46,'#5a7a2a'); px(ctx,-10,baseY-46,20,6,'#cfc070');
        px(ctx,-7,baseY-30,14,12,'#3a5a18'); break;
      case 'agarbatti': // incense sticks + a wisp of smoke
        px(ctx,-1,baseY-50,2,50,'#6a4326'); px(ctx,-6,baseY-50,2,50,'#6a4326'); px(ctx,4,baseY-50,2,50,'#6a4326');
        px(ctx,-8,baseY-6,16,6,'#9c4537');
        ctx.fillStyle='rgba(210,210,210,0.4)'; ctx.fillRect(-1, baseY-62, 2, 12); break;
      default:
        px(ctx,-9,baseY-50,18,50,'#9b59d6');
    }
    ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(-2, baseY-44, 2, 24);
    ctx.restore();
  }
  function drawProducts(ctx){
    for(var i=0;i<PRODUCT_SLOTS.length;i++){
      var sl = PRODUCT_SLOTS[i];
      drawTurntable(ctx, sl.cx, sl.baseY);
      drawProduct(ctx, PRODUCTS[slotProduct[i]], sl.cx, sl.baseY, slotSpin[i]);
      addHit('product-'+i,'product', sl.cx-32, sl.baseY-66, 64, 74, { slot:i });
    }
  }

  // ============================================================
  //  CAMERA — three distinct bodies, mounted on a tripod by the camera op
  // ============================================================
  function drawCamera(ctx, cx, topY, working, faceLeft){
    ctx.save();
    if(faceLeft){ ctx.translate(cx*2, 0); ctx.scale(-1, 1); } // mirror so the lens aims at the backdrop
    // tripod legs
    ctx.strokeStyle = C.metalDk; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(cx,topY+22); ctx.lineTo(cx-22,topY+78); ctx.moveTo(cx,topY+22); ctx.lineTo(cx+22,topY+78);
    ctx.moveTo(cx,topY+22); ctx.lineTo(cx,topY+80); ctx.stroke();
    ctx.fillStyle = C.metal; ctx.fillRect(cx-4, topY+14, 8, 12); // head/ball
    if(cameraIdx===0){
      // FX-3 — compact boxy cage + top handle + small lens
      px(ctx,cx-18,topY-12,36,28,'#1b2230'); px(ctx,cx-18,topY-12,36,5,'#2c3850');
      px(ctx,cx-8,topY-22,20,8,'#11161f');           // top handle bar
      px(ctx,cx-6,topY-20,4,8,'#11161f'); px(ctx,cx+4,topY-20,4,8,'#11161f');
      px(ctx,cx+14,topY-6,16,16,'#0c1018');          // lens
      ctx.fillStyle='#2a3550'; ctx.beginPath(); ctx.arc(cx+22,topY+2,6,0,Math.PI*2); ctx.fill();
    } else if(cameraIdx===1){
      // FX-6 — larger cinema body, side handle + EVF + long lens
      px(ctx,cx-22,topY-14,40,32,'#15202e'); px(ctx,cx-22,topY-14,40,5,'#27384e');
      px(ctx,cx-34,topY-2,14,10,'#0c1420');          // side handle
      px(ctx,cx-30,topY-12,10,7,'#0c1420');          // EVF
      px(ctx,cx+16,topY-8,26,20,'#0a0e16');          // long lens barrel
      ctx.fillStyle='#34507a'; ctx.beginPath(); ctx.arc(cx+40,topY+2,7,0,Math.PI*2); ctx.fill();
    } else {
      // Sony S3 — compact mirrorless: small body, prominent lens + mode dial
      px(ctx,cx-16,topY-10,30,24,'#202734'); px(ctx,cx-16,topY-10,30,5,'#33415a');
      px(ctx,cx+6,topY-16,9,8,'#11161f');            // viewfinder hump
      px(ctx,cx-12,topY-15,6,5,'#0c1420');           // mode dial
      px(ctx,cx+12,topY-6,18,18,'#0a0e16');          // big round lens
      ctx.fillStyle='#3a6ea5'; ctx.beginPath(); ctx.arc(cx+21,topY+3,7,0,Math.PI*2); ctx.fill();
    }
    // REC tally when shooting
    if(working){
      var on = Math.floor(t*1.6)%2===0;
      ctx.fillStyle = on ? C.red : 'rgba(255,92,92,0.25)';
      ctx.beginPath(); ctx.arc(cx-14, topY-8, 3, 0, Math.PI*2); ctx.fill();
    }
    ctx.restore();
    // (camera model is NOT labelled on the set — tapping the camera toasts the
    //  name, the same way the lights/tubes announce their state)
    addHit('camera','camera', cx-34, topY-24, 76, 46);
  }

  // ============================================================
  //  CREW — real production staff drawn with the MAIN-SCREEN sprite art
  // ============================================================
  function isWorking(st){ return !!st.briefId; }
  function workingBrief(st){
    if(!st.briefId || !G.state.briefs) return null;
    for(var i=0;i<G.state.briefs.length;i++){ if(G.state.briefs[i].id === st.briefId) return G.state.briefs[i]; }
    return null;
  }
  // A full standing pixel person WITH legs — generated from the staffer's id so
  // each crew member looks like a distinct character. Idle = gentle sway; working
  // = the far arm pumps (shooting / operating). Returns the head-top y for labels.
  function drawStudioPerson(ctx, st, cx, footY, working, isCam, idx){
    var hsh = hashStr(st.id || ('crew'+idx));
    var skin  = SKINS[hsh % SKINS.length];
    var hair  = HAIRS[(hsh >> 3) % HAIRS.length];
    var shirt = SHIRTS[(hsh >> 6) % SHIRTS.length];
    var sway  = Math.sin(t * 1.4 + idx) * 1.4;          // calm idle body sway
    cx = Math.round(cx + sway);
    // ground shadow
    ctx.fillStyle = 'rgba(0,0,0,0.30)'; ctx.beginPath(); ctx.ellipse(cx, footY + 2, 22, 6, 0,0,Math.PI*2); ctx.fill();
    // LEGS + shoes
    ctx.fillStyle = '#2a3346';
    ctx.fillRect(cx - 12, footY - 30, 9, 30);
    ctx.fillRect(cx + 3,  footY - 30, 9, 30);
    ctx.fillStyle = '#10131f';
    ctx.fillRect(cx - 14, footY - 6, 12, 6);
    ctx.fillRect(cx + 2,  footY - 6, 12, 6);
    // TORSO
    ctx.fillStyle = shirt; ctx.fillRect(cx - 14, footY - 58, 28, 30);
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(cx - 14, footY - 58, 28, 4);
    // ARMS (far arm raises/pumps while working)
    var wag = working ? Math.round(Math.sin(t * 3 + idx) * 3) : 0;
    ctx.fillStyle = shirt;
    ctx.fillRect(cx - 21, footY - 56, 7, 24);
    ctx.fillRect(cx + 14, footY - 56 - wag, 7, 24);
    ctx.fillStyle = skin;
    ctx.fillRect(cx - 21, footY - 34, 7, 6);
    ctx.fillRect(cx + 14, footY - 34 - wag, 7, 6);
    // NECK + HEAD
    ctx.fillStyle = skin;
    ctx.fillRect(cx - 4, footY - 62, 8, 5);
    ctx.fillRect(cx - 10, footY - 80, 20, 20);
    // HAIR
    ctx.fillStyle = hair;
    ctx.fillRect(cx - 10, footY - 80, 20, 6);
    ctx.fillRect(cx - 10, footY - 80, 4, 11);
    ctx.fillRect(cx + 6,  footY - 80, 4, 11);
    // EYES
    ctx.fillStyle = '#10131f';
    ctx.fillRect(cx - 5, footY - 72, 2, 3);
    ctx.fillRect(cx + 3, footY - 72, 2, 3);
    return footY - 80;
  }
  // which working action a crew member performs:
  //   Preet -> iPhone shooter, the camera op -> operates the rig, everyone else
  //   -> clapper/slate. (Names checked too, so it survives id reshuffles.)
  function studioRole(st, isCam){
    var nm = (st.name || '').toLowerCase();
    if(st.id === 's_natasha' || nm.indexOf('preet') >= 0) return 'phone';
    if(isCam) return 'camera';
    return 'clap';
  }
  // a film slate that claps open/shut
  function drawClapboard(ctx, x, y){
    var open = Math.floor(t * 1.6) % 2 === 0;
    ctx.fillStyle = '#0c1322'; ctx.fillRect(x, y, 24, 16);            // board
    for(var s=0;s<4;s++){ ctx.fillStyle = '#f4e8cf'; ctx.fillRect(x+2+s*5.5, y+10, 3, 4); }
    ctx.save(); ctx.translate(x, y); ctx.rotate(open ? -0.5 : -0.04); // hinged clapper stick
    for(var k=0;k<4;k++){ ctx.fillStyle = k%2 ? '#0c1322' : '#f4e8cf'; ctx.fillRect(k*6, -5, 6, 5); }
    ctx.restore();
  }
  // a phone held up, vertical, screen glowing
  function drawPhoneProp(ctx, x, y){
    var wag = Math.sin(t * 3) * 1.5;
    ctx.save(); ctx.translate(x, y + wag);
    ctx.fillStyle = '#0a0f1c'; ctx.fillRect(-2, -2, 14, 28);
    ctx.fillStyle = '#274b7a'; ctx.fillRect(0, 0, 10, 24);
    ctx.fillStyle = 'rgba(159,232,255,0.55)'; ctx.fillRect(1, 1, 8, 9);
    ctx.restore();
  }
  function drawCrewMember(ctx, st, mark, idx, isCam){
    var ox = mark.x, footY = mark.y, working = isWorking(st);
    var W = 58, H = 88, topY = footY - H;
    // ground shadow
    ctx.fillStyle = 'rgba(0,0,0,0.30)'; ctx.beginPath(); ctx.ellipse(ox, footY+2, 22, 6, 0,0,Math.PI*2); ctx.fill();
    // BODY = the real office character sprite (same faces/look as the first
    // screen), full-body standing. Calm 2-frame flip while working. If art is
    // missing, fall back to the generated figure.
    var frame = working ? Math.floor(t*2.2 + idx)%2 : 0;
    var sp = G.data.sprite(st.portraitKey);
    if(sp && sp.img){ G.render.drawSprite(ctx, st.portraitKey, Math.round(ox - W/2), topY, W, H, frame); }
    else { drawStudioPerson(ctx, st, ox, footY, working, isCam, idx); }
    // role-specific working prop / animation
    if(working){
      var role = studioRole(st, isCam);
      if(role === 'phone') drawPhoneProp(ctx, ox + 12, topY + 34);
      else if(role === 'clap') drawClapboard(ctx, ox + 10, topY + 30);
      // 'camera' op stands at the tripod rig (drawn in drawCrew) — its REC blinks
    }
    // name above head
    var first = (st.name || '').split(' ')[0];
    ctx.fillStyle = working ? C.gold : 'rgba(244,232,207,0.8)';
    ctx.font = "12px 'VT323', monospace"; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(first, ox, topY - 6);
    addHit('crew-'+st.id, 'crew', ox - W/2, topY, W, H, { staffId: st.id });
    // progress bar while shooting (from the REAL brief)
    if(working){
      var b = workingBrief(st);
      if(b && b.workNeeded){
        var p = Math.max(0, Math.min(1, b.workDone / b.workNeeded));
        ctx.fillStyle = '#0c1322'; ctx.fillRect(ox-22, topY-20, 44, 6);
        ctx.fillStyle = C.green;  ctx.fillRect(ox-22, topY-20, 44*p, 6);
      }
    }
  }
  function drawCrew(ctx){
    var crew = productionCrew();
    if(!crew.length){
      ctx.fillStyle = 'rgba(244,232,207,0.85)'; ctx.font = "20px 'VT323', monospace"; ctx.textAlign='center';
      ctx.fillText('No production crew yet — hire a shooter to start shooting.', 640, 300);
      return;
    }
    for(var i=0;i<crew.length && i<MARKS.length;i++){
      drawCrewMember(ctx, crew[i], MARKS[i], i, i===0);
    }
    // the camera the op operates sits on a tripod just to their left, OFF the
    // backdrop, flipped to aim left at the cyclorama.
    var camMark = MARKS[0];
    drawCamera(ctx, camMark.x - 60, camMark.y - 80, isWorking(crew[0]), true);
  }

  // ============================================================
  //  STATUS CARD (tap a crew member)
  // ============================================================
  var cardRect = null;
  function drawCard(ctx){
    var crew = productionCrew();
    var st = null; for(var i=0;i<crew.length;i++){ if(crew[i].id===openCardId) st=crew[i]; }
    if(!st){ openCardId = null; return; }
    var w=212, h=96, x=Math.min(1280-w-16, Math.max(16, 640-w/2)), y=120;
    cardRect = { x:x, y:y, w:w, h:h };
    ctx.fillStyle = 'rgba(13,20,38,0.96)'; ctx.fillRect(x,y,w,h);
    ctx.strokeStyle = C.gold; ctx.lineWidth = 2; ctx.strokeRect(x+1,y+1,w-2,h-2);
    ctx.textAlign='left'; ctx.textBaseline='top';
    ctx.fillStyle = C.gold; ctx.font = "12px 'Silkscreen', monospace"; ctx.fillText(st.name, x+10, y+10);
    ctx.fillStyle = C.teal; ctx.font = "16px 'VT323', monospace";
    ctx.fillText('Production · skill ' + (st.skill||'?'), x+10, y+30);
    var b = workingBrief(st);
    ctx.fillStyle = b ? C.green : 'rgba(244,232,207,0.8)';
    ctx.fillText(b ? ('Shooting: ' + (b.title||'a brief')) : 'Idle — drag a shoot onto the set.', x+10, y+52);
    if(st.burnout != null){ ctx.fillStyle = C.warm; ctx.fillText('Burnout ' + Math.round(st.burnout) + '%', x+10, y+72); }
  }

  // ============================================================
  //  NAV — BACK to office (top-left chip) + studio title
  // ============================================================
  function drawChrome(ctx){
    // back arrow chip — sits BELOW the 40px HUD top bar (y0..60) so it never
    // overlaps the money/clock chips. (No on-canvas title: the right side is
    // owned by the HUD clock + the brief-offer stack.)
    var by = 66;
    ctx.fillStyle = '#10182b'; ctx.fillRect(16, by, 150, 30);
    ctx.strokeStyle = C.gold; ctx.lineWidth = 2; ctx.strokeRect(17, by+1, 148, 28);
    ctx.fillStyle = C.gold; ctx.font = "12px 'Silkscreen', monospace"; ctx.textAlign='left'; ctx.textBaseline='middle';
    ctx.fillText('◀ OFFICE · STUDIO', 30, by+16);
    addHit('nav-office','nav', 16, by, 150, 30);
  }

  // first-entry curiosity hint (auto-fades)
  var hintT = 0;
  function drawHint(ctx){
    if(hintT <= 0) return;
    var a = Math.min(1, hintT);
    ctx.save(); ctx.globalAlpha = a;
    var msg = 'Be curious — tap the crew, the camera, the lights, the products and the backdrop.';
    ctx.font = "18px 'VT323', monospace"; ctx.textAlign = 'center';
    var w = ctx.measureText(msg).width + 28;
    ctx.fillStyle = 'rgba(13,20,38,0.92)'; ctx.fillRect(640-w/2, 86, w, 30);
    ctx.strokeStyle = C.gold; ctx.lineWidth = 2; ctx.strokeRect(640-w/2+1, 87, w-2, 28);
    ctx.fillStyle = C.cream; ctx.textBaseline='middle'; ctx.fillText(msg, 640, 102);
    ctx.restore();
  }

  // ============================================================
  //  PUBLIC API
  // ============================================================
  G.render.studio = {
    SET: SET,
    enter: function(){
      if(!G.state) return;
      G.state.scene = 'studio';
      if(firstEntry && studioUnlocked()){ hintT = 7; firstEntry = false; }
      if(G.audio && G.audio.accept) G.audio.accept();
    },
    exit: function(){ if(G.state) G.state.scene = 'office'; if(G.audio && G.audio.click) G.audio.click(); },

    draw: function(ctx, dt){
      t += dt;
      hits.length = 0;
      // ease product spins back to rest
      for(var i=0;i<slotSpin.length;i++) slotSpin[i] += (0 - slotSpin[i]) * Math.min(1, dt*4.5);
      // ramp light luminance toward target so warm<->cool toggle is smooth
      lightLum.left  += (LIGHT_PROFILE[lights.left ].lum - lightLum.left ) * Math.min(1, dt*8);
      lightLum.right += (LIGHT_PROFILE[lights.right].lum - lightLum.right) * Math.min(1, dt*8);
      if(hintT > 0) hintT -= dt;

      ctx.clearRect(0,0,1280,720);
      drawRoom(ctx);
      // not unlocked yet → show the locked screen (only the BACK button works)
      if(!studioUnlocked()){
        drawLocked(ctx);
        drawChrome(ctx);
        return;
      }
      drawBackdrop(ctx);
      drawLightPools(ctx);
      drawGodoxLight(ctx, 250, 'left');
      drawGodoxLight(ctx, 1030, 'right');
      drawTubes(ctx);
      drawProducts(ctx);
      drawCrew(ctx);
      drawMotes(ctx);
      cardRect = null;
      if(openCardId) drawCard(ctx);
      drawChrome(ctx);
      drawHint(ctx);
    },

    // drag-drop hooks used by dock.js
    isOverSet: function(lx, ly){ return lx>=SET.x && lx<=SET.x+SET.w && ly>=SET.y && ly<=SET.y+SET.h; },
    assignDrop: function(brief){
      if(!brief) return false;
      // production people only shoot — they don't take edit/design/content tasks
      if(brief.role && brief.role !== 'production'){
        toast('NOT A SHOOT', 'Production only shoots. Edits go to the editors’ desks.', 'bad');
        return false;
      }
      var crew = productionCrew();
      if(!crew.length){ toast('NO CREW', 'Hire a production shooter first.', 'bad'); return false; }
      // an idle, on-clock crew member picks it up — real assign pipeline
      var free = crew.filter(function(st){ return !st.briefId && (!G.time || G.time.onClock(st)); });
      if(!free.length){ toast('CREW BUSY', 'Every shooter is mid-take. Wait for a wrap.', 'bad'); return false; }
      G.briefs.assign(brief, free[0]);
      toast('ROLLING', free[0].name.split(' ')[0] + ' is shooting ' + (brief.title||'the brief') + '.', 'good');
      if(G.audio && G.audio.accept) G.audio.accept();
      return true;
    },

    handleClick: function(lx, ly){
      // card swallows clicks inside it
      if(openCardId && cardRect && inBox(cardRect, lx, ly)) return;
      var hit = null;
      for(var i=hits.length-1;i>=0;i--){ if(inBox(hits[i], lx, ly)){ hit = hits[i]; break; } }
      if(!hit){ openCardId = null; return; }
      if(hit.type === 'nav'){ this.exit(); return; }
      if(hit.type === 'crew'){ openCardId = (openCardId===hit.staffId) ? null : hit.staffId; if(G.audio) G.audio.click(); return; }
      if(hit.type === 'camera'){ openCardId=null; cameraIdx=(cameraIdx+1)%CAMERAS.length; toast('CAMERA', 'Body → ' + CAMERAS[cameraIdx] + '.', ''); if(G.audio) G.audio.click(); return; }
      if(hit.type === 'light'){ openCardId=null; var s=hit.side; lights[s] = lights[s]==='warm'?'cool':'warm'; toast('KEY LIGHT', (s==='left'?'Left':'Right')+' light → '+lights[s].toUpperCase()+'.', ''); if(G.audio) G.audio.click(); return; }
      if(hit.type === 'tube'){ openCardId=null; var ti=hit.tube; tubes[ti].idx=(tubes[ti].idx+1)%RGB16.length; toast('RGB TUBE', 'Tube '+(ti+1)+' → colour '+(tubes[ti].idx+1)+'/16.', ''); if(G.audio) G.audio.click(); return; }
      if(hit.type === 'product'){ openCardId=null; var sl=hit.slot; slotSpin[sl]=Math.PI*2; slotProduct[sl]=(slotProduct[sl]+1)%PRODUCTS.length; if(G.audio) G.audio.click(); return; }
      if(hit.type === 'backdrop'){ openCardId=null; backdrop=(backdrop+1)%BACKDROPS.length; if(G.audio) G.audio.click(); return; }
      openCardId = null;
    },

    // light hover support (cursor feedback handled by main.js)
    setHover: function(){ /* no-op; studio uses tap, not hover */ }
  };
})();
