// CravAche — interrupts: 6PM client call (screen dims, demands your attention,
// sim keeps running), scope creep mid-brief, office randoms, burnout warnings.
// Event defs come from content/events.json (or the inline sample).
(function(){
  'use strict';
  window.G = window.G || {};

  function pick(arr){
    return arr.length ? arr[Math.floor(Math.random() * arr.length)] : null;
  }

  // voicemail the client leaves when you let the 6PM call ring out. Censored
  // rage (G.rage()) + one of these consequences. Pure flavour, the chaos and
  // relationship hit already landed in callIgnored.
  var VOICEMAIL_THREATS = [
    'I am calling your competitor tomorrow morning',
    'this is going in the WhatsApp group, all of it',
    'my retainer cheque has feelings now and they are bad',
    'pick up the f****** phone or lose the account',
    'I know where your office is and so does my lawyer',
    'consider the next invoice officially under review',
    'I told the whole industry about you. fondly. lie.',
    'forget the Friday payment, we are talking Monday now'
  ];

  G.events = {
    update: function(dt){
      var s = G.state;
      // scope creep triggers when an assigned brief crosses its rolled progress point
      for(var i=0;i<s.briefs.length;i++){
        var b = s.briefs[i];
        if(b.status === 'assigned' && b._scopeAt && !b.scopeCreeped &&
           b.workDone / b.workNeeded >= b._scopeAt && !s.paused && !s.activeCall){
          b.scopeCreeped = true;
          this.fireScopeCreep(b);
          break; // one interrupt at a time, "one-and-a-half problems"
        }
      }
    },

    // ---------- effect engine ----------
    // effects: {money, rep, chaos, relationship, workload}
    applyEffects: function(effects, ctx){
      if(!effects) return;
      var s = G.state;
      if(effects.money){
        if(effects.money > 0) G.economy.earn(effects.money);
        else G.economy.spend(-effects.money);
      }
      if(effects.rep){
        s.rep = Math.max(0, s.rep + effects.rep);
        G.hud.poke('rep');
      }
      if(effects.chaos) G.chaos.add(effects.chaos);
      if(effects.relationship && ctx && ctx.clientId){
        this.bumpRelationship(ctx.clientId, effects.relationship);
      }
      if(effects.workload && ctx && ctx.brief){
        G.briefs.addWorkload(ctx.brief, effects.workload);
      }
    },

    bumpRelationship: function(clientId, delta){
      var s = G.state;
      var c = G.data.clientById(clientId);
      if(!c) return;
      if(s.relationships[clientId] === undefined) s.relationships[clientId] = c.patience;
      s.relationships[clientId] += delta;
      if(s.relationships[clientId] <= 0 && !s.goneClients[clientId]){
        s.goneClients[clientId] = true;
        // they take their live briefs with them
        s.briefs.forEach(function(b){
          if(b.clientId === clientId && (b.status === 'tray' || b.status === 'assigned')){
            var st = b.staffId ? G.staff.byId(b.staffId) : null;
            if(st && st.briefId === b.id) st.briefId = null;
            b.status = 'scrapped';
          }
        });
        G.dock.refreshTray();
        G.audio.scrapped();
        G.dock.infoToast('CLIENT GONE', c.name + ' has left forever. Their parting words were "noted".', 'bad');
      }
    },

    // ---------- 6PM call ----------
    fireSixPMCall: function(){
      var s = G.state;
      var liveClients = G.data.clients.filter(function(c){ return !s.goneClients[c.id]; });
      var client = pick(liveClients);
      if(!client) return;
      var def = pick(G.data.eventsByType('call'));
      var quote = pick(client.quotes) || 'We need to talk.';
      s.activeCall = { client: client, def: def, quote: quote, held: 0 };
      G.audio.phoneRing();
      G.modals.showCall(s.activeCall);
    },

    // call survived (held the full duration)
    callSurvived: function(call){
      var s = G.state;
      s.activeCall = null;
      s.quotesWall.push({ text: call.quote, client: call.client.name });
      s.stats.quotesSurvived++;
      // apply the "take the call" option effects if defined
      var opt = call.def && call.def.options ? call.def.options[0] : null;
      if(opt) this.applyEffects(opt.effects, { clientId: call.client.id });
      G.dock.infoToast('FRAMED IT', 'That quote went straight on the office wall.', 'good');
    },

    // hung up / ignored
    callIgnored: function(call){
      var s = G.state;
      s.activeCall = null;
      var opt = call.def && call.def.options ? call.def.options[1] : null;
      if(opt) this.applyEffects(opt.effects, { clientId: call.client.id });
      else {
        this.bumpRelationship(call.client.id, -1);
        G.chaos.add(G.BAL.CHAOS_IGNORED_CALL);
      }
      // they leave a voicemail. It is not warm.
      var threat = pick(VOICEMAIL_THREATS);
      G.dock.infoToast('VOICEMAIL · ' + call.client.name,
        '"' + G.rage() + '. ' + threat + '" *beep*', 'bad');
      G.hud.poke('chaos');
    },

    // ---------- scope creep ----------
    fireScopeCreep: function(brief){
      var def = pick(G.data.eventsByType('scopecreep'));
      var client = G.data.clientById(brief.clientId);
      if(!def || !client) return;
      G.audio.phoneRing();
      G.modals.showEvent({
        kicker: client.name + ' · re: ' + brief.title,
        title: 'SCOPE CREEP',
        text: def.text,
        options: def.options.map(function(opt, i){
          return {
            label: opt.label,
            cls: i === 0 ? '' : 'px-btn-dim',
            onPick: function(){
              G.events.applyEffects(opt.effects, { clientId: brief.clientId, brief: brief });
              if(opt.effects && opt.effects.workload){
                // survived an absurd ask: frame it
                G.state.quotesWall.push({ text: def.text, client: client.name });
                G.state.stats.quotesSurvived++;
              }
              if(opt.effects && opt.effects.relationship){
                G.chaos.add(G.BAL.CHAOS_SCOPE_REFUSE - (opt.effects.chaos || 0)); // base refuse chaos if def didn't add
              }
            }
          };
        })
      });
    },

    // ---------- office randoms ----------
    fireOfficeEvent: function(){
      var s = G.state;
      var pool = G.data.eventsByType('office').filter(function(e){ return e.id !== s._lastOfficeEvent; });
      var def = pick(pool.length ? pool : G.data.eventsByType('office'));
      if(!def) return;
      s._lastOfficeEvent = def.id;
      G.modals.showEvent({
        kicker: 'OFFICE',
        title: 'MEANWHILE...',
        text: def.text,
        options: def.options.map(function(opt, i){
          return {
            label: opt.label,
            cls: i === 0 ? '' : 'px-btn-dim',
            onPick: function(){ G.events.applyEffects(opt.effects, {}); }
          };
        })
      });
    },

    // ---------- burnout warning ----------
    fireBurnoutWarn: function(staffer){
      var def = pick(G.data.eventsByType('burnoutwarn'));
      if(!def){
        G.dock.infoToast('BURNOUT', staffer.name + ' is at ' + Math.round(staffer.burnout) + '%. Tick tick.', 'bad');
        return;
      }
      G.audio.alarm();
      G.modals.showEvent({
        kicker: staffer.name + ' · burnout ' + Math.round(staffer.burnout) + '%',
        title: 'BURNOUT WARNING',
        text: def.text,
        options: def.options.map(function(opt, i){
          return {
            label: opt.label,
            cls: i === 0 ? '' : 'px-btn-dim',
            onPick: function(){
              G.events.applyEffects(opt.effects, {});
              if(i === 0) staffer.burnout = Math.max(0, staffer.burnout - 25); // the humane option cools them
            }
          };
        })
      });
    }
  };
})();
