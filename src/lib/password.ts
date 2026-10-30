import argon2 from 'argon2';

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

const UNKNOWN_ACCOUNT_PASSWORD = 'senha-de-conta-inexistente';
let unknownAccountHash: Promise<string> | undefined;

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(passwordHash, password);
  } catch {
    return false;
  }
}

export async function verifyPasswordInConstantTime(
  passwordHash: string | null | undefined,
  password: string,
): Promise<boolean> {
  if (passwordHash) return verifyPassword(passwordHash, password);

  unknownAccountHash ??= hashPassword(UNKNOWN_ACCOUNT_PASSWORD);
  await verifyPassword(await unknownAccountHash, password);
  return false;
}
