import { inflateSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import type { FileToStore, StorageProvider } from '@/providers/storage/storage.provider';

import { uploadSampleEvidence, uploadSampleImages } from './sample-images';
import { solidColorPng } from './solid-color-png';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function memoryStorage() {
  const files: FileToStore[] = [];
  const storage = {
    upload: (file: FileToStore) => {
      files.push(file);
      return Promise.resolve({ key: file.key, url: `http://storage.test/${file.key}` });
    },
  } as unknown as StorageProvider;
  return { storage, files };
}

describe('solidColorPng', () => {
  it('gera um PNG com a largura, a altura e a cor pedidas', () => {
    const png = solidColorPng({ width: 3, height: 2, rgb: [10, 20, 30] });

    expect([...png.subarray(0, 8)]).toEqual(PNG_SIGNATURE);
    expect(png.readUInt32BE(16)).toBe(3);
    expect(png.readUInt32BE(20)).toBe(2);
    const idatLength = png.readUInt32BE(33);
    const pixels = inflateSync(png.subarray(41, 41 + idatLength));
    expect([...pixels.subarray(0, 4)]).toEqual([0, 10, 20, 30]);
    expect(pixels.length).toBe(2 * (1 + 3 * 3));
  });
});

describe('uploadSampleImages', () => {
  it('envia o banner, o logo da categoria e o avatar e devolve as URLs de cada um', async () => {
    const { storage, files } = memoryStorage();

    const images = await uploadSampleImages(storage);

    expect(files.map(({ key }) => key)).toEqual([
      'banners/seed-home-banner.png',
      'catalog-requests/seed-category-logo.png',
      'avatars/seed-profile-avatar.png',
    ]);
    expect(files.every(({ contentType }) => contentType === 'image/png')).toBe(true);
    expect(images).toEqual({
      bannerImageUrl: 'http://storage.test/banners/seed-home-banner.png',
      categoryLogoUrl: 'http://storage.test/catalog-requests/seed-category-logo.png',
      avatarUrl: 'http://storage.test/avatars/seed-profile-avatar.png',
    });
  });
});

describe('uploadSampleEvidence', () => {
  it('grava o print da denúncia em report-evidences e devolve a chave, não a URL', async () => {
    const { storage, files } = memoryStorage();

    const key = await uploadSampleEvidence(storage);

    expect(key).toBe('report-evidences/seed-chat-print.png');
    expect(files.map((file) => file.contentType)).toEqual(['image/png']);
  });
});
