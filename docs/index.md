---
layout: home
hero:
  name: PortoJS
  text: A headless engine for idle games
  tagline: Big numbers, a stable tick loop, trustworthy offline progress and versioned saves. Zero dependencies, fully typed.
  actions:
    - theme: brand
      text: Get started
      link: /getting-started
    - theme: alt
      text: Try the playground
      link: /playground
    - theme: alt
      text: API reference
      link: /api/
features:
  - title: Numbers that never overflow
    details: An immutable BigNum with exponents up to ~9e15, JSON-safe, formatted as 1.5e12 or 1.5T.
  - title: Offline progress done right
    details: Exact closed-form gains for any duration, capped and scaled by efficiency, safe against clock tricks.
  - title: Game-agnostic core
    details: The kernel knows about time, ticks, saves and offline. Resources, prestige and achievements are plugins.
  - title: Saves you can trust
    details: Versioned, chained migrations, checksum, Base64 export, atomic loading and corruption detection.
  - title: Deterministic and tested
    details: Inject a fake clock and replay time exactly. Unit, property-based and browser tests.
  - title: Small
    details: The big-number entry is about 2 KB brotli; the whole library is about 10 KB.
---
