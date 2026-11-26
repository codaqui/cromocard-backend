import { describe, expect, it, vi } from 'vitest';

import { createEvidenceStorage } from './contact-moderation.evidences';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

describe('createEvidenceStorage', () => {
  const uploads = {
    uploadImage: vi.fn().mockResolvedValue({ key: 'report-evidences/a.png', url: '/a.png' }),
    deleteImage: vi.fn().mockResolvedValue(undefined),
  };
  const storage = createEvidenceStorage(uploads);

  it('R16: aceita só PNG, JPG ou WEBP pela assinatura do arquivo', () => {
    expect(storage.isImage(PNG)).toBe(true);
    expect(storage.isImage(Buffer.from('GIF89a'))).toBe(false);
  });

  it('guarda o print na pasta report-evidences e apaga pela chave', async () => {
    await storage.upload(PNG);
    await storage.remove('report-evidences/a.png');

    expect(uploads.uploadImage).toHaveBeenCalledWith({ folder: 'report-evidences', content: PNG });
    expect(uploads.deleteImage).toHaveBeenCalledWith('report-evidences/a.png');
  });
});
