import { parseTiledMap } from '@portojs/tilemap';
import type { TiledMap } from '@portojs/tilemap';

/**
 * The level as text, one character per 16 px tile:
 *
 * - `#` ground, `^` spikes, `o` a coin, `@` where the player starts, `G` the goal.
 */
export const LEVEL: readonly string[] = [
  '..............................................',
  '..............................................',
  '..............................................',
  '...........................o.o.o..............',
  '.........................######........G......',
  '..................o.o....................######',
  '................#######.......................',
  '......o.o...............................^^....',
  '.....#####...........................#########',
  '..@..........o.......^^^.....#####.....##.....',
  '##########...#########################.......#',
  '##########...##########################...####',
];

export const TILE = 16;
export const GROUND_GID = 1;
export const SPIKE_GID = 2;

/**
 * Turns the text level into the JSON that the Tiled editor would save, so the game reads it
 * with the same parser as a map drawn in Tiled. Ground and spikes go in a tile layer, coins,
 * the start and the goal in an object layer.
 */
export function levelToTiled(rows: readonly string[] = LEVEL): Record<string, unknown> {
  const height = rows.length;
  const width = Math.max(...rows.map((row) => row.length));
  const data: number[] = [];
  const objects: Record<string, unknown>[] = [];
  let id = 1;
  for (const [y, row] of rows.entries()) {
    for (let x = 0; x < width; x++) {
      const char = row[x] ?? '.';
      data.push(char === '#' ? GROUND_GID : char === '^' ? SPIKE_GID : 0);
      const kind = { o: 'coin', '@': 'start', G: 'goal' }[char];
      if (kind !== undefined) {
        objects.push({ id: id++, name: kind, type: kind, x: x * TILE, y: y * TILE, width: TILE, height: TILE });
      }
    }
  }
  return {
    type: 'map',
    orientation: 'orthogonal',
    infinite: false,
    width,
    height,
    tilewidth: TILE,
    tileheight: TILE,
    tilesets: [
      {
        firstgid: 1,
        name: 'tiles',
        image: 'tiles.png',
        imagewidth: TILE * 4,
        imageheight: TILE,
        tilewidth: TILE,
        tileheight: TILE,
        tilecount: 4,
        columns: 4,
        margin: 0,
        spacing: 0,
        tiles: [{ id: 0, properties: [{ name: 'solid', type: 'bool', value: true }] }],
      },
    ],
    layers: [
      { type: 'tilelayer', name: 'ground', width, height, data },
      { type: 'objectgroup', name: 'things', objects },
    ],
  };
}

/**
 * The parsed level.
 */
export function loadLevel(rows: readonly string[] = LEVEL): TiledMap {
  return parseTiledMap(levelToTiled(rows));
}
