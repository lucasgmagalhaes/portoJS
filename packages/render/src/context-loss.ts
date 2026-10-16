/**
 * Events about the GPU connection of a {@link Renderer}.
 *
 * - `contextlost`: the GPU took the drawing resources away (a mobile app went to the background,
 *   the driver reset, the GPU process crashed). Drawing does nothing until it is restored.
 * - `contextrestored`: the renderer rebuilt its resources and re-uploaded every texture.
 */
export type RendererEvent = 'contextlost' | 'contextrestored';

/**
 * Small listener list shared by the renderers.
 */
export class RendererEvents {
  private readonly listeners: Record<RendererEvent, Set<() => void>> = {
    contextlost: new Set(),
    contextrestored: new Set(),
  };

  /**
   * Adds a listener. Returns a function that removes it.
   */
  on(event: RendererEvent, listener: () => void): () => void {
    const set = this.listeners[event];
    set.add(listener);
    return (): void => {
      set.delete(listener);
    };
  }

  /**
   * Calls the listeners of an event.
   */
  emit(event: RendererEvent): void {
    for (const listener of [...this.listeners[event]]) listener();
  }

  /**
   * Forgets every listener.
   */
  clear(): void {
    this.listeners.contextlost.clear();
    this.listeners.contextrestored.clear();
  }
}
