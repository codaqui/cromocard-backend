import { describe, expect, it } from 'vitest';

import { globalNotificationMail } from './global-notification.mail';

describe('globalNotificationMail', () => {
  it('usa o título como assunto e escapa o HTML do conteúdo e do link', () => {
    const mail = globalNotificationMail({
      to: 'ana@cromocard.dev',
      name: 'Ana <3',
      title: 'Manutenção no sábado',
      content: 'Fora do ar das 2h às 4h & volta logo.',
      link: 'https://cromocard.dev/x?a=1&b="2"',
    });

    expect(mail.subject).toBe('Manutenção no sábado');
    expect(mail.text).toBe(
      'Olá, Ana <3!\n\nFora do ar das 2h às 4h & volta logo.\n\nVeja no CromoCard: https://cromocard.dev/x?a=1&b="2"',
    );
    expect(mail.html).toContain('Ana &#60;3');
    expect(mail.html).toContain('volta logo');
    expect(mail.html).toContain('&#38; volta');
    expect(mail.html).toContain('href="https://cromocard.dev/x?a=1&#38;b=&#34;2&#34;"');
  });

  it('sem link, não mostra o convite para ver no site', () => {
    const mail = globalNotificationMail({
      to: 'ana@cromocard.dev',
      name: 'Ana',
      title: 'Aviso',
      content: 'Texto',
      link: null,
    });

    expect(mail.text).toBe('Olá, Ana!\n\nTexto');
    expect(mail.html).not.toContain('<a');
  });
});
