// CravAche — the verdict slot machine. Base odds shift with fine-print
// compliance (staffer traitTag vs brief extraTags), quality (skill vs
// difficulty) and client mood (relationship vs patience). Papers, Please
// energy: skimming the fine print is how you lose.
(function(){
  'use strict';
  window.G = window.G || {};

  G.verdict = {
    // returns the computed odds table (also used by tests/balancing)
    computeOdds: function(brief, staffer){
      var s = G.state;
      var o = {
        approve: G.BAL.ODDS.approve,
        small: G.BAL.ODDS.small,
        scrapped: G.BAL.ODDS.scrapped,
        viral: G.BAL.ODDS.viral
      };

      // fine print conflict: trait crossed with brief tags
      var conflict = staffer && brief.extraTags.indexOf(staffer.traitTag) !== -1;
      if(conflict){
        o.scrapped += 30;
        o.approve = Math.max(8, o.approve - 22);
        o.viral = Math.max(1, o.viral - 4);
      }

      // quality: skill vs difficulty (Arya's hard-brief magic counts here)
      var q = (staffer ? G.staff.effectiveSkill(staffer, brief) : 3) - brief.difficulty;
      o.approve = Math.max(8, o.approve + q * 5);
      o.scrapped = Math.max(2, o.scrapped - q * 2);
      if(q > 0) o.viral += q; // good people make lucky things

      // client mood
      var c = G.data.clientById(brief.clientId);
      var rel = c ? (s.relationships[c.id] !== undefined ? s.relationships[c.id] : c.patience) : 3;
      var mood = rel - (c ? c.patience : 3);
      if(mood < 0){
        o.scrapped += -mood * 4;
        o.small += -mood * 3;
      }

      return { odds: o, conflict: conflict };
    },

    roll: function(odds){
      var total = odds.approve + odds.small + odds.scrapped + odds.viral;
      var r = Math.random() * total;
      if((r -= odds.approve) < 0) return 'approve';
      if((r -= odds.small) < 0) return 'small';
      if((r -= odds.scrapped) < 0) return 'scrapped';
      return 'viral';
    },

    judge: function(brief, staffer){
      var comp = this.computeOdds(brief, staffer);
      var outcome = this.roll(comp.odds);
      var remainder = Math.max(0, brief.fee - Math.round(brief.ticked));
      var payout = 0;

      if(outcome === 'approve') payout = remainder;
      if(outcome === 'viral') payout = brief.fee * G.BAL.VIRAL_FEE_MULT - Math.round(brief.ticked);

      G.modals.showVerdict({
        brief: brief,
        staffer: staffer,
        outcome: outcome,
        payout: payout,
        conflict: comp.conflict
      }, function(){ G.verdict.applyOutcome(brief, staffer, outcome, payout, comp.conflict); });
    },

    // called the moment the slot lands (modal still open, count-up visible)
    applyOutcome: function(brief, staffer, outcome, payout, conflict){
      var s = G.state;
      var repBonus = s.upgrades.neon ? G.BAL.NEON_REP_BONUS : 0;
      var client = G.data.clientById(brief.clientId);

      switch(outcome){
        case 'approve':
          // approved ≠ paid. It becomes an invoice; go CALL for your money.
          s.receivables.push({ clientId: brief.clientId, title: brief.title, amount: payout, age: 0 });
          s.rep += G.BAL.REP_APPROVE + repBonus;
          s.stats.weekShipped++; s.stats.totalShipped++;
          G.audio.chaChing();
          G.dock.refreshCollect();
          break;

        case 'viral':
          // viral money also needs collecting. Fame is not cashflow.
          s.receivables.push({ clientId: brief.clientId, title: brief.title, amount: payout, age: 0 });
          s.rep += G.BAL.REP_VIRAL + repBonus;
          s.stats.weekShipped++; s.stats.totalShipped++; s.stats.totalViral++;
          G.audio.viral();
          G.main.screenShake();
          G.modals.confetti();
          G.dock.refreshCollect();
          if(client){
            s.quotesWall.push({ text: '"' + brief.title + '" went viral. The client is taking credit.', client: client.name });
          }
          break;

        case 'small':
          // +₹0, same deadline, 40% extra work, back to the same desk
          brief.workNeeded += brief.workNeeded * G.BAL.SMALL_EXTRA_WORK;
          if(staffer && G.staff.byId(staffer.id) && !staffer.briefId){
            brief.status = 'assigned';
            staffer.briefId = brief.id;
            brief.staffId = staffer.id;
            G.staff.say(staffer, '"small" changes haan');
          } else {
            G.briefs.returnToTray(brief, 1);
          }
          G.audio.decline();
          break;

        case 'scrapped':
          s.rep = Math.max(0, s.rep + G.BAL.REP_SCRAPPED);
          s.stats.weekScrapped++;
          G.chaos.add(6);
          // really bad work costs real money
          G.economy.spend(Math.round(brief.fee * G.BAL.CLAWBACK_SCRAPPED));
          if(conflict && client){
            G.events.bumpRelationship(client.id, -1);
          }
          G.audio.scrapped();
          break;
      }
      G.hud.poke('rep');
      G.dock.refreshTray();
    },

    labelFor: function(outcome){
      return {
        approve: 'APPROVED ✔',
        small: '"SMALL CHANGES"',
        scrapped: 'SCRAPPED',
        viral: 'IT WENT VIRAL!!'
      }[outcome];
    }
  };
})();
