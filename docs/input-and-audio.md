# Input and audio

Two optional packages for the things a playable game needs besides simulation and drawing:

```
pnpm add @portojs/input @portojs/audio
```

## Input

`@portojs/input` reads the keyboard, mouse, touch, pen and gamepads and turns them into one state you can query on every fixed step.

```ts
import { Input } from '@portojs/input';

const input = new Input({ pointerTarget: canvas });
input.bind('jump', 'key:Space', 'pad:0:0');
input.bind('left', 'key:ArrowLeft', 'key:KeyA');
input.bind('right', 'key:ArrowRight', 'key:KeyD');

function step() {
  player.x += input.axis('left', 'right') * speed;
  if (input.wasPressed('jump')) player.jump();
  input.endFrame();
}
```

- Bindings are strings: `key:<code>` (physical key codes such as `Space` or `KeyA`, independent of layout), `pointer:Button0` (left button, a touch or a pen tip; `Button1` middle, `Button2` right) and `pad:<pad>:<button>`.
- `isDown` is true while held. `wasPressed` and `wasReleased` are true for exactly one step; call `endFrame()` after you read them. It also clears the wheel delta and polls the gamepads for the next step.
- Pointer positions are in the target's drawing space: for a canvas that is canvas pixels, so they go straight into `Camera2D.screenToWorld`. `pointer.touches` lists every finger in contact.
- Losing focus releases every key, so nothing stays stuck.
- `new Keyboard(target, { preventDefault: ['Space', 'ArrowUp'] })` cancels the default browser action of those keys so the page does not scroll.

### Inside a game

`InputComponent` owns an `Input` and ends the step for you. It runs after every other component, so edges last exactly one step, and it removes its listeners when destroyed:

```ts
import { InputComponent } from '@portojs/input';

const { input } = game
  .createObject('Input')
  .addComponent(InputComponent, { pointerTarget: canvas });
input.bind('shoot', 'pointer:Button0');
```

Gamepads have no events, so they are read once per step. Pass `gamepads: { provider, deadzone }` to `Input` to supply your own source (useful in tests).

## Audio

`@portojs/audio` is a small mixer on top of Web Audio: a master volume, named buses, sound loading and playback control.

```ts
import { AudioEngine } from '@portojs/audio';

const audio = new AudioEngine();
audio.unlockOnGesture(window);

const jump = await audio.load('/jump.ogg');
const music = await audio.load('/theme.ogg');

audio.setBusVolume('music', 0.4);
audio.play(music, { bus: 'music', loop: true });

const shot = audio.play(jump, { volume: 0.8, rate: 1.2, pan: -0.5 });
shot.volume = 0.5;
await shot.ended;
```

- Browsers keep audio suspended until the user interacts. `unlockOnGesture(target)` resumes the context on the first click, key press or touch and then stops listening.
- A sound is decoded once and can be played many times. Each `play` returns a `Playback` with `volume`, `rate`, `pan`, `stop()`, `isPlaying` and an `ended` promise.
- Buses (`sfx` by default, `music`, anything you name) share the master volume. `stopAll()` stops everything that is playing.
- `AudioManager` is a component that owns an engine for a game: audio suspends while it is inactive, resumes when active again and the context closes when it is destroyed.

```ts
import { AudioManager } from '@portojs/audio';

const { engine } = game.createObject('Audio').addComponent(AudioManager);
engine.unlockOnGesture(window);
```

Both packages are covered by automated tests that use fake targets and a fake audio context, so they run in plain Node without a browser.
