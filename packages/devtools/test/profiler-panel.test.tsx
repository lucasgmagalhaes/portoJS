// @vitest-environment happy-dom
import { ManualClock } from '@portojs/core';
import { Component, Game } from '@portojs/runtime';
import { Profiler } from '@portojs/tools';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ProfilerPanel } from '../src/index.ts';

afterEach(cleanup);

describe('ProfilerPanel', () => {
  it('lists the costliest methods and draws a bar per step', () => {
    const clock = new ManualClock(0);
    const game = new Game({ clock, stepMs: 100 });
    let time = 0;
    class Heavy extends Component {
      static override typeId = 'Heavy';
      override fixedUpdate(): void {
        time += 2;
      }
    }
    game.createObject('h').addComponent(Heavy);
    const profiler = new Profiler({ now: () => time }).attach(game);
    const { container } = render(
      <ProfilerPanel profiler={profiler} game={game} refreshEveryTicks={1} />,
    );
    expect(container.textContent).toContain('no steps measured yet');
    act(() => {
      for (let i = 0; i < 3; i++) {
        clock.advance(100);
        game.update();
      }
    });
    expect(container.textContent).toContain('Heavy.fixedUpdate');
    expect(container.textContent).toContain('last step 2.00 ms');
    expect(container.querySelectorAll('rect')).toHaveLength(3);
    expect(container.querySelectorAll('tbody tr')).toHaveLength(1);
  });
});
