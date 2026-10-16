# Tilemaps

`@portojs/tilemap` loads maps made in the [Tiled](https://www.mapeditor.org) editor, draws only what the camera sees, animates tiles and turns solid tiles into a few collision rectangles.

```
pnpm add @portojs/tilemap
```

## Load and draw

Save the map as JSON (`.tmj`) with the **CSV** tile layer format (Map properties → Tile Layer Format). Load the tileset images yourself, with the [asset loader](/assets) for example, and give each one to the view by its tileset name:

```ts
import { TileMapView, parseTiledMap } from '@portojs/tilemap';

const map = parseTiledMap(await (await fetch('level1.tmj')).json());
const textures = new Map([['tiles', renderer.createTexture(await loadImage('tiles.png'))]]);
const view = new TileMapView(map, textures);

// every frame
batch.clear();
view.draw(batch, camera, { time: game.time.time });
renderer.render(camera, batch.build());
```

`draw` adds only the tiles inside the camera (also when it is zoomed or rotated), so a large level costs what the screen shows. Tiles go through the same `SpriteBatch` as sprites. Options:

- `layers`: the tile layers to draw, in order. By default every visible tile layer. Each layer draws one `layer` number above the previous one, starting at the `layer` option, so you can put sprites between layers.
- `time`: seconds of game time, which picks the frame of animated tiles (set in Tiled's tile animation editor).

Layer offsets and opacity are applied. Horizontal and vertical flips work; **diagonal flips are not applied**. A tile taller than the map's cells is aligned to the bottom of its cell, as in Tiled.

## What the parser reads

Orthogonal, finite maps with tile layers, object layers, group layers (flattened in order) and tilesets made of one image, embedded in the map. For a tileset saved as a separate `.tsj` file, pass its contents: `parseTiledMap(json, { tilesets: { 'tiles.tsj': tsjJson } })`. Custom properties are read for the map, layers, objects and tiles. Infinite maps, base64 or compressed tile data, other orientations and tilesets of separate images are rejected with a message that says what to change.

## Objects and properties

Object layers are plain data, handy for spawn points and triggers:

```ts
for (const layer of map.layers) {
  if (layer.kind !== 'objects') continue;
  for (const object of layer.objects) {
    if (object.type === 'spawn') spawn(object.x, object.y, object.properties['team']);
  }
}

view.tileAt('ground', 3, 5); // global tile id at a cell, 0 when empty or outside
view.propertiesAt('ground', 3, 5); // custom properties set on that tile in Tiled
view.worldToTile(player.x, player.y); // the cell under a point
```

## Collision

`solidRects` joins neighbouring solid tiles into as few rectangles as possible: runs in a row are merged, then identical rows are stacked. Mark solid tiles with a boolean property (for example `solid`) in Tiled, or pass a function of the tile id:

```ts
import { solidRects } from '@portojs/tilemap';

for (const r of solidRects(view, 'ground', 'solid')) {
  game.createObject('Wall').addComponent(RigidBody2D, {
    type: 'fixed',
    shape: { kind: 'box', width: r.width, height: r.height },
    x: r.x + r.width / 2, // the physics bodies are centred
    y: r.y + r.height / 2,
  });
}
```

A 100 by 50 level that is mostly walls becomes a handful of bodies instead of thousands.
