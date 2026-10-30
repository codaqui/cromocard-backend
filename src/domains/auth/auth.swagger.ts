import type { OpenAPIRegistry, RouteConfig } from '@asteasolutions/zod-to-openapi';

import { googleLoginSchema, loginSchema } from './auth.validator';

const tags = ['Autenticação'];
const sessionDescription =
  'Sessão iniciada: { data: { accessToken, user: { id, name, role } } } e cookie httpOnly cromocard_refresh';
const tooManyRequests = { description: 'TOO_MANY_REQUESTS: passou de 5 tentativas por minuto' };

function jsonBody(schema: typeof loginSchema | typeof googleLoginSchema) {
  return { body: { content: { 'application/json': { schema } } } };
}

const authPaths: RouteConfig[] = [
  {
    method: 'post',
    path: '/auth/login',
    tags,
    summary: 'Entra com e-mail e senha',
    request: jsonBody(loginSchema),
    responses: {
      200: { description: sessionDescription },
      400: { description: 'VALIDATION_ERROR: e-mail inválido ou campo vazio' },
      401: { description: 'INVALID_CREDENTIALS: e-mail ou senha incorretos' },
      403: { description: 'EMAIL_NOT_VERIFIED, ACCOUNT_SUSPENDED ou ACCOUNT_DELETED' },
      429: tooManyRequests,
    },
  },
  {
    method: 'post',
    path: '/auth/google',
    tags,
    summary: 'Entra com o id_token do Google; cria ou vincula a conta',
    request: jsonBody(googleLoginSchema),
    responses: {
      200: { description: sessionDescription },
      401: { description: 'INVALID_GOOGLE_TOKEN: id_token inválido ou expirado' },
      403: { description: 'ACCOUNT_SUSPENDED ou ACCOUNT_DELETED' },
      429: tooManyRequests,
    },
  },
  {
    method: 'post',
    path: '/auth/refresh',
    tags,
    summary: 'Renova o access token pelo cookie cromocard_refresh (rotação)',
    responses: {
      200: { description: sessionDescription },
      401: { description: 'INVALID_REFRESH_TOKEN ou REFRESH_TOKEN_REUSED' },
    },
  },
  {
    method: 'post',
    path: '/auth/logout',
    tags,
    summary: 'Encerra a sessão: revoga o refresh e limpa o cookie',
    responses: { 204: { description: 'Sessão encerrada' } },
  },
];

export function registerAuthDocs(registry: OpenAPIRegistry): void {
  authPaths.forEach((path) => registry.registerPath(path));
}
