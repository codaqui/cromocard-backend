import type { MailMessage } from '@/providers/mail/mail.provider';

import { escapeHtml } from './escape-html';

export interface GlobalNotificationMailData {
  to: string;
  name: string;
  title: string;
  content: string;
  /** Endereço completo do link de destino, se houver. */
  link: string | null;
}

export function globalNotificationMail({
  to,
  name,
  title,
  content,
  link,
}: GlobalNotificationMailData): MailMessage {
  const linkText = link ? `\n\nVeja no CromoCard: ${link}` : '';
  const linkHtml = link ? `<p><a href="${escapeHtml(link)}">Ver no CromoCard</a></p>` : '';

  return {
    to,
    subject: title,
    text: `Olá, ${name}!\n\n${content}${linkText}`,
    html: `<p>Olá, ${escapeHtml(name)}!</p><p>${escapeHtml(content)}</p>${linkHtml}`,
  };
}
