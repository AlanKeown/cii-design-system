import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

type TokenGroup = Record<string, string>;

const tokens: { base: TokenGroup; light: TokenGroup; dark: TokenGroup } =
  JSON.parse(
    await readFile(new URL('../tokens.json', import.meta.url), 'utf8')
  );
const themes = { light: tokens.light, dark: tokens.dark };

/** Pairs that must meet a minimum contrast in every theme. */
const requirements: readonly {
  foreground: string;
  background: string;
  minimum: number;
}[] = [
  // WCAG 1.4.11: default map features are meaningful graphics on the map surface.
  { foreground: 'map-feature', background: 'map-surface', minimum: 3 },
  { foreground: 'map-feature-invalid', background: 'map-surface', minimum: 3 },
  {
    foreground: 'map-feature-selected',
    background: 'map-surface',
    minimum: 3
  }
];

/**
 * Tokens that must never share a colour with the listed tokens in any theme.
 * Selection is also shown by a thicker outline and a point ring, so this checks
 * that colour adds a cue rather than requiring a contrast ratio between features.
 */
const distinct: readonly { token: string; from: string[] }[] = [
  {
    token: 'map-feature-selected',
    from: ['map-feature', 'focus-ring']
  }
];

/** Follow var(--cii-*) aliases within one theme, as the browser does for custom properties. */
function resolve(
  theme: TokenGroup,
  name: string,
  seen = new Set<string>()
): string {
  const value = theme[name] ?? tokens.base[name];
  if (value === undefined) throw new Error(`--cii-${name} is not defined.`);
  const alias = /^var\(--cii-([\w-]+)\)$/.exec(value.trim());
  if (!alias) return value.trim();
  if (seen.has(name)) throw new Error(`--cii-${name} is a circular alias.`);
  seen.add(name);
  return resolve(theme, alias[1], seen);
}

function luminance(hex: string): number {
  if (!/^#[0-9a-f]{6}$/i.test(hex))
    throw new Error(`${hex} is not a six-digit hex colour.`);
  const [r, g, b] = [1, 3, 5].map((start) => {
    const value = parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

test('map colour tokens are defined in both themes as canvas-readable hex colours', () => {
  const names = new Set(
    Object.values(themes).flatMap((theme) =>
      Object.keys(theme).filter((name) => name.startsWith('map-'))
    )
  );
  assert.ok(names.size > 0, 'Expected at least one map token.');
  for (const [themeName, theme] of Object.entries(themes))
    for (const name of names) {
      // Canvas renderers read computed custom properties: var() aliases are substituted,
      // but color-mix() and relative colours are returned unresolved.
      assert.ok(
        name in theme,
        `--cii-${name} is missing from the ${themeName} theme.`
      );
      assert.match(
        resolve(theme, name),
        /^#[0-9a-f]{6}$/i,
        `--cii-${name} must resolve to a six-digit hex colour in the ${themeName} theme.`
      );
    }
});

for (const { foreground, background, minimum } of requirements)
  test(`--cii-${foreground} meets ${minimum}:1 against --cii-${background} in both themes`, () => {
    for (const [themeName, theme] of Object.entries(themes)) {
      const ratio = contrast(
        resolve(theme, foreground),
        resolve(theme, background)
      );
      assert.ok(
        ratio >= minimum,
        `${themeName}: --cii-${foreground} on --cii-${background} is ${ratio.toFixed(2)}:1; at least ${minimum}:1 is required.`
      );
    }
  });

for (const { token, from } of distinct)
  test(`--cii-${token} differs from ${from.map((name) => `--cii-${name}`).join(' and ')} in both themes`, () => {
    for (const [themeName, theme] of Object.entries(themes)) {
      const colour = resolve(theme, token).toLowerCase();
      for (const other of from)
        assert.notEqual(
          colour,
          resolve(theme, other).toLowerCase(),
          `${themeName}: --cii-${token} and --cii-${other} are both ${colour}.`
        );
    }
  });
