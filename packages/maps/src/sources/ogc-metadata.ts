import { DOMParser } from '@xmldom/xmldom';
import type { Element as XmlElement } from '@xmldom/xmldom';
import { MapError } from '../errors.ts';

export type { XmlElement };
export const metadataInvalid = (reason: string): MapError =>
  new MapError('CRS_METADATA_INVALID', { reason });

export function children(node: XmlElement, name?: string): XmlElement[] {
  const result: XmlElement[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling)
    if (child.nodeType === 1 && (!name || child.localName === name))
      result.push(child as XmlElement);
  return result;
}
export function child(node: XmlElement, name: string): XmlElement {
  const matches = children(node, name);
  if (matches.length !== 1)
    throw metadataInvalid(`Expected one ${name} element.`);
  return matches[0];
}
export const text = (node: XmlElement): string =>
  node.textContent?.trim() ?? '';
export function value(node: XmlElement, name: string): string {
  const result = text(child(node, name));
  if (!result) throw metadataInvalid(`Missing ${name} value.`);
  return result;
}
export function href(node: XmlElement): string {
  return (
    node.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ||
    node.getAttribute('href') ||
    ''
  );
}

const relativeBase = 'https://cii.invalid';
/** HTTP(S) only; keep relative app URLs relative so SSR needs no browser globals. */
export function httpUrl(input: string, base?: string): string {
  if (!input || input !== input.trim() || /[\u0000-\u0020\u007f]/.test(input))
    throw metadataInvalid('Invalid service URL.');
  try {
    const url = new URL(
      input,
      base ? new URL(base, relativeBase) : relativeBase
    );
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw new Error('Unsupported URL');
    url.hash = '';
    if (!base && !input.startsWith('/') && !/^[a-z][\w+.-]*:/i.test(input))
      return input.split('#')[0];
    return url.origin === relativeBase
      ? `${url.pathname}${url.search}`
      : url.href;
  } catch {
    throw metadataInvalid(
      'Service endpoints must use HTTP(S) or relative URLs without embedded credentials.'
    );
  }
}
export function kvpUrl(
  input: string,
  parameters: Record<string, string | undefined>
): string {
  const url = new URL(httpUrl(input), relativeBase);
  const keys = new Set(Object.keys(parameters).map((key) => key.toUpperCase()));
  for (const key of [...url.searchParams.keys()])
    if (keys.has(key.toUpperCase())) url.searchParams.delete(key);
  for (const [key, val] of Object.entries(parameters))
    if (val !== undefined) url.searchParams.set(key, val);
  if (!input.startsWith('/') && !/^[a-z][\w+.-]*:/i.test(input))
    return `${input.split(/[?#]/)[0]}${url.search}`;
  return url.origin === relativeBase
    ? `${url.pathname}${url.search}`
    : url.href;
}
export function crsCode(input: string): string {
  if (
    /^(?:CRS:84|OGC:CRS84|urn:ogc:def:crs:OGC:(?:[^:]*):CRS84|https?:\/\/www\.opengis\.net\/def\/crs\/OGC\/[^/]+\/CRS84)$/i.test(
      input
    )
  )
    return 'OGC:CRS84';
  const epsg = input.match(
    /^(?:EPSG:|urn:ogc:def:crs:EPSG:[^:]*:|https?:\/\/www\.opengis\.net\/def\/crs\/EPSG\/[^/]+\/)(\d+)$/i
  );
  return epsg ? `EPSG:${epsg[1]}` : input;
}

/** Bounded, non-networking XML parser; DTD entity declarations are never accepted. */
export function parseCapabilities(xml: string): XmlElement {
  if (new TextEncoder().encode(xml).length > 2 * 1024 * 1024)
    throw new MapError('SOURCE_TOO_LARGE', { provider: 'ogc' });
  if (/<!ENTITY\b|<!DOCTYPE[^>]*\[/i.test(xml))
    throw metadataInvalid(
      'XML entity declarations and internal DTDs are unsupported.'
    );
  try {
    const document = new DOMParser({
      onError: () => {
        throw metadataInvalid('Malformed capabilities XML.');
      }
    }).parseFromString(xml, 'application/xml');
    const root = document.documentElement;
    if (!root) throw metadataInvalid('Empty capabilities document.');
    const stack: { node: XmlElement; depth: number }[] = [
      { node: root, depth: 0 }
    ];
    let count = 0;
    while (stack.length) {
      const item = stack.pop()!;
      if (++count > 30000 || item.depth > 128)
        throw metadataInvalid('Capabilities XML exceeds structural limits.');
      for (const node of children(item.node))
        stack.push({ node, depth: item.depth + 1 });
    }
    return root;
  } catch (error) {
    if (error instanceof MapError) throw error;
    throw metadataInvalid('Malformed capabilities XML.');
  }
}

export async function fetchCapabilities(
  url: string,
  fetcher: typeof fetch,
  signal?: AbortSignal
): Promise<{ root: XmlElement; url: string }> {
  signal?.throwIfAborted();
  let response: Response;
  try {
    response = await fetcher(url, {
      signal,
      headers: { Accept: 'application/xml, text/xml' }
    });
  } catch (error) {
    signal?.throwIfAborted();
    throw new MapError('SOURCE_LOAD_FAILED', { provider: 'ogc' });
  }
  if (!response.ok || !response.body)
    throw new MapError('SOURCE_LOAD_FAILED', {
      provider: 'ogc',
      status: response.status
    });
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0,
    xml = '';
  try {
    for (;;) {
      signal?.throwIfAborted();
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > 2 * 1024 * 1024)
        throw new MapError('SOURCE_TOO_LARGE', { provider: 'ogc' });
      xml += decoder.decode(next.value, { stream: true });
    }
    xml += decoder.decode();
    signal?.throwIfAborted();
    return { root: parseCapabilities(xml), url: httpUrl(response.url || url) };
  } catch (error) {
    await reader.cancel().catch(() => {});
    signal?.throwIfAborted();
    if (error instanceof MapError) throw error;
    throw metadataInvalid('Capabilities response is unreadable XML.');
  } finally {
    reader.releaseLock();
  }
}
