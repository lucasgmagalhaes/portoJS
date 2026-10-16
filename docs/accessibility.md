# Accessibility

A canvas is invisible to screen readers and ignores the system's settings unless the game looks. These helpers cover the common cases; none of them replaces testing with real players.

## Settings of the device

`UserPreferences` from `@portojs/platform` reads reduced motion, high contrast, dark theme and orientation, and tells you when the player changes one while the game runs:

```ts
import { UserPreferences } from '@portojs/platform';

const prefs = new UserPreferences(window.matchMedia.bind(window));

if (prefs.current.reducedMotion) {
  shake.enabled = false; // screen shake, parallax, flashing
}
prefs.onChange = (next) => applyMotion(next.reducedMotion);

tween.duration = prefs.motion(300); // 0 when the player asked for less motion
```

Reduced motion is about effects that move the whole picture or flash: turn those off or shorten them, and keep the motion that carries meaning (a bar filling, a cursor moving).

## Telling screen readers what happens

```ts
import { Announcer } from '@portojs/platform';

const announcer = new Announcer(document);
announcer.announce('Level 3 complete');
announcer.announce('Health low', 'assertive'); // interrupts
```

It keeps two invisible ARIA live regions in the page (`role="status"` for normal messages, `role="alert"` for urgent ones). Announce state changes the player would otherwise only see: score, level, a menu item getting focus, errors such as "Not enough gold". The same message twice in a row is still read twice.

## Keyboard and gamepad in menus

The in-canvas UI has one focus model (see [In-canvas UI](/ui)); `navActionFromKey` maps the keyboard onto it:

```ts
import { navActionFromKey } from '@portojs/ui';

window.addEventListener('keydown', (e) => {
  const action = navActionFromKey(e.key, e.shiftKey); // arrows, Tab / Shift+Tab, Enter, Space, Escape
  if (action && ui.navigate(action)) e.preventDefault();
});
```

Send gamepad buttons to `ui.navigate(...)` the same way. Pair focus with `announcer.announce(label)` so a screen-reader user hears which button is focused.

## Colours

`@portojs/math` has the tools to check that colours that mean different things still differ:

```ts
import { Color, contrastRatio, okabeItoPalette, simulateColorBlindness } from '@portojs/math';

contrastRatio(text, background); // WCAG: 4.5 or more for body text, 3 for large text
simulateColorBlindness(Color.fromHex('#d55e00'), 'deuteranopia'); // how it looks to them
const teams = okabeItoPalette(); // 8 colours chosen to stay apart
```

Never use colour as the only signal: add a shape, an icon or a label to teams, health states and rarity. Run your palette through `simulateColorBlindness` for `protanopia`, `deuteranopia` and `tritanopia` and look at the results (or measure the distance between the colours that must differ).

## Safe areas

Notches and system bars cover parts of the screen. Add `viewport-fit=cover` to the viewport meta tag, then read the insets and keep buttons and text inside them:

```ts
import { readSafeArea } from '@portojs/platform';

const probe = document.createElement('div');
document.body.appendChild(probe);
const area = readSafeArea(probe, (el) => getComputedStyle(el)); // { top, right, bottom, left } in CSS pixels
```

Read it again when `prefs.onChange` reports a new orientation.
