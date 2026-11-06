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

  it('no banco local, usa a senha do README e envia o banner de exemplo', () => {
    expect(seedOptionsFrom({ databaseUrl: LOCAL_URL })).toEqual({
      isLocalDatabase: true,
      userPassword: LOCAL_SEED_PASSWORD,
      uploadsSampleFiles: true,
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

  it('no banco compartilhado, usa a senha informada e não envia o banner', () => {
    expect(seedOptionsFrom({ databaseUrl: SHARED_URL, userPassword: CUSTOM_PASSWORD })).toEqual({
      isLocalDatabase: false,
      userPassword: CUSTOM_PASSWORD,
      uploadsSampleFiles: false,
    });
  });
});
