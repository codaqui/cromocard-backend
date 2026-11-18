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
  read(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
  getUrl(key: string): string;
}
