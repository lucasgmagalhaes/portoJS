import { Emitter } from '../core/events/index.js';
import type { Unsubscribe } from '../core/events/index.js';

/**
 * Listener of a {@link GameEvent}.
 */
export type GameEventListener<T> = (payload: T) => void;

/**
 * A typed event owned by a component, like a `UnityEvent`. Add listeners, invoke it to notify
 * them. If a listener throws, the others still run and the error is rethrown afterwards.
 *
 * @example
 * class Door extends Component {
 *   readonly opened = new GameEvent<{ by: string }>();
 * }
 * door.opened.addListener(({ by }) => console.log(by));
 * door.opened.invoke({ by: 'player' });
 */
export class GameEvent<T = undefined> {
  private readonly bus = new Emitter<{ event: T }>();

  /**
   * Number of listeners.
   */
  get listenerCount(): number {
    return this.bus.listenerCount('event');
  }

  /**
   * Adds a listener. Returns a function that removes it.
   */
  addListener(listener: GameEventListener<T>): Unsubscribe {
    return this.bus.on('event', listener);
  }

  /**
   * Adds a listener that runs once. Returns a function that removes it.
   */
  addListenerOnce(listener: GameEventListener<T>): Unsubscribe {
    return this.bus.once('event', listener);
  }

  /**
   * Notifies every listener. Events without a payload (`new GameEvent()`) are invoked with no argument.
   */
  invoke(...payload: [T] extends [undefined] ? [] : [T]): void {
    this.bus.emit('event', payload[0] as T);
  }

  /**
   * Removes every listener.
   */
  removeAllListeners(): void {
    this.bus.clear();
  }
}
