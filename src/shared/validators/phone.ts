const BRAZIL_PHONE_PATTERN = /^[1-9]{2}9?\d{8}$/;

export function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, '');
}

export function isValidPhone(raw: string): boolean {
  return BRAZIL_PHONE_PATTERN.test(normalizePhone(raw));
}
