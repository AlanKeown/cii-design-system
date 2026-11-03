/** Return paths are always relative to this origin, including after decoding. */
export function safeNext(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length > 2048 ||
    value.startsWith(' ') ||
    value.endsWith(' ')
  )
    return '/';
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return '/';
  }
  for (const candidate of [value, decoded]) {
    if (
      !candidate.startsWith('/') ||
      candidate.startsWith('//') ||
      /[\\\u0000-\u001f\u007f#]/.test(candidate)
    )
      return '/';
  }
  // Reject nested escapes that a proxy or subsequent consumer could decode differently.
  if (/%[0-9a-f]{2}/i.test(decoded)) return '/';
  return value;
}
