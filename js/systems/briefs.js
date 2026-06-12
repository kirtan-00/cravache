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

    update: function(dt){
      var s = G.state;

      // spawn
      s.nextSpawnIn -= dt;
      var cap = G.curve.cap(s.week);
      if(s.nextSpawnIn <= 0){
        s.nextSpawnIn = G.time.spawnIntervalReal();
        if(this.activeCount() + s.pendingToasts < cap) this.offerNext();
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
          var speed = G.BAL.SPEED_BASE + st.skill * G.BAL.SPEED_PER_SKILL;
          b.workDone += speed * dt;
          G.economy.tickEscrow(b, dt);
          if(b.workDone >= b.workNeeded){
            this.complete(b, st);
          }
        }
      }
    },

    offerNext: function(){
      var s = G.state;
      // skip briefs from clients who left forever
      var def = null;
      while(s.briefDeck.length){
        var cand = s.briefDeck.shift();
        if(!s.goneClients[cand.clientId]){ def = cand; break; }
      }
      if(!def){
        // deck exhausted. In OVERTIME the city never runs out of bad ideas:
        // reshuffle every brief whose client is still talking to us.
        if(!s.endless) return;
        s.briefDeck = G.data.briefs.filter(function(b){ return !s.goneClients[b.clientId]; });
        for(var i = s.briefDeck.length - 1; i > 0; i--){
          var j = Math.floor(Math.random() * (i + 1));
          var t = s.briefDeck[i]; s.briefDeck[i] = s.briefDeck[j]; s.briefDeck[j] = t;
        }
        def = s.briefDeck.shift();
        if(!def) return;
      }

      s.pendingToasts++;
      var deliver = function(){
        G.dock.showBriefToast(def, function(accepted){
          s.pendingToasts--;
          if(accepted){
            G.briefs.accept(def);
          } else {
            s.rep = Math.max(0, s.rep + G.BAL.REP_DECLINE);
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
      var live = {
        id: def.id, def: def,
        clientId: def.clientId,
        title: def.title, ask: def.ask,
        finePrint: def.finePrint || [],
        extraTags: def.extraTags || [],
        fee: def.fee,
        difficulty: def.difficulty,
        status: 'tray',                    // tray | assigned | done | scrapped
        staffId: null,
        deadlineTotal: G.time.daysToReal(def.deadlineDays),
        deadlineLeft: G.time.daysToReal(def.deadlineDays),
        workNeeded: G.BAL.WORK_BASE + def.difficulty * G.BAL.WORK_PER_DIFF,
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
      brief.status = 'assigned';
      brief.staffId = staffer.id;
      staffer.briefId = brief.id;
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
      G.dock.infoToast('MISSED DEADLINE', '"' + brief.title + '" got auto-scrapped. The client noticed.', 'bad');
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
