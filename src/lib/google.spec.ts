import type { OAuth2Client, TokenPayload } from 'google-auth-library';
import { describe, expect, it } from 'vitest';

import { createGoogleVerifier, DisabledGoogleVerifier, GoogleAuthLibraryVerifier } from './google';

const CLIENT_ID = 'cliente-de-teste.apps.googleusercontent.com';

function clientReturning(payload: TokenPayload | Error): OAuth2Client {
  const verifyIdToken = ({ audience }: { audience: string }) => {
    if (payload instanceof Error) return Promise.reject(payload);
    if (audience !== CLIENT_ID) return Promise.reject(new Error('aud'));
    return Promise.resolve({ getPayload: () => payload });
  };
  return { verifyIdToken } as unknown as OAuth2Client;
}

const validPayload: TokenPayload = {
  iss: 'https://accounts.google.com',
  sub: '1234567890',
  aud: CLIENT_ID,
  iat: 0,
  exp: 0,
  email: 'Ana@Gmail.com',
  email_verified: true,
  name: 'Ana Google',
};

describe('GoogleAuthLibraryVerifier', () => {
  it('devolve sub, e-mail em minúsculas e nome de um id_token válido', async () => {
    const verifier = new GoogleAuthLibraryVerifier(CLIENT_ID, clientReturning(validPayload));

    await expect(verifier.verify('id-token')).resolves.toEqual({
      sub: '1234567890',
      email: 'ana@gmail.com',
      name: 'Ana Google',
    });
  });

  it('usa o começo do e-mail quando o Google não manda o nome', async () => {
    const payload = { ...validPayload, name: undefined };
    const verifier = new GoogleAuthLibraryVerifier(CLIENT_ID, clientReturning(payload));

    await expect(verifier.verify('id-token')).resolves.toMatchObject({ name: 'ana' });
  });

  it('devolve null quando a assinatura, o aud ou o exp não batem', async () => {
    const verifier = new GoogleAuthLibraryVerifier(CLIENT_ID, clientReturning(new Error('exp')));

    await expect(verifier.verify('id-token')).resolves.toBeNull();
  });

  it('devolve null quando o Google não confirmou o e-mail', async () => {
    const payload = { ...validPayload, email_verified: false };
    const verifier = new GoogleAuthLibraryVerifier(CLIENT_ID, clientReturning(payload));

    await expect(verifier.verify('id-token')).resolves.toBeNull();
  });
});

describe('createGoogleVerifier', () => {
  it('usa a google-auth-library quando há client ID', () => {
    expect(createGoogleVerifier(CLIENT_ID)).toBeInstanceOf(GoogleAuthLibraryVerifier);
  });

  it('desliga o login com Google sem client ID e recusa todo id_token', async () => {
    const verifier = createGoogleVerifier(undefined);

    expect(verifier).toBeInstanceOf(DisabledGoogleVerifier);
    await expect(verifier.verify('qualquer-id-token')).resolves.toBeNull();
  });
});
