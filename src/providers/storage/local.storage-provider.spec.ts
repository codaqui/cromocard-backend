import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LocalStorageProvider } from './local.storage-provider';
import { InvalidStorageKeyError } from './storage.errors';

describe('LocalStorageProvider', () => {
  let rootDir: string;
  let provider: LocalStorageProvider;

  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(os.tmpdir(), 'cromocard-storage-'));
    provider = new LocalStorageProvider(rootDir, 'http://localhost:3000');
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  it('grava o arquivo na pasta da chave e devolve a URL pública', async () => {
    const content = Buffer.from('imagem');

    const stored = await provider.upload({ key: 'cards/a.png', content, contentType: 'image/png' });

    expect(stored).toEqual({
      key: 'cards/a.png',
      url: 'http://localhost:3000/uploads/cards/a.png',
    });
    await expect(readFile(path.join(rootDir, 'cards/a.png'))).resolves.toEqual(content);
  });

  it('apaga o arquivo da chave', async () => {
    await provider.upload({
      key: 'cards/b.png',
      content: Buffer.from('x'),
      contentType: 'image/png',
    });

    await provider.delete('cards/b.png');

    await expect(readFile(path.join(rootDir, 'cards/b.png'))).rejects.toThrow();
  });

  it('recusa chave que sai da pasta do storage', async () => {
    await expect(provider.delete('../fora.png')).rejects.toThrow(InvalidStorageKeyError);
    await expect(
      provider.upload({
        key: 'cards/../../fora.png',
        content: Buffer.from('x'),
        contentType: 'image/png',
      }),
    ).rejects.toThrow(InvalidStorageKeyError);
  });
});
