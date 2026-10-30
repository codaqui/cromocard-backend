import type { MailMessage, MailProvider } from './mail.provider';

export class InMemoryMailProvider implements MailProvider {
  readonly sent: MailMessage[] = [];

  send(message: MailMessage): Promise<void> {
    this.sent.push(message);
    return Promise.resolve();
  }
}
