// CravAche TRIAL module: trial_progression
// ---------------------------------------------------------------------------
// Adds the GOALS / PROGRESSION layer that turns the sim into a "one more week"
// game. Pure runtime: monkey-patches existing G.* functions (saves the
// original, calls it, then composes new behaviour) and injects its own minimal
// DOM. Loaded ONLY by trial.html, after the systems, before main.js.
//
// Four pillars:
//   1) COMBO / STREAK  -> "ON FIRE" chip + follower multiplier
//   2) WEEKLY TARGET   -> "GOAL" chip, live progress, completion pop
//   3) END-OF-WEEK GRADE (S..F) stamped into the report card
//   4) REPUTATION POINTS + PERKS persisted in localStorage, spent at run end,
//      applied at game start.
//
// Every hook is guarded (typeof checks) and warns to console if an expected
// function/field could not be found, so a rename elsewhere degrades gracefully
// instead of crashing.
// ---------------------------------------------------------------------------
(function(){
  "use strict";
  if(!window.G) return;
  window.CRAVACHE_TRIAL = true;

  var G = window.G;
  var LOG = function(msg){ try{ console.warn('[trial_progression] ' + msg); }catch(e){} };

  // ----- palette (matches the pixel UI) -----
  var COL = {
    navy:'#10131f', cream:'#f4e8cf', teal:'#9fe8ff',
    gold:'#ffe066', red:'#ff5c5c', green:'#7ee08a', dim:'#8a93a8'
  };

  // ----- localStorage helpers (guarded) -----
  var RP_KEY = 'cravache_rp';
  var PERK_KEY = 'cravache_perks';
  function lsGet(key, fallback){
    try{ var v = window.localStorage.getItem(key); return v == null ? fallback : v; }
    catch(e){ return fallback; }
  }
  function lsSet(key, val){
    try{ window.localStorage.setItem(key, val); return true; }
    catch(e){ return false; }
  }
  function getRP(){ var n = parseInt(lsGet(RP_KEY, '0'), 10); return isNaN(n) ? 0 : n; }
  function setRP(n){ lsSet(RP_KEY, String(Math.max(0, Math.floor(n)))); }
  function getPerks(){
    try{ var o = JSON.parse(lsGet(PERK_KEY, '{}')); return (o && typeof o === 'object') ? o : {}; }
    catch(e){ return {}; }
  }
  function setPerks(o){ lsSet(PERK_KEY, JSON.stringify(o || {})); }

  // ----- perk catalogue (modest, safe effects applied at game start) -----
  var PERKS = [
    { key:'senior_onboarding', name:'Senior Onboarding', cost:4,
      desc:'Staff build burnout 15% slower (calmer ramp-up).' },
    { key:'retainer_client', name:'Retainer Client', cost:5,
      desc:'Start each run +₹15k richer (a steady invoice on the books).' },
    { key:'espresso_budget', name:'Espresso Budget', cost:3,
      desc:'Nudging staff lands +20% output (sharper hands).' },
    { key:'severance_fund', name:'Severance Fund', cost:6,
      desc:'Start cash +₹20k cushion against the first payroll.' }
  ];

  // ===========================================================================
  // DOM: progression chips strip (combo + goal), mounted inside #stage so it
  // scales with the letterboxed game. z-index ~90 (below #modal-root).
  // ===========================================================================
  var dom = { wrap:null, combo:null, goal:null, mounted:false };

  function injectStyle(){
    if(document.getElementById('trial-prog-style')) return;
    var css = [
      '#prog-strip{position:absolute;top:13px;left:50%;transform:translateX(-50%);',
        'z-index:90;display:flex;gap:10px;pointer-events:none;font-family:"Silkscreen",monospace;}',
      '.prog-chip{background:'+COL.navy+';border:2px solid '+COL.dim+';border-radius:6px;',
        'padding:5px 11px;color:'+COL.cream+';font-size:11px;line-height:1.3;',
        'box-shadow:0 3px 0 rgba(0,0,0,.45);white-space:nowrap;}',
      '.prog-chip .pc-lbl{color:'+COL.dim+';font-size:9px;letter-spacing:.5px;}',
      '.prog-chip .pc-val{color:'+COL.teal+';}',
      '#prog-combo{border-color:'+COL.gold+';color:'+COL.gold+';display:none;',
        'text-shadow:0 0 6px rgba(255,224,102,.6);}',
      '#prog-combo .pc-mult{color:'+COL.cream+';}',
      '@keyframes progPulse{0%{transform:scale(1);}40%{transform:scale(1.28);}100%{transform:scale(1);}}',
      '@keyframes progCrack{0%{transform:scale(1) rotate(0);opacity:1;}',
        '30%{transform:scale(1.1) rotate(-3deg);}100%{transform:scale(.7) rotate(4deg);opacity:0;}}',
      '@keyframes progPop{0%{transform:translateX(-50%) scale(.4);opacity:0;}',
        '50%{transform:translateX(-50%) scale(1.15);opacity:1;}100%{transform:translateX(-50%) scale(1);opacity:1;}}',
      '.prog-pulse{animation:progPulse .42s ease-out;}',
      '.prog-crack{animation:progCrack .5s ease-in forwards;}',
      // big report-card grade stamp
      '@keyframes gradeStamp{0%{transform:scale(2.4) rotate(-10deg);opacity:0;}',
        '55%{transform:scale(.92) rotate(3deg);opacity:1;}75%{transform:scale(1.06) rotate(-2deg);}100%{transform:scale(1) rotate(0);opacity:1;}}',
      '@keyframes gradeShake{0%,100%{margin-left:0;}20%{margin-left:-6px;}40%{margin-left:6px;}60%{margin-left:-4px;}80%{margin-left:4px;}}',
      '.prog-grade-wrap{display:flex;align-items:center;justify-content:center;gap:14px;',
        'margin:10px 0 4px;font-family:"Silkscreen",monospace;}',
      '.prog-grade{font-size:54px;line-height:1;font-weight:bold;',
        'animation:gradeStamp .55s cubic-bezier(.2,1.4,.4,1) both, gradeShake .4s .5s ease-in-out;',
        'text-shadow:0 4px 0 rgba(0,0,0,.5);}',
      '.prog-grade-meta{font-family:"VT323",monospace;font-size:18px;color:'+COL.cream+';text-align:left;line-height:1.25;}',
      '.prog-grade-meta b{color:'+COL.teal+';}',
      // perks panel
      '#prog-perks{position:absolute;inset:0;z-index:90;display:flex;align-items:center;',
        'justify-content:center;background:rgba(8,10,18,.82);font-family:"VT323",monospace;}',
      '#prog-perks .pk-card{background:'+COL.navy+';border:3px solid '+COL.gold+';border-radius:10px;',
        'padding:18px 22px;width:560px;max-width:88%;box-shadow:0 8px 0 rgba(0,0,0,.5);}',
      '#prog-perks h2{font-family:"Silkscreen",monospace;color:'+COL.gold+';font-size:16px;margin:0 0 2px;}',
      '#prog-perks .pk-rp{font-family:"Silkscreen",monospace;color:'+COL.teal+';font-size:12px;margin-bottom:12px;}',
      '#prog-perks .pk-row{display:flex;align-items:center;gap:12px;padding:9px 10px;margin-bottom:8px;',
        'border:2px solid '+COL.dim+';border-radius:7px;background:rgba(255,255,255,.03);}',
      '#prog-perks .pk-row.owned{border-color:'+COL.green+';opacity:.85;}',
      '#prog-perks .pk-name{font-family:"Silkscreen",monospace;font-size:11px;color:'+COL.cream+';}',
      '#prog-perks .pk-desc{font-size:16px;color:'+COL.dim+';line-height:1.15;}',
      '#prog-perks .pk-buy{font-family:"Silkscreen",monospace;font-size:11px;border:2px solid '+COL.gold+';',
        'background:'+COL.gold+';color:'+COL.navy+';padding:7px 11px;border-radius:6px;cursor:pointer;white-space:nowrap;}',
      '#prog-perks .pk-buy:disabled{background:transparent;color:'+COL.dim+';border-color:'+COL.dim+';cursor:default;}',
      '#prog-perks .pk-done{font-family:"Silkscreen",monospace;font-size:11px;border:2px solid '+COL.cream+';',
        'background:'+COL.cream+';color:'+COL.navy+';padding:9px 16px;border-radius:6px;cursor:pointer;margin-top:6px;}'
    ].join('');
    var st = document.createElement('style');
    st.id = 'trial-prog-style';
    st.textContent = css;
    document.head.appendChild(st);
  }

  function mountChips(){
    if(dom.mounted) return;
    var stage = document.getElementById('stage');
    if(!stage){ LOG('#stage not found; cannot mount progression chips'); return; }
    injectStyle();
    var wrap = document.createElement('div');
    wrap.id = 'prog-strip';

    var goal = document.createElement('div');
    goal.className = 'prog-chip';
    goal.id = 'prog-goal';
    goal.innerHTML = '<span class="pc-lbl">GOAL</span> <span class="pc-text">—</span>';

    var combo = document.createElement('div');
    combo.className = 'prog-chip';
    combo.id = 'prog-combo';
    combo.innerHTML = '<span class="pc-lbl">ON FIRE</span> <span class="pc-streak">x0</span> <span class="pc-mult">·1.0×</span>';

    wrap.appendChild(goal);
    wrap.appendChild(combo);
    stage.appendChild(wrap);
    dom.wrap = wrap; dom.goal = goal; dom.combo = combo; dom.mounted = true;
  }

  // ===========================================================================
  // STATE (per-run, in-memory; not persisted with the save — trial only)
  // ===========================================================================
  var run = {
    streak: 0,
    target: null,       // { kind:'ship'|'earn', need, label }
    targetMet: false
  };

  function comboMult(streak){
    if(streak < 3) return 1;
    return Math.min(2.5, 1 + Math.floor(streak / 3) * 0.25);
  }

  function paintCombo(reset){
    if(!dom.combo) return;
    var m = comboMult(run.streak);
    if(run.streak >= 3){
      dom.combo.style.display = 'block';
      dom.combo.querySelector('.pc-streak').textContent = 'x' + run.streak;
      dom.combo.querySelector('.pc-mult').textContent = '·' + m.toFixed(2).replace(/0$/,'') + '×';
      dom.combo.classList.remove('prog-pulse'); void dom.combo.offsetWidth;
      dom.combo.classList.add('prog-pulse');
    } else if(reset){
      // crack + fade then hide
      dom.combo.classList.remove('prog-pulse');
      dom.combo.classList.add('prog-crack');
      var node = dom.combo;
      setTimeout(function(){ node.classList.remove('prog-crack'); node.style.display = 'none'; }, 520);
    } else {
      dom.combo.style.display = 'none';
    }
  }

  // ----- weekly target -----
  function makeTarget(week){
    var w = week || 1;
    // alternate flavours; both scale with week. Modest, beatable numbers.
    if(w % 2 === 1){
      var need = 3 + Math.floor(w * 0.8);            // ship N briefs
      return { kind:'ship', need:need, label:'ship ' + need };
    }
    var amt = 30000 + (w - 1) * 12000;               // earn ₹X
    return { kind:'earn', need:amt, label:'earn ' + (G.fmtMoney ? G.fmtMoney(amt) : ('₹' + amt)) };
  }

  function targetProgress(){
    if(!run.target || !G.state || !G.state.stats) return 0;
    var st = G.state.stats;
    return run.target.kind === 'ship' ? (st.weekShipped || 0) : (st.weekEarned || 0);
  }

  function paintGoal(){
    if(!dom.goal || !run.target) return;
    var cur = targetProgress();
    var t = run.target;
    var curTxt = t.kind === 'ship' ? cur : (G.fmtMoney ? G.fmtMoney(cur) : ('₹' + cur));
    var txt = dom.goal.querySelector('.pc-text');
    txt.innerHTML = '<span class="pc-val">' + t.label + '</span> · ' + curTxt +
      (run.targetMet ? ' <span style="color:' + COL.green + '">✔</span>' : '');
  }

  function newWeekTarget(){
    run.target = makeTarget(G.state ? G.state.week : 1);
    run.targetMet = false;
    paintGoal();
  }

  function checkTargetMet(){
    if(!run.target || run.targetMet) return;
    if(targetProgress() >= run.target.need){
      run.targetMet = true;
      paintGoal();
      goalPop();
    }
  }

  function goalPop(){
    if(!dom.goal) return;
    dom.goal.style.animation = 'none'; void dom.goal.offsetWidth;
    dom.goal.style.animation = 'progPulse .5s ease-out';
    try{ if(G.audio && G.audio.accept) G.audio.accept(); }catch(e){}
    try{ if(G.dock && G.dock.infoToast) G.dock.infoToast('WEEKLY GOAL HIT 🎯', 'Target cleared — extra Reputation Points banked at Friday wrap.', 'good'); }catch(e){}
  }

  // ===========================================================================
  // GRADE: numeric score -> letter, computed from the week's stats.
  // ===========================================================================
  function computeGrade(info){
    var st = (G.state && G.state.stats) ? G.state.stats : {};
    var shipped = st.weekShipped || 0;
    var scrapped = st.weekScrapped || 0;
    var viral = st.weekViral || 0;
    var net = (st.weekEarned || 0) - (st.weekSpent || 0);
    var chaos = (G.state && typeof G.state.chaos === 'number') ? G.state.chaos : 0;

    var score = 50;
    score += shipped * 8;
    score += viral * 14;
    score -= scrapped * 12;
    score += net > 0 ? Math.min(25, net / 4000) : Math.max(-25, net / 3000);
    score -= chaos * 0.4;
    if(info && info.cleared === false) score -= 20;   // bounced payroll stings
    if(run.targetMet) score += 15;

    var letter, col;
    if(score >= 110){ letter = 'S'; col = COL.gold; }
    else if(score >= 88){ letter = 'A'; col = COL.green; }
    else if(score >= 68){ letter = 'B'; col = COL.teal; }
    else if(score >= 48){ letter = 'C'; col = COL.cream; }
    else if(score >= 30){ letter = 'D'; col = '#ffb056'; }
    else { letter = 'F'; col = COL.red; }
    return { letter: letter, col: col, score: Math.round(score) };
  }

  var RP_FOR_GRADE = { S:5, A:4, B:3, C:2, D:1, F:0 };

  // award RP at week end (called once per report card render)
  function awardRP(grade){
    var gained = (RP_FOR_GRADE[grade.letter] || 0) + (run.targetMet ? 2 : 0);
    var total = getRP() + gained;
    setRP(total);
    return { gained: gained, total: total };
  }

  // inject the big grade + RP into an already-rendered report card element
  function injectGrade(el, info){
    if(!el || !el.querySelector) return;
    if(el.querySelector('.prog-grade-wrap')) return; // idempotent
    var grade = computeGrade(info);
    var rp = awardRP(grade);

    var wrap = document.createElement('div');
    wrap.className = 'prog-grade-wrap';
    wrap.innerHTML =
      '<div class="prog-grade" style="color:' + grade.col + '">' + grade.letter + '</div>' +
      '<div class="prog-grade-meta">' +
        'AGENCY SCORE <b>' + grade.score + '</b><br>' +
        'GRADE <b>' + grade.letter + '</b>' + (run.targetMet ? ' · goal ✔' : '') + '<br>' +
        '+<b>' + rp.gained + ' RP</b> (total ' + rp.total + ')' +
      '</div>';

    // place near the top of the card body, just under the title if present
    var title = el.querySelector('.modal-title');
    if(title && title.nextSibling) el.insertBefore(wrap, title.nextSibling);
    else if(title) el.appendChild(wrap);
    else el.insertBefore(wrap, el.firstChild);

    try{ if(G.audio && G.audio.payday && grade.letter !== 'F') G.audio.payday(); }catch(e){}
  }

  // ===========================================================================
  // PERKS PANEL (run end). Spend banked RP on permanent upgrades.
  // ===========================================================================
  function showPerksPanel(){
    if(document.getElementById('prog-perks')) return;
    injectStyle();
    var host = document.getElementById('stage') || document.body;

    var panel = document.createElement('div');
    panel.id = 'prog-perks';
    var card = document.createElement('div');
    card.className = 'pk-card';
    panel.appendChild(card);

    function render(){
      var owned = getPerks();
      var rp = getRP();
      card.innerHTML = '<h2>AGENCY PERKS</h2>' +
        '<div class="pk-rp">REPUTATION POINTS: ' + rp + '  ·  permanent across runs</div>';
      PERKS.forEach(function(p){
        var row = document.createElement('div');
        row.className = 'pk-row' + (owned[p.key] ? ' owned' : '');
        row.innerHTML =
          '<div style="flex:1"><div class="pk-name">' + p.name + '</div>' +
          '<div class="pk-desc">' + p.desc + '</div></div>';
        var btn = document.createElement('button');
        btn.className = 'pk-buy';
        if(owned[p.key]){ btn.textContent = 'OWNED ✔'; btn.disabled = true; }
        else if(rp < p.cost){ btn.textContent = p.cost + ' RP'; btn.disabled = true; }
        else { btn.textContent = 'BUY · ' + p.cost + ' RP'; }
        btn.addEventListener('click', function(){
          var o = getPerks(); var bal = getRP();
          if(o[p.key] || bal < p.cost) return;
          o[p.key] = true; setPerks(o); setRP(bal - p.cost);
          try{ if(G.audio && G.audio.chaChing) G.audio.chaChing(); }catch(e){}
          render();
        });
        row.appendChild(btn);
        card.appendChild(row);
      });
      var done = document.createElement('button');
      done.className = 'pk-done';
      done.textContent = 'DONE · BACK TO IT';
      done.addEventListener('click', function(){ panel.remove(); });
      card.appendChild(done);
    }
    render();
    host.appendChild(panel);
  }

  // apply purchased perks to G.BAL / G.state at game start (modest, guarded)
  function applyPerks(){
    var owned = getPerks();
    if(!G.BAL){ LOG('G.BAL missing; cannot apply perks'); return; }
    if(owned.senior_onboarding && typeof G.BAL.BURNOUT_WORK_RATE === 'number'){
      G.BAL.BURNOUT_WORK_RATE *= 0.85;
    }
    if(owned.espresso_budget && typeof G.BAL.NUDGE_CLICKS_PER_HOUR === 'number'){
      // fewer clicks needed for the same in-game hour of output = +~20% effect
      G.BAL.NUDGE_CLICKS_PER_HOUR = Math.max(20, Math.round(G.BAL.NUDGE_CLICKS_PER_HOUR / 1.2));
    }
    if(G.state){
      if(owned.retainer_client){ G.state.money += 15000; }
      if(owned.severance_fund){ G.state.money += 20000; }
    } else {
      LOG('G.state null at applyPerks; cash perks skipped');
    }
  }

  // ===========================================================================
  // HOOK WIRING — wrap originals, compose new behaviour. All guarded.
  // ===========================================================================

  // 1+? COMBO + FOLLOWER MULTIPLIER on verdict outcomes
  if(G.verdict && typeof G.verdict.applyOutcome === 'function'){
    var _applyOutcome = G.verdict.applyOutcome;
    G.verdict.applyOutcome = function(brief, staffer, outcome, payout, conflict){
      var before = run.streak;
      _applyOutcome.call(this, brief, staffer, outcome, payout, conflict);

      if(outcome === 'approve' || outcome === 'viral'){
        run.streak++;
        var mult = comboMult(run.streak);
        // bonus followers on top of the base gain (composes with gainFollowers)
        if(mult > 1 && G.state){
          var base = (G.BAL && G.BAL.FOLLOWERS_APPROVE) ? G.BAL.FOLLOWERS_APPROVE : [40,140];
          var mid = Array.isArray(base) ? (base[0] + base[1]) / 2 : base;
          var bonus = Math.round(mid * (mult - 1));
          if(bonus > 0){
            G.state.followers = Math.max(0, (G.state.followers || 0) + bonus);
            if(G.state.stats) G.state.stats.weekFollowers = (G.state.stats.weekFollowers || 0) + bonus;
          }
        }
        paintCombo(false);
      } else if(outcome === 'scrapped'){
        run.streak = 0;
        paintCombo(before >= 3); // crack only if a streak was actually showing
      }
      checkTargetMet();
      paintGoal();
    };
  } else {
    LOG('G.verdict.applyOutcome not found — combo + follower multiplier disabled');
  }

  // 3) GRADE injected AFTER the report card renders
  if(G.modals && typeof G.modals.showReportCard === 'function'){
    var _showReportCard = G.modals.showReportCard;
    G.modals.showReportCard = function(info){
      _showReportCard.call(this, info);
      // the card was just push()ed into #modal-root; grab the last .modal there
      try{
        var root = document.getElementById('modal-root');
        var cards = root ? root.querySelectorAll('.modal') : [];
        var el = cards.length ? cards[cards.length - 1] : null;
        if(el) injectGrade(el, info || {});
        else LOG('report card element not found after showReportCard');
      }catch(e){ LOG('grade injection failed: ' + e); }
    };
  } else {
    LOG('G.modals.showReportCard not found — week grade disabled');
  }

  // 2) WEEKLY TARGET: refresh on each new week (advanceToMonday)
  if(G.time && typeof G.time.advanceToMonday === 'function'){
    var _advance = G.time.advanceToMonday;
    G.time.advanceToMonday = function(){
      _advance.call(this);
      // only set a fresh target if the run is still live
      if(G.state && !G.state.gameOver){ newWeekTarget(); }
    };
  } else {
    LOG('G.time.advanceToMonday not found — weekly target will not refresh between weeks');
  }

  // G.main is defined by main.js, which loads AFTER this module. Wrap its
  // functions once it exists (DOMContentLoaded fires after all <script>s run).
  function wireMainHooks(){
    if(!G.main){ LOG('G.main still missing after DOM ready — start/win/lose hooks disabled'); return; }

    // 4) RUN END -> perks panel (win + lose hooks)
    if(typeof G.main.winGame === 'function'){
      var _win = G.main.winGame;
      G.main.winGame = function(){ _win.call(this); setTimeout(showPerksPanel, 600); };
    } else { LOG('G.main.winGame not found — perks panel not wired to win'); }

    if(typeof G.main.loseGame === 'function'){
      var _lose = G.main.loseGame;
      G.main.loseGame = function(type){ _lose.call(this, type); setTimeout(showPerksPanel, 600); };
    } else { LOG('G.main.loseGame not found — perks panel not wired to loss'); }

    // GAME START: mount chips, reset run state, apply perks, set first target.
    if(typeof G.main.start === 'function'){
      var _start = G.main.start;
      G.main.start = function(){
        _start.call(this);          // builds G.state fresh
        mountChips();
        run.streak = 0;
        run.targetMet = false;
        paintCombo(false);
        applyPerks();               // adjusts G.BAL / G.state.money (post-init)
        newWeekTarget();            // GOAL chip for week 1
      };
    } else {
      LOG('G.main.start not found — chips/perks/target will not initialise on start');
    }
  }

  if(G.main){ wireMainHooks(); }                         // already loaded (defensive)
  else if(document.readyState === 'loading'){ document.addEventListener('DOMContentLoaded', wireMainHooks); }
  else { wireMainHooks(); }

  // Keep the goal chip live as money/ships change (cheap poll on the modal loop)
  if(G.modals && typeof G.modals.update === 'function'){
    var _modUpdate = G.modals.update;
    G.modals.update = function(rdt){
      _modUpdate.call(this, rdt);
      if(run.target && dom.goal && G.state && !G.state.gameOver){
        checkTargetMet();
        paintGoal();
      }
    };
  }

  // If the page is already booted (module loaded after start, unlikely), mount.
  if(G.state && G.state.running){ mountChips(); if(!run.target) newWeekTarget(); }

})();
