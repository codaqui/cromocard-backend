import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '@/app';
import { buildOpenApiDocument } from '@/config/swagger';
import { catalogModule } from '@/domains/catalog/catalog.module';
import { signAccessToken } from '@/lib/jwt';

const BASE = '/api/v1/admin/catalog';
const ITEM_ID = crypto.randomUUID();

const catalogRoutes = [
  ['get', `${BASE}/albums`],
  ['post', `${BASE}/albums`],
  ['patch', `${BASE}/albums/${ITEM_ID}`],
  ['delete', `${BASE}/albums/${ITEM_ID}`],
  ['get', `${BASE}/cards`],
  ['post', `${BASE}/cards`],
  ['patch', `${BASE}/cards/${ITEM_ID}`],
  ['delete', `${BASE}/cards/${ITEM_ID}`],
  ['post', `${BASE}/cards/import`],
  ['get', `${BASE}/cards/import/template`],
  ['get', `${BASE}/categories`],
  ['post', `${BASE}/categories`],
  ['patch', `${BASE}/categories/${ITEM_ID}`],
  ['delete', `${BASE}/categories/${ITEM_ID}`],
  ['get', `${BASE}/rarities`],
  ['get', `${BASE}/languages`],
] as const;

const customerToken = signAccessToken({ id: crypto.randomUUID(), role: 'CUSTOMER' });
const adminToken = signAccessToken({ id: crypto.randomUUID(), role: 'ADMIN' });

type Method = (typeof catalogRoutes)[number][0];

function requestAs(token: string, method: Method, path: string) {
  return request(createApp())[method](path).set('Authorization', `Bearer ${token}`);
}

function asAdmin(method: Method, path: string) {
  return requestAs(adminToken, method, path);
}

function errorCode(body: unknown): string {
  return (body as { error: string }).error;
}

describe.each(catalogRoutes)('rota do catálogo %s %s', (method, path) => {
  it('R1: exige autenticação', async () => {
    const res = await request(createApp())[method](path);

    expect(res.status).toBe(401);
  });

  it('CA7: responde 403 para quem não é ADMIN', async () => {
    const res = await requestAs(customerToken, method, path);

    expect(res.status).toBe(403);
  });
});

describe('validação do catálogo', () => {
  it('R5: recusa álbum sem título com 400', async () => {
    const res = await asAdmin('post', `${BASE}/albums`).send({});

    expect(res.status).toBe(400);
    expect(errorCode(res.body)).toBe('VALIDATION_ERROR');
  });

  it('R6: recusa carta sem a imagem da frente com 400 e aponta o campo', async () => {
    const res = await asAdmin('post', `${BASE}/cards`).send({ name: 'Pikachu' });

    expect(res.status).toBe(400);
    expect((res.body as { details: { field: string }[] }).details).toContainEqual(
      expect.objectContaining({ field: 'frontImageUrl' }),
    );
  });

  it('R8: recusa id que não é UUID com 400', async () => {
    const res = await asAdmin('patch', `${BASE}/categories/123`).send({ name: 'Futebol' });

    expect(res.status).toBe(400);
  });

  it('R3: recusa filtro que não é UUID com 400', async () => {
    const res = await asAdmin('get', `${BASE}/cards?albumId=abc`);

    expect(res.status).toBe(400);
  });
});

describe('importação de cartas por CSV', () => {
  it('R13: baixa o modelo com o cabeçalho das colunas', async () => {
    const res = await asAdmin('get', `${BASE}/cards/import/template`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('modelo-importacao-cartas.csv');
    expect(res.text).toContain('album_title;number;name;rarity;language;category');
  });

  it('R13: recusa a importação sem arquivo com 400', async () => {
    const res = await asAdmin('post', `${BASE}/cards/import`);

    expect(res.status).toBe(400);
    expect(errorCode(res.body)).toBe('VALIDATION_ERROR');
  });
});

describe('documentação do catálogo', () => {
  it('lista as rotas do catálogo no Swagger', () => {
    const document = buildOpenApiDocument([catalogModule]);

    expect(Object.keys(document.paths ?? {})).toEqual([
      '/admin/catalog/albums',
      '/admin/catalog/albums/{id}',
      '/admin/catalog/cards',
      '/admin/catalog/cards/{id}',
      '/admin/catalog/categories',
      '/admin/catalog/categories/{id}',
      '/admin/catalog/cards/import',
      '/admin/catalog/cards/import/template',
      '/admin/catalog/rarities',
      '/admin/catalog/languages',
    ]);
  });
});
