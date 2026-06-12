// CravAche — staff: burnout build/recover, quitting (takes nothing, leaves the
// brief in the tray with 25% deadline), speech bubbles, hiring.
(function(){
  'use strict';
  window.G = window.G || {};

  G.staff = {
    byId: function(id){
      var arr = G.state.staff;
      for(var i=0;i<arr.length;i++) if(arr[i].id === id) return arr[i];
      return null;
    },

    update: function(dt){
      var s = G.state;
      for(var i = s.staff.length - 1; i >= 0; i--){
        var st = s.staff[i];
        var working = !!st.briefId;

        if(working){
          var rate = G.BAL.BURNOUT_WORK_RATE * (s.upgrades.coffee ? G.BAL.COFFEE_BURNOUT_MULT : 1);
          st.burnout = Math.min(100, st.burnout + rate * dt);
        } else {
          st.burnout = Math.max(0, st.burnout - G.BAL.BURNOUT_IDLE_RECOVER * dt);
        }

        // burnout warning event (once per staffer crossing 75)
        if(working && st.burnout >= 75 && !st._warned){
          st._warned = true;
          G.events.fireBurnoutWarn(st);
        }
        if(st.burnout < 55) st._warned = false;

        if(st.burnout >= 100){
          this.quit(st);
          continue;
        }

        // bubble decay
        if(st.bubble){
          st.bubbleT -= dt;
          if(st.bubbleT <= 0) st.bubble = null;
        }
      }
    },

    quit: function(st){
      var s = G.state;
      // their assigned brief returns to tray with 25% deadline remaining
      if(st.briefId){
        var b = G.briefs.byId(st.briefId);
        if(b) G.briefs.returnToTray(b, G.BAL.QUIT_DEADLINE_FACTOR);
      }
      var idx = s.staff.indexOf(st);
      if(idx >= 0) s.staff.splice(idx, 1);
      s.quitters.push(st.name);
      G.chaos.add(G.BAL.CHAOS_QUIT);
      G.audio.quit();
      G.dock.infoToast('RAGE QUIT', st.name + ' just left. Their notice period was the door slamming.', 'bad');
    },

    say: function(st, text){
      st.bubble = text;
      st.bubbleT = 3.2;
    },

    freeDesk: function(){
      var s = G.state;
      var used = {};
      s.staff.forEach(function(st){ used[st.desk] = true; });
      for(var d = 0; d < s.desksUnlocked; d++) if(!used[d]) return d;
      return -1;
    },

    canHire: function(){
      return G.state.hirePool.length > 0 && this.freeDesk() >= 0;
    },

    hire: function(poolIndex){
      var s = G.state;
      var d = this.freeDesk();
      if(d < 0) return false;
      var st = s.hirePool.splice(poolIndex, 1)[0];
      if(!st) return false;
      st.desk = d;
      st.burnout = 0;
      s.staff.push(st);
      G.audio.accept();
      G.dock.infoToast('NEW HIRE', st.name + ' joined. ' + st.trait, 'good');
      return true;
    },

    // staffer at a desk index, or null
    atDesk: function(d){
      var arr = G.state.staff;
      for(var i=0;i<arr.length;i++) if(arr[i].desk === d) return arr[i];
      return null;
    }
  };
})();
