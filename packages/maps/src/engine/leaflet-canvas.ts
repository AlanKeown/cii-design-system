import type * as Leaflet from 'leaflet';

/** Narrow bridge to Leaflet's scheduled redraw hook, absent from its public types. */
interface CanvasRedraw extends Leaflet.Canvas {
  _redraw(): void;
}

/** Ignore late redraws after native removal has destroyed the Canvas context. */
export function createLeafletCanvas(
  library: typeof Leaflet,
  options: Leaflet.RendererOptions
): Leaflet.Canvas {
  const redraw = (library.Canvas.prototype as CanvasRedraw)._redraw;
  class LifecycleCanvas extends library.Canvas {
    #attached = false;
    override onAdd(map: Leaflet.Map): this {
      this.#attached = true;
      try {
        super.onAdd(map);
      } catch (error) {
        this.#attached = false;
        throw error;
      }
      return this;
    }
    override onRemove(map: Leaflet.Map): this {
      this.#attached = false;
      super.onRemove(map);
      return this;
    }
    _redraw(): void {
      // Removed renderers have no context. Keep real drawing failures visible while attached.
      if (this.#attached) redraw.call(this);
    }
  }
  return new LifecycleCanvas(options);
}
