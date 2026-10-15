// @vitest-environment happy-dom
import { ManualClock } from '@portojs/core';
import type { JsonValue } from '@portojs/core';
import { Component, Game } from '@portojs/runtime';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Devtools } from '../src/index.ts';

class Counter extends Component {
  static override typeId = 'Counter';
  value = 0;

  override fixedUpdate(): void {
    this.value += 1;
  }

  override onSave(): JsonValue {
    return { value: this.value };
  }

  override onLoad(data?: unknown): void {
    this.value =
      typeof data === 'object' && data !== null && 'value' in data ? Number(data.value) : 0;
  }
}

class Plain extends Component {}

function make() {
  const game = new Game({ clock: new ManualClock(0), stepMs: 100 });
  const counter = game.createObject('Counter').addComponent(Counter);
  const parent = game.find('Counter');
  const child = game.createObject('Child', parent === undefined ? {} : { parent });
  child.addComponent(Plain);
  child.setActive(false);
  return { game, counter };
}

afterEach(cleanup);

describe('Devtools', () => {
  it('shows the tree with states and follows the game', () => {
    const { game } = make();
    const { container } = render(<Devtools game={game} refreshEveryTicks={2} />);
    expect(container.textContent).toContain('Counter');
    expect(container.textContent).toContain('Child (inactive)');
    expect(container.querySelector('.pj-status')?.textContent).toContain('tick 0');
    act(() => {
      game.advance(400);
    });
    expect(container.querySelector('.pj-status')?.textContent).toContain('tick 4');
    expect((container.querySelector('textarea') as HTMLTextAreaElement).value).toContain('4');
  });

  it('applies edits through onLoad and reports invalid JSON', () => {
    const { game, counter } = make();
    const { container } = render(<Devtools game={game} />);
    const area = container.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(area, { target: { value: '{"value": 9}' } });
    fireEvent.click(screen.getByText('Apply'));
    expect(counter.value).toBe(9);
    expect((container.querySelector('textarea') as HTMLTextAreaElement).value).toContain('9');

    fireEvent.change(container.querySelector('textarea') as HTMLTextAreaElement, {
      target: { value: '{oops' },
    });
    fireEvent.click(screen.getByText('Apply'));
    expect(screen.getByRole('alert').textContent).not.toBe('');
    expect(counter.value).toBe(9);
  });

  it('keeps a draft while the game ticks', () => {
    const { game } = make();
    const { container } = render(<Devtools game={game} refreshEveryTicks={1} />);
    fireEvent.change(container.querySelector('textarea') as HTMLTextAreaElement, {
      target: { value: 'draft' },
    });
    act(() => {
      game.advance(300);
    });
    expect((container.querySelector('textarea') as HTMLTextAreaElement).value).toBe('draft');
  });

  it('fast-forwards by steps or as away time and accepts a class name', () => {
    const { game, counter } = make();
    const { container } = render(<Devtools game={game} className="custom" />);
    expect(container.querySelector('.custom')).not.toBeNull();
    fireEvent.click(screen.getByText('+1 min'));
    expect(counter.value).toBe(600);
    fireEvent.click(screen.getByText('+1 h'));
    fireEvent.click(screen.getByText('+1 day'));
    expect(container.querySelector('.pj-status')?.textContent).toContain('tick 600');
  });

  it('renders read-only components without an Apply button', () => {
    const game = new Game({ clock: new ManualClock(0) });
    class Fixed extends Component {
      override onSave(): JsonValue {
        return { fixed: true };
      }
    }
    game.createObject('Static').addComponent(Fixed);
    const { container } = render(<Devtools game={game} />);
    expect((container.querySelector('textarea') as HTMLTextAreaElement).readOnly).toBe(true);
    expect(screen.queryByText('Apply')).toBeNull();
  });
});
