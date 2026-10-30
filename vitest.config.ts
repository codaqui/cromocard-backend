import os from 'node:os';
import path from 'node:path';

import { defineConfig } from 'vitest/config';

// Valores de teste para as variáveis obrigatórias de src/config/env.ts. O DATABASE_URL real,
// quando existe (testes de integração no CI), tem prioridade sobre o valor fictício.
const testEnv = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  CORS_ORIGIN: 'http://localhost:5173',
  JWT_SECRET: 'segredo-de-teste-segredo-de-teste-segredo',
  JWT_ACCESS_TTL: '900',
  REFRESH_TTL: '86400',
  REFRESH_TTL_REMEMBER: '2592000',
  GOOGLE_CLIENT_ID: 'cliente-de-teste.apps.googleusercontent.com',
  COOKIE_SECURE: 'false',
  DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://teste:teste@localhost:5432/teste',
  STORAGE_LOCAL_DIR: path.join(os.tmpdir(), 'cromocard-test-uploads'),
};

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts', 'tests/**/*.spec.ts'],
    env: testEnv,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/domains/**/*.service.ts'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
