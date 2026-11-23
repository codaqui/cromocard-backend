import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { dispatchGlobalNotificationSchema } from './global-notifications.validator';

const NOW = new Date('2026-11-16T12:00:00Z');
const valid = { title: 'Novo álbum', content: 'Monte o seu álbum.' };

const issuesOf = (body: object) => {
  const result = dispatchGlobalNotificationSchema.safeParse(body);
  return result.success
    ? []
    : result.error.issues.map(({ path, message }) => [path.join('.'), message]);
};

describe('dispatchGlobalNotificationSchema', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it('preenche público, canal e sem link quando não informados', () => {
    expect(dispatchGlobalNotificationSchema.parse({ ...valid, link: '  ' })).toEqual({
      ...valid,
      link: undefined,
      audience: 'ALL',
      channels: ['IN_APP'],
    });
  });

  it('CA2: título e mensagem vazios ou longos indicam o campo', () => {
    expect(issuesOf({ title: ' ', content: '' })).toEqual([
      ['title', 'Informe o título.'],
      ['content', 'Informe a mensagem.'],
    ]);
    expect(issuesOf({})).toEqual([
      ['title', 'Informe o título.'],
      ['content', 'Informe a mensagem.'],
    ]);
    expect(issuesOf({ title: 'a'.repeat(121), content: 'b'.repeat(501) })).toEqual([
      ['title', 'Use até 120 caracteres.'],
      ['content', 'Use até 500 caracteres.'],
    ]);
  });

  it('CA9: o link aceita caminho do site ou http(s) e recusa o resto', () => {
    for (const link of ['/albuns/copa-do-mundo-2026', 'https://cromocard.dev/x', 'http://a.b']) {
      expect(issuesOf({ ...valid, link })).toEqual([]);
    }
    for (const link of ['albuns/copa', '//outro.site', 'javascript:alert(1)', '/com espaço']) {
      expect(issuesOf({ ...valid, link })).toEqual([
        ['link', 'Informe um caminho que comece com / ou um link http(s).'],
      ]);
    }
    expect(issuesOf({ ...valid, link: `/${'a'.repeat(255)}` })[0]).toEqual([
      'link',
      'Use até 255 caracteres.',
    ]);
  });

  it('CCD101 CA4: exige pelo menos um canal e tira os repetidos', () => {
    expect(issuesOf({ ...valid, channels: [] })).toEqual([
      ['channels', 'Escolha pelo menos um canal.'],
    ]);
    expect(
      dispatchGlobalNotificationSchema.parse({ ...valid, channels: ['EMAIL', 'EMAIL', 'IN_APP'] })
        .channels,
    ).toEqual(['EMAIL', 'IN_APP']);
  });

  it('CCD100 CA2: o agendamento precisa estar pelo menos 5 minutos à frente', () => {
    const message = 'Escolha um horário com pelo menos 5 minutos de antecedência.';
    expect(issuesOf({ ...valid, scheduledAt: '2026-11-16T12:04:59Z' })).toEqual([
      ['scheduledAt', message],
    ]);
    expect(issuesOf({ ...valid, scheduledAt: '2026-11-15T20:30:00Z' })).toEqual([
      ['scheduledAt', message],
    ]);
    expect(
      dispatchGlobalNotificationSchema.parse({ ...valid, scheduledAt: '2026-11-16T12:05:00Z' })
        .scheduledAt,
    ).toEqual(new Date('2026-11-16T12:05:00Z'));
    expect(issuesOf({ ...valid, scheduledAt: 'amanhã' })).toEqual([
      ['scheduledAt', 'Informe a data e o horário do envio.'],
    ]);
  });
});
