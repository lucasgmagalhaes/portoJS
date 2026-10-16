/**
 * A small, fast ECS for PortoJS: integer entities, typed-array components, cached queries and systems.
 *
 * @module @portojs/ecs
 */

export { ComponentDef, defineComponent } from './component-def.ts';
export type { FieldArrays, FieldType, Schema, Store, Values } from './component-def.ts';
export { EcsWorld } from './ecs-world.ts';
export { Query, SnapshotError, World, not } from './world.ts';
export type {
  Not,
  QueryTerm,
  System,
  SystemOptions,
  WorldOptions,
  WorldSnapshot,
} from './world.ts';
