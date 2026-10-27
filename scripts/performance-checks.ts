import { performanceFixture } from './performance-fixture';

export function checkRendering() {
  const { game, director } = (window as any).__ramboPerf;
  const f = performanceFixture({});
  const scene: any = f.scene;
  const assert = (ok: boolean, message: string) => { if (!ok) throw Error(message); };
  let checkedViews = 0;
  let maxPixelDelta = 0;
  const compare = () => {
    const camera = scene.cameras.main;
    camera.stopFollow();
    camera.shakeEffect.reset();
    const gl = game.renderer.gl as WebGLRenderingContext;
    const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
    const other = new Uint8Array(pixels.length);
    camera.disableCull = true; f.render();
    gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    camera.disableCull = false; f.render();
    gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, other);
    let changed = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const delta = Math.max(Math.abs(pixels[i] - other[i]), Math.abs(pixels[i+1] - other[i+1]), Math.abs(pixels[i+2] - other[i+2]));
      maxPixelDelta = Math.max(maxPixelDelta, delta);
      // Triangle batching can change a few antialiased edge values (observed max 4/255).
      if (delta > 8) changed++;
    }
    assert(changed === 0, `${scene.stage.codename}: view ${checkedViews} culling changed ${changed} pixels`);
    checkedViews++;
  };
  const combat = performanceFixture({ combat: true });
  for (let i = 0; i < 210; i++) combat.step();
  compare();
  performanceFixture({});
  const stages = director.getSnapshot().stages.length;
  for (let i = 0; i < stages; i++) {
    if (i) { director.skipToNextStage(); game.step(10000 + i * 17, 17); }
    const camera = scene.cameras.main;
    camera.stopFollow();
    for (const ratio of [0.05, 0.5, 0.95]) {
      camera.centerOn(scene.stage.worldWidth * ratio, scene.stage.worldHeight * ratio);
      compare();
    }
  }
  const camera = scene.cameras.main;
  camera.centerOn(600, 500);
  const shape = scene.add.rectangle(600, 500, 80, 120, 0xff6622).setStrokeStyle(12, 0xffffff);
  const sprite = scene.add.image(600, 500, 'blast-circle');
  for (let i = 0; i < 4; i++) {
    shape.setRotation(i * 0.63).setScale(i % 2 ? -1.3 : 1.5, 0.7 + i).setOrigin(i / 4);
    sprite.setScale(2 + i).setPosition(600 + i * 100, 500).setFlipX(!!(i % 2));
    compare();
  }
  camera.setZoom(0.47); compare(); camera.setRotation(0.3); compare(); camera.setRotation(0);
  shape.destroy(); sprite.destroy();

  const fx = scene.hitEffects;
  scene.tweens.killAll();
  scene.tweens.getDelta = () => 1000 / 60;
  for (let i = 0; i < 160; i++) fx.emit(600, 500, 0xffbb44, `-${i % 3}`);
  for (let i = 0; i < 30; i++) scene.tweens.step(true);
  assert(fx.images.length === 64 && fx.labels.length === 64, 'Spare effect pools are not bounded');
  assert(fx.images.every((o: any) => !o.visible && !o.active), 'Expired sparks still active');
  const reused = fx.labels.find((o: any) => o.text === '-1') ?? fx.labels[fx.labels.length - 1];
  fx.emit(123, 456, 0xff3300, reused.text);
  assert(reused.visible && reused.alpha === 1 && reused.x === 123 && reused.y === 438, 'Label reuse lost position/opacity');
  const oldObjects = [...fx.images, ...fx.labels, reused];
  director.startCampaign(1); game.step(20000, 17);
  assert(oldObjects.every((o: any) => !o.scene), 'Scene restart retained effect objects');
  assert(fx.images.length === 0 && fx.labels.length === 0, 'Shutdown retained pool references');

  const textureCounts: number[] = [];
  for (let i = 0; i < 3; i++) {
    const fixture = performanceFixture({ effects: true });
    for (let j = 0; j < 90; j++) fixture.step();
    textureCounts.push(fixture.memory().textureKeys);
  }
  assert(new Set(textureCounts).size === 1, 'Restart grew the texture registry');
  return { checkedViews, stages, maxPixelDelta, textureCounts, poolLimit: 64 };
}

export function stepInput(frames = 12) {
  const { game } = (window as any).__ramboPerf;
  const scene: any = game.scene.scenes[0];
  for (let i = 0; i < frames; i++) game.step(scene.time.now + 1000 / 60, 1000 / 60);
  const p = scene.players[0];
  return { x: p.sprite.x, y: p.sprite.y, bullets: scene.playerBullets.getLength() };
}
