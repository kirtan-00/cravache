import pkg from '/Users/purohit/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.js';
const { chromium } = pkg;

const OUT = '/Users/purohit/Desktop/claude/claude projects/cravache/art/_raw/refs3';
const URL = 'http://localhost:8077/';

const errs = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });

await page.goto(URL, { waitUntil: 'networkidle' });
// start a fresh game
await page.click('#btn-start');
await page.waitForTimeout(600);

// helper: set time-of-day and re-render a frame
async function setHour(opts) {
  await page.evaluate((o) => {
    const s = window.G.state;
    s.night = !!o.night;
    if (o.dayT !== undefined) s.dayT = o.dayT;
    if (o.nightT !== undefined) s.nightT = o.nightT;
  }, opts);
  await page.waitForTimeout(400); // let a few RAF frames paint
}

async function shot(name) {
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/shot_${name}.png` });
  console.log('shot', name, '@hour', await page.evaluate(() => window.G.time.hour().toFixed(1)));
}

// 1) morning (dayT ~8 of 45 -> hour ~10.8)
await setHour({ night: false, dayT: 8 });
await shot('morning');

// 2) afternoon (dayT ~20 -> hour ~13.4)
await setHour({ night: false, dayT: 20 });
await shot('afternoon');

// 3) evening (dayT ~40 -> hour ~17.9)
await setHour({ night: false, dayT: 40 });
await shot('evening');

// 4) night
await setHour({ night: true, nightT: 5 });
await shot('night');

// back to afternoon for the populated shots
await setHour({ night: false, dayT: 20 });

// hire 12 staff and assign briefs so people are seated + working
await page.evaluate(() => {
  const G = window.G;
  G.state.money = 2e6;
  for (let i = 0; i < 30 && G.state.staff.length < 13; i++) {
    G.staff.refillPool();
    // hire first visible candidate
    let hired = false;
    for (let p = 0; p < G.state.hirePool.length; p++) {
      if (G.staff.candidateVisible(G.state.hirePool[p]) && G.staff.canHire(G.state.hirePool[p])) {
        if (G.staff.hire(p)) { hired = true; break; }
      }
    }
    if (!hired) break;
  }
  // assign tray briefs to idle seated staff so they look working
  const tray = G.state.briefs.filter(b => b.status === 'tray');
  let ti = 0;
  G.state.staff.forEach(st => {
    if (st.briefId) return;
    while (ti < tray.length) {
      const b = tray[ti++];
      if (G.staff.canWork && G.staff.canWork(st, b) === false) continue;
      if (G.briefs.assign(b, st)) break;
    }
  });
});
await page.waitForTimeout(700);
await shot('staffed_afternoon');

// force ALL decor on
await page.evaluate(() => {
  ['aquarium','coffee','arcade','plant_big','posters','string_lights','plant','tv','neon','cooler']
    .forEach(k => window.G.state.upgrades[k] = true);
});
await page.waitForTimeout(700);
await shot('decor_all');

// decor at night too (string lights / aquarium / arcade glow read best dark)
await setHour({ night: true, nightT: 5 });
await page.waitForTimeout(500);
await shot('decor_night');

// 5-toast pileup
await setHour({ night: false, dayT: 20 });
await page.evaluate(() => {
  for (let i = 0; i < 5; i++) {
    window.G.dock.infoToast('TOAST ' + (i+1), 'Stacking toast number ' + (i+1) + ' to test the cap.', i % 2 ? 'good' : 'bad');
  }
});
await page.waitForTimeout(600);
await shot('toasts');

console.log('--- ERRORS (' + errs.length + ') ---');
errs.forEach(e => console.log(e));
await browser.close();
process.exit(errs.length ? 2 : 0);
