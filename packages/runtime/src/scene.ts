import type { ComponentConstructor } from './component.ts';
import type { Component } from './component.ts';
import type { Game } from './game.ts';
import type { GameObject } from './game-object.ts';

const MAX_DEPTH = 64;

/**
 * Thrown by {@link loadScene} when the scene description is invalid.
 */
export class SceneError extends Error {
  override readonly name = 'SceneError';
}

/**
 * A component entry of a scene description.
 */
export interface SceneComponent {
  /**
   * The component's `typeId`, as registered in the {@link ComponentRegistry}.
   */
  readonly type: string;
  /**
   * Options passed to the component's constructor. Any `{ "$ref": "Object/Type" }` inside is
   * replaced by that live object or component.
   */
  readonly options?: unknown;
  /**
   * Initial value of `enabled`. Default `true`.
   */
  readonly enabled?: boolean;
}

/**
 * A game object entry of a scene description.
 */
export interface SceneObject {
  /**
   * Unique object name.
   */
  readonly name: string;
  /**
   * Initial value of `activeSelf`. Default `true`.
   */
  readonly active?: boolean;
  /**
   * Components to add, in order.
   */
  readonly components?: readonly SceneComponent[];
  /**
   * Child objects.
   */
  readonly children?: readonly SceneObject[];
}

/**
 * A scene description: plain JSON that {@link loadScene} turns into objects and components.
 */
export interface Scene {
  /**
   * Top-level objects, created in order.
   */
  readonly objects: readonly SceneObject[];
}

type RegisteredType = ComponentConstructor<Component, never>;

function typeIdOf(type: { name: string }): string {
  const id = (type as { typeId?: string }).typeId;
  return id ?? type.name;
}

/**
 * Maps `typeId` strings to component classes, so scenes can name components as data.
 *
 * @example
 * const registry = new ComponentRegistry().register(Health, Spinner);
 */
export class ComponentRegistry {
  private readonly types = new Map<string, RegisteredType>();

  /**
   * Registers component classes under their `typeId` (or class name).
   *
   * @throws {Error} if a different class is already registered under the same id.
   */
  register(...types: RegisteredType[]): this {
    for (const type of types) {
      const id = typeIdOf(type);
      const existing = this.types.get(id);
      if (existing !== undefined && existing !== type) {
        throw new Error(`ComponentRegistry: "${id}" is already registered`);
      }
      this.types.set(id, type);
    }
    return this;
  }

  /**
   * Looks up a class by `typeId`.
   */
  get(id: string): RegisteredType | undefined {
    return this.types.get(id);
  }

  /**
   * Whether a class is registered under `id`.
   */
  has(id: string): boolean {
    return this.types.has(id);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function expectRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) throw new SceneError(`${path}: expected an object`);
  return value;
}

function assertKeys(
  record: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
): void {
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) throw new SceneError(`${path}: unknown key "${key}"`);
  }
}

function lookup(game: Game, ref: string, path: string): GameObject | Component {
  const slash = ref.indexOf('/');
  const objectName = slash < 0 ? ref : ref.slice(0, slash);
  const object = game.find(objectName);
  if (object === undefined) throw new SceneError(`${path}: no object named "${objectName}"`);
  if (slash < 0) return object;
  const key = ref.slice(slash + 1);
  const hash = key.lastIndexOf('#');
  const id = hash < 0 ? key : key.slice(0, hash);
  const wanted = hash < 0 ? 1 : Number(key.slice(hash + 1));
  let seen = 0;
  for (const component of object.components) {
    if (typeIdOf(component.constructor) !== id) continue;
    seen += 1;
    if (seen === wanted) return component;
  }
  throw new SceneError(`${path}: object "${objectName}" has no component "${key}"`);
}

function resolve(value: unknown, game: Game, path: string, depth: number): unknown {
  if (depth > MAX_DEPTH) throw new SceneError(`${path}: nested too deeply`);
  if (Array.isArray(value)) {
    const list: unknown[] = [];
    for (let index = 0; index < value.length; index++) {
      list.push(resolve(value[index], game, `${path}[${index}]`, depth + 1));
    }
    return list;
  }
  if (!isRecord(value)) return value;
  if ('$ref' in value) {
    const ref = value['$ref'];
    if (Object.keys(value).length !== 1 || typeof ref !== 'string') {
      throw new SceneError(`${path}: a reference must be exactly { "$ref": "<string>" }`);
    }
    return lookup(game, ref, path);
  }
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value)) {
    if (key === '__proto__') throw new SceneError(`${path}: key "__proto__" is not allowed`);
    out[key] = resolve(value[key], game, `${path}.${key}`, depth + 1);
  }
  return out;
}

function buildComponents(
  game: Game,
  object: GameObject,
  raw: unknown,
  registry: ComponentRegistry,
  path: string,
): void {
  if (raw === undefined) return;
  if (!Array.isArray(raw)) throw new SceneError(`${path}: expected an array`);
  for (let index = 0; index < raw.length; index++) {
    const at = `${path}[${index}]`;
    const entry = expectRecord(raw[index], at);
    assertKeys(entry, ['type', 'options', 'enabled'], at);
    const type = entry['type'];
    if (typeof type !== 'string') throw new SceneError(`${at}.type: expected a string`);
    const constructor = registry.get(type);
    if (constructor === undefined) throw new SceneError(`${at}.type: unknown component "${type}"`);
    const enabled = entry['enabled'];
    if (enabled !== undefined && typeof enabled !== 'boolean') {
      throw new SceneError(`${at}.enabled: expected a boolean`);
    }
    const options = resolve(entry['options'], game, `${at}.options`, 0);
    const component = object.addComponent(constructor, options as never);
    if (enabled === false) component.enabled = false;
  }
}

function buildObject(
  game: Game,
  raw: unknown,
  parent: GameObject | undefined,
  registry: ComponentRegistry,
  path: string,
  depth: number,
  roots: GameObject[],
): void {
  if (depth > MAX_DEPTH) throw new SceneError(`${path}: nested too deeply`);
  const entry = expectRecord(raw, path);
  assertKeys(entry, ['name', 'active', 'components', 'children'], path);
  const name = entry['name'];
  if (typeof name !== 'string' || name === '') {
    throw new SceneError(`${path}.name: expected a non-empty string`);
  }
  const active = entry['active'];
  if (active !== undefined && typeof active !== 'boolean') {
    throw new SceneError(`${path}.active: expected a boolean`);
  }
  const object = game.createObject(name, {
    ...(parent === undefined ? {} : { parent }),
    ...(active === undefined ? {} : { active }),
  });
  if (parent === undefined) roots.push(object);
  buildComponents(game, object, entry['components'], registry, `${path}.components`);
  const children = entry['children'];
  if (children === undefined) return;
  if (!Array.isArray(children)) throw new SceneError(`${path}.children: expected an array`);
  for (let index = 0; index < children.length; index++) {
    buildObject(
      game,
      children[index],
      object,
      registry,
      `${path}.children[${index}]`,
      depth + 1,
      roots,
    );
  }
}

/**
 * Builds the objects and components described by `scene` (plain JSON, for example from
 * `JSON.parse`), like loading a Unity scene. Objects are created in order, so a `{ "$ref" }` in a
 * component's options can point at anything created before it. It is all-or-nothing: if
 * anything is invalid, every object created by this call is destroyed and a {@link SceneError}
 * is thrown.
 *
 * References: `{ "$ref": "Gold" }` is the object named `Gold`; `{ "$ref": "Gold/Resource" }` is its
 * `Resource` component (`Gold/Resource#2` picks the second one). Object names containing `/`
 * cannot be referenced.
 *
 * @example
 * loadScene(game, {
 *   objects: [
 *     { name: 'Gold', components: [{ type: 'Resource', options: { initial: 10 } }] },
 *     {
 *       name: 'Miner',
 *       components: [
 *         {
 *           type: 'Generator',
 *           options: {
 *             cost: { resource: { $ref: 'Gold/Resource' }, base: 10, growth: 1.15 },
 *             produces: { $ref: 'Gold/Resource' },
 *             rate: 1,
 *           },
 *         },
 *       ],
 *     },
 *   ],
 * }, registry);
 *
 * @returns the top-level objects created.
 * @throws {SceneError} if the description is invalid.
 */
export function loadScene(game: Game, scene: unknown, registry: ComponentRegistry): GameObject[] {
  const root = expectRecord(scene, 'scene');
  assertKeys(root, ['objects'], 'scene');
  const list = root['objects'];
  if (!Array.isArray(list)) throw new SceneError('scene.objects: expected an array');
  const roots: GameObject[] = [];
  try {
    for (let index = 0; index < list.length; index++) {
      buildObject(game, list[index], undefined, registry, `scene.objects[${index}]`, 0, roots);
    }
  } catch (error) {
    for (const object of roots) object.destroy();
    throw error;
  }
  return roots;
}
