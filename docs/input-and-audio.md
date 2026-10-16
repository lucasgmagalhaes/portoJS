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

## Clicking objects and gestures

### Per-object pointer events

Add a `PointerSystem` once, then give any object a `Pointable` with a hit test. The system finds the top-most object under the pointer (highest `order`, then the newest) and raises events on it:

```ts
import { Pointable, PointerSystem, rectHitTest } from '@portojs/input';

game.createObject('Pointer').addComponent(PointerSystem, {
  pointer,
  toWorld: (x, y) => camera.screenToWorld(x, y),
});

const play = game.createObject('Play').addComponent(Pointable, {
  hitTest: rectHitTest(() => ({ x: 10, y: 10, width: 120, height: 40 })),
});
play.click.addListener(() => startGame());
play.pointerEnter.addListener(() => highlight(true));
play.pointerExit.addListener(() => highlight(false));
```

Events: `pointerDown`, `pointerUp`, `click` (press and release on the object, without a drag), `pointerEnter`, `pointerExit`, `dragStart`, `drag` and `dragEnd`. Each carries the pointer id, the position in drawing space and in world space, and `dx`/`dy` for drags. A drag keeps going when the pointer leaves the object. `rectHitTest` and `circleHitTest` read their shape on every test, so they follow a moving object; any `(worldX, worldY) => boolean` works. Disabled objects and objects whose game object is inactive are skipped.

### Gestures

`GestureRecognizer` turns the stream of a `Pointer` into taps, double taps, long presses, swipes, pans and pinches:

```ts
import { GestureRecognizer } from '@portojs/input';

const gestures = new GestureRecognizer();
gestures.attach(pointer);
gestures.tap.addListener(({ x, y }) => select(x, y));
gestures.swipe.addListener(({ direction }) => flick(direction));
gestures.pan.addListener(({ dx, dy }) => camera.move(-dx, -dy));
gestures.pinch.addListener(({ delta }) => (camera.zoom *= delta));

// every step, with the clock the events use (performance.now() for browser events)
gestures.update(performance.now());
```

Thresholds (`tapMaxMs`, `longPressMs`, `swipeMinDistance`, `panThreshold` and others) are options. Only the primary button counts. A second finger ends any pan in progress and starts a pinch. `update` is what lets a long press fire while the finger is still down. `pointer.events` also gives you the raw down, move, up and cancel stream if you need something else.

## Touch controls, remapping and forgiving input

### On-screen controls

`VirtualControls` is a thumb stick and buttons for touch screens. Each finger is tracked on its own, so the player can steer and press a button at once. Regions are in the pointer's drawing space (canvas pixels).

```ts
import { Input, VirtualControls } from '@portojs/input';

const input = new Input({ pointerTarget: canvas });
const controls = new VirtualControls({
  joystick: {
    region: { kind: 'rect', x: 0, y: 200, width: 200, height: 200 }, // where a touch starts the stick
    radius: 60, // how far is "fully pushed"
    floating: true, // centre it where the touch lands
    deadZone: 0.15,
  },
  buttons: {
    jump: { kind: 'circle', x: 700, y: 330, radius: 40 },
    fire: { kind: 'rect', x: 600, y: 300, width: 40, height: 40 },
  },
});
controls.attach(input.pointer);
input.addSource('virtual', controls);

input.bind('left', 'key:KeyA', 'virtual:stick-left');
input.bind('jump', 'key:Space', 'virtual:jump');
player.move(controls.x, controls.y); // the analog push, -1 to 1
```

The stick also presses `stick-left`, `stick-right`, `stick-up` and `stick-down` when pushed past half way, so it can drive the same actions as the keys. `controls.stickActive` and `controls.stickOrigin` tell you where to draw it. `reset()` lets go of everything, for example when the game is paused.

`input.addSource(name, source)` accepts anything that reports buttons by id (`isDown`, `wasPressed`, `wasReleased` and an optional `endFrame`), so you can plug in your own.

### Letting players rebind keys

```ts
const saved = input.exportBindings(); // { jump: ['key:Space', 'virtual:jump'], ... }, plain JSON
localStorage.setItem('controls', JSON.stringify(saved));

input.importBindings(JSON.parse(localStorage.getItem('controls') ?? '{}'));
input.bindingsOf('jump'); // what a settings screen shows
input.bind('jump', 'key:KeyW'); // the rebind itself
```

`importBindings` changes nothing if any entry is invalid.

### Jump buffering and coyote time

Two tiny helpers make platformers feel fair. Both take the time in seconds of game time.

```ts
import { CoyoteTime, InputBuffer } from '@portojs/input';

const jumpBuffer = new InputBuffer(0.15); // a jump pressed just before landing still happens
const coyote = new CoyoteTime(0.1); // a jump just after leaving a ledge still works

if (input.wasPressed('jump')) jumpBuffer.press(time);
if (onGround) coyote.touch(time);
if (coyote.allows(time) && jumpBuffer.consume(time)) {
  player.jump();
  coyote.spend(); // no second jump in the air
}
```
