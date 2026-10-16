import { ButtonState } from './button-state.ts';
import type { ButtonSource } from './input.ts';
import type { Pointer, PointerStreamEvent } from './pointer.ts';

/**
 * A region of the screen, in the pointer's drawing space.
 */
export type Region =
  | { readonly kind: 'circle'; readonly x: number; readonly y: number; readonly radius: number }
  | {
      readonly kind: 'rect';
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
    };

/**
 * Options of the on-screen joystick.
 */
export interface JoystickOptions {
  /**
   * Where a touch starts the stick.
   */
  readonly region: Region;
  /**
   * How far from the centre the stick is fully pushed, in drawing-space units. Default `60`.
   */
  readonly radius?: number;
  /**
   * A floating stick is centred where the touch lands; a fixed one at the middle of the region.
   * Default `false` (fixed).
   */
  readonly floating?: boolean;
  /**
   * Movement below this fraction of the radius counts as zero. Default `0.15`.
   */
  readonly deadZone?: number;
}

/**
 * Options of {@link VirtualControls}.
 */
export interface VirtualControlsOptions {
  /**
   * The thumb stick, if there is one.
   */
  readonly joystick?: JoystickOptions;
  /**
   * On-screen buttons by name. A touch inside the region presses the button.
   */
  readonly buttons?: Readonly<Record<string, Region>>;
}

function inside(region: Region, x: number, y: number): boolean {
  if (region.kind === 'circle')
    return (x - region.x) ** 2 + (y - region.y) ** 2 <= region.radius ** 2;
  return (
    x >= region.x && x < region.x + region.width && y >= region.y && y < region.y + region.height
  );
}

function centreOf(region: Region): { x: number; y: number } {
  if (region.kind === 'circle') return { x: region.x, y: region.y };
  return { x: region.x + region.width / 2, y: region.y + region.height / 2 };
}

const DIRECTIONS = ['left', 'right', 'up', 'down'] as const;
const DIRECTION_THRESHOLD = 0.5;

/**
 * On-screen touch controls: a thumb stick and buttons, fed by a {@link Pointer}. Each finger is
 * tracked on its own, so you can steer and press a button at the same time. Add it to an
 * {@link Input} as a source and bind actions to its buttons.
 *
 * The buttons are the names you gave, plus `stick-left`, `stick-right`, `stick-up` and
 * `stick-down` (the stick pushed past half way) so a stick can drive the same actions as keys.
 *
 * @example
 * const controls = new VirtualControls({
 *   joystick: { region: { kind: 'rect', x: 0, y: 200, width: 200, height: 200 }, floating: true },
 *   buttons: { jump: { kind: 'circle', x: 700, y: 330, radius: 40 } },
 * });
 * controls.attach(input.pointer);
 * input.addSource('virtual', controls);
 * input.bind('left', 'key:KeyA', 'virtual:stick-left');
 * input.bind('jump', 'key:Space', 'virtual:jump');
 * const [dx, dy] = [controls.x, controls.y]; // -1 to 1
 */
export class VirtualControls implements ButtonSource {
  /**
   * Horizontal push of the stick, `-1` (left) to `1` (right).
   */
  x = 0;
  /**
   * Vertical push of the stick, `-1` (up) to `1` (down).
   */
  y = 0;

  private readonly state = new ButtonState();
  private readonly stickRadius: number;
  private readonly deadZone: number;
  private stickPointer: number | undefined;
  private origin = { x: 0, y: 0 };
  private readonly heldButtons = new Map<number, string>();

  /**
   * @throws {RangeError} if the radius is not positive or the dead zone is outside `0` to `1`.
   */
  constructor(private readonly options: VirtualControlsOptions) {
    this.stickRadius = options.joystick?.radius ?? 60;
    this.deadZone = options.joystick?.deadZone ?? 0.15;
    if (!(this.stickRadius > 0)) throw new RangeError('VirtualControls: radius must be > 0');
    if (!(this.deadZone >= 0 && this.deadZone < 1)) {
      throw new RangeError('VirtualControls: deadZone must be from 0 up to (not including) 1');
    }
  }

  /**
   * Whether a finger is on the stick.
   */
  get stickActive(): boolean {
    return this.stickPointer !== undefined;
  }

  /**
   * Where the stick is centred now, for drawing it. Meaningful while {@link stickActive}.
   */
  get stickOrigin(): { readonly x: number; readonly y: number } {
    return this.origin;
  }

  /**
   * Listens to a pointer. Returns a function that stops.
   */
  attach(pointer: Pointer): () => void {
    return pointer.events.addListener(this.feed);
  }

  /**
   * Handles one pointer event. {@link attach} calls this for you.
   */
  readonly feed = (event: PointerStreamEvent): void => {
    if (event.type === 'down') this.onDown(event);
    else if (event.type === 'move') this.onMove(event);
    else this.onEnd(event);
  };

  isDown(id: string): boolean {
    return this.state.isDown(id);
  }

  wasPressed(id: string): boolean {
    return this.state.wasPressed(id);
  }

  wasReleased(id: string): boolean {
    return this.state.wasReleased(id);
  }

  endFrame(): void {
    this.state.endFrame();
  }

  /**
   * Lets go of everything, for example when the game is paused.
   */
  reset(): void {
    this.stickPointer = undefined;
    this.heldButtons.clear();
    this.setStick(0, 0);
    this.state.releaseAll();
  }

  private onDown(event: PointerStreamEvent): void {
    if (event.button !== 0) return;
    for (const [name, region] of Object.entries(this.options.buttons ?? {})) {
      if (inside(region, event.x, event.y)) {
        this.heldButtons.set(event.pointerId, name);
        this.state.press(name);
        return;
      }
    }
    const stick = this.options.joystick;
    if (stick === undefined || this.stickPointer !== undefined) return;
    if (!inside(stick.region, event.x, event.y)) return;
    this.stickPointer = event.pointerId;
    this.origin = stick.floating === true ? { x: event.x, y: event.y } : centreOf(stick.region);
    this.move(event.x, event.y);
  }

  private onMove(event: PointerStreamEvent): void {
    if (event.pointerId === this.stickPointer) this.move(event.x, event.y);
  }

  private onEnd(event: PointerStreamEvent): void {
    const held = this.heldButtons.get(event.pointerId);
    if (held !== undefined) {
      this.heldButtons.delete(event.pointerId);
      if (!this.holds(held)) this.state.release(held);
    }
    if (event.pointerId === this.stickPointer) {
      this.stickPointer = undefined;
      this.setStick(0, 0);
    }
  }

  private holds(name: string): boolean {
    for (const other of this.heldButtons.values()) if (other === name) return true;
    return false;
  }

  private move(x: number, y: number): void {
    let dx = (x - this.origin.x) / this.stickRadius;
    let dy = (y - this.origin.y) / this.stickRadius;
    const length = Math.hypot(dx, dy);
    if (length > 1) {
      dx /= length;
      dy /= length;
    }
    if (length < this.deadZone) this.setStick(0, 0);
    else this.setStick(dx, dy);
  }

  private setStick(x: number, y: number): void {
    this.x = x;
    this.y = y;
    const pushed: Record<(typeof DIRECTIONS)[number], boolean> = {
      left: x <= -DIRECTION_THRESHOLD,
      right: x >= DIRECTION_THRESHOLD,
      up: y <= -DIRECTION_THRESHOLD,
      down: y >= DIRECTION_THRESHOLD,
    };
    for (const direction of DIRECTIONS) {
      const id = `stick-${direction}`;
      if (pushed[direction] && !this.state.isDown(id)) this.state.press(id);
      else if (!pushed[direction] && this.state.isDown(id)) this.state.release(id);
    }
  }
}
