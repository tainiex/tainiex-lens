import type { INote } from '../types/collaboration';

let cachedNotes: INote[] | null = null;

export const getCachedNotes = (): INote[] | null => cachedNotes;

export const setCachedNotes = (notes: INote[]) => {
    cachedNotes = notes;
};

export const clearNotesCache = () => {
    cachedNotes = null;
};
