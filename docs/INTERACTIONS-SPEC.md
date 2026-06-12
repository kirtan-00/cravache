# CravAche — Interactions Spec: Payment Collection + Active Micro-Interactions

Companion to DESIGN.md. Two parts: (1) full spec for the PAYMENT COLLECTION mechanic,
(2) eight more active micro-interactions, ranked, with the top 3 marked for build.

Timing baseline (from DESIGN.md): 1 game day = 45 real seconds, modeled as 9:00 AM to 6:00 PM,
so **1 game hour = 5 real seconds**. Friday 6 PM = payroll. Three missed payrolls = game over.

---

# PART 1 — PAYMENT COLLECTION ("Paisa Kab Aayega?")

## 1.1 Concept

Approval no longer pays. It mints an **invoice**. The fee's working-tick share (~30%) still
trickles in while the staffer works (unchanged), but the **verdict remainder (~70% of fee)**
lands in RECEIVABLES, not in the bank. To convert receivables into bank balance, the player
must make a **collection call**: hold the CALL button, sit through 1 or 2 client excuses,
hold again, and finally get transferred to accounts. Cha-ching.

This is the truest mechanic in the whole game. Indian agency money is not earned at approval.
It is earned at the seventeenth follow-up call.

Design intent:
- Money on the books is not money in the bank. The HUD now shows BOTH numbers.
- Collection is an **active move** that competes for the same hands that drag briefs and
  answer 6 PM calls. It is short (4 to 8 real seconds) but never free.
- Friday becomes a two-front war: ship work AND chase cheques before payroll hits.

## 1.2 Data model

```js
// state.js additions
gameState.receivables = [];        // array of Invoice, newest last
gameState.bank = 200000;           // spendable. Payroll/upgrades draw from THIS only.
gameState.receivableTotal = 0;     // derived sum, cached for HUD chip

// Invoice
{
  id: 'inv_017',
  briefId: 'b_chaiyos_03',
  clientId: 'chaiyos',
  amount: 105000,            // round(fee * 0.7), the verdict remainder. Viral: fee*6*0.7.
  issuedAt: {week:2, day:4, hour:14},   // game timestamp at verdict
  ageDays: 0,                // recomputed at day rollover (business days only)
  excusesTotal: 2,           // rolled at mint: see 1.4
  excusesHeard: 0,
  excusePool: ['exc_goa','exc_cheque_sign'],  // pre-rolled, no repeats within invoice
  status: 'fresh',           // fresh | callable | calling | excuse | transferring | paid | autopaid | settled | writeoff
  settlement: null,          // set if client left: {rate:0.5, expiresAt:{...}}
  holdMs: 0                  // current hold progress on the CALL button
}
```

```js
// content/excuses.json
[ { "id": "exc_goa", "text": "...", "tier": "any", "mood": "breezy" }, ... ]
```

UI: a **RECEIVABLES drawer** in the bottom dock (new dock tab, badge = count). Each invoice
is a card: client logo chip, ₹ amount, age in days (turns red at 2+), and one big CALL button.
HUD top bar gains a second money chip: `BANK ₹2,00,000 | STUCK ₹1,05,000` (STUCK pulses red
on Fridays).

## 1.3 The call loop (player-facing)

1. Player opens RECEIVABLES drawer, presses and **HOLDS** CALL on an invoice card.
2. **Dial hold: 1.2 s** real. Progress ring fills around the button. Release early = reset
   to zero (no penalty, just lost time). Phone-ring SFX via WebAudio.
3. **Ring: 0.8 s.** Then the client picks up and delivers an **excuse line** in a speech
   bubble on the card (pulled from excusePool). Button relabels to **"CALL AGAIN 😤"**.
4. Excuse stays on screen until the player holds again (reading is free, like brief toasts).
   Hold CALL AGAIN: **1.2 s** + 0.8 s ring → next excuse, or, if `excusesHeard == excusesTotal`:
5. **"Theek hai theek hai... transferring to accounts"** + 1.5 s of tinny hold music
   (oscillator rendition, two notes, intentionally awful) → **PAID stamp** slams on the card,
   cha-ching, count-up animation moves the amount from STUCK to BANK. Card ejects.

**Total active cost:** 1 excuse ≈ 5.5 s, 2 excuses ≈ 8.5 s. That is 12 to 19% of a 45 s day
spent NOT dragging briefs. That is the whole mechanic: collection eats the same seconds the
chaos needs.

One phone line. Only one collection call can be in progress at a time, and none while a
6 PM call modal is up (see edge cases).

## 1.4 Timing and tuning numbers

| Knob | Value | Why |
|---|---|---|
| Invoice mint | instantly at APPROVE/VIRAL verdict | the slot machine still feels like a win |
| `fresh → callable` | 1 game hour (5 s real) | "accounts is processing", stops same-second double-dopamine |
| After 5 PM mint | callable next business day 10 AM | "accounts has left for the day" + Friday bite |
| Excuse count roll | wk1 local: 1. wk2 Gujarat: 1 (70%) or 2. wk3+ Indian/Dubai: 2 mostly. wk8 global: 1 but see kicker | bigger clients, longer chase; global pay clean but slow autopay |
| Dial hold | 1.2 s | long enough to feel committed, short enough to retry |
| Ring | 0.8 s | comedy beat before the excuse |
| Transfer + hold music | 1.5 s | the reward pause; cha-ching hits harder |
| Patience modifier | patience 4-5 clients: −1 excuse (min 1). patience 1-2: +1 (max 3) | reuses clients.json patience |
| Small-changes verdict | NO invoice (₹0 by design) | unchanged from DESIGN.md |
| Receivables drawer cap | 6 open invoices | overflow rule below, prevents hoarding |
| Drawer overflow (7th) | oldest invoice instantly autopays at 70% with toast "client 'adjusted' the bill" | soft pressure to keep calling |

Anti-degenerate guard: you cannot start a collection call in the last 30 game minutes
(2.5 s real) before Friday 6 PM payroll. Button grays out: "accounts ka chhutti time".
Money must be IN the bank when the bell rings; no buzzer-beater abuse.

## 1.5 Auto-pay fallback — RECOMMENDED: late autopay WITH a haircut (hybrid)

Three options considered:

- **A. No autopay, write-off after N days.** Purest pressure, but stacks with payroll strikes
  into unrecoverable death spirals. A player drowning in week 3 loses money for being busy,
  which reads as unfair, not funny.
- **B. Full autopay, just late.** Removes the reason to ever call once the bank has a buffer.
  The mechanic evaporates mid-game.
- **C. RECOMMENDED — Late autopay with a haircut.** If an invoice survives **3 business days**
  uncalled, it autopays at **85%** with the toast:
  *"Chaiyos paid ₹89,250 of ₹1,05,000. 'Quality adjustment.' They did not elaborate."*
  At **5 business days** (only possible if minted late in a run), the haircut is 70%.

Why C wins: calling is always strictly better (+15% money, days sooner, before Friday), but
ignoring collections is survivable and generates its own jokes. Losses sting, never spiral.
The 3-day delay is the real killer anyway: an invoice minted Wednesday autopays NEXT Monday,
which means it misses Friday payroll entirely. Lazy players don't lose 15%; they lose Fridays.

## 1.6 Tension with payroll strikes (the point of all this)

- Payroll deducts from **BANK only**. ₹4,00,000 stuck in receivables with ₹30,000 in bank on
  Friday = strike. The Friday report card prints it in your face:
  `PAYROLL FAILED ✗ — bank ₹30,000, needed ₹70,000. STUCK IN RECEIVABLES: ₹4,00,000. Make. The. Calls.`
- **Friday 9 AM warning toast:** "Payroll ₹70,000 due 6 PM. Bank ₹42,000. Stuck ₹1,80,000."
  This converts Friday afternoon into a collections sprint layered ON TOP of brief juggling
  and the possible 6 PM client call. Friday is intentionally the worst day. That is correct.
- Working-tick money (the idle layer) still flows to bank directly, so the idle floor keeps
  small payrolls survivable in week 1 before the player has internalized collections.
- Strike already on the board? Excuse lines get meaner (pull from a `desperate` mood pool)
  and the CALL button label changes to "CALL (beg)". Pure flavor, zero mechanics change.

## 1.7 Edge cases

1. **Client leaves forever (relationship 0 via scope-creep refusals) with open invoices.**
   Each open invoice flips to `settlement`: amount drops to **50%**, excusesTotal forced to 1,
   card turns grey with a stamp "FINAL & FULL SETTLEMENT" and a 1-business-day expiry timer.
   Call within the day → collect 50%. Miss it → `writeoff`, amount gone, +4 chaos, and the
   quotes wall gets a framed entry: "Payment? What payment? Who are you?" Never a write-off
   without the player having had one clear chance to act.
2. **Invoice activity during the 6 PM call modal.** One phone line. The receivables drawer
   is locked while the modal is up (CALL buttons disabled, tooltip: "line busy, obviously").
   If a collection call is mid-excuse when 6 PM fires, it drops with a "call waiting" blip,
   but `excusesHeard` progress is KEPT. The player resumes where they left off. Never punish
   someone for being interrupted by the game's own interruption.
3. **Verdict modal vs drawer.** Verdict, report card, and game-over modals also lock the
   drawer. Mid-hold when any modal fires: holdMs resets, excusesHeard kept.
4. **Game over / quarter end with open receivables.** Win screen lists
   "₹X you never collected" as a stat line (and needles you about it). On payroll game-over,
   the death screen shows stuck total: "You died rich on paper." Chef's-kiss screenshot bait.
5. **Friday-evening mint.** Invoice minted after 5 PM Friday is callable Monday 10 AM
   (weekends auto-skip). The 3-day autopay clock counts business days only.
6. **Viral verdict.** Invoice amount = fee × 6 × 0.7. Excuses +1 (max 3): the client is
   suddenly very busy "leveraging the moment". Big money chases longer. Feels right.
7. **Multiple invoices, same client.** Separate cards, separate calls. (v2 idea, not v1:
   batch-call with +1 excuse to collect all. Cut for scope.)
8. **Brief mid-drag while holding CALL.** Impossible by construction: one pointer. The drawer
   closes if a brief toast is grabbed. Natural exclusivity, no special code.
9. **Burnout quit / scrapped briefs.** No invoice ever existed (only approve/viral mint).
   Nothing to handle.

## 1.8 Excuse lines (content/excuses.json) — 18 launch lines

Censoring style: `f***` permitted, used sparingly so it lands. No em dashes. Mood tags map
loosely to client personality for selection; `any` fits everyone.

1. "Accounts wale Goa gaye hain. Monday pakka. Which Monday? A Monday."
2. "Cheque is ready, sir just has to sign it. Sir is in a meeting. Sir is always in a meeting."
3. "GST portal is down again. This is between you and the government now."
4. "Finance head's daughter's wedding this week. Payments resume after the honeymoon."
5. "We follow a 90-day payment cycle. It started yesterday. Welcome aboard!"
6. "Invoice mila hi nahi. Send again? And PDF nahi chalega, JPG bhejo na."
7. "Boss felt the logo was 2% smaller in the final file, so we are releasing 98% payment."
8. "Cash flow is tight, festival season hai. You understand na, we are like family."
9. "Payment happens from Head Office. Head Office is my cousin Pintu. Pintu is at a wedding."
10. "Our CA said paying vendors before quarter-end looks bad in the audit. His exact words."
11. "Aaj ka UPI limit ho gaya. Try tomorrow? Or aap QR bhejo, we'll see."
12. "Honestly the reel didn't go viral, so philosophically, did the work even happen?"
13. "The f***ing bank merged with another f***ing bank and all our NEFTs are frozen. Not our fault."
14. "Madam who does the payments is on leave. Only she knows the password. We respect her privacy."
15. "New policy: vendor onboarding form first. Fourteen pages. Notarized. Both sides."
16. "Sir it's a long weekend." (It is Tuesday.)
17. "TDS kaat ke bachta hi kya hai, itni si amount ke liye itna follow-up?"
18. "We'll adjust it in the next project. There is always a next project, na? Na?"

Transfer line (always, before PAID): *"Theek hai theek hai, transferring you to accounts...
please hold."* → 1.5 s of terrible hold music → cha-ching.

`desperate` mood variants (active when player has 1+ payroll strikes), 3 lines:
- "Beta, hum khud client se paise ka wait kar rahe hain. Chain of pain."
- "You're calling AGAIN? Fine, f*** it, partial payment chalega?" (still pays full, he's bluffing)
- "My astrologer said no transactions till Thursday. Take it up with Saturn."

## 1.9 Systems wiring (engine notes)

- `systems/receivables.js`: mint on verdict (hook in verdict.js resolve), day-rollover aging,
  autopay sweep at 10 AM daily, settlement expiry, drawer-cap overflow.
- `render/dock.js`: new RECEIVABLES tab + card list + hold-button component (reuse the 6 PM
  hold-to-survive ring if one exists; same interaction verb on purpose).
- `time.js`: business-day arithmetic helper (`addBusinessDays`), 5 PM cutoff flag.
- HUD: second money chip + Friday pulse. Report card: add stuck-total line + failed-payroll
  receivables callout.
- SFX: ring (square wave bursts), hold music (two detuned triangle notes), cha-ching exists.

---

# PART 2 — EIGHT MORE ACTIVE MICRO-INTERACTIONS

Same design law as collections: the player must DO something physical and timed. No "OK" buttons.
Scores: Fun (1-5) × Simplicity (1-5, where 5 = trivially buildable on existing systems) = Rank.

### 1. final_final_v3 file picker ⭐ TOP 3 — Fun 5 × Simplicity 5 = 25
- **Mechanic:** On submitting finished work, a 4-second file dialog pops with 5 filenames:
  `final_v2.mp4`, `final_FINAL.mp4`, `final_final_v3 (1).mp4`, `final_approved_OLD.mp4`,
  `WhatsApp Video 2026-06-13.mp4`. Click the correct one (rule shown in brief fine print or
  deducible: highest version + newest timestamp). Timeout picks randomly.
- **Cost/Reward:** Wrong file = "you sent the old version", verdict odds shift hard toward
  scrapped. Right file = nothing, which is exactly how it feels in real life.
- **Why funny-true:** Every Indian agency has shipped final_approved_OLD.mp4 to a client at
  11:58 PM. Every. Single. One.

### 2. WhatsApp ping storm ⭐ TOP 3 — Fun 5 × Simplicity 4 = 20
- **Mechanic:** A phone on the desk buzzes; message bubbles stack up the screen edge
  (Good Morning 🌸 forwards, "any update?", a 43-message family group spillover). Flick each
  bubble away (short drag). Buried 1-in-6 is a REAL message (a brief, a scope creep, a payment
  promise) that you must TAP, not flick. Stack reaching 10 = +6 chaos and phone "explodes".
- **Cost/Reward:** ~5 s of flicking; catching the real one early = its timer starts fresher.
  Flicking away the real message = it returns later, angrier, with a shorter timer.
- **Why funny-true:** 47 unread, one matters, and it is from the client's "other number".

### 3. Chai delivery rush ⭐ TOP 3 — Fun 4 × Simplicity 5 = 20
- **Mechanic:** Chaiwala appears at the door 2-3×/day with a tray of 3 cutting chais. Drag
  cups onto staffers within 8 s; after that, "chai thanda ho gaya" and the tray leaves.
- **Cost/Reward:** Each delivered cup −15 burnout for that staffer. Mis-drag onto a desk
  with a laptop = 1-in-10 spill gag (+2 chaos, staffer bubble: "MERA MACBOOK").
- **Why funny-true:** Chai is the actual HR department of every Indian office. Reuses the
  existing brief drag-drop system verbatim, hence the simplicity 5.

### 4. "Client is typing..." breath hold — Fun 4 × Simplicity 4 = 16
- **Mechanic:** After work is submitted, before the verdict slot machine spins, a chat header
  shows "client is typing..." for 3-6 s. Hold the BREATHE button the whole time. Release early
  and chaos ticks +2/s for the remainder; holding through it grants a tiny verdict luck nudge.
- **Cost/Reward:** Your hands are hostage during the scariest seconds; cheap mechanically,
  brutal psychologically.
- **Why funny-true:** Nothing in advertising is more violent than a typing indicator that
  stops, then starts again.

### 5. Wifi router reset — Fun 3 × Simplicity 5 = 15
- **Mechanic:** Random event: wifi drops, ALL desk progress bars freeze, a router on top of
  the office cupboard blinks red. Click it and HOLD 2 s to reset (same hold verb as CALL).
- **Cost/Reward:** Every second un-reset is paused production and creeping deadlines. After
  reset, staffers get a 5 s "it's back!!" +10% speed gratitude burst.
- **Why funny-true:** The router placed somewhere only the tallest employee can reach is
  load-bearing Indian-office canon.

### 6. Mood-read before send — Fun 4 × Simplicity 3 = 12
- **Mechanic:** Before submitting work, optionally hold STALK on the client's chat avatar for
  1.5 s to peek their live status: "😤 stuck in traffic", "🏏 match chal raha hai", "🟢 just
  got funding!". Mood shifts verdict odds ±10%; you may delay submission (deadline keeps
  burning) to wait for a mood change.
- **Cost/Reward:** Information vs time. Stalking is free; acting on it costs deadline.
- **Why funny-true:** Checking the client's WhatsApp last-seen before sending the invoice is
  a genuine professional skill nobody puts on LinkedIn.

### 7. Mid-drag "quick call" hijack — Fun 5 × Simplicity 2 = 10
- **Mechanic:** While dragging a brief, a call toast slides in and SNAGS the cursor (drag
  resistance + ringtone). Shake the mouse (3 direction reversals in 1 s) to break free, or
  surrender the drag (brief returns to tray) and take the call.
- **Cost/Reward:** Breaking free = +1 chaos (ignored call); answering = lose the drag but
  keep the relationship. Pure no-good-options comedy.
- **Why funny-true:** "Got 2 minutes? Quick call?" arrives exclusively when both your hands
  are full. Fiddly pointer math is why simplicity is 2; build later, it will be a trailer moment.

### 8. Projector HDMI scramble — Fun 3 × Simplicity 3 = 9
- **Mechanic:** Before a big-tier pitch (wk3+ clients), a NO SIGNAL screen: mash-click the
  flickering HDMI plug 8 times in 3 s (plug jitters to new positions) to get the deck up.
- **Cost/Reward:** Success = pitch proceeds, small rep bonus. Fail = pitch starts on a
  WhatsApp screen share, −3 rep, client quote framed on the wall.
- **Why funny-true:** No deck has ever opened on the first cable. Scoped to rare pitch
  moments so the mash doesn't wear thin.

## Ranking summary

| # | Interaction | Fun | Simplicity | Score |
|---|---|---|---|---|
| 1 | final_final_v3 file picker ⭐ | 5 | 5 | 25 |
| 2 | WhatsApp ping storm ⭐ | 5 | 4 | 20 |
| 3 | Chai delivery rush ⭐ | 4 | 5 | 20 |
| 4 | "Client is typing..." hold | 4 | 4 | 16 |
| 5 | Wifi router reset | 3 | 5 | 15 |
| 6 | Mood-read before send | 4 | 3 | 12 |
| 7 | Mid-drag call hijack | 5 | 2 | 10 |
| 8 | HDMI scramble | 3 | 3 | 9 |

**Build next (top 3):** final_final_v3 picker, WhatsApp ping storm, chai delivery rush.
All three reuse existing systems (modal, toast stack, drag-drop), all three are
screenshot-bait, and none adds a new input verb beyond what collections already teaches.

## Interaction budget rule (so this never becomes a QTE hell)

Max **2 micro-interactions per game day** in week 1, ramping to 4 by week 3+ (collections
calls excluded since they are player-initiated). Never spawn one while a modal is open or
during the 6 PM call window. The DESIGN.md law stands: one-and-a-half problems, never three.
