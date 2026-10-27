import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist'] });
const results = [];
try {
  for (const phone of [false, true]) {
    const context = await browser.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 800 }, isMobile: phone, hasTouch: phone });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(process.argv[2] ?? 'http://127.0.0.1:4201/');
    await page.waitForFunction(() => window.__ramboPerf?.game.scene.scenes[0]?.textures?.exists('blast-circle'));
    const checks = await page.evaluate(async () => (await import('/scripts/performance-checks.ts')).checkRendering());
    await page.evaluate(async () => { (await import('/scripts/performance-fixture.ts')).performanceFixture({}); });
    const start = await page.evaluate(async () => (await import('/scripts/performance-checks.ts')).stepInput(1));
    if (phone) {
      const cdp = await context.newCDPSession(page);
      const stick = await page.locator('[data-stick-zone]').boundingBox(); assert(stick);
      const x = stick.x + stick.width / 2, y = stick.y + stick.height / 2;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - 40 }] });
      const moved = await page.evaluate(async () => (await import('/scripts/performance-checks.ts')).stepInput());
      assert(moved.y < start.y, 'Touch stick did not move the player');
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      const axis = await page.evaluate(() => window.__ramboPerf.virtualGamepad.getAxis(1)); assert.deepEqual(axis, { x: 0, y: 0 });
      const fire = await page.locator('button[data-action="fire"]').boundingBox(); assert(fire);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: fire.x + fire.width / 2, y: fire.y + fire.height / 2 }] });
      const fired = await page.evaluate(async () => (await import('/scripts/performance-checks.ts')).stepInput(2));
      assert(fired.bullets > 0, 'Touch fire did not shoot');
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await page.keyboard.down('w');
      const moved = await page.evaluate(async () => (await import('/scripts/performance-checks.ts')).stepInput());
      await page.keyboard.up('w'); assert(moved.y < start.y, 'Keyboard movement failed');
      await page.keyboard.down('Space');
      const fired = await page.evaluate(async () => (await import('/scripts/performance-checks.ts')).stepInput(2));
      await page.keyboard.up('Space'); assert(fired.bullets > 0, 'Keyboard fire failed');
    }
    await page.setViewportSize(phone ? { width: 844, height: 390 } : { width: 1024, height: 768 });
    await page.waitForTimeout(100);
    assert.deepEqual(errors, []);
    results.push({ phone, ...checks, input: 'passed', resize: 'passed', errors });
    console.log(results.at(-1));
    await context.close();
  }
  await writeFile('performance-after.local/checks.json', JSON.stringify(results, null, 2));
} finally { await browser.close(); }
