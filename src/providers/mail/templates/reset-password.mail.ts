import type { MailMessage } from '@/providers/mail/mail.provider';

import { escapeHtml } from './escape-html';

export interface ResetPasswordMailData {
  to: string;
  name: string;
  link: string;
  validFor: string;
}

export function resetPasswordMail({
  to,
  name,
  link,
  validFor,
}: ResetPasswordMailData): MailMessage {
  return {
    to,
    subject: 'Redefina sua senha no CromoCard',
    text: `Olá, ${name}!\n\nRecebemos um pedido para redefinir sua senha. Use o link abaixo:\n${link}\n\nO link vale por ${validFor} e só pode ser usado uma vez. Se você não pediu, ignore este e-mail: sua senha continua a mesma.`,
    html: `<p>Olá, ${escapeHtml(name)}!</p><p>Recebemos um pedido para redefinir sua senha.</p><p><a href="${link}">Redefinir senha</a></p><p>O link vale por ${validFor} e só pode ser usado uma vez. Se você não pediu, ignore este e-mail: sua senha continua a mesma.</p>`,
  };
}
