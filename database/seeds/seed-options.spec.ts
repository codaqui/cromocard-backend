import { describe, expect, it } from 'vitest';

import { isLocalDatabase, LOCAL_SEED_PASSWORD, seedOptionsFrom } from './seed-options';

const LOCAL_URL = 'postgresql://cromocard:cromocard@localhost:5432/cromocard';
const SHARED_URL = 'postgresql://cromocard_hml:senha@cromocard-hml-db:5432/cromocard_hml';
const CUSTOM_PASSWORD = 'Outra#Senha2026';

describe('seedOptionsFrom', () => {
  it('reconhece como local só o banco em localhost, 127.0.0.1 ou ::1', () => {
    expect(isLocalDatabase(LOCAL_URL)).toBe(true);
    expect(isLocalDatabase('postgresql://u:p@127.0.0.1:5432/db')).toBe(true);
    expect(isLocalDatabase('postgresql://u:p@[::1]:5432/db')).toBe(true);
    expect(isLocalDatabase(SHARED_URL)).toBe(false);
  });

  it('trata como compartilhado o host do parâmetro ?host=, que é onde o driver conecta', () => {
    expect(isLocalDatabase('postgresql://u:p@localhost:5432/db?host=cromocard-hml-db')).toBe(false);
    expect(
      isLocalDatabase('postgresql://u:p@localhost:5432/db?host=localhost,cromocard-hml-db'),
    ).toBe(false);
  });

  it('trata como local o socket Unix e a URL sem host', () => {
    expect(isLocalDatabase('postgresql://u:p@localhost/db?host=/var/run/postgresql')).toBe(true);
    expect(isLocalDatabase('postgresql:///db')).toBe(true);
  });

  it('recusa a DATABASE_URL malformada sem repetir a URL, que tem a senha do banco', () => {
    const malformed = 'postgresql://cromocard_hml:senha-secreta@cromocard-hml-db:porta/db';

    expect(() => seedOptionsFrom({ databaseUrl: malformed })).toThrow(
      'Seed: DATABASE_URL malformada.',
    );
    expect(() => seedOptionsFrom({ databaseUrl: malformed })).not.toThrow(/senha-secreta/);
  });

  it('no banco local, usa a senha do README', () => {
    expect(seedOptionsFrom({ databaseUrl: LOCAL_URL })).toEqual({
      isLocalDatabase: true,
      userPassword: LOCAL_SEED_PASSWORD,
    });
  });

  it('no banco local, aceita outra senha', () => {
    const options = seedOptionsFrom({ databaseUrl: LOCAL_URL, userPassword: CUSTOM_PASSWORD });

    expect(options.userPassword).toBe(CUSTOM_PASSWORD);
  });

  it('no banco compartilhado, exige a SEED_USER_PASSWORD', () => {
    expect(() => seedOptionsFrom({ databaseUrl: SHARED_URL })).toThrow(/SEED_USER_PASSWORD/);
    expect(() => seedOptionsFrom({ databaseUrl: SHARED_URL, userPassword: '' })).toThrow(
      /SEED_USER_PASSWORD/,
    );
  });

  it('no banco compartilhado, recusa a senha do README', () => {
    expect(() =>
      seedOptionsFrom({ databaseUrl: SHARED_URL, userPassword: LOCAL_SEED_PASSWORD }),
    ).toThrow(/README/);
  });

  it('recusa a senha que não segue a regra de senha do cadastro', () => {
    expect(() => seedOptionsFrom({ databaseUrl: SHARED_URL, userPassword: 'curta' })).toThrow(
      /SEED_USER_PASSWORD inválida/,
    );
  });

  it('no banco compartilhado, usa a senha informada', () => {
    expect(seedOptionsFrom({ databaseUrl: SHARED_URL, userPassword: CUSTOM_PASSWORD })).toEqual({
      isLocalDatabase: false,
      userPassword: CUSTOM_PASSWORD,
    });
  });
});
