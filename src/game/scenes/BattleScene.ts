import Phaser from 'phaser';
import { CONTROL_SCHEMES } from '../core/ControlScheme';
import { GameDirector } from '../core/GameDirector';
import { VirtualGamepad, type GameAction } from '../core/VirtualGamepad';
import {
  ALL_SPRITE_SHEETS,
  animationKey,
  getBossTextureKey,
  getEnemyTextureKey,
} from '../data/spriteManifest';
import type {
  BossConfig,
  EnemyKind,
  EncounterConfig,
  HudSnapshot,
  SessionSnapshot,
  StageConfig,
  StageThemeId,
  WeaponKind,
} from '../types';

interface WeaponSpec {
  kind: WeaponKind;
  label: string;
  shortLabel: string;
  tint: number;
  fireRate: number;
  bulletSpeed: number;
  damage: number;
  maxDistance: number;
  maxAmmo: number;
  pickupAmmo: number;
  ammoCost: number;
  spread: number;
  pellets: number;
  scaleX: number;
  scaleY: number;
  splashRadius?: number;
  splashDamage?: number;
  pierceCount?: number;
  beamWidth?: number;
  dropStartRatio?: number;
  tracerDistance?: number;
}

type BulletZoneEffect = 'drag' | 'boost' | 'crosswind';

interface BulletEffectZone {
  bounds: Phaser.Geom.Rectangle;
  effect: BulletZoneEffect;
  label: string;
}

const WEAPONS: Record<WeaponKind, WeaponSpec> = {
  rifle: {
    kind: 'rifle',
    label: 'Rifle',
    shortLabel: 'RFL',
    tint: 0xefb648,
    fireRate: 190,
    bulletSpeed: 390,
    damage: 32,
    maxDistance: 500,
    maxAmmo: -1,
    pickupAmmo: 0,
    ammoCost: 0,
    spread: 0,
    pellets: 1,
    scaleX: 1.8,
    scaleY: 1.25,
  },
  shotgun: {
    kind: 'shotgun',
    label: 'Shotgun',
    shortLabel: 'SHG',
    tint: 0xffd08a,
    fireRate: 500,
    bulletSpeed: 430,
    damage: 44,
    maxDistance: 700,
    maxAmmo: 36,
    pickupAmmo: 18,
    ammoCost: 1,
    spread: 0.24,
    pellets: 5,
    scaleX: 1.65,
    scaleY: 1.25,
  },
  flame: {
    kind: 'flame',
    label: 'Fire Gun',
    shortLabel: 'FIR',
    tint: 0xff6b2d,
    fireRate: 95,
    bulletSpeed: 340,
    damage: 24,
    maxDistance: 520,
    maxAmmo: 90,
    pickupAmmo: 45,
    ammoCost: 1,
    spread: 0.12,
    pellets: 4,
    scaleX: 1.95,
    scaleY: 1.7,
  },
  launcher: {
    kind: 'launcher',
    label: 'Launcher',
    shortLabel: 'LCH',
    tint: 0x9cf5f3,
    fireRate: 720,
    bulletSpeed: 360,
    damage: 135,
    maxDistance: 980,
    maxAmmo: 8,
    pickupAmmo: 4,
    ammoCost: 1,
    spread: 0,
    pellets: 1,
    scaleX: 2.35,
    scaleY: 1.65,
    splashRadius: 118,
    splashDamage: 70,
  },
  sniper: {
    kind: 'sniper',
    label: 'Sniper',
    shortLabel: 'SNP',
    tint: 0xdaf7ff,
    fireRate: 760,
    bulletSpeed: 860,
    damage: 150,
    maxDistance: 1900,
    maxAmmo: 18,
    pickupAmmo: 9,
    ammoCost: 1,
    spread: 0,
    pellets: 1,
    scaleX: 2.8,
    scaleY: 1.05,
    pierceCount: 4,
    dropStartRatio: 0.96,
    tracerDistance: 760,
  },
  explosiveArrow: {
    kind: 'explosiveArrow',
    label: 'Blast Arrow',
    shortLabel: 'ARR',
    tint: 0xb6ff70,
    fireRate: 680,
    bulletSpeed: 330,
    damage: 80,
    maxDistance: 900,
    maxAmmo: 12,
    pickupAmmo: 6,
    ammoCost: 1,
    spread: 0,
    pellets: 1,
    scaleX: 2.2,
    scaleY: 1.35,
    splashRadius: 170,
    splashDamage: 105,
  },
  missile: {
    kind: 'missile',
    label: 'Hand Missile',
    shortLabel: 'MSL',
    tint: 0xffb35c,
    fireRate: 860,
    bulletSpeed: 300,
    damage: 105,
    maxDistance: 960,
    maxAmmo: 6,
    pickupAmmo: 3,
    ammoCost: 1,
    spread: 0,
    pellets: 1,
    scaleX: 2.7,
    scaleY: 1.75,
    splashRadius: 230,
    splashDamage: 150,
  },
  laser: {
    kind: 'laser',
    label: 'Laser Gun',
    shortLabel: 'LSR',
    tint: 0x71f7ff,
    fireRate: 620,
    bulletSpeed: 0,
    damage: 130,
    maxDistance: 1180,
    maxAmmo: 20,
    pickupAmmo: 10,
    ammoCost: 1,
    spread: 0,
    pellets: 1,
    scaleX: 1,
    scaleY: 1,
    beamWidth: 30,
    pierceCount: 99,
  },
};

interface PlayerUnit {
  id: 1 | 2;
  label: string;
  accent: string;
  tint: number;
  sprite: Phaser.Physics.Arcade.Sprite;
  health: number;
  maxHealth: number;
  bombs: number;
  alive: boolean;
  moveSpeed: number;
  walkSpeed: number;
  crawlSpeed: number;
  jumpSpeed: number;
  fireRate: number;
  bulletSpeed: number;
  damage: number;
  nextFireAt: number;
  nextSpecialAt: number;
  jumpReadyAt: number;
  jumpUntil: number;
  fireVisualUntil: number;
  contactReadyAt: number;
  weaponIndex: number;
  weapons: WeaponKind[];
  ammo: Record<WeaponKind, number>;
  aim: Phaser.Math.Vector2;
  jumpVector: Phaser.Math.Vector2;
  virtualControlId?: 1 | 2;
  controls: {
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
    crouch: Phaser.Input.Keyboard.Key;
    jump: Phaser.Input.Keyboard.Key;
    fire: Phaser.Input.Keyboard.Key;
    special: Phaser.Input.Keyboard.Key;
  };
}

interface EnemyUnit {
  id: string;
  kind: EnemyKind;
  theme: StageThemeId;
  sprite: Phaser.Physics.Arcade.Sprite;
  health: number;
  maxHealth: number;
  alive: boolean;
  moveSpeed: number;
  fireRate: number;
  bulletSpeed: number;
  damage: number;
  nextFireAt: number;
  fireVisualUntil: number;
  contactReadyAt: number;
  encounterId: string;
  behaviorOffset: number;
}

interface BossUnit {
  config: BossConfig;
  sprite: Phaser.Physics.Arcade.Sprite;
  health: number;
  maxHealth: number;
  alive: boolean;
  nextFireAt: number;
  nextSummonAt: number;
  fireVisualUntil: number;
  contactReadyAt: number;
  direction: number;
}

interface EncounterState {
  config: EncounterConfig;
  triggered: boolean;
  cleared: boolean;
  remaining: number;
}

interface SpawnDoor {
  x: number;
  y: number;
  house: Phaser.GameObjects.Rectangle;
}

export class BattleScene extends Phaser.Scene {
  private readonly director: GameDirector;
  private readonly pushHud: (snapshot: HudSnapshot) => void;
  private readonly virtualGamepad: VirtualGamepad;
  private unsubscribe?: () => void;
  private loadedToken = '';
  private stage?: StageConfig;
  private players: PlayerUnit[] = [];
  private enemies: EnemyUnit[] = [];
  private boss?: BossUnit;
  private encounterStates: EncounterState[] = [];
  private encounterCount = 0;
  private activeEncounterLabel = 'Stand by for deployment';
  private allEncountersCleared = false;
  private bossSpawned = false;
  private playing = false;
  private hudTimestamp = 0;
  private playerGroup?: Phaser.Physics.Arcade.Group;
  private enemyGroup?: Phaser.Physics.Arcade.Group;
  private bossGroup?: Phaser.Physics.Arcade.Group;
  private playerBullets?: Phaser.Physics.Arcade.Group;
  private enemyBullets?: Phaser.Physics.Arcade.Group;
  private weaponPickups?: Phaser.Physics.Arcade.StaticGroup;
  private obstacleBodies: Phaser.GameObjects.Rectangle[] = [];
  private bulletZones: BulletEffectZone[] = [];
  private spawnDoors = new Map<string, SpawnDoor>();
  private cameraTarget?: Phaser.GameObjects.Zone;
  private bannerText?: Phaser.GameObjects.Text;
  private reticleText?: Phaser.GameObjects.Text;
  private objectivePanel?: Phaser.GameObjects.Image;
  private visionGraphics?: Phaser.GameObjects.Graphics;

  constructor(
    director: GameDirector,
    pushHud: (snapshot: HudSnapshot) => void,
    virtualGamepad: VirtualGamepad,
  ) {
    super('battle-scene');
    this.director = director;
    this.pushHud = pushHud;
    this.virtualGamepad = virtualGamepad;
  }

  preload(): void {
    for (const sheet of ALL_SPRITE_SHEETS) {
      this.load.spritesheet(sheet.texture, sheet.path, {
        frameWidth: sheet.frameWidth,
        frameHeight: sheet.frameHeight,
      });
    }
  }

  create(data?: { token?: string }): void {
    this.loadedToken = data?.token ?? '';
    this.ensureEffectTextures();
    this.createAnimations();
    this.attachDirector();
    this.scale.off(Phaser.Scale.Events.RESIZE, this.applyResponsiveCamera, this);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.applyResponsiveCamera, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.applyResponsiveCamera, this);
    });

    const snapshot = this.director.getSnapshot();
    if (snapshot.phase === 'playing') {
      this.setupStage(snapshot);
      return;
    }

    this.setupStandby(snapshot);
  }

  update(time: number, delta: number): void {
    if (!this.playing || !this.stage) {
      return;
    }

    this.updatePlayers(time);
    this.updateEnemies(time);
    this.drawEnemyVisionCones();
    this.updateBoss(time);
    this.updateCameraAnchor();
    this.checkEncounterTriggers();
    this.updateBullets(this.playerBullets, time, delta);
    this.updateBullets(this.enemyBullets, time, delta);

    if (time - this.hudTimestamp > 120) {
      this.hudTimestamp = time;
      this.emitHud('live');
    }
  }

  private attachDirector(): void {
    if (this.unsubscribe) {
      return;
    }

    this.unsubscribe = this.director.subscribe((snapshot) => {
      const nextToken = snapshot.phase === 'playing' ? String(snapshot.runSerial) : '';
      if (snapshot.phase === 'playing' && nextToken !== this.loadedToken) {
        this.scene.restart({ token: nextToken });
        return;
      }

      this.emitHud(snapshot.phase === 'playing' ? 'live' : 'paused');
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribe?.();
      this.unsubscribe = undefined;
    });
  }

  private ensureEffectTextures(): void {
    if (!this.textures.exists('bullet-shell')) {
      const g = this.add.graphics();
      g.fillStyle(0xffffff, 1);
      g.fillRoundedRect(0, 0, 12, 6, 3);
      g.generateTexture('bullet-shell', 12, 6);
      g.clear();
      g.fillStyle(0xffffff, 1);
      g.fillCircle(10, 10, 10);
      g.generateTexture('blast-circle', 20, 20);
      g.clear();
      g.fillStyle(0x071109, 0.88);
      g.fillRoundedRect(0, 0, 720, 132, 18);
      g.lineStyle(3, 0xefb648, 0.42);
      g.strokeRoundedRect(4, 4, 712, 124, 16);
      g.fillStyle(0xefb648, 0.12);
      for (let x = -80; x < 760; x += 46) {
        g.fillRect(x, 0, 14, 132);
      }
      g.generateTexture('objective-plaque', 720, 132);
      g.destroy();
    }
  }

  private createAnimations(): void {
    for (const sheet of ALL_SPRITE_SHEETS) {
      const key = animationKey(sheet.texture);
      if (this.anims.exists(key)) {
        continue;
      }

      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers(sheet.texture, { start: 0, end: sheet.frameEnd }),
        frameRate: sheet.frameRate,
        repeat: sheet.repeat,
      });
    }
  }

  private setupStandby(snapshot: SessionSnapshot): void {
    this.virtualGamepad.resetAll();
    const previewStage = this.getPreviewStage(snapshot);
    this.cameras.main.setBackgroundColor(previewStage.palette.sky);
    this.cameras.main.setBounds(0, 0, previewStage.worldWidth, previewStage.worldHeight);
    this.applyResponsiveCamera();
    this.drawBackdrop(previewStage, true);
    this.bannerText = this.add.text(64, 72, previewStage.codename, {
      fontFamily: 'Impact, Haettenschweiler, sans-serif',
      fontSize: '30px',
      color: '#f3e6bf',
      letterSpacing: 2,
    }).setScrollFactor(0).setDepth(30);

    this.reticleText = this.add.text(64, 112, previewStage.briefing, {
      fontFamily: 'Bahnschrift, Trebuchet MS, sans-serif',
      fontSize: '16px',
      color: '#d6d9cb',
      wordWrap: { width: 440 },
    }).setScrollFactor(0).setDepth(30);

    const previewSprite = this.add.sprite(250, previewStage.worldHeight * 0.58, 'player-run', 0);
    previewSprite.setScale(1.2);
    previewSprite.play(animationKey('player-run'));
    previewSprite.setRotation(0.08);
    previewSprite.setDepth(10);

    const previewBoss = this.add.sprite(520, previewStage.worldHeight * 0.4, getBossTextureKey(previewStage.boss.kind), 0);
    previewBoss.setDepth(10);
    previewBoss.setFrame(0);
    previewBoss.setScale(0.92);

    this.emitHud('standby');
  }

  private setupStage(snapshot: SessionSnapshot): void {
    this.playing = false;
    this.virtualGamepad.resetAll();
    this.stage = snapshot.currentStage;
    this.players = [];
    this.enemies = [];
    this.boss = undefined;
    this.encounterStates = this.stage.encounters.map((config) => ({
      config,
      triggered: false,
      cleared: false,
      remaining: 0,
    }));
    this.encounterCount = 0;
    this.activeEncounterLabel = 'Advance to the next kill zone';
    this.allEncountersCleared = false;
    this.bossSpawned = false;
    this.hudTimestamp = 0;
    this.spawnDoors.clear();

    this.children.removeAll();
    this.bannerText = undefined;
    this.reticleText = undefined;
    this.objectivePanel = undefined;
    this.visionGraphics = undefined;
    this.physics.world.colliders.destroy();
    this.physics.resume();
    this.physics.world.setBounds(0, 0, this.stage.worldWidth, this.stage.worldHeight);
    this.cameras.main.setBounds(0, 0, this.stage.worldWidth, this.stage.worldHeight);
    this.applyResponsiveCamera();
    this.cameras.main.setBackgroundColor(this.stage.palette.sky);
    this.drawBackdrop(this.stage, false);

    this.playerGroup = this.physics.add.group();
    this.enemyGroup = this.physics.add.group();
    this.bossGroup = this.physics.add.group();
    this.playerBullets = this.physics.add.group();
    this.enemyBullets = this.physics.add.group();
    this.weaponPickups = this.physics.add.staticGroup();
    this.obstacleBodies = [];
    this.bulletZones = [];
    this.cameraTarget = this.add.zone(140, this.stage.worldHeight * 0.5, 4, 4);
    this.cameras.main.startFollow(this.cameraTarget, true, 0.08, 0.08);
    this.cameras.main.setDeadzone(140, 120);

    this.createBulletEffectZones(this.stage);
    this.createObstacles(this.stage);
    this.createBattlefieldCover(this.stage);
    this.createWeaponPickups(this.stage);
    this.visionGraphics = this.add.graphics();
    this.visionGraphics.setDepth(3);
    this.createPlayers(snapshot.playerCount);
    this.setupColliders();
    this.createOverlayText();

    this.showBanner(`${this.stage.codename} deployed`, '#f3e6bf');
    this.playing = true;
    this.emitHud('live');
  }

  private drawBackdrop(stage: StageConfig, standby: boolean): void {
    const background = this.add.graphics();
    const drawHeight = Math.max(stage.worldHeight, this.getVisibleWorldHeight());
    background.setDepth(-40);
    background.fillStyle(stage.palette.ground, 1);
    background.fillRect(0, 0, stage.worldWidth, drawHeight);

    background.fillStyle(stage.palette.shadow, 0.26);
    for (let index = 0; index < 20; index += 1) {
      const width = 90 + (index % 4) * 50;
      const height = 90 + (index % 5) * 24;
      const x = 100 + index * 135;
      const y = 100 + (index % 6) * 120;
      background.fillEllipse(x, y, width, height);
    }

    background.fillStyle(stage.palette.accent, 0.08);
    for (let index = 0; index < 18; index += 1) {
      background.fillRect(index * 170, 0, 8, drawHeight);
    }

    if (stage.palette.water) {
      background.fillStyle(stage.palette.water, 0.82);
      background.fillRect(stage.worldWidth * 0.33, 0, stage.worldWidth * 0.16, drawHeight);
      background.fillStyle(0xffffff, 0.06);
      for (let index = 0; index < 18; index += 1) {
        background.fillRect(stage.worldWidth * 0.33, 40 + index * 52, stage.worldWidth * 0.16, 14);
      }
    }

    if (standby) {
      background.fillStyle(0x000000, 0.18);
      background.fillRect(0, 0, stage.worldWidth, drawHeight);
    }
  }

  private createObstacles(stage: StageConfig): void {
    for (const obstacle of stage.obstacles) {
      const rect = this.add.rectangle(
        obstacle.x,
        obstacle.y,
        obstacle.width,
        obstacle.height,
        obstacle.tint ?? stage.palette.obstacle,
        obstacle.alpha ?? 0.95,
      );
      rect.setStrokeStyle(2, stage.palette.accent, 0.24);
      rect.setDepth(4);
      this.physics.add.existing(rect, true);
      this.obstacleBodies.push(rect);
    }
  }

  private createBulletEffectZones(stage: StageConfig): void {
    const zones: Array<{
      x: number;
      y: number;
      width: number;
      height: number;
      effect: BulletZoneEffect;
      label: string;
      tint: number;
    }> = [
      {
        x: Math.floor(stage.worldWidth * 0.29),
        y: Math.floor(stage.worldHeight * 0.5),
        width: 260,
        height: 300,
        effect: 'drag',
        label: 'DAMP ZONE: bullets slow and drop',
        tint: 0x2e8cff,
      },
      {
        x: Math.floor(stage.worldWidth * 0.48),
        y: Math.floor(stage.worldHeight * 0.34),
        width: 300,
        height: 240,
        effect: 'crosswind',
        label: 'WIND ZONE: bullets drift',
        tint: 0x93f1a5,
      },
      {
        x: Math.floor(stage.worldWidth * 0.69),
        y: Math.floor(stage.worldHeight * 0.58),
        width: 320,
        height: 280,
        effect: 'boost',
        label: 'CHARGE ZONE: bullets carry farther',
        tint: 0xf4d35e,
      },
    ];

    for (const zone of zones) {
      const bounds = new Phaser.Geom.Rectangle(
        zone.x - zone.width * 0.5,
        zone.y - zone.height * 0.5,
        zone.width,
        zone.height,
      );
      this.bulletZones.push({
        bounds,
        effect: zone.effect,
        label: zone.label,
      });

      const panel = this.add.rectangle(zone.x, zone.y, zone.width, zone.height, zone.tint, 0.09);
      panel.setDepth(-6);
      panel.setStrokeStyle(3, zone.tint, 0.58);

      this.add.text(bounds.x + 12, bounds.y + 10, zone.label, {
        fontFamily: 'Bahnschrift, Trebuchet MS, sans-serif',
        fontSize: '11px',
        color: '#fff2c4',
        stroke: '#061008',
        strokeThickness: 3,
      }).setDepth(-5).setAlpha(0.88);
    }
  }

  private createBattlefieldCover(stage: StageConfig): void {
    for (const encounter of stage.encounters) {
      encounter.enemies.forEach((spawn, index) => {
        const doorSide = index % 2 === 0 ? -1 : 1;
        const concrete = spawn.kind === 'turret' || index % 4 === 3;
        const width = concrete ? 82 : 72;
        const height = concrete ? 58 : 52;
        const housePosition = this.findOpenCoverSpot(
          spawn.x + doorSide * Phaser.Math.Between(42, 74),
          Phaser.Math.Clamp(spawn.y + Phaser.Math.Between(-28, 28), 90, stage.worldHeight - 90),
          width,
          height,
          stage,
          12,
        );

        if (!housePosition) {
          return;
        }

        const house = this.createBlocker(
          housePosition.x,
          housePosition.y,
          width,
          height,
          concrete ? 0x777f86 : 0x5c4327,
          concrete ? 0.96 : 0.9,
          concrete ? 'BUNKER' : 'HUT',
        );
        const doorX = housePosition.x - doorSide * (width * 0.52);
        this.spawnDoors.set(spawn.id, {
          x: doorX,
          y: housePosition.y,
          house,
        });
      });
    }

    const treeCount = stage.theme === 'blacksite' ? 10 : 18;
    for (let index = 0; index < treeCount; index += 1) {
      const x = 220 + index * 135 + (index % 3) * 34;
      if (x > stage.bossTriggerX - 120) {
        continue;
      }

      const y = index % 2 === 0
        ? 120 + (index % 5) * 118
        : stage.worldHeight - 120 - (index % 5) * 110;
      const treePosition = this.findOpenCoverSpot(x, Phaser.Math.Clamp(y, 80, stage.worldHeight - 80), 62, 72, stage, 16);
      if (treePosition) {
        this.createTreeCover(treePosition.x, treePosition.y, stage);
      }
    }

    for (let index = 0; index < 4; index += 1) {
      const x = 620 + index * 460;
      const y = index % 2 === 0 ? stage.worldHeight * 0.32 : stage.worldHeight * 0.72;
      const concretePosition = this.findOpenCoverSpot(x, y, 96, 66, stage, 18);
      if (concretePosition) {
        this.createBlocker(concretePosition.x, concretePosition.y, 96, 66, 0x6f777b, 0.98, 'CONCRETE');
      }
    }
  }

  private findOpenCoverSpot(
    x: number,
    y: number,
    width: number,
    height: number,
    stage: StageConfig,
    padding: number,
  ): { x: number; y: number } | undefined {
    const offsets = [
      [0, 0],
      [0, -92],
      [0, 92],
      [-104, 0],
      [104, 0],
      [-86, -72],
      [86, 72],
      [86, -72],
      [-86, 72],
    ] as const;

    for (const [offsetX, offsetY] of offsets) {
      const candidateX = Phaser.Math.Clamp(x + offsetX, width * 0.5 + 24, stage.worldWidth - width * 0.5 - 24);
      const candidateY = Phaser.Math.Clamp(y + offsetY, height * 0.5 + 40, stage.worldHeight - height * 0.5 - 40);
      if (this.canPlaceRect(candidateX, candidateY, width, height, padding)) {
        return { x: candidateX, y: candidateY };
      }
    }

    return undefined;
  }

  private canPlaceRect(x: number, y: number, width: number, height: number, padding = 12): boolean {
    const candidate = new Phaser.Geom.Rectangle(
      x - width * 0.5 - padding,
      y - height * 0.5 - padding,
      width + padding * 2,
      height + padding * 2,
    );

    return this.obstacleBodies.every((obstacle) => !Phaser.Geom.Rectangle.Overlaps(candidate, obstacle.getBounds()));
  }

  private createBlocker(
    x: number,
    y: number,
    width: number,
    height: number,
    tint: number,
    alpha: number,
    label?: string,
  ): Phaser.GameObjects.Rectangle {
    const rect = this.add.rectangle(x, y, width, height, tint, alpha);
    rect.setDepth(5);
    rect.setStrokeStyle(2, 0xf0e1b6, 0.22);
    this.physics.add.existing(rect, true);
    this.obstacleBodies.push(rect);

    if (label) {
      this.add.text(x, y - 5, label, {
        fontFamily: 'Bahnschrift, Trebuchet MS, sans-serif',
        fontSize: '9px',
        color: '#efe4c3',
      }).setOrigin(0.5).setDepth(6).setAlpha(0.62);
    }

    return rect;
  }

  private createTreeCover(x: number, y: number, stage: StageConfig): void {
    const trunk = this.add.rectangle(x, y + 4, 52, 58, 0x4c321e, 0.38);
    trunk.setDepth(5);
    this.physics.add.existing(trunk, true);
    this.obstacleBodies.push(trunk);

    const canopyTint = stage.theme === 'river' ? 0x2d6d42 : 0x2f7b35;
    for (const [offsetX, offsetY, radius] of [[0, -20, 34], [-22, -6, 25], [22, -4, 25], [0, 8, 28]] as const) {
      this.add.circle(x + offsetX, y + offsetY, radius, canopyTint, 0.78)
        .setDepth(6)
        .setStrokeStyle(2, 0x153f1d, 0.4);
    }
  }

  private createWeaponPickups(stage: StageConfig): void {
    const pickups: Array<{ kind: WeaponKind; x: number; y: number }> = [
      { kind: 'shotgun', x: 390, y: stage.worldHeight * 0.5 },
      { kind: 'flame', x: Math.floor(stage.worldWidth * 0.42), y: stage.worldHeight * 0.5 - 120 },
      { kind: 'sniper', x: Math.floor(stage.worldWidth * 0.52), y: stage.worldHeight * 0.5 + 120 },
      { kind: 'explosiveArrow', x: Math.floor(stage.worldWidth * 0.58), y: stage.worldHeight * 0.5 - 150 },
      { kind: 'missile', x: Math.floor(stage.worldWidth * 0.62), y: stage.worldHeight * 0.5 - 40 },
      { kind: 'launcher', x: Math.floor(stage.worldWidth * 0.66), y: stage.worldHeight * 0.5 + 110 },
      { kind: 'laser', x: Math.floor(stage.worldWidth * 0.73), y: stage.worldHeight * 0.5 - 130 },
    ];

    for (const pickup of pickups) {
      const spec = WEAPONS[pickup.kind];
      const position = this.findOpenCoverSpot(pickup.x, pickup.y, 52, 34, stage, 12) ?? pickup;
      const crate = this.add.rectangle(position.x, position.y, 52, 34, spec.tint, 0.92);
      crate.setDepth(9);
      crate.setStrokeStyle(2, 0xffffff, 0.34);
      crate.setData('weaponKind', pickup.kind);
      this.physics.add.existing(crate, true);
      this.weaponPickups?.add(crate);

      const label = this.add.text(position.x, position.y - 2, spec.label.toUpperCase(), {
        fontFamily: 'Bahnschrift, Trebuchet MS, sans-serif',
        fontSize: '7px',
        color: '#09100b',
      }).setOrigin(0.5).setDepth(10);
      crate.setData('labelObject', label);
    }
  }

  private createPlayers(playerCount: 1 | 2): void {
    for (let index = 0; index < playerCount; index += 1) {
      const playerId = (index + 1) as 1 | 2;
      const scheme = CONTROL_SCHEMES[playerId];
      const yOffset = playerCount === 2 ? (index === 0 ? -52 : 52) : 0;
      const sprite = this.physics.add.sprite(140, (this.stage?.worldHeight ?? 0) * 0.5 + yOffset, 'player-idle', 0);
      sprite.setDepth(12);
      sprite.setDrag(900, 900);
      sprite.setCollideWorldBounds(true);
      sprite.setData('actorKind', 'player');
      sprite.play(animationKey('player-idle'));
      this.configureBody(sprite, 20, 16);

      const player: PlayerUnit = {
        id: playerId,
        label: scheme.callsign,
        accent: scheme.accent,
        tint: scheme.tint,
        sprite,
        health: 100,
        maxHealth: 100,
        bombs: 3,
        alive: true,
        moveSpeed: 220,
        walkSpeed: 150,
        crawlSpeed: 92,
        jumpSpeed: 320,
        fireRate: 170,
        bulletSpeed: 420,
        damage: 55,
        nextFireAt: 0,
        nextSpecialAt: 0,
        jumpReadyAt: 0,
        jumpUntil: 0,
        fireVisualUntil: 0,
        contactReadyAt: 0,
        weaponIndex: 0,
        weapons: ['rifle'],
        ammo: {
          rifle: -1,
          shotgun: 0,
          flame: 0,
          launcher: 0,
          sniper: 0,
          explosiveArrow: 0,
          missile: 0,
          laser: 0,
        },
        aim: new Phaser.Math.Vector2(1, 0),
        jumpVector: new Phaser.Math.Vector2(1, 0),
        virtualControlId: playerId === 1 ? 1 : undefined,
        controls: {
          up: this.input.keyboard!.addKey(scheme.keys.up),
          down: this.input.keyboard!.addKey(scheme.keys.down),
          left: this.input.keyboard!.addKey(scheme.keys.left),
          right: this.input.keyboard!.addKey(scheme.keys.right),
          crouch: this.input.keyboard!.addKey(scheme.keys.crouch),
          jump: this.input.keyboard!.addKey(scheme.keys.jump),
          fire: this.input.keyboard!.addKey(scheme.keys.fire),
          special: this.input.keyboard!.addKey(scheme.keys.special),
        },
      };

      sprite.setData('actor', player);
      this.players.push(player);
      this.playerGroup?.add(sprite);
    }
  }

  private configureBody(sprite: Phaser.Physics.Arcade.Sprite, width: number, height: number): void {
    const body = sprite.body as Phaser.Physics.Arcade.Body;
    body.setSize(width, height);
    body.setOffset((sprite.width - width) * 0.5, (sprite.height - height) * 0.5);
  }

  private setupColliders(): void {
    for (const obstacle of this.obstacleBodies) {
      this.physics.add.collider(this.playerGroup!, obstacle);
      this.physics.add.collider(this.enemyGroup!, obstacle);
      this.physics.add.collider(this.bossGroup!, obstacle);
      this.physics.add.collider(this.playerBullets!, obstacle, (bullet) => {
        this.destroyBulletObject(bullet as Phaser.GameObjects.GameObject);
      });
      this.physics.add.collider(this.enemyBullets!, obstacle, (bullet) => {
        this.destroyBulletObject(bullet as Phaser.GameObjects.GameObject);
      });
    }

    this.physics.add.overlap(this.playerBullets!, this.enemyGroup!, (bullet, enemy) => {
      this.handleEnemyHit(bullet as Phaser.GameObjects.GameObject, enemy as Phaser.GameObjects.GameObject);
    });
    this.physics.add.overlap(this.playerBullets!, this.bossGroup!, (bullet, boss) => {
      this.handleBossHit(bullet as Phaser.GameObjects.GameObject, boss as Phaser.GameObjects.GameObject);
    });
    this.physics.add.overlap(this.enemyBullets!, this.playerGroup!, (bullet, player) => {
      this.handlePlayerHit(bullet as Phaser.GameObjects.GameObject, player as Phaser.GameObjects.GameObject);
    });
    this.physics.add.overlap(this.playerGroup!, this.enemyGroup!, (player, enemy) => {
      this.handleEnemyContact(player as Phaser.GameObjects.GameObject, enemy as Phaser.GameObjects.GameObject);
    });
    this.physics.add.overlap(this.playerGroup!, this.bossGroup!, (player, boss) => {
      this.handleBossContact(player as Phaser.GameObjects.GameObject, boss as Phaser.GameObjects.GameObject);
    });
    this.physics.add.overlap(this.playerGroup!, this.weaponPickups!, (player, pickup) => {
      this.handleWeaponPickup(player as Phaser.GameObjects.GameObject, pickup as Phaser.GameObjects.GameObject);
    });
  }

  private createOverlayText(): void {
    this.objectivePanel = this.add.image(0, 0, 'objective-plaque')
      .setScrollFactor(0)
      .setDepth(59)
      .setAlpha(0);

    this.bannerText = this.add.text(36, 28, '', {
      fontFamily: 'Impact, Haettenschweiler, sans-serif',
      fontSize: '34px',
      color: '#f4e8c3',
      letterSpacing: 2,
      align: 'center',
    }).setScrollFactor(0).setDepth(60).setOrigin(0.5);
    this.bannerText.setAlpha(0);

    this.reticleText = this.add.text(36, 72, '', {
      fontFamily: 'Bahnschrift, Trebuchet MS, sans-serif',
      fontSize: '19px',
      color: '#f3e6bf',
      wordWrap: { width: 520 },
      align: 'center',
    }).setScrollFactor(0).setDepth(60).setOrigin(0.5);
    this.reticleText.setAlpha(0);
    this.layoutOverlayText();

    this.scale.off(Phaser.Scale.Events.RESIZE, this.layoutOverlayText, this);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layoutOverlayText, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.layoutOverlayText, this);
    });
  }

  private layoutOverlayText(): void {
    if (!this.bannerText?.active || !this.reticleText?.active) {
      return;
    }

    const compact = this.scale.width <= 900;
    const x = this.scale.width * 0.5;
    const panelY = compact ? 116 : 100;
    const bannerY = compact ? panelY - 26 : panelY - 30;
    const reticleY = compact ? panelY + 22 : panelY + 24;
    const wrapWidth = compact
      ? Math.max(240, Math.min(this.scale.width - 28, 560))
      : 620;

    this.objectivePanel?.setPosition(x, panelY);
    if (this.objectivePanel) {
      this.objectivePanel.displayWidth = Math.min(this.scale.width - 28, compact ? 560 : 720);
      this.objectivePanel.displayHeight = compact ? 118 : 132;
    }

    this.bannerText.setPosition(x, bannerY);
    this.bannerText.setFontSize(compact ? '28px' : '40px');
    this.bannerText.setWordWrapWidth(wrapWidth);

    this.reticleText.setPosition(x, reticleY);
    this.reticleText.setFontSize(compact ? '16px' : '19px');
    this.reticleText.setWordWrapWidth(wrapWidth);
  }

  private applyResponsiveCamera(): void {
    const width = Math.max(1, this.scale.width);
    const height = Math.max(1, this.scale.height);
    const portrait = height > width;
    const targetWidth = portrait ? 1000 : 1100;
    const minZoom = portrait ? 0.44 : 0.72;
    const zoom = width > 960 && height > 620
      ? 1
      : Phaser.Math.Clamp(width / targetWidth, minZoom, 1);

    this.cameras.main.setZoom(zoom);
    const stage = this.stage ?? this.director.getSnapshot().currentStage;
    this.cameras.main.setBounds(
      0,
      0,
      stage.worldWidth,
      Math.max(stage.worldHeight, this.getVisibleWorldHeight(zoom)),
    );
    this.layoutOverlayText();
  }

  private getVisibleWorldHeight(zoom = this.cameras.main.zoom): number {
    return Math.max(1, this.scale.height) / Math.max(0.1, zoom);
  }

  private updatePlayers(time: number): void {
    for (const player of this.players) {
      if (!player.alive) {
        player.sprite.setVelocity(0, 0);
        player.sprite.setScale(1);
        continue;
      }

      const movement = this.getMovementInput(player);
      const wantsFire = this.isActionDown(player, 'fire');
      const isJumping = time < player.jumpUntil;

      if (movement.lengthSq() > 0) {
        movement.normalize();
        if (!isJumping) {
          player.aim.copy(movement);
        }
      }

      if (this.wasActionPressed(player, 'jump') && time >= player.jumpReadyAt) {
        const jumpVector = movement.lengthSq() > 0 ? movement.clone() : player.aim.clone();
        if (jumpVector.lengthSq() === 0) {
          jumpVector.set(1, 0);
        }
        jumpVector.normalize();
        player.jumpVector.copy(jumpVector);
        player.jumpUntil = time + 340;
        player.jumpReadyAt = time + 950;
        player.aim.copy(jumpVector);
      }

      if (this.wasActionPressed(player, 'crouch')) {
        this.switchWeapon(player);
      }

      const nowJumping = time < player.jumpUntil;
      let animation = animationKey('player-idle');
      let speed = player.moveSpeed;

      if (nowJumping) {
        const remaining = Math.max(0, player.jumpUntil - time) / 340;
        const jumpSpeed = player.jumpSpeed * (0.45 + remaining * 0.55);
        player.sprite.setVelocity(player.jumpVector.x * jumpSpeed, player.jumpVector.y * jumpSpeed);
        player.sprite.setScale(1.08);
        animation = animationKey('player-jump');
      } else {
        player.sprite.setScale(1);
        if (movement.lengthSq() > 0) {
          speed = wantsFire ? player.walkSpeed : player.moveSpeed;
          player.sprite.setVelocity(movement.x * speed, movement.y * speed);
          animation = wantsFire ? animationKey('player-walk') : animationKey('player-run');
        } else {
          player.sprite.setVelocity(0, 0);
          animation = time < player.fireVisualUntil ? animationKey('player-fire') : animationKey('player-idle');
        }
      }

      if (wantsFire && time >= player.nextFireAt) {
        this.firePlayerWeapon(player, time);
      }

      if (this.wasActionPressed(player, 'special') && time >= player.nextSpecialAt && player.bombs > 0) {
        this.activateBarrage(player, time);
      }

      player.sprite.setRotation(player.aim.angle());
      this.playLoop(player.sprite, animation);
    }
  }

  private getMovementInput(player: PlayerUnit): Phaser.Math.Vector2 {
    const axis = player.virtualControlId ? this.virtualGamepad.getAxis(player.virtualControlId) : { x: 0, y: 0 };
    const keyboardX = (player.controls.left.isDown ? -1 : 0) + (player.controls.right.isDown ? 1 : 0);
    const keyboardY = (player.controls.up.isDown ? -1 : 0) + (player.controls.down.isDown ? 1 : 0);
    const movement = new Phaser.Math.Vector2(
      Phaser.Math.Clamp(axis.x + keyboardX, -1, 1),
      Phaser.Math.Clamp(axis.y + keyboardY, -1, 1),
    );

    if (movement.lengthSq() > 1) {
      movement.normalize();
    }

    return movement;
  }

  private isActionDown(player: PlayerUnit, action: Extract<GameAction, 'fire'>): boolean {
    const touchActive = player.virtualControlId ? this.virtualGamepad.isDown(player.virtualControlId, action) : false;
    return player.controls[action].isDown || touchActive;
  }

  private wasActionPressed(player: PlayerUnit, action: Extract<GameAction, 'crouch' | 'jump' | 'special'>): boolean {
    const keyPressed = Phaser.Input.Keyboard.JustDown(player.controls[action]);
    const touchPressed = player.virtualControlId
      ? this.virtualGamepad.consumeJustPressed(player.virtualControlId, action)
      : false;
    return keyPressed || touchPressed;
  }

  private updateEnemies(time: number): void {
    for (const enemy of this.enemies) {
      if (!enemy.alive) {
        continue;
      }

      const target = this.closestLivingPlayer(enemy.sprite.x, enemy.sprite.y);
      if (!target) {
        enemy.sprite.setVelocity(0, 0);
        continue;
      }

      const direction = new Phaser.Math.Vector2(target.sprite.x - enemy.sprite.x, target.sprite.y - enemy.sprite.y);
      const distance = direction.length();
      direction.normalize();
      enemy.sprite.setRotation(direction.angle());
      const hasSight = this.hasLineOfSight(enemy.sprite.x, enemy.sprite.y, target.sprite.x, target.sprite.y);

      if (!hasSight) {
        enemy.sprite.setVelocity(0, 0);
        this.playLoop(enemy.sprite, animationKey(getEnemyTextureKey(enemy.theme, enemy.kind, 'stand')));
        continue;
      }

      if (enemy.kind === 'turret') {
        enemy.sprite.setVelocity(0, 0);
      } else {
        const desiredRange = enemy.kind === 'rocketeer' ? 280 : 190;
        const advance = distance > desiredRange ? 0.72 : distance < desiredRange * 0.45 ? -0.25 : 0;
        const strafe = Math.sin(time / 520 + enemy.behaviorOffset) * 0.28;
        const side = new Phaser.Math.Vector2(-direction.y, direction.x).scale(strafe);
        const move = direction.clone().scale(advance).add(side);
        if (move.lengthSq() > 0) {
          move.normalize();
          enemy.sprite.setVelocity(move.x * enemy.moveSpeed, move.y * enemy.moveSpeed);
        } else {
          enemy.sprite.setVelocity(0, 0);
        }
      }

      const fireRange = enemy.kind === 'rocketeer' ? 470 : 360;
      if (distance <= fireRange && time >= enemy.nextFireAt) {
        const spread = enemy.kind === 'rocketeer' ? 0.12 : 0.05;
        this.fireEnemyBullet(
          enemy.sprite.x + direction.x * 14,
          enemy.sprite.y + direction.y * 14,
          direction.clone().rotate(Phaser.Math.FloatBetween(-spread, spread)),
          enemy.bulletSpeed,
          enemy.damage,
          enemy.kind === 'rocketeer' ? 0xff9359 : 0xff5b4a,
        );
        enemy.nextFireAt = time + enemy.fireRate;
        enemy.fireVisualUntil = time + 200;
      }

      const action = time < enemy.fireVisualUntil ? 'fire' : 'stand';
      this.playLoop(enemy.sprite, animationKey(getEnemyTextureKey(enemy.theme, enemy.kind, action)));
    }
  }

  private updateBoss(time: number): void {
    if (!this.boss || !this.boss.alive || !this.stage) {
      return;
    }

    const boss = this.boss;
    const sprite = boss.sprite;
    const target = this.closestLivingPlayer(sprite.x, sprite.y);
    if (!target) {
      sprite.setVelocity(0, 0);
      return;
    }

    const angle = Phaser.Math.Angle.Between(sprite.x, sprite.y, target.sprite.x, target.sprite.y);
    sprite.setRotation(angle);

    if (boss.config.kind === 'gunship') {
      if (sprite.x < this.stage.worldWidth - 470) {
        boss.direction = 1;
      } else if (sprite.x > this.stage.worldWidth - 120) {
        boss.direction = -1;
      }

      const desiredY = 220 + Math.sin(time / 450) * 90;
      sprite.setVelocity(boss.config.speed * boss.direction, Phaser.Math.Clamp((desiredY - sprite.y) * 2.2, -120, 120));
    } else if (boss.config.kind === 'barge') {
      if (sprite.y < 180) {
        boss.direction = 1;
      } else if (sprite.y > this.stage.worldHeight - 180) {
        boss.direction = -1;
      }

      sprite.setVelocity(Phaser.Math.Clamp((this.stage.worldWidth - 290 - sprite.x) * 0.2, -50, 50), boss.config.speed * boss.direction);
    } else {
      if (sprite.x < this.stage.worldWidth - 520) {
        boss.direction = 1;
      } else if (sprite.x > this.stage.worldWidth - 120) {
        boss.direction = -1;
      }

      sprite.setVelocity(boss.config.speed * boss.direction, Math.sin(time / 420) * 60);
    }

    if (time >= boss.nextFireAt) {
      this.fireBossPattern(boss, angle);
      boss.nextFireAt = time + boss.config.fireRate;
      boss.fireVisualUntil = time + 360;
    }

    if (boss.config.summonEveryMs && time >= boss.nextSummonAt) {
      this.summonBossSupport(boss);
      boss.nextSummonAt = time + boss.config.summonEveryMs;
    }

    if (time < boss.fireVisualUntil) {
      this.playLoop(sprite, animationKey(getBossTextureKey(boss.config.kind)));
    } else {
      this.stopAtFirstFrame(sprite);
    }
  }

  private drawEnemyVisionCones(): void {
    if (!this.visionGraphics) {
      return;
    }

    this.visionGraphics.clear();
    for (const enemy of this.enemies) {
      if (!enemy.alive || !enemy.sprite.active) {
        continue;
      }

      const range = enemy.kind === 'rocketeer' ? 470 : enemy.kind === 'turret' ? 420 : 360;
      const halfAngle = enemy.kind === 'turret' ? 0.3 : 0.42;
      const angle = enemy.sprite.rotation;
      const leftX = enemy.sprite.x + Math.cos(angle - halfAngle) * range;
      const leftY = enemy.sprite.y + Math.sin(angle - halfAngle) * range;
      const rightX = enemy.sprite.x + Math.cos(angle + halfAngle) * range;
      const rightY = enemy.sprite.y + Math.sin(angle + halfAngle) * range;
      const seesPlayer = this.players.some((player) => (
        player.alive
        && Phaser.Math.Distance.Between(enemy.sprite.x, enemy.sprite.y, player.sprite.x, player.sprite.y) <= range
        && this.hasLineOfSight(enemy.sprite.x, enemy.sprite.y, player.sprite.x, player.sprite.y)
        && Math.abs(Phaser.Math.Angle.Wrap(Phaser.Math.Angle.Between(enemy.sprite.x, enemy.sprite.y, player.sprite.x, player.sprite.y) - angle)) <= halfAngle
      ));

      this.visionGraphics.fillStyle(seesPlayer ? 0xff6b4a : 0xffd166, seesPlayer ? 0.18 : 0.11);
      this.visionGraphics.lineStyle(1, seesPlayer ? 0xff8a5c : 0xffd166, seesPlayer ? 0.22 : 0.14);
      this.visionGraphics.beginPath();
      this.visionGraphics.moveTo(enemy.sprite.x, enemy.sprite.y);
      this.visionGraphics.lineTo(leftX, leftY);
      this.visionGraphics.lineTo(rightX, rightY);
      this.visionGraphics.closePath();
      this.visionGraphics.fillPath();
      this.visionGraphics.strokePath();
    }
  }

  private updateCameraAnchor(): void {
    if (!this.cameraTarget) {
      return;
    }

    const living = this.players.filter((player) => player.alive);
    if (living.length === 0) {
      return;
    }

    const total = living.reduce(
      (sum, player) => ({ x: sum.x + player.sprite.x, y: sum.y + player.sprite.y }),
      { x: 0, y: 0 },
    );

    this.cameraTarget.setPosition(total.x / living.length, total.y / living.length);
  }

  private checkEncounterTriggers(): void {
    if (!this.stage) {
      return;
    }

    const leadX = this.players
      .filter((player) => player.alive)
      .reduce((max, player) => Math.max(max, player.sprite.x), 0);

    const nextEncounter = this.encounterStates.find((state) => !state.triggered);
    if (nextEncounter && leadX >= nextEncounter.config.triggerX) {
      this.triggerEncounter(nextEncounter);
    }

    for (const state of this.encounterStates) {
      if (!state.triggered || state.cleared || state.remaining > 0) {
        continue;
      }

      state.cleared = true;
      this.encounterCount += 1;
      this.activeEncounterLabel = `${state.config.label} secure`;
      for (const player of this.players) {
        if (player.alive) {
          player.bombs = Math.min(player.bombs + 1, 5);
        }
      }
      this.showBanner('Zone clear. Air Strike restocked.', '#f1d486');
    }

    this.allEncountersCleared = this.encounterStates.every((state) => state.cleared);
    if (this.allEncountersCleared && !this.bossSpawned) {
      this.activeEncounterLabel = 'Advance to the boss zone';
    }

    if (this.allEncountersCleared && !this.bossSpawned && leadX >= this.stage.bossTriggerX) {
      this.spawnBoss();
    }
  }

  private triggerEncounter(state: EncounterState): void {
    state.triggered = true;
    state.remaining = state.config.enemies.length;
    this.activeEncounterLabel = state.config.label;
    this.showBanner(state.config.label, '#f3d088');

    state.config.enemies.forEach((spawn, index) => {
      const door = this.spawnDoors.get(spawn.id);
      this.time.delayedCall(index * 360, () => {
        this.spawnEnemy(spawn.kind, spawn.id, door?.x ?? spawn.x, door?.y ?? spawn.y, state.config.id, spawn.x, spawn.y);
      });
      if (door) {
        this.flashSpawnDoor(door);
      }
    });
  }

  private flashSpawnDoor(door: SpawnDoor): void {
    this.tweens.add({
      targets: door.house,
      alpha: 0.55,
      duration: 120,
      yoyo: true,
      repeat: 1,
      ease: 'Sine.easeInOut',
    });
  }

  private spawnEnemy(
    kind: EnemyKind,
    id: string,
    x: number,
    y: number,
    encounterId: string,
    targetX = x,
    targetY = y,
  ): void {
    if (!this.playing && encounterId !== 'boss-support') {
      return;
    }
    const theme = this.stage?.theme ?? 'emerald';
    const sprite = this.physics.add.sprite(x, y, getEnemyTextureKey(theme, kind, 'stand'), 0);
    sprite.setDepth(kind === 'turret' ? 8 : 11);
    sprite.setCollideWorldBounds(true);
    this.configureBody(sprite, kind === 'turret' ? 20 : 16, kind === 'turret' ? 14 : 14);

    const enemy: EnemyUnit = {
      id,
      kind,
      theme,
      sprite,
      health: kind === 'turret' ? 130 : kind === 'rocketeer' ? 85 : 50,
      maxHealth: kind === 'turret' ? 130 : kind === 'rocketeer' ? 85 : 50,
      alive: true,
      moveSpeed: kind === 'rocketeer' ? 48 : kind === 'turret' ? 0 : 62,
      fireRate: kind === 'rocketeer' ? 1400 : kind === 'turret' ? 1050 : 900,
      bulletSpeed: kind === 'rocketeer' ? 265 : kind === 'turret' ? 340 : 300,
      damage: kind === 'rocketeer' ? 18 : kind === 'turret' ? 12 : 10,
      nextFireAt: this.time.now + Phaser.Math.Between(250, 850),
      fireVisualUntil: 0,
      contactReadyAt: 0,
      encounterId,
      behaviorOffset: Phaser.Math.FloatBetween(0, Math.PI * 2),
    };

    sprite.setData('actorKind', 'enemy');
    sprite.setData('actor', enemy);
    sprite.play(animationKey(getEnemyTextureKey(theme, kind, 'stand')));
    this.enemies.push(enemy);
    this.enemyGroup?.add(sprite);

    if (targetX !== x || targetY !== y) {
      sprite.setAlpha(0.35);
      const body = sprite.body as Phaser.Physics.Arcade.Body;
      body.enable = false;
      this.tweens.add({
        targets: sprite,
        x: targetX,
        y: targetY,
        alpha: 1,
        duration: 520,
        ease: 'Sine.easeOut',
        onComplete: () => {
          if (sprite.active) {
            const activeBody = sprite.body as Phaser.Physics.Arcade.Body;
            activeBody.enable = true;
            activeBody.reset(sprite.x, sprite.y);
          }
        },
      });
    }
  }

  private spawnBoss(): void {
    if (!this.stage) {
      return;
    }

    const config = this.stage.boss;
    const sprite = this.physics.add.sprite(config.x, config.y, getBossTextureKey(config.kind), 0);
    sprite.setDepth(13);
    sprite.setCollideWorldBounds(true);
    this.configureBody(sprite, 72, 40);
    sprite.setFrame(0);

    this.boss = {
      config,
      sprite,
      health: config.health,
      maxHealth: config.health,
      alive: true,
      nextFireAt: this.time.now + 600,
      nextSummonAt: this.time.now + (config.summonEveryMs ?? 999999),
      fireVisualUntil: 0,
      contactReadyAt: 0,
      direction: -1,
    };

    sprite.setData('actorKind', 'boss');
    sprite.setData('actor', this.boss);
    this.bossGroup?.add(sprite);
    this.bossSpawned = true;
    this.activeEncounterLabel = `Boss inbound: ${config.name}`;
    this.showBanner(`Boss lock: ${config.name}`, '#ffab7b');
  }

  private firePlayerWeapon(player: PlayerUnit, time: number): void {
    const direction = player.aim.clone();

    if (direction.lengthSq() === 0) {
      direction.set(1, 0);
    }

    direction.normalize();
    player.aim.copy(direction);
    const weapon = this.getCurrentWeapon(player);
    if (!this.consumeWeaponAmmo(player, weapon, time)) {
      return;
    }

    player.fireVisualUntil = time + 180;
    const muzzle = this.findClearBulletStart(
      player.sprite.x + direction.x * 26,
      player.sprite.y + direction.y * 26,
      direction,
    );
    const startX = muzzle.x;
    const startY = muzzle.y;
    this.createMuzzleFlash(startX, startY, direction, weapon.tint);

    if (weapon.kind === 'laser') {
      this.fireLaserBeam(startX, startY, direction, weapon);
      player.nextFireAt = time + weapon.fireRate;
      return;
    }

    const pelletCount = weapon.pellets;
    for (let pellet = 0; pellet < pelletCount; pellet += 1) {
      const offset = pelletCount === 1
        ? 0
        : Phaser.Math.Linear(-weapon.spread, weapon.spread, pellet / (pelletCount - 1));
      const pelletDirection = direction.clone().rotate(offset + Phaser.Math.FloatBetween(-weapon.spread * 0.15, weapon.spread * 0.15));
      this.firePlayerBullet(
        startX,
        startY,
        pelletDirection,
        weapon.bulletSpeed,
        weapon.damage,
        weapon.tint,
        weapon.maxDistance,
        weapon.scaleX,
        weapon.scaleY,
        weapon.splashRadius,
        weapon.splashDamage,
        weapon.pierceCount,
        weapon.dropStartRatio,
        weapon.tracerDistance,
      );
    }
    player.nextFireAt = time + weapon.fireRate;
  }

  private findClearBulletStart(x: number, y: number, direction: Phaser.Math.Vector2): { x: number; y: number } {
    for (let step = 0; step < 8; step += 1) {
      const candidateX = x + direction.x * step * 14;
      const candidateY = y + direction.y * step * 14;
      const blocked = this.obstacleBodies.some((obstacle) => {
        const bounds = obstacle.getBounds();
        Phaser.Geom.Rectangle.Inflate(bounds, 8, 8);
        return bounds.contains(candidateX, candidateY);
      });

      if (!blocked) {
        return { x: candidateX, y: candidateY };
      }
    }

    return { x, y };
  }

  private getCurrentWeapon(player: PlayerUnit): WeaponSpec {
    return WEAPONS[player.weapons[player.weaponIndex] ?? 'rifle'];
  }

  private getAmmoLabel(player: PlayerUnit, weaponKind: WeaponKind): string {
    const weapon = WEAPONS[weaponKind];
    if (weapon.maxAmmo < 0) {
      return 'inf';
    }

    return String(Math.max(0, player.ammo[weaponKind] ?? 0));
  }

  private consumeWeaponAmmo(player: PlayerUnit, weapon: WeaponSpec, time: number): boolean {
    if (weapon.maxAmmo < 0 || weapon.ammoCost <= 0) {
      return true;
    }

    const available = player.ammo[weapon.kind] ?? 0;
    if (available >= weapon.ammoCost) {
      player.ammo[weapon.kind] = available - weapon.ammoCost;
      return true;
    }

    player.nextFireAt = time + 340;
    this.showBanner(`${weapon.label} empty. Switching to Rifle.`, player.accent);
    player.weaponIndex = Math.max(0, player.weapons.indexOf('rifle'));
    this.emitHud('live');
    return false;
  }

  private switchWeapon(player: PlayerUnit): void {
    if (player.weapons.length <= 1) {
      this.showBanner('Find weapon crates to unlock more guns.', player.accent);
      return;
    }

    for (let step = 1; step <= player.weapons.length; step += 1) {
      const nextIndex = (player.weaponIndex + step) % player.weapons.length;
      const nextWeapon = WEAPONS[player.weapons[nextIndex]];
      if (nextWeapon.maxAmmo < 0 || (player.ammo[nextWeapon.kind] ?? 0) > 0) {
        player.weaponIndex = nextIndex;
        break;
      }
    }
    this.showBanner(`${player.label} switched to ${this.getCurrentWeapon(player).label}`, player.accent);
    this.emitHud('live');
  }

  private activateBarrage(player: PlayerUnit, time: number): void {
    player.bombs -= 1;
    player.nextSpecialAt = time + 2600;

    const blast = this.add.image(player.sprite.x, player.sprite.y, 'blast-circle');
    blast.setTint(player.tint);
    blast.setAlpha(0.35);
    blast.setDepth(18);
    blast.setScale(0.1);

    this.tweens.add({
      targets: blast,
      scale: 16,
      alpha: 0,
      duration: 260,
      onComplete: () => blast.destroy(),
    });

    this.cameras.main.shake(120, 0.005);
    for (const enemy of this.enemies) {
      if (enemy.alive && Phaser.Math.Distance.Between(player.sprite.x, player.sprite.y, enemy.sprite.x, enemy.sprite.y) < 220) {
        this.damageEnemy(enemy, 70);
      }
    }

    if (this.boss && this.boss.alive && Phaser.Math.Distance.Between(player.sprite.x, player.sprite.y, this.boss.sprite.x, this.boss.sprite.y) < 260) {
      this.damageBoss(this.boss, 60);
    }
  }

  private firePlayerBullet(
    x: number,
    y: number,
    direction: Phaser.Math.Vector2,
    speed: number,
    damage: number,
    tint: number,
    maxDistance: number,
    scaleX: number,
    scaleY: number,
    splashRadius?: number,
    splashDamage?: number,
    pierceCount?: number,
    dropStartRatio?: number,
    tracerDistance?: number,
  ): void {
    const bullet = this.physics.add.image(x, y, 'bullet-shell');
    bullet.setTint(tint);
    bullet.setDepth(16);
    bullet.setScale(scaleX, scaleY);
    bullet.setBlendMode(Phaser.BlendModes.ADD);
    bullet.setData('baseScaleX', bullet.scaleX);
    bullet.setData('baseScaleY', bullet.scaleY);
    bullet.setData('baseTint', tint);
    this.configureBulletBody(bullet, direction, speed, maxDistance, dropStartRatio);
    bullet.setRotation(direction.angle());
    bullet.setData('damage', damage);
    bullet.setData('splashRadius', splashRadius ?? 0);
    bullet.setData('splashDamage', splashDamage ?? 0);
    bullet.setData('splashTint', tint);
    bullet.setData('pierceRemaining', pierceCount ?? 1);
    bullet.setData('hitTargets', []);
    bullet.setData('expiry', this.time.now + (pierceCount && pierceCount > 1 ? 4200 : 2600));
    this.playerBullets?.add(bullet);
    this.createBulletTracer(x, y, direction, tint, tracerDistance ?? Math.min(340, maxDistance * 0.46), 520);
  }

  private fireLaserBeam(
    x: number,
    y: number,
    direction: Phaser.Math.Vector2,
    weapon: WeaponSpec,
  ): void {
    const endX = x + direction.x * weapon.maxDistance;
    const endY = y + direction.y * weapon.maxDistance;
    const beam = this.add.rectangle(
      x + direction.x * weapon.maxDistance * 0.5,
      y + direction.y * weapon.maxDistance * 0.5,
      weapon.maxDistance,
      weapon.beamWidth ?? 24,
      weapon.tint,
      0.62,
    );
    beam.setDepth(17);
    beam.setOrigin(0.5);
    beam.setRotation(direction.angle());
    beam.setBlendMode(Phaser.BlendModes.ADD);

    const core = this.add.rectangle(
      x + direction.x * weapon.maxDistance * 0.5,
      y + direction.y * weapon.maxDistance * 0.5,
      weapon.maxDistance,
      Math.max(6, (weapon.beamWidth ?? 24) * 0.32),
      0xffffff,
      0.78,
    );
    core.setDepth(18);
    core.setOrigin(0.5);
    core.setRotation(direction.angle());
    core.setBlendMode(Phaser.BlendModes.ADD);

    this.tweens.add({
      targets: [beam, core],
      alpha: 0,
      duration: 170,
      ease: 'Quad.easeOut',
      onComplete: () => {
        beam.destroy();
        core.destroy();
      },
    });

    this.damageActorsAlongBeam(x, y, endX, endY, weapon);
  }

  private damageActorsAlongBeam(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    weapon: WeaponSpec,
  ): void {
    const beamWidth = weapon.beamWidth ?? 24;

    for (const enemy of this.enemies) {
      if (!enemy.alive) {
        continue;
      }

      const distance = this.distanceToLineSegment(enemy.sprite.x, enemy.sprite.y, startX, startY, endX, endY);
      if (distance <= beamWidth * 0.5 + 14) {
        this.createHitSpark(enemy.sprite.x, enemy.sprite.y, weapon.tint, `-${weapon.damage}`);
        this.damageEnemy(enemy, weapon.damage);
      }
    }

    if (this.boss?.alive) {
      const distance = this.distanceToLineSegment(this.boss.sprite.x, this.boss.sprite.y, startX, startY, endX, endY);
      if (distance <= beamWidth * 0.5 + 42) {
        this.createHitSpark(this.boss.sprite.x, this.boss.sprite.y, weapon.tint, `-${weapon.damage}`);
        this.damageBoss(this.boss, weapon.damage);
      }
    }
  }

  private createMuzzleFlash(
    x: number,
    y: number,
    direction: Phaser.Math.Vector2,
    tint: number,
  ): void {
    const flash = this.add.circle(x + direction.x * 8, y + direction.y * 8, 10, tint, 0.72);
    flash.setDepth(18);
    flash.setBlendMode(Phaser.BlendModes.ADD);

    this.tweens.add({
      targets: flash,
      scale: 1.9,
      alpha: 0,
      duration: 90,
      ease: 'Quad.easeOut',
      onComplete: () => flash.destroy(),
    });
  }

  private createBulletTracer(
    x: number,
    y: number,
    direction: Phaser.Math.Vector2,
    tint: number,
    distance: number,
    duration: number,
  ): void {
    const tracer = this.add.rectangle(
      x - direction.x * 8,
      y - direction.y * 8,
      28,
      5,
      tint,
      0.55,
    );
    tracer.setDepth(15);
    tracer.setRotation(direction.angle());
    tracer.setBlendMode(Phaser.BlendModes.ADD);

    this.tweens.add({
      targets: tracer,
      x: x + direction.x * distance,
      y: y + direction.y * distance,
      alpha: 0,
      duration,
      ease: 'Quad.easeOut',
      onComplete: () => tracer.destroy(),
    });
  }

  private fireEnemyBullet(
    x: number,
    y: number,
    direction: Phaser.Math.Vector2,
    speed: number,
    damage: number,
    tint: number,
  ): void {
    const bullet = this.physics.add.image(x, y, 'bullet-shell');
    bullet.setTint(tint);
    bullet.setDepth(15);
    bullet.setScale(1.45, 1.15);
    bullet.setBlendMode(Phaser.BlendModes.ADD);
    bullet.setData('baseScaleX', bullet.scaleX);
    bullet.setData('baseScaleY', bullet.scaleY);
    bullet.setData('baseTint', tint);
    this.configureBulletBody(bullet, direction, speed, 720);
    bullet.setRotation(direction.angle());
    bullet.setData('damage', damage);
    bullet.setData('expiry', this.time.now + 2200);
    this.enemyBullets?.add(bullet);
    this.createMuzzleFlash(x, y, direction, tint);
    this.createBulletTracer(x, y, direction, tint, 180, 360);
  }

  private configureBulletBody(
    bullet: Phaser.Physics.Arcade.Image,
    direction: Phaser.Math.Vector2,
    speed: number,
    maxDistance: number,
    dropStartRatio = 0.78,
  ): void {
    const body = bullet.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setSize(10, 5);
    body.setOffset((bullet.width - 10) * 0.5, (bullet.height - 5) * 0.5);
    body.setVelocity(0, 0);
    bullet.setData('originX', bullet.x);
    bullet.setData('originY', bullet.y);
    bullet.setData('velocityX', direction.x * speed);
    bullet.setData('velocityY', direction.y * speed);
    bullet.setData('maxDistance', maxDistance);
    bullet.setData('baseMaxDistance', maxDistance);
    bullet.setData('baseDropStartRatio', dropStartRatio);
    bullet.setData('dropStartDistance', maxDistance * dropStartRatio);
  }

  private fireBossPattern(boss: BossUnit, baseAngle: number): void {
    if (boss.config.kind === 'gunship') {
      for (const offset of [-0.3, -0.15, 0, 0.15, 0.3]) {
        this.fireEnemyBullet(
          boss.sprite.x + Math.cos(baseAngle) * 30,
          boss.sprite.y + Math.sin(baseAngle) * 30,
          new Phaser.Math.Vector2(1, 0).setToPolar(baseAngle + offset, 1),
          boss.config.bulletSpeed,
          12,
          0xff8a6f,
        );
      }
      return;
    }

    if (boss.config.kind === 'barge') {
      for (let step = 0; step < 6; step += 1) {
        const angle = baseAngle - 0.35 + step * 0.14;
        this.fireEnemyBullet(
          boss.sprite.x + Math.cos(angle) * 28,
          boss.sprite.y + Math.sin(angle) * 28,
          new Phaser.Math.Vector2(1, 0).setToPolar(angle, 1),
          boss.config.bulletSpeed,
          14,
          0x9cf5f3,
        );
      }
      return;
    }

    for (const offset of [-0.18, 0, 0.18]) {
      const angle = baseAngle + offset;
      this.fireEnemyBullet(
        boss.sprite.x + Math.cos(angle) * 34,
        boss.sprite.y + Math.sin(angle) * 34,
        new Phaser.Math.Vector2(1, 0).setToPolar(angle, 1),
        boss.config.bulletSpeed,
        18,
        0xff8457,
      );
    }
  }

  private summonBossSupport(boss: BossUnit): void {
    if (!this.stage) {
      return;
    }

    if (boss.config.kind === 'gunship') {
      this.spawnEnemy('rifleman', `support-${this.time.now}-a`, this.stage.worldWidth - 340, 520, 'boss-support');
      this.spawnEnemy('rifleman', `support-${this.time.now}-b`, this.stage.worldWidth - 280, 620, 'boss-support');
      this.showBanner('Gunship dropping reinforcements', '#ffb188');
      return;
    }

    if (boss.config.kind === 'barge') {
      this.spawnEnemy('rocketeer', `support-${this.time.now}-a`, this.stage.worldWidth - 340, 260, 'boss-support');
      this.spawnEnemy('rifleman', `support-${this.time.now}-b`, this.stage.worldWidth - 290, 720, 'boss-support');
      this.showBanner('River armor dispatching support', '#a4faf8');
      return;
    }

    this.spawnEnemy('rifleman', `support-${this.time.now}-a`, this.stage.worldWidth - 430, 240, 'boss-support');
    this.spawnEnemy('rifleman', `support-${this.time.now}-b`, this.stage.worldWidth - 430, 720, 'boss-support');
    this.spawnEnemy('rocketeer', `support-${this.time.now}-c`, this.stage.worldWidth - 350, 470, 'boss-support');
    this.showBanner('Command tank calling elite guard', '#ff9c75');
  }

  private handleEnemyHit(bulletObject: Phaser.GameObjects.GameObject, enemyObject: Phaser.GameObjects.GameObject): void {
    const bullet = bulletObject as Phaser.Physics.Arcade.Image;
    const enemy = enemyObject.getData('actor') as EnemyUnit | undefined;
    if (!enemy || !enemy.alive || !bullet.active) {
      return;
    }

    const hitTargets = (bullet.getData('hitTargets') as string[] | undefined) ?? [];
    if (hitTargets.includes(enemy.id)) {
      return;
    }

    hitTargets.push(enemy.id);
    bullet.setData('hitTargets', hitTargets);

    const damage = Number(bullet.getData('damage') ?? 15);
    const impactX = enemy.sprite.x;
    const impactY = enemy.sprite.y;
    this.createHitSpark(impactX, impactY, 0xfff0aa, `-${damage}`);
    this.damageEnemy(enemy, damage);

    const splashRadius = Number(bullet.getData('splashRadius') ?? 0);
    const pierceRemaining = Number(bullet.getData('pierceRemaining') ?? 1);
    if (splashRadius <= 0 && pierceRemaining > 1) {
      bullet.setData('pierceRemaining', pierceRemaining - 1);
      return;
    }

    this.resolvePlayerBulletImpact(bullet, impactX, impactY);
  }

  private handleBossHit(bulletObject: Phaser.GameObjects.GameObject, bossObject: Phaser.GameObjects.GameObject): void {
    const bullet = bulletObject as Phaser.Physics.Arcade.Image;
    const boss = bossObject.getData('actor') as BossUnit | undefined;
    if (!boss || !boss.alive || !bullet.active) {
      return;
    }

    const damage = Number(bullet.getData('damage') ?? 18);
    const impactX = boss.sprite.x;
    const impactY = boss.sprite.y;
    this.createHitSpark(impactX, impactY, 0xff8457, `-${damage}`);
    this.damageBoss(boss, damage);
    this.resolvePlayerBulletImpact(bullet, impactX, impactY);
  }

  private handlePlayerHit(bulletObject: Phaser.GameObjects.GameObject, playerObject: Phaser.GameObjects.GameObject): void {
    const bullet = bulletObject as Phaser.Physics.Arcade.Image;
    const player = playerObject.getData('actor') as PlayerUnit | undefined;
    if (!player || !player.alive || !bullet.active) {
      return;
    }

    const damage = Number(bullet.getData('damage') ?? 10);
    this.createHitSpark(player.sprite.x, player.sprite.y, 0xff5b4a);
    this.dropBullet(bullet);
    this.damagePlayer(player, damage);
  }

  private handleWeaponPickup(playerObject: Phaser.GameObjects.GameObject, pickupObject: Phaser.GameObjects.GameObject): void {
    const player = playerObject.getData('actor') as PlayerUnit | undefined;
    const pickup = pickupObject as Phaser.GameObjects.Rectangle;
    const weaponKind = pickup.getData('weaponKind') as WeaponKind | undefined;
    if (!player || !player.alive || !weaponKind) {
      return;
    }

    const weapon = WEAPONS[weaponKind];
    if (!player.weapons.includes(weaponKind)) {
      player.weapons.push(weaponKind);
    }

    player.ammo[weaponKind] = weapon.maxAmmo < 0
      ? -1
      : Math.min(weapon.maxAmmo, (player.ammo[weaponKind] ?? 0) + weapon.pickupAmmo);
    player.weaponIndex = player.weapons.indexOf(weaponKind);
    const label = pickup.getData('labelObject') as Phaser.GameObjects.Text | undefined;
    label?.destroy();
    pickup.destroy();

    this.showBanner(`${player.label} collected ${weapon.label} ammo ${this.getAmmoLabel(player, weaponKind)}`, player.accent);
    this.emitHud('live');
  }

  private handleEnemyContact(playerObject: Phaser.GameObjects.GameObject, enemyObject: Phaser.GameObjects.GameObject): void {
    const player = playerObject.getData('actor') as PlayerUnit | undefined;
    const enemy = enemyObject.getData('actor') as EnemyUnit | undefined;
    if (!player || !enemy || !player.alive || !enemy.alive) {
      return;
    }

    if (this.time.now < player.contactReadyAt || this.time.now < enemy.contactReadyAt) {
      return;
    }

    player.contactReadyAt = this.time.now + 520;
    enemy.contactReadyAt = this.time.now + 520;
    this.damagePlayer(player, enemy.kind === 'rocketeer' ? 12 : 8);
  }

  private handleBossContact(playerObject: Phaser.GameObjects.GameObject, bossObject: Phaser.GameObjects.GameObject): void {
    const player = playerObject.getData('actor') as PlayerUnit | undefined;
    const boss = bossObject.getData('actor') as BossUnit | undefined;
    if (!player || !boss || !player.alive || !boss.alive) {
      return;
    }

    if (this.time.now < player.contactReadyAt || this.time.now < boss.contactReadyAt) {
      return;
    }

    player.contactReadyAt = this.time.now + 550;
    boss.contactReadyAt = this.time.now + 550;
    this.damagePlayer(player, 16);
  }

  private damageEnemy(enemy: EnemyUnit, amount: number): void {
    enemy.health -= amount;
    this.flashSprite(enemy.sprite);

    if (enemy.health > 0) {
      return;
    }

    enemy.alive = false;
    enemy.sprite.disableBody(false, false);
    enemy.sprite.setVelocity(0, 0);
    enemy.sprite.setDepth(9);
    this.tweens.killTweensOf(enemy.sprite);
    this.tweens.add({
      targets: enemy.sprite,
      alpha: 0,
      scale: 0.72,
      angle: enemy.sprite.angle + 18,
      duration: 420,
      ease: 'Quad.easeOut',
      onComplete: () => enemy.sprite.destroy(),
    });
    this.director.addScore(enemy.kind === 'turret' ? 180 : enemy.kind === 'rocketeer' ? 140 : 100);

    const encounter = this.encounterStates.find((state) => state.config.id === enemy.encounterId);
    if (encounter) {
      encounter.remaining = Math.max(0, encounter.remaining - 1);
    }
  }

  private damageBoss(boss: BossUnit, amount: number): void {
    boss.health -= amount;
    this.flashSprite(boss.sprite);

    if (boss.health > 0) {
      return;
    }

    boss.alive = false;
    boss.sprite.destroy();
    this.playing = false;
    this.director.addScore(1000);
    this.activeEncounterLabel = `${boss.config.name} destroyed`;
    this.showBanner('Boss down. Stage clear.', '#f5e4a1');
    this.cameras.main.shake(240, 0.008);
    this.physics.pause();

    this.time.delayedCall(1100, () => {
      this.director.completeCurrentStage();
      this.emitHud('paused');
    });
  }

  private damagePlayer(player: PlayerUnit, amount: number): void {
    player.health -= amount;
    this.flashSprite(player.sprite);
    this.cameras.main.shake(90, 0.003);

    if (player.health > 0) {
      return;
    }

    player.alive = false;
    player.health = 0;
    player.sprite.disableBody(true, true);
    this.showBanner(`${player.label} is down`, player.accent);

    if (this.players.some((squadMate) => squadMate.alive)) {
      return;
    }

    this.playing = false;
    this.activeEncounterLabel = 'Mission failed';
    this.physics.pause();
    this.time.delayedCall(900, () => {
      this.director.failMission();
      this.emitHud('paused');
    });
  }

  private flashSprite(sprite: Phaser.Physics.Arcade.Sprite): void {
    sprite.setTintFill(0xffffff);
    this.time.delayedCall(75, () => {
      if (sprite.active) {
        sprite.clearTint();
      }
    });
  }

  private showBanner(text: string, color: string): void {
    if (!this.bannerText) {
      return;
    }

    this.bannerText.setText(text);
    this.bannerText.setColor(color);
    this.bannerText.setAlpha(1);
    this.reticleText?.setText(this.stage?.briefing ?? '');
    this.reticleText?.setAlpha(0.96);
    this.objectivePanel?.setAlpha(0.82);
    const targets = [this.bannerText, this.reticleText, this.objectivePanel]
      .filter((target): target is Phaser.GameObjects.Text | Phaser.GameObjects.Image => Boolean(target));
    for (const target of targets) {
      this.tweens.killTweensOf(target);
    }

    this.tweens.add({
      targets,
      alpha: 0,
      duration: 1600,
      ease: 'Cubic.easeOut',
      delay: 1200,
    });
  }

  private closestLivingPlayer(x: number, y: number): PlayerUnit | undefined {
    let best: PlayerUnit | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const player of this.players) {
      if (!player.alive) {
        continue;
      }

      const distance = Phaser.Math.Distance.Squared(x, y, player.sprite.x, player.sprite.y);
      if (distance < bestDistance) {
        best = player;
        bestDistance = distance;
      }
    }

    return best;
  }

  private hasLineOfSight(fromX: number, fromY: number, toX: number, toY: number): boolean {
    const sightLine = new Phaser.Geom.Line(fromX, fromY, toX, toY);

    for (const obstacle of this.obstacleBodies) {
      const bounds = obstacle.getBounds();
      const expanded = new Phaser.Geom.Rectangle(bounds.x - 3, bounds.y - 3, bounds.width + 6, bounds.height + 6);
      if (expanded.contains(fromX, fromY)) {
        continue;
      }

      if (Phaser.Geom.Intersects.LineToRectangle(sightLine, expanded)) {
        return false;
      }
    }

    return true;
  }

  private distanceToLineSegment(
    pointX: number,
    pointY: number,
    startX: number,
    startY: number,
    endX: number,
    endY: number,
  ): number {
    const dx = endX - startX;
    const dy = endY - startY;
    const lengthSq = dx * dx + dy * dy;
    if (lengthSq === 0) {
      return Phaser.Math.Distance.Between(pointX, pointY, startX, startY);
    }

    const t = Phaser.Math.Clamp(((pointX - startX) * dx + (pointY - startY) * dy) / lengthSq, 0, 1);
    const projectionX = startX + t * dx;
    const projectionY = startY + t * dy;
    return Phaser.Math.Distance.Between(pointX, pointY, projectionX, projectionY);
  }

  private destroyBulletObject(bulletObject: Phaser.GameObjects.GameObject): void {
    const bullet = bulletObject as Phaser.Physics.Arcade.Image;
    if (bullet.active) {
      this.resolvePlayerBulletImpact(bullet, bullet.x, bullet.y);
    }
  }

  private updateBullets(group: Phaser.Physics.Arcade.Group | undefined, time: number, delta: number): void {
    if (!group) {
      return;
    }

    for (const child of group.getChildren()) {
      const bullet = child as Phaser.Physics.Arcade.Image;
      if (!bullet.active) {
        continue;
      }

      const expiry = Number(bullet.getData('expiry') ?? 0);
      const velocityX = Number(bullet.getData('velocityX') ?? 0);
      const velocityY = Number(bullet.getData('velocityY') ?? 0);
      const originX = Number(bullet.getData('originX') ?? bullet.x);
      const originY = Number(bullet.getData('originY') ?? bullet.y);
      const baseMaxDistance = Number(bullet.getData('baseMaxDistance') ?? bullet.getData('maxDistance') ?? 700);
      let maxDistance = Number(bullet.getData('maxDistance') ?? baseMaxDistance);
      const dropStartDistance = Number(bullet.getData('dropStartDistance') ?? maxDistance * 0.78);
      const seconds = Math.min(delta, 50) / 1000;
      const zone = this.getBulletEffectZoneAt(bullet.x, bullet.y);
      const zoneVelocity = this.applyBulletZoneVelocity(bullet, velocityX, velocityY, seconds, zone);
      if (zone?.effect === 'boost') {
        const boostedDistance = baseMaxDistance * 1.28;
        maxDistance = Math.max(maxDistance, boostedDistance);
        bullet.setData('maxDistance', maxDistance);
        bullet.setData('dropStartDistance', maxDistance * Number(bullet.getData('baseDropStartRatio') ?? 0.78));
      }

      const nextX = bullet.x + zoneVelocity.x * seconds;
      const nextY = bullet.y + zoneVelocity.y * seconds;

      bullet.setPosition(nextX, nextY);
      (bullet.body as Phaser.Physics.Arcade.Body).reset(nextX, nextY);

      const traveled = Phaser.Math.Distance.Between(originX, originY, nextX, nextY);
      if (traveled > dropStartDistance) {
        const dropProgress = Phaser.Math.Clamp(
          (traveled - dropStartDistance) / Math.max(1, maxDistance - dropStartDistance),
          0,
          1,
        );
        bullet.setAlpha(1 - dropProgress * 0.85);
        bullet.setScale(
          Number(bullet.getData('baseScaleX') ?? bullet.scaleX) * (1 - dropProgress * 0.45),
          Number(bullet.getData('baseScaleY') ?? bullet.scaleY) * (1 - dropProgress * 0.65),
        );
        bullet.y += dropProgress * 0.9;
        (bullet.body as Phaser.Physics.Arcade.Body).reset(bullet.x, bullet.y);
      }

      if (
        time > expiry
        || traveled >= maxDistance
        || !Phaser.Geom.Rectangle.Overlaps(this.physics.world.bounds, bullet.getBounds())
      ) {
        this.resolvePlayerBulletImpact(bullet, bullet.x, bullet.y);
      }
    }
  }

  private getBulletEffectZoneAt(x: number, y: number): BulletEffectZone | undefined {
    return this.bulletZones.find((zone) => zone.bounds.contains(x, y));
  }

  private applyBulletZoneVelocity(
    bullet: Phaser.Physics.Arcade.Image,
    velocityX: number,
    velocityY: number,
    seconds: number,
    zone: BulletEffectZone | undefined,
  ): { x: number; y: number } {
    if (!zone) {
      bullet.setTint(Number(bullet.getData('baseTint') ?? 0xffffff));
      return { x: velocityX, y: velocityY };
    }

    if (zone.effect === 'drag') {
      bullet.setTint(0x93c9ff);
      return {
        x: velocityX * 0.56,
        y: velocityY * 0.56 + 34,
      };
    }

    if (zone.effect === 'crosswind') {
      const drift = Math.sin(this.time.now / 220) * 85;
      bullet.setTint(0x9ff5b5);
      return {
        x: velocityX + -velocityY * 0.08 + drift * seconds * 8,
        y: velocityY + velocityX * 0.08,
      };
    }

    bullet.setTint(0xfff0a6);
    return {
      x: velocityX * 1.18,
      y: velocityY * 1.18,
    };
  }

  private resolvePlayerBulletImpact(bullet: Phaser.Physics.Arcade.Image, x: number, y: number): void {
    if (!bullet.active) {
      return;
    }

    const splashRadius = Number(bullet.getData('splashRadius') ?? 0);
    const splashDamage = Number(bullet.getData('splashDamage') ?? 0);
    const splashTint = Number(bullet.getData('splashTint') ?? 0xfff0aa);
    if (splashRadius > 0 && splashDamage > 0) {
      this.createExplosion(x, y, splashRadius, splashDamage, splashTint);
    }

    this.dropBullet(bullet);
  }

  private createExplosion(x: number, y: number, radius: number, damage: number, tint: number): void {
    const blast = this.add.image(x, y, 'blast-circle');
    blast.setTint(tint);
    blast.setAlpha(0.48);
    blast.setDepth(18);
    blast.setScale(0.12);
    blast.setBlendMode(Phaser.BlendModes.ADD);

    this.tweens.add({
      targets: blast,
      scale: radius / 10,
      alpha: 0,
      duration: 280,
      ease: 'Quad.easeOut',
      onComplete: () => blast.destroy(),
    });

    for (const enemy of this.enemies) {
      if (!enemy.alive) {
        continue;
      }

      const distance = Phaser.Math.Distance.Between(x, y, enemy.sprite.x, enemy.sprite.y);
      if (distance <= radius) {
        const falloff = Phaser.Math.Clamp(1 - distance / Math.max(radius, 1), 0.35, 1);
        this.createHitSpark(enemy.sprite.x, enemy.sprite.y, tint, `-${Math.ceil(damage * falloff)}`);
        this.damageEnemy(enemy, Math.ceil(damage * falloff));
      }
    }

    if (this.boss?.alive) {
      const distance = Phaser.Math.Distance.Between(x, y, this.boss.sprite.x, this.boss.sprite.y);
      if (distance <= radius) {
        const falloff = Phaser.Math.Clamp(1 - distance / Math.max(radius, 1), 0.25, 1);
        this.createHitSpark(this.boss.sprite.x, this.boss.sprite.y, tint, `-${Math.ceil(damage * falloff)}`);
        this.damageBoss(this.boss, Math.ceil(damage * falloff));
      }
    }
  }

  private dropBullet(bullet: Phaser.Physics.Arcade.Image): void {
    if (!bullet.active) {
      return;
    }

    const puff = this.add.image(bullet.x, bullet.y + 4, 'blast-circle');
    puff.setDepth(14);
    puff.setTint(0xead8a2);
    puff.setAlpha(0.22);
    puff.setScale(0.08);
    this.tweens.add({
      targets: puff,
      alpha: 0,
      scale: 0.34,
      duration: 160,
      ease: 'Quad.easeOut',
      onComplete: () => puff.destroy(),
    });

    bullet.destroy();
  }

  private createHitSpark(x: number, y: number, tint: number, label?: string): void {
    const spark = this.add.image(x, y, 'blast-circle');
    spark.setDepth(19);
    spark.setTint(tint);
    spark.setAlpha(0.58);
    spark.setScale(0.11);
    spark.setBlendMode(Phaser.BlendModes.ADD);

    this.tweens.add({
      targets: spark,
      alpha: 0,
      scale: 0.82,
      duration: 180,
      ease: 'Quad.easeOut',
      onComplete: () => spark.destroy(),
    });

    if (!label) {
      return;
    }

    const text = this.add.text(x, y - 18, label, {
      fontFamily: 'Bahnschrift, Trebuchet MS, sans-serif',
      fontSize: '12px',
      color: '#fff2c4',
      stroke: '#24170a',
      strokeThickness: 3,
    });
    text.setOrigin(0.5);
    text.setDepth(20);

    this.tweens.add({
      targets: text,
      y: y - 38,
      alpha: 0,
      duration: 360,
      ease: 'Quad.easeOut',
      onComplete: () => text.destroy(),
    });
  }

  private emitHud(phase: HudSnapshot['phase']): void {
    const snapshot = this.director.getSnapshot();
    const stage = this.stage ?? this.getPreviewStage(snapshot);
    const clearedEncounters = this.encounterStates.filter((state) => state.cleared).length;
    const totalEncounters = this.encounterStates.length || stage.encounters.length;
    const progressText = this.bossSpawned
      ? this.boss?.alive
        ? 'Boss engaged'
        : 'Stage complete'
      : `${clearedEncounters}/${totalEncounters} kill zones cleared`;

    this.pushHud({
      phase,
      stageName: stage.codename,
      stageIndex: snapshot.currentStageIndex + 1,
      totalStages: snapshot.stages.length,
      objective: stage.objective,
      encounterLabel: this.activeEncounterLabel,
      progressText,
      totalScore: snapshot.totalScore,
      players: this.players.map((player) => ({
        id: player.id,
        label: player.label,
        health: player.health,
        maxHealth: player.maxHealth,
        bombs: player.bombs,
        alive: player.alive,
        accent: player.accent,
        weapon: this.getCurrentWeapon(player).label,
        weapons: player.weapons.map((weapon) => WEAPONS[weapon].label),
        ammo: player.weapons.map((weaponKind) => ({
          label: WEAPONS[weaponKind].shortLabel,
          ammo: this.getAmmoLabel(player, weaponKind),
          active: WEAPONS[weaponKind].kind === this.getCurrentWeapon(player).kind,
        })),
      })),
      boss: this.boss && this.boss.alive
        ? {
            name: this.boss.config.name,
            health: this.boss.health,
            maxHealth: this.boss.maxHealth,
          }
        : undefined,
    });
  }

  private getPreviewStage(snapshot: SessionSnapshot): StageConfig {
    if (snapshot.phase === 'intermission' && snapshot.nextStage) {
      return snapshot.nextStage;
    }

    return snapshot.currentStage;
  }

  private playLoop(sprite: Phaser.Physics.Arcade.Sprite, key: string): void {
    if (sprite.anims.currentAnim?.key === key && sprite.anims.isPlaying) {
      return;
    }

    sprite.play(key, true);
  }

  private stopAtFirstFrame(sprite: Phaser.Physics.Arcade.Sprite): void {
    if (sprite.anims.isPlaying) {
      sprite.anims.stop();
    }
    sprite.setFrame(0);
  }
}
