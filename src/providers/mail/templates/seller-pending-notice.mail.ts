import type { MailMessage } from '@/providers/mail/mail.provider';

import { escapeHtml } from './escape-html';

export const SELLER_PENDING_NOTICE_SUBJECT = 'Pendência no seu cadastro de vendedor — CromoCard';

export interface SellerPendingNoticeMailData {
  to: string;
  name: string;
  message: string;
  deadline: string;
}

export function sellerPendingNoticeMail({
  to,
  name,
  message,
  deadline,
}: SellerPendingNoticeMailData): MailMessage {
  return {
    to,
    subject: SELLER_PENDING_NOTICE_SUBJECT,
    text: `Olá, ${name}!\n\n${message}\n\nVocê tem ${deadline} para regularizar o cadastro.`,
    html: `<p>Olá, ${escapeHtml(name)}!</p><p>${escapeHtml(message)}</p><p>Você tem ${escapeHtml(deadline)} para regularizar o cadastro.</p>`,
  };
}
