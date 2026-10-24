export interface FileToStore {
  key: string;
  content: Buffer;
  contentType: string;
}

export interface StoredFile {
  key: string;
  url: string;
}

export interface StorageProvider {
  upload(file: FileToStore): Promise<StoredFile>;
  delete(key: string): Promise<void>;
  getUrl(key: string): string;
}
