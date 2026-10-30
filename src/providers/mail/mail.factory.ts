import { env } from '@/config/env';
import { logger } from '@/config/logger';

import type { MailProvider } from './mail.provider';
import { InMemoryMailProvider } from './memory.mail-provider';
import {
  etherealTransport,
  NodemailerMailProvider,
  smtpTransport,
} from './nodemailer.mail-provider';

const mailProviderByDriver: Record<typeof env.MAIL_DRIVER, () => MailProvider> = {
  memory: () => new InMemoryMailProvider(),
  ethereal: () =>
    new NodemailerMailProvider({ from: env.MAIL_FROM, createTransport: etherealTransport, logger }),
  smtp: () =>
    new NodemailerMailProvider({
      from: env.MAIL_FROM,
      createTransport: smtpTransport({
        host: env.MAIL_HOST ?? '',
        port: env.MAIL_PORT,
        user: env.MAIL_USER,
        password: env.MAIL_PASSWORD,
      }),
      logger,
    }),
};

export const mailProvider: MailProvider = mailProviderByDriver[env.MAIL_DRIVER]();
