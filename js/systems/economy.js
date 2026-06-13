// CravAche — money: per-second ticks while staffers work (escrow ≈30% of fee),
// Friday payroll + strikes, purchases.
(function(){
  'use strict';
  window.G = window.G || {};

  var tickSfxCooldown = 0;

  G.economy = {
    update: function(dt){
      tickSfxCooldown = Math.max(0, tickSfxCooldown - dt);

      // receivables age; ignored invoices self-pay LATE
      var s = G.state;
      for(var i = s.receivables.length - 1; i >= 0; i--){
        var inv = s.receivables[i];
        inv.age += dt;
        if(inv.age >= G.BAL.INVOICE_AUTOPAY_DAYS * G.BAL.DAY_REAL_SECONDS){
          s.receivables.splice(i, 1);
          // never called? the client "adjusted" the invoice. 80 paise on the rupee.
          var paid = Math.round(inv.amount * G.BAL.INVOICE_AUTOPAY_HAIRCUT);
          this.earn(paid);
          G.audio.chaChing();
          G.dock.infoToast('PAID (LATE, SHORT)', G.fmtMoney(paid) + ' of ' + G.fmtMoney(inv.amount) +
            ' for "' + inv.title + '" landed. "TDS, GST adjustment, goodwill discount." CALL next time.', 'bad');
          G.dock.refreshCollect();
        }
      }
    },

    // collection call succeeded: cash the invoice now
    collect: function(inv){
      var s = G.state;
      var idx = s.receivables.indexOf(inv);
      if(idx < 0) return;
      s.receivables.splice(idx, 1);
      this.earn(inv.amount);
      G.audio.chaChing();
      G.dock.refreshCollect();
    },

    // called per assigned brief per frame from briefs.update
    tickEscrow: function(brief, dt){
      if(brief.escrowLeft <= 0) return;
      var rate = this.tickRate(brief);
      var amt = Math.min(brief.escrowLeft, rate * dt);
      brief.escrowLeft -= amt;
      brief.ticked += amt;
      this.earn(amt, true);
      if(tickSfxCooldown <= 0){
        G.audio.tickMoney();
        tickSfxCooldown = 0.9;
      }
    },

    // ₹/s for a working brief: scaled to fee, clamped 80-150 per DESIGN.md
    tickRate: function(brief){
      var r = Math.round(brief.fee / 1600);
      return Math.max(G.BAL.TICK_MIN, Math.min(G.BAL.TICK_MAX, r));
    },

    earn: function(amt, quiet){
      var s = G.state;
      s.money += amt;
      s.stats.weekEarned += amt;
      s.stats.totalEarned += amt;
      if(!quiet) G.hud.poke('money');
    },

    spend: function(amt){
      var s = G.state;
      s.money -= amt;
      s.stats.weekSpent += amt;
      G.hud.poke('money');
    },

    // salaries are MONTHLY (real Indian numbers); Friday deducts a month/4
    payrollTotal: function(){
      return G.state.staff.reduce(function(sum, st){
        return sum + Math.round(st.salaryMonthly / 4);
      }, 0);
    },

    // rent + AC + software: the office costs money even when nobody works,
    // and the rent only ever goes up
    overheadTotal: function(){
      return G.BAL.OVERHEAD_BASE +
             G.state.staff.length * G.BAL.OVERHEAD_PER_STAFF +
             (G.state.week - 1) * G.BAL.OVERHEAD_WEEK_RAMP;
    },

    runPayroll: function(){
      var s = G.state;
      var total = this.payrollTotal() + this.overheadTotal();
      var cleared = s.money >= total;
      if(cleared){
        this.spend(total);
        G.audio.payday();
      } else {
        s.strikes += 1;
        G.audio.alarm();
        if(s.strikes >= 3){
          G.main.loseGame('payroll');
          return;
        }
      }
      // friday chain: IG recap reel -> report card -> (craanes night) -> monday
      G.modals.showWeeklyReel({
        cleared: cleared,
        payroll: this.payrollTotal(),
        overhead: this.overheadTotal(),
        strikes: s.strikes
      });
    },

    buyUpgrade: function(key){
      var s = G.state;
      var item = G.BAL.SHOP[key];
      if(!item || s.money < item.price) return false;
      if(s.upgrades[key]) return false;
      s.upgrades[key] = true;
      this.spend(item.price);
      G.audio.chaChing();
      return true;
    }
  };
})();
