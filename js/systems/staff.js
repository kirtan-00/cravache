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

      // Arya: night magic + hard-brief genius + allergic to boring.
      // Buffs stack but cap out; the debuff does not get capped. Obviously.
      if(st.id === 's_arya'){
        var am = 1;
        if(G.time.hour() >= 18) am *= 1.7;
        if(brief && brief.difficulty >= 4) am *= 1.4;
        if(brief && brief.difficulty <= 2) am *= 0.45;
        speed *= Math.min(am, G.BAL.ARYA_SPEED_CAP || 2);
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

    // ---------- the shoulder-stand: click a working staffer ----------
    // tiny chunk of real progress (30 clicks = 1 game hour of their output)
    // plus one excuse from the pool. Free-ish: each click adds a sliver of
    // burnout, because being watched IS work.
    nudge: function(st){
      var b = st.briefId ? G.briefs.byId(st.briefId) : null;
      if(!b) return;
      var realSec = G.time.realPerHour() / G.BAL.NUDGE_CLICKS_PER_HOUR;
      b.workDone += this.effectiveSpeed(st, b) * realSec;
      st.burnout = Math.min(100, st.burnout + G.BAL.NUDGE_BURNOUT);
      // one excuse per click; characters with their own lines mix them in
      var pool = EXCUSES;
      if(st.lines && Math.random() < 0.25) pool = st.lines;
      var line = pool[Math.floor(Math.random() * pool.length)];
      if(line === st._lastExcuse) line = pool[(pool.indexOf(line) + 1) % pool.length];
      st._lastExcuse = line;
      this.say(st, line);
      G.audio.click();
      if(b.workDone >= b.workNeeded) G.briefs.complete(b, st);
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

    // ---------- CV pacing: applicants arrive in waves, not all at once ----------
    // 2 per dept up front (production: at its unlock week), then one new CV
    // per dept per week. Stamps availableWeek lazily so walk-ins slot in too.
    ensureAvailability: function(){
      var s = G.state;
      var perDept = {};
      s.hirePool.forEach(function(c){
        var n = perDept[c.dept] = (perDept[c.dept] || 0) + 1;
        if(c.availableWeek === undefined){
          var base = c.dept === 'production' ? G.BAL.PRODUCTION_UNLOCK_WEEK : 1;
          c.availableWeek = base + Math.max(0, n - 2);
        }
      });
    },

    candidateVisible: function(c){
      return (c.availableWeek || 1) <= G.state.week;
    },

    // ---------- walk-in candidates: the pool never runs dry ----------
    // Named characters are finite; once they're hired (or people rage-quit),
    // Ahmedabad keeps sending CVs. Each dept with open cap keeps >=2 VISIBLE.
    refillPool: function(){
      var s = G.state, self = this;
      this.ensureAvailability();
      var depts = ['designer', 'editor', 'content', 'production'];
      for(var d = 0; d < depts.length; d++){
        var dept = depts[d];
        if(this.deptCount(dept) >= G.BAL.DEPT_CAPS[dept]) continue;
        var inPool = s.hirePool.filter(function(c){
          return c.dept === dept && self.candidateVisible(c);
        }).length;
        while(inPool < 2){
          var w = G.makeStaffer(walkIn(dept));
          w.availableWeek = s.week; // walked in just now
          s.hirePool.push(w);
          inPool++;
        }
      }
    },

    // staffer at a desk index, or null
    atDesk: function(d){
      var arr = G.state.staff;
      for(var i=0;i<arr.length;i++) if(arr[i].desk === d) return arr[i];
      return null;
    }
  };

  // ---------- the excuse pool (one per shoulder-stand click) ----------
  var EXCUSES = [
    'haan haan, almost done', 'rendering, I swear', '2 minutes boss', 'it is exporting only',
    'wifi is slow today', 'file got corrupt, redoing', 'premiere crashed again', 'autosave betrayed me',
    'just polishing it', 'one last pass', 'fonts are not loading', 'the plugin expired',
    'mac is heating up', 'I was just about to', 'send hi on whatsapp, sending', 'cloud is syncing',
    'taking backup first', 'this is the final final', 'colour grading, very close', 'audio is 90% there',
    'client ref was blurry', 'the brief changed na', 'waiting on assets', 'drive link is broken',
    'storage full, deleting', 'it looks done but it is not', 'trust the process', 'I work better watched. lie.',
    'caffeine loading', 'just opened the file', 'was fixing margins', 'kerning takes time boss',
    'the gradient is fighting me', 'mood board first na', 'exploring directions', 'two options coming',
    'making it pop, as asked', 'less is more, removing', 'more is more, adding', 'version 14 is the one',
    'saving as final_v3_FINAL', 'layers are a mess, sorting', 'masking takes patience', 'pen tool is spiritual work',
    'timeline is heavy', 'proxies are building', 'cache is clearing', 'GPU is thinking',
    'frame rate issue, solving', 'the cut needs to breathe', 'music is not sitting right', 'syncing to the beat',
    'subtitle timing, very close', 'one transition left', 'colour looks different here', 'monitor is lying to me',
    'it works on my screen', 'exporting draft for you', 'compressing, almost', 'upload at 97%',
    'hashtag research, serious work', 'caption needs one more draft', 'tone of voice check', 'grammarly is judging me',
    'the hook is not hooking', 'thesaurus broke me', 'writing the third option', 'shorter version coming',
    'longer version also coming', 'client will love this one', 'this line slaps, wait', 'deleting my best work, fine',
    'lunch was heavy boss', 'chai break was research', 'bathroom is networking', 'stand-up ran long',
    'I replied to the client first', 'mail draft is ready', 'was helping Palak', 'was helping literally everyone',
    'phone died, charging', 'notifications attacked me', 'instagram was for reference', 'youtube tutorial, 2x speed',
    'learning the new tool', 'old tool was better', 'shortcut keys changed', 'my mouse is double clicking',
    'chair is wobbling, focus gone', 'AC is directly on me', 'it is too quiet to work', 'it is too loud to work',
    'monday brain, sorry', 'friday brain, sorry', 'post lunch dip, scientific', 'deadline makes me faster, watch',
    'I do my best work at night', 'almost had it, restarting', 'do not stand there na', 'ok ok ok doing it now'
  ];

  // ---------- walk-in generator ----------
  var FIRST = ['Hardik','Mansi','Rohan','Khushi','Parth','Avni','Yash','Disha','Kunal',
    'Shreya','Nikhil','Pooja','Raj','Esha','Tejas','Krupa','Sahil','Dhruvi','Meet','Tanvi'];
  var LAST = ['Pandya','Soni','Bhatt','Gandhi','Vora','Mehta','Dholakia','Acharya',
    'Parmar','Thakkar','Raval','Chauhan','Modi','Vyas','Solanki','Dave'];
  var TAGS = ['skips_legal','slowmo_lover','blue_only','meme_brain',
    'deadline_blind','perfection_loop','boring_allergy','trend_chaser'];
  var TRAITS = [
    'Came from a bigger agency. Will not say which one or why.',
    'Portfolio is 90% college work, 10% confidence.',
    'Replies "noted" to everything. Sometimes even does it.',
    'Asked about work-life balance in the interview. Brave.',
    'Left their last job over "creative differences". Twice.',
    'Freelanced for two years. Allergic to timesheets now.',
    'LinkedIn says thought leader. CV says 14 months experience.',
    'Quiet in meetings, loud in the work.',
    'Knows every chai spot within 500m of every office in the city.',
    'Was promised ESOPs once. Trusts nobody.'
  ];
  var TAG_BADGE = {
    skips_legal:     { icon: '⚠️', label: 'Loose Cannon',  desc: 'Fast, but fine print is a suggestion.' },
    slowmo_lover:    { icon: '🎵', label: 'Slow-Mo Hands', desc: 'Everything looks expensive. And slow.' },
    blue_only:       { icon: '🎨', label: 'Safe Hands',    desc: 'No drama, no genius. Ships.' },
    meme_brain:      { icon: '🔥', label: 'Trend Radar',   desc: 'Great on topical briefs. Risky on legacy brands.' },
    deadline_blind:  { icon: '🛠', label: 'Grinder',       desc: 'Heads down, calendar off.' },
    perfection_loop: { icon: '🎯', label: 'One More Pass', desc: 'Quality habit. Time problem.' },
    boring_allergy:  { icon: '🧠', label: 'Picky Genius',  desc: 'Shines on hard briefs, sulks on easy ones.' },
    trend_chaser:    { icon: '🐣', label: 'Chronically Online', desc: 'Saw it on reels first.' }
  };
  // salary by skill star, light jitter; matches the named-cast price ladder.
  // skill 3-4 raised (2026-06-13) so senior walk-ins cost senior money, like
  // the named cast. A 4-star walk-in lands near Arya/Natasha territory.
  var SALARY = [15000, 36000, 55000, 82000];

  function walkIn(dept){
    var s = G.state;
    s._walkinSeq = (s._walkinSeq || 0) + 1;
    var skill = 1 + Math.floor(Math.random() * 4); // 1-4; 5★ stays named-cast only
    var tag = TAGS[Math.floor(Math.random() * TAGS.length)];
    var salary = Math.round(SALARY[skill - 1] * (0.9 + Math.random() * 0.25) / 500) * 500;
    // reuse a same-dept named sprite so walk-ins still look like real cast
    var twins = G.data.staff.filter(function(c){ return c.dept === dept; });
    var twin = twins[Math.floor(Math.random() * twins.length)];
    return {
      id: 'w_' + s._walkinSeq,
      name: FIRST[Math.floor(Math.random() * FIRST.length)] + ' ' +
            LAST[Math.floor(Math.random() * LAST.length)],
      dept: dept,
      level: skill === 1 ? 'intern' : skill === 4 ? 'senior' : 'junior',
      skill: skill,
      salaryMonthly: salary,
      trait: TRAITS[Math.floor(Math.random() * TRAITS.length)],
      traitTag: tag,
      badges: [TAG_BADGE[tag]],
      portraitKey: twin ? twin.portraitKey : 'char1'
    };
  }
})();
