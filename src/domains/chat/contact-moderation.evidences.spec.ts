import { describe, expect, it } from 'vitest';

import type { FileToStore, StorageProvider } from '@/providers/storage/storage.provider';

import { InvalidEvidenceTypeError } from './contact-moderation.errors';
import { createEvidenceStorage } from './contact-moderation.evidences';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0x00]);

function privateStorage() {
  const files = new Map<string, FileToStore>();
  const storage: StorageProvider = {
    upload: (file) => {
      files.set(file.key, file);
      return Promise.resolve({ key: file.key, url: `http://private.test/${file.key}` });
    },
    read: (key) => Promise.resolve(files.get(key)?.content ?? null),
    delete: (key) => {
      files.delete(key);
      return Promise.resolve();
    },
    getUrl: (key) => `http://private.test/${key}`,
  };
  return { storage, files };
}

describe('createEvidenceStorage', () => {
  it('R16: aceita só PNG, JPG ou WEBP pela assinatura do arquivo', () => {
    const evidences = createEvidenceStorage(privateStorage().storage);

    expect(evidences.isImage(PNG)).toBe(true);
    expect(evidences.isImage(JPG)).toBe(true);
    expect(evidences.isImage(Buffer.from('GIF89a'))).toBe(false);
  });

  it('L13: grava o print no storage privado e devolve a chave, nunca a URL', async () => {
    const { storage, files } = privateStorage();
    const evidences = createEvidenceStorage(storage);

    const key = await evidences.upload(JPG);

    expect(key).toMatch(/^report-evidences\/[0-9a-f-]{36}\.jpg$/);
    expect(key).not.toContain('http');
    expect(files.get(key)).toMatchObject({ contentType: 'image/jpeg', content: JPG });
  });

  it('recusa gravar o que não é imagem', async () => {
    const { storage, files } = privateStorage();

    await expect(createEvidenceStorage(storage).upload(Buffer.from('%PDF'))).rejects.toBeInstanceOf(
      InvalidEvidenceTypeError,
    );
    expect(files.size).toBe(0);
  });

  it('apaga o print pela chave', async () => {
    const { storage, files } = privateStorage();
    const evidences = createEvidenceStorage(storage);
    const key = await evidences.upload(PNG);

    await evidences.remove(key);

    expect(files.size).toBe(0);
  });
});
