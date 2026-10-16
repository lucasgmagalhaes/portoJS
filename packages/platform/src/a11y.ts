/**
 * The part of `window.matchMedia` that the preference helpers use.
 */
export type MatchMedia = (query: string) => MediaQueryLike;

/**
 * The part of a `MediaQueryList` that is used.
 */
export interface MediaQueryLike {
  readonly matches: boolean;
  addEventListener(type: 'change', listener: () => void): void;
  removeEventListener(type: 'change', listener: () => void): void;
}

/**
 * Orientation of the screen.
 */
export type Orientation = 'portrait' | 'landscape';

/**
 * What the player asked their device for. Read it to tone effects down or adapt colours.
 */
export interface Preferences {
  /**
   * The player wants less motion: skip screen shake, parallax and flashing, shorten tweens.
   */
  readonly reducedMotion: boolean;
  /**
   * The player wants stronger contrast.
   */
  readonly highContrast: boolean;
  /**
   * The system theme is dark.
   */
  readonly dark: boolean;
  readonly orientation: Orientation;
}

const QUERIES = {
  reducedMotion: '(prefers-reduced-motion: reduce)',
  highContrast: '(prefers-contrast: more)',
  dark: '(prefers-color-scheme: dark)',
  portrait: '(orientation: portrait)',
} as const;

/**
 * Follows the accessibility and display settings of the device and tells you when one changes
 * (the player can flip them while the game runs).
 *
 * @example
 * const prefs = new UserPreferences(window.matchMedia.bind(window));
 * if (prefs.current.reducedMotion) camera.shakeEnabled = false;
 * prefs.onChange = (next) => applyMotion(next.reducedMotion);
 */
export class UserPreferences {
  private readonly queries: Record<keyof typeof QUERIES, MediaQueryLike>;
  /**
   * Called with the new values whenever any of them changes.
   */
  onChange: ((preferences: Preferences) => void) | undefined;

  constructor(matchMedia: MatchMedia) {
    this.queries = {
      reducedMotion: matchMedia(QUERIES.reducedMotion),
      highContrast: matchMedia(QUERIES.highContrast),
      dark: matchMedia(QUERIES.dark),
      portrait: matchMedia(QUERIES.portrait),
    };
    for (const query of Object.values(this.queries)) query.addEventListener('change', this.changed);
  }

  /**
   * The current values.
   */
  get current(): Preferences {
    return {
      reducedMotion: this.queries.reducedMotion.matches,
      highContrast: this.queries.highContrast.matches,
      dark: this.queries.dark.matches,
      orientation: this.queries.portrait.matches ? 'portrait' : 'landscape',
    };
  }

  /**
   * A duration adapted to the player's motion setting: `0` when they asked for reduced motion,
   * otherwise unchanged.
   */
  motion(durationMs: number): number {
    return this.queries.reducedMotion.matches ? 0 : durationMs;
  }

  /**
   * Stops listening.
   */
  dispose(): void {
    for (const query of Object.values(this.queries)) {
      query.removeEventListener('change', this.changed);
    }
    this.onChange = undefined;
  }

  private readonly changed = (): void => {
    this.onChange?.(this.current);
  };
}

/**
 * How urgent an announcement is.
 */
export type AnnouncePriority = 'polite' | 'assertive';

/**
 * The part of a DOM element that {@link Announcer} uses.
 */
export interface ElementLike {
  textContent: string | null;
  setAttribute(name: string, value: string): void;
  readonly style: { cssText: string };
}

/**
 * The part of `document` that {@link Announcer} uses.
 */
export interface DocumentLike {
  createElement(tag: string): ElementLike;
  readonly body: { appendChild(child: ElementLike): unknown };
}

const NO_BREAK_SPACE = String.fromCharCode(0xa0);

const VISUALLY_HIDDEN =
  'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0';

/**
 * Tells screen readers about things a canvas cannot: "Level 3 complete", "Not enough gold".
 * It keeps two invisible ARIA live regions in the page, one for normal messages and one for
 * urgent ones that interrupt.
 *
 * @example
 * const announcer = new Announcer(document);
 * announcer.announce('Level 3 complete');
 * announcer.announce('Health low', 'assertive');
 */
export class Announcer {
  private readonly regions: Record<AnnouncePriority, ElementLike>;
  private readonly last: Record<AnnouncePriority, string> = { polite: '', assertive: '' };
  private readonly flip: Record<AnnouncePriority, boolean> = { polite: false, assertive: false };

  constructor(document: DocumentLike) {
    this.regions = {
      polite: this.createRegion(document, 'polite', 'status'),
      assertive: this.createRegion(document, 'assertive', 'alert'),
    };
  }

  /**
   * Announces a message. Saying the same thing twice in a row is still read twice.
   */
  announce(message: string, priority: AnnouncePriority = 'polite'): void {
    const region = this.regions[priority];
    if (message === this.last[priority]) {
      this.flip[priority] = !this.flip[priority];
    }
    this.last[priority] = message;
    region.textContent = this.flip[priority] ? message + NO_BREAK_SPACE : message;
  }

  /**
   * Empties both regions.
   */
  clear(): void {
    for (const region of Object.values(this.regions)) region.textContent = '';
    this.last.polite = '';
    this.last.assertive = '';
  }

  private createRegion(
    document: DocumentLike,
    live: AnnouncePriority,
    role: string,
  ): ElementLike {
    const element = document.createElement('div');
    element.setAttribute('role', role);
    element.setAttribute('aria-live', live);
    element.setAttribute('aria-atomic', 'true');
    element.style.cssText = VISUALLY_HIDDEN;
    document.body.appendChild(element);
    return element;
  }
}

/**
 * Distances from each screen edge that notches and system bars cover, in CSS pixels.
 */
export interface SafeArea {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

/**
 * Reads `env(safe-area-inset-*)`. Needs `viewport-fit=cover` in the page's viewport meta tag,
 * otherwise browsers report `0`.
 *
 * @param probe an element in the page to read the computed padding from; this function sets
 * its padding to the four insets.
 * @param computed `getComputedStyle` (pass `(el) => getComputedStyle(el)`).
 */
export function readSafeArea(
  probe: { style: { cssText: string } },
  computed: (element: never) => { paddingTop: string; paddingRight: string; paddingBottom: string; paddingLeft: string },
): SafeArea {
  probe.style.cssText =
    'position:fixed;visibility:hidden;pointer-events:none;' +
    'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  const style = computed(probe as never);
  return {
    top: parsePixels(style.paddingTop),
    right: parsePixels(style.paddingRight),
    bottom: parsePixels(style.paddingBottom),
    left: parsePixels(style.paddingLeft),
  };
}

function parsePixels(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
