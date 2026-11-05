import proj4 from 'proj4';
import type { CRS } from 'maplibre-gl';

declare const self: {
  setProjectionHandler(
    handler: (definition: string) => CRS['projection']
  ): void;
};
// Explicit GDA2020 geographic input; no global proj4 definitions or implicit WGS84 conversion.
self.setProjectionHandler((definition) =>
  proj4('+proj=longlat +ellps=GRS80 +no_defs +type=crs', definition)
);
