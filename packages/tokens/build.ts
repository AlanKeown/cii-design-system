import { readFile, writeFile } from 'node:fs/promises';
type TokenGroup = Record<string, string>;

const tokens: { base: TokenGroup; light: TokenGroup; dark: TokenGroup } =
  JSON.parse(await readFile(new URL('./tokens.json', import.meta.url), 'utf8'));
const declarations = (values: TokenGroup) =>
  Object.entries(values)
    .map(([name, value]) => `  --cii-${name}: ${value};`)
    .join('\n');
const css = `/* Generated from tokens.json. Run npm run build -w @cii/tokens. */
:root, [data-cii-theme] {
${declarations(tokens.base)}
}
:root, [data-cii-theme="light"] {
  color-scheme: light;
${declarations(tokens.light)}
}
[data-cii-theme="dark"] {
  color-scheme: dark;
${declarations(tokens.dark)}
}
`;
await writeFile(new URL('./tokens.css', import.meta.url), css);
