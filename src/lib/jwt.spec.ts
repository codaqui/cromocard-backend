import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';

import { env } from '@/config/env';

import { signAccessToken, verifyAccessToken } from './jwt';

const user = { id: '0190a000-0000-7001-8000-000000000001', role: 'CUSTOMER' as const };

describe('jwt', () => {
  it('assina com HS256 só sub e role, valendo JWT_ACCESS_TTL', () => {
    const payload = jwt.decode(signAccessToken(user), { complete: true });

    expect(payload?.header.alg).toBe('HS256');
    expect(payload?.payload).toMatchObject({ sub: user.id, role: user.role });
    expect(Object.keys(payload?.payload ?? {}).sort()).toEqual(['exp', 'iat', 'role', 'sub']);
    const { exp, iat } = payload?.payload as jwt.JwtPayload;
    expect((exp ?? 0) - (iat ?? 0)).toBe(env.JWT_ACCESS_TTL);
  });

  it('devolve o usuário de um token válido', () => {
    expect(verifyAccessToken(signAccessToken(user))).toEqual(user);
  });

  it('recusa token com purpose, como o de confirmação de e-mail', () => {
    const token = jwt.sign({ role: 'CUSTOMER', purpose: 'verify-email' }, env.JWT_SECRET, {
      subject: user.id,
    });

    expect(() => verifyAccessToken(token)).toThrow('Token inválido ou expirado');
  });

  it('recusa token expirado', () => {
    const token = jwt.sign({ role: 'CUSTOMER' }, env.JWT_SECRET, {
      subject: user.id,
      expiresIn: -1,
    });

    expect(() => verifyAccessToken(token)).toThrow('Token inválido ou expirado');
  });

  it('recusa token assinado com outro segredo', () => {
    const token = jwt.sign({ role: 'CUSTOMER' }, 'outro-segredo-outro-segredo-outro-segredo', {
      subject: user.id,
    });

    expect(() => verifyAccessToken(token)).toThrow('Token inválido ou expirado');
  });
});
