import sys, time
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8077/index.html"
OUT = "/Users/purohit/Desktop/claude/claude projects/cravache/_shots"
import os; os.makedirs(OUT, exist_ok=True)

errors = []

def shot(page, name):
    page.screenshot(path=f"{OUT}/{name}.png")
    print("shot:", name)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width":1366, "height":768})
    page.on("pageerror", lambda e: errors.append(f"PAGEERROR: {e}"))
    page.on("console", lambda m: errors.append(f"CONSOLE.{m.type}: {m.text}") if m.type in ("error",) else None)

    page.goto(BASE)
    page.evaluate("() => localStorage.clear()")
    page.reload()
    page.wait_for_timeout(800)

    # start a new game
    page.click("#btn-start")
    page.wait_for_timeout(500)

    # keep the verification deterministic: stop briefs/events/calls from
    # spawning their own (pausing) modals mid-run. We are testing the 5 features,
    # not the brief pipeline.
    page.evaluate("""() => {
      G.briefs.update = function(){};   // no spawns / no client-intro modals
      G.events.update = function(){};   // no scope creep / office events
      G.time.update = function(){};     // no 6PM call, no day rollover
    }""")

    # give money + force upgrades, buy tv/cooler via buyUpgrade, neon via modal
    page.evaluate("() => { G.state.money = 5000000; }")
    page.evaluate("() => { G.economy.buyUpgrade('tv'); }")
    page.evaluate("() => { G.economy.buyUpgrade('cooler'); }")
    # neon: buy then drive the naming modal
    page.evaluate("() => { G.economy.buyUpgrade('neon'); G.modals.showNeonSetup(); }")
    page.wait_for_timeout(200)
    inp = page.query_selector("#neon-input")
    if not inp:
        errors.append("NO neon input found")
    else:
        page.fill("#neon-input", "AGENCY DOOM")
        page.wait_for_timeout(150)
        # click LIGHT IT UP
        page.evaluate("""() => {
          const btns = document.querySelectorAll('#modal-root .px-btn');
          for(const b of btns){ if(/LIGHT IT UP/.test(b.textContent)){ b.click(); return; } }
        }""")
    page.wait_for_timeout(400)
    print("neonText =", page.evaluate("() => G.state.neonText"))
    print("upgrades =", page.evaluate("() => JSON.stringify(G.state.upgrades)"))

    # let TV cycle a bit and screenshot office (TV + neon + cooler)
    page.wait_for_timeout(1500)
    shot(page, "01_office_props")

    # cycle TV to a non-static channel for a cleaner shot, wait through scenes
    for i in range(4):
        page.evaluate("() => { G.state.tvChannel = (G.state.tvChannel+1)%4; }")
        page.wait_for_timeout(1200)
        shot(page, f"02_tv_ch{i}")

    # --- wander: force two idle staffers to the cooler ---
    # make staff idle + give them burnout so they're eligible
    page.evaluate("""() => {
      G.state.staff.forEach(st => { st.briefId = null; st.burnout = 50; });
    }""")
    n = page.evaluate("() => G.wander.gather(2)")
    print("gather returned:", n)
    page.wait_for_timeout(1100)  # mid-walk (WALK_DUR=2.5s)
    shot(page, "03_wander_walking")
    page.wait_for_timeout(2600)  # walk done (~2.5s) -> chatting
    modes = page.evaluate("() => G.state.staff.filter(s=>s.away).map(s=>s.away.mode)")
    print("away modes:", modes)
    shot(page, "04_wander_chatting")

    # --- assign-mid-trip cancels ---
    cancelled = page.evaluate("""() => {
      const away = G.state.staff.find(s => s.away);
      if(!away) return 'no away staff';
      away.briefId = 'fake';   // simulate assignment
      G.wander.update(0.05);
      return away.away === null ? 'cancelled' : 'still away';
    }""")
    print("assign-mid-trip:", cancelled)

    # --- MONDAY overlay ---
    # advance to friday end so week can advance, then trigger advanceToMonday
    page.evaluate("() => { G.time.advanceToMonday(); }")
    page.wait_for_timeout(700)  # mid-animation (letters slamming, sub not yet)
    md = page.evaluate("() => !!document.getElementById('monday-dread')")
    paused = page.evaluate("() => G.state.paused")
    print("monday overlay present:", md, "paused:", paused)
    shot(page, "05_monday_mid")
    page.wait_for_timeout(1400)  # later: sub + tag visible
    shot(page, "06_monday_late")
    # verify it removes itself + unpauses after 4s
    page.wait_for_timeout(3200)
    gone = page.evaluate("() => !document.getElementById('monday-dread')")
    paused2 = page.evaluate("() => G.state.paused")
    print("monday gone after 4s:", gone, "paused after:", paused2)
    assert gone and not paused2, "monday overlay must remove itself and unpause"

    # --- toast hover pauses ALL brief toasts ---
    page.evaluate("""() => {
      // spawn two brief toasts directly
      const defs = G.data.briefs.slice(0,2);
      defs.forEach(d => G.dock.showBriefToast(d, ()=>{}));
    }""")
    page.wait_for_timeout(500)
    # let them tick a bit unhovered (sim must be active)
    page.wait_for_timeout(1200)
    before = page.evaluate("""() => {
      return Array.from(document.querySelectorAll('.brief-toast .toast-timer > div')).map(d => d.style.width);
    }""")
    # hover the first toast
    box = page.query_selector(".brief-toast")
    bb = box.bounding_box()
    page.mouse.move(bb["x"]+bb["width"]/2, bb["y"]+bb["height"]/2)
    page.wait_for_timeout(1400)  # both should be frozen
    after = page.evaluate("""() => {
      return Array.from(document.querySelectorAll('.brief-toast .toast-timer > div')).map(d => d.style.width);
    }""")
    classes = page.evaluate("""() => {
      return Array.from(document.querySelectorAll('.brief-toast')).map(t => t.className);
    }""")
    print("timer widths before hover:", before)
    print("timer widths after hover :", after)
    print("toast classes:", classes)
    shot(page, "07_toast_hover")

    page.wait_for_timeout(300)
    browser.close()

print("\n=== CONSOLE/PAGE ERRORS ===")
if errors:
    for e in errors: print(e)
    sys.exit(1)
else:
    print("none")
