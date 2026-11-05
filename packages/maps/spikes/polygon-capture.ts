import type {
  CaptureMode,
  CaptureState,
  Coord,
  Geometry,
  MapPointerEvent
} from '../src/index.ts';

/** S5 feasibility mode: an explicit snap fixture retains canonical source vertices exactly. */
export function polygonProbe(
  vertices: readonly Coord[],
  complete: (geometry: Geometry) => void
): CaptureMode {
  return {
    create() {
      let points: Coord[] = [],
        status: CaptureState['status'] = 'armed';
      const state = (): CaptureState => ({
        status,
        sketch: {
          type: 'FeatureCollection',
          features: points.length
            ? [
                {
                  type: 'Feature',
                  properties: {},
                  geometry: { type: 'LineString', coordinates: points }
                }
              ]
            : []
        }
      });
      const finish = () => {
        if (points.length >= 3 && status !== 'complete') {
          status = 'complete';
          complete({ type: 'Polygon', coordinates: [[...points, points[0]]] });
        }
        return state();
      };
      return {
        pointer(event: MapPointerEvent) {
          if (status === 'complete' || status === 'cancelled') return state();
          if (event.type === 'dblclick') {
            event.preventDefault();
            return finish();
          }
          if (event.type !== 'click') return state();
          // The spike runs at one projected metre per CSS pixel. No rounding of freehand geometry.
          const closest = vertices.find(
            (vertex) =>
              Math.hypot(
                vertex[0] - event.coord[0],
                vertex[1] - event.coord[1]
              ) <= 6
          );
          const point = closest ?? event.coord;
          const last = points.at(-1);
          if (!last || last[0] !== point[0] || last[1] !== point[1])
            points = [...points, point];
          status = 'sketching';
          return state();
        },
        key(event) {
          if (event.key === 'Enter') {
            event.preventDefault();
            return finish();
          }
          if (event.key === 'Escape') {
            status = 'cancelled';
            points = [];
          }
          if (event.key === 'Backspace') points = points.slice(0, -1);
          return state();
        },
        cancel() {
          status = 'cancelled';
          points = [];
          return state();
        }
      };
    }
  };
}
