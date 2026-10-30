import type { MailMessage } from '@/providers/mail/mail.provider';

import { escapeHtml } from './escape-html';

export interface PasswordChangedMailData {
  to: string;
  name: string;
}

export function passwordChangedMail({ to, name }: PasswordChangedMailData): MailMessage {
  return {
    to,
    subject: 'Sua senha do CromoCard foi alterada',
    text: `Olá, ${name}!\n\nSua senha foi alterada e as sessões abertas foram encerradas. Se não foi você, redefina a senha agora e fale com o suporte.`,
    html: `<p>Olá, ${escapeHtml(name)}!</p><p>Sua senha foi alterada e as sessões abertas foram encerradas.</p><p>Se não foi você, redefina a senha agora e fale com o suporte.</p>`,
  };
}
