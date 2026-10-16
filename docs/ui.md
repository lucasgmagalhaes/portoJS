# In-canvas UI

`@portojs/ui` builds menus and HUDs that live inside the canvas: buttons, panels, labels, progress bars, sliders, toggles and scroll lists, with anchor and flex layout and keyboard or gamepad focus. It does no drawing of its own: it lays the tree out and returns a list of drawing commands, and `paintCommands` puts them into the same `SpriteBatch` as your sprites.

```
pnpm add @portojs/ui
```

## A first menu

```ts
import { Button, Label, Panel, Ui } from '@portojs/ui';

const ui = new Ui({ width: 640, height: 360 }); // your virtual resolution

const menu = new Panel({
  anchor: [0.5, 0.5],
  width: 240,
  height: 180,
  layout: { direction: 'column', gap: 12, padding: 16, align: 'stretch' },
});
const play = new Button({ text: 'Play', height: 40 });
play.click.addListener(startGame);
menu.add(new Label({ text: 'My game', align: 'center' }), play);
ui.root.add(menu);
```

## Input

Give the UI the pointer in the same coordinates as its size, and use the return values to keep clicks from reaching the game:

```ts
canvas.addEventListener('pointerdown', (e) => {
  if (ui.pointerDown(e.pointerId, e.offsetX, e.offsetY)) return; // the UI took it
  shoot();
});
canvas.addEventListener('pointermove', (e) => ui.pointerMove(e.pointerId, e.offsetX, e.offsetY));
canvas.addEventListener('pointerup', (e) => ui.pointerUp(e.pointerId, e.offsetX, e.offsetY));
canvas.addEventListener('pointercancel', (e) => ui.pointerCancel(e.pointerId));
canvas.addEventListener('wheel', (e) => ui.wheel(e.offsetX, e.offsetY, e.deltaX, e.deltaY));
```

A button clicks when the pointer is released over it. Disabled and hidden nodes (and everything inside them) are skipped. For the keyboard or a gamepad, call `ui.navigate('next' | 'previous' | 'up' | 'down' | 'left' | 'right' | 'confirm' | 'cancel')`: `next`/`previous` walk the focusable nodes in tree order, the arrows jump to the closest one in that direction, `confirm` activates the focused button or toggle and left/right move a focused slider. `ui.cancel` fires when cancel arrives and nothing used it, a good place for "close this menu". A focus ring is drawn around the focused node (`theme.focus`).

## Layout

Every node takes the same options. A node inside a **flex** container (`layout: { direction, gap, padding, justify, align }`) is placed by the container: `width`/`height` give its size, `grow` makes it take a share of the free space, `margin` adds room around it. `justify` (`start`, `center`, `end`, `space-between`) places the children on the main axis when none grows, `align` (`start`, `center`, `end`, `stretch`) on the other one.

Any other node is placed by its **anchor**: `anchor: [0.5, 0.5]` attaches it to the centre of its parent, `[1, 0]` to the top-right corner. `pivot` is the point of the node placed there (by default the anchor itself, so a node anchored at the right edge stays inside), `x`/`y` nudge it, and `stretchX`/`stretchY` fill the parent minus the margin. Call `ui.resize(w, h)` when the screen changes and everything follows.

Labels and buttons size themselves from their text when you leave out `width`/`height`. The default measure is an estimate; pass `measureText` to `Ui` with your font's real one (for a `BitmapFont`, `font.layout(text, { size }).width`).

After changing the tree or a text, call `ui.invalidate()`; adding nodes before the first read needs nothing.

## Widgets

- `Panel`: a background that groups children.
- `Label`: one line of text, with `size`, `color` and `align`.
- `Button`: normal, hover, pressed, disabled and focus looks; the `click` event.
- `Toggle`: a button that keeps a `value`; the `changed` event.
- `ProgressBar`: `value` from 0 to 1, filling to the `direction` you choose.
- `Slider`: `min`, `max`, optional `step`, drag or use the arrows; the `changed` event.
- `ScrollView`: lays its children out (a column by default, or a row) and scrolls by wheel or by dragging. A press that turns into a drag over a button inside it cancels the click. Focusing a child scrolls it into view.

Make your own by extending `UiNode`: override `paint(out)` to push commands and the `onPointer*`/`onNavigate` hooks to react.

## Themes and skins

`new Ui({ theme })` takes a `Theme`; spread `defaultTheme` and change what you need. Each look has a flat `background` and `text` colour and may name a `skin`. A skin is a texture region you register with the painter; give the theme `insets` and it is drawn as a nine-slice, so a rounded panel keeps its corners at any size.

## Drawing

```ts
import { paintCommands } from '@portojs/ui';

batch.clear();
// ...add sprites...
paintCommands(ui.commands(), {
  batch,
  white: whiteTexture, // any 1x1 white texture, used for flat rectangles
  font, // a BitmapFont, for text
  skins: { panel: { texture: panelTexture } },
  layer: 1000, // above your sprites
});
renderer.render(uiCamera, batch.build());
```

Use a camera that maps one unit to one UI pixel (position it at half the UI size) so pointer coordinates and drawing agree. Rectangles and skins are cut exactly to scroll view bounds; a text is kept or dropped whole, depending on whether its box touches the view. Rendering the commands any other way (a DOM overlay, a canvas 2D context) is a loop over a small union of `rect`, `skin`, `text`, `pushClip` and `popClip`.
