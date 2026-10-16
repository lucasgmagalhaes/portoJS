import { Component, GameEvent } from '@portojs/runtime';
import type { GameObject } from '@portojs/runtime';
import type { AssetLoader } from './asset-loader.ts';
import type { LoadProgress } from './types.ts';

/**
 * Options of a {@link Preloader}.
 */
export interface PreloaderOptions {
  /**
   * The loader to drive.
   */
  readonly loader: AssetLoader;
  /**
   * Bundles to load, in order, when the component starts.
   */
  readonly bundles: readonly string[];
}

const IDLE: LoadProgress = { loaded: 0, total: 0, ratio: 0, name: undefined };

/**
 * Loads bundles when the game starts and reports progress, for a loading screen. Read
 * {@link Preloader.progress} every frame, or listen to the events.
 *
 * @example
 * const preloader = game.createObject('Preloader').addComponent(Preloader, {
 *   loader: assets,
 *   bundles: ['boot', 'level1'],
 * });
 * preloader.completed.addListener(() => scenes.load('menu'));
 */
export class Preloader extends Component {
  static override typeId = 'Preloader';

  /**
   * Fires after every asset, with progress across all bundles.
   */
  readonly progressed = new GameEvent<LoadProgress>();
  /**
   * Fires once when every bundle is loaded.
   */
  readonly completed = new GameEvent();
  /**
   * Fires if loading fails.
   */
  readonly failed = new GameEvent<Error>();

  private current: LoadProgress = IDLE;
  private doneFlag = false;

  constructor(
    gameObject: GameObject,
    private readonly options: PreloaderOptions,
  ) {
    super(gameObject);
  }

  /**
   * Progress across all bundles so far.
   */
  get progress(): LoadProgress {
    return this.current;
  }

  /**
   * `true` once everything is loaded.
   */
  get isDone(): boolean {
    return this.doneFlag;
  }

  override start(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      const { loader, bundles } = this.options;
      let finished = 0;
      let total = 0;
      for (const bundle of bundles) {
        const before = finished;
        await loader.loadBundle(bundle, {
          onProgress: (p) => {
            total = Math.max(total, before + p.total);
            this.current = {
              loaded: before + p.loaded,
              total,
              ratio: total === 0 ? 1 : (before + p.loaded) / total,
              name: p.name,
            };
            this.progressed.invoke(this.current);
          },
        });
        finished = this.current.loaded;
      }
      this.current = { ...this.current, ratio: 1 };
      this.doneFlag = true;
      this.completed.invoke();
    } catch (error) {
      this.failed.invoke(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
