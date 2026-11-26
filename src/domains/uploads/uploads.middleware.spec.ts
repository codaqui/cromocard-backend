import multer from 'multer';
import { describe, expect, it } from 'vitest';

import { ValidationError } from '@/shared/errors/http-errors';

import { FileTooLargeError } from './uploads.errors';
import { toUploadError } from './uploads.middleware';

const toError = toUploadError({ LIMIT_UNEXPECTED_FILE: 'Envie até 3 arquivos no campo evidences' });

describe('toUploadError', () => {
  it('arquivo grande vira 413', () => {
    expect(toError(new multer.MulterError('LIMIT_FILE_SIZE', 'evidences'))).toBeInstanceOf(
      FileTooLargeError,
    );
  });

  it('usa a mensagem do campo e, sem campo, aponta o file com a mensagem padrão', () => {
    const unexpected = toError(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'evidences'));
    const withoutField = toError(new multer.MulterError('LIMIT_FILE_COUNT'));

    expect(unexpected).toMatchObject({
      details: [{ field: 'evidences', message: 'Envie até 3 arquivos no campo evidences' }],
    });
    expect(withoutField).toBeInstanceOf(ValidationError);
    expect(withoutField).toMatchObject({
      details: [{ field: 'file', message: 'Não foi possível ler o arquivo enviado' }],
    });
  });

  it('repassa o erro que não é do multer', () => {
    const other = new Error('outro');
    expect(toError(other)).toBe(other);
  });
});
