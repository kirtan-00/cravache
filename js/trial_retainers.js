// CravAche TRIAL module: trial_retainers
// ---------------------------------------------------------------------------
// Adds a RETAINER layer: deliver a client's brief well twice and they offer to
// lock you in monthly. Sign, and every Monday a guaranteed brief from that
// client drops straight into your tray and the locked weekly fee is auto-
// credited to your account — no chasing.
//
// Pure runtime monkey-patch on window.G, matching the pattern in
// trial_progression.js / trial_overrides.js (save the original, call it, then
// compose new behaviour). Loaded by index.html + trial.html, BEFORE main.js.
//
// Hooks:
//   1) G.verdict.applyOutcome  -> count good deliveries per client (approve/viral)
//   2) (good count == 2)       -> G.modals.showEvent retainer OFFER (WhatsApp,
//                                  non-blocking; trial_overrides routes it there)
//   3) accept                  -> register retainer + persist localStorage
//   4) G.time.advanceToMonday  -> per retainer: pay fee via G.economy.earn +
//                                  inject a brief silently into the TRAY
//
// Everything is guarded (typeof checks, try/catch) so a rename elsewhere
// degrades gracefully instead of throwing.
// ---------------------------------------------------------------------------
(function(){
  "use strict";
  if(!window.G) return;
  var G = window.G;
  var LOG = function(msg){ try{ console.warn('[trial_retainers] ' + msg); }catch(e){} };

  // ----- persistence -----------------------------------------------------
  // localStorage 'cravache_retainers' = JSON { clientId: lockedWeeklyFee, ... }
  var STORE_KEY = 'cravache_retainers';

  function loadRetainers(){
    try{
      var raw = window.localStorage.getItem(STORE_KEY);
      if(!raw) return {};
      var o = JSON.parse(raw);
      return (o && typeof o === 'object') ? o : {};
    }catch(e){ return {}; }
  }
  function saveRetainers(o){
    try{ window.localStorage.setItem(STORE_KEY, JSON.stringify(o || {})); return true; }
    catch(e){ return false; }
  }

  // retainers: clientId -> locked weekly fee (loaded on init, persisted on sign)
  var retainers = loadRetainers();

  // per-run bookkeeping (in-memory): good deliveries per client + which clients
  // currently have an OPEN offer waiting (so we don't spam offers).
  var goodCount = {};   // clientId -> int
  var offering  = {};   // clientId -> true while an offer is live/unanswered

  var GOOD_DELIVERIES_FOR_OFFER = 2;

  // ----- fee picking -----------------------------------------------------
  // a sensible LOCKED weekly retainer fee from the client's typical brief fee.
  // We take the median of that client's brief-def fees (falls back to the
  // delivered brief's own fee, then a flat default).
  function typicalFee(clientId, fallbackFee){
    var fees = [];
    try{
      var all = (G.data && G.data.briefs) ? G.data.briefs : [];
      for(var i = 0; i < all.length; i++){
        if(all[i].clientId === clientId && typeof all[i].fee === 'number') fees.push(all[i].fee);
      }
    }catch(e){}
    if(!fees.length){
      if(typeof fallbackFee === 'number' && fallbackFee > 0) return Math.round(fallbackFee);
      return 50000;
    }
    fees.sort(function(a, b){ return a - b; });
    var mid = fees[Math.floor((fees.length - 1) / 2)];
    return Math.round(mid);
  }

  // ----- brief def for a retainer drop -----------------------------------
  // Build a brief DEF (shape that G.briefs.accept expects) from one of the
  // client's real brief defs when possible, so role/difficulty/finePrint feel
  // native. Clone it and give it a retainer-flavoured title + the locked fee.
  function retainerBriefDef(clientId, fee){
    var base = null;
    try{
      var all = (G.data && G.data.briefs) ? G.data.briefs : [];
      var mine = all.filter(function(b){ return b.clientId === clientId; });
      if(mine.length) base = mine[Math.floor(Math.random() * mine.length)];
    }catch(e){}
    var c = (G.data && G.data.clientById) ? G.data.clientById(clientId) : null;
    var cname = (c && c.name) ? c.name : 'Client';

    var seq = (retainerBriefDef._seq = (retainerBriefDef._seq || 0) + 1);
    if(base){
      return {
        id: 'retainer_' + clientId + '_' + seq,
        clientId: clientId,
        title: 'Retainer · ' + base.title,
        ask: base.ask,
        finePrint: (base.finePrint || []).slice(),
        extraTags: (base.extraTags || []).slice(),
        fee: fee,
        deadlineDays: base.deadlineDays || 2,
        difficulty: base.difficulty || 2,
        role: base.role || 'any'
      };
    }
    // no brief defs for this client: a generic monthly-retainer deliverable
    return {
      id: 'retainer_' + clientId + '_' + seq,
      clientId: clientId,
      title: 'Retainer · weekly drop',
      ask: cname + ' need this week\'s guaranteed deliverable. Same as always.',
      finePrint: [],
      extraTags: [],
      fee: fee,
      deadlineDays: 2,
      difficulty: 2,
      role: 'any'
    };
  }

  // ----- the OFFER (WhatsApp, non-blocking) ------------------------------
  function offerRetainer(clientId, fallbackFee){
    if(retainers[clientId] !== undefined) return;   // already a retainer
    if(offering[clientId]) return;                   // offer already pending
    var c = (G.data && G.data.clientById) ? G.data.clientById(clientId) : null;
    var cname = (c && c.name) ? c.name : 'Client';
    var fee = typicalFee(clientId, fallbackFee);

    if(!(G.modals && typeof G.modals.showEvent === 'function')){
      LOG('G.modals.showEvent missing — cannot present retainer offer');
      return;
    }

    offering[clientId] = true;
    var feeTxt = (G.fmtMoney ? G.fmtMoney(fee) : ('₹' + fee));

    var accept = function(){
      offering[clientId] = false;
      signRetainer(clientId, fee, cname, feeTxt);
    };
    var decline = function(){
      offering[clientId] = false;
      // leave goodCount where it is; they can offer again on the next good
      // delivery (defensive: nudge it back so a single later ship re-triggers)
      goodCount[clientId] = GOOD_DELIVERIES_FOR_OFFER - 1;
    };

    try{
      G.modals.showEvent({
        kicker: cname + ' · retainer',
        title: 'RETAINER OFFER',
        text: cname + ' loved the work. Lock us in monthly? A guaranteed brief ' +
              'every week at ' + feeTxt + ', paid straight to your account, no chasing.',
        options: [
          { label: 'SIGN RETAINER', onPick: accept },
          { label: 'NOT NOW', cls: 'px-btn-dim', onPick: decline }
        ]
      });
    }catch(e){
      offering[clientId] = false;
      LOG('retainer offer failed: ' + e);
    }
  }

  // ----- SIGN (register + persist) ---------------------------------------
  function signRetainer(clientId, fee, cname, feeTxt){
    retainers[clientId] = fee;
    saveRetainers(retainers);
    feeTxt = feeTxt || (G.fmtMoney ? G.fmtMoney(fee) : ('₹' + fee));
    cname = cname || (function(){
      var c = (G.data && G.data.clientById) ? G.data.clientById(clientId) : null;
      return (c && c.name) ? c.name : 'Client';
    })();
    try{ if(G.audio && G.audio.accept) G.audio.accept(); }catch(e){}
    try{
      if(G.dock && G.dock.infoToast){
        G.dock.infoToast('RETAINER SIGNED · ' + cname,
          feeTxt + '/week locked. A guaranteed brief lands every Monday.', 'good');
      }
    }catch(e){}
  }

  // ----- weekly payout + silent tray drop --------------------------------
  function runWeekly(){
    if(!G.state || G.state.gameOver) return;
    for(var clientId in retainers){
      if(!retainers.hasOwnProperty(clientId)) continue;
      // skip clients who have walked out for good
      if(G.state.goneClients && G.state.goneClients[clientId]) continue;
      var fee = retainers[clientId];
      if(typeof fee !== 'number' || fee <= 0) continue;
      var c = (G.data && G.data.clientById) ? G.data.clientById(clientId) : null;
      var cname = (c && c.name) ? c.name : 'Client';

      // (a) pay the locked weekly fee straight to the account
      try{ if(G.economy && G.economy.earn) G.economy.earn(fee); }catch(e){ LOG('earn failed: ' + e); }
      try{
        if(G.dock && G.dock.infoToast){
          G.dock.infoToast('RETAINER · ' + cname,
            (G.fmtMoney ? G.fmtMoney(fee) : ('₹' + fee)) + ' auto-credited', 'good');
        }
      }catch(e){}

      // (b) auto-create a brief from that client straight into the TRAY,
      // with NO offer toast/popup. G.briefs.accept builds a live tray brief.
      try{
        var def = retainerBriefDef(clientId, fee);
        if(G.briefs && typeof G.briefs.accept === 'function'){
          G.briefs.accept(def);   // lands status:'tray', refreshes the tray
        } else {
          LOG('G.briefs.accept missing — cannot drop retainer brief');
        }
      }catch(e){ LOG('tray drop failed: ' + e); }
    }
  }

  // ===========================================================================
  // HOOK WIRING — wrap originals, compose. All guarded. We wrap AFTER the other
  // trial modules (this file loads after trial_progression.js), so our wrapper
  // sits OUTSIDE theirs and composes cleanly.
  // ===========================================================================

  // 1+2) count good deliveries, fire the offer at the threshold
  if(G.verdict && typeof G.verdict.applyOutcome === 'function'){
    var _applyOutcome = G.verdict.applyOutcome;
    G.verdict.applyOutcome = function(brief, staffer, outcome, payout, conflict){
      _applyOutcome.call(this, brief, staffer, outcome, payout, conflict);
      try{
        if((outcome === 'approve' || outcome === 'viral') && brief && brief.clientId != null){
          var cid = brief.clientId;
          goodCount[cid] = (goodCount[cid] || 0) + 1;
          if(goodCount[cid] >= GOOD_DELIVERIES_FOR_OFFER &&
             retainers[cid] === undefined && !offering[cid]){
            offerRetainer(cid, brief.fee);
          }
        }
      }catch(e){ LOG('delivery tracking failed: ' + e); }
    };
  } else {
    LOG('G.verdict.applyOutcome not found — retainer offers disabled');
  }

  // 4) weekly rollover: pay + silent tray drop. Wrap advanceToMonday the same
  // way trial_progression.js does.
  if(G.time && typeof G.time.advanceToMonday === 'function'){
    var _advance = G.time.advanceToMonday;
    G.time.advanceToMonday = function(){
      _advance.call(this);
      try{ runWeekly(); }catch(e){ LOG('weekly run failed: ' + e); }
    };
  } else {
    LOG('G.time.advanceToMonday not found — weekly retainer drop disabled');
  }

  // ----- test/diagnostic hook (used by the verifier; safe in prod) -------
  G.retainers = {
    _state: retainers,
    goodCount: function(clientId){ return clientId == null ? goodCount : (goodCount[clientId] || 0); },
    forceGood: function(clientId, n){
      goodCount[clientId] = (n == null ? GOOD_DELIVERIES_FOR_OFFER : n);
      if(goodCount[clientId] >= GOOD_DELIVERIES_FOR_OFFER &&
         retainers[clientId] === undefined && !offering[clientId]){
        offerRetainer(clientId);
      }
      return goodCount[clientId];
    },
    isRetainer: function(clientId){ return retainers[clientId] !== undefined; },
    feeFor: function(clientId){ return retainers[clientId]; },
    offer: function(clientId, fee){ offerRetainer(clientId, fee); },
    runWeekly: runWeekly,
    reload: function(){ retainers = loadRetainers(); return retainers; }
  };

  console.log('[trial_retainers] active — good deliveries -> WhatsApp retainer offer, weekly auto-pay + silent tray drop. Persists to localStorage "' + STORE_KEY + '".');
})();
