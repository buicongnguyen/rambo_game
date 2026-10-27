import { pathToFileURL } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const url = process.argv[2] ?? 'http://127.0.0.1:4200/', out = process.argv[3] ?? 'performance.local';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] });
const results = [];
try {
  for (const cfg of [
    { name: 'desktop-entry' }, { name: 'desktop-dense', dense: true },
    { name: 'phone-dense', dense: true, phone: true },
    { name: 'desktop-combat', combat: true }, { name: 'phone-combat', combat: true, phone: true },
    { name: 'desktop-effects', effects: true }, { name: 'phone-effects', effects: true, phone: true },
  ]) {
    const context = await browser.newContext({ viewport: cfg.phone ? { width: 390, height: 844 } : { width: 1280, height: 800 }, isMobile: !!cfg.phone, hasTouch: !!cfg.phone, deviceScaleFactor: cfg.phone ? 2 : 1 });
    await context.addInitScript(() => {
      const p = window.__workProbe = { active: false, draws: 0, triangles: 0, bufferCalls: 0, bufferBytes: 0, textureUploads: 0 };
      for (const proto of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
        for (const name of ['drawArrays', 'drawElements', 'bufferData', 'bufferSubData', 'texImage2D', 'texSubImage2D']) {
          const original = proto[name];
          proto[name] = function (...a) {
            if (p.active) {
              if (name.startsWith('draw')) { p.draws++; if (a[0] === this.TRIANGLES) p.triangles += (name === 'drawArrays' ? a[2] : a[1]) / 3; }
              else if (name.startsWith('buffer')) {
                p.bufferCalls++;
                const src = a[name === 'bufferData' ? 1 : 2];
                p.bufferBytes += typeof src === 'number' ? src : ArrayBuffer.isView(src) ? (a[4] || (src.length ?? src.byteLength) - (a[3] ?? 0)) * (src.BYTES_PER_ELEMENT ?? 1) : src?.byteLength ?? 0;
              } else p.textureUploads++;
            }
            return original.apply(this, a);
          };
        }
      }
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(url);
    await page.waitForFunction(() => window.__ramboPerf?.game.scene.scenes[0]?.textures?.exists('blast-circle'));
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: cfg.phone ? 4 : 1 });
    await page.evaluate(async cfg => {
      window.__fixture = (await import('/scripts/performance-fixture.ts')).performanceFixture(cfg);
      for (let i = 0; i < 60; i++) window.__fixture.step();
    }, cfg);
    const measurement = await page.evaluate(() => {
      const f = window.__fixture, p = window.__workProbe;
      f.instrument(true); p.active = true;
      for (let i = 0; i < 60; i++) f.step();
      p.active = false; f.instrument(false);
      return { ...p, ...f.counts, ...f.memory() };
    });
    await cdp.send('Profiler.enable'); await cdp.send('Profiler.start');
    const timing = await page.evaluate(async () => {
      const work = [], gaps = []; let last = 0;
      for (let i = 0; i < 90; i++) {
        await new Promise(requestAnimationFrame);
        const start = performance.now(); if (last) gaps.push(start - last); last = start;
        window.__fixture.step(); work.push(performance.now() - start);
      }
      return { work, gaps };
    });
    const { profile } = await cdp.send('Profiler.stop');
    await writeFile(`${out}/${cfg.name}.cpuprofile`, JSON.stringify(profile));
    const png = await page.evaluate(() => window.__fixture.png());
    await writeFile(`${out}/${cfg.name}.png`, Buffer.from(png.split(',')[1], 'base64'));
    await cdp.send('HeapProfiler.collectGarbage');
    const heap = await cdp.send('Runtime.getHeapUsage');
    const gpu = await page.evaluate(() => { const gl = window.__ramboPerf.game.renderer.gl, d = gl.getExtension('WEBGL_debug_renderer_info'); return { name: d && gl.getParameter(d.UNMASKED_RENDERER_WEBGL), canvas: [gl.drawingBufferWidth, gl.drawingBufferHeight] }; });
    const times = new Map(); profile.samples?.forEach((id, i) => times.set(id, (times.get(id) || 0) + profile.timeDeltas[i]));
    const top = profile.nodes.map(n => ({ fn: n.callFrame.functionName, file: n.callFrame.url.split('/').pop(), selfMs: (times.get(n.id) || 0) / 1000 })).sort((a,b) => b.selfMs - a.selfMs).slice(0, 16);
    const stats = a => { a.sort((a,b) => a-b); return { median: a[a.length >> 1], p95: a[Math.floor(a.length * .95)] }; };
    const row = { ...cfg, frames: 60, measurement, cpuMs: stats(timing.work), frameMs: stats(timing.gaps), heap, gpu, top, errors };
    results.push(row); console.log(JSON.stringify(row));
    await context.close();
    if (errors.length) throw Error(errors.join('\n'));
  }
  await writeFile(`${out}/results.json`, JSON.stringify(results, null, 2));
} finally { await browser.close(); }
