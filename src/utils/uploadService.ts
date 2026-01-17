import { apiClient, logger } from '@/shared';
import type { IFileUploadResponse } from '@tainiex/shared-atlas';
import { compressImage } from './imageCompression';

export const UploadService = {
    /**
     * Upload an image for a specific note.
     * Validates size (<10MB) and type.
     * Returns the full response including GCS path and expiration timestamp.
     */
    uploadNoteImage: async (noteId: string, file: File): Promise<IFileUploadResponse> => {
        // 1. Client-side Validation
        const MAX_SIZE = 10 * 1024 * 1024; // 10MB
        if (file.size > MAX_SIZE) {
            throw new Error('Image too large. Maximum size is 10MB.');
        }

        const ALLOWED_TYPES = [
            'image/jpeg',
            'image/png',
            'image/gif',
            'image/webp',
            'image/svg+xml',
        ];
        if (!ALLOWED_TYPES.includes(file.type)) {
            throw new Error(`Invalid image type. Allowed: ${ALLOWED_TYPES.join(', ')}`);
        }

        // 2. Compress image before upload
        const compressedFile = await compressImage(file);

        // 3. Prepare FormData
        const formData = new FormData();
        formData.append('file', compressedFile);

        try {
            // 3. Upload via apiClient
            const response = await apiClient.upload<IFileUploadResponse>(
                `/api/upload/image/${noteId}`,
                formData
            );

            if (!response.success || !response.url) {
                throw new Error('Upload successful but no URL returned');
            }

            return response;
        } catch (error) {
            logger.error('[UploadService] Note image upload failed', error);
            throw error;
        }
    },

    /**
     * Upload a file (generic)
     */
    uploadFile: async (
        file: File,
        module: 'notes' | 'chats' = 'notes'
    ): Promise<IFileUploadResponse> => {
        const formData = new FormData();
        formData.append('file', file);

        return await apiClient.upload<IFileUploadResponse>(
            `/api/storage/upload?module=${module}`,
            formData
        );
    },
};
