// CravAche — MEDITATION break. A self-contained breather the player can take
// at most twice per in-game day. While it runs the sim is PAUSED (time stops,
// no new briefs) via the modal pause refcount; a calm breathing overlay shows
// for a full 2 minutes with a live countdown and CANNOT be skipped — it's a real
// break. On completion: chaos −15 (matches chai's chaos.add(-5) convention —
// points, not percent of current).
//
// Isolated: own DOM button (bottom-LEFT of #stage, clear of #wa-launcher and
// the SKIP NIGHT button) + own absolutely-positioned overlay. Touches nothing
// in office_trial.js / modals.js. Per-day cap is tracked on lazy G.state
// fields (_medDayKey / _medCount) without editing state.js.
(function(){
  'use strict';
  window.G = window.G || {};

  var MAX_PER_DAY = 2;
  var DURATION_MS = 120000;   // 2 minutes real-time — a real break, not skippable
  var CHAOS_DROP = 15;        // subtract 15 chaos points on completion

  var btnEl = null;
  var overlayEl = null;
  var meditating = false;
  var endTimer = null;
  var tickTimer = null;       // 1s countdown display updater
  var endAt = 0;              // wall-clock ms when the break ends
  var paused = false;         // did WE acquire the pause lock?

  function stage(){ return document.getElementById('stage') || document.body; }

  function gameRunning(){
    return !!(G.state && G.state.running && !G.state.gameOver);
  }

  // day key matches the chai station: week*10 + day
  function dayKey(){
    var s = G.state || {};
    return (s.week || 0) * 10 + (s.day || 0);
  }

  // lazy per-day counter on G.state. Resets when the day changes.
  function syncDay(){
    var s = G.state;
    if(!s) return;
    var k = dayKey();
    if(s._medDayKey !== k){
      s._medDayKey = k;
      s._medCount = 0;
    }
  }

  function usedToday(){
    syncDay();
    return (G.state && G.state._medCount) || 0;
  }

  function available(){
    if(G.__propBusy && G.__propBusy !== 'med') return false;
    return gameRunning() && !meditating && usedToday() < MAX_PER_DAY;
  }

  // ---------------------------------------------------------------- styles
  function injectCSS(){
    if(document.getElementById('med-style')) return;
    var st = document.createElement('style');
    st.id = 'med-style';
    st.textContent = [
      // entry button: bottom-LEFT of the stage, away from the bottom-right
      // WhatsApp launcher and the night SKIP button.
      '#med-launcher{position:absolute;left:14px;bottom:172px;z-index:70;',
        'display:flex;align-items:center;gap:7px;cursor:pointer;border:none;',
        'padding:9px 13px 8px;border-radius:12px;',
        'background:#2c3e50;color:#e8f4f0;',
        'font:700 12px/1 system-ui,sans-serif;letter-spacing:.5px;',
        'box-shadow:0 4px 14px rgba(0,0,0,.4);}',
      '#med-launcher .med-ico{font-size:22px;line-height:1;}',
      '#med-launcher:hover{filter:brightness(1.1);}',
      '#med-launcher[disabled]{opacity:.45;cursor:not-allowed;filter:none;}',
      // breathing overlay
      '#med-overlay{position:absolute;inset:0;z-index:200;cursor:default;',
        'display:flex;flex-direction:column;align-items:center;justify-content:center;',
        'background:radial-gradient(circle at 50% 45%, rgba(28,54,66,.92), rgba(8,16,22,.97));',
        'opacity:0;transition:opacity .5s ease;}',
      '#med-overlay.in{opacity:1;}',
      '#med-overlay .med-circle{width:160px;height:160px;border-radius:50%;',
        'background:radial-gradient(circle at 50% 40%, #7fe0d8, #2c6f7e);',
        'box-shadow:0 0 60px rgba(127,224,216,.55);',
        'animation:med-breathe 4s ease-in-out infinite;}',
      '#med-overlay .med-text{margin-top:42px;color:#dff4f0;',
        'font:300 30px/1 "Silkscreen",system-ui,sans-serif;letter-spacing:4px;',
        'text-shadow:0 2px 14px rgba(0,0,0,.5);animation:med-fade 4s ease-in-out infinite;}',
      '#med-overlay .med-timer{margin-top:22px;color:#bfe9e1;',
        'font:300 44px/1 "Silkscreen",system-ui,monospace;letter-spacing:6px;',
        'text-shadow:0 0 20px rgba(127,224,216,.5);}',
      '#med-overlay .med-fine{margin-top:16px;color:#9fc7c2;opacity:.7;',
        'font:13px/1 system-ui,sans-serif;letter-spacing:1px;}',
      '@keyframes med-breathe{0%,100%{transform:scale(.78);}50%{transform:scale(1.18);}}',
      '@keyframes med-fade{0%,100%{opacity:.55;}50%{opacity:1;}}'
    ].join('');
    document.head.appendChild(st);
  }

  // ---------------------------------------------------------------- button
  function buildButton(){
    if(btnEl) return;
    btnEl = document.createElement('button');
    btnEl.id = 'med-launcher';
    btnEl.type = 'button';
    btnEl.title = 'take a meditation break — chaos -15 (twice a day)';
    btnEl.innerHTML = '<span class="med-ico">🧘</span><span>Meditate</span>';
    btnEl.addEventListener('click', function(){ G.meditation.start(); });
    stage().appendChild(btnEl);
  }

  function refreshButton(){
    if(!btnEl) return;
    var show = gameRunning();
    btnEl.style.display = show ? '' : 'none';
    // disabled while meditating, while a modal is open, or when out of charges
    btnEl.disabled = !show || meditating ||
      (G.modals && G.modals.anyOpen && G.modals.anyOpen()) ||
      usedToday() >= MAX_PER_DAY;
  }

  // ---------------------------------------------------------------- overlay
  function showOverlay(){
    overlayEl = document.createElement('div');
    overlayEl.id = 'med-overlay';
    overlayEl.innerHTML =
      '<div class="med-circle"></div>' +
      '<div class="med-text">Breathe…</div>' +
      '<div class="med-timer" id="med-timer">2:00</div>' +
      '<div class="med-fine">stay with it — no skipping</div>';
    // no click-to-skip: a meditation break is a full 2 minutes, on purpose.
    stage().appendChild(overlayEl);
    // kick the fade-in on next frame
    requestAnimationFrame(function(){ if(overlayEl) overlayEl.classList.add('in'); });
  }

  function updateTimer(){
    var el = document.getElementById('med-timer');
    if(!el) return;
    var totalSec = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
    var m = Math.floor(totalSec / 60);
    var sec = totalSec % 60;
    el.textContent = m + ':' + (sec < 10 ? '0' : '') + sec;
  }

  function hideOverlay(){
    if(!overlayEl) return;
    var el = overlayEl;
    overlayEl = null;
    el.classList.remove('in');
    setTimeout(function(){ if(el && el.parentNode) el.remove(); }, 320);
  }

  // ---------------------------------------------------------------- flow
  function start(){
    if(!available()){
      if(gameRunning() && usedToday() >= MAX_PER_DAY){
        if(G.dock) G.dock.infoToast('MEDITATION',
          'You’ve meditated enough today. The briefs are still there.', '');
      }
      return;
    }
    if(G.modals && G.modals.anyOpen && G.modals.anyOpen()) return;

    meditating = true;
    try { if(G.audio && G.audio.click) G.audio.click(); } catch(e){}

    // stop the sim: time + brief spawning halt until we release.
    G.__propBusy = 'med';   // mutual exclusion: blocks table tennis + foosball
    if(G.modals && G.modals.acquirePause){ G.modals.acquirePause(); paused = true; }

    showOverlay();
    refreshButton();

    endAt = Date.now() + DURATION_MS;
    updateTimer();
    tickTimer = setInterval(updateTimer, 250);
    endTimer = setTimeout(finish, DURATION_MS);
  }

  function finish(){
    if(!meditating) return;
    meditating = false;

    if(endTimer){ clearTimeout(endTimer); endTimer = null; }
    if(tickTimer){ clearInterval(tickTimer); tickTimer = null; }
    hideOverlay();

    // resume the sim first, then apply the calm so any chaos HUD poke renders
    // against a live (unpaused) state.
    if(paused && G.modals && G.modals.releasePause){ G.modals.releasePause(); }
    paused = false;
    if(G.__propBusy === 'med') G.__propBusy = null;   // release mutual-exclusion lock

    // count this meditation against today's cap
    syncDay();
    if(G.state) G.state._medCount = (G.state._medCount || 0) + 1;

    // chaos -15 (points, matching chai's chaos.add convention)
    try { if(G.chaos && G.chaos.add) G.chaos.add(-CHAOS_DROP); } catch(e){}

    if(G.dock) G.dock.infoToast('MEDITATION', 'chaos −15%. Back to the grind.', 'good');

    refreshButton();
  }

  // ---------------------------------------------------------------- boot
  function boot(){
    injectCSS();
    buildButton();
    refreshButton();
    // keep the button's show/enabled state in sync with the game
    setInterval(refreshButton, 400);
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // testable API
  G.meditation = {
    start: start,
    available: available,
    count: usedToday
  };
})();
