import { OAuth2Client } from 'google-auth-library';

export interface GoogleProfile {
  sub: string;
  email: string;
  name: string;
}

export interface GoogleIdTokenVerifier {
  verify(idToken: string): Promise<GoogleProfile | null>;
}

const NAME_MAX_LENGTH = 120;

export class GoogleAuthLibraryVerifier implements GoogleIdTokenVerifier {
  constructor(
    private readonly clientId: string,
    private readonly client = new OAuth2Client(),
  ) {}

  async verify(idToken: string): Promise<GoogleProfile | null> {
    const payload = await this.client
      .verifyIdToken({ idToken, audience: this.clientId })
      .then((ticket) => ticket.getPayload())
      .catch(() => undefined);

    if (!payload?.email || !payload.email_verified) return null;

    const email = payload.email.toLowerCase();
    const name = (payload.name ?? email.split('@')[0] ?? email).slice(0, NAME_MAX_LENGTH);
    return { sub: payload.sub, email, name };
  }
}
