// CravAche — interrupts: 6PM client call (screen dims, demands your attention,
// sim keeps running), scope creep mid-brief, office randoms, burnout warnings.
// Event defs come from content/events.json (or the inline sample).
(function(){
  'use strict';
  window.G = window.G || {};

  function pick(arr){
    return arr.length ? arr[Math.floor(Math.random() * arr.length)] : null;
  }

  // dumb things clients call to ask at 6PM — agency inside jokes. Mixed in with
  // the client's own lines so the call is funnier (and never the same twice).
  var CALL_DEMANDS = [
    'Can you make the logo bigger? Now smaller. Now bigger. Perfect, like before.',
    'Make it pop. More pop. I want it to POP off the screen and into my heart.',
    'Small change: can we change everything? We loved it though.',
    'My nephew knows Photoshop. He says this should take ten minutes.',
    'Just make it go viral. That is the whole brief. Viral. By Monday.',
    'Use our brand blue. No, not that blue. The blue from my imagination.',
    'Add more white space. Also fill the empty parts, looks unfinished.',
    'Make it look premium but also like we did not spend money.',
    'Can the logo be bigger than the actual building in the photo?',
    'Keep it minimal. Also add these fourteen things and a QR code.',
    'CEO\'s wife saw it. She has notes. She has so many notes.',
    'Can you deliver by EOD? It is 6:02 PM. EOD today, beta.',
    'Make the video 4K but also under 12 kilobytes for WhatsApp.',
    'Can you add a drone shot? We do not have a drone. Or a budget.',
    'Remove the competitor from this stock photo we did not license.',
    'It needs more energy. No I cannot define energy. You know. ENERGY.',
    'Final files. Wait. FINAL final. Okay FINAL_final_v9_USETHIS.',
    'Can you make it trending before we decide what we are selling?'
  ];

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
      // ~65% a dumb agency-client demand, else one of this client's own lines
      var quote = (Math.random() < 0.65)
        ? pick(CALL_DEMANDS)
        : (pick(client.quotes) || pick(CALL_DEMANDS) || 'We need to talk.');
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
      // listening to a client out costs nothing but time — and it calms the floor.
      G.chaos.add(-5);
      G.hud.poke('chaos');
      G.dock.infoToast('FRAMED IT', 'You heard them out. Quote on the wall, chaos −5%.', 'good');
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

    // ---------- raise request ----------
    // A staffer asks for a 10-30% raise. APPROVE: salary up that % (hits Friday
    // payroll forever) + work speed +4% + a morale bump. DENY: free now, but
    // burnout climbs — keep saying no and the burnout system may walk them out.
    fireRaiseRequest: function(staffer){
      var s = G.state;
      var absDay = (s.week - 1) * 5 + s.day;
      var st = staffer;
      if(!st){
        var pool = s.staff.filter(function(x){
          return G.time.onClock(x) && !x.away &&
                 (absDay - (x._raiseDay == null ? -99 : x._raiseDay) >= G.BAL.RAISE_COOLDOWN_DAYS);
        });
        st = pick(pool);
      }
      if(!st) return;

      var span = G.BAL.RAISE_MAX_PCT - G.BAL.RAISE_MIN_PCT + 1;
      var pct = G.BAL.RAISE_MIN_PCT + Math.floor(Math.random() * span);
      st._raiseDay = absDay; // cooldown starts now, approve or deny

      var first = st.name.split(' ')[0];
      var ASKS = [
        'I have carried this quarter on my back and one Red Bull. A %P% raise feels fair.',
        'Another agency "called". I did not pick up. A %P% bump helps me keep ignoring them.',
        'My rent went up, my chai went up, my patience went down. %P%?',
        'I learned three tools nobody asked me to learn. Worth %P%, no?',
        'I am the reason we did not lose that client last week. Quietly requesting %P%.',
        'No drama, just numbers: %P% more and I stop refreshing LinkedIn jobs.',
        'I said "as per our discussion" forty times this week. That is %P% of energy.'
      ];
      var line = pick(ASKS).replace('%P', pct);

      G.audio.phoneRing();
      G.modals.showEvent({
        kicker: first + ' · wants a word',
        title: 'RAISE REQUEST',
        // name lives in the text too: the WhatsApp route shows title+text only
        // (kicker is used for thread routing), so this is how the player sees WHO.
        text: first + ': "' + line + '"',
        options: [
          {
            label: 'Approve · +' + pct + '%',
            cls: '',
            onPick: function(){
              st.salaryMonthly = Math.round(st.salaryMonthly * (1 + pct / 100) / 500) * 500;
              st.raises = (st.raises || 0) + 1;
              st.burnout = Math.max(0, st.burnout - G.BAL.RAISE_APPROVE_RELIEF);
              if(G.audio.chaChing) G.audio.chaChing();
              G.staff.say(st, pick(['legend ✦', 'knew you would', 'worth it', 'chai on me ☕']));
              G.dock.infoToast('RAISE APPROVED',
                first + ' is now on ' + G.fmtMoney(st.salaryMonthly) + '/mo. Speed +' +
                Math.round(G.BAL.RAISE_SPEED_PER * 100) + '%. Payroll will remember this.', 'good');
            }
          },
          {
            label: 'Deny',
            cls: 'px-btn-dim',
            onPick: function(){
              st.burnout = Math.min(100, st.burnout + G.BAL.RAISE_DENY_BURNOUT);
              if(G.audio.decline) G.audio.decline();
              G.staff.say(st, pick(['noted.', 'cool. cool cool cool.', 'fine.', 'updating my CV. kidding. maybe.']));
              G.dock.infoToast('RAISE DENIED',
                first + ' took it professionally. (Burnout +' + G.BAL.RAISE_DENY_BURNOUT + '%. They will remember too.)', 'bad');
            }
          }
        ]
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
