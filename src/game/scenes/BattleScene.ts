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
} from '../types';

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
  private obstacleBodies: Phaser.GameObjects.Rectangle[] = [];
  private cameraTarget?: Phaser.GameObjects.Zone;
  private bannerText?: Phaser.GameObjects.Text;
  private reticleText?: Phaser.GameObjects.Text;

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

    const snapshot = this.director.getSnapshot();
    if (snapshot.phase === 'playing') {
      this.setupStage(snapshot);
      return;
    }

    this.setupStandby(snapshot);
  }

  update(time: number): void {
    if (!this.playing || !this.stage) {
      return;
    }

    this.updatePlayers(time);
    this.updateEnemies(time);
    this.updateBoss(time);
    this.updateCameraAnchor();
    this.checkEncounterTriggers();
    this.cleanupBullets(this.playerBullets, time);
    this.cleanupBullets(this.enemyBullets, time);

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

    this.children.removeAll();
    this.physics.world.colliders.destroy();
    this.physics.resume();
    this.physics.world.setBounds(0, 0, this.stage.worldWidth, this.stage.worldHeight);
    this.cameras.main.setBounds(0, 0, this.stage.worldWidth, this.stage.worldHeight);
    this.cameras.main.setBackgroundColor(this.stage.palette.sky);
    this.drawBackdrop(this.stage, false);

    this.playerGroup = this.physics.add.group();
    this.enemyGroup = this.physics.add.group();
    this.bossGroup = this.physics.add.group();
    this.playerBullets = this.physics.add.group();
    this.enemyBullets = this.physics.add.group();
    this.obstacleBodies = [];
    this.cameraTarget = this.add.zone(140, this.stage.worldHeight * 0.5, 4, 4);
    this.cameras.main.startFollow(this.cameraTarget, true, 0.08, 0.08);
    this.cameras.main.setDeadzone(140, 120);

    this.createObstacles(this.stage);
    this.createPlayers(snapshot.playerCount);
    this.setupColliders();
    this.createOverlayText();

    this.showBanner(`${this.stage.codename} deployed`, '#f3e6bf');
    this.playing = true;
    this.emitHud('live');
  }

  private drawBackdrop(stage: StageConfig, standby: boolean): void {
    const background = this.add.graphics();
    background.setDepth(-40);
    background.fillStyle(stage.palette.ground, 1);
    background.fillRect(0, 0, stage.worldWidth, stage.worldHeight);

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
      background.fillRect(index * 170, 0, 8, stage.worldHeight);
    }

    if (stage.palette.water) {
      background.fillStyle(stage.palette.water, 0.82);
      background.fillRect(stage.worldWidth * 0.33, 0, stage.worldWidth * 0.16, stage.worldHeight);
      background.fillStyle(0xffffff, 0.06);
      for (let index = 0; index < 18; index += 1) {
        background.fillRect(stage.worldWidth * 0.33, 40 + index * 52, stage.worldWidth * 0.16, 14);
      }
    }

    if (standby) {
      background.fillStyle(0x000000, 0.18);
      background.fillRect(0, 0, stage.worldWidth, stage.worldHeight);
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
        bulletSpeed: 680,
        damage: 20,
        nextFireAt: 0,
        nextSpecialAt: 0,
        jumpReadyAt: 0,
        jumpUntil: 0,
        fireVisualUntil: 0,
        contactReadyAt: 0,
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
  }

  private createOverlayText(): void {
    this.bannerText = this.add.text(36, 28, '', {
      fontFamily: 'Impact, Haettenschweiler, sans-serif',
      fontSize: '34px',
      color: '#f4e8c3',
      letterSpacing: 2,
    }).setScrollFactor(0).setDepth(60);
    this.bannerText.setAlpha(0);

    this.reticleText = this.add.text(36, 72, '', {
      fontFamily: 'Bahnschrift, Trebuchet MS, sans-serif',
      fontSize: '15px',
      color: '#d6dcc6',
      wordWrap: { width: 520 },
    }).setScrollFactor(0).setDepth(60);
    this.reticleText.setAlpha(0.92);
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
      const wantsCrouch = this.isActionDown(player, 'crouch');
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
        if (wantsCrouch) {
          speed = player.crawlSpeed;
          if (movement.lengthSq() > 0) {
            player.sprite.setVelocity(movement.x * speed, movement.y * speed);
            animation = animationKey('player-crawl');
          } else {
            player.sprite.setVelocity(0, 0);
            animation = animationKey('player-kneel');
          }
        } else if (movement.lengthSq() > 0) {
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

  private isActionDown(player: PlayerUnit, action: Extract<GameAction, 'crouch' | 'fire'>): boolean {
    const touchActive = player.virtualControlId ? this.virtualGamepad.isDown(player.virtualControlId, action) : false;
    return player.controls[action].isDown || touchActive;
  }

  private wasActionPressed(player: PlayerUnit, action: Extract<GameAction, 'jump' | 'special'>): boolean {
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

      if (enemy.kind === 'turret') {
        enemy.sprite.setVelocity(0, 0);
      } else {
        const desiredRange = enemy.kind === 'rocketeer' ? 320 : 240;
        const advance = distance > desiredRange ? 1 : distance < desiredRange * 0.72 ? -0.6 : 0;
        const strafe = Math.sin(time / 360 + enemy.behaviorOffset) * 0.45;
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
      this.showBanner('Zone clear. Barrage restocked.', '#f1d486');
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

    for (const spawn of state.config.enemies) {
      this.spawnEnemy(spawn.kind, spawn.id, spawn.x, spawn.y, state.config.id);
    }
  }

  private spawnEnemy(kind: EnemyKind, id: string, x: number, y: number, encounterId: string): void {
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
      moveSpeed: kind === 'rocketeer' ? 76 : kind === 'turret' ? 0 : 105,
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
    const target = this.closestEnemyOrBoss(player.sprite.x, player.sprite.y);
    const direction = target
      ? new Phaser.Math.Vector2(target.x - player.sprite.x, target.y - player.sprite.y)
      : player.aim.clone();

    if (direction.lengthSq() === 0) {
      direction.set(1, 0);
    }

    direction.normalize();
    player.aim.copy(direction);
    player.fireVisualUntil = time + 180;
    this.firePlayerBullet(
      player.sprite.x + direction.x * 18,
      player.sprite.y + direction.y * 18,
      direction,
      player.bulletSpeed,
      player.damage,
      player.tint,
    );
    player.nextFireAt = time + player.fireRate;
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
  ): void {
    const bullet = this.physics.add.image(x, y, 'bullet-shell');
    bullet.setTint(tint);
    bullet.setDepth(16);
    bullet.setVelocity(direction.x * speed, direction.y * speed);
    bullet.setRotation(direction.angle());
    bullet.setData('damage', damage);
    bullet.setData('expiry', this.time.now + 1200);
    this.playerBullets?.add(bullet);
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
    bullet.setVelocity(direction.x * speed, direction.y * speed);
    bullet.setRotation(direction.angle());
    bullet.setData('damage', damage);
    bullet.setData('expiry', this.time.now + 1400);
    this.enemyBullets?.add(bullet);
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

    const damage = Number(bullet.getData('damage') ?? 15);
    bullet.destroy();
    this.damageEnemy(enemy, damage);
  }

  private handleBossHit(bulletObject: Phaser.GameObjects.GameObject, bossObject: Phaser.GameObjects.GameObject): void {
    const bullet = bulletObject as Phaser.Physics.Arcade.Image;
    const boss = bossObject.getData('actor') as BossUnit | undefined;
    if (!boss || !boss.alive || !bullet.active) {
      return;
    }

    const damage = Number(bullet.getData('damage') ?? 18);
    bullet.destroy();
    this.damageBoss(boss, damage);
  }

  private handlePlayerHit(bulletObject: Phaser.GameObjects.GameObject, playerObject: Phaser.GameObjects.GameObject): void {
    const bullet = bulletObject as Phaser.Physics.Arcade.Image;
    const player = playerObject.getData('actor') as PlayerUnit | undefined;
    if (!player || !player.alive || !bullet.active) {
      return;
    }

    const damage = Number(bullet.getData('damage') ?? 10);
    bullet.destroy();
    this.damagePlayer(player, damage);
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
    enemy.sprite.destroy();
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
    this.tweens.killTweensOf(this.bannerText);
    this.tweens.add({
      targets: this.bannerText,
      alpha: 0,
      duration: 1800,
      ease: 'Cubic.easeOut',
      delay: 450,
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

  private closestEnemyOrBoss(x: number, y: number): { x: number; y: number } | undefined {
    let bestX = 0;
    let bestY = 0;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const enemy of this.enemies) {
      if (!enemy.alive) {
        continue;
      }

      const distance = Phaser.Math.Distance.Squared(x, y, enemy.sprite.x, enemy.sprite.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestX = enemy.sprite.x;
        bestY = enemy.sprite.y;
      }
    }

    if (this.boss && this.boss.alive) {
      const distance = Phaser.Math.Distance.Squared(x, y, this.boss.sprite.x, this.boss.sprite.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestX = this.boss.sprite.x;
        bestY = this.boss.sprite.y;
      }
    }

    if (bestDistance > 620 * 620) {
      return undefined;
    }

    return { x: bestX, y: bestY };
  }

  private destroyBulletObject(bulletObject: Phaser.GameObjects.GameObject): void {
    const bullet = bulletObject as Phaser.Physics.Arcade.Image;
    if (bullet.active) {
      bullet.destroy();
    }
  }

  private cleanupBullets(group: Phaser.Physics.Arcade.Group | undefined, time: number): void {
    if (!group) {
      return;
    }

    for (const child of group.getChildren()) {
      const bullet = child as Phaser.Physics.Arcade.Image;
      const expiry = Number(bullet.getData('expiry') ?? 0);
      if (time > expiry || !Phaser.Geom.Rectangle.Overlaps(this.physics.world.bounds, bullet.getBounds())) {
        bullet.destroy();
      }
    }
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
