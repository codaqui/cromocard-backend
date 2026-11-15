import type { MailMessage } from '@/providers/mail/mail.provider';

import { escapeHtml } from './escape-html';

export interface InviteUserMailData {
  to: string;
  name: string;
  link: string;
  validFor: string;
}

export function inviteUserMail({ to, name, link, validFor }: InviteUserMailData): MailMessage {
  const safeName = escapeHtml(name);

  return {
    to,
    subject: 'Você foi convidado para o CromoCard',
    text: `Olá, ${name}!\n\nUm administrador criou uma conta para você no CromoCard. Defina sua senha para entrar:\n${link}\n\nO link vale por ${validFor}.`,
    html: `<p>Olá, ${safeName}!</p><p>Um administrador criou uma conta para você no CromoCard. Defina sua senha para entrar:</p><p><a href="${link}">Definir senha</a></p><p>O link vale por ${validFor}.</p>`,
  };
}
