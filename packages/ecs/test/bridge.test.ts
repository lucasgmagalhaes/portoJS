import { ManualClock, createSave } from '@portojs/core';
import { Game } from '@portojs/runtime';
import { describe, expect, it } from 'vitest';
import { EcsWorld, EntityLink, World, defineComponent } from '../src/index.ts';

const Position = defineComponent({ x: 'f32', y: 'f32' });
const Health = defineComponent({ hp: 'u16' });
const known = { Position, Health };

function build(options: { persist?: boolean; objects?: string[] } = {}) {
  const game = new Game({ clock: new ManualClock(0) });
  const ecs = game
    .createObject('Ecs')
    .addComponent(EcsWorld, options.persist === false ? {} : { components: known });
  const links = new Map<string, EntityLink>();
  for (const name of options.objects ?? ['Player', 'Boss']) {
    links.set(
      name,
      game.createObject(name).addComponent(EntityLink, {
        components: [{ component: Health, values: { hp: 10 } }],
      }),
    );
  }
  return { game, ecs, links };
}

describe('EntityLink', () => {
  it('creates an entity with the starting components and exposes the world', () => {
    const { ecs, links } = build();
    const player = links.get('Player') as EntityLink;
    expect(ecs.world.isAlive(player.entity)).toBe(true);
    expect(ecs.world.use(Health).hp[player.entity]).toBe(10);
    expect(player.world).toBe(ecs.world);
    expect(player.entity).not.toBe((links.get('Boss') as EntityLink).entity);
  });

  it('adds, checks and removes ECS components', () => {
    const { links } = build();
    const player = links.get('Player') as EntityLink;
    expect(player.has(Position)).toBe(false);
    player.add(Position, { x: 3, y: 4 });
    expect(player.has(Position)).toBe(true);
    expect(player.world.use(Position).y[player.entity]).toBe(4);
    player.remove(Position);
    expect(player.has(Position)).toBe(false);
  });

  it('destroys the entity with the object and finds the object behind an entity', () => {
    const { game, ecs, links } = build();
    const player = links.get('Player') as EntityLink;
    const entity = player.entity;
    expect(EntityLink.objectOf(game, entity)?.name).toBe('Player');
    expect(EntityLink.objectOf(game, 999)).toBeUndefined();
    player.gameObject.destroy();
    expect(ecs.world.isAlive(entity)).toBe(false);
    expect(EntityLink.objectOf(game, entity)).toBeUndefined();
  });

  it('can use an explicit world', () => {
    const game = new Game({ clock: new ManualClock(0) });
    const world = new World({ capacity: 4 });
    const link = game.createObject('X').addComponent(EntityLink, { world });
    expect(link.world).toBe(world);
    expect(world.size).toBe(1);
  });

  it('needs a world', () => {
    const game = new Game({ clock: new ManualClock(0) });
    expect(() => game.createObject('X').addComponent(EntityLink)).toThrow(/EcsWorld/);
  });
});

describe('saving the ECS world', () => {
  it('round-trips entity data and keeps each link on its own entity', () => {
    const a = build();
    const player = a.links.get('Player') as EntityLink;
    const boss = a.links.get('Boss') as EntityLink;
    player.add(Position, { x: 1, y: 2 });
    a.ecs.world.use(Health).hp[boss.entity] = 99;
    const stray = a.ecs.world.createEntity();
    a.ecs.world.addComponent(stray, Position, { x: 7, y: 7 });
    const save = a.game.save();

    const b = build();
    b.game.load(save);
    const player2 = b.links.get('Player') as EntityLink;
    const boss2 = b.links.get('Boss') as EntityLink;
    expect(player2.entity).toBe(player.entity);
    expect(boss2.entity).toBe(boss.entity);
    expect(b.ecs.world.use(Position).x[player2.entity]).toBe(1);
    expect(b.ecs.world.use(Health).hp[boss2.entity]).toBe(99);
    expect(b.ecs.world.isAlive(stray)).toBe(true);
    expect(b.ecs.world.use(Position).x[stray]).toBe(7);
    expect(b.ecs.world.size).toBe(3);
  });

  it('gives an object that was not in the save a fresh entity of its own', () => {
    const a = build({ objects: ['Player'] });
    const save = a.game.save();
    const b = build({ objects: ['Player', 'Late'] });
    b.game.load(save);
    const late = b.links.get('Late') as EntityLink;
    const player = b.links.get('Player') as EntityLink;
    expect(late.entity).not.toBe(player.entity);
    expect(b.ecs.world.isAlive(late.entity)).toBe(true);
    expect(b.ecs.world.use(Health).hp[late.entity]).toBe(10);
    expect(b.ecs.world.size).toBe(2);
  });

  it('does not save the world unless components are named', () => {
    const a = build({ persist: false });
    (a.links.get('Player') as EntityLink).add(Position, { x: 5, y: 5 });
    const save = a.game.save();
    const b = build({ persist: false });
    b.game.load(save);
    expect(b.ecs.world.use(Position).x[(b.links.get('Player') as EntityLink).entity]).toBe(0);
  });

  it('resets the world and recreates the entities on reset()', () => {
    const a = build();
    const player = a.links.get('Player') as EntityLink;
    player.add(Position, { x: 5, y: 5 });
    a.ecs.world.createEntity();
    a.game.reset();
    expect(a.ecs.world.size).toBe(2);
    expect(player.has(Position)).toBe(false);
    expect(a.ecs.world.use(Health).hp[player.entity]).toBe(10);
  });

  it('rolls the load back when the snapshot is invalid', () => {
    const a = build();
    const player = a.links.get('Player') as EntityLink;
    player.add(Position, { x: 2, y: 2 });
    const save = a.game.save();
    const broken = createSave(save.version, save.savedAt, {
      objects: { Ecs: { EcsWorld: { entities: 'nope' } } },
    });
    expect(() => a.game.load(broken)).toThrow();
    expect(player.has(Position)).toBe(true);
    expect(a.ecs.world.use(Position).x[player.entity]).toBe(2);
  });
});
