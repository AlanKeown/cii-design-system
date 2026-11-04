import { MapError } from './errors.ts';

/** Ordered, instance-scoped extension registry; duplicate IDs never silently replace code. */
export class Registry<T> {
  #entries = new Map<string, { value: T }>();

  register(id: string, value: T): () => void {
    if (!id.trim() || this.#entries.has(id)) {
      throw new MapError('REGISTRY_DUPLICATE', { id });
    }
    const entry = { value };
    this.#entries.set(id, entry);
    return () => {
      // A stale disposer must not remove a later registration of the same ID.
      if (this.#entries.get(id) === entry) this.#entries.delete(id);
    };
  }

  get(id: string): T | undefined {
    return this.#entries.get(id)?.value;
  }

  require(id: string): T {
    const value = this.get(id);
    if (value === undefined) throw new MapError('REGISTRY_NOT_FOUND', { id });
    return value;
  }

  *values(): IterableIterator<T> {
    for (const entry of this.#entries.values()) yield entry.value;
  }
}
