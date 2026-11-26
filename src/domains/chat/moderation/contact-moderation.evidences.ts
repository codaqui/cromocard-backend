import { detectImageType } from '@/domains/uploads/uploads.module';
import type { StoredFile } from '@/providers/storage/storage.provider';

import type { EvidenceStorage } from './contact-moderation.service';

export interface ImageUploader {
  uploadImage(upload: { folder: 'report-evidences'; content: Buffer }): Promise<StoredFile>;
  deleteImage(key: string): Promise<void>;
}

export const createEvidenceStorage = (uploads: ImageUploader): EvidenceStorage => ({
  isImage: (content) => detectImageType(content) !== undefined,
  upload: (content) => uploads.uploadImage({ folder: 'report-evidences', content }),
  remove: (key) => uploads.deleteImage(key),
});
