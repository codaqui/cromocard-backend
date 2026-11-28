import { describe, expect, it } from 'vitest';

import { createOwnListingPhotoPolicy } from './listing-photos';

const BASE = 'http://storage.test/uploads/';
const isOwnPhoto = createOwnListingPhotoPolicy((key) => `${BASE}${key}`);

describe('createOwnListingPhotoPolicy', () => {
  it('aceita a foto da pasta do próprio vendedor', () => {
    expect(isOwnPhoto(`${BASE}listings/seller-1/frente.png`, 'seller-1')).toBe(true);
  });

  it.each([
    ['de outro vendedor', `${BASE}listings/seller-2/frente.png`],
    ['que sai da pasta com ..', `${BASE}listings/seller-1/../seller-2/frente.png`],
    ['com .. codificado', `${BASE}listings/seller-1/%2e%2e/seller-2/frente.png`],
    ['de outro site', 'https://outro-site.com/listings/seller-1/frente.png'],
    ['que não é uma URL', 'listings/seller-1/frente.png'],
  ])('recusa a foto %s', (_case, url) => {
    expect(isOwnPhoto(url, 'seller-1')).toBe(false);
  });
});
