// CravAche — single mutable gameState + initial state factory + balance knobs.
(function(){
  'use strict';
  window.G = window.G || {};

  // ---------- balance (DESIGN.md economy first-pass, tune freely keep ratios) ----------
  G.BAL = {
    START_MONEY: 100000,         // ~4 starting payrolls. Tight is the point.
    START_REP: 50,
    DAY_REAL_SECONDS: 45,        // one game day (9AM-7PM)
    DAY_START_HOUR: 9,           // 9:00
    DAY_END_HOUR: 19,            // 19:00 (10 game hours per day)

    // night shift: 7PM-midnight. Only the night owls work; everyone else
    // sleeps at home. Skippable when no owl is mid-task.
    NIGHT_REAL_SECONDS: 15,
    NIGHT_END_HOUR: 24,
    NIGHT_OWLS: { s_arya: true, s_natasha: true, s_dev_anand: true },
    WEEKS: 8,                    // local -> gujarat -> india -> dubai -> global

    // departments
    DEPT_CAPS: { designer: 5, editor: 5, content: 3, production: 4 },
    PRODUCTION_UNLOCK_WEEK: 3,   // survive 2 weeks, production opens
    DIRECTOR_BOOST: 1.2,         // production dept speed while the Director is hired

    // client tiers: week each tier starts appearing
    TIER_UNLOCK: { local: 1, gujarat: 2, india: 3, dubai: 3, global: 8 },
    TIER_LABEL: ['LOCAL', 'GUJARAT', 'INDIA', 'IND+DXB', 'IND+DXB', 'IND+DXB', 'IND+DXB', 'GLOBAL'],

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

    // money penalties: bad work costs real money (clawbacks)
    CLAWBACK_SCRAPPED: 0.25,     // of fee, when the client scraps your work
    CLAWBACK_OVERDUE: 0.15,      // of fee, when a deadline lapses

    // receivables: approved fees become invoices. Hold CALL to collect now;
    // ignored invoices self-pay LATE (auto, after this many days)
    INVOICE_AUTOPAY_DAYS: 2.5,
    INVOICE_CALL_HOLD: 3,        // real seconds of holding through excuses

    // chaos
    CHAOS_OVERDUE: 12, CHAOS_IGNORED_CALL: 8, CHAOS_SCOPE_REFUSE: 5,
    CHAOS_DECAY_PER_SEC: 0.45,   // only when everything on-track
    CHAOS_QUIT: 10,

    // events (call/scope-creep chances live in G.curve)
    CALL_HOLD_REAL_SECONDS: 5,   // "10 in-game minutes" of your attention
    OFFICE_EVENT_CHANCE_PER_DAY: 0.4,  // wifi/hotspot drama ~ once per 2-3 days

    // shop (Friday upgrade moment, one purchase)
    SHOP: {
      plant:  { name:"Office plant",   price:12000, desc:"morale. allegedly." },
      coffee: { name:"Coffee machine", price:60000, desc:"burnout builds 30% slower" },
      neon:   { name:"Neon sign",      price:80000, desc:"rep gains hit harder" }
    },

    FIRST_TOAST_SECONDS: 45,     // the very first brief of a run: all the time in the world
    INTRO_CLIENTS_FULL: 3        // first N new clients get the full signing dossier modal
  };

  // ---------- difficulty curves ----------
  // Weeks 1-8 are the authored ramp (local -> global). Past week 8 = OVERTIME:
  // every knob keeps tightening until it's subway-surfer pace, with floors.
  function ramp(arr, w, overtime){
    if(w <= arr.length) return arr[w - 1];
    return overtime(w - arr.length, arr[arr.length - 1]);
  }
  G.curve = {
    spawnMult: function(w){
      return ramp([1.4, 1.0, 0.8, 0.7, 0.6, 0.52, 0.46, 0.4], w,
        function(o, last){ return Math.max(0.15, last * Math.pow(0.92, o)); });
    },
    cap: function(w){
      return ramp([2, 3, 4, 5, 6, 7, 8, 8], w,
        function(o, last){ return Math.min(10, last + Math.floor(o / 2)); });
    },
    callChance: function(w){
      return ramp([0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.85, 0.9], w,
        function(o, last){ return Math.min(0.95, last + o * 0.02); });
    },
    scopeChance: function(w){
      return ramp([0.2, 0.3, 0.38, 0.45, 0.5, 0.55, 0.6, 0.65], w,
        function(o, last){ return Math.min(0.75, last + o * 0.02); });
    },
    // seconds to decide on a brief toast: generous early, brutal in overtime.
    // (hovering a toast pauses its timer; reading is always free)
    toastSeconds: function(w){
      return ramp([30, 22, 16, 12, 10, 8, 7, 6], w,
        function(o, last){ return Math.max(5, last - o * 0.25); });
    }
  };

  // is this client tier unlocked at week w?
  G.tierOpen = function(tier, w){
    var u = G.BAL.TIER_UNLOCK[tier];
    return u !== undefined ? w >= u : true;
  };

  // censored client rage, for strike calls and scrapped verdicts
  var RAGE = [
    'what the f*** is this',
    'are you f****** kidding me',
    'b******* hai ye pura',
    'my intern could do this s***',
    'f****** amateurs yaar',
    'kya b******i hai ye',
    'this is absolute f****** garbage',
    'h*** f****** kaam karte ho tum log'
  ];
  G.rage = function(){
    return RAGE[Math.floor(Math.random() * RAGE.length)];
  };

  G.initialState = function(){
    var staffPool = G.data.staff.slice();
    var hired = staffPool.slice(0, 2).map(makeStaffer); // contract: first 2 = starting team
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
      night: false, nightT: 0,  // night shift phase

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
      endless: false,           // OVERTIME mode past week 8
      _firstToastShown: false,

      // growth layer
      leads: [],                // [{t, closeRate}] brewing leads
      growthBonus: 0,           // permanent close-rate bonus (website, pitch deck)
      growthOwned: {},          // one-time growth purchases
      _growthAnnounced: false,

      // receivables: approved work invoices. CALL to collect, or wait (late).
      receivables: [],          // [{clientId, title, amount, age}]

      // investor bailout + restructure mode
      restructure: false,       // sim frozen, free management, LET'S GO resumes
      bailouts: 0,              // investor rescues used (max 2)

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
      id: def.id, name: def.name, dept: def.dept, level: def.level || 'junior',
      skill: def.skill, salaryMonthly: def.salaryMonthly,
      trait: def.trait, traitTag: def.traitTag,
      universal: !!def.universal,
      badges: def.badges || [],
      lines: def.lines || null, lineT: 8 + Math.random() * 14, // gimmick bubble timer
      portraitKey: def.portraitKey || 'char1',
      burnout: 0, desk: -1, briefId: null,
      bubble: null, bubbleT: 0      // floating speech bubble
    };
  }
  G.makeStaffer = makeStaffer;

  G.state = null; // set by main.js after data load
})();
