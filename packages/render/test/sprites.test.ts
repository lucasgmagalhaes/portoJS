import { World } from '@portojs/ecs';
import { describe, expect, it } from 'vitest';
import {
  INSTANCE_FLOATS,
  Sprite,
  SpriteBatch,
  createSpriteSystem,
  spawnSprite,
} from '../src/index.ts';
import type { Texture } from '../src/index.ts';

const hero: Texture = { id: 1, width: 32, height: 16 };
const rock: Texture = { id: 2, width: 8, height: 8 };

describe('sprite system', () => {
  it('turns entities into batched instances', () => {
    const world = new World();
    const textures = new Map([
      [hero.id, hero],
      [rock.id, rock],
    ]);
    const batch = new SpriteBatch();
    spawnSprite(world, hero, { x: 10, y: 20, scaleX: 2, layer: 1 });
    spawnSprite(world, rock, { x: 1, y: 2 });
    spawnSprite(world, hero, { x: 3, y: 4, color: 0x11223344, rotation: 0.5 });
    world.addSystem(createSpriteSystem(world, textures, batch));
    world.update(0.1);

    const { data, groups, count } = batch.build();
    expect(count).toBe(3);
    expect(groups.map((g) => [g.texture.id, g.count])).toEqual([
      [2, 1],
      [1, 2],
    ]);
    const bits = new Uint32Array(data.buffer, data.byteOffset, data.length);
    expect(Array.from(data.subarray(0, 4))).toEqual([1, 2, 8, 8]);
    expect(Array.from(data.subarray(INSTANCE_FLOATS, INSTANCE_FLOATS + 5))).toEqual([
      3, 4, 32, 16, 0.5,
    ]);
    expect(bits[INSTANCE_FLOATS + 11]).toBe(0x11223344);
    expect(Array.from(data.subarray(2 * INSTANCE_FLOATS, 2 * INSTANCE_FLOATS + 4))).toEqual([
      10, 20, 64, 16,
    ]);
  });

  it('rebuilds every step, follows changes and skips unknown textures', () => {
    const world = new World();
    const textures = new Map([[hero.id, hero]]);
    const batch = new SpriteBatch();
    const e = spawnSprite(world, hero);
    spawnSprite(world, rock);
    world.addSystem(createSpriteSystem(world, textures, batch));
    world.update(0.1);
    expect(batch.count).toBe(1);
    world.use(Sprite).layer[e] = 3;
    world.destroyEntity(e);
    world.update(0.1);
    expect(batch.count).toBe(0);
  });
});
