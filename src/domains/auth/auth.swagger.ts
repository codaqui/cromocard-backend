import type { OpenAPIRegistry, RouteConfig } from '@asteasolutions/zod-to-openapi';

import {
  forgotPasswordSchema,
  googleLoginSchema,
  loginSchema,
  registerSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from './auth.validator';

const tags = ['Autenticação'];
const sessionDescription =
  'Sessão iniciada: { data: { accessToken, user: { id, name, role } } } e cookie httpOnly cromocard_refresh';
const tooManyRequests = { description: 'TOO_MANY_REQUESTS: passou de 5 tentativas por minuto' };

function jsonBody(schema: Parameters<OpenAPIRegistry['register']>[1]) {
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
  {
    method: 'post',
    path: '/auth/register',
    tags,
    summary: 'Cria a conta de Cliente ou Vendedor e envia o e-mail de confirmação',
    request: jsonBody(registerSchema),
    responses: {
      201: { description: '{ data: { id, name, email, role, emailVerified: false } }' },
      400: { description: 'VALIDATION_ERROR: campo inválido, senha fora da regra ou termos' },
      409: { description: 'EMAIL_ALREADY_REGISTERED ou ACCOUNT_DELETED' },
      429: { description: 'TOO_MANY_REQUESTS: passou de 10 cadastros por hora' },
    },
  },
  {
    method: 'post',
    path: '/auth/verify-email',
    tags,
    summary: 'Confirma o e-mail pelo token do link',
    request: jsonBody(verifyEmailSchema),
    responses: {
      204: { description: 'E-mail confirmado' },
      400: { description: 'INVALID_VERIFICATION_TOKEN: link expirado ou inválido' },
    },
  },
  {
    method: 'post',
    path: '/auth/verify-email/resend',
    tags,
    summary: 'Reenvia o e-mail de confirmação; a resposta é a mesma exista ou não a conta',
    request: jsonBody(resendVerificationSchema),
    responses: {
      202: { description: 'Pedido recebido' },
      429: { description: 'TOO_MANY_REQUESTS: passou de 3 pedidos em 15 minutos' },
    },
  },
  {
    method: 'post',
    path: '/auth/password/forgot',
    tags,
    summary: 'Pede o link de redefinição de senha; a resposta é a mesma exista ou não a conta',
    request: jsonBody(forgotPasswordSchema),
    responses: {
      202: { description: 'Pedido recebido' },
      400: { description: 'VALIDATION_ERROR: e-mail inválido' },
      429: { description: 'TOO_MANY_REQUESTS: passou de 3 pedidos em 15 minutos' },
    },
  },
  {
    method: 'post',
    path: '/auth/password/reset',
    tags,
    summary: 'Define a senha nova com o token do link e encerra todas as sessões',
    request: jsonBody(resetPasswordSchema),
    responses: {
      204: { description: 'Senha alterada' },
      400: { description: 'VALIDATION_ERROR (senha fora da regra) ou INVALID_RESET_TOKEN' },
      429: { description: 'TOO_MANY_REQUESTS: passou de 10 tentativas em 15 minutos' },
    },
  },
];

export function registerAuthDocs(registry: OpenAPIRegistry): void {
  authPaths.forEach((path) => registry.registerPath(path));
}
