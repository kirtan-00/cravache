// CravAche — the GROWTH layer (business development). Unlocks day 4.
// Spend money or staff time to generate client LEADS; leads close (or ghost)
// after ~a day. Closed lead = a fresh client relationship + an immediate brief.
// The tension: every staffer on growth work is a staffer not doing client work.
(function(){
  'use strict';
  window.G = window.G || {};

  G.GROWTH_ACTIONS = {
    billboard: {
      name: 'Billboard on SG Highway', price: 30000,
      desc: '5 leads. Realistically 3 close. The rest saw it, smiled, drove on.',
      leads: 5, closeRate: 0.6
    },
    event: {
      name: 'Sponsor a brand meetup', price: 50000,
      desc: '3 warm leads, samosas included. Warm leads close better.',
      leads: 3, closeRate: 0.8
    },
    website: {
      name: 'Rebuild the agency website', price: 40000,
      desc: 'One-time. +10% close rate on every future lead. Yes ours is embarrassing.',
      oneTime: 'website', closeBonus: 0.10
    }
  };

  // internal briefs: your own agency as the client. Fee 0. Staff time is the cost.
  G.INTERNAL_BRIEFS = [
    { id: 'g_social', title: 'Run Crav Social', role: 'any',
      ask: 'Our own page. 9 followers, 3 are staff. Post something. Anything.',
      difficulty: 2, deadlineDays: 2, reward: { leads: 2, closeRate: 0.6, rep: 1 } },
    { id: 'g_pitch', title: 'New Agency Pitch Deck', role: 'designer',
      ask: 'The deck we send clients. Slide 4 still says [INSERT CASE STUDY].',
      difficulty: 3, deadlineDays: 2, reward: { closeBonus: 0.15 } },
    { id: 'g_showreel', title: 'Cut the Agency Showreel', role: 'editor',
      ask: 'Our best work, 60 seconds, goosebumps. Use the good projects. Both of them.',
      difficulty: 4, deadlineDays: 3, reward: { leads: 3, closeRate: 0.7, rep: 2 } }
  ];

  G.growth = {
    unlocked: function(){
      var s = G.state;
      return s.week > 1 || s.day >= 4;
    },

    update: function(dt){
      var s = G.state;
      if(!s._growthAnnounced && this.unlocked()){
        s._growthAnnounced = true;
        G.dock.infoToast('GROWTH UNLOCKED',
          'New clients will not find you by accident. GROWTH button is in the dock.', 'good');
      }
      // tick pending leads
      for(var i = s.leads.length - 1; i >= 0; i--){
        var L = s.leads[i];
        L.t -= dt;
        if(L.t <= 0){
          s.leads.splice(i, 1);
          this.resolveLead(L);
        }
      }
    },

    addLeads: function(n, closeRate){
      var s = G.state;
      for(var i = 0; i < n; i++){
        s.leads.push({
          t: G.BAL.DAY_REAL_SECONDS * (0.6 + Math.random() * 0.9),
          closeRate: closeRate
        });
      }
      G.hud.poke('money');
    },

    resolveLead: function(L){
      var s = G.state;
      var rate = Math.min(0.95, L.closeRate + s.growthBonus);
      if(Math.random() >= rate){
        G.dock.infoToast('LEAD GHOSTED', '"We went with our CEO\'s nephew\'s friend." Classic.', 'bad');
        return;
      }
      // closed! an extra brief offer lands right now (cap-free: leads jump the queue)
      G.audio.chaChing();
      G.dock.infoToast('LEAD CLOSED', 'They want to start "yesterday". A brief is incoming.', 'good');
      G.briefs.offerNext();
    },

    buy: function(key){
      var s = G.state;
      var a = G.GROWTH_ACTIONS[key];
      if(!a || s.money < a.price) return false;
      if(a.oneTime && s.growthOwned[a.oneTime]) return false;
      G.economy.spend(a.price);
      if(a.oneTime){
        s.growthOwned[a.oneTime] = true;
        s.growthBonus += a.closeBonus;
        G.dock.infoToast('UPGRADED', a.name + ' done. Leads now close ' + Math.round(s.growthBonus * 100) + '% better.', 'good');
      } else {
        this.addLeads(a.leads, a.closeRate);
        G.dock.infoToast('CAMPAIGN LIVE', a.name + ': ' + a.leads + ' leads brewing.', 'good');
      }
      G.audio.accept();
      return true;
    },

    // push an internal brief into the tray (staff time instead of money)
    startInternal: function(defId){
      var s = G.state;
      var def = null;
      for(var i = 0; i < G.INTERNAL_BRIEFS.length; i++)
        if(G.INTERNAL_BRIEFS[i].id === defId) def = G.INTERNAL_BRIEFS[i];
      if(!def) return false;
      // only one of each internal brief live at a time
      if(s.briefs.some(function(b){ return b.id === def.id && (b.status === 'tray' || b.status === 'assigned'); }))
        return false;
      var live = {
        id: def.id, def: def, internal: true,
        clientId: null, title: def.title, ask: def.ask,
        finePrint: [], extraTags: [], fee: 0,
        role: def.role, difficulty: def.difficulty,
        status: 'tray', staffId: null,
        deadlineTotal: G.time.daysToReal(def.deadlineDays),
        deadlineLeft: G.time.daysToReal(def.deadlineDays),
        workNeeded: G.BAL.WORK_BASE + def.difficulty * G.BAL.WORK_PER_DIFF,
        workDone: 0, escrowLeft: 0, ticked: 0,
        scopeCreeped: true, smallChanges: 0
      };
      s.briefs.push(live);
      G.dock.refreshTray();
      G.audio.accept();
      return true;
    },

    // internal brief finished: pay out the growth reward, no client verdict
    completeInternal: function(brief, staffer){
      var s = G.state;
      var r = brief.def.reward || {};
      brief.status = 'done';
      staffer.briefId = null;
      if(r.leads) this.addLeads(r.leads, r.closeRate || 0.6);
      if(r.closeBonus){
        s.growthBonus += r.closeBonus;
      }
      if(r.rep){ s.rep += r.rep; G.hud.poke('rep'); }
      G.audio.chaChing();
      G.dock.infoToast('GROWTH SHIPPED', brief.title + ' done. ' +
        (r.leads ? r.leads + ' leads brewing.' : 'Leads now close ' + Math.round(s.growthBonus * 100) + '% better.'), 'good');
      G.dock.refreshTray();
    }
  };
})();
