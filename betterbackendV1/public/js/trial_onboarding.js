// CravAche TRIAL module: trial_onboarding
// ---------------------------------------------------------------------------
// Teaches the ONE verb the whole game rests on — drag a brief from the tray
// onto the matching department's desk — plus what CHAOS and REP mean. The old
// Day-Zero tutorial was removed; a cold player was landing in a silent office
// with no idea what to do. This is a light, non-blocking coach layer:
//
//   * On the first-ever run (localStorage flag), once the first brief reaches
//     the TRAY, a coach bubble points at it and NAMES the staffer + department
//     it should go to (it reads which current staffer can actually work it, so
//     the hint is always correct — pairs with the "first briefs are workable"
//     guarantee in briefs.js).
//   * A one-time HUD explainer line covers CHAOS + REP.
//   * The bubble clears itself the moment the player assigns a brief, or on the
//     "GOT IT" tap. The sim is NOT paused — the first brief has a generous
//     deadline, so there's no time pressure during the lesson.
//
// Pure runtime monkey-patch, all guarded. Loaded by index.html + trial.html
// AFTER dock/modals and the other trial_* files, BEFORE main.js.
// ---------------------------------------------------------------------------
(function(){
  "use strict";
  if(!window.G) return;
  var G = window.G;
  var DONE_KEY = 'cravache_onboarded';

  function seen(){ try{ return window.localStorage.getItem(DONE_KEY) === '1'; }catch(e){ return false; } }
  function markSeen(){ try{ window.localStorage.setItem(DONE_KEY, '1'); }catch(e){} }

  // per-run state
  var run = { active:false, coached:false, explained:false, raf:0 };
  var dom = { bubble:null };

  function injectStyle(){
    if(document.getElementById('ob-style')) return;
    var css = [
      '#ob-coach{position:absolute;left:18px;bottom:150px;z-index:88;max-width:340px;',
        'background:#10131f;border:2px solid #ffe066;border-radius:10px;padding:13px 15px;',
        'box-shadow:0 6px 0 rgba(0,0,0,.5);font-family:"VT323",monospace;color:#f4e8cf;',
        'animation:ob-rise .35s ease-out;}',
      '#ob-coach .ob-h{font-family:"Silkscreen",monospace;font-size:11px;color:#ffe066;',
        'letter-spacing:.5px;margin-bottom:6px;}',
      '#ob-coach .ob-t{font-size:18px;line-height:1.25;}',
      '#ob-coach .ob-t b{color:#9fe8ff;}',
      '#ob-coach .ob-row{display:flex;gap:10px;align-items:center;margin-top:10px;}',
      '#ob-coach .ob-got{font-family:"Silkscreen",monospace;font-size:10px;cursor:pointer;',
        'background:#ffe066;color:#10131f;border:none;border-radius:6px;padding:7px 12px;}',
      '#ob-coach .ob-skip{font-size:15px;color:#8a93a8;cursor:pointer;text-decoration:underline;}',
      '#ob-coach .ob-arrow{position:absolute;left:24px;bottom:-16px;width:0;height:0;',
        'border-left:10px solid transparent;border-right:10px solid transparent;border-top:16px solid #ffe066;}',
      '@keyframes ob-rise{0%{transform:translateY(14px);opacity:0;}100%{transform:translateY(0);opacity:1;}}',
      // gold pulse on the tray so the eye goes there
      '@keyframes ob-tray{0%,100%{box-shadow:0 0 0 0 rgba(255,224,102,0);}50%{box-shadow:0 0 0 4px rgba(255,224,102,.55);}}',
      '#dock.ob-hot .tray-wrap{animation:ob-tray 1.3s ease-in-out infinite;border-radius:8px;}'
    ].join('');
    var st = document.createElement('style');
    st.id = 'ob-style'; st.textContent = css;
    document.head.appendChild(st);
  }

  function clearCoach(){
    if(dom.bubble && dom.bubble.parentNode) dom.bubble.parentNode.removeChild(dom.bubble);
    dom.bubble = null;
    var dock = document.getElementById('dock');
    if(dock) dock.classList.remove('ob-hot');
  }

  function finish(){
    run.active = false;
    if(run.raf){ cancelAnimationFrame(run.raf); run.raf = 0; }
    clearCoach();
    markSeen();
  }

  // who/what should the first brief go to? returns a friendly target string.
  function targetHint(brief){
    var dept = (brief && brief.role && brief.role !== 'any') ? brief.role : null;
    var who = null;
    try{
      var st = G.state.staff.find(function(s){ return G.staff.canWork(s, brief) && s.desk >= 0; });
      if(st) who = st.name + ' (' + st.dept.toUpperCase() + ')';
    }catch(e){}
    if(who) return who;
    if(dept) return 'a ' + dept.toUpperCase() + ' desk';
    return 'any desk';
  }

  function showCoach(brief){
    injectStyle();
    if(dom.bubble) return;
    var stage = document.getElementById('stage'); if(!stage) return;
    var who = targetHint(brief);
    var b = document.createElement('div');
    b.id = 'ob-coach';
    b.innerHTML =
      '<div class="ob-h">▶ HOW TO PLAY</div>' +
      '<div class="ob-t">A brief just landed in your <b>TRAY</b> (bottom-left). ' +
        '<b>Drag it onto ' + who + '</b> and they start the work. ' +
        'Match the brief to a desk that can do it.</div>' +
      '<div class="ob-row"><button class="ob-got">GOT IT</button>' +
        '<span class="ob-skip">skip tips</span></div>' +
      '<div class="ob-arrow"></div>';
    stage.appendChild(b);
    dom.bubble = b;
    var dock = document.getElementById('dock');
    if(dock) dock.classList.add('ob-hot');
    b.querySelector('.ob-got').addEventListener('click', function(){ clearCoach(); });
    b.querySelector('.ob-skip').addEventListener('click', function(){ finish(); });
  }

  function explainHud(){
    if(run.explained) return;
    run.explained = true;
    try{
      if(G.dock && G.dock.infoToast){
        G.dock.infoToast('SURVIVE THE WEEK',
          'CHAOS (top bar) rises when work goes late or you dodge briefs — fill it and the office burns. ' +
          'REP is your industry cred. Clear Friday payroll to keep the lights on.', '');
      }
    }catch(e){}
  }

  function assignedCount(){
    try{ return G.state.briefs.filter(function(b){ return b.status === 'assigned'; }).length; }
    catch(e){ return 0; }
  }

  function loop(){
    if(!run.active){ return; }
    var s = G.state;
    if(!s || !s.running || s.gameOver){ run.raf = requestAnimationFrame(loop); return; }

    // the moment the player assigns ANYTHING, the lesson is learned.
    if(assignedCount() > 0){ finish(); return; }

    // when the first brief is sitting in the tray, point at it.
    var tray = [];
    try{ tray = G.briefs.trayBriefs(); }catch(e){}
    if(!run.coached && tray.length){
      // don't fight a full-screen modal (e.g. the client intro dossier)
      var root = document.getElementById('modal-root');
      var modalUp = root && !root.classList.contains('hidden');
      if(!modalUp){
        run.coached = true;
        explainHud();
        showCoach(tray[0]);
      }
    }
    run.raf = requestAnimationFrame(loop);
  }

  function startOnboarding(){
    if(seen()) return;            // first-ever run only
    run.active = true; run.coached = false; run.explained = false;
    clearCoach();
    if(run.raf) cancelAnimationFrame(run.raf);
    run.raf = requestAnimationFrame(loop);
  }

  // wire to game start (G.main loads after this file)
  function wire(){
    if(!G.main || typeof G.main.start !== 'function'){ return false; }
    var _start = G.main.start;
    G.main.start = function(){
      _start.call(this);
      try{ startOnboarding(); }catch(e){ try{ console.warn('[trial_onboarding] ' + e); }catch(_){} }
    };
    return true;
  }

  if(!wire()){
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
    else wire();
  }

  // diagnostic / test helper
  G.onboarding = {
    reset: function(){ try{ window.localStorage.removeItem(DONE_KEY); }catch(e){} },
    forceStart: function(){ try{ window.localStorage.removeItem(DONE_KEY); }catch(e){} startOnboarding(); },
    active: function(){ return run.active; }
  };

  console.log('[trial_onboarding] active — first-run coach for the drag verb + chaos/rep explainer.');
})();
