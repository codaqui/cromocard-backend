import type { StorageProvider, StoredFile, UploadFile } from '@/providers/storage/storage.provider';
import { NotImplementedError } from '@/shared/errors/http-errors';

import type { UploadFolder } from './uploads.validator';

export class UploadsService {
  constructor(private readonly storage: StorageProvider) {}

  uploadImage(_file: UploadFile | undefined, _folder: UploadFolder): Promise<StoredFile> {
    throw new NotImplementedError();
  }
}
