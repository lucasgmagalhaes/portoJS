# Changelog

## [0.5.0](https://github.com/lucasgmagalhaes/portoJS/compare/v0.4.0...v0.5.0) (2026-10-15)


### ⚠ BREAKING CHANGES

* replace the plugin API with a Unity-style Game, GameObject and Component model

### Features

* **examples:** port the clicker to the component API ([e7b1413](https://github.com/lucasgmagalhaes/portoJS/commit/e7b14135646bc8658c43048285ff38a1049792a9))
* **idle:** add Prestige, Achievement, Unlock, AutoBuyer, Challenge, Boost and DataStore components ([32460d1](https://github.com/lucasgmagalhaes/portoJS/commit/32460d195a5a7cb6ddf047eb93f30a329262ffc8))
* **idle:** add Resource, Generator, Upgrade and Economy components ([b7bbf31](https://github.com/lucasgmagalhaes/portoJS/commit/b7bbf3178e7c28b919caff82be616ee3f58f411c))
* **runtime:** add Game, GameObject and Component with a Unity-style lifecycle ([84a7808](https://github.com/lucasgmagalhaes/portoJS/commit/84a78082173b31ef1a9353aa72277fedb469c5ae))


### Refactoring

* replace the plugin API with a Unity-style Game, GameObject and Component model ([bd6d8cc](https://github.com/lucasgmagalhaes/portoJS/commit/bd6d8ccf83ec1ce56c85022e8364c80560d8ffe1))


### Documentation

* rewrite the guides, README and playground for the Game, GameObject and Component model ([eb56edc](https://github.com/lucasgmagalhaes/portoJS/commit/eb56edc9255a8564106f076f4980e50e995b3b18))

## [0.4.0](https://github.com/lucasgmagalhaes/portoJS/compare/v0.3.0...v0.4.0) (2026-10-15)


### Features

* **registry:** add plugin for free-form saved game data ([9807f5e](https://github.com/lucasgmagalhaes/portoJS/commit/9807f5e591925b04b5c7ff75fe97f40af96ab8a3))


### Documentation

* add a Phaser migration guide and update the roadmap ([9c873f7](https://github.com/lucasgmagalhaes/portoJS/commit/9c873f70796c393c3591323a2bee798f72bfe967))

## [0.3.0](https://github.com/lucasgmagalhaes/portoJS/compare/v0.2.0...v0.3.0) (2026-10-15)

### Features

- **bindings:** add useGame hooks for React and Vue ([633bd71](https://github.com/lucasgmagalhaes/portoJS/commit/633bd715847220ee347f1864410f42a61fc565fc))
- **boosts:** add plugin for time-limited multipliers ([9f35b6f](https://github.com/lucasgmagalhaes/portoJS/commit/9f35b6f2e391e6e90f260124966e00939d2370b3))
- **prestige-layers:** add plugin for stacked prestige layers ([7263598](https://github.com/lucasgmagalhaes/portoJS/commit/72635982005026da45b2b7d81cb5aec8efa71c4b))
- **resources:** tell dynamic modifiers when away-time is being credited ([6be0ada](https://github.com/lucasgmagalhaes/portoJS/commit/6be0ada361cf34eb0ff9ce23f6d20ffe366388c2))

### Refactoring

- replace inline callbacks with loops and named functions ([123803a](https://github.com/lucasgmagalhaes/portoJS/commit/123803aea74671c3d7c2e9c97ae69564f0d32eb3))

### Documentation

- document UI bindings, boosts and prestige layers ([800f269](https://github.com/lucasgmagalhaes/portoJS/commit/800f2698a7bb660a80d52d13819a1c6f743351a2))

## [0.2.0](https://github.com/lucasgmagalhaes/portoJS/compare/v0.1.0...v0.2.0) (2026-10-15)

### Features

- **auto-buyers:** add plugin that buys generators on a timer ([3bbc400](https://github.com/lucasgmagalhaes/portoJS/commit/3bbc40082fc040ecbece78fce835b82b22617e1d))
- **challenges:** add plugin for handicapped runs with permanent rewards ([e7dedf5](https://github.com/lucasgmagalhaes/portoJS/commit/e7dedf53b84452206259e6fddfdc9c0e654319c1))
- **resources:** add purchase guards ([646f5cc](https://github.com/lucasgmagalhaes/portoJS/commit/646f5ccb45e7742d920d7c244ab89ee27fff7dcc))
- **unlocks:** add plugin that gates generators and upgrades behind conditions ([2f88f56](https://github.com/lucasgmagalhaes/portoJS/commit/2f88f565aaf2398f3ab9031f57892d45840478b7))

### Performance

- **resources:** cache per-step production math and generator save data ([b2febcc](https://github.com/lucasgmagalhaes/portoJS/commit/b2febccd8523b817db2c96c285039579e30b346a))
- **save:** sort keys without a comparator in stableStringify ([fe9dc44](https://github.com/lucasgmagalhaes/portoJS/commit/fe9dc4499884f3ac77e5ae62ca3f66f7dba95080))

### Documentation

- add VitePress site with generated API reference and an in-browser playground ([8250440](https://github.com/lucasgmagalhaes/portoJS/commit/825044047191bfe37687474faea27cc3d2c9fe3a))
- document built-in plugins and refresh the API report ([ed088e0](https://github.com/lucasgmagalhaes/portoJS/commit/ed088e081b0eccf74adbf077bdcf7465a9999c33))
- link the docs site and update the roadmap ([8bcec60](https://github.com/lucasgmagalhaes/portoJS/commit/8bcec6032239feb7abd9869e712143d703a2d6f8))

## 0.1.0 (2026-10-15)

### ⚠ BREAKING CHANGES

- rename project from leveling to portojs

### Features

- **achievements:** add condition-based achievements plugin ([da547ed](https://github.com/lucasgmagalhaes/portoJS/commit/da547ed5a0716caebc9ec7cb39667cfc6510558b))
- add portojs/core, portojs/bignum and portojs/mechanics subpath exports ([67e2775](https://github.com/lucasgmagalhaes/portoJS/commit/67e2775f5a3c6686d735dcb8e5235f7f38dc289a))
- **bignum:** add mantissa/exponent BigNum with formatting ([9ffba08](https://github.com/lucasgmagalhaes/portoJS/commit/9ffba080f1302cda0cba8fa96f0fb0190bc9ef91))
- **clock:** add injectable clocks and time guard ([6ec58ce](https://github.com/lucasgmagalhaes/portoJS/commit/6ec58cea4d82fa88c4f0b61f8312a84f17eee372))
- **core:** add game-agnostic kernel with plugins, systems, saves and offline crediting ([160ddbf](https://github.com/lucasgmagalhaes/portoJS/commit/160ddbfd1216c92ae0d5dc572e0e76f3e5a961dc))
- **core:** reject oversized save strings with maxSaveChars ([d1d6ba4](https://github.com/lucasgmagalhaes/portoJS/commit/d1d6ba4545c1ce41eb99b05a9fad40c2198c69a4))
- **engine:** add fixed-timestep loop with catch-up limit ([3ef1425](https://github.com/lucasgmagalhaes/portoJS/commit/3ef14251633ed318b356365d9e1deb1a7961e785))
- **events:** add typed event emitter ([8c678ed](https://github.com/lucasgmagalhaes/portoJS/commit/8c678ede6948dd5603fcb0a0af40352cc653e20c))
- **examples:** add browser clicker built with Vite ([b75baa8](https://github.com/lucasgmagalhaes/portoJS/commit/b75baa8352ccbdc7d5c4c6e31fc0b8ff0ec3866e))
- **game:** accept extra plugins in createGame with merged types ([446720d](https://github.com/lucasgmagalhaes/portoJS/commit/446720dc9645bcc77363abc976fa468c5a8970b9))
- **game:** add declarative createGame and public entry point ([c09c741](https://github.com/lucasgmagalhaes/portoJS/commit/c09c741f4e63d4be9a633d337a0ef37585ad42bd))
- **offline:** add offline span resolution with cap, efficiency and step planner ([71762c5](https://github.com/lucasgmagalhaes/portoJS/commit/71762c54e53f0a744cae755d621e6c311cbc2913))
- **prestige:** add prestige plugin with formulas, keep rules and permanent bonuses ([e45bf29](https://github.com/lucasgmagalhaes/portoJS/commit/e45bf29ca6ed1c67ec5b3d9c90bc7fd9f582278d))
- **resources:** add closed-form production solver for offline progress ([207fc94](https://github.com/lucasgmagalhaes/portoJS/commit/207fc949b42dccd99f099b6ea249202307a66d81))
- **resources:** add exponential, linear and custom cost curves with closed-form bulk ([7a90e2d](https://github.com/lucasgmagalhaes/portoJS/commit/7a90e2dd8ea75f7c32bbcf3d433fc8ab0f2e81a1))
- **resources:** add resources, generators and upgrades plugin with exact offline gains ([b426b2c](https://github.com/lucasgmagalhaes/portoJS/commit/b426b2cc63239a3869294cc2b12fa6507c634b27))
- **save:** add versioned saves with migrations, checksum and base64 export ([61f4765](https://github.com/lucasgmagalhaes/portoJS/commit/61f4765ee1916b15ff2cc7f474333c6dcfde528d))

### Bug Fixes

- **bignum:** refuse implicit numeric conversion and add Core.dispose ([dfc30d3](https://github.com/lucasgmagalhaes/portoJS/commit/dfc30d3484aa9f4efd698f7da81a9a1ff48d01e3))
- **core:** discard pending loop time when a save is loaded ([e0dddd4](https://github.com/lucasgmagalhaes/portoJS/commit/e0dddd4ae408746674c352f13b332743db321c02))
- **engine:** allow unref'd interval scheduler so Node processes can exit ([ae9a0b9](https://github.com/lucasgmagalhaes/portoJS/commit/ae9a0b978121c4cd4bace2a5d64963f5677dd0f3))

### Performance

- add tick loop, offline and save benchmarks for 10k generators ([b7332fe](https://github.com/lucasgmagalhaes/portoJS/commit/b7332feb86addb78ac528741e132d4569bf0d778))

### Documentation

- add contributing guide and code of conduct ([e276323](https://github.com/lucasgmagalhaes/portoJS/commit/e2763234a1e3834908283bc899e8319fa3fadb88))
- add engineering audit and roadmap ([06720ac](https://github.com/lucasgmagalhaes/portoJS/commit/06720ac1c95bb1d35da50e0d28b6eb29933bbee8))
- add guides for offline progress, saves, prestige and plugins ([11e38a2](https://github.com/lucasgmagalhaes/portoJS/commit/11e38a26d4ea3627af0f764be521a86469bd156b))
- add MIT license ([b3e320c](https://github.com/lucasgmagalhaes/portoJS/commit/b3e320cf276e494af5d6dcec2e24de7587132974))
- add README with minimal example, features and roadmap ([95064e6](https://github.com/lucasgmagalhaes/portoJS/commit/95064e6ccb23dcc74b6cbca8ec81a9f098ef3733))
- add security policy ([86fc58e](https://github.com/lucasgmagalhaes/portoJS/commit/86fc58ea9e0545c1e922c359b9be56f075168b39))
- describe extra plugins in createGame ([0fd42e5](https://github.com/lucasgmagalhaes/portoJS/commit/0fd42e54f5ea9af6d6a2e05b801a540162231fe5))
- document entry points and update roadmap ([b5202c9](https://github.com/lucasgmagalhaes/portoJS/commit/b5202c9cc03bb768928bd608e13df648d244d432))
- document save size limit and update roadmap ([331d87c](https://github.com/lucasgmagalhaes/portoJS/commit/331d87c36ec1c73cd35d7e84335225d6189ba2b8))
- update API report and roadmap ([9b205ac](https://github.com/lucasgmagalhaes/portoJS/commit/9b205ac5d8e3e2b2279314bd1824f631a9039842))

### Chores

- rename project from leveling to portojs ([9a61a5b](https://github.com/lucasgmagalhaes/portoJS/commit/9a61a5b543a2e38e3d195568aface8272264b01a))
