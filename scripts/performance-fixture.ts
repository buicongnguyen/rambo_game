import Phaser from 'phaser';

// Test-only fixture, served by Vite; never imported by the shipping application.
export function performanceFixture(config: { combat?: boolean; effects?: boolean; dense?: boolean }) {
  const { game, director, virtualGamepad } = (window as any).__ramboPerf;
  game.loop.stop();
  let seed = 98765;
  Math.random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  Phaser.Math.RND.sow(['performance-98765']);
  director.startCampaign(1, 'normal');
  let time = 10000;
  game.step(time, 1000 / 60);
  if (config.dense) {
    for (let i = 0; i < 4; i++) {
      director.skipToNextStage();
      game.step(time += 1000 / 60, 1000 / 60);
    }
  }
  const scene: any = game.scene.scenes[0];
  // Phaser's tween clock normally uses wall time; make the fixture reproducible.
  scene.tweens.getDelta = () => 1000 / 60;
  scene.tweens.killAll();
  scene.bannerText?.setVisible(false);
  if (config.dense || config.combat) {
    const state = scene.encounterStates[0];
    state.triggered = true;
    state.remaining = state.config.enemies.length;
    for (const e of state.config.enemies)
      scene.spawnEnemy(e.kind, e.id, e.x, e.y, state.config.id);
    const p = scene.players[0];
    p.sprite.setPosition(state.config.enemies[0].x - 170, state.config.enemies[0].y);
    p.health = 1e9;
    scene.cameraTarget.setPosition(p.sprite.x, p.sprite.y);
    scene.cameras.main.centerOn(p.sprite.x, p.sprite.y);
  }
  if (config.combat) {
    virtualGamepad.setAxis(1, 0.6, -0.2);
    virtualGamepad.setAction(1, 'fire', true);
  }
  const render = () => {
    game.renderer.preRender();
    game.scene.render(game.renderer);
    game.renderer.postRender();
  };
  let frame = 0;
  const step = () => {
    if (config.effects) {
      if (frame % 4 === 0) {
        const p = scene.players[0].sprite;
        for (let i = 0; i < 8; i++)
          scene.createHitSpark(p.x + (i % 4) * 30, p.y + Math.floor(i / 4) * 40, 0xffbd58, ['-12', '-20', '-32'][i % 3]);
      }
      scene.tweens.step(true);
    }
    if (config.combat) game.step(time += 1000 / 60, 1000 / 60);
    else render();
    frame++;
  };
  const counts: Record<string, number> = {};
  const patches: Array<[any, string, any]> = [];
  const instrument = (on: boolean) => {
    if (!on) { for (const [p, k, f] of patches) p[k] = f; patches.length = 0; return; }
    for (const [proto, names] of [
      [Phaser.GameObjects.Components.TransformMatrix.prototype, ['applyITRS', 'multiply', 'multiplyWithOffset']],
      [Phaser.Renderer.WebGL.Pipelines.MultiPipeline.prototype, ['batchFillPath']],
      [Phaser.GameObjects.Text.prototype, ['updateText']],
    ] as Array<[any, string[]]>) {
      for (const name of names) {
        counts[name] = 0;
        const original = proto[name];
        patches.push([proto, name, original]);
        proto[name] = function (...args: any[]) { counts[name]++; return original.apply(this, args); };
      }
    }
  };
  return { scene, step, render, counts, instrument, memory: () => ({
    displayObjects: scene.children.length,
    textureKeys: game.textures.getTextureKeys().length,
    textCanvases: scene.children.list.filter((o: any) => o.type === 'Text').length,
    pipelineBufferBytes: Object.values(game.renderer.pipelines.pipelines.entries).reduce((n: number, p: any) => n + (p.vertexData?.byteLength ?? 0), 0),
    stage: scene.stage.codename,
  }), png: () => { render(); return game.canvas.toDataURL(); } };
}
