import { MapError } from '../errors.ts';
import { Registry } from '../registry.ts';
import type { EngineCapabilities, EngineLoader, IMapEngine } from './types.ts';

export function assertDisplayCrs(
  capabilities: EngineCapabilities,
  code: string,
  allowExperimental = false
): void {
  const support = capabilities.displayCrs(code);
  if (
    support !== 'native' &&
    !(support === 'experimental' && allowExperimental)
  ) {
    throw new MapError('DISPLAY_CRS_UNSUPPORTED', {
      code,
      support,
      allowExperimental
    });
  }
}

/** Instance-scoped and lazy: no production engines are imported or registered implicitly. */
export class EngineRegistry extends Registry<EngineLoader> {
  async create(id: string): Promise<IMapEngine> {
    const load = this.get(id);
    if (!load) throw new MapError('ENGINE_NOT_REGISTERED', { id });
    const { default: Engine } = await load();
    const engine = new Engine();
    if (engine.id !== id) {
      engine.destroy();
      throw new MapError('ENGINE_ID_MISMATCH', {
        expected: id,
        actual: engine.id
      });
    }
    return engine;
  }
}
