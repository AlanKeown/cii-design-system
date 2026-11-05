import type * as Leaflet from 'leaflet';
import type { CrsDef } from '../crs/types.ts';
import type { PreparedTransform } from '../crs/transform-types.ts';
import { MapError } from '../errors.ts';
import { resolutionToZoom, zoomToResolution } from '../view.ts';

/** Phase 0 feasibility factory; production capabilities remain native-only until adapter integration. */
export function createProjectedLeafletCrs(
  library: typeof Leaflet,
  definition: CrsDef,
  forward: PreparedTransform,
  inverse: PreparedTransform
): Leaflet.CRS {
  const matrix = definition.tileMatrix;
  if (
    !matrix ||
    !definition.projected ||
    definition.units !== 'metres' ||
    forward.accuracy.source.code !== definition.geographicBase ||
    forward.accuracy.target.code !== definition.code ||
    inverse.accuracy.source.code !== definition.code ||
    inverse.accuracy.target.code !== definition.geographicBase ||
    !matrix.origin.every(Number.isFinite)
  ) {
    throw new MapError('DISPLAY_CRS_UNSUPPORTED', {
      code: definition.code,
      reason:
        'Projected Leaflet CRS needs a metre grid and matching explicit transforms.'
    });
  }
  zoomToResolution(0, matrix);
  // Clone caller-owned metadata; later edits must not change the mounted map's grid.
  const grid = structuredClone(matrix);
  return Object.assign({}, library.CRS.Earth, {
    wrapLng: undefined,
    wrapLat: undefined,
    code: definition.code,
    projection: {
      project(latlng: Leaflet.LatLng) {
        const [x, y] = forward.coordinate([latlng.lng, latlng.lat]);
        return new library.Point(x, y);
      },
      unproject(point: Leaflet.Point) {
        const [lng, lat] = inverse.coordinate([point.x, point.y]);
        return new library.LatLng(lat, lng);
      }
    },
    transformation: new library.Transformation(
      1,
      -grid.origin[0],
      -1,
      grid.origin[1]
    ),
    scale: (zoom: number) => 1 / zoomToResolution(zoom, grid),
    zoom: (scale: number) => resolutionToZoom(1 / scale, grid),
    // No implicit wrapping or invented projected extent.
    infinite: true,
    distance: library.CRS.Earth.distance
  });
}
