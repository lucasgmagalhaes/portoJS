/**
 * An asset failed to load.
 */
export class AssetError extends Error {
  override readonly name = 'AssetError';

  constructor(
    readonly assetName: string,
    readonly url: string,
    message: string,
    options?: { readonly cause?: unknown },
  ) {
    super(`Asset "${assetName}" (${url}): ${message}`, options);
  }
}

/**
 * A name is not in the manifest, or an asset was requested before it was loaded.
 */
export class UnknownAssetError extends Error {
  override readonly name = 'UnknownAssetError';

  constructor(
    readonly assetName: string,
    message: string,
  ) {
    super(`Asset "${assetName}": ${message}`);
  }
}

/**
 * Creates the error a cancelled load rejects with, named `AbortError` like the browser's.
 */
export function abortError(): Error {
  const error = new Error('The operation was aborted');
  error.name = 'AbortError';
  return error;
}
