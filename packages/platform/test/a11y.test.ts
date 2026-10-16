import { describe, expect, it } from 'vitest';
import { Announcer, UserPreferences, readSafeArea } from '../src/index.ts';
import type { DocumentLike, ElementLike, MediaQueryLike } from '../src/index.ts';

class FakeQuery implements MediaQueryLike {
  matches: boolean;
  private readonly listeners = new Set<() => void>();
  constructor(matches = false) {
    this.matches = matches;
  }
  addEventListener(_type: 'change', listener: () => void): void {
    this.listeners.add(listener);
  }
  removeEventListener(_type: 'change', listener: () => void): void {
    this.listeners.delete(listener);
  }
  set(matches: boolean): void {
    this.matches = matches;
    for (const listener of [...this.listeners]) listener();
  }
  get count(): number {
    return this.listeners.size;
  }
}

function media(initial: Record<string, boolean> = {}): { match: (query: string) => FakeQuery; queries: Map<string, FakeQuery> } {
  const queries = new Map<string, FakeQuery>();
  return {
    queries,
    match: (query) => {
      const found = queries.get(query) ?? new FakeQuery(initial[query] ?? false);
      queries.set(query, found);
      return found;
    },
  };
}

describe('UserPreferences', () => {
  it('reads the current settings and follows changes', () => {
    const { match, queries } = media({ '(prefers-reduced-motion: reduce)': true, '(orientation: portrait)': true });
    const prefs = new UserPreferences(match);
    expect(prefs.current).toEqual({ reducedMotion: true, highContrast: false, dark: false, orientation: 'portrait' });
    const seen: boolean[] = [];
    prefs.onChange = (next) => void seen.push(next.dark);
    queries.get('(prefers-color-scheme: dark)')?.set(true);
    queries.get('(orientation: portrait)')?.set(false);
    expect(seen).toEqual([true, true]);
    expect(prefs.current.orientation).toBe('landscape');
  });

  it('zeroes durations for reduced motion and stops listening on dispose', () => {
    const { match, queries } = media();
    const prefs = new UserPreferences(match);
    expect(prefs.motion(300)).toBe(300);
    queries.get('(prefers-reduced-motion: reduce)')?.set(true);
    expect(prefs.motion(300)).toBe(0);
    prefs.dispose();
    expect([...queries.values()].every((query) => query.count === 0)).toBe(true);
  });
});

class FakeElement implements ElementLike {
  textContent: string | null = '';
  readonly attributes = new Map<string, string>();
  readonly style = { cssText: '' };
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
}

describe('Announcer', () => {
  function setup(): { announcer: Announcer; elements: FakeElement[] } {
    const elements: FakeElement[] = [];
    const doc: DocumentLike = {
      createElement: () => {
        const element = new FakeElement();
        elements.push(element);
        return element;
      },
      body: { appendChild: () => undefined },
    };
    return { announcer: new Announcer(doc), elements };
  }

  it('creates a polite status region and an assertive alert region, hidden from sight', () => {
    const { elements } = setup();
    expect(elements).toHaveLength(2);
    expect(elements[0]?.attributes.get('aria-live')).toBe('polite');
    expect(elements[0]?.attributes.get('role')).toBe('status');
    expect(elements[1]?.attributes.get('aria-live')).toBe('assertive');
    expect(elements[1]?.attributes.get('role')).toBe('alert');
    expect(elements[0]?.style.cssText).toContain('clip');
  });

  it('writes messages to the right region and repeats identical ones', () => {
    const { announcer, elements } = setup();
    announcer.announce('Level 3 complete');
    announcer.announce('Health low', 'assertive');
    expect(elements[0]?.textContent).toBe('Level 3 complete');
    expect(elements[1]?.textContent).toBe('Health low');
    announcer.announce('Level 3 complete');
    expect(elements[0]?.textContent).toBe('Level 3 complete ');
    announcer.announce('Level 3 complete');
    expect(elements[0]?.textContent).toBe('Level 3 complete');
  });

  it('clears both regions', () => {
    const { announcer, elements } = setup();
    announcer.announce('a');
    announcer.announce('b', 'assertive');
    announcer.clear();
    expect(elements.map((e) => e.textContent)).toEqual(['', '']);
    announcer.announce('a');
    expect(elements[0]?.textContent).toBe('a');
  });
});

describe('readSafeArea', () => {
  it('sets the env() padding on the probe and parses the computed pixels', () => {
    const probe = { style: { cssText: '' } };
    const area = readSafeArea(probe, () => ({
      paddingTop: '44px',
      paddingRight: '0px',
      paddingBottom: '34.5px',
      paddingLeft: '',
    }));
    expect(probe.style.cssText).toContain('env(safe-area-inset-top)');
    expect(area).toEqual({ top: 44, right: 0, bottom: 34.5, left: 0 });
  });
});
