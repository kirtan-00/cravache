# CravAche — Visual Overhaul Spec (Top-Down Office Re-camera + UI Cohesion)

**Date:** 2026-06-13
**Status:** SPEC — research + design only. No code or art changed in this pass.
**Trigger:** Owner verdict on current build — *"the whole game UI looks so odd"*, *"this UI looks like school."* He sent a Freepik/Vecteezy-style high-angle top-down pixel office as the target and asked for: this camera angle + that graphic quality; people and desks that **fit** the room (proportions); a *"better tech vibe"*; a **balcony**; the office fits one screen (1280×720, no scroll).

This document is the build contract. A build agent should be able to execute Sections A–D without re-asking. Logical coordinate space throughout is the fixed **1280×720** canvas (same as today; `main.js` letterboxes it).

---

## 0. What's locked / must not change

- **The 17 staff sprites are APPROVED and must NOT be regenerated.** They are `staff_s_*.png`, native **32×48, 2-frame** (idle/typing), front-facing. Everything in Section B bends the *desks and geometry* around these sprites — never the other way.
- Fonts stay **Silkscreen** (labels/headers) + **VT323** (body/numbers). Hard 2–3px drop shadows, no rounded corners, no default browser blue. (`css/style.css` header comment is the palette contract — keep it.)
- Fixed 1280×720 single screen. No camera scroll, no zoom.
- Fallback-rect contract in `office.js drawSprite()` stays (art-or-rect parallel build). New art keys must register in `art/manifest.json` with native size + frame count.

---

## 1. AUDIT — the top sins (harshest read)

Screenshots captured headless at 1366×768 into `_shots/audit2/` (morning/sunset/night, full-staffed, brief toast, 3-card tray, hire modal, friday reel+report, client dossier, pause menu, verdict, toast pileup). Verdict, blunt:

1. **It is a flat front-elevation classroom, exactly as he said.** The current bg (`office_bg_shoebox`, native 640×360 upscaled 2× to 1280×720 — so every bg pixel is a fat 2×2 block) is a side-on wall with a thin cream band up top and two rows of identical wooden desks marching straight at the camera on a wood floor. Empty, it is visually indistinguishable from rows of school benches. There is zero "we are looking *down into* a room" — the desks have no visible tops, no monitors-from-behind, no chairs. This is the whole problem in one sentence.

2. **Three different pixel densities fighting on one screen.** Bg art = 2×2 fat pixels (640→1280). Desk sprite (`desk.png` 64×40 native, drawn at 104×64 ≈ 1.6×). Staff sprites 32×48 drawn at 48×72 (1.5×). Procedural props (chai 72×78, printer 60×58, cooler, TV) drawn ~1:1 with crisp 1px detail. The eye reads four "resolutions" at once — that incoherence is most of why it feels amateur, independent of the camera.

3. **Staff sit BEHIND desks like a passport-photo lineup.** Front-facing 32×48 sprites are pasted above each desk (`d.y - DESK_H/2 - CHAR_H + 16`), so you see a floating head-and-shoulders mugshot over a plank. They don't read as "seated at a workstation," they read as ID cards on shelves. Proportion mismatch the owner flagged lives here.

4. **The cream wall band is a junk drawer.** Chai station, printer, TV, "WALL OF JUST ONE SMALL THING" frames, the HUSTLE poster, neon, award shelf, and a 3-pane window are all crammed into the top ~190px with no grid, no breathing room, inconsistent label chips. Reads as clutter, not a wall.

5. **A bicycle and bunting in the bottom-right corner do nothing** but eat the prime "floor" real estate and add to the fairground-tent feeling. Dead zone, wrong vibe (zero "tech").

6. **Floating wall-printer and phantom hotspots.** The printer floats mid-wall with no surface under it; the "window" click hotspot is a separate invisible rectangle from the drawn window; nameplates/stars/burnout bars stack *under* desks into the row below, colliding with the next desk's sprite in the full-staffed shot. Label soup.

7. **HUD chips are inconsistent and the toast column collides with them.** Top-left CASH/REP/CHAOS chips are navy pill #1; top-right clock chip + ⏸ + "SND ON" are navy pill #2 but different internal rhythm; toasts spawn at `right:12px; top:64px` and stack DOWN the right edge straight into the clock chip and each other (4-deep pileup overlaps the week label). No max, no collapse, no consistent corner.

8. **Modals, dock cards, and tray are three different visual languages.** Modals = brass-bordered navy with 4px border. Brief cards = cream paper with ink border. Dock = near-black bar with vertical "BRIEF TRAY" label and three differently-coloured buttons (one green-blinking, two khaki). The friday IG reel is a literal phone mock floating on the room. None of them share border weight, corner, or shadow with the in-canvas labels. The whole thing looks assembled from three asset packs.

Secondary notes: night tint is a flat 52% navy wash over everything (fine, keep); sunset only changes the tiny window sky, the room stays bright (reads as a bug); "estd. monday" / "mandatory inspiration" gags are good and must survive the redraw.

---

## 2. RESEARCH — what to steal (refs in `art/_raw/refs2/`)

| File | Game | Steal this |
|---|---|---|
| `ref_startup_panic_3.jpg` | Startup Panic (single room) | **The exact target.** ONE room fills the screen: two visible walls (back + left) at ~25% height, big floor 75%, desk at 3/4-from-above with monitor + keyboard + mouse + chair all readable, shelves/whiteboard/boxes/rug against walls, character stands ON the floor with an emoji bubble, clean white dialogue panel docked at bottom. This is the owner's reference in a shipped game. Match its camera and prop logic. |
| `ref_startup_panic_1.jpg` | Startup Panic | Desk *clusters* read as a department: 3–4 desks share one rug/zone, monitors face inward, chairs (red/green/blue) tuck on the near edge. Soft floor drop-shadows under every object glue them to the ground. Copy the chair-colour-per-seat idea + floor shadows. |
| `ref_startup_panic_2.jpg` | Startup Panic | Multi-zone floor: lounge/beanbags, plants, pool table, kitchen as distinct floor textures. Our balcony + chill zone should read like one of these sub-zones. |
| `ref_mad_games_tycoon_1.jpg` / `_2.jpg` | Mad Games Tycoon 2 | High top-down dept rooms separated by walls; floating per-person status icons sit DIRECTLY over each head, never under. Boxes/server-corner/whiteboards sell "studio." Take the status-icon-over-head placement and the cardboard-box/server clutter for tech vibe. |
| `ref_two_point_1.jpg` | Two Point Campus | Readability discipline: even at a steep top-down angle, every object has a hard silhouette and a cast shadow; colours stay saturated but each zone has a dominant hue so the eye parses regions instantly. Apply per-department floor tint. |
| `ref_dave_diver_ui_1.jpg` | Dave the Diver | Painterly chunky-pixel diorama depth with a limited palette — proof that "chunky pixels + hard outlines + few colours" reads as *premium*, not cheap. Our bg should be authored at native 1280×720 (not 640 upscaled) for this crispness. |
| `ref_dave_diver_ui_2.jpg` | Dave the Diver | **HUD chrome to copy:** top-left pill stat (coin + number), top-right date/clock pill + a single round day/night dial, a bottom row of evenly-spaced labelled icon buttons with consistent borders. Hand-crafted, cohesive, breathing room. This is the fix for sins #7/#8. |
| `ref_coffee_talk_1.jpg` | Coffee Talk | Warm, low-contrast painterly pixel + a single docked bottom panel for all interaction. Confidence to let the room be the hero and keep chrome minimal + bottom-anchored. |

Net: **Startup Panic is the build target for the room; Dave the Diver is the build target for the chrome.** Both prove the owner's ask is shippable in this exact pixel language.

---

## A. CAMERA & ROOM (new composition for 1280×720)

New camera: **high-angle top-down, ~60° pitch** (the Startup Panic / owner-ref angle). Two walls visible (back + left short return), floor dominates. All rectangles below are logical 1280×720 coords; origin top-left.

### A1. Wall band + window
- **Back wall band:** `y 0 → 150` (≈21% — the owner's "~25%"). Tan/cream, two tones: upper `#e8dcc0`, lower (skirting/shadow before floor meets) `#c9b896`, with a 6px darker seam at y≈146 where wall meets floor.
- **Left return wall:** a short angled sliver, `x 0 → 70`, `y 0 → 150`, 1 shade darker (`#d8ccae`) to imply the corner. Optional; keep cheap.
- **3-pane studio window:** rect `x 150 → 560, y 28 → 138` (w410 × h110). Wooden frame `#b8814a` / shadow `#7a4a21` (reuse existing `WIN_FRAME` constants — this is just a relocation + reshape). The live `drawWindowSky()` machinery (clouds, kite, bird, hour-tint, golden/sunset bands) **moves wholesale** to this new rect. **Fix sin "sunset doesn't tint the room":** also multiply a warm overlay across the whole floor after 17:00 (see A4).
- **Tech-vibe wall props (replace the junk drawer), evenly gridded on the back wall:**
  - Whiteboard (sprawl of kanban sticky notes + a chart): `x 600 → 760, y 30 → 130`.
  - Floating shelf with colored binders (the ref's binder rows): `x 790 → 1010, y 36 → 96`.
  - Framed "viral reel" screenshots / award certs row: `x 1030 → 1240, y 34 → 120`.
  - HUSTLE poster (keep the gag): `x 80 → 150` region on the left wall, smaller.
  - Quotes wall ("WALL OF JUST ONE SMALL THING"): demote to a single 4-frame strip tucked at `x 600 → 760` under the whiteboard OR fold into the right-wall frames — do NOT give it the whole top row anymore.

### A2. Balcony strip (NEW — the chill zone, future mechanic hook)
- **Location:** full-height vertical strip on the **right edge**, `x 1150 → 1280, y 150 → 600`. Separated from the office floor by a glass railing / low wall at x≈1150.
- **Contents:** railing (horizontal bars, `#8a94a0` over a 4px ledge), 2 potted plants (reuse `plant` key), a beanbag or two low stools, a small bistro table, and **a city skyline view** behind the railing (Ahmedabad rooftops at the same hour-tint as the window — reuse a slimmed `drawWindowSky` palette so it day/sunsets in sync). Soft warm light pool on the balcony floor.
- **Reads as:** the only no-desk zone. Wander/cooler targets (Section A4) can route here later as a "took a breather" state — leave a `G.render.balconyPoint()` export stub mirroring `coolerPoint()` so the future mechanic has an anchor. No mechanic in this pass; visual + anchor only.

### A3. Floor
- **Carpet, not wood** (kills the school-bench-on-floorboards read). Blue-grey office carpet base `#5a6478`, with a subtle 2-tone large-tile checker (`#5a6478` / `#545e72`, 80px tiles) and a faint paper-scrap fleck texture (a handful of `#cfd6e0` 2px specks, baked into the bg art, not per-frame).
- **Light pools:** two soft pale rectangles cast from the window onto the floor, `#6a7488` at ~12% lighter, skewed as parallelograms (the ref's window-light look). Bake into bg.
- **Drop shadows:** every desk, prop, and standing character gets a soft dark ellipse/rect shadow on the carpet (`rgba(0,0,0,0.22)`), drawn in `drawDesks`/`drawProps` before the object. This single change does the most to make objects "sit in" the room.

### A4. Prop relocations (exact zones)
| Prop | New home | Rect (1280×720) |
|---|---|---|
| Chai station | left wall, on a counter | `x 78 → 150, y 150 → 230` (counter surface at floor-meets-wall) |
| Printer | **on the binder shelf / a low cabinet**, never floating | sits at `x 1020 → 1080, y 150 → 210` on a drawn cabinet |
| Office TV (upgrade) | back wall, centered high | `x 560 → 680, y 36 → 116` |
| Water cooler | floor, between content cluster and balcony | `x 1040 → 1090, y 360 → 440`; `coolerPoint` updates |
| HUSTLE poster | left wall | `x 80 → 150, y 30 → 90` |
| Quotes wall | folded under whiteboard (see A1) | single strip |
| Award trophies | floating shelf, right of binders | `x 1030 → 1140, y 100 → 124` |
| Neon sign | above the window on back wall | centered `cx 355, cy 22` (over the new window) |
| Coffee machine (upgrade) | left wall counter, beside chai | `x 78 → 138, y 230 → 300` |
| Plants | balcony + one floor corner | balcony strip + `x 120 → 168, y 470 → 540` |
| Bicycle + bunting | **DELETE** | — |
| Cardboard boxes + bin (NEW tech-startup clutter) | bottom-left floor corner | `x 80 → 220, y 560 → 650` |
| Server-ish corner (NEW, optional tech vibe) | behind production cluster | small rack at `x 1080 → 1140, y 470 → 560` |

---

## B. DESKS & PEOPLE (the proportion fix)

### B1. New desk sprite (`desk_topdown`)
- **Native size:** 96×72 px, 1 frame. Drawn 1:1 (so it matches a native-1280 bg's pixel density — kills sin #2). Magenta colorkey (`#FF00FF`) background per the pipeline.
- **Angle:** 3/4-from-above (the ref). You see: the **desk top** (wood `#a9743f` top face + `#7a4a21` front lip), a **monitor seen from behind** (dark back `#2a2f3a` + thin teal `#9fe8ff` edge-glow when on), a keyboard slab, a mouse, a coffee cup, a cable. Two front legs visible below the lip.
- **Chair: SEPARATE sprite** `chair_topdown` (40×40, 1 frame), drawn on the **near (camera) side** of the desk, partially tucked under it. Author **3 colorways** (red/green/blue, reused round-robin per seat like the ref) by hue-shifting one base — store as `chair_r`, `chair_g`, `chair_b` OR one sprite + canvas tint.

### B2. How the existing 32×48 staff sprite seats (THE fix for sins #3, #1)
- The staff sprite is front-facing — perfect for "seated facing the camera **behind** the monitor." Draw order per desk, back-to-front:
  1. floor shadow ellipse (under chair),
  2. `desk_topdown` (the desk top + monitor-back occupy the lower 2/3),
  3. the staff sprite drawn so the **monitor and desk lip overlap their lower body** — i.e. sprite anchored at `desk.y - 30`, only head+torso+hands visible above the desk top. Scale staff **1:1 (32×48)** now, not 1.5× — at the new density a 48px-tall torso reading above a 72px desk is correct human proportion (head ≈ desk-monitor height). This is the single change that makes people "fit."
  4. `chair_topdown` drawn LAST, in front, its back rising in front of the desk's near edge so the person reads as *tucked into* the chair at the desk. (Chair back covers the sprite's feet/legs, which we never want to see.)
- **Typing frame** (sprite frame 1) plays only while `st.briefId` set, same as today. Subtle 1px bob stays.
- **Away/home/night** states unchanged in logic; just new anchor math.

### B3. Label / bar placement in the new geometry
All per-staff overlays move ABOVE the head (Mad Games Tycoon discipline) so they never collide with the desk below:
- **Nameplate** (Silkscreen 8px on a dark chip): centered at `desk.y - 52` (just above the head).
- **Skill stars + badges:** one line under the nameplate, `desk.y - 44`.
- **Burnout bar** (60×5): `desk.y - 38`.
- **Assigned brief: deadline bar + title + progress bar:** floats higher, `desk.y - 76 → -58` (title, deadline %, work %). Keep the blink-when-late.
- Because clusters are spaced ≥ 110px vertically (see B4), these stacks never overlap the row above.

### B4. New DESKS coordinate table (17 slots, 4 dept clusters)
Carpet floor is `y 150 → 600`. Desks are drawn at 96×72; centers below. Two rows max per cluster, rows ≥ 150px apart vertically; clusters separated by floor gaps + a per-dept floor tint rug.

```
DESIGN (5)            EDIT BAY (5)          CONTENT (3)           PRODUCTION (4)
rug ~x60-360          rug ~x400-700         rug ~x740-980         rug ~x740-1140 (front)
{x:120, y:300}        {x:460, y:300}        {x:800, y:300}        {x:800, y:520}
{x:240, y:300}        {x:580, y:300}        {x:920, y:300}        {x:920, y:520}
{x:120, y:470}        {x:460, y:470}        {x:860, y:470}        {x:1040,y:520}
{x:240, y:470}        {x:580, y:470}                              {x:980, y:400}
{x:360, y:380}        {x:680, y:385}
```
- DESIGN: left third. EDIT: center third. CONTENT: upper-right (3 desks, tighter). PRODUCTION: front-right "studio strip" (the spotlight/REC/flash logic in `drawDesks` keeps working; just new coords). Production stays the week-3 taped-off zone — re-derive the dashed `OPENS WK 3` rect from these new slot bounds.
- **Cluster labels** (DESIGN / EDIT BAY / CONTENT / PRODUCTION) sit on each rug's back edge, not on the wall: `{designer x:180 y:250}`, `{editor x:520 y:250}`, `{content x:860 y:250}`, `{production x:920 y:470}`.
- **Hitboxes:** `deskHitbox` must be re-derived for 96×72 desks + chair (roughly `{x:cx-52, y:cy-70, w:104, h:150}`) and re-verified against drag-drop (Section D).

---

## C. UI CHROME RESTYLE (stop looking "odd")

One language everywhere: **navy `#16203a` fill, 3px `#0d1426` border, 2px hard black drop-shadow, 0 corner radius, inner top-highlight `rgba(159,232,255,.18)`.** That is the `.px-frame` recipe already in CSS — the fix is to make HUD chips, toasts, tray, dock, and modal *all* literally use it at the same border weight and the same internal padding rhythm (8px). Concrete changes:

- **HUD chips (`#hud`, `.chip`):** keep top-left CASH/REP/CHAOS as one merged 3-stat bar (Dave-the-Diver pill row) with even 8px internal gaps and ONE shared border, not three free-floating pills. Top-right: clock + week in one chip, then ⏸ and SND as two equal square icon-buttons matching chip height exactly. Label Silkscreen 9px teal, value VT323 24px. Lock chip height = 40px so the toast column can start cleanly below it.
- **Toasts (`#toasts`):** move to `right:14px; top:92px` (clear of the 40px HUD + margin). **Cap the column at 3 visible**; 4th+ collapses into a single "+N more" chip. Newest on top, older slide down, auto-expire bottom-up. Width 320, same border recipe, accent border-color by type (brass=offer, green=good, red=bad, teal=info). Kills sin #7 pileup.
- **Tray cards (`.brief-card`):** keep the cream-paper look (it's intentional "physical brief" contrast and it works) BUT unify border to 3px `#1a1410` + 2px black shadow to rhyme with chrome, and standardize width 218 / internal padding 8. Add the dept role-chip top-right consistently.
- **Dock (`#dock`):** height fixed 96px. Drop the vertical "BRIEF TRAY" rotated label (it's the most "odd" element) — replace with a small horizontal Silkscreen "TRAY" tab above the cards. Right-side buttons COLLECT/HIRE/GROWTH: equal width, equal border, Dave-the-Diver labelled-icon style (icon + 9px Silkscreen caption). COLLECT keeps the green has-money pulse but uses the shared border. Even 12px gaps.
- **Modals (`.modal`):** keep brass border for emphasis but drop to 3px to match chrome weight; keep navy fill, 0 radius, hard shadow. Kicker Silkscreen 10px teal / title Silkscreen 20px brass / body VT323 21px — already correct, just verify spacing rhythm = 8/12px. The friday **IG reel phone** stays a phone (good gag) but gets the same 3px border + black shadow frame so it reads as part of the set.
- **Typography sizes (lock these):** Silkscreen — labels 9px, captions 8px, headers 20px, big stat nameplate 8px. VT323 — body 21px, stat values 24px, bubbles 16px, tiny floor text 12px. No other sizes.
- **Spacing rhythm:** everything snaps to an 8px grid (pad 8, gap 8/12). This alone removes most of the "assembled from packs" feel.

---

## D. MIGRATION PLAN (ordered, for the build agent)

**Art to generate** (native size, 1-frame unless noted, magenta `#FF00FF` colorkey, then run the existing colorkey→PNG-alpha pipeline in `tools/`; register each in `art/manifest.json`):
1. `office_bg_topdown` — **native 1280×720** (NOT 640 — author at full res for crisp pixels per research). Back+left walls (A1), 3-pane window frame at new rect, carpet floor with baked tiles + paper flecks + light pools, balcony strip with railing + skyline + plants (A2), wall props grid (whiteboard/binders/frames/poster), left-wall counter for chai+coffee, cardboard-box corner, optional server rack. Bake EVERYTHING static here; only live things (sky, characters, desks, bars, upgrades) draw on top.
2. `desk_topdown` 96×72 (B1).
3. `chair_topdown` 40×40 ×3 colorways (or 1 + tint) (B1).
4. Re-cut chai/printer/cooler/TV props if their old framing fights the new angle (printer especially needs a top-down face).

**Code changes (file → section):**
- `js/render/office.js`
  - `DESKS` array → replace with B4 table (17 slots, new coords/depts).
  - `DESK_W/DESK_H` → 96/72; `CHAR_W/CHAR_H` → 32/48 (1:1); rewrite the staff-draw anchor math in `drawDesks` per B2 (shadow → desk → sprite-overlapped-by-monitor → chair-in-front).
  - `deskHitbox()` → re-derive for new size (B4); add chair to hitbox.
  - `CLUSTERS` → new label coords (B4); production tape rect re-derived from new production slots.
  - `WIN` / `WIN_MUL_X` / `WIN_MUL_Y` → new window rect (A1); `drawWindowSky` body unchanged, just new rect; ADD a floor warm-overlay branch for hour≥17 (A3/A4 sunset fix).
  - `HOTSPOTS` → new rects for chai/printer/window/board/tv (A4 table).
  - `COOLER` const + `coolerPoint()` → new floor spot (A4); add `balconyPoint()` stub export (A2).
  - `drawProps` order → add floor drop-shadows pass; delete bicycle/bunting; add box-corner + optional server.
  - `labelChip`/nameplate/bar y-offsets in `drawDesks` → above-head placement (B3).
  - If `office_bg_shoebox` art absent, procedural fallback (`drawBackground`) should be updated to at least a top-down-ish carpet so the fallback isn't a lie — lower priority.
- `css/style.css` — HUD `.chip`/`#hud` merge + height lock; `#toasts` reposition + 3-cap (cap logic in `dock.js infoToast`/toast manager, CSS for the "+N" chip); `#dock` height + drop `.dock-label` rotation + new TRAY tab; unify `.brief-card`/`.modal` border weights to 3px; lock type sizes.
- `js/render/dock.js` — toast column 3-visible cap + "+N more" collapse; remove rotated label; equalize dock buttons.
- `js/render/hud.js` — repaint merged stat bar / square icon buttons.
- `index.html` — adjust `#hud` markup if merging chips; remove rotated `.dock-label` text.

**Verify (click through, do not declare done until all green):**
- Drag a brief card onto every one of the 17 desks → drop highlight + assign works (hitboxes match new geometry).
- Night tint still darkens the new room; monitors glow; off-clock desks empty; "zzz home" placement sane.
- Sunset (dayT high) now warms the FLOOR, not just the window.
- Water-cooler walk: idle staff path to new `coolerPoint`, gossip, return — no walking through walls/balcony.
- Production taped-off zone (week<3) dashes the new front-right slots; `OPENS WK 3` label centered.
- Every label readable: nameplates/stars/burnout/deadline bars don't collide with the row below or the wall.
- Toast pileup: fire 5 toasts → only 3 + "+2 more"; none overlap the clock chip.
- All modals (verdict, hire, report, reel, dossier, pause, win/lose, craanes) render with unified border weight.
- Balcony reads as a chill zone and day/sunsets in sync with the window.

**Screenshot checklist (re-shoot into `_shots/audit3/` and eyeball vs `art/_raw/refs2/ref_startup_panic_3.jpg`):**
morning / sunset / night / full-staffed(10+) / brief-toast / 3-card-tray / hire-modal / friday-reel / friday-report / client-dossier / pause-menu / verdict / 5-toast-pileup / balcony-closeup.

---

## Appendix — files touched in THIS spec pass (no code/art changed)
- Screenshots: `_shots/audit2/*.png` (13)
- References: `art/_raw/refs2/*.jpg` (10)
- This spec: `docs/superpowers/specs/2026-06-13-visual-overhaul-spec.md`
