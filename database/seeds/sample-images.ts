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
