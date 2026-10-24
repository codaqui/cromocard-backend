import { beforeEach, describe, expect, it } from 'vitest';

import type {
  FileToStore,
  StorageProvider,
  StoredFile,
} from '@/providers/storage/storage.provider';

import { InvalidImageTypeError } from './uploads.errors';
import { UploadsService } from './uploads.service';

const pngImage = () => Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const jpegImage = () => Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
const webpImage = () =>
  Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')]);
const textFile = () => Buffer.from('isto não é uma imagem');

class FakeStorageProvider implements StorageProvider {
  files: FileToStore[] = [];

  upload(file: FileToStore): Promise<StoredFile> {
    this.files.push(file);
    return Promise.resolve({ key: file.key, url: this.getUrl(file.key) });
  }

  delete(key: string): Promise<void> {
    this.files = this.files.filter((file) => file.key !== key);
    return Promise.resolve();
  }

  getUrl(key: string): string {
    return `http://storage.test/${key}`;
  }
}

describe('UploadsService', () => {
  let storage: FakeStorageProvider;
  let service: UploadsService;

  beforeEach(() => {
    storage = new FakeStorageProvider();
    service = new UploadsService(storage);
  });

  it('guarda um PNG na pasta pedida e devolve a URL e a chave', async () => {
    const result = await service.uploadImage({ folder: 'cards', content: pngImage() });

    expect(result.key).toMatch(/^cards\/[0-9a-f-]{36}\.png$/);
    expect(result.url).toBe(`http://storage.test/${result.key}`);
    expect(storage.files[0]?.contentType).toBe('image/png');
  });

  it('usa a extensão do conteúdo do arquivo para JPG e WEBP', async () => {
    const jpg = await service.uploadImage({ folder: 'albums', content: jpegImage() });
    const webp = await service.uploadImage({ folder: 'banners', content: webpImage() });

    expect(jpg.key).toMatch(/^albums\/.+\.jpg$/);
    expect(webp.key).toMatch(/^banners\/.+\.webp$/);
  });

  it('recusa um arquivo que não é PNG, JPG nem WEBP', async () => {
    await expect(service.uploadImage({ folder: 'cards', content: textFile() })).rejects.toThrow(
      InvalidImageTypeError,
    );
    expect(storage.files).toHaveLength(0);
  });
});
