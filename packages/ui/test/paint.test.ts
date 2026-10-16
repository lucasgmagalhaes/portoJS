import { SpriteBatch } from '@portojs/render';
import type { Texture } from '@portojs/render';
import { describe, expect, it } from 'vitest';
import { nineSlice, paintCommands } from '../src/index.ts';
import type { UiCommand } from '../src/index.ts';

const white: Texture = { id: 1, width: 1, height: 1 };
const skin: Texture = { id: 2, width: 30, height: 30 };

function sprites(batch: SpriteBatch): number[][] {
  const { data, groups } = batch.build();
  const rows: number[][] = [];
  for (const group of groups) {
    for (let i = 0; i < group.count; i++) {
      const at = (group.start + i) * 12;
      rows.push(Array.from(data.slice(at, at + 12)));
    }
  }
  return rows;
}

describe('nineSlice', () => {
  it('keeps corners and stretches the middle', () => {
    const patches = nineSlice(100, 60, 30, 30, { left: 10, top: 10, right: 10, bottom: 10 });
    expect(patches).toHaveLength(9);
    const centre = patches[4];
    expect(centre).toMatchObject({ x: 10, y: 10, width: 80, height: 40 });
    expect(centre?.u).toBeCloseTo(1 / 3);
    expect(patches[0]).toMatchObject({ x: 0, y: 0, width: 10, height: 10 });
    expect(patches[8]).toMatchObject({ x: 90, y: 50, width: 10, height: 10 });
  });

  it('shrinks the corners when the target is small and drops empty patches', () => {
    const small = nineSlice(10, 10, 30, 30, { left: 10, top: 10, right: 10, bottom: 10 });
    expect(small[0]).toMatchObject({ width: 5, height: 5 });
    const noEdges = nineSlice(50, 50, 30, 30, { left: 10, top: 0, right: 10, bottom: 0 });
    expect(noEdges).toHaveLength(3);
  });
});

describe('paintCommands', () => {
  it('draws rectangles from the top-left corner', () => {
    const batch = new SpriteBatch();
    paintCommands([{ type: 'rect', x: 5, y: 6, width: 10, height: 20, color: 0xff0000ff }], {
      batch,
      white,
    });
    const rows = sprites(batch);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.slice(0, 7)).toEqual([5, 6, 10, 20, 0, 0, 0]);
  });

  it('cuts rectangles to the clip and adjusts the texture region', () => {
    const batch = new SpriteBatch();
    const commands: UiCommand[] = [
      { type: 'pushClip', x: 0, y: 0, width: 50, height: 50 },
      { type: 'skin', skin: 's', x: 40, y: 0, width: 20, height: 10, color: 0xffffffff },
      { type: 'rect', x: 100, y: 100, width: 5, height: 5, color: 0xffffffff },
      { type: 'popClip' },
      { type: 'rect', x: 100, y: 100, width: 5, height: 5, color: 0xffffffff },
    ];
    paintCommands(commands, { batch, white, skins: { s: { texture: skin } } });
    const rows = sprites(batch);
    expect(rows).toHaveLength(2);
    const cut = rows.find((row) => row[2] === 10);
    expect(cut?.[7]).toBe(0);
    expect(cut?.[9]).toBeCloseTo(0.5);
    expect(rows.some((row) => row[0] === 100)).toBe(true);
  });

  it('draws a nine-slice skin as nine sprites and skips unknown skins', () => {
    const batch = new SpriteBatch();
    const insets = { left: 10, top: 10, right: 10, bottom: 10 };
    paintCommands(
      [
        { type: 'skin', skin: 's', x: 0, y: 0, width: 100, height: 60, insets, color: 0xffffffff },
        { type: 'skin', skin: 'missing', x: 0, y: 0, width: 5, height: 5, color: 0xffffffff },
      ],
      { batch, white, skins: { s: { texture: skin } } },
    );
    expect(sprites(batch)).toHaveLength(9);
  });

  it('nests clips and restores the outer one', () => {
    const batch = new SpriteBatch();
    paintCommands(
      [
        { type: 'pushClip', x: 0, y: 0, width: 100, height: 100 },
        { type: 'pushClip', x: 200, y: 200, width: 10, height: 10 },
        { type: 'rect', x: 0, y: 0, width: 10, height: 10, color: 1 },
        { type: 'popClip' },
        { type: 'rect', x: 0, y: 0, width: 10, height: 10, color: 1 },
        { type: 'popClip' },
      ],
      { batch, white },
    );
    expect(sprites(batch)).toHaveLength(1);
  });
});
