// CravAche — single mutable gameState + initial state factory + balance knobs.
(function(){
  'use strict';
  window.G = window.G || {};

  // ---------- balance (DESIGN.md economy first-pass, tune freely keep ratios) ----------
  G.BAL = {
    START_MONEY: 200000,
    START_REP: 50,
    DAY_REAL_SECONDS: 45,        // one game day
    DAY_START_HOUR: 9,           // 9:00
    DAY_END_HOUR: 19,            // 19:00 (10 game hours per day)
    WEEKS: 3,                    // Q1 prototype
    DESKS_MAX: 5,
    DESKS_START: 3,

    // brief spawning: every 1.5 game-hours ± jitter, scaled by G.curve.spawnMult
    SPAWN_BASE_HOURS: 1.5,
    SPAWN_JITTER_HOURS: 0.6,

    // work: units needed vs staffer speed (units/sec while working)
    WORK_BASE: 20, WORK_PER_DIFF: 12,
    SPEED_BASE: 1.5, SPEED_PER_SKILL: 0.6,

    // burnout %/sec
    BURNOUT_WORK_RATE: 1.15,
    BURNOUT_IDLE_RECOVER: 2.0,
    COFFEE_BURNOUT_MULT: 0.7,    // coffee machine: burnout rate −30%
    QUIT_DEADLINE_FACTOR: 0.25,  // brief returns to tray with 25% deadline left

    // money ticks (cosmetic escrow share, ≈30% of fee total)
    ESCROW_SHARE: 0.30,
    TICK_MIN: 80, TICK_MAX: 150,

    // verdict base odds (verdict.js normalizes)
    ODDS: { approve: 50, small: 33, scrapped: 7, viral: 6 },
    VIRAL_FEE_MULT: 6,
    SMALL_EXTRA_WORK: 0.40,

    // rep deltas
    REP_DECLINE: -2, REP_SCRAPPED: -6, REP_OVERDUE: -4,
    REP_APPROVE: 2, REP_VIRAL: 5,
    NEON_REP_BONUS: 1,           // extra rep on positive verdicts

    // chaos
    CHAOS_OVERDUE: 12, CHAOS_IGNORED_CALL: 8, CHAOS_SCOPE_REFUSE: 5,
    CHAOS_DECAY_PER_SEC: 0.45,   // only when everything on-track
    CHAOS_QUIT: 10,

    // events (call/scope-creep chances live in G.curve)
    CALL_HOLD_REAL_SECONDS: 5,   // "10 in-game minutes" of your attention
    OFFICE_EVENT_CHANCE_PER_DAY: 0.5,

    // shop (Friday upgrade moment, one purchase)
    SHOP: {
      desk:   { name:"Extra desk",     price:40000, desc:"room for one more hire" },
      plant:  { name:"Office plant",   price:12000, desc:"morale. allegedly." },
      coffee: { name:"Coffee machine", price:60000, desc:"burnout builds 30% slower" },
      neon:   { name:"Neon sign",      price:80000, desc:"rep gains hit harder" }
    },

    FIRST_TOAST_SECONDS: 30,     // the very first brief of a run: all the time in the world
    INTRO_CLIENTS_FULL: 3        // first N new clients get the full signing dossier modal
  };

  // ---------- difficulty curves ----------
  // Weeks 1-3 are the authored Q1 ramp. Past week 3 = OVERTIME (endless):
  // every knob keeps tightening until it's subway-surfer pace, with floors.
  G.curve = {
    spawnMult: function(w){
      if(w <= 3) return [1.4, 0.85, 0.6][w - 1];
      return Math.max(0.18, 0.6 * Math.pow(0.92, w - 3));
    },
    cap: function(w){
      if(w <= 3) return [2, 4, 6][w - 1];
      return Math.min(9, 6 + Math.floor((w - 3) / 2));
    },
    callChance: function(w){
      if(w <= 3) return [0.3, 0.55, 0.8][w - 1];
      return Math.min(0.95, 0.8 + (w - 3) * 0.03);
    },
    scopeChance: function(w){
      if(w <= 3) return [0.2, 0.4, 0.55][w - 1];
      return Math.min(0.75, 0.55 + (w - 3) * 0.02);
    },
    // seconds to decide on a brief toast: generous early, brutal in overtime
    toastSeconds: function(w){
      if(w <= 3) return [20, 13, 9][w - 1];
      return Math.max(5, 9 - (w - 3) * 0.5);
    }
  };

  G.initialState = function(){
    var staffPool = G.data.staff.slice();
    var hired = staffPool.slice(0, 2).map(makeStaffer); // contract: first 2 = starting team
    hired.forEach(function(s, i){ s.desk = i; });
    return {
      running: false,
      paused: false,            // hard pause (verdict/report/game-over modals)
      muted: false,
      gameOver: null,           // {type:'win'|'payroll'|'chaos'}

      money: G.BAL.START_MONEY,
      moneyShown: G.BAL.START_MONEY, // count-up display value
      rep: G.BAL.START_REP,
      chaos: 0,
      strikes: 0,

      week: 1, day: 1,          // day 1=Mon .. 5=Fri
      dayT: 0,                  // real seconds into current day

      desksUnlocked: G.BAL.DESKS_START,
      upgrades: { plant:false, coffee:false, neon:false },

      staff: hired,             // active staffers
      hirePool: staffPool.slice(2).map(makeStaffer),
      quitters: [],

      briefs: [],               // live briefs (see briefs.js makeLiveBrief)
      briefDeck: [],            // shuffled ids not yet offered
      nextSpawnIn: 6,           // real seconds to next brief toast
      pendingToasts: 0,

      relationships: {},        // clientId -> n (starts at client.patience)
      goneClients: {},          // clientId -> true (left forever)
      metClients: {},           // clientId -> true (dossier/intro shown)
      introducedCount: 0,       // how many full dossiers shown so far
      endless: false,           // OVERTIME mode past week 3
      _firstToastShown: false,

      quotesWall: [],           // {text, client} survived absurdities
      activeCall: null,         // 6PM call in progress
      callFiredToday: false,
      officeEventToday: false,

      stats: {                  // week-scoped (reset each Friday) + run totals
        weekEarned: 0, weekSpent: 0, weekShipped: 0, weekScrapped: 0,
        totalEarned: 0, totalShipped: 0, totalViral: 0, quotesSurvived: 0
      },
      shake: 0
    };
  };

  function makeStaffer(def){
    return {
      id: def.id, name: def.name, role: def.role, skill: def.skill,
      salaryWeekly: def.salaryWeekly, trait: def.trait, traitTag: def.traitTag,
      portraitKey: def.portraitKey || 'char1',
      burnout: 0, desk: -1, briefId: null,
      bubble: null, bubbleT: 0      // floating speech bubble
    };
  }
  G.makeStaffer = makeStaffer;

  G.state = null; // set by main.js after data load
})();
