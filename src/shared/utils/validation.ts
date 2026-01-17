import { z, ZodError } from 'zod';
import { logger } from './logger';

export class ValidationError extends Error {
    public errors: ZodError;

    constructor(errors: ZodError) {
        super('Validation failed');
        this.name = 'ValidationError';
        this.errors = errors;
    }
}

export function validateData<T>(schema: z.ZodSchema<T>, data: unknown, context?: string): T {
    try {
        return schema.parse(data);
    } catch (error) {
        if (error instanceof ZodError) {
            logger.error(`[${context || 'Validation'}]`, error.issues);
            throw new ValidationError(error);
        }
        throw error;
    }
}

export async function safeJsonParse<T>(
    response: Response,
    schema: z.ZodSchema<T>,
    context?: string
): Promise<T> {
    let data: unknown;
    try {
        data = await response.json();
    } catch (error) {
        throw new Error(
            `Invalid JSON response: ${error instanceof Error ? error.message : String(error)}`
        );
    }

    return validateData(schema, data, context);
}
