import type { Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { describe, expect, it, vi } from 'vitest';

import { InMemoryMailProvider } from './memory.mail-provider';
import { NodemailerMailProvider } from './nodemailer.mail-provider';

const message = {
  to: 'ana@cromocard.dev',
  subject: 'Confirme seu e-mail',
  html: '<p>Oi</p>',
  text: 'Oi',
};

function fakeTransport(info: Partial<SMTPTransport.SentMessageInfo> = {}) {
  const sendMail = vi.fn(() => Promise.resolve(info as SMTPTransport.SentMessageInfo));
  const transporter = { sendMail } as unknown as Transporter<SMTPTransport.SentMessageInfo>;
  return { sendMail, createTransport: vi.fn(() => Promise.resolve(transporter)) };
}

describe('NodemailerMailProvider', () => {
  it('envia com o remetente configurado e cria o transporte uma vez só', async () => {
    const { sendMail, createTransport } = fakeTransport();
    const logger = { info: vi.fn() };
    const provider = new NodemailerMailProvider({
      from: 'CromoCard <x@y.z>',
      createTransport,
      logger,
    });

    await provider.send(message);
    await provider.send(message);

    expect(sendMail).toHaveBeenCalledWith({ from: 'CromoCard <x@y.z>', ...message });
    expect(createTransport).toHaveBeenCalledOnce();
    expect(logger.info).not.toHaveBeenCalled();
  });
});

describe('InMemoryMailProvider', () => {
  it('guarda as mensagens enviadas', async () => {
    const provider = new InMemoryMailProvider();

    await provider.send(message);

    expect(provider.sent).toEqual([message]);
  });
});
