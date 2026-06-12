// CravAche — staff: departments, burnout build/recover, quitting (leaves the
// brief in the tray with 25% deadline), speech bubbles, gimmick lines, hiring,
// and the special-character engine (Arya, Devang, the Director).
(function(){
  'use strict';
  window.G = window.G || {};

  G.staff = {
    byId: function(id){
      var arr = G.state.staff;
      for(var i=0;i<arr.length;i++) if(arr[i].id === id) return arr[i];
      return null;
    },

    deptUnlocked: function(dept){
      if(dept === 'production') return G.state.week >= G.BAL.PRODUCTION_UNLOCK_WEEK;
      return true;
    },

    deptCount: function(dept){
      return G.state.staff.filter(function(st){ return st.dept === dept; }).length;
    },

    // can this staffer work this brief?
    canWork: function(st, brief){
      if(st.universal) return true;                  // Devang / the Producer
      if(!brief.role || brief.role === 'any') return true;
      return st.dept === brief.role;
    },

    // ---------- the special-character engine ----------
    // real working speed in work-units/sec, given the brief and time of day
    effectiveSpeed: function(st, brief){
      var speed = G.BAL.SPEED_BASE + st.skill * G.BAL.SPEED_PER_SKILL;

      // Arya: night magic + hard-brief genius + allergic to boring
      if(st.id === 's_arya'){
        if(G.time.hour() >= 18) speed *= 1.7;
        if(brief && brief.difficulty >= 4) speed *= 1.4;
        if(brief && brief.difficulty <= 2) speed *= 0.45;
      }
      // Devang: clutch gene, +50% when deadline under 30%
      if(st.id === 's_devang' && brief && brief.deadlineLeft < brief.deadlineTotal * 0.3){
        speed *= 1.5;
      }
      // Director on payroll: whole production dept +20%
      if(st.dept === 'production' && this.byId('s_dev_anand')){
        speed *= G.BAL.DIRECTOR_BOOST;
      }
      return speed;
    },

    // skill as the verdict sees it (Arya's hard-brief magic shows in quality too)
    effectiveSkill: function(st, brief){
      var skill = st.skill;
      if(st.id === 's_arya' && brief){
        if(brief.difficulty >= 4) skill += 2;
        if(brief.difficulty <= 2) skill -= 2;
      }
      return skill;
    },

    update: function(dt){
      var s = G.state;
      for(var i = s.staff.length - 1; i >= 0; i--){
        var st = s.staff[i];
        var working = !!st.briefId && G.time.onClock(st); // home = not working, recovering

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

        // gimmick lines (Mahesh's legend claims, Arya's night grumbles...)
        if(st.lines && !st.bubble){
          st.lineT -= dt;
          if(st.lineT <= 0){
            st.lineT = 16 + Math.random() * 20;
            this.say(st, st.lines[Math.floor(Math.random() * st.lines.length)]);
          }
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
      st.bubbleT = 4.5;
    },

    // first free desk slot belonging to this dept, or -1
    freeDesk: function(dept){
      var s = G.state;
      var DESKS = G.render.office.DESKS;
      var used = {};
      s.staff.forEach(function(st){ used[st.desk] = true; });
      for(var d = 0; d < DESKS.length; d++){
        if(DESKS[d].dept === dept && !used[d]) return d;
      }
      return -1;
    },

    seat: function(st){
      var d = this.freeDesk(st.dept);
      if(d < 0) return false;
      st.desk = d;
      return true;
    },

    canHire: function(def){
      return this.deptUnlocked(def.dept) &&
             this.deptCount(def.dept) < G.BAL.DEPT_CAPS[def.dept] &&
             this.freeDesk(def.dept) >= 0;
    },

    hire: function(poolIndex){
      var s = G.state;
      var def = s.hirePool[poolIndex];
      if(!def || !this.canHire(def)) return false;
      s.hirePool.splice(poolIndex, 1);
      var st = def;
      st.burnout = 0;
      if(!this.seat(st)) return false;
      s.staff.push(st);
      G.audio.accept();
      G.dock.infoToast('NEW HIRE · ' + st.dept.toUpperCase(), st.name + ' joined. ' + st.trait, 'good');
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
