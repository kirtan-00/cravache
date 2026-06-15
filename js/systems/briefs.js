// CravAche — brief lifecycle: spawn toast -> tray -> desk -> verdict / overdue.
(function(){
  'use strict';
  window.G = window.G || {};

  function shuffle(a){
    for(var i = a.length - 1; i > 0; i--){
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // staff were blitzing briefs too fast — stretch the work so tasks take longer,
  // scaled by how hard they are: hard +20%, medium +15%, small +5%.
  function workTimeBand(diff){
    if(diff >= 4) return 1.20;   // hard
    if(diff === 3) return 1.15;  // medium
    return 1.05;                 // small (diff 1-2)
  }

  // production (shoots) are slower than desk work: +10% time on every production
  // brief, and big-budget productions (fee > Rs 2,00,000) take even longer still.
  function productionTimeFactor(def){
    if(def.role !== 'production') return 1;
    var f = 1.10;
    if(def.fee > 200000) f *= 1.20;   // >2L shoots: an extra 20% on top
    return f;
  }

  // higher-paying briefs are bigger jobs — they take proportionally longer to
  // clear. This keeps a full, all-working roster genuinely occupied: a fresh
  // brief can't always be picked up the instant it lands. Tuned to stay
  // manageable, not punishing. Fees run ~Rs 4k..9L; +1% time per Rs 13,000 of
  // fee, capped at +60% on the very biggest brand jobs.
  function feeTimeFactor(def){
    var fee = def.fee || 0;
    return 1 + Math.min(0.60, fee / 1300000);
  }

  G.briefs = {
    init: function(){
      var s = G.state;
      s.briefDeck = shuffle(G.data.briefs.slice());
      // gentle start: easiest briefs first in week 1
      s.briefDeck.sort(function(a, b){
        return (a.difficulty - b.difficulty) + (Math.random() - 0.5) * 2.2;
      });
      s.nextSpawnIn = 4 + Math.random() * 3;
    },

    activeCount: function(){
      return G.state.briefs.filter(function(b){
        return b.status === 'tray' || b.status === 'assigned';
      }).length;
    },

    // workload follows headcount: cap = staff × 1.15, so there is always
    // ~15% more work than hands. Hire more, get briefed more.
    workloadCap: function(){
      return Math.max(2, Math.ceil(G.state.staff.length * G.BAL.WORKLOAD_OVERREACH));
    },

    update: function(dt){
      var s = G.state;

      // spawn (clients do not brief at night; they save it up for 9:01 AM)
      if(!s.night){
        s.nextSpawnIn -= dt;
        var cap = this.workloadCap();
        if(s.nextSpawnIn <= 0){
          s.nextSpawnIn = G.time.spawnIntervalReal();
          if(this.activeCount() + s.pendingToasts < cap) this.offerNext();
        }
      }

      // tick live briefs
      for(var i = 0; i < s.briefs.length; i++){
        var b = s.briefs[i];
        if(b.status !== 'tray' && b.status !== 'assigned') continue;

        b.deadlineLeft -= dt;
        if(b.deadlineLeft <= 0){
          this.scrapOverdue(b);
          continue;
        }

        if(b.status === 'assigned'){
          var st = G.staff.byId(b.staffId);
          if(!st) { this.returnToTray(b, 1); continue; }
          if(!G.time.onClock(st)) continue; // staffer is home asleep; deadline is not
          b.workDone += G.staff.effectiveSpeed(st, b) * dt;
          G.economy.tickEscrow(b, dt);
          if(b.workDone >= b.workNeeded){
            this.complete(b, st);
          }
        }
      }
    },

    // a brief is offerable if its client is still here, its tier is unlocked,
    // and production briefs wait for the production dept to exist
    offerable: function(b){
      var s = G.state;
      if(s.goneClients[b.clientId]) return false;
      var c = G.data.clientById(b.clientId);
      if(c && c.tier && !G.tierOpen(c.tier, s.week)) return false;
      if(b.role === 'production' && s.week < G.BAL.PRODUCTION_UNLOCK_WEEK) return false;
      return true;
    },

    // does the office WANT a brief of this role right now? Staffed depts get
    // briefs up to headcount+1; unstaffed depts get at most ONE live teaser
    // brief total (hire pressure without a wall of unassignable work).
    roleWanted: function(role){
      var s = G.state;
      if(!role || role === 'any') return true;
      var live = s.briefs.filter(function(b){
        return b.status === 'tray' || b.status === 'assigned';
      });
      var deptStaff = G.staff.deptCount(role);
      if(deptStaff > 0){
        var sameRole = live.filter(function(b){ return b.role === role; }).length;
        return sameRole < deptStaff + 1;
      }
      var teasers = live.filter(function(b){
        return b.role && b.role !== 'any' && G.staff.deptCount(b.role) === 0;
      }).length;
      return teasers < 1;
    },

    offerNext: function(){
      var s = G.state, self = this;

      // gentle window: the first 2 briefs of a run must be ones a CURRENT
      // staffer can actually do, so a brand-new player is never handed an
      // undeliverable first brief (e.g. a content brief with no writer hired).
      var gentle = (s._offeredCount || 0) < 2;
      function workableNow(cand){
        return s.staff.some(function(st){ return G.staff.canWork(st, cand); });
      }

      function pick(requireRoleFit){
        for(var i = 0; i < s.briefDeck.length; i++){
          var cand = s.briefDeck[i];
          if(s.goneClients[cand.clientId]){ s.briefDeck.splice(i, 1); i--; continue; }
          if(!self.offerable(cand)) continue;
          if(requireRoleFit && !self.roleWanted(cand.role)) continue;
          if(gentle && !workableNow(cand)) continue;
          s.briefDeck.splice(i, 1);
          return cand;
        }
        return null;
      }

      var def = pick(true) || pick(false);
      // never deadlock on the gentle filter: if nothing workable is offerable
      // right now, drop the gentle constraint and pick normally.
      if(!def && gentle){ gentle = false; def = pick(true) || pick(false); }
      if(!def){
        // deck exhausted: the city never runs out of bad ideas. Reshuffle.
        s.briefDeck = G.data.briefs.filter(function(b){ return !s.goneClients[b.clientId]; });
        for(var i = s.briefDeck.length - 1; i > 0; i--){
          var j = Math.floor(Math.random() * (i + 1));
          var t = s.briefDeck[i]; s.briefDeck[i] = s.briefDeck[j]; s.briefDeck[j] = t;
        }
        def = pick(true) || pick(false);
        if(!def) return;
      }

      s.pendingToasts++;
      s._offeredCount = (s._offeredCount || 0) + 1;   // tracks the gentle window
      var deliver = function(){
        G.dock.showBriefToast(def, function(accepted){
          s.pendingToasts--;
          if(accepted){
            G.briefs.accept(def);
          } else {
            // declining/ignoring isn't free: rep dips AND the room gets a little
            // more chaotic, so you can't dodge every risky brief for free.
            s.rep = Math.max(0, s.rep + G.BAL.REP_DECLINE);
            if(G.chaos && G.BAL.CHAOS_DECLINE) G.chaos.add(G.BAL.CHAOS_DECLINE);
            G.audio.decline();
            G.hud.poke('rep');
          }
        });
      };

      // never met this client? introduce them first.
      var client = G.data.clientById(def.clientId);
      if(client && !s.metClients[client.id]){
        s.metClients[client.id] = true;
        s.introducedCount++;
        if(s.introducedCount <= G.BAL.INTRO_CLIENTS_FULL){
          // full signing dossier (pauses the sim; read in peace)
          G.modals.showClientIntro(client, deliver);
          return;
        }
        // past the gentle phase: one-liner intro, brief lands immediately
        G.dock.infoToast('NEW CLIENT · ' + client.name,
          client.industry + '. ' + client.personality + '.', 'good');
      }
      deliver();
    },

    accept: function(def){
      var s = G.state;
      s._briefSeq = (s._briefSeq || 0) + 1;
      var live = {
        id: def.id + '#' + s._briefSeq, // unique per live copy (deck recycles defs)
        def: def,
        clientId: def.clientId,
        title: def.title, ask: def.ask,
        finePrint: def.finePrint || [],
        extraTags: def.extraTags || [],
        fee: def.fee,
        role: def.role || 'any',
        difficulty: def.difficulty,
        status: 'tray',                    // tray | assigned | done | scrapped
        staffId: null,
        deadlineTotal: G.time.daysToReal(def.deadlineDays),
        deadlineLeft: G.time.daysToReal(def.deadlineDays),
        workNeeded: (G.BAL.WORK_BASE + def.difficulty * G.BAL.WORK_PER_DIFF) * workTimeBand(def.difficulty) * productionTimeFactor(def) * feeTimeFactor(def),
        workDone: 0,
        escrowLeft: Math.round(def.fee * G.BAL.ESCROW_SHARE),
        ticked: 0,
        scopeCreeped: false,
        smallChanges: 0
      };
      // ensure relationship exists
      var c = G.data.clientById(def.clientId);
      if(c && s.relationships[c.id] === undefined) s.relationships[c.id] = c.patience;

      s.briefs.push(live);
      G.audio.accept();
      G.dock.refreshTray();

      // scope creep dice rolled once per brief, fires mid-progress (events.js)
      var chance = G.curve.scopeChance(s.week);
      if(Math.random() < chance) live._scopeAt = 0.35 + Math.random() * 0.35; // workDone fraction
    },

    assign: function(brief, staffer){
      if(brief.status !== 'tray') return false;
      if(staffer.briefId) return false;
      if(!G.time.onClock(staffer)){
        G.dock.infoToast('GONE HOME', staffer.name + ' is asleep. The night crew (Arya, the Producer, the Director) takes night briefs.', 'bad');
        G.audio.decline();
        return false;
      }
      if(!G.staff.canWork(staffer, brief)){
        G.dock.infoToast('WRONG DEPARTMENT',
          staffer.name + ' (' + staffer.dept + ') stares at the ' + brief.role +
          ' brief like it is in another language.', 'bad');
        G.audio.decline();
        return false;
      }
      brief.status = 'assigned';
      brief.staffId = staffer.id;
      staffer.briefId = brief.id;
      // pulled off the water-cooler gossip: snap straight back to the desk
      if(staffer.away) staffer.away = null;
      G.staff.say(staffer, randomGrumble());
      G.audio.drop();
      G.dock.refreshTray();
      return true;
    },

    returnToTray: function(brief, deadlineFactor){
      brief.status = 'tray';
      var st = brief.staffId ? G.staff.byId(brief.staffId) : null;
      if(st && st.briefId === brief.id) st.briefId = null;
      brief.staffId = null;
      if(deadlineFactor !== undefined && deadlineFactor < 1){
        brief.deadlineLeft = Math.min(brief.deadlineLeft, brief.deadlineTotal * deadlineFactor);
      }
      G.dock.refreshTray();
    },

    complete: function(brief, staffer){
      if(brief.internal){
        G.growth.completeInternal(brief, staffer);
        return;
      }
      brief.status = 'done';
      staffer.briefId = null;
      brief.staffId = staffer.id; // remember who made it (fine-print check)
      G.verdict.judge(brief, staffer);
    },

    scrapOverdue: function(brief){
      var s = G.state;
      brief.status = 'scrapped';
      var st = brief.staffId ? G.staff.byId(brief.staffId) : null;
      if(st && st.briefId === brief.id) st.briefId = null;
      s.rep = Math.max(0, s.rep + G.BAL.REP_OVERDUE);
      G.chaos.add(G.BAL.CHAOS_OVERDUE);
      s.stats.weekScrapped++;
      G.audio.alarm();
      G.dock.refreshTray();
      if(brief.internal){
        G.dock.infoToast('GROWTH DROPPED', '"' + brief.title + '" never happened. The agency stays unfamous.', 'bad');
        return;
      }
      // late = clawback. The client bills YOU for their disappointment.
      var penalty = Math.round(brief.fee * G.BAL.CLAWBACK_OVERDUE);
      G.economy.spend(penalty);
      G.dock.infoToast('MISSED DEADLINE', '"' + brief.title + '" auto-scrapped. Client: "' + G.rage() + '" Penalty: ' + G.fmtMoney(penalty), 'bad');
      G.hud.poke('rep');
    },

    byId: function(id){
      var arr = G.state.briefs;
      for(var i=0;i<arr.length;i++) if(arr[i].id === id) return arr[i];
      return null;
    },

    trayBriefs: function(){
      return G.state.briefs.filter(function(b){ return b.status === 'tray'; });
    },

    // scope creep accepted: +30% work, same pay
    addWorkload: function(brief, pct){
      brief.workNeeded *= (1 + pct / 100);
    }
  };

  var GRUMBLES = [
    'on it boss', 'haan haan, doing', 'ETA is vibes', 'chai first?', 'ok but why me',
    'rendering my soul', 'this is fine', 'deadline is a concept'
  ];
  function randomGrumble(){
    return GRUMBLES[Math.floor(Math.random() * GRUMBLES.length)];
  }
})();
