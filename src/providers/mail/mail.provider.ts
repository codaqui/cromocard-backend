export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface MailProvider {
  send(message: MailMessage): Promise<void>;
}
