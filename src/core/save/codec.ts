import { SaveCorruptedError } from './errors.js';

/** Any value representable in JSON. */
export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/** A JSON object. */
export type JsonObject = { [key: string]: JsonValue };

/** `true` for non-null, non-array objects. */
export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * `JSON.stringify` with object keys sorted, so equal data always yields equal text
 * regardless of key insertion order.
 */
export function stableStringify(value: JsonValue): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  // Default sort compares UTF-16 code units, which is exactly the order we want and is much
  // faster than a comparator for objects with thousands of keys.
  const keys = Object.keys(value).sort();
  let out = '{';
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i] as string;
    if (i > 0) out += ',';
    out += `${JSON.stringify(key)}:${stableStringify(value[key] as JsonValue)}`;
  }
  return `${out}}`;
}

/** 32-bit FNV-1a hash of `text` as 8 hex digits. Detects accidents, not tampering. */
export function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

const CHUNK = 0x8000;

/** Encodes text as UTF-8 then Base64. */
export function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Decodes Base64 produced by {@link toBase64}.
 *
 * @throws {SaveCorruptedError} if the input is not valid Base64 / UTF-8.
 */
export function fromBase64(encoded: string): string {
  try {
    const binary = atob(encoded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new SaveCorruptedError('Save string is not valid Base64');
  }
}
