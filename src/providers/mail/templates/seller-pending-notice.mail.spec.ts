import { describe, expect, it } from 'vitest';

import {
  SELLER_PENDING_NOTICE_SUBJECT,
  sellerPendingNoticeMail,
} from './seller-pending-notice.mail';

describe('sellerPendingNoticeMail', () => {
  const mail = sellerPendingNoticeMail({
    to: 'kanto@cromocard.dev',
    name: 'Kanto <b>BR</b>',
    message: '<script>alert(1)</script> & "x"',
    deadline: '<i>48 horas</i>',
  });

  it('escapa o nome, a mensagem e o prazo no HTML', () => {
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).not.toContain('<b>');
    expect(mail.html).not.toContain('<i>');
    expect(mail.html).toContain('&#60;script&#62;alert(1)&#60;/script&#62; &#38; &#34;x&#34;');
    expect(mail.html).toContain('Kanto &#60;b&#62;BR&#60;/b&#62;');
    expect(mail.html).toContain('&#60;i&#62;48 horas&#60;/i&#62;');
  });

  it('mantém o texto original na versão em texto puro', () => {
    expect(mail.subject).toBe(SELLER_PENDING_NOTICE_SUBJECT);
    expect(mail.text).toBe(
      'Olá, Kanto <b>BR</b>!\n\n<script>alert(1)</script> & "x"\n\nVocê tem <i>48 horas</i> para regularizar o cadastro.',
    );
  });
});
