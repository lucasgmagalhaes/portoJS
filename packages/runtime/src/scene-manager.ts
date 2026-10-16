import type { CreateObjectOptions, Game } from './game.ts';
import { GameEvent } from './game-event.ts';
import type { GameObject } from './game-object.ts';
import { ComponentRegistry, loadScene } from './scene.ts';

/**
 * What a scene builder receives to create its objects. Objects made through it belong to the
 * scene and are destroyed when the scene unloads.
 */
export interface SceneContext {
  /**
   * The game.
   */
  readonly game: Game;
  /**
   * Name of the scene being loaded.
   */
  readonly name: string;
  /**
   * Like `game.createObject`, but the object belongs to this scene.
   */
  createObject(name: string, options?: CreateObjectOptions): GameObject;
}

/**
 * Code that builds a scene. It may be async, for example to wait for assets.
 */
export type SceneBuilder = (context: SceneContext) => void | Promise<void>;

/**
 * A scene: a JSON description for {@link loadScene}, or a builder function.
 */
export type SceneSource = SceneBuilder | { readonly objects: readonly unknown[] };

/**
 * A visual transition around a scene change, such as a fade. Both steps may be async.
 */
export interface SceneTransition {
  /**
   * Runs before the old scene is unloaded, for example fading to black.
   */
  readonly out?: () => void | Promise<void>;
  /**
   * Runs after the new scene is loaded, for example fading back in.
   */
  readonly in?: () => void | Promise<void>;
}

/**
 * Options of {@link SceneManager.load}.
 */
export interface SceneLoadOptions {
  /**
   * Transition played around the change.
   */
  readonly transition?: SceneTransition;
}

/**
 * Options of a {@link SceneManager}.
 */
export interface SceneManagerOptions {
  /**
   * Needed to load JSON scenes: maps component type ids to classes.
   */
  readonly registry?: ComponentRegistry;
}

/**
 * Registers scenes by name and loads, adds and unloads them with a managed lifecycle.
 *
 * Objects created by a scene are destroyed when it unloads, unless you call
 * {@link SceneManager.persist} on them. Saves only hold live objects, so keep state that must
 * outlive a scene on persistent objects.
 *
 * @example
 * const scenes = new SceneManager(game);
 * scenes.register('menu', (ctx) => { ctx.createObject('Title'); });
 * scenes.register('level1', levelJson);
 * await scenes.load('menu');
 * await scenes.load('level1', { transition: fade });
 */
export class SceneManager {
  /**
   * Fires after a scene finished loading.
   */
  readonly loaded = new GameEvent<{ name: string; additive: boolean }>();
  /**
   * Fires after a scene was unloaded.
   */
  readonly unloaded = new GameEvent<string>();

  private readonly sources = new Map<string, SceneSource>();
  private readonly owned = new Map<string, GameObject[]>();
  private readonly kept = new Set<GameObject>();
  private currentName: string | undefined;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly game: Game,
    private readonly options: SceneManagerOptions = {},
  ) {}

  /**
   * Name of the scene last loaded in single mode, or `undefined`.
   */
  get current(): string | undefined {
    return this.currentName;
  }

  /**
   * Names of every scene that is loaded now, in load order.
   */
  get loadedScenes(): readonly string[] {
    return [...this.owned.keys()];
  }

  /**
   * Registers a scene under a name.
   *
   * @throws {Error} if the name is taken.
   */
  register(name: string, source: SceneSource): this {
    if (this.sources.has(name)) throw new Error(`SceneManager: "${name}" is already registered`);
    this.sources.set(name, source);
    return this;
  }

  /**
   * Whether a scene is registered.
   */
  has(name: string): boolean {
    return this.sources.has(name);
  }

  /**
   * Whether a scene is loaded now.
   */
  isLoaded(name: string): boolean {
    return this.owned.has(name);
  }

  /**
   * Keeps an object alive across scene changes, like Unity's `DontDestroyOnLoad`.
   */
  persist(object: GameObject): void {
    this.kept.add(object);
    for (const objects of this.owned.values()) {
      const index = objects.indexOf(object);
      if (index >= 0) objects.splice(index, 1);
    }
  }

  /**
   * Replaces every loaded scene with `name`. Persistent objects stay. Loads are queued, so
   * calling this twice runs the changes in order.
   *
   * @throws {Error} if the scene is not registered or its builder fails; the scene is then not
   * loaded.
   */
  load(name: string, options: SceneLoadOptions = {}): Promise<void> {
    this.requireSource(name);
    return this.enqueue(this.replace, { name, options });
  }

  /**
   * Adds `name` next to the scenes already loaded. Does nothing if it is loaded.
   *
   * @throws {Error} if the scene is not registered or its builder fails.
   */
  loadAdditive(name: string): Promise<void> {
    this.requireSource(name);
    return this.enqueue(this.add, { name });
  }

  /**
   * Destroys the objects of a scene. Does nothing if it is not loaded.
   */
  unload(name: string): Promise<void> {
    return this.enqueue(this.remove, { name });
  }

  private requireSource(name: string): void {
    if (!this.sources.has(name)) throw new Error(`SceneManager: unknown scene "${name}"`);
  }

  private enqueue<A>(task: (argument: A) => Promise<void>, argument: A): Promise<void> {
    const run = this.queue.then(task.bind(this, argument), task.bind(this, argument));
    this.queue = run.catch(ignore);
    return run;
  }

  private readonly replace = async (argument: {
    name: string;
    options: SceneLoadOptions;
  }): Promise<void> => {
    const { name, options } = argument;
    await options.transition?.out?.();
    for (const loadedName of [...this.owned.keys()]) this.destroyScene(loadedName);
    this.currentName = undefined;
    await this.build(name, false);
    this.currentName = name;
    await options.transition?.in?.();
  };

  private readonly add = async (argument: { name: string }): Promise<void> => {
    if (this.owned.has(argument.name)) return;
    await this.build(argument.name, true);
  };

  private readonly remove = (argument: { name: string }): Promise<void> => {
    this.destroyScene(argument.name);
    if (this.currentName === argument.name) this.currentName = undefined;
    return Promise.resolve();
  };

  private async build(name: string, additive: boolean): Promise<void> {
    const source = this.sources.get(name);
    if (source === undefined) throw new Error(`SceneManager: unknown scene "${name}"`);
    const objects: GameObject[] = [];
    try {
      if (typeof source === 'function') {
        const context: SceneContext = {
          game: this.game,
          name,
          createObject: (objectName, createOptions) => {
            const object = this.game.createObject(objectName, createOptions);
            objects.push(object);
            return object;
          },
        };
        await source(context);
      } else {
        const registry = this.options.registry ?? new ComponentRegistry();
        objects.push(...loadScene(this.game, source, registry));
      }
    } catch (error) {
      for (const object of objects) object.destroy();
      throw error;
    }
    this.owned.set(name, objects.filter(this.isNotKept));
    this.loaded.invoke({ name, additive });
  }

  private readonly isNotKept = (object: GameObject): boolean => !this.kept.has(object);

  private destroyScene(name: string): void {
    const objects = this.owned.get(name);
    if (objects === undefined) return;
    this.owned.delete(name);
    for (const object of objects) object.destroy();
    this.unloaded.invoke(name);
  }
}

function ignore(): void {
  return;
}
