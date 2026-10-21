import { NotImplementedError } from '@/shared/errors/http-errors';

export function hashPassword(_plainPassword: string): Promise<string> {
  throw new NotImplementedError();
}

export function verifyPassword(_plainPassword: string, _passwordHash: string): Promise<boolean> {
  throw new NotImplementedError();
}
