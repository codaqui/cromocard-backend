import type { OpenAPIRegistry, RouteConfig } from '@asteasolutions/zod-to-openapi';

import { loginSchema, setupPasswordSchema } from './auth.validator';

const tags = ['Autenticação'];

const authPaths: RouteConfig[] = [
  {
    method: 'post',
    path: '/auth/login',
    tags,
    summary: 'Login com e-mail e senha (CCD004)',
    request: { body: { content: { 'application/json': { schema: loginSchema } } } },
    responses: {
      200: {
        description: 'Devolve { accessToken, user } e grava o refresh token em cookie httpOnly',
      },
      401: { description: 'E-mail ou senha inválidos' },
      403: { description: 'Conta suspensa' },
    },
  },
  {
    method: 'post',
    path: '/auth/refresh',
    tags,
    summary: 'Gera um novo access token a partir do cookie de refresh (rotativo)',
    responses: {
      200: { description: 'Novo { accessToken, user }' },
      401: { description: 'Sessão expirada' },
    },
  },
  {
    method: 'post',
    path: '/auth/logout',
    tags,
    summary: 'Revoga o refresh token e limpa o cookie',
    responses: { 204: { description: 'Sessão encerrada' } },
  },
  {
    method: 'post',
    path: '/auth/password/setup',
    tags,
    summary: 'Define a senha a partir do link enviado por e-mail (CCD059, RN02)',
    request: { body: { content: { 'application/json': { schema: setupPasswordSchema } } } },
    responses: {
      204: { description: 'Senha definida' },
      422: { description: 'Link inválido ou expirado' },
    },
  },
];

export function registerAuthDocs(registry: OpenAPIRegistry): void {
  authPaths.forEach((path) => registry.registerPath(path));
}
