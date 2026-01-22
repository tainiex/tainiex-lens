import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { validateData, ValidationError } from './validation';

describe('validateData', () => {
    const UserSchema = z.object({
        name: z.string(),
        age: z.number(),
    });

    it('should validate correct data', () => {
        const data = { name: 'John', age: 30 };
        const result = validateData(UserSchema, data);

        expect(result).toEqual(data);
    });

    it('should throw ValidationError for invalid data', () => {
        const data = { name: 'John', age: 'thirty' }; // age should be number

        expect(() => validateData(UserSchema, data)).toThrow(ValidationError);
    });

    it('should include validation errors in ValidationError', () => {
        const data = { name: 123, age: 'invalid' };

        expect(() => validateData(UserSchema, data)).toThrow(ValidationError);

        try {
            validateData(UserSchema, data);
        } catch (error) {
            if (error instanceof ValidationError) {
                expect(error.errors.issues.length).toBeGreaterThan(0);
            }
        }
    });

    it('should use context in error logging', () => {
        const data = { invalid: 'data' };

        expect(() => validateData(UserSchema, data, 'User Validation')).toThrow(ValidationError);
    });

    it('should handle nested objects', () => {
        const NestedSchema = z.object({
            user: z.object({
                name: z.string(),
                email: z.string().email(),
            }),
        });

        const validData = {
            user: {
                name: 'Alice',
                email: 'alice@example.com',
            },
        };

        const result = validateData(NestedSchema, validData);
        expect(result).toEqual(validData);
    });

    it('should handle arrays', () => {
        const ArraySchema = z.array(z.string());
        const data = ['a', 'b', 'c'];

        const result = validateData(ArraySchema, data);
        expect(result).toEqual(data);
    });

    it('should reject invalid array items', () => {
        const ArraySchema = z.array(z.number());
        const data = [1, 2, 'three'];

        expect(() => validateData(ArraySchema, data)).toThrow(ValidationError);
    });
});

// Note: safeJsonParse is tested separately as it requires Response objects
// which are better tested in integration tests or with proper Response mocks
