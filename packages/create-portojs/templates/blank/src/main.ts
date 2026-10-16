import { Component, Game } from 'portojs';

/**
 * A component is behaviour attached to a game object, like a Unity MonoBehaviour.
 * `fixedUpdate` runs once per fixed step (100 ms by default), whatever the frame rate.
 */
class Clock extends Component {
  static override typeId = 'Clock';
  seconds = 0;

  override fixedUpdate(deltaTime: number): void {
    this.seconds += deltaTime;
  }

  override onSave(): number {
    return this.seconds;
  }

  override onLoad(data?: unknown): void {
    this.seconds = typeof data === 'number' ? data : 0;
  }
}

const game = new Game();
const clock = game.createObject('Clock').addComponent(Clock);

const app = document.getElementById('app') as HTMLElement;
game.on('tick', () => {
  app.textContent = `This game has run for ${clock.seconds.toFixed(1)} seconds.`;
});

game.start();
