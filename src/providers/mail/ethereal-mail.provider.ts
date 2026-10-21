import { NotImplementedError } from '@/shared/errors/http-errors';

import type { MailMessage, MailProvider } from './mail.provider';

export class EtherealMailProvider implements MailProvider {
  send(_message: MailMessage): Promise<void> {
    throw new NotImplementedError();
  }
}
