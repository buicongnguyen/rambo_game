import { GameDirector } from '../core/GameDirector';
import { VirtualGamepad, type GameAction } from '../core/VirtualGamepad';
import type { SessionPhase } from '../types';

type TouchButtonAction = Extract<GameAction, 'crouch' | 'jump' | 'fire' | 'special'>;

function isTouchButtonAction(value: string | undefined): value is TouchButtonAction {
  return value === 'crouch' || value === 'jump' || value === 'fire' || value === 'special';
}

export class TouchControlsOverlay {
  private readonly root: HTMLElement;
  private readonly gamepad: VirtualGamepad;
  private readonly stickZone: HTMLElement;
  private readonly stickKnob: HTMLElement;
  private readonly buttonResetters: Array<() => void> = [];
  private readonly touchQuery = window.matchMedia('(hover: none), (pointer: coarse)');
  private stickPointerId: number | null = null;
  private currentPhase: SessionPhase = 'menu';

  constructor(root: HTMLElement, director: GameDirector, gamepad: VirtualGamepad) {
    this.root = root;
    this.gamepad = gamepad;
    this.root.innerHTML = `
      <div class="touch-controls">
        <div class="touch-cluster touch-cluster-left">
          <div class="touch-stick-shell" data-stick-zone data-engaged="false">
            <div class="touch-stick-ring"></div>
            <div class="touch-stick-knob" data-stick-knob></div>
            <span class="touch-stick-label">Move</span>
          </div>
        </div>
        <div class="touch-cluster touch-cluster-right">
          <div class="touch-action-grid">
            <button type="button" class="touch-button" data-action="jump">
              <strong>Jump</strong>
            </button>
            <button type="button" class="touch-button touch-button-fire" data-action="fire">
              <strong>Fire</strong>
            </button>
            <button type="button" class="touch-button" data-action="crouch">
              <strong>Gun</strong>
            </button>
            <button type="button" class="touch-button touch-button-special" data-action="special">
              <strong>Bomb</strong>
            </button>
          </div>
        </div>
        <div class="touch-rotate-hint">Portrait and landscape are supported.</div>
      </div>
    `;

    const stickZone = this.root.querySelector<HTMLElement>('[data-stick-zone]');
    const stickKnob = this.root.querySelector<HTMLElement>('[data-stick-knob]');
    if (!stickZone || !stickKnob) {
      throw new Error('Touch controls failed to initialize.');
    }

    this.stickZone = stickZone;
    this.stickKnob = stickKnob;

    this.bindStick();
    this.bindButtons();
    window.addEventListener('resize', this.syncVisibility);
    this.syncVisibility();

    director.subscribe((snapshot) => {
      this.currentPhase = snapshot.phase;
      this.applyVisibility();
    });
  }

  private readonly syncVisibility = (): void => {
    const available = this.touchQuery.matches || window.navigator.maxTouchPoints > 0 || window.innerWidth <= 1100;
    document.body.dataset.touchMode = available ? 'true' : 'false';
    this.root.dataset.active = available ? 'true' : 'false';
    this.applyVisibility();
  };

  private applyVisibility(): void {
    const visible = this.root.dataset.active === 'true' && this.currentPhase === 'playing';
    this.root.hidden = !visible;
    this.root.setAttribute('aria-hidden', String(!visible));

    if (!visible) {
      this.resetInputs();
    }
  }

  private bindStick(): void {
    this.stickZone.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      this.stickPointerId = event.pointerId;
      this.stickZone.dataset.engaged = 'true';
      this.stickZone.setPointerCapture(event.pointerId);
      this.updateStick(event);
    });

    this.stickZone.addEventListener('pointermove', (event) => {
      if (event.pointerId !== this.stickPointerId) {
        return;
      }

      event.preventDefault();
      this.updateStick(event);
    });

    const releaseStick = (event?: PointerEvent): void => {
      if (event && event.pointerId !== this.stickPointerId) {
        return;
      }

      if (event) {
        event.preventDefault();
        if (this.stickPointerId !== null && this.stickZone.hasPointerCapture(this.stickPointerId)) {
          this.stickZone.releasePointerCapture(this.stickPointerId);
        }
      }

      this.stickPointerId = null;
      this.stickZone.dataset.engaged = 'false';
      this.stickKnob.style.setProperty('--stick-x', '0px');
      this.stickKnob.style.setProperty('--stick-y', '0px');
      this.gamepad.clearAxis(1);
    };

    this.stickZone.addEventListener('pointerup', releaseStick);
    this.stickZone.addEventListener('pointercancel', releaseStick);
    this.stickZone.addEventListener('lostpointercapture', () => {
      if (this.stickPointerId !== null) {
        releaseStick();
      }
    });
    this.stickZone.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  private bindButtons(): void {
    const buttons = this.root.querySelectorAll<HTMLButtonElement>('button[data-action]');
    for (const button of buttons) {
      const action = button.dataset.action;
      if (!isTouchButtonAction(action)) {
        continue;
      }

      this.buttonResetters.push(this.bindButton(button, action));
    }
  }

  private bindButton(button: HTMLButtonElement, action: TouchButtonAction): () => void {
    let pointerId: number | null = null;

    const release = (event?: PointerEvent): void => {
      if (event && event.pointerId !== pointerId) {
        return;
      }

      if (event) {
        event.preventDefault();
        if (pointerId !== null && button.hasPointerCapture(pointerId)) {
          button.releasePointerCapture(pointerId);
        }
      }

      pointerId = null;
      button.dataset.pressed = 'false';
      this.gamepad.setAction(1, action, false);
    };

    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      pointerId = event.pointerId;
      button.dataset.pressed = 'true';
      button.setPointerCapture(event.pointerId);
      this.gamepad.setAction(1, action, true);
    });
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', () => {
      if (pointerId !== null) {
        release();
      }
    });
    button.addEventListener('click', (event) => event.preventDefault());
    button.addEventListener('contextmenu', (event) => event.preventDefault());

    return () => {
      pointerId = null;
      button.dataset.pressed = 'false';
      this.gamepad.setAction(1, action, false);
    };
  }

  private updateStick(event: PointerEvent): void {
    const rect = this.stickZone.getBoundingClientRect();
    const centerX = rect.left + rect.width * 0.5;
    const centerY = rect.top + rect.height * 0.5;
    const maxRadius = Math.min(rect.width, rect.height) * 0.32;
    const rawX = event.clientX - centerX;
    const rawY = event.clientY - centerY;
    const distance = Math.hypot(rawX, rawY);
    const scale = distance > maxRadius && distance > 0 ? maxRadius / distance : 1;
    const knobX = rawX * scale;
    const knobY = rawY * scale;

    this.stickKnob.style.setProperty('--stick-x', `${knobX}px`);
    this.stickKnob.style.setProperty('--stick-y', `${knobY}px`);
    this.gamepad.setAxis(1, knobX / maxRadius, knobY / maxRadius);
  }

  private resetInputs(): void {
    this.stickPointerId = null;
    this.stickZone.dataset.engaged = 'false';
    this.stickKnob.style.setProperty('--stick-x', '0px');
    this.stickKnob.style.setProperty('--stick-y', '0px');
    for (const reset of this.buttonResetters) {
      reset();
    }
    this.gamepad.resetPlayer(1);
  }
}
