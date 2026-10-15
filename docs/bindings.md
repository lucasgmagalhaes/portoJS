# UI bindings

PortoJS is headless, so a UI needs a way to read state and re-render when it changes. Thin bindings exist for React, Vue, Svelte and Solid. React and Vue ship as subpath exports of `portojs`; Svelte and Solid are separate packages (`@portojs/svelte`, `@portojs/solid`). The frameworks are optional peer dependencies: install only the one you use.

All of them expose a single function, `useGame(game, selector, isEqual?)`.

- The selector runs after every tick, and on load, start and stop. It receives the game, and you can also read from components you keep a reference to.
- The UI updates only when the selected value changed. Equality is `Object.is`, plus value equality for `BigNum`, so a selector that computes a fresh `BigNum` (like a rate) does not cause a re-render on every tick.
- Select primitives (a formatted string, a number) when you can, or pass your own `isEqual` for objects.

## React

```tsx
import { useGame } from 'portojs/react';
import { format } from 'portojs/bignum';

function Gold({ game, gold }: { game: Game; gold: Resource }) {
  const amount = useGame(game, () => format(gold.amount, { notation: 'suffix' }));
  const rate = useGame(game, () => format(gold.rate));
  return (
    <p>
      {amount} ({rate}/s)
    </p>
  );
}
```

It is built on `useSyncExternalStore`, so it is safe with concurrent rendering and server rendering.

## Vue

```vue
<script setup lang="ts">
import { useGame } from 'portojs/vue';
import { format } from 'portojs/bignum';
import { game, gold } from './game';

const { value: amount } = useGame(game, () => format(gold.amount, { notation: 'suffix' }));
</script>

<template>
  <p>{{ amount }}</p>
</template>
```

`useGame` returns `{ value, stop }`. `value` is a readonly `ShallowRef`. Inside a component or effect scope the subscription is removed automatically when the scope is disposed; outside one, call `stop()` yourself.

## Svelte

```svelte
<script lang="ts">
  import { useGame } from '@portojs/svelte';
  import { format } from 'portojs/bignum';
  import { game, gold } from './game';

  const amount = useGame(game, () => format(gold.amount, { notation: 'suffix' }));
</script>

<p>{$amount}</p>
```

`useGame` returns a readable store, so `$amount` works and the subscription is removed with the component. The package needs no Svelte import: the store contract is structural. The game is observed only while the store has subscribers.

## Solid

```tsx
import { useGame } from '@portojs/solid';
import { format } from 'portojs/bignum';

function Gold(props: { game: Game; gold: Resource }) {
  const amount = useGame(props.game, () => format(props.gold.amount, { notation: 'suffix' }));
  return <p>{amount()}</p>;
}
```

`useGame` returns a signal accessor. Inside a component or reactive root the subscription is removed when the owner is disposed.

## Writing your own

A binding only needs the `Observable` shape: `on('tick' | 'loaded' | 'start' | 'stop', listener)` returning an unsubscribe function. A `Game` has it, so wiring any other framework is a few lines.
