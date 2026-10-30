import type { CookieOptions, Request, Response } from 'express';

import { accepted, created, noContent, ok } from '@/shared/utils/http-response';

import type { AuthService, AuthSession, SessionContext } from './auth.service';
import {
  forgotPasswordSchema,
  googleLoginSchema,
  loginSchema,
  registerSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from './auth.validator';

export const REFRESH_COOKIE_NAME = 'cromocard_refresh';
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

const USER_AGENT_MAX_LENGTH = 255;
const IP_ADDRESS_MAX_LENGTH = 45;

export interface RefreshCookieConfig {
  secure: boolean;
}

function sessionContext(req: Request): SessionContext {
  return {
    userAgent: req.get('user-agent')?.slice(0, USER_AGENT_MAX_LENGTH),
    ipAddress: req.ip?.slice(0, IP_ADDRESS_MAX_LENGTH),
  };
}

function readRefreshCookie(req: Request): string | undefined {
  const cookies = req.cookies as Record<string, string | undefined>;
  return cookies[REFRESH_COOKIE_NAME];
}

export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly cookieConfig: RefreshCookieConfig,
  ) {}

  login = async (req: Request, res: Response): Promise<void> => {
    const session = await this.authService.login(loginSchema.parse(req.body), sessionContext(req));
    this.sendSession(res, session);
  };

  loginWithGoogle = async (req: Request, res: Response): Promise<void> => {
    const input = googleLoginSchema.parse(req.body);
    this.sendSession(res, await this.authService.loginWithGoogle(input, sessionContext(req)));
  };

  refresh = async (req: Request, res: Response): Promise<void> => {
    try {
      const session = await this.authService.refresh(readRefreshCookie(req), sessionContext(req));
      this.sendSession(res, session);
    } catch (error) {
      res.clearCookie(REFRESH_COOKIE_NAME, this.cookieOptions());
      throw error;
    }
  };

  logout = async (req: Request, res: Response): Promise<void> => {
    await this.authService.logout(readRefreshCookie(req));
    res.clearCookie(REFRESH_COOKIE_NAME, this.cookieOptions());
    noContent(res);
  };

  register = async (req: Request, res: Response): Promise<void> => {
    created(res, await this.authService.register(registerSchema.parse(req.body)));
  };

  verifyEmail = async (req: Request, res: Response): Promise<void> => {
    await this.authService.verifyEmail(verifyEmailSchema.parse(req.body).token);
    noContent(res);
  };

  resendVerification = async (req: Request, res: Response): Promise<void> => {
    await this.authService.resendVerification(resendVerificationSchema.parse(req.body).email);
    accepted(res);
  };

  forgotPassword = (req: Request, res: Response): void => {
    this.authService.forgotPassword(forgotPasswordSchema.parse(req.body).email);
    accepted(res);
  };

  resetPassword = async (req: Request, res: Response): Promise<void> => {
    await this.authService.resetPassword(resetPasswordSchema.parse(req.body));
    noContent(res);
  };

  private sendSession(res: Response, { accessToken, user, ...refresh }: AuthSession): void {
    const expires = refresh.persistent ? refresh.refreshExpiresAt : undefined;
    res.cookie(REFRESH_COOKIE_NAME, refresh.refreshToken, { ...this.cookieOptions(), expires });
    ok(res, { accessToken, user });
  }

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.cookieConfig.secure,
      sameSite: 'lax',
      path: REFRESH_COOKIE_PATH,
    };
  }
}
