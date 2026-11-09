// Configs cross a JSON boundary; reject cycles, functions, Dates and non-finite numbers
// rather than silently losing/coercing values with a JSON stringify/parse round trip.
export function isJson(
  value: unknown,
  ancestors = new Set<object>(),
  depth = 0
): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || depth > 128 || ancestors.has(value))
    return false;
  if (
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  )
    return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(value).some(
      (key) =>
        typeof key !== 'string' ||
        (!(Array.isArray(value) && key === 'length') &&
          (!descriptors[key].enumerable || !('value' in descriptors[key])))
    )
  )
    return false;
  if (Array.isArray(value) && Object.keys(value).length !== value.length)
    return false;
  ancestors.add(value);
  const children = Array.isArray(value) ? value : Object.values(value);
  const valid = Array.from(children).every((child) =>
    isJson(child, ancestors, depth + 1)
  );
  ancestors.delete(value);
  return valid;
}
