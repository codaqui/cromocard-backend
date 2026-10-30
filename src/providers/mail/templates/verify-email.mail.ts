import type { MailMessage } from '@/providers/mail/mail.provider';

import { escapeHtml } from './escape-html';

export interface VerifyEmailMailData {
  to: string;
  name: string;
  link: string;
  validFor: string;
}

export function verifyEmailMail({ to, name, link, validFor }: VerifyEmailMailData): MailMessage {
  const safeName = escapeHtml(name);

  return {
    to,
    subject: 'Confirme seu e-mail no CromoCard',
    text: `Olá, ${name}!\n\nConfirme seu e-mail para entrar no CromoCard:\n${link}\n\nO link vale por ${validFor}. Se você não criou esta conta, ignore este e-mail.`,
    html: `<p>Olá, ${safeName}!</p><p>Confirme seu e-mail para entrar no CromoCard:</p><p><a href="${link}">Confirmar e-mail</a></p><p>O link vale por ${validFor}. Se você não criou esta conta, ignore este e-mail.</p>`,
  };
}
