import sys
from playwright.sync_api import sync_playwright

out = sys.argv[1] if len(sys.argv) > 1 else "ingame.png"
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1300, "height": 760}, device_scale_factor=1)
    pg.goto("http://localhost:8077/", wait_until="networkidle")
    pg.wait_for_timeout(800)
    try:
        pg.click("#btn-start", timeout=4000)
    except Exception as e:
        print("start click failed:", e)
    pg.wait_for_timeout(2500)  # let assets load + a few anim frames
    canvas = pg.query_selector("#game")
    canvas.screenshot(path=out)
    print("saved", out)
    b.close()
