import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import { createApp } from '@/app';
import { env } from '@/config/env';
import { buildOpenApiDocument } from '@/config/swagger';
import { publicSettingsModule, settingsModule } from '@/domains/admin/settings/settings.module';

const originalNodeEnv = env.NODE_ENV;

afterEach(() => {
  env.NODE_ENV = originalNodeEnv;
});

describe('documentação da API em /docs', () => {
  it('serve o Swagger fora de produção', async () => {
    const res = await request(createApp()).get('/docs/');

    expect(res.status).toBe(200);
    expect(res.text).toContain('swagger-ui');
  });

  it('não monta o Swagger em produção', async () => {
    env.NODE_ENV = 'production';

    const res = await request(createApp()).get('/docs/');

    expect(res.status).toBe(404);
  });

  it('gera o documento com as rotas de configurações e a leitura pública do banner', () => {
    const document = buildOpenApiDocument([settingsModule, publicSettingsModule]);

    expect(Object.keys(document.paths ?? {})).toEqual(
      expect.arrayContaining([
        '/admin/settings',
        '/admin/settings/{key}',
        '/admin/settings/default-categories',
        '/admin/settings/goals',
        '/settings/public/{key}',
      ]),
    );
  });
});
