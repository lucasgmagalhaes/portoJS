import { ButtonState } from './button-state.ts';

/**
 * The parts of a browser `Gamepad` this package reads.
 */
export interface GamepadLike {
  readonly connected: boolean;
  readonly buttons: ReadonlyArray<{ readonly pressed: boolean }>;
  readonly axes: readonly number[];
}

/**
 * Returns the current gamepads, like `navigator.getGamepads()`.
 */
export type GamepadProvider = () => ReadonlyArray<GamepadLike | null | undefined>;

/**
 * Options for {@link Gamepads}.
 */
export interface GamepadsOptions {
  /**
   * Where gamepads come from. Default `navigator.getGamepads()` when it exists.
   */
  readonly provider?: GamepadProvider;
  /**
   * Axis values with a smaller magnitude read as `0`. Default `0.15`.
   */
  readonly deadzone?: number;
}

function browserGamepads(): ReadonlyArray<GamepadLike | null | undefined> {
  const nav = (globalThis as { navigator?: { getGamepads?: GamepadProvider } }).navigator;
  return nav?.getGamepads?.() ?? [];
}

/**
 * Gamepad state. Gamepads have no events, so call {@link Gamepads.poll} once per step (the
 * `InputComponent` does it for you). Button ids are `<pad>:<button>`, for example `0:0`.
 */
export class Gamepads {
  /**
   * The underlying button state.
   */
  readonly state = new ButtonState();

  private readonly provider: GamepadProvider;
  private readonly deadzone: number;
  private readonly values = new Map<string, number>();

  /**
   * @throws {RangeError} if `deadzone` is not between 0 and 1.
   */
  constructor(options: GamepadsOptions = {}) {
    this.provider = options.provider ?? browserGamepads;
    this.deadzone = options.deadzone ?? 0.15;
    if (!(this.deadzone >= 0 && this.deadzone < 1)) {
      throw new RangeError('Gamepads: deadzone must be in [0, 1)');
    }
  }

  /**
   * Reads every connected gamepad and updates buttons and axes.
   */
  poll(): void {
    const pads = this.provider();
    for (let index = 0; index < pads.length; index++) {
      const pad = pads[index];
      if (pad === null || pad === undefined || !pad.connected) {
        this.clearPad(index);
        continue;
      }
      for (let button = 0; button < pad.buttons.length; button++) {
        const id = `${index}:${button}`;
        if (pad.buttons[button]?.pressed === true) this.state.press(id);
        else this.state.release(id);
      }
      for (let axis = 0; axis < pad.axes.length; axis++) {
        const raw = pad.axes[axis] ?? 0;
        this.values.set(`${index}:${axis}`, Math.abs(raw) < this.deadzone ? 0 : raw);
      }
    }
  }

  /**
   * Value of an axis from `-1` to `1`, after the dead zone (`0` for unknown axes).
   */
  axis(pad: number, axis: number): number {
    return this.values.get(`${pad}:${axis}`) ?? 0;
  }

  /**
   * Whether a button is held.
   */
  isDown(pad: number, button: number): boolean {
    return this.state.isDown(`${pad}:${button}`);
  }

  private clearPad(index: number): void {
    const prefix = `${index}:`;
    for (const id of this.state.down) {
      if (id.startsWith(prefix)) this.state.release(id);
    }
    for (const id of [...this.values.keys()]) {
      if (id.startsWith(prefix)) this.values.delete(id);
    }
  }
}
