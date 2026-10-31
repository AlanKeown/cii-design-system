import { execFileSync } from 'node:child_process';
import { readFile, lstat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preprocess } from 'svelte/compiler';
import ts from 'typescript';

const excludedDirectories = new Set([
  'node_modules',
  '.git',
  '.svelte-kit',
  'build',
  'dist',
  '_site',
  'coverage',
  'test-results',
  'playwright-report',
  'vendor',
  'vendored',
  'third_party'
]);
const requiredConfigs = new Set([
  'tsconfig.json',
  'apps/docs/tsconfig.json',
  'apps/community-portal/tsconfig.json',
  'packages/svelte/tsconfig.json'
]);

export function isAuthoredFile(filename: string): boolean {
  return !filename.split('/').some((part) => excludedDirectories.has(part));
}

/** Inspect real files and documentation scripts without treating HTML comments as code. */
export async function checkFile(
  filename: string,
  source: string
): Promise<string[]> {
  if (!isAuthoredFile(filename)) return [];
  if (/\.(?:js|jsx|mjs|cjs)$/i.test(filename))
    return ['Use TypeScript instead of a JavaScript source file.'];
  const errors: string[] = [];
  if (/\.(?:svelte|md|svx)$/i.test(filename)) {
    await preprocess(
      source,
      {
        name: 'require-typescript',
        script({ attributes }) {
          if (attributes.lang !== 'ts') {
            errors.push(
              `${attributes.module || attributes.context === 'module' ? 'Module' : 'Instance'} script must declare lang="ts".`
            );
          }
        }
      },
      { filename }
    );
    if (
      /\.(?:md|svx)$/i.test(filename) &&
      /^\s*(?:`{3,}|~{3,})(?:js|javascript|jsx|mjs|cjs)\b/im.test(source)
    ) {
      errors.push(
        'Use TypeScript rather than JavaScript for documentation code fences.'
      );
    }
  }
  if (requiredConfigs.has(filename)) {
    const parsed = ts.parseConfigFileTextToJson(filename, source);
    const config = parsed.config as
      { compilerOptions?: { strict?: unknown; allowJs?: unknown } } | undefined;
    if (parsed.error)
      errors.push('TypeScript configuration must be valid JSON or JSONC.');
    if (config?.compilerOptions?.strict !== true)
      errors.push('Preserve compilerOptions.strict: true.');
    if (config?.compilerOptions?.allowJs !== false)
      errors.push('Preserve compilerOptions.allowJs: false.');
  }
  return errors;
}

async function main(): Promise<void> {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const files = [
    ...new Set(
      execFileSync(
        'git',
        ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
        {
          cwd: root,
          encoding: 'utf8'
        }
      )
        .split('\0')
        .filter(Boolean)
    )
  ];
  let violations = 0;
  for (const filename of files.filter(isAuthoredFile)) {
    const path = resolve(root, filename);
    const stat = await lstat(path).catch(() => null);
    if (!stat?.isFile()) continue;
    if (
      !/\.(?:js|jsx|mjs|cjs|svelte|md|svx)$/i.test(filename) &&
      !requiredConfigs.has(filename)
    )
      continue;
    for (const error of await checkFile(
      filename,
      await readFile(path, 'utf8')
    )) {
      console.error(`${filename}: ${error}`);
      violations++;
    }
  }
  if (violations) process.exitCode = 1;
  else console.log('TypeScript source rules passed.');
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
