# Changelog

## [0.12.0](https://github.com/lucasgmagalhaes/portoJS/compare/portojs-v0.11.0...portojs-v0.12.0) (2026-10-16)


### Features

* **examples:** add the 2048 puzzle with undo, seeded randomness and saves, with tests ([d94ccf8](https://github.com/lucasgmagalhaes/portoJS/commit/d94ccf8b2b5ad860c4cc67a2c291ebf5dfd2c958))
* **examples:** add the platformer on a Tiled map with coyote time and jump buffer, with tests ([c06c6cd](https://github.com/lucasgmagalhaes/portoJS/commit/c06c6cddaf4089c0235f80dfd4d603e7827d93f3))
* **examples:** add the shooter simulation on the ECS, with tests ([d45ec0c](https://github.com/lucasgmagalhaes/portoJS/commit/d45ec0c0a1b7664bc6f19d13447339e69a9ce7bb))
* **idle:** add DailyQuests, a few quests drawn each day from a pool ([d346396](https://github.com/lucasgmagalhaes/portoJS/commit/d346396625f7aee3ee7e4cc08320725b42155523))
* **idle:** add DailyStreak for consecutive-day login streaks ([b5322bb](https://github.com/lucasgmagalhaes/portoJS/commit/b5322bb21bd6cb3daf00a328b8eefdeeb911f10a))
* **runtime:** add CloudSync to reconcile the local and cloud saves ([475433d](https://github.com/lucasgmagalhaes/portoJS/commit/475433d4d412737e7316f17ac52913e0c38e29c5))
* **runtime:** add per-frame update/lateUpdate hooks and game.alpha ([7c1d832](https://github.com/lucasgmagalhaes/portoJS/commit/7c1d8325e4aadef05992da49defe4bfa9054cc2e))
* **runtime:** add SaveSlots for several named save games in one storage ([6d8f143](https://github.com/lucasgmagalhaes/portoJS/commit/6d8f143b9232e43925b72e3f54a9680b1aa49f36))
* **runtime:** add TabLock so only one tab plays a game at a time ([072f539](https://github.com/lucasgmagalhaes/portoJS/commit/072f539265790ee44a23fd9355919488b346ebd1))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @portojs/core bumped to 0.12.0
    * @portojs/runtime bumped to 0.12.0
    * @portojs/idle bumped to 0.12.0
    * @portojs/react bumped to 0.12.0
    * @portojs/vue bumped to 0.12.0

## [0.11.0](https://github.com/lucasgmagalhaes/portoJS/compare/portojs-v0.10.0...portojs-v0.11.0) (2026-10-16)


### Features

* **idle:** add Economy.offlineSummary for a welcome-back screen ([#65](https://github.com/lucasgmagalhaes/portoJS/issues/65)) ([89d5792](https://github.com/lucasgmagalhaes/portoJS/commit/89d57929822766c5e5b0d87ad13c0a1557ee5970))
* **runtime:** add Autosave with rotating backups and storage adapters ([#64](https://github.com/lucasgmagalhaes/portoJS/issues/64)) ([a34915e](https://github.com/lucasgmagalhaes/portoJS/commit/a34915e3b176c33a74776b946f494174d4473c05)), closes [#30](https://github.com/lucasgmagalhaes/portoJS/issues/30)
* **runtime:** add object tags, layers and hierarchy queries ([e5ccebd](https://github.com/lucasgmagalhaes/portoJS/commit/e5ccebd543f930601ca2ae393f877b722619661b))
* **runtime:** add Pool to reuse game objects ([9f53e8c](https://github.com/lucasgmagalhaes/portoJS/commit/9f53e8c342660c31092b56d4be1d6b4277add684))
* **runtime:** add SceneManager with additive scenes, persistence and transitions ([#62](https://github.com/lucasgmagalhaes/portoJS/issues/62)) ([e2fb2d0](https://github.com/lucasgmagalhaes/portoJS/commit/e2fb2d06e19e7d780b3c33e1a2dd6d94b83c1115))
* **runtime:** add timeScale, pause/resume and game-time timers ([#59](https://github.com/lucasgmagalhaes/portoJS/issues/59)) ([293a5b2](https://github.com/lucasgmagalhaes/portoJS/commit/293a5b24278c0239a347efaff970ff5f381cca55)), closes [#26](https://github.com/lucasgmagalhaes/portoJS/issues/26)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @portojs/core bumped to 0.11.0
    * @portojs/runtime bumped to 0.11.0
    * @portojs/idle bumped to 0.11.0
    * @portojs/react bumped to 0.11.0
    * @portojs/vue bumped to 0.11.0

## [0.10.0](https://github.com/lucasgmagalhaes/portoJS/compare/portojs-v0.9.0...portojs-v0.10.0) (2026-10-15)


### Features

* **core:** add an optional compressed save format ([1f95668](https://github.com/lucasgmagalhaes/portoJS/commit/1f95668ecf3c131a1063dea4e0e5cc7ffaee82ce))


### Documentation

* add a themed documentation site with tutorials, a catalogue and per-package API reference ([4de176c](https://github.com/lucasgmagalhaes/portoJS/commit/4de176c4cffb1e0adfeb52b34cb7b98814a716be))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @portojs/core bumped to 0.10.0
    * @portojs/runtime bumped to 0.10.0
    * @portojs/idle bumped to 0.10.0
    * @portojs/react bumped to 0.10.0
    * @portojs/vue bumped to 0.10.0

## [0.9.0](https://github.com/lucasgmagalhaes/portoJS/compare/portojs-v0.8.0...portojs-v0.9.0) (2026-10-15)


### Chores

* **portojs:** Synchronize portojs versions


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @portojs/core bumped to 0.9.0
    * @portojs/runtime bumped to 0.9.0
    * @portojs/idle bumped to 0.9.0
    * @portojs/react bumped to 0.9.0
    * @portojs/vue bumped to 0.9.0

## [0.8.0](https://github.com/lucasgmagalhaes/portoJS/compare/portojs-v0.7.0...portojs-v0.8.0) (2026-10-15)


### Refactoring

* import sources with .ts extensions ([7e4e6b6](https://github.com/lucasgmagalhaes/portoJS/commit/7e4e6b61337c5eb962be78fc63aafbd363bd9663))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @portojs/core bumped to 0.8.0
    * @portojs/runtime bumped to 0.8.0
    * @portojs/idle bumped to 0.8.0
    * @portojs/react bumped to 0.8.0
    * @portojs/vue bumped to 0.8.0

## [0.7.0](https://github.com/lucasgmagalhaes/portoJS/compare/portojs-v0.6.0...portojs-v0.7.0) (2026-10-15)


### Refactoring

* split the library into a Lerna monorepo of [@portojs](https://github.com/portojs) packages ([eb525a5](https://github.com/lucasgmagalhaes/portoJS/commit/eb525a54931779a18511deba17af47fdb8a41b68))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @portojs/core bumped to 0.7.0
    * @portojs/runtime bumped to 0.7.0
    * @portojs/idle bumped to 0.7.0
    * @portojs/react bumped to 0.7.0
    * @portojs/vue bumped to 0.7.0
