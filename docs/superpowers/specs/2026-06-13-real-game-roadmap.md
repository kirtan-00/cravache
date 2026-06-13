# CravAche — From Toy To Real Game: Roadmap (2026-06-13)

Design spec, not code. Owner brief: "think of other features needed to make this a real
game" + "what gameplay keeps it rewarding and stimulating, and the economy should feel
balanced and stimulating... anxious but rewarding." Style: dry, Indian agency flavour,
censored profanity only, no em dashes.

What already exists is treated as built and is not re-proposed (8-week run + OVERTIME,
brief toasts/tray/drag, verdict slot machine, receivables + hold-CALL, growth/leads,
hiring waves, departments + caps, night shift, investor bailout, chaos/fire, burnout/quit,
Friday payroll/report/shop, IG recap reel, the Craanes, chai/printer/nudge/cooler gossip,
MONDAY dread, autosave). The verdict here: the *systems* are rich. What is missing is the
*frame around the systems* (why replay, how to onboard, how the run is scored) and an
*economy that actually pinches*. Right now it does not pinch. See Section 3.

---

## 1. THE MISSING-GAME AUDIT

Judged as a roguelite-adjacent management game, CravAche is a deep mid-game with no front
door and no back wall. The simulation is excellent; the *meta* around a run barely exists.
Ranked by how much each gap hurts.

### 1.1 Meta-progression between runs (THE big one)
- **Why it matters here:** There is zero reason to start run 2. You win Q1, you click
  OVERTIME or RETIRE, and that is the entire arc. A roguelite lives or dies on "I lost,
  but I unlocked X, so the next run starts different." CravAche has a permanent-progress
  vocabulary already (trophies, followers, quotes wall) but none of it survives a reload.
- **Smallest shippable:** A persistent **AGENCY LEGACY** save (separate localStorage key
  from the run autosave). It stores lifetime totals (briefs shipped, viral hits, Craanes,
  peak followers) and unlocks **starting perks** purchasable with a soft meta-currency,
  "Reputation Points" (1 RP per Craane + 1 per 10 briefs shipped per run, banked on
  game-over OR retire). v1 perk shelf, 5 items: start with +1 staffer, start with the
  coffee machine, +₹50k seed money, one free investor bailout, unlock production from
  week 1. Three tiers of cost. That alone converts every loss into progress and makes
  "try again from zero" read as "try again from slightly-less-zero."

### 1.2 End-of-run summary with a GRADE
- **Why it matters here:** `showWin` and `showLose` already print stats, but a number wall
  is not a verdict on YOU. Players need the game to grade their run so they can chase an A.
- **Smallest shippable:** A letter grade (S/A/B/C/D/F) computed from a weighted score
  (Section 1.7), shown big on the win/lose/retire screens with a one-line roast per grade
  ("B — you survived, the office did not catch fire, your therapist did well too"). Reuses
  existing modal shells. This is the cheapest high-impact item in the whole document.

### 1.3 Run scoring + a local leaderboard
- **Why it matters here:** No score means no "beat my last run." The IG followers count is
  *a* scoreboard but it is noisy and not run-summarising.
- **Smallest shippable:** One composite **AGENCY SCORE** integer (Section 1.7), persisted as
  a top-5 local high-score table on the title screen ("HALL OF FAME — or whatever this is").
  Name entry optional, default "The Servicing Guy." No backend. Ship the table first; an
  online board is a "later."

### 1.4 Tutorial / first-day onboarding
- **Why it matters here:** Drag-a-brief-onto-a-desk is not obvious, departments-must-match
  is *definitely* not obvious, and "approved is not paid, go CALL" is genuinely surprising.
  A new player face-plants in week 1 for the wrong reasons (confusion, not difficulty).
- **Smallest shippable:** A scripted **DAY ZERO** (a fake Monday before week 1) with 3-4
  forced beats gated by action, not timers: (1) a single easy brief toast, arrow points to
  tray; (2) ghost-hand hint to drag it onto Palak's desk; (3) on verdict APPROVE, a callout
  "this is an INVOICE, not cash — open RECEIVABLES and hold CALL"; (4) "now you are on your
  own, good luck, the phone is already ringing." Skippable with a "I have done this before"
  button that also sets a localStorage flag so returning players never see it again.

### 1.5 Mid-run goals (weekly targets / quests)
- **Why it matters here:** Survival is the only goal. That is a stick with no carrots
  between Fridays. The minute-to-minute is "react to toasts"; there is no medium-horizon
  objective pulling you forward inside a week.
- **Smallest shippable:** A **WEEKLY BRIEF FROM THE BOSS** (you, narrating to yourself): one
  optional target per week shown on Monday, e.g. "Ship 5 briefs without a scrap (+₹40k
  bonus)", "Land one viral (+rep, +followers)", "Clear all receivables before Friday
  (+RP)". Pulled from a pool of ~12, scaled to week. Hitting it pays a bonus; missing it
  costs nothing. Pure carrot. Surfaces on the Friday report card as DONE/MISSED. (Reuses
  the stats object that already tracks weekShipped/weekScrapped/weekViral.)

### 1.6 Difficulty selection
- **Why it matters here:** One curve fits no one. A first-timer drowns; a veteran is bored
  by week 3. And meta-progression (1.1) needs a "harder = more RP" lever to matter.
- **Smallest shippable:** Three modes on the title screen that scale 3 existing knobs only:
  **INTERN** (START_MONEY ×1.5, spawnMult ×1.15 slower, callChance ×0.8), **SERVICING**
  (current values), **PROMOTED** (START_MONEY ×0.8, spawnMult ×0.85 faster, +1 to RP
  multiplier). No new systems, just a multiplier table read at `initialState`.

### 1.7 The score formula (shared by 1.2/1.3/1.5)
A single function `G.score.compute()` so grade, leaderboard, and RP all agree:
```
score = totalEarned/1000
      + totalShipped * 200
      + totalViral   * 1500
      + trophies     * 3000
      + weeksSurvived * 500
      + peakFollowers/10
      - quitters     * 800
      - scrappedTotal* 150
grade: S>40k  A>28k  B>18k  C>10k  D>4k  else F   (tune after one playtest)
RP    = floor(score/4000) + trophies          (banked to legacy on end)
```

### 1.8 Pause menu + settings
- **Why it matters here:** There is a mute toggle and nothing else. No way to restart a
  doomed run, no volume slider (WebAudio is binary on/off), no "I have to go" pause.
- **Smallest shippable:** An ESC menu: RESUME / RESTART RUN / VOLUME (3 steps: off / soft /
  full, scaling the WebAudio master gain) / colourblind toggle (1.10) / QUIT TO TITLE.
  Acquires the existing `G.modals.acquirePause()` lock so the sim freezes cleanly.

### 1.9 Audio identity
- **Why it matters here:** The SFX are oscillator blips (fine), but there is no *bed*. A
  tycoon game with silence between events feels like a prototype. Audio is 40% of game-feel.
- **Smallest shippable:** One looping low-fi background bed (a 15-30s loop, WebAudio or a
  single small ogg) with a day/night variant (busier in the day, sparse synth at night),
  plus a Friday-payroll sting and a distinct MONDAY drone. Tie volume into 1.8. Keep it
  cheap; even a 2-oscillator arpeggio that changes key by week sells "the agency has a pulse."

### 1.10 Accessibility: colourblind-safe urgency + font size
- **Why it matters here:** Urgency is encoded almost entirely in red (deadline timers,
  chaos, alert states). ~8% of male players (this audience skews male) cannot reliably read
  red-on-warm-wood. And VT323/Silkscreen at native size is rough on smaller laptops.
- **Smallest shippable:** (a) A colourblind toggle that adds **shape/iconography** to urgency
  (a "!" badge + a thicker frame on briefs under 30% deadline, not just red), since the art
  is pixel and can carry a 4px alert chevron cheaply. (b) A 2-step UI scale (100% / 120%) on
  the DOM overlays via a root font-size variable. Both live in the settings menu.

### 1.11 Juice / game-feel gaps (the cheap dopamine)
- **Why it matters here:** DESIGN.md promises "juice > polish" but the reward moments are
  thin outside viral. Approve is a count-up and a cha-ching; that is it.
- **Smallest shippable, pick any:** floating "+₹" pixel numbers that rise off a desk on
  escrow ticks (not just the HUD); a desk "ship" pop (brief icon launches toward the IG
  phone on the wall); a satisfying *thunk* + dust-puff when a brief card lands on a desk; a
  combo meter for consecutive approves with no scrap ("ON FIRE x3", feeds a small fee
  bonus). The combo meter doubles as a soft skill-expression reward and is the best single
  pick.

### 1.12 Fail-forward systems
- **Why it matters here:** The only failure-recovery is the investor bailout (twice, then
  death). Everything else is a cliff. Roguelites feel fair when even disasters give you
  *something*. Right now a wave of quits is pure punishment.
- **Smallest shippable:** Tie disasters to RP (1.1) so a brutal run still banks meta-progress
  ("you went bankrupt in week 6 but shipped 41 briefs: +9 RP"), and add ONE in-run
  fail-forward: when chaos crosses 90%, a one-time **CRISIS MODE** offer — fire-sale a
  staffer for instant cash + chaos relief, or take an emergency high-fee insane brief that,
  if shipped, halves chaos. Turns the death spiral into a decision.

---

## 2. SIX NEW REWARD & STIMULATION MECHANICS

Selected to deepen the existing money -> hire -> bigger briefs -> awards -> fame loop,
weighted toward things that reuse current files and serve a clear emotion. Honest rejects
are listed at the end so the owner sees the reasoning, not just the picks.

### 2.1 RETAINER CONTRACTS (steady income vs exclusivity) — REWARD, with a leash
- **Hook:** A client you have shipped 2+ approved briefs for offers a monthly retainer:
  guaranteed cash every Friday, no chasing, no verdict roulette. The catch: while on
  retainer they expect 1 brief/week shipped (miss it = retainer pauses + relationship hit)
  and you cannot decline their briefs.
- **Rules sketch (new G.BAL block):**
  ```
  RETAINER: {
    OFFER_AFTER_APPROVES: 2,      // shipped+approved for this client
    WEEKLY_PAY: 0.55,             // of that client's avg brief fee, paid to BANK Friday
    QUOTA_PER_WEEK: 1,            // briefs you must ship for them
    MISS_RELATIONSHIP: -1,       // and retainer pauses one week
    MAX_ACTIVE: 3                 // can't retainer the whole roster
  }
  ```
- **Emotion:** trades verdict *anxiety* for committed *stability* — but the quota reintroduces
  a low hum of obligation. Anti-snowball: retainer pay is *less* than chasing full fees, so
  it is a cashflow-smoothing choice, not free money.
- **Integration:** `relationships`/`metClients` already track per-client history; add an
  `approvedCount` per client in verdict.js applyOutcome. Offer surfaces as a toast/modal
  (reuse showEvent). Friday pay in economy.runPayroll before deduction. Quota check on the
  weekly stats rollover already in showReportCard.

### 2.2 STAFF LEVELLING + THE RAISE KNOCK (intern -> junior -> senior) — REWARD + ANXIETY
- **Hook:** Staff who ship enough briefs *gain* skill (intern->junior->senior), getting
  faster and better. Then, at the worst moment, they knock on your door: "I have grown, my
  salary should grow too." Pay the raise (keeps them + the new skill) or refuse (they keep
  the skill but start gaining burnout faster and may counter-offer-quit).
- **Rules sketch:**
  ```
  LEVELUP: {
    SHIP_TO_PROMOTE: [6, 14],     // shipped-count thresholds intern->junior->senior
    SKILL_GAIN: 1,                // +1 star on promote (cap 5, named 5-stars exempt up)
    RAISE_PCT: 0.25,              // salary ask on promotion
    REFUSE_BURNOUT_MULT: 1.3,     // spurned staffer burns 30% faster
    REFUSE_QUIT_CHANCE: 0.15      // rolled next time they hit 75% burnout
  }
  ```
- **Emotion:** long-horizon *reward* (your intern becomes a weapon) wrapped around a sharp
  *anxiety* spike (payroll just went up right when you are stretched). It also makes the
  starting cheap interns worth investing in vs churning, adding a real staffing strategy.
- **Integration:** `staffer.shippedWeek` already counts; add lifetime `shipped`. Promotion
  check in staff.update or on verdict approve. The knock reuses showEvent. Salary feeds the
  existing payrollTotal untouched.

### 2.3 THE RIVAL AGENCY: "ITCH-WORKS" (declined work has consequences) — ANXIETY
- **Hook:** A rival agency exists offscreen. Every brief you DECLINE has a chance to go to
  them; over the run they accumulate a visible RIVAL SCORE on the HUD. If they out-ship you
  by a margin, they start *poaching*: a client you neglected (relationship dropping) defects
  to Itch-Works, taking future briefs. At the Craanes, they are a named competitor for
  Agency of the Evening.
- **Rules sketch:**
  ```
  RIVAL: {
    STEAL_ON_DECLINE: 0.5,        // declined brief credits rival
    POACH_CHECK_FRIDAY: true,     // weekly
    POACH_REL_BELOW: 2,           // neglected clients are poachable
    POACH_LEAD_GAP: 8             // rival must be 8 ships ahead to poach
  }
  ```
- **Emotion:** turns declining from a free pressure-valve into a *cost*, and gives the run an
  antagonist. The current decline is consequence-light (-2 rep); the rival makes "I cannot
  take everything" genuinely tense. Pairs beautifully with the leaderboard (beat the rival).
- **Integration:** a single `state.rival = {ships:0}` counter, incremented in offerNext's
  decline branch. Poach sweep in advanceToMonday using existing `goneClients`. HUD chip
  reuses the hud.poke pattern. Craanes category already exists for the showdown.

### 2.4 PITCH BATTLES (timed minigame for a big account) — ANXIETY -> REWARD
- **Hook:** Roughly once per 1-2 weeks (and as the rival climax), a TENDER appears: a
  marquee account worth a big multi-brief retainer, but you must WIN the pitch against
  Itch-Works. The pitch is a short timed decision minigame: 3 rounds, each shows the
  client's stated want (pulled from fine-print vocabulary) and 3 creative angles; pick the
  one matching their personality under a shrinking timer. Best-of-3 wins the account.
- **Rules sketch:**
  ```
  PITCH: {
    EVERY_WEEKS_FROM: 3,
    ROUNDS: 3, ROUND_SECONDS: [6,5,4],
    WIN_REWARD: { retainer:true, rep:6, followers:[300,800] },
    LOSE: { rivalShips:5, chaos:4 }   // the rival wins it instead
  }
  ```
- **Emotion:** a *spotlight* moment — the run zooms from juggling to a single high-stakes
  duel, then back. It is the trailer shot and the thing that makes winning an account feel
  *earned* rather than spawned. Serves reward through tension, the best kind.
- **Integration:** new small modal flow (modals.showPitch) reusing the hold/timer plumbing
  already built for the 6PM call and the slot machine. Feeds 2.1 (retainer) and 2.3 (rival)
  on resolution. Client personality vocab already in clients.json.

### 2.5 OFFICE TIERS / THE MOVE (bigger office breaks the desk cap) — REWARD milestone
- **Hook:** DESIGN.md names "SHOEBOX" as tier one and implies more. Make it real: at money
  *and* rep milestones, you can MOVE office. A bigger office adds desks (lifting the
  effective hand-count ceiling beyond current desk layout), a nicer background, and a small
  passive perk per tier (Tier 2: rep gain +10%; Tier 3: a second phone line so two
  collections at once; Tier 4: a war-room that slows chaos). Moving costs a lump sum AND a
  half-day of disruption (sim slowed while staff "settle in").
- **Rules sketch:**
  ```
  OFFICE_TIERS: [
    { key:'shoebox', desks:5,  perk:null },
    { key:'floor',   desks:8,  cost:300000, repReq:60, perk:'repGain' },
    { key:'highrise',desks:12, cost:900000, repReq:75, perk:'twoPhone' },
    { key:'tower',   desks:16, cost:2500000,repReq:88, perk:'chaosCalm' }
  ]
  ```
- **Emotion:** the big visible *reward* the loop currently lacks — money milestones unlock
  desks today, but a whole new room is a far bigger dopamine beat and a natural pacing
  gate. It also gives late-game money somewhere to go (a sink, see Section 3).
- **Integration:** desk layout already lives in render/office.js DESKS; a tier swaps the
  background asset + desk array + a perk flag read in the relevant systems. DEPT_CAPS stay;
  desks are the real constraint, so this lifts the soft cap cleanly. New big shop entry or a
  dedicated MOVE button in the dock.

### 2.6 SEASONAL EVENTS (IPL frenzy, Diwali rush, slow-season) — ANXIETY texture
- **Hook:** The 8-week run runs through named "seasons" that reskin spawn behaviour for a
  week: **IPL WEEK** (brand frenzy: spawn rate up, fees up, everything is "topical, make it
  cricket"), **DIWALI RUSH** (deadlines shorter, festive briefs, bonus on shipped), **SLOW
  SEASON / "client is on a retreat"** (fewer briefs, a breather week to bank cash and clear
  burnout, but payroll still hits — the calm-before tension). One season slots into the
  8-week calendar at fixed weeks.
- **Rules sketch:**
  ```
  SEASONS: {
    3: { key:'ipl',    spawnMult:0.7, feeMult:1.4, tagBias:'trend_chaser' },
    5: { key:'diwali', deadlineMult:0.8, shipBonus:0.15 },
    6: { key:'slow',   spawnMult:1.6, feeMult:0.9 }   // sparse week
  }
  ```
- **Emotion:** *rhythm*. Right now every week is the same shape but faster. Seasons give the
  run a varied silhouette (sprint week, festival crunch, recovery week) so the difficulty
  ramp feels authored rather than linear. The slow week is the single most important addition
  for "anxious but rewarding": it is the exhale that makes the next inhale land.
- **Integration:** a lookup keyed by week in G.curve, multiplying the values it already
  returns (spawnMult, fee at accept, deadline at accept). Monday banner announces the season.
  Zero new system, it is a modifier layer over the existing curve.

### Rejected (honestly), with reasons
- **Client gifts / bribes:** reads as pay-to-win, undercuts the verdict skill expression, and
  the relationship system already covers "keep the client happy." Cut.
- **The CEO character with demands:** YOU are already the put-upon protagonist; adding a boss
  above you muddies the fantasy (you ARE the boss of this office). The "weekly brief from the
  boss" in 1.5 captures the useful 10% of this idea without a new NPC.
- **Per-desk equipment upgrades (faster Macs):** too granular, fights the office-upgrade and
  office-tier rewards for the same slot, and "+8% speed on desk 3" is invisible feel. Roll
  the speed fantasy into office tiers (2.5) and staff levelling (2.2) instead.
- **Staff personal events (weddings/sick days):** good flavour but mechanically it is just
  "a staffer is randomly unavailable," which the burnout/quit system already delivers with
  more player agency. Keep weddings as *flavour bubbles*, not a mechanic.
- **Emergency weekend work (overtime pay vs burnout):** the night shift already IS this. The
  Friday CRISIS MODE (1.12) covers the "spend money/burnout to escape a hole" beat better.

---

## 3. ECONOMY BALANCE PASS

The headline, stated plainly: **the economy does not pinch, it gushes.** The systems are
built for anxiety; the *numbers* defeat them.

### 3.1 The numbers (from briefs.json + state.js + staff.json)
- 70 briefs. Avg fee ₹2,57,557. By difficulty: d1 ~₹35k, d2 ~₹1.41L, d3 ~₹1.88L, d4 ~₹4.66L,
  d5 ~₹10.75L.
- Starting payroll: Palak ₹35k/mo + Arya ₹60k/mo = ₹95k/mo, Friday deducts /4 = **₹23,750/wk**.
- **One single diff-2 brief (₹1.41L) pays ~6 weeks of starting payroll. A diff-3 pays ~8.**
- Brief completion is fast: diff-2 takes a skill-3 staffer ~16s real; a 45s day fits 2-3 per
  staffer. Supply is gated by `workloadCap = staff×1.15` (so ~3 concurrent at 2 staff) and the
  spawn timer (every ~9.4s in wk1).
- Paper sim of a realistic, supply-constrained run (accept ~85%, ~56% land as paid
  approve/viral, hire +1 most weeks):
  | Wk | Staff | Net after payroll |
  |----|-------|-------------------|
  | 1  | 2     | ~+₹15.7L |
  | 3  | 4     | ~+₹35.0L |
  | 5  | 6     | ~+₹83.1L |
  | 8  | 9     | ~+₹1.62Cr |

  Even at the *throughput ceiling*, week 1 nets sixty-six times the payroll. There is no
  pinch point and no dead zone; it is monotonic runaway from minute one.

### 3.2 Where it snowballs out of control
- **Fees dwarf payroll by ~50-100x per brief.** This is the root cause. Everything else is
  noise on top of it.
- **Viral ×6 on already-huge fees:** a single viral diff-4 mints a ~₹28L invoice. Game over
  for tension. ×6 was tuned when fees were the DESIGN.md first-pass (₹50k-₹3L); current
  briefs.json went up to ₹15L and the multiplier never came down.
- **Night-Arya:** ×1.7 speed after 6PM stacked with ×1.4 on hard briefs = ×2.38; Arya alone
  clears 2-3 high-fee briefs a night while costing one salary. Not an exploit so much as a
  free profit engine once you learn it.
- **Nudge-clicking:** 30 clicks = 1 game-hour of output for ~₹0 burnout cost per click
  (0.35%); a player who clicks fast trivialises completion on cheap briefs. Minor vs the fee
  problem but it removes the time-pressure the whole design rests on.
- **Receivables haircut is too gentle / autopay too generous:** ignored invoices self-pay at
  full value after 2.5 days (per state.js INVOICE_AUTOPAY_DAYS, *no* haircut in code — the
  85% haircut from the interactions spec was never wired). So collection calls are optional;
  patience pays exactly as well as effort.

### 3.3 Where it (almost) pinches, and the dead zone
- The *only* near-pinch is the very first Friday if a new player ignores collections AND
  ships nothing AND has spent on a hire advance. Survive that and you never feel money again.
- **Dead zone:** weeks 4-8. By then cash is meaningless, so the shop, hires, growth, and
  Craanes entry fees (₹25k) are rounding errors. Late game has anxiety from *pace* but none
  from *money*, which wastes half the designed systems (receivables, payroll strikes,
  clawbacks, investor bailout all go inert).

### 3.4 Concrete knob changes (exact values)
Goal: a brief should pay roughly **0.3-0.6 of weekly payroll**, so you need several shipped
*and* collected per week to clear Friday, and one bad week genuinely threatens a strike.

1. **Cut fees ~5x at the source.** Rather than hand-edit 70 briefs, add a global multiplier
   read at accept:
   ```
   FEE_GLOBAL_MULT: 0.20      // new G.BAL knob, applied in briefs.accept: fee = round(def.fee*mult)
   ```
   Result: d2 ~₹28k, d3 ~₹37k, d4 ~₹93k, d5 ~₹2.15L. Now a diff-2 is ~1.2 weeks of starting
   payroll, a diff-3 ~1.6 — you need 2-3 *collected* briefs/week to be safe. Tune the single
   multiplier in playtest instead of 70 cells.
2. **Viral ×6 -> ×3.** `VIRAL_FEE_MULT: 3`. Still a screen-shaking jackpot, no longer a
   run-ender. (With 3.4.1 a viral d3 = ~₹110k, a great week, not infinite.)
3. **Escrow share down, verdict-remainder up.** `ESCROW_SHARE: 0.30 -> 0.18`. The idle tick
   should be a *trickle floor*, not a third of the fee handed over free of collection. More
   of the money must be *chased*, which is the entire receivables design.
4. **Receivables: wire the haircut, lengthen the clock.**
   `INVOICE_AUTOPAY_DAYS: 2.5 -> 3.5` and add `INVOICE_AUTOPAY_HAIRCUT: 0.80` (pay 80% if
   never called). Now ignoring collections costs 20% and usually misses a Friday. Calling is
   strictly better; laziness is survivable but lossy. (This is the spec's recommended hybrid,
   currently unbuilt.)
5. **Arya cap:** make the hard-brief and night bonuses *not* multiply with each other past a
   ceiling. `effectiveSpeed` for Arya: cap total multiplier at ×2.0 (currently ×2.38). Keeps
   her special without making her a money printer.
6. **Nudge costs more, gives less.** `NUDGE_BURNOUT: 0.35 -> 0.8` and
   `NUDGE_CLICKS_PER_HOUR: 30 -> 45`. Standing over shoulders should fray them, not be a free
   accelerator. Keeps the excuse-comedy, removes the exploit.
7. **Raise starting tension floor:** `START_MONEY: 100000 -> 80000` (about 3.4 starting
   payrolls) once fees are cut, so week 1 is a real scramble before the first collections
   land. (If this proves too mean in playtest, INTERN mode from 1.6 covers gentler players.)

### 3.5 Two-to-three new sink/faucet mechanics to keep mid/late game tense
Cutting fees fixes the faucet. The late game also needs *sinks* so banked money stays
meaningful, and *recurring costs* so every week has a bill.

- **SINK — Office rent + overheads (recurring faucet-drain).** A weekly fixed cost beyond
  payroll: `WEEKLY_OVERHEAD` that *scales with office tier and headcount* (rent, AC,
  software licences, that one Adobe bill). ~₹15k at shoebox, climbing with each tier in 2.5.
  This is the single best balance lever: it makes growth *cost* something ongoing, so hiring
  and moving are real decisions, not pure upside. Deduct alongside payroll on Friday.
- **SINK — Office moves (2.5) as the big-money drain.** ₹3L-₹25Cr [sic, ₹25L] across tiers
  gives late-game cash a destination and a goal, converting "money is meaningless" into
  "save for the highrise." Doubles as a reward, which is the ideal sink.
- **FAUCET-with-strings — Retainers (2.1)** smooth income *downward* (less than full fees) in
  exchange for certainty, so a player who over-retainers trades upside for a softer floor.
  This is a *self-balancing* faucet: it can never snowball because it pays below market.
- **Optional third — A tax / TDS skim at collection.** The interactions spec's excuse
  already jokes about TDS; make it real and small: collected invoices land at 90% ("TDS kaat
  liya"), a flavour-perfect 10% sink on the exact money you worked hardest for. Tiny, thematic,
  always-on drag on the faucet.

Net effect of 3.4 + 3.5: week 1 is a knife-edge scramble, weeks 2-5 are "ship-and-collect or
strike," weeks 6-8 the overhead + bigger payroll + season crunch keep you one bad week from a
strike even with a fat bank, and the office-move goal gives surplus cash a purpose.
"Anxious but rewarding, never hopeless" — the investor bailout and the 80% autopay floor are
the two safety nets that stop a spiral, exactly as the brief asks.

---

## 4. PRIORITY ORDER (build tiers)

Sized S/M/L. Reason = why this tier.

### NEXT SESSION (the run needs a frame and a working economy before anything else)
- **[S] Economy knob pass 3.4.1-3.4.7** — one afternoon of values + 4 wiring touches
  (fee mult, viral, escrow, autopay haircut, Arya cap, nudge, start money). *Nothing else
  matters until money pinches; every other system is balanced against these numbers.*
- **[S] Weekly overhead sink (3.5)** — one deduction in runPayroll. *Tiny, and it is half the
  late-game tension fix; ship it with the knob pass.*
- **[S] End-of-run grade + score formula (1.2 + 1.7)** — pure presentation on existing
  screens. *Cheapest item that makes a run feel like it had a verdict.*
- **[M] Meta-progression: Legacy save + RP perk shelf (1.1)** — new localStorage layer + a
  title-screen shop. *The single biggest "is this a real game" lever; gives every loss a
  point. Do it early so all later content can hang RP rewards off it.*
- **[S] Pause/settings menu with restart + volume (1.8)** — reuses the pause lock. *Basic
  table-stakes; players will rage without RESTART once the economy actually kills them.*

### SOON (onboarding, mid-run carrots, and the first two deepening mechanics)
- **[M] DAY ZERO tutorial (1.4)** — scripted gated beats. *With a real economy, confused
  week-1 deaths become unfair; teach drag, departments, and collect-don't-wait.*
- **[S] Weekly target / boss brief (1.5)** — pool of 12, reads existing stats. *Cheap
  medium-horizon carrot between Fridays.*
- **[M] Staff levelling + raise knock (2.2)** — extends shippedWeek to lifetime + a knock
  modal. *Makes cheap interns worth keeping and adds a recurring payroll-anxiety spike, which
  the new economy needs.*
- **[M] Retainers (2.1)** — per-client approvedCount + a Friday pay branch. *Self-balancing
  faucet and a stability reward; pairs with the new pinch.*
- **[S] Difficulty select (1.6)** — a multiplier table at init. *Needs the economy locked
  first; trivial once it is, and it makes the new harder economy approachable.*
- **[S] Local leaderboard (1.3)** — top-5 table off the score formula. *Small, and it gives
  the grade something to chase.*
- **[M] Audio bed + Friday/Monday stings (1.9)** — one loop + 2 variants. *Biggest
  game-feel-per-rupee upgrade; the office should have a pulse.*

### LATER (the showpieces and the polish — high value, higher cost)
- **[L] Office tiers / the MOVE (2.5)** — new backgrounds, desk arrays, perk flags. *The
  marquee late-game reward and the big money sink, but it is art-heavy (new bg assets) and
  touches office.js layout — do it once the loop underneath is proven.*
- **[L] Rival agency + pitch battles (2.3 + 2.4)** — a counter, a poach sweep, a new minigame
  modal. *The antagonist and the trailer moment; together they are a big content+UI lift, and
  they are most fun once retainers and clients-leaving already matter.*
- **[M] Seasonal events (2.6)** — a week-keyed modifier over the curve. *Lovely rhythm, but it
  only reads as variety once the base week-shape is solid and re-playable.*
- **[M] Fail-forward CRISIS MODE (1.12)** — a chaos-90% one-time offer. *Needs the economy
  mean enough that players actually reach 90% chaos; pointless while money gushes.*
- **[S/M] Juice pass: combo meter + floating numbers + ship pop (1.11)** — *pure polish;
  schedule whenever a session has slack, the combo meter first.*
- **[S] Accessibility: colourblind cues + UI scale (1.10)** — shape-coded urgency + a font
  variable. *Do before any public ship; small and the right thing to do.*

### One-line build philosophy
Fix the money first (next session), then give the run a reason to start again (meta + grade),
then teach it (tutorial) and feed it carrots (targets, retainers, levelling), and only then
build the showpieces (office moves, the rival, pitch battles) on top of a loop that finally
pinches. Ship the frame before the chandelier.
