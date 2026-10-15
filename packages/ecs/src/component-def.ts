/**
 * Numeric field types of an ECS component, each backed by a typed array.
 */
export interface FieldArrays {
  i8: Int8Array;
  u8: Uint8Array;
  i16: Int16Array;
  u16: Uint16Array;
  i32: Int32Array;
  u32: Uint32Array;
  f32: Float32Array;
  f64: Float64Array;
}

/**
 * Name of a numeric field type.
 */
export type FieldType = keyof FieldArrays;

/**
 * The fields of a component: field name to numeric type.
 */
export type Schema = Readonly<Record<string, FieldType>>;

/**
 * The typed arrays of a component inside one world: one array per field, indexed by entity id.
 */
export type Store<S extends Schema> = { readonly [K in keyof S]: FieldArrays[S[K]] };

/**
 * Initial values for the fields of a component.
 */
export type Values<S extends Schema> = { readonly [K in keyof S]?: number };

/**
 * A component definition: pure data, described by a schema. Create one with
 * {@link defineComponent} and use it with any {@link World}.
 */
export class ComponentDef<S extends Schema = Schema> {
  /**
   * @internal Use {@link defineComponent}.
   * @param schema field names and types.
   */
  constructor(readonly schema: S) {}
}

/**
 * Defines a component made of numeric fields, stored as struct-of-arrays for fast iteration.
 *
 * @example
 * const Position = defineComponent({ x: 'f32', y: 'f32' });
 * const Health = defineComponent({ hp: 'u16' });
 */
export function defineComponent<S extends Schema>(schema: S): ComponentDef<S> {
  return new ComponentDef(schema);
}
