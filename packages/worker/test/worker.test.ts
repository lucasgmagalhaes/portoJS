import { ManualClock, format } from '@portojs/core';
import type { JsonValue } from '@portojs/core';
import { Generator, Resource } from '@portojs/idle';
import { Game } from '@portojs/runtime';
import { afterEach, describe, expect, it } from 'vitest';
import { connectGame, serveGame } from '../src/index.ts';
import type { RemoteGame, ServedGame } from '../src/index.ts';

function buildGame(): Game {
  const game = new Game({ clock: new ManualClock(0), stepMs: 100 });
  const gold = game.createObject('Gold').addComponent(Resource, { initial: 100 });
  game.createObject('Miner').addComponent(Generator, {
    cost: { resource: gold, base: 10, growth: 1.1 },
    produces: gold,
    rate: 1,
  });
  return game;
}

function gold(game: Game): Resource {
  return game.find('Gold')?.requireComponent(Resource) as Resource;
}

const open: Array<{ remote: RemoteGame; served: ServedGame; channel: MessageChannel }> = [];

function start(publishEveryMs = 5) {
  const channel = new MessageChannel();
  const served = serveGame({
    port: channel.port1,
    create: buildGame,
    select: (game): JsonValue => ({ gold: format(gold(game).amount) }),
    commands: {
      buy: (game, arg) => {
        const miner = game.find('Miner')?.requireComponent(Generator);
        return miner === undefined ? 0 : miner.buy(Number(arg)).toNumber();
      },
      slow: async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return 'done';
      },
      fail: () => {
        throw new Error('nope');
      },
      advance: (game, arg) => {
        game.advance(Number(arg));
        return null;
      },
    },
    publishEveryMs,
    autostart: false,
  });
  const remote = connectGame<{ gold: string }>(channel.port2);
  open.push({ remote, served, channel });
  return { remote, served };
}

afterEach(() => {
  for (const { remote, served, channel } of open.splice(0)) {
    remote.dispose();
    served.dispose();
    channel.port1.close();
    channel.port2.close();
  }
});

describe('serveGame and connectGame', () => {
  it('sends the first state when the game is ready', async () => {
    const { remote } = start();
    expect(remote.state).toBeUndefined();
    expect(await remote.ready).toEqual({ gold: '100' });
    expect(remote.state).toEqual({ gold: '100' });
  });

  it('runs commands in the worker and returns their result', async () => {
    const { remote, served } = start();
    await remote.ready;
    expect(await remote.call<number>('buy', 3)).toBe(3);
    expect(await remote.call('slow')).toBe('done');
    expect(gold(served.game).amount.toNumber()).toBeLessThan(100);
  });

  it('rejects unknown commands and failures with the worker message', async () => {
    const { remote } = start();
    await remote.ready;
    await expect(remote.call('missing')).rejects.toThrow('Unknown command "missing"');
    await expect(remote.call('fail')).rejects.toThrow('nope');
  });

  it('publishes new state as the game advances', async () => {
    const { remote, served } = start(2);
    await remote.ready;
    const seen: string[] = [];
    const stop = remote.subscribe((state) => seen.push(state.gold));
    await remote.call('buy', 1);
    await remote.call('advance', 5000);
    served.publish();
    await new Promise((resolve) => setTimeout(resolve, 30));
    stop();
    expect(seen.at(-1)).not.toBe('100');
    const count = seen.length;
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(seen).toHaveLength(count);
    expect(remote.state?.gold).toBe(seen.at(-1));
  });

  it('saves and loads through the worker', async () => {
    const { remote, served } = start();
    await remote.ready;
    await remote.call('buy', 2);
    const save = await remote.save();
    await remote.call('advance', 10_000);
    const grown = gold(served.game).amount.toNumber();
    await remote.load(save);
    expect(gold(served.game).amount.toNumber()).toBeLessThan(grown);
    await expect(remote.load('garbage')).rejects.toThrow();
    await expect(remote.call('load', 5)).rejects.toThrow('save string');
  });

  it('disposes both sides and rejects what is pending', async () => {
    const { remote, served } = start();
    await remote.ready;
    const pending = remote.call('slow');
    remote.dispose();
    await expect(pending).rejects.toThrow('disposed');
    await expect(remote.call('buy')).rejects.toThrow('disposed');
    remote.dispose();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(served.game.running).toBe(false);
  });

  it('can run the loop itself when autostart is left on', async () => {
    const channel = new MessageChannel();
    const served = serveGame({
      port: channel.port1,
      create: buildGame,
      select: (): JsonValue => 1,
    });
    const remote = connectGame(channel.port2);
    await remote.ready;
    expect(served.game.running).toBe(true);
    remote.dispose();
    served.dispose();
    channel.port1.close();
    channel.port2.close();
  });
});
