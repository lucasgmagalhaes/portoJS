---
layout: home
hero:
  name: PortoJS
  text: A headless game engine, Unity-style
  tagline: Game, GameObject and Component on a stable fixed-timestep loop, with versioned saves and offline progress. Idle mechanics are optional components. Zero dependencies, fully typed.
  actions:
    - theme: brand
      text: Get started
      link: /getting-started
    - theme: alt
      text: Tutorials
      link: /tutorials/
    - theme: alt
      text: Catalogue
      link: /catalogue
    - theme: alt
      text: Playground
      link: /playground
    - theme: alt
      text: API reference
      link: /api/
features:
  - title: Game, GameObject, Component
    details: A lifecycle you know from Unity (awake, start, fixedUpdate, onDestroy), typed events and references instead of string ids.
  - title: Saves you can trust
    details: Components save themselves. Versioned, chained migrations, checksum, Base64 export, atomic loading and corruption detection.
  - title: Offline progress done right
    details: Components get onOffline(ms). Exact closed-form gains for any duration, capped and scaled by efficiency, safe against clock tricks.
  - title: Numbers that never overflow
    details: An immutable BigNum with exponents up to ~9e15, JSON-safe, formatted as 1.5e12 or 1.5T.
  - title: Idle mechanics when you want them
    details: Resource, Generator, Upgrade, Prestige, Achievement, Unlock, AutoBuyer, Challenge, Boost, LiveEvent. Add only what your game needs.
  - title: Sprites, physics, input, audio
    details: A typed-array ECS, a WebGPU renderer with a WebGL2 fallback, Rapier physics, keyboard, pointer and gamepad input, and a Web Audio mixer, each an optional package.
  - title: Made for mini-games
    details: Telegram and TikTok adapters, a Web Worker host, compressed saves and a balancing simulator with devtools.
  - title: Deterministic and tested
    details: Inject a fake clock and replay time exactly. Unit, property-based and browser tests. About 6 KB for the runtime.
---
