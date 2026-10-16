/**
 * The part of `navigator.serviceWorker` that {@link registerServiceWorker} uses.
 */
export interface ServiceWorkerHost {
  register(url: string, options?: { scope?: string }): Promise<ServiceWorkerRegistrationLike>;
  readonly controller: unknown;
  addEventListener(type: 'controllerchange', listener: () => void): void;
}

/**
 * The part of a `ServiceWorkerRegistration` that is used.
 */
export interface ServiceWorkerRegistrationLike {
  readonly waiting: WorkerLike | null;
  readonly installing: WorkerLike | null;
  addEventListener(type: 'updatefound', listener: () => void): void;
  update?(): Promise<unknown>;
}

/**
 * The part of a `ServiceWorker` that is used.
 */
export interface WorkerLike {
  readonly state: string;
  postMessage(message: unknown): void;
  addEventListener(type: 'statechange', listener: () => void): void;
}

/**
 * Options of {@link registerServiceWorker}.
 */
export interface RegisterOptions {
  /**
   * Called when a new version is downloaded and waiting. Show an "update available" button that
   * calls `applyUpdate`.
   */
  readonly onUpdateReady?: (applyUpdate: () => void) => void;
  /**
   * Called once the first install has cached the game, so it now works offline.
   */
  readonly onOfflineReady?: () => void;
  /**
   * Called when registering fails.
   */
  readonly onError?: (error: unknown) => void;
  /**
   * Reloads the page after an update is applied. Default: `location.reload()`.
   */
  readonly reload?: () => void;
  readonly scope?: string;
}

/**
 * Registers the service worker and reports the two moments a game cares about: offline play is
 * ready, and a new version is waiting. The new version only takes over when you call the
 * `applyUpdate` you were given (for example from a button), then the page reloads.
 *
 * @returns whether a worker was registered (`false` when the browser has none or it failed).
 */
export async function registerServiceWorker(
  url: string,
  host: ServiceWorkerHost | undefined,
  options: RegisterOptions = {},
): Promise<boolean> {
  if (host === undefined) return false;
  const reload = options.reload ?? reloadPage;
  let registration: ServiceWorkerRegistrationLike;
  try {
    registration = await host.register(url, options.scope !== undefined ? { scope: options.scope } : {});
  } catch (error) {
    options.onError?.(error);
    return false;
  }
  let applying = false;
  const onControllerChange = (): void => {
    if (applying) reload();
  };
  host.addEventListener('controllerchange', onControllerChange);
  const announce = (worker: WorkerLike): void => {
    if (host.controller === null || host.controller === undefined) {
      options.onOfflineReady?.();
      return;
    }
    const applyUpdate = (): void => {
      applying = true;
      worker.postMessage('SKIP_WAITING');
    };
    options.onUpdateReady?.(applyUpdate);
  };
  if (registration.waiting) announce(registration.waiting);
  const onUpdateFound = (): void => {
    const worker = registration.installing;
    if (!worker) return;
    const onStateChange = (): void => {
      if (worker.state === 'installed') announce(worker);
    };
    worker.addEventListener('statechange', onStateChange);
  };
  registration.addEventListener('updatefound', onUpdateFound);
  return true;
}

function reloadPage(): void {
  globalThis.location.reload();
}

/**
 * The outcome of the install dialog.
 */
export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable';

interface InstallEvent {
  preventDefault(): void;
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ readonly outcome: string }>;
}

/**
 * The window events {@link InstallPrompt} listens to.
 */
export interface InstallTarget {
  addEventListener(type: string, listener: (event: never) => void): void;
}

/**
 * Lets a game show its own "Install" button. Chrome and Edge offer the install dialog only
 * after a `beforeinstallprompt` event; this keeps that event until the player taps the button.
 * Safari on iOS has no such event: tell those players to use "Add to Home Screen".
 *
 * @example
 * const install = new InstallPrompt(window);
 * install.onChange = () => (button.hidden = !install.available);
 * button.onclick = () => install.prompt();
 */
export class InstallPrompt {
  private event: InstallEvent | undefined;
  private done = false;

  /**
   * Called when `available` or `installed` changes.
   */
  onChange: (() => void) | undefined;

  constructor(target: InstallTarget) {
    target.addEventListener('beforeinstallprompt', this.capture);
    target.addEventListener('appinstalled', this.markInstalled);
  }

  /**
   * Whether {@link InstallPrompt.prompt} can show the install dialog now.
   */
  get available(): boolean {
    return this.event !== undefined && !this.done;
  }

  /**
   * Whether the game has been installed.
   */
  get installed(): boolean {
    return this.done;
  }

  /**
   * Shows the install dialog. Call it from a click.
   */
  async prompt(): Promise<InstallOutcome> {
    const event = this.event;
    if (event === undefined || this.done) return 'unavailable';
    this.event = undefined;
    await event.prompt();
    const choice = await event.userChoice;
    this.onChange?.();
    return choice.outcome === 'accepted' ? 'accepted' : 'dismissed';
  }

  private readonly capture = (event: InstallEvent): void => {
    event.preventDefault();
    this.event = event;
    this.onChange?.();
  };

  private readonly markInstalled = (): void => {
    this.done = true;
    this.event = undefined;
    this.onChange?.();
  };
}
