import { AssetError } from './errors.ts';
import type { AssetLoaderDefinition, AssetTypes } from './types.ts';

/**
 * Loads and parses JSON.
 */
export const jsonLoader: AssetLoaderDefinition<AssetTypes['json']> = {
  async load(context) {
    return (await context.fetch()).json();
  },
};

/**
 * Loads plain text.
 */
export const textLoader: AssetLoaderDefinition<AssetTypes['text']> = {
  async load(context) {
    return (await context.fetch()).text();
  },
};

/**
 * Loads raw bytes.
 */
export const binaryLoader: AssetLoaderDefinition<AssetTypes['binary']> = {
  async load(context) {
    return (await context.fetch()).arrayBuffer();
  },
};

/**
 * Loads and decodes an image with `createImageBitmap`. The bitmap is closed on release.
 */
export const imageLoader: AssetLoaderDefinition<AssetTypes['image']> = {
  async load(context) {
    if (typeof createImageBitmap !== 'function') {
      throw new AssetError(context.url, context.url, 'createImageBitmap is not available here');
    }
    const blob = await (await context.fetch()).blob();
    return createImageBitmap(blob);
  },
  dispose(bitmap) {
    bitmap.close();
  },
};
