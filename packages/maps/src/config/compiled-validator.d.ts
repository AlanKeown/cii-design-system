import type { ResolvedMapConfig } from './index.ts';

/** Type boundary for the ignored JavaScript emitted by Ajv during generation/build. */
export interface ConfigValidationError {
  instancePath: string;
  keyword: string;
  params: Record<string, unknown>;
  message?: string;
}

declare const validate: {
  (input: unknown): input is ResolvedMapConfig;
  errors?: readonly ConfigValidationError[] | null;
};

export default validate;
