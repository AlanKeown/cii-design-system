import { createOgcRasterSources } from '../sources/ogc-raster.ts';
import { xyzSource } from '../sources/xyz.ts';
import { Registry } from '../registry.ts';
import { EngineRegistry } from '../engine/registry.ts';
import { createCrsRegistry } from '../crs/registry.ts';
import { createFeatureSources } from '../sources/geojson.ts';
import type { CrsRegistry } from '../crs/registry.ts';
import type { CrsDef, CrsDefinitionProvider } from '../crs/types.ts';
import type { DataSourceProvider } from '../sources/geojson.ts';
import type { LayerRenderer } from '../layers/types.ts';
import type {
  CaptureMode,
  ControlRegistration,
  FeatureExporter,
  GeometryValidator,
  PersistenceAdapter,
  StyleCompiler
} from './types.ts';

export interface Registries {
  engines: EngineRegistry;
  crs: CrsRegistry;
  /** The same provider registry consumed by crs.resolve(), never a second copy. */
  crsProviders: Registry<CrsDefinitionProvider>;
  sources: Registry<DataSourceProvider>;
  renderers: Registry<LayerRenderer>;
  controls: Registry<ControlRegistration>;
  captureModes: Registry<CaptureMode>;
  validators: Registry<GeometryValidator>;
  persistence: Registry<PersistenceAdapter>;
  exporters: Registry<FeatureExporter>;
  styleCompilers: Registry<StyleCompiler>;
}

/** One collection per map/application; built-ins use the same public registration methods. */
export function createRegistries(
  options: {
    australia?: boolean;
    fetch?: typeof fetch;
    definitions?: readonly CrsDef[];
  } = {}
): Registries {
  const crs = createCrsRegistry(options);
  const sources = createFeatureSources(options.fetch);
  sources.register('xyz', xyzSource);
  const ogc = createOgcRasterSources(options.fetch);
  sources.register('wms', ogc.wms);
  sources.register('wmts', ogc.wmts);
  return {
    engines: new EngineRegistry(),
    crs,
    crsProviders: crs.providers,
    sources,
    renderers: new Registry<LayerRenderer>(),
    controls: new Registry<ControlRegistration>(),
    captureModes: new Registry<CaptureMode>(),
    validators: new Registry<GeometryValidator>(),
    persistence: new Registry<PersistenceAdapter>(),
    exporters: new Registry<FeatureExporter>(),
    styleCompilers: new Registry<StyleCompiler>()
  };
}
