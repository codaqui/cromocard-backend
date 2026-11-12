import { describe, expect, it } from 'vitest';

import { Prisma } from '@/generated/prisma/client';

import { isUniqueConstraintError, uniqueConstraintFields } from './unique-constraint';

function classicError(target: string[] | string) {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'teste',
    meta: { target },
  });
}

function driverAdapterError(index: string) {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'teste',
    meta: {
      driverAdapterError: { cause: { constraint: { index } } },
    },
  });
}

function driverAdapterErrorWithMessage(originalMessage: string) {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'teste',
    meta: {
      driverAdapterError: { cause: { originalMessage } },
    },
  });
}

describe('isUniqueConstraintError', () => {
  it('reconhece um P2002', () => {
    expect(isUniqueConstraintError(classicError(['email']))).toBe(true);
  });

  it('não reconhece outros erros', () => {
    expect(isUniqueConstraintError(new Error('outro erro'))).toBe(false);
    expect(isUniqueConstraintError(undefined)).toBe(false);
  });
});

describe('uniqueConstraintFields', () => {
  it('lê o formato clássico com target em array', () => {
    expect(uniqueConstraintFields(classicError(['username']))).toEqual(['username']);
  });

  it('lê o formato clássico com target em string', () => {
    expect(uniqueConstraintFields(classicError('cpf'))).toEqual(['cpf']);
  });

  it('lê o formato driverAdapterError (Prisma 7) pelo índice único', () => {
    expect(uniqueConstraintFields(driverAdapterError('users_username_key'))).toEqual(['username']);
    expect(uniqueConstraintFields(driverAdapterError('users_cpf_key'))).toEqual(['cpf']);
    expect(uniqueConstraintFields(driverAdapterError('users_email_key'))).toEqual(['email']);
  });

  it('lê o formato driverAdapterError pela originalMessage quando não há índice', () => {
    expect(
      uniqueConstraintFields(
        driverAdapterErrorWithMessage('duplicate key value violates unique constraint "users_cpf_key"'),
      ),
    ).toEqual(['cpf']);
  });

  it('não confunde o índice de OAuth com e-mail, CPF ou @', () => {
    expect(uniqueConstraintFields(driverAdapterError('users_oauth_provider_oauth_id_key'))).toEqual([
      'oauthProvider',
      'oauthId',
    ]);
  });

  it('devolve lista vazia para um índice desconhecido ou erro que não é P2002', () => {
    expect(uniqueConstraintFields(driverAdapterError('algo_novo_key'))).toEqual([]);
    expect(uniqueConstraintFields(new Error('outro erro'))).toEqual([]);
  });

  it('devolve lista vazia quando não há índice nem originalMessage', () => {
    const error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'teste',
      meta: { driverAdapterError: { cause: {} } },
    });

    expect(uniqueConstraintFields(error)).toEqual([]);
  });

  it('devolve lista vazia sem nenhum meta', () => {
    const error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'teste',
    });

    expect(uniqueConstraintFields(error)).toEqual([]);
  });
});
