import { randomUUID } from 'node:crypto';

import type { StorageProvider, StoredFile } from '@/providers/storage/storage.provider';
import type { UserRole } from '@/shared/types/authenticated-user';

import { detectImageType } from './image-type';
import { InvalidImageTypeError, UploadFolderForbiddenError } from './uploads.errors';
import { SELLER_UPLOAD_FOLDERS, type UploadFolder } from './uploads.validator';

export interface ImageUpload {
  folder: UploadFolder;
  content: Buffer;
  uploaderRole: UserRole;
}

const canUploadTo = (role: UserRole, folder: UploadFolder) =>
  role === 'ADMIN' || SELLER_UPLOAD_FOLDERS.includes(folder);

export class UploadsService {
  constructor(private readonly storageProvider: StorageProvider) {}

  async uploadImage({ folder, content, uploaderRole }: ImageUpload): Promise<StoredFile> {
    if (!canUploadTo(uploaderRole, folder)) {
      throw new UploadFolderForbiddenError();
    }

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
