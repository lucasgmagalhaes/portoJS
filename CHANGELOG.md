# Changelog

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
