import type { ArgumentMetadata, PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { ValidationError } from './errors';

/**
 * Validates and *replaces* the incoming value with the schema output.
 *
 * The same Zod schema is used by the website forms, so validation rules exist
 * exactly once. Unknown keys are stripped and every value is coerced to its
 * declared type before it reaches a service.
 *
 * Note: schemas come from `@taskeno/contracts`, which bundles its own copy of
 * Zod, so we deliberately avoid `instanceof ZodError` and rely on `safeParse`.
 */
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}

  transform(value: unknown, _metadata: ArgumentMetadata): unknown {
    const result = this.schema.safeParse(value ?? {});
    if (!result.success) {
      throw new ValidationError(
        result.error.issues.map((issue) => ({
          path: issue.path as (string | number)[],
          message: issue.message,
        })),
      );
    }
    return result.data;
  }
}
