import { describe, it, expect } from 'vitest';
import { groupItemsByDate } from './dateGrouping';

describe('groupItemsByDate', () => {
    it('should group items from last 7 days as "Recent 7 Days"', () => {
        const items = [
            { id: '1', createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000) }, // 1 day ago
            { id: '2', createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) }, // 5 days ago
        ];

        const grouped = groupItemsByDate(items);

        expect(grouped['Recent 7 Days']).toHaveLength(2);
        expect(grouped['Recent 7 Days']).toEqual(items);
    });

    it('should group older items as "Earlier"', () => {
        const items = [
            { id: '1', createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) }, // 14 days ago
            { id: '2', createdAt: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000) }, // 21 days ago
        ];

        const grouped = groupItemsByDate(items);

        expect(grouped['Earlier']).toHaveLength(2);
        expect(grouped['Earlier']).toEqual(items);
    });

    it('should correctly split items between groups', () => {
        const items = [
            { id: '1', createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000) }, // Recent
            { id: '2', createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) }, // Recent
            { id: '3', createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) }, // Earlier
            { id: '4', createdAt: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000) }, // Earlier
        ];

        const grouped = groupItemsByDate(items);

        expect(grouped['Recent 7 Days']).toHaveLength(2);
        expect(grouped['Earlier']).toHaveLength(2);
        expect(grouped['Recent 7 Days'].map((i) => i.id)).toEqual(['1', '2']);
        expect(grouped['Earlier'].map((i) => i.id)).toEqual(['3', '4']);
    });

    it('should handle empty array', () => {
        const grouped = groupItemsByDate([]);
        expect(grouped['Recent 7 Days']).toEqual([]);
        expect(grouped['Earlier']).toEqual([]);
    });

    it('should handle items exactly at 7-day boundary', () => {
        const exactlySevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const items = [{ id: '1', createdAt: exactlySevenDaysAgo }];

        const grouped = groupItemsByDate(items);

        // Should be in "Earlier" since it's exactly 7 days (not within 7 days)
        expect(grouped['Earlier']).toHaveLength(1);
    });
});

