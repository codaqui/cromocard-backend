import type { StorageProvider } from '@/providers/storage/storage.provider';

import { solidColorPng } from './solid-color-png';

const sampleBanner = {
  key: 'banners/seed-home-banner.png',
  content: solidColorPng({ width: 1200, height: 400, rgb: [50, 145, 255] }),
  contentType: 'image/png',
};

const sampleCategoryLogo = {
  key: 'catalog-requests/seed-category-logo.png',
  content: solidColorPng({ width: 400, height: 240, rgb: [72, 52, 160] }),
  contentType: 'image/png',
};

const sampleAvatar = {
  key: 'avatars/seed-profile-avatar.png',
  content: solidColorPng({ width: 500, height: 500, rgb: [255, 170, 60] }),
  contentType: 'image/png',
};

const sampleChatPrint = {
  key: 'report-evidences/seed-chat-print.png',
  content: solidColorPng({ width: 360, height: 640, rgb: [230, 230, 236] }),
  contentType: 'image/png',
};

export interface SampleImages {
  bannerImageUrl?: string;
  categoryLogoUrl?: string;
  avatarUrl?: string;
}

export async function uploadSampleImages(storage: StorageProvider): Promise<SampleImages> {
  const [banner, categoryLogo, avatar] = await Promise.all([
    storage.upload(sampleBanner),
    storage.upload(sampleCategoryLogo),
    storage.upload(sampleAvatar),
  ]);
  return { bannerImageUrl: banner.url, categoryLogoUrl: categoryLogo.url, avatarUrl: avatar.url };
}

/** O print da denúncia do chat vai para o storage privado (ADR-073): o seed devolve a chave, não uma URL. */
export async function uploadSampleEvidence(privateStorage: StorageProvider): Promise<string> {
  const stored = await privateStorage.upload(sampleChatPrint);
  return stored.key;
}
