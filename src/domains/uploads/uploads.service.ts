import { randomUUID } from 'node:crypto';

import type { StorageProvider, StoredFile } from '@/providers/storage/storage.provider';
import type { UserRole } from '@/shared/types/authenticated-user';

import { detectImageType } from './image-type';
import { InvalidImageTypeError, UploadFolderForbiddenError } from './uploads.errors';
import {
  OWNER_SCOPED_FOLDERS,
  SELLER_UPLOAD_FOLDERS,
  type UploadFolder,
} from './uploads.validator';

export interface ImageUpload {
  folder: UploadFolder;
  content: Buffer;
  uploaderId: string;
  uploaderRole: UserRole;
}

const folderKeyOf = (folder: UploadFolder, uploaderId: string) =>
  OWNER_SCOPED_FOLDERS.includes(folder) ? `${folder}/${uploaderId}` : folder;

const canUploadTo = (role: UserRole, folder: UploadFolder) =>
  role === 'ADMIN' || SELLER_UPLOAD_FOLDERS.includes(folder);

export class UploadsService {
  constructor(private readonly storageProvider: StorageProvider) {}

  async uploadImage({
    folder,
    content,
    uploaderId,
    uploaderRole,
  }: ImageUpload): Promise<StoredFile> {
    if (!canUploadTo(uploaderRole, folder)) {
      throw new UploadFolderForbiddenError();
    }

    const imageType = detectImageType(content);

    if (!imageType) {
      throw new InvalidImageTypeError();
    }

    return this.storageProvider.upload({
      key: `${folderKeyOf(folder, uploaderId)}/${randomUUID()}.${imageType.extension}`,
      content,
      contentType: imageType.mimeType,
    });
  }
}
