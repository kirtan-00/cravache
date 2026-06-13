const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1320, height: 760 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERR ' + e.message));

  await page.goto('http://localhost:8077/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  // start a new game
  await page.click('#btn-start');
  await page.waitForTimeout(1200);

  const dir = '../_shots/';
  async function dismissModal() {
    // close any random event/modal so it doesn't cover the office
    await page.evaluate(() => {
      const m = document.querySelector('#modal-root, .modal, .px-modal');
      document.querySelectorAll('.modal, .px-modal, #modal-root > *').forEach(el => {
        const b = el.querySelector('button'); if (b) b.click();
      });
    }).catch(() => {});
    await page.keyboard.press('Escape').catch(() => {});
  }

  async function shot(name) {
    await dismissModal();
    await page.waitForTimeout(700);
    await page.screenshot({ path: dir + name });
    console.log('shot', name);
  }

  // DAY_REAL_SECONDS drives hour(); set dayT to hit specific hours.
  async function setHour(targetHour) {
    await page.evaluate((h) => {
      const span = G.BAL.DAY_END_HOUR - G.BAL.DAY_START_HOUR;
      const frac = Math.max(0, Math.min(1, (h - G.BAL.DAY_START_HOUR) / span));
      G.state.night = false;
      G.state.dayT = frac * G.BAL.DAY_REAL_SECONDS;
    }, targetHour);
  }

  await setHour(10);  await shot('bg2_morning.png');
  await setHour(16);  await shot('bg2_golden.png');
  await setHour(18.2); await shot('bg2_sunset.png');

  // buy tv + cooler, give money, hire several staff across depts
  await page.evaluate(() => {
    G.state.upgrades.tv = true;
    G.state.upgrades.cooler = true;
    G.state.upgrades.plant = true;
    G.state.money = 900000;
    // hire as many as the front of the pool allows
    for (let i = 0; i < 12; i++) { try { G.staff.hire(0); } catch (e) {} }
    // suppress random office events for clean shots
    G.state.officeEventToday = true;
    G.state.callFiredToday = true;
  });
  await setHour(10.5);
  await shot('bg2_staffed_day.png');

  // sunset with staff to test nameplate readability against warm floor + sky
  await page.evaluate(() => { G.state.officeEventToday = true; });
  await setHour(18.2);
  await shot('bg2_staffed_sunset.png');

  console.log('ERRORS', JSON.stringify(errors.slice(0, 20)));
  await browser.close();
})();
