import Phaser from 'phaser';
import './style.css';
import { GameDirector } from './game/core/GameDirector';
import { VirtualGamepad } from './game/core/VirtualGamepad';
import { BattleScene } from './game/scenes/BattleScene';
import { InterfaceController } from './game/ui/InterfaceController';
import { TouchControlsOverlay } from './game/ui/TouchControls';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) {
  throw new Error('App root not found.');
}

app.innerHTML = `
  <div class="shell">
    <header class="masthead">
      <div>
        <span class="eyebrow">Nintendo-style military run-and-gun</span>
        <h1>Operation Iron Vengeance</h1>
      </div>
      <p>
        A staged co-op commando prototype built from the brief: jungle assault, enemy waves,
        and a boss at the end of every mission.
      </p>
    </header>
    <main class="viewport-shell">
      <div class="viewport-frame">
        <div id="game-root" class="game-root"></div>
        <div id="hud-root" class="hud-root"></div>
        <div id="overlay-root" class="overlay-root"></div>
        <div id="touch-controls-root" class="touch-controls-root" hidden></div>
      </div>
    </main>
    <section id="intel-root" class="intel-grid"></section>
  </div>
`;

const hudRoot = document.querySelector<HTMLElement>('#hud-root');
const overlayRoot = document.querySelector<HTMLElement>('#overlay-root');
const intelRoot = document.querySelector<HTMLElement>('#intel-root');
const touchControlsRoot = document.querySelector<HTMLElement>('#touch-controls-root');

if (!hudRoot || !overlayRoot || !intelRoot || !touchControlsRoot) {
  throw new Error('Interface roots are missing.');
}

const director = new GameDirector();
const virtualGamepad = new VirtualGamepad();
const ui = new InterfaceController({ hudRoot, overlayRoot, intelRoot }, director);
new TouchControlsOverlay(touchControlsRoot, director, virtualGamepad);

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game-root',
  backgroundColor: '#0a0f0b',
  width: 1280,
  height: 720,
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 1280,
    height: 720,
  },
  render: {
    pixelArt: false,
    antialias: true,
  },
  scene: [new BattleScene(director, (snapshot) => ui.setHud(snapshot), virtualGamepad)],
});
