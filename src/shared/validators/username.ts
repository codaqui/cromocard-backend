const USERNAME_PATTERN = /^@?[a-z0-9._]{3,30}$/;

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase().replace(/^@/, '');
}

export function isValidUsername(raw: string): boolean {
  return USERNAME_PATTERN.test(raw.trim().toLowerCase());
}
