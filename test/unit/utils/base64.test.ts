import { describe, it, expect } from 'vitest';
import { base64Utils } from './base64';

describe('base64Utils', () => {
    describe('encode', () => {
        it('should encode Uint8Array to base64 string', () => {
            const input = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
            const result = base64Utils.encode(input);
            expect(typeof result).toBe('string');
            expect(result.length).toBeGreaterThan(0);
        });

        it('should handle empty array', () => {
            const input = new Uint8Array([]);
            const result = base64Utils.encode(input);
            expect(result).toBe('');
        });

        it('should produce different outputs for different inputs', () => {
            const input1 = new Uint8Array([1, 2, 3]);
            const input2 = new Uint8Array([4, 5, 6]);
            const result1 = base64Utils.encode(input1);
            const result2 = base64Utils.encode(input2);
            expect(result1).not.toBe(result2);
        });
    });

    describe('decode', () => {
        it('should decode base64 string to Uint8Array', () => {
            const input = 'SGVsbG8='; // "Hello" in base64
            const result = base64Utils.decode(input);
            expect(result).toBeInstanceOf(Uint8Array);
            expect(result.length).toBeGreaterThan(0);
        });

        it('should handle empty string', () => {
            const result = base64Utils.decode('');
            expect(result).toBeInstanceOf(Uint8Array);
            expect(result.length).toBe(0);
        });

        it('should correctly round-trip encode/decode', () => {
            const original = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
            const encoded = base64Utils.encode(original);
            const decoded = base64Utils.decode(encoded);

            expect(decoded.length).toBe(original.length);
            expect(Array.from(decoded)).toEqual(Array.from(original));
        });

        it('should handle large data', () => {
            const largeData = new Uint8Array(10000);
            for (let i = 0; i < largeData.length; i++) {
                largeData[i] = i % 256;
            }

            const encoded = base64Utils.encode(largeData);
            const decoded = base64Utils.decode(encoded);

            expect(decoded.length).toBe(largeData.length);
            expect(Array.from(decoded)).toEqual(Array.from(largeData));
        });
    });
});
