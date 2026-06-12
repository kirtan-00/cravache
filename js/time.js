// CravAche — game clock. Day = 45 real seconds, Mon-Fri, weekends auto-skip.
// Friday end-of-day fires payroll + report card. Week 3 Friday report = win.
(function(){
  'use strict';
  window.G = window.G || {};

  var DAY_NAMES = ['MON','TUE','WED','THU','FRI'];

  G.time = {
    // fraction of day elapsed 0..1
    dayFrac: function(){
      return Math.min(1, G.state.dayT / G.BAL.DAY_REAL_SECONDS);
    },

    // current game hour (e.g. 13.5 = 1:30 PM)
    hour: function(){
      var span = G.BAL.DAY_END_HOUR - G.BAL.DAY_START_HOUR;
      return G.BAL.DAY_START_HOUR + this.dayFrac() * span;
    },

    clockString: function(){
      var h = this.hour();
      var hh = Math.floor(h);
      var mm = Math.floor((h - hh) * 60);
      mm = mm - (mm % 10); // chunky 10-min steps, pixel clocks don't do precision
      var ampm = hh >= 12 ? 'PM' : 'AM';
      var h12 = hh > 12 ? hh - 12 : hh;
      return DAY_NAMES[G.state.day - 1] + ' ' + h12 + ':' + (mm < 10 ? '0' : '') + mm + ampm;
    },

    // real seconds per game hour (used to convert event timings)
    realPerHour: function(){
      return G.BAL.DAY_REAL_SECONDS / (G.BAL.DAY_END_HOUR - G.BAL.DAY_START_HOUR);
    },

    // game days -> real seconds (deadlines)
    daysToReal: function(days){
      return days * G.BAL.DAY_REAL_SECONDS;
    },

    update: function(dt){
      var s = G.state;
      s.dayT += dt;

      // 6PM call window
      if(!s.callFiredToday && this.hour() >= 18 && !s.activeCall){
        s.callFiredToday = true;
        if(Math.random() < G.curve.callChance(s.week)) G.events.fireSixPMCall();
      }

      // one random office event somewhere mid-day
      if(!s.officeEventToday && this.hour() >= 11 && this.hour() < 17){
        s.officeEventToday = true; // roll once
        if(Math.random() < G.BAL.OFFICE_EVENT_CHANCE_PER_DAY){
          // schedule it a touch later so it doesn't stack with spawns
          s._officeEventAt = s.dayT + 2 + Math.random() * 8;
        }
      }
      if(s._officeEventAt && s.dayT >= s._officeEventAt){
        s._officeEventAt = null;
        G.events.fireOfficeEvent();
      }

      // end of day
      if(s.dayT >= G.BAL.DAY_REAL_SECONDS){
        this.endDay();
      }
    },

    endDay: function(){
      var s = G.state;
      var wasFriday = (s.day === 5);

      if(wasFriday){
        // payroll + report card pauses the sim; week advances when report closes
        G.economy.runPayroll();
        return; // modals.js calls G.time.advanceToMonday() on close
      }
      s.day += 1;
      this.resetDayFlags();
      G.hud.flashDayBanner();
    },

    advanceToMonday: function(){
      var s = G.state;
      if(s.gameOver) return;
      if(s.week >= G.BAL.WEEKS && !s.endless){
        G.main.winGame();
        return;
      }
      s.week += 1;
      s.day = 1;
      this.resetDayFlags();
      G.hud.flashDayBanner();
    },

    resetDayFlags: function(){
      var s = G.state;
      s.dayT = 0;
      s.callFiredToday = false;
      s.officeEventToday = false;
      s._officeEventAt = null;
    },

    spawnIntervalReal: function(){
      var s = G.state;
      var mult = G.curve.spawnMult(s.week);
      var hours = G.BAL.SPAWN_BASE_HOURS * mult +
                  (Math.random() * 2 - 1) * G.BAL.SPAWN_JITTER_HOURS * mult;
      return Math.max(0.4, hours) * this.realPerHour();
    }
  };
})();
