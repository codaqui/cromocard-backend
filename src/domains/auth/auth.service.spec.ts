import { describe, it } from 'vitest';

describe('AuthService', () => {
  describe('login', () => {
    it.todo('devolve accessToken, refreshToken e os dados do usuário com e-mail e senha corretos');
    it.todo(
      'lança InvalidCredentialsError para e-mail inexistente ou senha errada (mesma mensagem)',
    );
    it.todo('lança InvalidCredentialsError para usuário excluído (deletedAt preenchido)');
    it.todo('lança UserSuspendedError para usuário com status SUSPENDED');
    it.todo('grava last_login_at a cada login bem-sucedido');
    it.todo('salva só o hash do refresh token, com validade de 1 dia ou 30 dias com rememberMe');
  });

  describe('refresh', () => {
    it.todo('revoga o refresh token usado e devolve um novo (rotação)');
    it.todo('lança InvalidRefreshTokenError para token inexistente, revogado ou expirado');
  });

  describe('logout', () => {
    it.todo('revoga o refresh token');
  });

  describe('setupPassword', () => {
    it.todo('grava o hash da senha e marca o token como usado');
    it.todo('lança InvalidPasswordTokenError para token inexistente, usado ou expirado');
  });
});
