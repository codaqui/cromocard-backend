import { randomUUID } from 'node:crypto';

import type { StorageProvider, StoredFile } from '@/providers/storage/storage.provider';

import { detectImageType } from './image-type';
import { InvalidImageTypeError } from './uploads.errors';
import type { UploadFolder } from './uploads.validator';

export type ImageFolder = UploadFolder | 'report-evidences';

export interface ImageUpload {
  folder: ImageFolder;
  content: Buffer;
}

export class UploadsService {
  constructor(private readonly storageProvider: StorageProvider) {}

  async uploadImage({ folder, content }: ImageUpload): Promise<StoredFile> {
    const imageType = detectImageType(content);

    if (!imageType) {
      throw new InvalidImageTypeError();
    }

    return this.storageProvider.upload({
      key: `${folder}/${randomUUID()}.${imageType.extension}`,
      content,
      contentType: imageType.mimeType,
    });
  }

  deleteImage(key: string): Promise<void> {
    return this.storageProvider.delete(key);
  }
}
