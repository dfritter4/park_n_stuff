import type { NextFunction, Request, Response } from 'express';
import { z, type ZodType } from 'zod';

/** Parses `req.body` against `schema`, replacing it with the parsed value on success. */
export function validateBody<T>(schema: ZodType<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(result.error);
      return;
    }
    req.body = result.data;
    next();
  };
}

const UuidParamSchema = z.string().uuid();

/**
 * Validates that `req.params[paramName]` is a well-formed UUID before the route
 * handler runs, so malformed ids surface as a 400 VALIDATION_ERROR instead of a
 * raw Postgres "invalid input syntax for type uuid" 500.
 */
export function validateUuidParam(paramName: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = UuidParamSchema.safeParse(req.params[paramName]);
    if (!result.success) {
      next(result.error);
      return;
    }
    next();
  };
}
