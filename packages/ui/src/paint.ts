import type { BitmapFont, FrameUv, SpriteBatch, Texture } from '@portojs/render';
import type { UiCommand, UiRect } from './commands.ts';
import { nineSlice } from './nine-slice.ts';

/**
 * A skin the painter can draw: a region of a texture.
 */
export interface PaintSkin {
  readonly texture: Texture;
  /**
   * Region of the texture, `0` to `1`. Default: the whole texture.
   */
  readonly uv?: FrameUv;
}

/**
 * What {@link paintCommands} draws with.
 */
export interface PaintTarget {
  readonly batch: SpriteBatch;
  /**
   * A white 1x1 texture, used for flat rectangles.
   */
  readonly white: Texture;
  /**
   * Font for text commands. Without it text is skipped.
   */
  readonly font?: BitmapFont;
  /**
   * Skins by name, for `skin` commands.
   */
  readonly skins?: Readonly<Record<string, PaintSkin>>;
  /**
   * Draw order of the UI in the batch. Default `1000`, above most game sprites.
   */
  readonly layer?: number;
}

interface ClipState {
  readonly clip: UiRect | undefined;
  readonly hidden: boolean;
}

const FULL: FrameUv = { u: 0, v: 0, uWidth: 1, vHeight: 1 };

function intersect(a: UiRect, b: UiRect): UiRect | undefined {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : undefined;
}

/**
 * Draws a {@link UiCommand} list into a sprite batch. Rectangles and skins are cut exactly to
 * the active clip; text is kept or dropped whole depending on whether its box touches the clip.
 *
 * @example
 * batch.clear();
 * paintCommands(ui.commands(), { batch, white, font, skins: { panel: { texture: panelTexture } } });
 */
export function paintCommands(commands: readonly UiCommand[], target: PaintTarget): void {
  const layer = target.layer ?? 1000;
  const stack: ClipState[] = [];
  let clip: UiRect | undefined;
  let hidden = false;

  const quad = (
    texture: Texture,
    rect: UiRect,
    uv: FrameUv,
    color: number,
  ): void => {
    let r = rect;
    let { u, v, uWidth, vHeight } = uv;
    if (clip) {
      const cut = intersect(rect, clip);
      if (!cut) {
        return;
      }
      u += ((cut.x - rect.x) / rect.width) * uWidth;
      v += ((cut.y - rect.y) / rect.height) * vHeight;
      uWidth *= cut.width / rect.width;
      vHeight *= cut.height / rect.height;
      r = cut;
    }
    target.batch.add(texture, {
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
      originX: 0,
      originY: 0,
      u,
      v,
      uWidth,
      vHeight,
      color,
      layer,
    });
  };

  for (const command of commands) {
    if (command.type === 'pushClip') {
      stack.push({ clip, hidden });
      const next: UiRect | undefined = hidden ? undefined : clip ? intersect(clip, command) : command;
      hidden = hidden || next === undefined;
      clip = next ?? clip;
      continue;
    }
    if (command.type === 'popClip') {
      const previous = stack.pop();
      clip = previous?.clip;
      hidden = previous?.hidden ?? false;
      continue;
    }
    if (hidden) {
      continue;
    }
    if (command.type === 'rect') {
      quad(target.white, command, FULL, command.color);
    } else if (command.type === 'skin') {
      const skin = target.skins?.[command.skin];
      if (!skin) {
        continue;
      }
      paintSkin(command, skin, quad);
    } else if (target.font && (!clip || intersect(command, clip))) {
      const anchorX = command.align === 'left' ? 0 : command.align === 'center' ? 0.5 : 1;
      target.font.draw(target.batch, command.text, {
        x: command.x + command.width * anchorX,
        y: command.y + command.height / 2,
        anchorX,
        anchorY: 0.5,
        size: command.size,
        color: command.color,
        align: command.align,
        layer: layer + 1,
      });
    }
  }
}

function paintSkin(
  command: Extract<UiCommand, { type: 'skin' }>,
  skin: PaintSkin,
  quad: (texture: Texture, rect: UiRect, uv: FrameUv, color: number) => void,
): void {
  const uv = skin.uv ?? FULL;
  if (!command.insets) {
    quad(skin.texture, command, uv, command.color);
    return;
  }
  const pixelsW = skin.texture.width * uv.uWidth;
  const pixelsH = skin.texture.height * uv.vHeight;
  for (const patch of nineSlice(command.width, command.height, pixelsW, pixelsH, command.insets)) {
    quad(
      skin.texture,
      {
        x: command.x + patch.x,
        y: command.y + patch.y,
        width: patch.width,
        height: patch.height,
      },
      {
        u: uv.u + patch.u * uv.uWidth,
        v: uv.v + patch.v * uv.vHeight,
        uWidth: patch.uWidth * uv.uWidth,
        vHeight: patch.vHeight * uv.vHeight,
      },
      command.color,
    );
  }
}
