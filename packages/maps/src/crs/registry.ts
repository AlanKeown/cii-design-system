import { MapError } from '../errors.ts';
import { Registry } from '../registry.ts';
import { definitions } from './definitions.ts';
import type { CrsDef, CrsDefinitionProvider } from './types.ts';

export const DEFAULT_DISPLAY_CRS = 'EPSG:3857';

export class CrsRegistry {
  readonly providers = new Registry<CrsDefinitionProvider>();

  async resolve(code: string): Promise<CrsDef> {
    for (const provider of this.providers.values()) {
      const definition = await provider.resolve(code);
      if (definition) return definition;
    }
    throw new MapError('CRS_NOT_FOUND', { code });
  }
}

const coreCodes = new Set(['EPSG:3857', 'EPSG:4326', 'OGC:CRS84']);
export const coreCrsProvider: CrsDefinitionProvider = {
  resolve: (code) =>
    coreCodes.has(code)
      ? definitions.find((def) => def.code === code)
      : undefined
};
export const australianCrsProvider: CrsDefinitionProvider = {
  resolve: (code) =>
    !coreCodes.has(code)
      ? definitions.find((def) => def.code === code)
      : undefined
};

export function createCrsRegistry(
  options: { australia?: boolean; definitions?: readonly CrsDef[] } = {}
): CrsRegistry {
  const registry = new CrsRegistry();
  if (options.definitions) {
    const custom = structuredClone(options.definitions);
    registry.providers.register('configured', {
      resolve: (code) => custom.find((definition) => definition.code === code)
    });
  }
  registry.providers.register('core', coreCrsProvider);
  if (options.australia !== false)
    registry.providers.register('australia', australianCrsProvider);
  return registry;
}
