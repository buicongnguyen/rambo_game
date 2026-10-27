import Phaser from 'phaser';

/** Bounded spare pools. Bursts can exceed the pool limit without dropping an effect. */
export class HitEffects {
  private readonly images: Phaser.GameObjects.Image[] = [];
  private readonly labels: Phaser.GameObjects.Text[] = [];
  private readonly spareLimit = 64;

  private readonly scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    // The display list owns all these objects and destroys them on scene shutdown.
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.images.length = this.labels.length = 0;
    });
  }

  emit(x: number, y: number, tint: number, label?: string): void {
    const spark = this.images.pop() ?? this.scene.add.image(x, y, 'blast-circle');
    spark.setPosition(x, y).setActive(true).setVisible(true).setDepth(19);
    this.scene.children.bringToTop(spark);
    spark.setTint(tint).setAlpha(0.58).setScale(0.11).setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({
      targets: spark, alpha: 0, scale: 0.82, duration: 180, ease: 'Quad.easeOut',
      onComplete: () => {
        spark.setVisible(false).setActive(false);
        if (this.images.length < this.spareLimit) this.images.push(spark);
        else spark.destroy();
      },
    });
    if (!label) return;
    // Matching text retains its canvas and GPU texture; varying labels may reuse a spare.
    const matching = this.labels.findIndex((text) => text.text === label);
    const text = (matching >= 0 ? this.labels.splice(matching, 1)[0] : this.labels.pop()) ??
      this.scene.add.text(x, y - 18, label, {
        fontFamily: 'Bahnschrift, Trebuchet MS, sans-serif', fontSize: '12px',
        color: '#fff2c4', stroke: '#24170a', strokeThickness: 3,
      });
    text.setText(label).setPosition(x, y - 18).setOrigin(0.5).setDepth(20);
    this.scene.children.bringToTop(text);
    text.setActive(true).setVisible(true).setAlpha(1);
    this.scene.tweens.add({
      targets: text, y: y - 38, alpha: 0, duration: 360, ease: 'Quad.easeOut',
      onComplete: () => {
        text.setVisible(false).setActive(false);
        if (this.labels.length < this.spareLimit) this.labels.push(text);
        else text.destroy();
      },
    });
  }
}
