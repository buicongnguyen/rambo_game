import Phaser from 'phaser';

const boundedTypes = new Set(['Rectangle', 'Ellipse', 'Arc', 'Image', 'Sprite', 'Text']);

/** Phaser 3.90 filters visibility here, but doesn't cull the render list to the viewport. */
export function cullSceneToCamera(scene: Phaser.Scene): void {
  const manager = scene.cameras;
  const original = manager.getVisibleChildren;
  const bounds = new WeakMap<Phaser.GameObjects.GameObject, {
    pose: number[]; rect: Phaser.Geom.Rectangle;
  }>();
  manager.getVisibleChildren = function (children, camera) {
    return children.filter((child) => {
      if (!child.willRender(camera)) return false;
      // Unbounded graphics, containers, fixed HUD, rotated/shaking cameras and
      // custom effects keep the engine path. Only discard provably off-screen art.
      const object = child as Phaser.GameObjects.Sprite & { lineWidth?: number };
      if (!boundedTypes.has(child.type) || object.parentContainer || object.mask ||
          object.hasPostPipeline || object.scrollFactorX !== 1 || object.scrollFactorY !== 1 ||
          (camera as Phaser.Cameras.Scene2D.Camera & { rotation: number }).rotation !== 0 ||
          camera.shakeEffect.isRunning || camera.disableCull ||
          !object.width || !object.height) return true;
      let cached = bounds.get(child);
      if (!cached) {
        cached = { pose: [], rect: new Phaser.Geom.Rectangle() };
        bounds.set(child, cached);
      }
      const p = cached.pose;
      if (p[0] !== object.x || p[1] !== object.y || p[2] !== object.width || p[3] !== object.height ||
          p[4] !== object.scaleX || p[5] !== object.scaleY || p[6] !== object.rotation ||
          p[7] !== object.originX || p[8] !== object.originY) {
        object.getBounds(cached.rect);
        p[0] = object.x; p[1] = object.y; p[2] = object.width; p[3] = object.height;
        p[4] = object.scaleX; p[5] = object.scaleY; p[6] = object.rotation;
        p[7] = object.originX; p[8] = object.originY;
      }
      const r = cached.rect, v = camera.worldView;
      const margin = 4 / Math.min(camera.zoomX, camera.zoomY) +
        (object.lineWidth ?? 0) * Math.max(Math.abs(object.scaleX), Math.abs(object.scaleY));
      return r.right + margin >= v.left && r.left - margin <= v.right &&
        r.bottom + margin >= v.top && r.top - margin <= v.bottom;
    });
  };
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    manager.getVisibleChildren = original;
  });
}
