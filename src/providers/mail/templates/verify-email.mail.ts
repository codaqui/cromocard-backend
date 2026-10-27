import type { MailMessage } from '@/providers/mail/mail.provider';

export interface VerifyEmailMailData {
  to: string;
  name: string;
  link: string;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

export function verifyEmailMail({ to, name, link }: VerifyEmailMailData): MailMessage {
  const safeName = escapeHtml(name);

  return {
    to,
    subject: 'Confirme seu e-mail no CromoCard',
    text: `Olá, ${name}!\n\nConfirme seu e-mail para entrar no CromoCard:\n${link}\n\nO link vale por 24 horas. Se você não criou esta conta, ignore este e-mail.`,
    html: `<p>Olá, ${safeName}!</p><p>Confirme seu e-mail para entrar no CromoCard:</p><p><a href="${link}">Confirmar e-mail</a></p><p>O link vale por 24 horas. Se você não criou esta conta, ignore este e-mail.</p>`,
  };
}
