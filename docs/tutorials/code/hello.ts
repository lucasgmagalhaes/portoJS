import { Component, Game, GameEvent, ManualClock } from 'portojs';

/**
 * A component keeps its own state and behaviour, like a Unity MonoBehaviour.
 */
export class Health extends Component {
  static override typeId = 'Health';

  readonly died = new GameEvent();
  hp = 100;

  override fixedUpdate(deltaTime: number): void {
    this.hp = Math.max(0, this.hp - 5 * deltaTime);
    if (this.hp === 0) this.died.invoke();
  }

  override onSave(): number {
    return this.hp;
  }

  override onLoad(data?: unknown): void {
    this.hp = typeof data === 'number' ? data : 100;
  }
}

/**
 * Builds a game with one player. The clock is fake here so the tutorial is deterministic; a real
 * game leaves it out and uses the system clock.
 */
export function createHello(): { game: Game; clock: ManualClock; health: Health } {
  const clock = new ManualClock(0);
  const game = new Game({ clock });
  const health = game.createObject('Player').addComponent(Health);
  return { game, clock, health };
}

/**
 * Runs the game for ten seconds, saves it, and loads the save into a new game.
 */
export function playAndSave(): { hpAfterTenSeconds: number; restoredHp: number } {
  const { game, clock, health } = createHello();
  game.start();
  clock.advance(10_000);
  game.update();
  const text = game.exportSave();

  const fresh = createHello();
  fresh.game.importSave(text);
  game.dispose();
  return { hpAfterTenSeconds: health.hp, restoredHp: fresh.health.hp };
}
