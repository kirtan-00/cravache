// CravAche — single mutable gameState + initial state factory + balance knobs.
(function(){
  'use strict';
  window.G = window.G || {};

  // ---------- balance (DESIGN.md economy first-pass, tune freely keep ratios) ----------
  G.BAL = {
    START_MONEY: 130000,         // ~2 starting weeks of costs. Tight is the point.

    // economy rebalance (2026-06-13 design pass): briefs.json is now re-priced
    // to real Indian agency rates (role x tier ladder), so the JSON is ground
    // truth. Knob kept at 1 for future global tuning.
    FEE_GLOBAL_MULT: 1,

    // small money is paid on the spot over UPI; clients only make you chase
    // the big invoices. Approve/viral payouts strictly below this skip the
    // receivable and credit cash immediately (verdict.js applyOutcome).
    INSTANT_PAY_UNDER: 10000,
    START_REP: 50,
    DAY_REAL_SECONDS: 45,        // one game day (9AM-7PM)
    DAY_START_HOUR: 9,           // 9:00
    DAY_END_HOUR: 19,            // 19:00 (10 game hours per day)

    // night shift: 7PM-midnight. Only the night owls work; everyone else
    // sleeps at home. Skippable when no owl is mid-task.
    NIGHT_REAL_SECONDS: 15,
    NIGHT_END_HOUR: 24,
    // night workers: Arya (own night magic), Preet, Nirav + Kirtan/Ohm (production)
    // and Vraj (editor) who also pull night shifts.
    NIGHT_OWLS: { s_arya: true, s_natasha: true, s_dev_anand: true, s_vicky: true, s_imran: true, s_farhan: true },
    NIGHT_OWL_SPEED: 1.2,        // staff.js: night owls work this much faster at night, so staying for night work is a real choice, not just a skip
    WEEKS: 8,                    // local -> gujarat -> india -> mumbai -> global

    // departments
    DEPT_CAPS: { designer: 5, editor: 5, content: 3, production: 5 },
    MANAGER_SALARY: 300000,      // planned dept managers cost 3 lakh/month each (manager feature built separately)
    PRODUCTION_UNLOCK_WEEK: 2,   // survive 1 week, production studio opens
    DIRECTOR_BOOST: 1.2,         // production dept speed while the Director is hired
    ARYA_SPEED_CAP: 2.0,         // night+hard-brief stack used to hit x2.38

    // weekly office overhead beyond payroll: rent, AC, the one Adobe bill.
    // Scales with headcount so growth costs something ongoing.
    OVERHEAD_BASE: 7000,
    OVERHEAD_PER_STAFF: 3000,
    OVERHEAD_WEEK_RAMP: 7000,    // rent hikes weekly. The landlord saw your reel.
    OVERHEAD_TIER_STEP: 22000,   // extra rent per client tier unlocked beyond local (economy.js reads this)
    OVERHEAD_LATE_WEEK: 4,       // beyond this week the rent escalates hard
    OVERHEAD_LATE_RAMP: 40000,   // per-week escalator applied past OVERHEAD_LATE_WEEK (economy.js reads this)

    // client tiers: week each tier starts appearing
    TIER_UNLOCK: { local: 1, gujarat: 2, india: 3, mumbai: 4, global: 7 },
    TIER_LABEL: ['LOCAL', 'GUJARAT', 'INDIA', 'IND+MUM', 'IND+MUM', 'IND+MUM', 'IND+MUM', 'GLOBAL'],

    // brief spawning: every 1.5 game-hours ± jitter, scaled by G.curve.spawnMult
    SPAWN_BASE_HOURS: 1.5,
    SPAWN_JITTER_HOURS: 0.6,

    // workload tracks headcount: active briefs cap = staff × this.
    // Always slightly more work than hands. That is the anxiety engine.
    WORKLOAD_OVERREACH: 1.6,

    // work: units needed vs staffer speed (units/sec while working)
    WORK_BASE: 20, WORK_PER_DIFF: 12,
    // seniors are expensive but FAST: skill 5 ≈ 2.4x an intern (skill 1).
    SPEED_BASE: 1.5, SPEED_PER_SKILL: 0.85,

    // burnout %/sec
    BURNOUT_WORK_RATE: 1.15,
    BURNOUT_IDLE_RECOVER: 2.0,
    COFFEE_BURNOUT_MULT: 0.7,    // coffee machine: burnout rate −30%
    QUIT_DEADLINE_FACTOR: 0.25,  // brief returns to tray with 25% deadline left

    // money ticks (cosmetic escrow share of fee total; the rest must be CHASED)
    ESCROW_SHARE: 0.12,
    TICK_MIN: 20, TICK_MAX: 90,

    // verdict base odds (verdict.js normalizes)
    ODDS: { approve: 50, small: 24, scrapped: 7, viral: 6 },
    VIRAL_FEE_MULT: 2,
    SMALL_EXTRA_WORK: 0.40,
    MOOD_APPROVE_PER: 4,         // verdict.js: a GOOD client relationship adds this×mood to approve odds (positive mirror of the negative-mood penalty)

    // rep deltas
    REP_DECLINE: -2, REP_SCRAPPED: -6, REP_OVERDUE: -4,
    REP_APPROVE: 2, REP_VIRAL: 5,
    NEON_REP_BONUS: 1,           // extra rep on positive verdicts

    // money penalties: bad work costs real money (clawbacks)
    CLAWBACK_SCRAPPED: 0.40,     // of fee, when the client scraps your work
    CLAWBACK_OVERDUE: 0.15,      // of fee, when a deadline lapses

    // receivables: approved fees become invoices. Hold CALL to collect now;
    // ignored invoices self-pay LATE and SHORT (the client "adjusted" it)
    INVOICE_AUTOPAY_DAYS: 3.5,
    INVOICE_AUTOPAY_HAIRCUT: 0.70, // lazy collectors get 70 paise on the rupee
    INVOICE_CALL_HOLD: 3,        // real seconds of holding through excuses

    // chaos
    CHAOS_OVERDUE: 12, CHAOS_IGNORED_CALL: 8, CHAOS_SCOPE_REFUSE: 5,
    CHAOS_DECAY_PER_SEC: 0.45,   // only when everything on-track
    CHAOS_QUIT: 10,
    CHAOS_DECLINE: 1,            // declining a brief: -2 rep AND +1 chaos (briefs.js) so dodging risk has teeth
    CHAOS_CREEP_OFFTRACK: 1.6,   // chaos.js: while things are off-track (late brief / burnt-out staff) chaos CLIMBS on its own, snowballing toward the wall

    // events (call/scope-creep chances live in G.curve)
    CALL_HOLD_REAL_SECONDS: 5,   // "10 in-game minutes" of your attention
    OFFICE_EVENT_CHANCE_PER_DAY: 0.4,  // wifi/hotspot drama ~ once per 2-3 days

    // raise requests: a staffer asks for a 10-30% bump. Approving permanently
    // raises their salary (Friday payroll) but boosts work speed; denying stings
    // morale. Week 2+, once a day at most, per-staffer cooldown so it recurs.
    RAISE_CHANCE_PER_DAY: 0.5,
    RAISE_MIN_PCT: 10, RAISE_MAX_PCT: 30,
    RAISE_SPEED_PER: 0.04,       // +4% work speed per approved raise (stacks)
    RAISE_APPROVE_RELIEF: 8,     // burnout shaved off — they feel valued
    RAISE_DENY_BURNOUT: 12,      // burnout added — a denied "no" is not free
    RAISE_COOLDOWN_DAYS: 4,      // game-days before the same person can ask again
    RAISE_START_WEEK: 2,         // no raise asks during the forgiving first week

    // shop (Friday upgrade moment, TWO purchases per week)
    SHOP: {
      plant:         { name:"Office plant",     price:5000,  desc:"morale. allegedly. always available — doesn't use a weekly pick" },
      plant_big:     { name:"Big monstera",     price:18000, desc:"a whole jungle corner. burnout builds 10% slower" },
      string_lights: { name:"String lights",    price:20000, desc:"cosy late-night glow. burnout builds 8% slower" },
      cooler:        { name:"Water cooler",     price:35000, desc:"gossip station. idle staff recover faster, together" },
      aquarium:      { name:"Office aquarium",  price:40000, desc:"calming fish. idle burnout recovers 15% faster" },
      tv:            { name:"Office TV",         price:45000, desc:"news + cricket + ads. chaos decays 15% faster" },
      arcade:        { name:"Arcade cabinet",    price:55000, desc:"break-room legend. idle recovers 20% faster, tiny chaos tick" },
      coffee:        { name:"Coffee machine",    price:60000, desc:"burnout builds 30% slower" },
      neon:          { name:"Neon sign",         price:80000, desc:"rep gains hit harder" },
      cat:           { name:"Office cat",         price:50000, desc:"a ginger menace roams the floor. tap to pet — purrs calm everyone" },
      foosball:      { name:"Foosball table",     price:70000, desc:"break-room war. tap for a match — idle staff blow off steam, burnout drops" }
    },

    // auto-assign (trial_autoassign.js): a big-ticket ops upgrade. Once bought,
    // tray briefs route themselves to the fastest free, on-clock, capable staffer.
    // Gated behind a couple of weeks so the player learns assignment by hand first.
    AUTOASSIGN_COST: 600000,
    AUTOASSIGN_UNLOCK_WEEK: 3,  // "after week 2" = buyable from week 3 onward

    // retainers (trial_retainers.js): a client who likes you signs a weekly deal
    MAX_RETAINERS: 3,            // cap concurrent retainers so the economy can't be auto-piloted
    RETAINER_FEE_FRAC: 0.4,      // retainer weekly fee = this × median brief fee (a commitment discount)
    RETAINER_GOOD_DELIVERIES: 4, // good deliveries before a client offers a retainer

    // decor perk knobs (kept MINOR; see js/systems/staff.js + chaos.js):
    //   aquarium      idle burnout recovery +15% (calming fish)
    //   arcade        idle burnout recovery +20% but a tiny chaos tick (people slack)
    //   plant_big     working burnout build -10% (greenery = calmer desks)
    //   posters       working burnout build -8% (the wall says "GREAT WORK")
    //   string_lights working burnout build -8% (cosy late-night glow)
    AQUARIUM_RECOVER_MULT:    1.15,
    ARCADE_RECOVER_MULT:      1.20,
    ARCADE_CHAOS_PER_SEC:     0.04,  // tiny: the office distraction tax
    PLANT_BIG_BURNOUT_MULT:   0.90,
    POSTERS_BURNOUT_MULT:     0.92,
    STRINGLIGHTS_BURNOUT_MULT:0.92,
    SHOP_PICKS_PER_WEEK:      2,

    FIRST_TOAST_SECONDS: 45,     // the very first brief of a run: all the time in the world
    INTRO_CLIENTS_FULL: 3,       // first N new clients get the full signing dossier modal

    // standing over shoulders: click a working staffer -> tiny work boost +
    // one excuse. 12 clicks = one game hour of output. Not free: burnout.
    NUDGE_CLICKS_PER_HOUR: 12,
    NUDGE_BURNOUT: 0.25,

    // office clickables: idle hands get things to do
    CHAI_COST: 200,              // one chai round, whole office
    CHAI_RELIEF: 12,             // burnout shaved off everyone on the clock
    PRINTER_JAM_CHANCE: 0.3,     // rolled each morning; stays jammed until clicked
    PRINTER_FIX_CHAOS: 3,        // fixing it calms the room

    // instagram: followers move with shipped/viral/scrapped work
    START_FOLLOWERS: 800,
    FOLLOWERS_APPROVE: [40, 140],    // random in range per approved brief
    FOLLOWERS_VIRAL: [600, 2400],
    FOLLOWERS_SCRAPPED: -60,

    // the Craanes: award-night parody. Pay to enter. Like the real thing.
    CRAANES_EVERY_WEEKS: 4,      // fires Friday of week 4, 8, 12...
    CRAANES_ENTRY: 75000,        // per category. The jury thanks you.
    CRAANES_WIN_REP: 6,
    CRAANES_WIN_FOLLOWERS: 900
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
      // +10%: a touch more time to read/decide on each new brief offer
      return 1.1 * ramp([30, 22, 16, 12, 10, 8, 7, 6], w,
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

      scene: 'office',          // 'office' | 'studio' (production studio)
      week: 1, day: 1,          // day 1=Mon .. 5=Fri
      dayT: 0,                  // real seconds into current day
      night: false, nightT: 0,  // night shift phase

      upgrades: { plant:false, coffee:false, neon:false, tv:false, cooler:false,
                  aquarium:false, arcade:false, plant_big:false, posters:false, string_lights:false,
                  autoassign:false },
      autoAssignOn: true,       // when autoassign upgrade owned, the toggle (player can pause it)
      neonText: 'CRAVACHE',     // what the neon sign reads (set on purchase)
      tvChannel: 0,             // current TV scene (player can cycle by clicking)

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

      // instagram + award shelf + office clickables
      followers: G.BAL.START_FOLLOWERS,
      trophies: [],             // craanes wins: {label, week}
      craanesDone: {},          // week -> true (award night already happened)
      chaiDay: -1,              // week*10+day of the last chai round
      printerJammed: false,

      quotesWall: [],           // {text, client} survived absurdities
      activeCall: null,         // 6PM call in progress
      callFiredToday: false,
      officeEventToday: false,
      raiseAskedToday: false,   // a staffer may ask for a raise, once a day
      _raiseAt: null,

      stats: {                  // week-scoped (reset each Friday) + run totals
        weekEarned: 0, weekSpent: 0, weekShipped: 0, weekScrapped: 0,
        weekViral: 0, weekFollowers: 0,
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
      shippedWeek: 0,               // MVP race for the friday IG reel
      raises: 0, _raiseDay: -99,    // approved raises (each +RAISE_SPEED_PER speed) + cooldown marker
      bubble: null, bubbleT: 0      // floating speech bubble
    };
  }
  G.makeStaffer = makeStaffer;

  G.state = null; // set by main.js after data load
})();
