import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '@/app';
import { signAccessToken } from '@/lib/jwt';

const FOUR_MEGABYTES = 4 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

interface UploadResponse {
  data: { key: string; url: string };
}

interface ErrorResponse {
  error: string;
  details?: { field: string; message: string }[];
}

function pngImage(sizeInBytes = 64): Buffer {
  const content = Buffer.alloc(sizeInBytes);
  PNG_SIGNATURE.copy(content);
  return content;
}

function textFile(): Buffer {
  return Buffer.from('isto não é uma imagem');
}

const adminToken = signAccessToken({ id: crypto.randomUUID(), role: 'ADMIN' });
const customerToken = signAccessToken({ id: crypto.randomUUID(), role: 'CUSTOMER' });

function postUpload(token?: string) {
  const req = request(createApp({ withUploads: true })).post('/api/v1/uploads');
  return token ? req.set('Authorization', `Bearer ${token}`) : req;
}

describe('POST /api/v1/uploads', () => {
  it('guarda um PNG e serve o arquivo pela URL devolvida', async () => {
    const res = await postUpload(adminToken)
      .field('folder', 'cards')
      .attach('file', pngImage(), 'carta.png');

    const { data } = res.body as UploadResponse;
    expect(res.status).toBe(201);
    expect(data.key).toMatch(/^cards\/.+\.png$/);
    const { pathname } = new URL(data.url);
    const file = await request(createApp({ withUploads: true })).get(pathname);
    expect(file.status).toBe(200);
    expect(file.headers['cross-origin-resource-policy']).toBe('cross-origin');
  });

  it('aceita um arquivo de exatamente 4 MB', async () => {
    const res = await postUpload(adminToken)
      .field('folder', 'banners')
      .attach('file', pngImage(FOUR_MEGABYTES), 'banner.png');

    expect(res.status).toBe(201);
  });

  it('recusa arquivo acima de 4 MB com 413', async () => {
    const res = await postUpload(adminToken)
      .field('folder', 'banners')
      .attach('file', pngImage(FOUR_MEGABYTES + 1), 'banner.png');

    expect(res.status).toBe(413);
    expect((res.body as ErrorResponse).error).toBe('FILE_TOO_LARGE');
  });

  it('recusa arquivo que não é imagem com 400', async () => {
    const res = await postUpload(adminToken)
      .field('folder', 'cards')
      .attach('file', textFile(), { filename: 'falsa.png', contentType: 'image/png' });

    expect(res.status).toBe(400);
    expect((res.body as ErrorResponse).error).toBe('VALIDATION_ERROR');
    expect((res.body as ErrorResponse).details).toEqual([
      { field: 'file', message: 'Envie uma imagem PNG, JPG ou WEBP' },
    ]);
  });

  it('recusa pasta fora da lista com 400', async () => {
    const res = await postUpload(adminToken)
      .field('folder', 'avatars')
      .attach('file', pngImage(), 'carta.png');

    expect(res.status).toBe(400);
    expect((res.body as ErrorResponse).details?.[0]?.field).toBe('folder');
  });

  it('recusa requisição sem pasta com 400', async () => {
    const res = await postUpload(adminToken).attach('file', pngImage(), 'carta.png');

    expect(res.status).toBe(400);
    expect((res.body as ErrorResponse).details?.[0]?.field).toBe('folder');
  });

  it('recusa arquivo em outro campo com 400 e mensagem em português', async () => {
    const res = await postUpload(adminToken)
      .field('folder', 'cards')
      .attach('imagem', pngImage(), 'carta.png');

    expect(res.status).toBe(400);
    expect((res.body as ErrorResponse).details).toEqual([
      { field: 'imagem', message: 'Envie o arquivo no campo file' },
    ]);
  });

  it('recusa requisição sem arquivo com 400', async () => {
    const res = await postUpload(adminToken).field('folder', 'cards');

    expect(res.status).toBe(400);
    expect((res.body as ErrorResponse).details?.[0]?.field).toBe('file');
  });

  it('exige autenticação', async () => {
    const res = await postUpload().field('folder', 'cards').attach('file', pngImage(), 'c.png');

    expect(res.status).toBe(401);
  });

  it('aceita só administradores', async () => {
    const res = await postUpload(customerToken)
      .field('folder', 'cards')
      .attach('file', pngImage(), 'c.png');

    expect(res.status).toBe(403);
  });
});

describe('app sem upload (serviço ws)', () => {
  it('não monta a rota de upload', async () => {
    const res = await request(createApp())
      .post('/api/v1/uploads')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', pngImage(), 'carta.png');

    expect(res.status).toBe(404);
  });
});
