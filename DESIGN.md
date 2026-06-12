# CravAche — Design Bible (v1 prototype)

A pixel-art browser tycoon about running an Indian ad agency. You are Client Servicing.
The chaos is the game. Laptop-only (min 1280×720), no mobile.

## Locked decisions
- **Layout:** full-stage office fills the screen. Chaos happens ON the floor (speech bubbles, ringing phones). Slim bottom dock opens overlays. No permanent side panels.
- **Art:** high-quality 16-bit pixel art. MUST NOT look AI-generated (see Art Direction).
- **Loop:** brief-juggling sim with a thin idle layer (money ticks while creatives work).
- **Run shape:** finite fiscal-year arc (4 quarters → "Craanes" award night). Prototype scope = Q1 only.
- **Stack:** vanilla JS + canvas + DOM overlays. No build step, no frameworks. Matches dont-get-cancelled / reneev-tower.
- **Tone:** Vir Das-adjacent agency comedy. Real pain, funny fine print. No em-dash-heavy AI copy.

## Core loop (one in-game day)
1. Briefs arrive as toasts (accept / decline −rep).
2. Drag accepted brief from dock tray onto a staffer's desk.
3. Progress bar fills (speed = skill vs difficulty). Money ticks +₹/s per working staffer.
4. On completion → VERDICT modal (slot machine): approve / "small changes" / scrapped / viral.
5. Interrupts fire: client calls, scope creep, burnout warnings.
6. Friday 6 PM: payroll deducted + weekly report card + one upgrade purchase moment.

## The anxiety systems
- **Deadline timers** float over desks. Overdue → auto-scrapped, −rep, +chaos.
- **Burnout bar** per staffer. Working raises it; idle/coffee lowers it. At 100% they QUIT taking their assigned briefs with them (briefs return to tray with 25% deadline remaining).
- **Payroll** every Friday: sum of salaries. Can't pay → strike 1/2/3. Three strikes = game over.
- **Chaos meter** 0–100: +missed deadlines, +ignored calls, +scope-creep refusals, slow decay when all briefs on-track. 100% = game over (office literally on fire frame).
- **Scope creep:** mid-brief popup "also a reel? same budget 🙏" — accept (+30% work, same pay) or refuse (client relationship −1; at 0 the client leaves forever).
- **6 PM call:** modal demands 10 in-game minutes of YOUR attention (screen dims except modal); ignore = relationship −1.
- **Fine print:** each brief has 1–2 fine-print lines (e.g. "CEO hates blue"). On submission, if staffer's trait conflicts and you didn't reassign, verdict odds shift toward scrapped. Fine print is readable in the brief card — punishes skimming, Papers-Please style.

## The reward systems
- Money ticks every second a staffer works (idle-game dopamine under the chaos).
- **Verdict odds (base):** approve 50% (+full fee), small changes 33% (+₹0, same deadline, 40% extra work), scrapped 7% (−6 rep), viral 10%→ tuned 6% (fee ×6, confetti, screen shake). Quality, fine-print compliance, and client mood shift odds.
- **Friday report card:** earned/spent, briefs shipped, quote of the week, burnout warnings, PAYROLL CLEARED ✔ stamp.
- **Quotes wall:** every survived absurd request gets framed on the office back wall. Click to read. This is the screenshot-bait layer.
- **Office growth:** money milestones unlock desks, plant, coffee machine (burnout −30% rate), neon sign (+rep gain). Growth is never erased.
- **Hire ladder:** 8-person pool, each with name, portrait, skill, salary, one trait (e.g. "fast but sloppy", "diva: +burnout when given FMCG").

## Prototype scope (v1 = Q1)
- One office tier (SHOEBOX), 2 starting staff, up to 5 desks.
- 3 in-game weeks. Day = 45 real seconds, Mon–Fri (weekends auto-skip). Run ≈ 12–15 min.
- Win screen at quarter end: "Q1 SURVIVED" + stats + teaser for full year.
- Game over screens: payroll ×3 / chaos 100%.
- Save not required for v1. Mute button required.

## Economy first-pass numbers (tune freely, keep ratios)
- Start: ₹2,00,000. Staff salaries ₹35k–₹80k/week. Brief fees ₹50k–₹3,00,000.
- Brief spawn: every 1.5 game-hours ±, rate scales up each week.
- Working staffer ticks +₹80–150/s display money (cosmetic share of fee escrow — total ticks ≈ 30% of fee, verdict pays the rest).
- Difficulty curve: week 1 gentle (2 concurrent briefs max), week 3 mean (5+, more fine print, more calls). Always one-and-a-half problems, never three.

## Content schemas (content/*.json)
- `clients.json`: [{id, name, industry, personality, patience(1-5), quotes[3+]}] — 12 clients.
- `briefs.json`: [{id, clientId, title, ask, finePrint[0-2], fee, deadlineDays(1-3), difficulty(1-5), extraTags[]}] — 45 briefs, escalating absurdity.
- `staff.json`: [{id, name, role(designer|editor|copy|allrounder), skill(1-5), salaryWeekly, trait, traitTag, portraitKey}] — 8 staff.
- `events.json`: [{id, type(call|scopecreep|office|burnoutwarn), text, options:[{label, effects:{money,rep,chaos,relationship,workload}}]}] — 25 events.
- All copy: Indian agency flavor, no real brand names (parody names: "Chaiyos", "Vistaara Bank", "GlowMaxx"), no em dashes, no "delve".

## Art direction — the anti-AI pipeline (art/)
Pixel art must read as hand-placed. The kill-list: mushy anti-aliased edges, 1000-color gradients,
inconsistent pixel density, melted faces, random light directions.

**Palette (fixed 30 colors max, warm Indian office):** deep navy wall #23304a, warm wood #7a4a21/#c98f4e,
sunset window #ff9a56→#d35d6e, floor khaki #3a3326/#473f2f, skin range 4 tones, accent teal #9fe8ff,
alert red #ff5c5c, money green #7ee08a, brass yellow #ffe066. Final palette file: art/palette.json.

**Pipeline per asset (mandatory):**
1. Generate at 1024px+ via Freepik (`images_generate`) with prompts specifying: "16-bit SNES pixel art,
   strict pixel grid, limited palette, flat shading, single top-left light source, no anti-aliasing".
2. Download the PNG, then enforce the grid: ffmpeg downscale `flags=area` to true sprite size
   (chars 32×48, desks 64×40, props ≤48px, office bg 320×180), palette-quantize to art/palette.png
   (`palettegen`/`paletteuse`), nearest-neighbor upscale ×4 only at render time (canvas imageSmoothing off).
3. VIEW the processed result (Read the image). If mushy/melted/off-palette → regenerate or hand-fix. Never ship unviewed art.
4. Background scene generated as one wide piece; desks/chars/props as separate sprites on transparency
   (use Freepik remove-background if needed, then re-quantize).

**Assets needed (15):** office_bg_shoebox, desk, monitor_on, char×6 (2 frames each ok as single sheet),
plant, coffee_machine, phone_prop, award_trophy, ui_frame_9slice, logo_cravache, fire_overlay.
Manifest: art/manifest.json {key:{file,w,h,frames}}.

**Type:** pixel font via Google Fonts "Silkscreen" (UI) + "VT323" (body). Never system sans.

## Engine architecture (js/)
- `main.js` boot + rAF loop (fixed timestep accumulator, 60fps render).
- `state.js` single mutable gameState + initial state factory.
- `time.js` game clock (day/week/quarter), schedules payroll/spawns.
- `data.js` loads content JSON + art manifest; every sprite has a colored-rect fallback so the game
  runs art-less (parallel build contract).
- `systems/` briefs.js, staff.js (burnout, quit), economy.js (tick, payroll), chaos.js,
  events.js (interrupts), verdict.js (odds + modal trigger).
- `render/` office.js (canvas scene: bg, desks, chars, timers, bubbles), hud.js (DOM top chips),
  dock.js (DOM bottom tray + drag-drop of brief cards onto canvas desk hitboxes), modals.js
  (verdict, call, report card, game over — DOM).
- Canvas 1280×720 logical, integer-scaled. `imageSmoothingEnabled=false` everywhere.
- Audio: tiny SFX via WebAudio oscillator (cha-ching, phone ring, alarm) — no assets needed v1.

## UI feel (anti-AI-default rules)
- No default blue buttons, no Tailwind look, no purple gradients, no rounded-2xl cards.
- UI chrome = chunky 9-slice pixel frames, hard shadows (2px offset, no blur), brass/navy palette.
- Motion: snappy 100–150ms steps (pixel games step, they don't ease). Screen shake on viral/fire.
- Every number change animates (count-up). Money tick visible. Juice > polish.

## File layout
```
cravache/
  index.html  css/style.css  js/...  content/*.json  art/*.png + manifest.json + palette.json
  DESIGN.md  README.md
```

## Definition of done (prototype)
Playable Q1 run start→win/lose in a real browser with zero console errors, all art on-palette and
viewed, drag-drop works, payroll/chaos/burnout/verdict all firing, screenshots verified by Playwright.
