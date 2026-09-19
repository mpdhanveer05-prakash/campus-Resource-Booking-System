import { AppError } from './errorHandler.js';

/**
 * Builds middleware that validates part of a request against a Zod schema and
 * replaces it with the parsed value.
 *
 * @param {'body'|'query'|'params'} source
 * @param {import('zod').ZodType} schema
 */
export function validate(source, schema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));

      const error = new AppError(400, 'VALIDATION_ERROR', 'The submitted values are not valid.');
      error.details = details;
      return next(error);
    }

    // Express 5 exposes req.query as a getter, so assign to a parallel property.
    if (source === 'query') {
      req.validatedQuery = result.data;
    } else {
      req[source] = result.data;
    }

    return next();
  };
}
