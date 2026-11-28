import { randomUUID } from 'node:crypto';

import { detectImageType } from '@/domains/uploads/uploads.module';
import type { StorageProvider } from '@/providers/storage/storage.provider';

import type { EvidenceStorage } from './contact-moderation.service';

export const EVIDENCES_FOLDER = 'report-evidences';

export const createPrivateEvidenceStorage = (privateStorage: StorageProvider): EvidenceStorage => ({
  identify: (content) => {
    const imageType = detectImageType(content);
    return imageType && { content, imageType };
  },
  upload: async ({ content, imageType }) => {
    const key = `${EVIDENCES_FOLDER}/${randomUUID()}.${imageType.extension}`;
    const stored = await privateStorage.upload({ key, content, contentType: imageType.mimeType });
    return stored.key;
  },
  remove: (key) => privateStorage.delete(key),
});
