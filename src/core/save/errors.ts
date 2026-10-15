/** Thrown when save data cannot be parsed or fails its integrity check. */
export class SaveCorruptedError extends Error {
  override readonly name = 'SaveCorruptedError';
}

/** Thrown when a save's version cannot be brought to the current version. */
export class SaveVersionError extends Error {
  override readonly name = 'SaveVersionError';
}
