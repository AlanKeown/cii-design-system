import type { Coord, Geometry, VertexSource } from '../src/index.ts';
type Polygon = Extract<Geometry, { type: 'Polygon' | 'MultiLineString' }> & {
  type: 'Polygon';
};
export interface VertexProjection {
  coordinate: Coord;
  source: string;
  target: string;
}

/** Adapter A feasibility helper; project() must batch these requests through authoritative PostGIS. */
export async function rebuildPolygon(
  input: Polygon,
  source: string,
  target: string,
  origins: readonly VertexSource[],
  project: (requests: readonly VertexProjection[]) => Promise<readonly Coord[]>,
  stored?: { geometry: Polygon; version: string; baseVersion: string }
): Promise<Polygon> {
  if (!source || !target || input.type !== 'Polygon')
    throw new Error('Explicit polygon CRS required.');
  const requests: VertexProjection[] = [];
  const slots: (Coord | number)[] = [];
  let index = 0;
  for (const ring of input.coordinates)
    for (const coordinate of ring) {
      if (coordinate.length !== 2 || !coordinate.every(Number.isFinite))
        throw new Error('XY vertices required.');
      const origin = origins[index++];
      if (!origin) throw new Error('Missing vertex origin.');
      if (origin.kind === 'stored') {
        if (!stored || stored.version !== stored.baseVersion)
          throw new Error('EDIT_CONFLICT');
        if (
          origin.path.length !== 2 ||
          origin.path.some((value) => !Number.isInteger(value) || value < 0)
        )
          throw new Error('Invalid stored path.');
        const retained =
          stored.geometry.coordinates[origin.path[0]]?.[origin.path[1]];
        if (
          !retained ||
          retained.length !== 2 ||
          !retained.every(Number.isFinite)
        )
          throw new Error('Invalid stored vertex.');
        slots.push([retained[0], retained[1]]);
      } else {
        slots.push(requests.length);
        requests.push({
          source: origin.kind === 'snapped' ? origin.crs : source,
          target,
          coordinate:
            origin.kind === 'snapped'
              ? origin.coordinate
              : [coordinate[0], coordinate[1]]
        });
      }
    }
  if (index !== origins.length) throw new Error('Extra vertex origins.');
  const projected = await project(requests);
  if (
    projected.length !== requests.length ||
    projected.some(
      (coordinate) =>
        coordinate.length !== 2 || !coordinate.every(Number.isFinite)
    )
  )
    throw new Error('Invalid authoritative transform response.');
  index = 0;
  const geometry: Polygon = {
    type: 'Polygon',
    coordinates: input.coordinates.map((ring) =>
      ring.map(() => {
        const slot = slots[index++],
          coordinate = typeof slot === 'number' ? projected[slot] : slot;
        return [coordinate[0], coordinate[1]];
      })
    )
  };
  for (const ring of geometry.coordinates) {
    if (
      ring.length < 4 ||
      ring[0][0] !== ring.at(-1)![0] ||
      ring[0][1] !== ring.at(-1)![1]
    )
      throw new Error('Polygon ring must remain closed.');
  }
  return geometry;
}
