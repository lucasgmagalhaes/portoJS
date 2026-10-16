import { describe, expect, it } from 'vitest';
import { Component, Game, ManualClock, Pool, Prefab } from '../src/index.ts';

class Bullet extends Component {
  static override typeId = 'Bullet';
  x = 0;
  resets = 0;
}

const bulletPrefab = new Prefab((object) => {
  object.addComponent(Bullet);
});

function make(options: { prewarm?: number; max?: number } = {}) {
  const game = new Game({ clock: new ManualClock(0) });
  const log: string[] = [];
  const pool = new Pool<{ x: number }>({
    name: 'Bullet',
    create: (name) => game.instantiate(bulletPrefab, name),
    onGet: (object, { x }) => {
      const bullet = object.requireComponent(Bullet);
      bullet.x = x;
      bullet.resets += 1;
      log.push(`get ${object.name}`);
    },
    onRelease: (object) => log.push(`release ${object.name}`),
    ...options,
  });
  return { game, pool, log };
}

describe('Pool', () => {
  it('creates objects on demand, passes the argument and switches them on', () => {
    const { pool, log } = make();
    const a = pool.get({ x: 5 });
    expect(a.name).toBe('Bullet#1');
    expect(a.activeSelf).toBe(true);
    expect(a.requireComponent(Bullet).x).toBe(5);
    expect(pool.inUse).toBe(1);
    expect(pool.size).toBe(1);
    expect(log).toEqual(['get Bullet#1']);
  });

  it('reuses released objects, switching them off while they wait', () => {
    const { pool, log } = make();
    const a = pool.get({ x: 1 });
    pool.release(a);
    expect(a.activeSelf).toBe(false);
    expect(pool.available).toBe(1);
    expect(pool.inUse).toBe(0);
    const again = pool.get({ x: 2 });
    expect(again).toBe(a);
    expect(again.activeSelf).toBe(true);
    expect(again.requireComponent(Bullet).resets).toBe(2);
    expect(log).toEqual(['get Bullet#1', 'release Bullet#1', 'get Bullet#1']);
  });

  it('prewarms inactive objects without calling onGet', () => {
    const { pool, game, log } = make({ prewarm: 3 });
    expect(pool.available).toBe(3);
    expect(game.objects.every((o) => !o.activeSelf)).toBe(true);
    expect(log).toEqual([]);
    const taken = pool.get({ x: 0 });
    expect(taken.name).toBe('Bullet#3');
    expect(pool.available).toBe(2);
  });

  it('stops at max: get throws and tryGet returns undefined', () => {
    const { pool } = make({ max: 2 });
    pool.get({ x: 0 });
    const second = pool.get({ x: 0 });
    expect(pool.tryGet({ x: 0 })).toBeUndefined();
    expect(() => pool.get({ x: 0 })).toThrow(RangeError);
    pool.release(second);
    expect(pool.get({ x: 0 })).toBe(second);
  });

  it('releases everything and clears waiting objects', () => {
    const { pool, game } = make();
    pool.get({ x: 0 });
    pool.get({ x: 0 });
    pool.releaseAll();
    expect(pool.inUse).toBe(0);
    expect(pool.available).toBe(2);
    pool.clear();
    expect(pool.size).toBe(0);
    expect(game.objects).toHaveLength(0);
  });

  it('keeps going when objects are destroyed behind its back', () => {
    const { pool } = make({ prewarm: 2 });
    const a = pool.get({ x: 0 });
    const b = pool.get({ x: 0 });
    pool.release(a);
    a.destroy();
    expect(pool.get({ x: 0 })).not.toBe(a);
    b.destroy();
    expect(() => pool.release(b)).not.toThrow();
  });

  it('refuses to release an object twice or from elsewhere', () => {
    const { pool, game } = make();
    const a = pool.get({ x: 0 });
    pool.release(a);
    expect(() => pool.release(a)).toThrow(/not in use/);
    expect(() => pool.release(game.createObject('Stranger'))).toThrow(/not in use/);
  });

  it('works without an argument type and validates options', () => {
    const game = new Game({ clock: new ManualClock(0) });
    const plain = new Pool({ name: 'P', create: (name) => game.createObject(name) });
    expect(plain.get().name).toBe('P#1');
    const create = (name: string) => game.createObject(name);
    expect(() => new Pool({ name: 'x', create, prewarm: -1 })).toThrow(RangeError);
    expect(() => new Pool({ name: 'x', create, max: 0 })).toThrow(RangeError);
    expect(() => new Pool({ name: 'x', create, prewarm: 3, max: 2 })).toThrow(RangeError);
  });
});
