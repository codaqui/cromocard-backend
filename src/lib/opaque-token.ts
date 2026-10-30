import { createHash, randomBytes } from 'node:crypto';

const TOKEN_SIZE_IN_BYTES = 32;

export function generateOpaqueToken(): string {
  return randomBytes(TOKEN_SIZE_IN_BYTES).toString('base64url');
}

export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
