import { describe, expect, it } from 'vitest';

import type { FileToStore, StorageProvider } from '@/providers/storage/storage.provider';

import { createPrivateEvidenceStorage } from './contact-moderation.evidences';

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

describe('createPrivateEvidenceStorage', () => {
  it('R16: identifica PNG, JPG ou WEBP pela assinatura do arquivo e recusa o resto', () => {
    const evidences = createPrivateEvidenceStorage(privateStorage().storage);

    expect(evidences.identify(PNG)?.imageType.extension).toBe('png');
    expect(evidences.identify(JPG)).toEqual({
      content: JPG,
      imageType: { mimeType: 'image/jpeg', extension: 'jpg' },
    });
    expect(evidences.identify(Buffer.from('GIF89a'))).toBeUndefined();
  });

  it('L13: grava o print no storage privado e devolve a chave, nunca a URL', async () => {
    const { storage, files } = privateStorage();
    const evidences = createPrivateEvidenceStorage(storage);

    const key = await evidences.upload(evidences.identify(JPG)!);

    expect(key).toMatch(/^report-evidences\/[0-9a-f-]{36}\.jpg$/);
    expect(key).not.toContain('http');
    expect(files.get(key)).toMatchObject({ contentType: 'image/jpeg', content: JPG });
  });

  it('apaga o print pela chave', async () => {
    const { storage, files } = privateStorage();
    const evidences = createPrivateEvidenceStorage(storage);
    const key = await evidences.upload(evidences.identify(PNG)!);

    await evidences.remove(key);

    expect(files.size).toBe(0);
  });
});
