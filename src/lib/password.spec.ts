import { describe, expect, it } from 'vitest';

import { hashPassword, verifyPassword } from './password';

describe('password', () => {
  it('gera hash argon2id que não contém a senha', async () => {
    const hash = await hashPassword('Senha@Forte1');

    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(hash).not.toContain('Senha@Forte1');
  });

  it('confere a senha certa', async () => {
    const hash = await hashPassword('Senha@Forte1');

    await expect(verifyPassword(hash, 'Senha@Forte1')).resolves.toBe(true);
  });

  it('recusa a senha errada', async () => {
    const hash = await hashPassword('Senha@Forte1');

    await expect(verifyPassword(hash, 'outra-senha')).resolves.toBe(false);
  });

  it('recusa hash malformado sem lançar erro', async () => {
    await expect(verifyPassword('nao-e-hash', 'Senha@Forte1')).resolves.toBe(false);
  });
});
