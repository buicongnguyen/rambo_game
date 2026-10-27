import { pathToFileURL } from 'node:url';
import { writeFile } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist'] });
const rows = [];
try {
  for (const phone of [false, true]) {
    const pages = [];
    for (const url of [process.argv[2], process.argv[3], process.argv[2]]) {
      const context = await browser.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 800 }, isMobile: phone, hasTouch: phone });
      const page = await context.newPage(); await page.goto(url);
      await page.waitForFunction(() => window.__ramboPerf?.game.scene.scenes[0]?.textures?.exists('blast-circle'));
      await page.evaluate(() => window.__ramboPerf.game.loop.stop());
      const cdp = await context.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: phone ? 4 : 1 });
      pages.push(page);
    }
    for (const cfg of [{ dense: true }, { effects: true }]) {
      for (const page of pages) await page.evaluate(async cfg => {
        window.__pairs = (await import('/scripts/performance-fixture.ts')).performanceFixture(cfg);
        for (let i = 0; i < 90; i++) window.__pairs.step();
      }, cfg);
      const blocks = [];
      for (let i = 0; i < 12; i++) {
        const values = [];
        for (const j of [i % 3, (i + 1) % 3, (i + 2) % 3]) values[j] = await pages[j].evaluate(async () => {
          let sum = 0;
          for (let n = 0; n < 20; n++) {
            const start = performance.now(); window.__pairs.step(); sum += performance.now() - start;
            await new Promise(resolve => setTimeout(resolve, 0));
          }
          return sum / 20;
        });
        blocks.push(values);
      }
      const median = a => a.sort((a,b) => a-b)[a.length >> 1];
      const result = { phone, ...cfg, blocks, optimizedRatio: median(blocks.map(v => v[1] / v[0])), controlRatio: median(blocks.map(v => v[2] / v[0])) };
      rows.push(result); console.log(result);
      if (cfg.dense) for (const i of [0, 2]) {
        const png = await pages[i].evaluate(() => window.__pairs.png());
        await writeFile(`performance-after.local/${phone ? 'phone' : 'desktop'}-null-${i}.png`, Buffer.from(png.split(',')[1], 'base64'));
      }
    }
    for (const page of pages) await page.context().close();
  }
  await writeFile('performance-after.local/paired-timings.json', JSON.stringify(rows, null, 2));
} finally { await browser.close(); }
