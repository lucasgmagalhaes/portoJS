/**
 * PortoJS: a headless game engine for TypeScript, with a Unity-style Game / GameObject /
 * Component model and optional idle-game mechanics.
 *
 * - {@link Game} runs the fixed-timestep loop, saves and offline progress.
 * - {@link Component} is the base class of behavior you attach to a {@link GameObject}.
 * - The idle mechanics (resources, generators, upgrades, prestige and more) are components you
 *   add only if you want them.
 */
export * from '@portojs/core';
export * from '@portojs/runtime';
export * from '@portojs/idle';
