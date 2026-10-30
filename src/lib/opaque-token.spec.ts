import { describe, expect, it } from 'vitest';

import { generateOpaqueToken, hashOpaqueToken } from './opaque-token';

describe('opaque-token', () => {
  it('gera tokens aleatórios de 32 bytes em base64url', () => {
    const token = generateOpaqueToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateOpaqueToken()).not.toBe(token);
  });

  it('gera o mesmo SHA-256 para o mesmo token, sem conter o valor puro', () => {
    const token = generateOpaqueToken();

    expect(hashOpaqueToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashOpaqueToken(token)).toBe(hashOpaqueToken(token));
    expect(hashOpaqueToken(token)).not.toContain(token);
  });
});
