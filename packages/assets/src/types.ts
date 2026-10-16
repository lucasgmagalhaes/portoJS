/**
 * Maps asset type names to the value a loader of that type produces. Add your own with
 * declaration merging:
 *
 * @example
 * declare module '@portojs/assets' {
 *   interface AssetTypes {
 *     atlas: Atlas;
 *   }
 * }
 */
export interface AssetTypes {
  /**
   * Parsed JSON.
   */
  json: unknown;
  /**
   * Plain text.
   */
  text: string;
  /**
   * Raw bytes.
   */
  binary: ArrayBuffer;
  /**
   * A decoded image.
   */
  image: ImageBitmap;
}

/**
 * Name of an asset type.
 */
export type AssetType = keyof AssetTypes;

/**
 * What the loader needs from an HTTP response, a subset of `Response`.
 */
export interface FetchResponse {
  readonly ok: boolean;
  readonly status: number;
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
  json(): Promise<unknown>;
  blob(): Promise<Blob>;
}

/**
 * Fetches a URL, like `fetch`. Inject your own for tests or custom transports.
 */
export type AssetFetcher = (
  url: string,
  init?: { readonly signal?: AbortSignal },
) => Promise<FetchResponse>;

/**
 * What a loader can use while loading one asset.
 */
export interface LoaderContext {
  /**
   * The absolute-or-relative URL to fetch, with the base URL applied.
   */
  readonly url: string;
  /**
   * Fetches `url` (or another one) with the retry policy and cancellation of this load.
   */
  fetch(url?: string): Promise<FetchResponse>;
  /**
   * Fires when the load is cancelled.
   */
  readonly signal: AbortSignal;
  /**
   * Loads another asset of the manifest, for example the image an atlas refers to.
   */
  load<K extends AssetType = AssetType>(name: string): Promise<AssetTypes[K]>;
}

/**
 * Knows how to load one kind of asset.
 */
export interface AssetLoaderDefinition<T> {
  /**
   * Produces the asset.
   */
  load(context: LoaderContext): Promise<T>;
  /**
   * Frees the asset when its last reference is released.
   */
  dispose?(asset: T): void;
}

/**
 * One entry of a manifest.
 */
export interface AssetEntry<K extends AssetType = AssetType> {
  /**
   * The loader to use.
   */
  readonly type: K;
  /**
   * Where to fetch it, relative to the loader's base URL.
   */
  readonly url: string;
}

/**
 * Describes the assets of a game and how they group into bundles.
 */
export interface AssetManifest {
  /**
   * Assets by name.
   */
  readonly assets: Readonly<Record<string, AssetEntry>>;
  /**
   * Named groups of asset names, loaded together with progress.
   */
  readonly bundles?: Readonly<Record<string, readonly string[]>>;
}

/**
 * Progress of a bundle or list load.
 */
export interface LoadProgress {
  /**
   * Assets finished.
   */
  readonly loaded: number;
  /**
   * Assets in the load.
   */
  readonly total: number;
  /**
   * `loaded / total`, `1` for an empty load.
   */
  readonly ratio: number;
  /**
   * Name of the asset that just finished, if any.
   */
  readonly name: string | undefined;
}
