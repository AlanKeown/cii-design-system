import type { Coord } from '../crs/types.ts';
import type { Geometry, Position } from './types.ts';

export function geometryHitDistance(
  geometry: Geometry,
  pixel: Coord,
  project: (position: Position) => Coord
): number {
  const distance = (a: Coord, b: Coord) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const line = (positions: readonly Position[]) => {
    let closest = Infinity;
    for (let i = 1; i < positions.length; i++) {
      const a = project(positions[i - 1]);
      const b = project(positions[i]);
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const length = dx * dx + dy * dy;
      const t = length
        ? Math.max(
            0,
            Math.min(
              1,
              ((pixel[0] - a[0]) * dx + (pixel[1] - a[1]) * dy) / length
            )
          )
        : 0;
      closest = Math.min(
        closest,
        distance(pixel, [a[0] + t * dx, a[1] + t * dy])
      );
    }
    return closest;
  };
  const inside = (ring: readonly Position[]) => {
    let hit = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = project(ring[i]);
      const b = project(ring[j]);
      if (
        a[1] > pixel[1] !== b[1] > pixel[1] &&
        pixel[0] < ((b[0] - a[0]) * (pixel[1] - a[1])) / (b[1] - a[1]) + a[0]
      )
        hit = !hit;
    }
    return hit;
  };
  const polygon = (rings: readonly (readonly Position[])[]) =>
    rings[0] && inside(rings[0]) && !rings.slice(1).some(inside)
      ? 0
      : Math.min(...rings.map(line));
  switch (geometry.type) {
    case 'Point':
      return distance(pixel, project(geometry.coordinates));
    case 'MultiPoint':
      return Math.min(
        ...geometry.coordinates.map((point) => distance(pixel, project(point)))
      );
    case 'LineString':
      return line(geometry.coordinates);
    case 'MultiLineString':
      return Math.min(...geometry.coordinates.map(line));
    case 'Polygon':
      return polygon(geometry.coordinates);
    case 'MultiPolygon':
      return Math.min(...geometry.coordinates.map(polygon));
    case 'GeometryCollection':
      return Math.min(
        ...geometry.geometries.map((child) =>
          geometryHitDistance(child, pixel, project)
        )
      );
  }
}
