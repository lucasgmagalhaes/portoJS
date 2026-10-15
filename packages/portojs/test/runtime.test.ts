import { describe, expect, it } from 'vitest';
import { ManualClock, SaveCorruptedError, createSave } from '../src/index.js';
import type { JsonValue } from '../src/index.js';
import { Component, Game, GameEvent } from '../src/index.js';

class Recorder extends Component {
  static override typeId = 'Recorder';
  readonly log: string[] = [];
  readonly changed = new GameEvent<number>();

  override awake(): void {
    this.log.push('awake');
  }

  override onEnable(): void {
    this.log.push('enable');
  }

  override start(): void {
    this.log.push('start');
  }

  override fixedUpdate(deltaTime: number): void {
    this.log.push(`update:${deltaTime}`);
  }

  override onDisable(): void {
    this.log.push('disable');
  }

  override onDestroy(): void {
    this.log.push('destroy');
  }
}

class Counter extends Component {
  static override typeId = 'Counter';
  value = 0;

  override fixedUpdate(deltaTime: number): void {
    this.value += deltaTime;
  }

  override onOffline(elapsedMs: number): void {
    this.value += elapsedMs / 1000;
  }

  override onSave(): JsonValue {
    return this.value;
  }

  override onLoad(data: JsonValue | undefined): void {
    if (data !== undefined && typeof data !== 'number') {
      throw new SaveCorruptedError('Counter: expected a number');
    }
    this.value = data ?? 0;
  }
}

class Fast extends Counter {
  static override typeId = 'Fast';
}

class First extends Component {
  static override executionOrder = -10;
  constructor(
    gameObject: ConstructorParameters<typeof Component>[0],
    readonly sink: string[],
  ) {
    super(gameObject);
  }

  override fixedUpdate(): void {
    this.sink.push('first');
  }
}

class Last extends Component {
  static override executionOrder = 10;
  constructor(
    gameObject: ConstructorParameters<typeof Component>[0],
    readonly sink: string[],
  ) {
    super(gameObject);
  }

  override fixedUpdate(): void {
    this.sink.push('last');
  }
}

function make(stepMs = 100) {
  const clock = new ManualClock(0);
  return { clock, game: new Game({ clock, stepMs }) };
}

describe('Game objects', () => {
  it('creates, finds and destroys objects with unique names', () => {
    const { game } = make();
    const player = game.createObject('Player');
    expect(game.find('Player')).toBe(player);
    expect(game.objects).toEqual([player]);
    expect(() => game.createObject('Player')).toThrow(/already exists/);
    expect(() => game.createObject('')).toThrow(/cannot be empty/);
    player.destroy();
    expect(player.isDestroyed).toBe(true);
    expect(game.find('Player')).toBeUndefined();
    expect(game.createObject('Player')).not.toBe(player);
  });

  it('emits object events', () => {
    const { game } = make();
    const log: string[] = [];
    game.on('objectCreated', ({ object }) => log.push(`created:${object.name}`));
    game.on('objectDestroyed', ({ object }) => log.push(`destroyed:${object.name}`));
    game.createObject('A').destroy();
    expect(log).toEqual(['created:A', 'destroyed:A']);
  });

  it('supports parents and children', () => {
    const { game } = make();
    const parent = game.createObject('Parent');
    const child = game.createObject('Child', { parent });
    expect(child.parent).toBe(parent);
    expect(parent.children).toEqual([child]);
    parent.destroy();
    expect(child.isDestroyed).toBe(true);
    expect(game.objects).toEqual([]);
  });
});

describe('Components', () => {
  it('adds and looks components up, including subclasses', () => {
    const { game } = make();
    const object = game.createObject('Thing');
    const fast = object.addComponent(Fast);
    object.addComponent(Counter);
    expect(object.getComponent(Fast)).toBe(fast);
    expect(object.getComponents(Counter)).toHaveLength(2);
    expect(object.requireComponent(Counter)).toBe(fast);
    expect(fast.getComponent(Counter)).toBe(fast);
    expect(fast.game).toBe(game);
    expect(fast.gameObject).toBe(object);
    expect(() => object.requireComponent(Recorder)).toThrow(/no Recorder component/);
  });

  it('passes options to the constructor with typed arguments', () => {
    const { game } = make();
    const sink: string[] = [];
    const object = game.createObject('Ordered');
    const component = object.addComponent(First, sink);
    expect(component.sink).toBe(sink);
  });

  it('runs the lifecycle in order and updates with the step length in seconds', () => {
    const { game } = make(250);
    const recorder = game.createObject('R').addComponent(Recorder);
    expect(recorder.log).toEqual(['awake', 'enable']);
    game.advance(500);
    expect(recorder.log).toEqual(['awake', 'enable', 'start', 'update:0.25', 'update:0.25']);
    recorder.destroy();
    expect(recorder.log.slice(-2)).toEqual(['disable', 'destroy']);
  });

  it('starts only once and not before the component is active', () => {
    const { game } = make();
    const object = game.createObject('Idle', { active: false });
    const recorder = object.addComponent(Recorder);
    expect(recorder.log).toEqual(['awake']);
    game.advance(200);
    expect(recorder.log).toEqual(['awake']);
    object.setActive(true);
    game.advance(100);
    expect(recorder.log).toEqual(['awake', 'enable', 'start', 'update:0.1']);
  });

  it('respects enabled and active state, with enable/disable callbacks', () => {
    const { game } = make();
    const parent = game.createObject('Parent');
    const child = game.createObject('Child', { parent });
    const recorder = child.addComponent(Recorder);
    game.advance(100);
    recorder.enabled = false;
    expect(recorder.isActive).toBe(false);
    game.advance(100);
    recorder.enabled = true;
    parent.setActive(false);
    expect(child.activeInHierarchy).toBe(false);
    game.advance(100);
    parent.setActive(true);
    expect(recorder.log).toEqual([
      'awake',
      'enable',
      'start',
      'update:0.1',
      'disable',
      'enable',
      'disable',
      'enable',
    ]);
  });

  it('runs components by execution order, then creation order', () => {
    const { game } = make();
    const sink: string[] = [];
    const object = game.createObject('Order');
    object.addComponent(Last, sink);
    object.addComponent(First, sink);
    game.advance(100);
    expect(sink).toEqual(['first', 'last']);
  });

  it('does not run destroyed components and destroys them with their object', () => {
    const { game } = make();
    const object = game.createObject('Doomed');
    const recorder = object.addComponent(Recorder);
    object.destroy();
    expect(recorder.isDestroyed).toBe(true);
    game.advance(100);
    expect(recorder.log).not.toContain('update:0.1');
    expect(() => object.addComponent(Recorder)).toThrow(/is destroyed/);
  });
});

describe('Finding components', () => {
  it('finds components across objects and caches until the structure changes', () => {
    const { game } = make();
    const a = game.createObject('A').addComponent(Counter);
    const b = game.createObject('B').addComponent(Fast);
    expect(game.findObjectOfType(Fast)).toBe(b);
    expect(game.findObjectsOfType(Counter)).toEqual([a, b]);
    const cached = game.findObjectsOfType(Counter);
    expect(game.findObjectsOfType(Counter)).toBe(cached);
    game.createObject('C').addComponent(Counter);
    expect(game.findObjectsOfType(Counter)).toHaveLength(3);
    expect(game.findObjectOfType(Recorder)).toBeUndefined();
  });
});

describe('GameEvent', () => {
  it('notifies listeners and supports removal', () => {
    const event = new GameEvent<number>();
    const seen: number[] = [];
    const off = event.addListener((n) => seen.push(n));
    event.addListenerOnce((n) => seen.push(n * 10));
    event.invoke(1);
    event.invoke(2);
    off();
    event.invoke(3);
    expect(seen).toEqual([1, 10, 2]);
    expect(event.listenerCount).toBe(0);
  });

  it('is invoked without arguments when it has no payload', () => {
    const event = new GameEvent();
    let calls = 0;
    event.addListener(() => {
      calls++;
    });
    event.invoke();
    expect(calls).toBe(1);
    event.removeAllListeners();
    event.invoke();
    expect(calls).toBe(1);
  });

  it('works as a component field', () => {
    const { game } = make();
    const recorder = game.createObject('R').addComponent(Recorder);
    const seen: number[] = [];
    recorder.changed.addListener((n) => seen.push(n));
    recorder.changed.invoke(7);
    expect(seen).toEqual([7]);
  });
});

describe('Game loop and time', () => {
  it('exposes fixed time, tick count and the game events', () => {
    const { clock, game } = make(100);
    const ticks: number[] = [];
    game.on('tick', ({ tick }) => ticks.push(tick));
    clock.advance(350);
    expect(game.update()).toBe(3);
    expect(ticks).toEqual([1, 2, 3]);
    expect(game.time.fixedDeltaTime).toBeCloseTo(0.1, 12);
    expect(game.time.tickCount).toBe(3);
    expect(game.time.time).toBeCloseTo(0.3, 12);
    expect(game.time.deltaTime).toBe(game.time.fixedDeltaTime);
    expect(game.time.fixedTime).toBe(game.time.time);
    expect(game.stepMs).toBe(100);
  });

  it('starts and stops through the scheduler with events', () => {
    const clock = new ManualClock(0);
    let callback: (() => void) | undefined;
    const game = new Game({
      clock,
      scheduler: {
        start(cb) {
          callback = cb;
          return () => {
            callback = undefined;
          };
        },
      },
    });
    const log: string[] = [];
    game.on('start', () => log.push('start'));
    game.on('stop', () => log.push('stop'));
    const counter = game.createObject('C').addComponent(Counter);
    game.start();
    game.start();
    clock.advance(300);
    callback?.();
    expect(counter.value).toBeCloseTo(0.3, 9);
    game.stop();
    game.stop();
    expect(log).toEqual(['start', 'stop']);
    expect(game.running).toBe(false);
  });

  it('validates options', () => {
    expect(() => new Game({ version: 0 })).toThrow(RangeError);
    expect(() => new Game({ maxSaveChars: 0 })).toThrow(RangeError);
    expect(() => new Game({ offline: { efficiency: 2 } })).toThrow(RangeError);
    expect(() => new Game({ stepMs: 0 })).toThrow(RangeError);
  });

  it('dispose stops the loop, destroys objects and drops listeners', () => {
    const { game } = make();
    let ticks = 0;
    game.on('tick', () => {
      ticks++;
    });
    const recorder = game.createObject('R').addComponent(Recorder);
    game.dispose();
    expect(game.objects).toEqual([]);
    expect(recorder.isDestroyed).toBe(true);
    game.advance(100);
    expect(ticks).toBe(0);
  });
});

describe('Saves', () => {
  function build() {
    const { clock, game } = make();
    const a = game.createObject('A').addComponent(Counter);
    const object = game.createObject('B');
    const b1 = object.addComponent(Counter);
    const b2 = object.addComponent(Counter);
    return { clock, game, a, b1, b2 };
  }

  it('round-trips component data keyed by object and component type', () => {
    const first = build();
    first.a.value = 1;
    first.b1.value = 2;
    first.b2.value = 3;
    const save = first.game.save();
    expect(save.data).toEqual({
      objects: { A: { Counter: 1 }, B: { Counter: 2, 'Counter#2': 3 } },
    });

    const second = build();
    second.game.load(JSON.parse(JSON.stringify(save)) as typeof save, { offline: false });
    expect([second.a.value, second.b1.value, second.b2.value]).toEqual([1, 2, 3]);
  });

  it('gives components missing from the save their defaults, and reset restores them', () => {
    const { game, a } = build();
    a.value = 9;
    game.load(createSave(1, 0, {}), { offline: false });
    expect(a.value).toBe(0);
    a.value = 5;
    game.reset();
    expect(a.value).toBe(0);
  });

  it('is atomic: a rejected component restores the previous state', () => {
    const { game, a, b1 } = build();
    a.value = 4;
    b1.value = 5;
    const poisoned = createSave(1, 0, { objects: { A: { Counter: 99 }, B: { Counter: 'bad' } } });
    expect(() => game.load(poisoned, { offline: false })).toThrow(SaveCorruptedError);
    expect([a.value, b1.value]).toEqual([4, 5]);
  });

  it('exports and imports strings and emits saved and loaded events', () => {
    const { game, a } = build();
    const log: string[] = [];
    game.on('saved', () => log.push('saved'));
    game.on('loaded', () => log.push('loaded'));
    a.value = 8;
    const text = game.exportSave();
    a.value = 1;
    game.importSave(text, { offline: false });
    expect(a.value).toBe(8);
    expect(log).toEqual(['saved', 'loaded']);
  });

  it('rejects oversized strings and migrates old versions', () => {
    const { game } = build();
    const small = new Game({ maxSaveChars: 30 });
    expect(() => small.load(game.exportSave())).toThrow(/too large/);

    const versioned = new Game({
      clock: new ManualClock(0),
      version: 2,
      migrations: { 1: (data) => ({ ...data, migrated: true }) },
    });
    const old = createSave(1, 0, { objects: {} });
    expect(() => versioned.load(old, { offline: false })).not.toThrow();
  });
});

describe('Offline progress', () => {
  it('credits away-time to active components on load, honouring cap and efficiency', () => {
    const clock = new ManualClock(0);
    const game = new Game({ clock, offline: { maxMs: 10_000, efficiency: 0.5 } });
    const counter = game.createObject('C').addComponent(Counter);
    const save = game.save();
    clock.advance(60_000);
    const report = game.load(save);
    expect(report?.status).toBe('capped');
    expect(counter.value).toBeCloseTo(5, 9);
  });

  it('skips disabled components, supports manual simulation and reports events', () => {
    const { game } = make();
    const counter = game.createObject('C').addComponent(Counter);
    const sources: string[] = [];
    game.on('offline', (report) => sources.push(report.source));
    counter.enabled = false;
    game.simulateOffline(5000);
    expect(counter.value).toBe(0);
    counter.enabled = true;
    game.simulateOffline(5000);
    expect(counter.value).toBeCloseTo(5, 9);
    expect(sources).toEqual(['manual', 'manual']);
  });

  it('credits time dropped by the catch-up cap as background offline time', () => {
    const clock = new ManualClock(0);
    const game = new Game({ clock, maxCatchUpTicks: 10, offline: { efficiency: 0.5 } });
    const counter = game.createObject('C').addComponent(Counter);
    const dropped: number[] = [];
    game.on('overflow', ({ droppedMs }) => dropped.push(droppedMs));
    clock.advance(100_000);
    game.update();
    expect(dropped).toEqual([99_000]);
    expect(counter.value).toBeCloseTo(1 + (99_000 * 0.5) / 1000, 6);
  });

  it('does not tick the loaded state for time that passed before the load', () => {
    const { clock, game } = make();
    const counter = game.createObject('C').addComponent(Counter);
    const save = game.save();
    clock.advance(1000);
    game.load(save, { offline: false });
    expect(game.update()).toBe(0);
    expect(counter.value).toBe(0);
  });
});
