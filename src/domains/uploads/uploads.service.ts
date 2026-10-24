import { randomUUID } from 'node:crypto';

import type { StorageProvider, StoredFile } from '@/providers/storage/storage.provider';

import { detectImageType } from './image-type';
import { InvalidImageTypeError } from './uploads.errors';
import type { UploadFolder } from './uploads.validator';

export interface ImageUpload {
  folder: UploadFolder;
  content: Buffer;
}

export class UploadsService {
  constructor(private readonly storageProvider: StorageProvider) {}

  uploadImage({ folder, content }: ImageUpload): Promise<StoredFile> {
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
}
