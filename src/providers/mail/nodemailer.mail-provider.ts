import nodemailer, { type Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';

import type { MailMessage, MailProvider } from './mail.provider';

export interface MailLogger {
  info(details: object, message: string): void;
}

export interface NodemailerOptions {
  from: string;
  createTransport: () => Promise<Transporter<SMTPTransport.SentMessageInfo>>;
  logger: MailLogger;
}

export interface SmtpSettings {
  host: string;
  port: number;
  user?: string;
  password?: string;
}

export function smtpTransport({ host, port, user, password }: SmtpSettings) {
  const auth = user ? { user, pass: password } : undefined;
  return () => Promise.resolve(nodemailer.createTransport({ host, port, auth }));
}

export async function etherealTransport() {
  const { user, pass, smtp } = await nodemailer.createTestAccount();
  return nodemailer.createTransport({ ...smtp, auth: { user, pass } });
}

export class NodemailerMailProvider implements MailProvider {
  private transport?: Promise<Transporter<SMTPTransport.SentMessageInfo>>;

  constructor(private readonly options: NodemailerOptions) {}

  async send({ to, subject, html, text }: MailMessage): Promise<void> {
    this.transport ??= this.options.createTransport();
    const info = await (
      await this.transport
    ).sendMail({ from: this.options.from, to, subject, html, text });
    const previewUrl = nodemailer.getTestMessageUrl(info);

    if (previewUrl) {
      this.options.logger.info({ previewUrl }, 'E-mail enviado (Ethereal)');
    }
  }
}
