import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { Ajv } from 'ajv';
import standalone from 'ajv/dist/standalone/index.js';
import { compileFromFile } from 'json-schema-to-typescript';
import { format } from 'prettier';
import { fileURLToPath } from 'node:url';

const schema = fileURLToPath(
  new URL('../src/config/map.schema.json', import.meta.url)
);
const output = new URL('../src/config/types.ts', import.meta.url);
const generated = await format(
  await compileFromFile(schema, {
    bannerComment:
      '// Generated from map.schema.json. Run npm run generate:config -w @cii/maps.',
    additionalProperties: false,
    style: { singleQuote: true, trailingComma: 'none' }
  }),
  { parser: 'typescript', singleQuote: true, trailingComma: 'none' }
);

if (process.argv.includes('--check')) {
  if ((await readFile(output, 'utf8')) !== generated) {
    throw new Error(
      'MapConfig types are stale. Run npm run generate:config -w @cii/maps.'
    );
  }
} else {
  await writeFile(output, generated);
}

// Compile at build time: browser validation does not need Ajv or unsafe-eval.
const ajv = new Ajv({
  allErrors: true,
  strict: true,
  strictRequired: false,
  useDefaults: true,
  ownProperties: true,
  code: { source: true, esm: true }
});
const validate = ajv.compile(JSON.parse(await readFile(schema, 'utf8')));
const validatorSource = standalone.default(ajv, validate);
await writeFile(
  new URL('../src/config/compiled-validator.js', import.meta.url),
  validatorSource
);
if (process.argv.includes('--build')) {
  const destination = new URL('../dist/config/', import.meta.url);
  await mkdir(destination, { recursive: true });
  await writeFile(
    new URL('compiled-validator.js', destination),
    validatorSource
  );
}
