// CravAche TRIAL module: trial_tutorial — Day-Zero onboarding for brand-new players.
// Loaded only by trial.html. Teaches the ONE core verb: drag a brief from the
// tray onto a desk. Runtime DOM only; no other files touched.
(function(){
  "use strict";
  if(!window.G) return;
  window.CRAVACHE_TRIAL = true;

  var FLAG = 'cravache_tut_done';
  var Z = 95;
  var rootEl = null;        // overlay root (one SVG-mask backdrop + caption card)
  var active = false;
  var stepIdx = 0;
  var resizeBound = false;

  // ---- step script (short, dry agency voice) ----
  // target() returns an element or null. If null, the step is skipped gracefully.
  var STEPS = [
    {
      target: function(){ return document.getElementById('tray') ||
                                 document.querySelector('.tray-wrap'); },
      text: "You're Client Servicing. Briefs land in your TRAY ↓",
      pad: 10
    },
    {
      target: function(){ return document.getElementById('game'); },
      text: "Drag a brief onto someone's desk to put them on it.",
      pad: -180   // shrink the canvas hole toward its centre (desks live mid-stage)
    },
    {
      target: function(){ return document.getElementById('wa-launcher'); },
      text: "They work, then the client reacts — check WhatsApp 💬",
      pad: 8
    },
    {
      target: function(){ return document.getElementById('chip-chaos'); },
      text: "Survive the week. Don't let CHAOS hit 100.",
      pad: 8
    }
  ];

  // ---------- styling (pixel UI, navy/cream/teal/gold) ----------
  function injectCss(){
    if(document.getElementById('tut-css')) return;
    var s = document.createElement('style');
    s.id = 'tut-css';
    s.textContent = [
      '#tut-root{position:fixed;inset:0;z-index:'+Z+';font-family:"Silkscreen",monospace;',
      '  -webkit-user-select:none;user-select:none;}',
      '#tut-root .tut-backdrop{position:absolute;inset:0;pointer-events:auto;}',
      '#tut-root .tut-ring{position:absolute;border:3px solid #f4c84b;border-radius:6px;',
      '  box-shadow:0 0 0 2px #0b1b2b, 0 0 18px 4px rgba(244,200,75,.45);',
      '  pointer-events:none;transition:all .18s ease;}',
      '#tut-root .tut-card{position:absolute;max-width:300px;background:#0b1b2b;color:#f4efe3;',
      '  border:3px solid #f4c84b;box-shadow:5px 5px 0 #000;padding:12px 13px 11px;',
      '  pointer-events:auto;transition:all .18s ease;}',
      '#tut-root .tut-step{font-size:9px;letter-spacing:1px;color:#3fb8b0;margin-bottom:6px;}',
      '#tut-root .tut-text{font-family:"VT323",monospace;font-size:21px;line-height:1.12;',
      '  color:#f4efe3;margin-bottom:11px;}',
      '#tut-root .tut-btns{display:flex;align-items:center;justify-content:space-between;gap:10px;}',
      '#tut-root .tut-next{font-family:"Silkscreen",monospace;font-size:11px;cursor:pointer;',
      '  background:#3fb8b0;color:#072019;border:2px solid #000;box-shadow:2px 2px 0 #000;',
      '  padding:7px 14px;}',
      '#tut-root .tut-next:active{transform:translate(2px,2px);box-shadow:0 0 0 #000;}',
      '#tut-root .tut-skip{font-family:"Silkscreen",monospace;font-size:9px;cursor:pointer;',
      '  background:none;border:none;color:#9fb0c0;text-decoration:underline;padding:4px;}',
      '#tut-root .tut-skip:hover{color:#f4efe3;}'
    ].join('\n');
    (document.head || document.documentElement).appendChild(s);
  }

  function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }

  // Build the dimmed backdrop with a transparent "hole" using a 4-piece dark
  // box trick (top/left/right/bottom rects) so it works without SVG masks.
  function paintBackdrop(backdrop, r){
    var W = window.innerWidth, H = window.innerHeight;
    var dim = 'rgba(7,16,27,.74)';
    function rect(x, y, w, h){
      var d = document.createElement('div');
      d.style.cssText = 'position:absolute;background:'+dim+';left:'+x+'px;top:'+y+
        'px;width:'+Math.max(0,w)+'px;height:'+Math.max(0,h)+'px;';
      return d;
    }
    backdrop.innerHTML = '';
    if(!r){
      // no hole — full dim
      var full = rect(0,0,W,H); backdrop.appendChild(full); return;
    }
    backdrop.appendChild(rect(0, 0, W, r.top));                       // top
    backdrop.appendChild(rect(0, r.top, r.left, r.height));           // left
    backdrop.appendChild(rect(r.left + r.width, r.top, W - (r.left + r.width), r.height)); // right
    backdrop.appendChild(rect(0, r.top + r.height, W, H - (r.top + r.height)));            // bottom
  }

  function renderStep(){
    if(!rootEl) return;
    var step = STEPS[stepIdx];
    var backdrop = rootEl.querySelector('.tut-backdrop');
    var ring = rootEl.querySelector('.tut-ring');
    var card = rootEl.querySelector('.tut-card');
    var stepLbl = rootEl.querySelector('.tut-step');
    var textEl = rootEl.querySelector('.tut-text');
    var nextBtn = rootEl.querySelector('.tut-next');

    var el = null;
    try { el = step.target(); } catch(e){ el = null; }

    var r = null;
    if(el && el.getBoundingClientRect){
      var b = el.getBoundingClientRect();
      if(b.width > 0 && b.height > 0){
        var pad = step.pad || 0;
        var W = window.innerWidth, H = window.innerHeight;
        // negative pad shrinks (used to tighten the big canvas onto desk cluster)
        var top = clamp(b.top - pad, 0, H);
        var left = clamp(b.left - pad, 0, W);
        var right = clamp(b.right + pad, 0, W);
        var bottom = clamp(b.bottom + pad, 0, H);
        r = { top: top, left: left, width: Math.max(0, right-left), height: Math.max(0, bottom-top) };
      }
    }

    paintBackdrop(backdrop, r);

    if(r){
      ring.style.display = 'block';
      ring.style.top = r.top + 'px';
      ring.style.left = r.left + 'px';
      ring.style.width = r.width + 'px';
      ring.style.height = r.height + 'px';
    } else {
      ring.style.display = 'none';
    }

    stepLbl.textContent = 'STEP ' + (stepIdx+1) + ' / ' + STEPS.length;
    textEl.textContent = step.text;
    nextBtn.textContent = (stepIdx === STEPS.length - 1) ? 'GOT IT' : 'NEXT →';

    // place the card near the hole but kept on-screen
    positionCard(card, r);
  }

  function positionCard(card, r){
    var W = window.innerWidth, H = window.innerHeight;
    // measure card
    card.style.visibility = 'hidden';
    card.style.left = '0px'; card.style.top = '0px';
    var cw = card.offsetWidth || 300;
    var ch = card.offsetHeight || 120;
    var x, y;
    if(!r){
      x = (W - cw)/2; y = (H - ch)/2;
    } else {
      // prefer below the hole; if no room, go above
      if(r.top + r.height + 14 + ch < H){
        y = r.top + r.height + 14;
      } else if(r.top - 14 - ch > 0){
        y = r.top - 14 - ch;
      } else {
        y = clamp((H - ch)/2, 8, H - ch - 8);
      }
      x = r.left + r.width/2 - cw/2;
    }
    card.style.left = clamp(x, 10, W - cw - 10) + 'px';
    card.style.top = clamp(y, 10, H - ch - 10) + 'px';
    card.style.visibility = 'visible';
  }

  function finish(){
    if(!active) return;
    active = false;
    try { localStorage.setItem(FLAG, '1'); } catch(e){}
    if(rootEl && rootEl.parentNode){ rootEl.parentNode.removeChild(rootEl); }
    rootEl = null;
    if(resizeBound){ window.removeEventListener('resize', renderStep); resizeBound = false; }
  }

  function next(){
    if(stepIdx >= STEPS.length - 1){ finish(); return; }
    stepIdx++;
    renderStep();
  }

  function build(){
    injectCss();
    rootEl = document.createElement('div');
    rootEl.id = 'tut-root';
    rootEl.innerHTML =
      '<div class="tut-backdrop"></div>' +
      '<div class="tut-ring"></div>' +
      '<div class="tut-card">' +
        '<div class="tut-step"></div>' +
        '<div class="tut-text"></div>' +
        '<div class="tut-btns">' +
          '<button class="tut-skip" type="button">SKIP TUTORIAL</button>' +
          '<button class="tut-next" type="button">NEXT</button>' +
        '</div>' +
      '</div>';
    (document.getElementById('stage') || document.body).appendChild(rootEl);

    rootEl.querySelector('.tut-next').addEventListener('click', function(e){ e.stopPropagation(); next(); });
    rootEl.querySelector('.tut-skip').addEventListener('click', function(e){ e.stopPropagation(); finish(); });
    // backdrop clicks do nothing (modal-ish) — swallow so the sim doesn't get them
    rootEl.querySelector('.tut-backdrop').addEventListener('click', function(e){ e.stopPropagation(); });

    if(!resizeBound){ window.addEventListener('resize', renderStep); resizeBound = true; }
  }

  function run(){
    if(active) return;
    active = true;
    stepIdx = 0;
    build();
    // give the office/launcher a tick to mount before measuring rects
    setTimeout(renderStep, 60);
  }

  function maybeRunOnNewGame(){
    var done = false;
    try { done = localStorage.getItem(FLAG) === '1'; } catch(e){}
    if(done) return;
    // let G.main.start() build the office first
    setTimeout(run, 400);
  }

  // expose for testing / re-trigger
  window.__replayTutorial = function(){
    try { localStorage.removeItem(FLAG); } catch(e){}
    finish();
    setTimeout(run, 50);
  };

  // wire the NEW GAME button (PUNCH IN). Capture phase so we register intent
  // even though main.js also listens; we run after start() has fired.
  function wire(){
    var btn = document.getElementById('btn-start');
    if(!btn) return false;
    btn.addEventListener('click', maybeRunOnNewGame);
    return true;
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', wire);
  } else if(!wire()){
    // button not present yet — retry briefly
    var tries = 0;
    var iv = setInterval(function(){
      if(wire() || ++tries > 40) clearInterval(iv);
    }, 100);
  }
})();
