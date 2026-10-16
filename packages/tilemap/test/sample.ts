/**
 * A small Tiled map (4 x 3 tiles of 16 px) in the JSON format the editor saves.
 */
export function sampleMap(): Record<string, unknown> {
  return {
    type: 'map',
    orientation: 'orthogonal',
    infinite: false,
    width: 4,
    height: 3,
    tilewidth: 16,
    tileheight: 16,
    properties: [{ name: 'title', type: 'string', value: 'Cave' }],
    tilesets: [
      {
        firstgid: 1,
        name: 'tiles',
        image: 'tiles.png',
        imagewidth: 64,
        imageheight: 32,
        tilewidth: 16,
        tileheight: 16,
        tilecount: 8,
        columns: 4,
        margin: 0,
        spacing: 0,
        tiles: [
          {
            id: 1,
            animation: [
              { tileid: 1, duration: 100 },
              { tileid: 2, duration: 300 },
            ],
          },
          { id: 0, properties: [{ name: 'solid', type: 'bool', value: true }] },
        ],
      },
    ],
    layers: [
      {
        type: 'tilelayer',
        name: 'ground',
        width: 4,
        height: 3,
        opacity: 0.5,
        offsetx: 8,
        data: [0, 0, 0, 0, 0, 2, 0, 0, 1, 1, 1, 1],
      },
      {
        type: 'group',
        name: 'things',
        layers: [
          {
            type: 'objectgroup',
            name: 'spawns',
            objects: [
              {
                id: 7,
                name: 'start',
                class: 'spawn',
                x: 20,
                y: 30,
                width: 0,
                height: 0,
                properties: [{ name: 'team', type: 'string', value: 'red' }],
              },
            ],
          },
        ],
      },
    ],
  };
}

/**
 * The JSON of layer `index` of a sample map, to change in a test.
 */
export function layerJson(json: Record<string, unknown>, index: number): Record<string, unknown> {
  const found = (json['layers'] as Record<string, unknown>[])[index];
  if (found === undefined) throw new Error(`no layer ${index}`);
  return found;
}

/**
 * The JSON of tileset `index` of a sample map, to change in a test.
 */
export function tilesetJson(json: Record<string, unknown>, index: number): Record<string, unknown> {
  const found = (json['tilesets'] as Record<string, unknown>[])[index];
  if (found === undefined) throw new Error(`no tileset ${index}`);
  return found;
}
