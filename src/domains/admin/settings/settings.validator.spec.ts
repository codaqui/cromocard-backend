import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import { SETTING_KEYS } from './setting-schemas';
import { SettingNotFoundError } from './settings.errors';
import {
  defaultCategoriesBodySchema,
  goalsBodySchema,
  parseSettingUpdate,
} from './settings.validator';

const BANNER = {
  enabled: true,
  title: 'Semana de Cartas Raras',
  subtitle: 'Confira as cartas raras desta semana.',
  ctaText: 'Ver cartas',
  ctaUrl: 'https://cromocard.com.br/catalogo?semana=raras',
  imageUrl: null,
};

const TEMPLATE = {
  name: 'Novo álbum disponível',
  title: 'Novo álbum disponível: {álbum}',
  content: 'O álbum {álbum} já está no catálogo.',
};

function issueFieldsOf(error: unknown): string[] {
  if (!(error instanceof ZodError)) throw error;
  return error.issues.map(({ path }) => path.join('.'));
}

function fieldsOf(work: () => unknown): string[] {
  try {
    work();
    return [];
  } catch (error) {
    return issueFieldsOf(error);
  }
}

const bannerUpdate = (value: object) =>
  parseSettingUpdate({ key: SETTING_KEYS.homeBanner }, { value: { ...BANNER, ...value } });

const templatesUpdate = (value: object[]) =>
  parseSettingUpdate({ key: SETTING_KEYS.notificationTemplates }, { value });

describe('settings.validator', () => {
  it('R9: aceita o banner completo e o devolve com a chave', () => {
    expect(bannerUpdate({})).toEqual({ key: SETTING_KEYS.homeBanner, value: BANNER });
  });

  it('CA3: recusa o link do banner sem https://, com a mensagem do Figma', () => {
    expect(fieldsOf(() => bannerUpdate({ ctaUrl: 'http://cromocard.com.br/catalogo' }))).toEqual([
      'value.ctaUrl',
    ]);
    expect(() => bannerUpdate({ ctaUrl: 'cromocard catalogo raras' })).toThrow(
      'Informe um link válido, começando com https://',
    );
  });

  it('R7: aponta título vazio, texto do botão longo e imagem que não é URL', () => {
    const fields = fieldsOf(() =>
      bannerUpdate({ title: ' ', ctaText: 'x'.repeat(31), imageUrl: 'banner.png' }),
    );

    expect(fields).toEqual(['value.title', 'value.ctaText', 'value.imageUrl']);
  });

  it('CA7: aceita {campo} no template e recusa dois templates com o mesmo nome', () => {
    expect(templatesUpdate([TEMPLATE]).value).toEqual([TEMPLATE]);
    expect(
      fieldsOf(() => templatesUpdate([TEMPLATE, { ...TEMPLATE, name: 'NOVO ÁLBUM DISPONÍVEL' }])),
    ).toEqual(['value.1.name']);
  });

  it('R11: recusa título acima de 120 e texto acima de 500 caracteres', () => {
    const tooLong = { ...TEMPLATE, title: 'x'.repeat(121), content: 'x'.repeat(501) };

    expect(fieldsOf(() => templatesUpdate([tooLong]))).toEqual([
      'value.0.title',
      'value.0.content',
    ]);
  });

  it('R16: chave que não se edita por /:key responde como não encontrada', () => {
    expect(() => parseSettingUpdate({ key: SETTING_KEYS.votingGoal }, { value: 200 })).toThrow(
      SettingNotFoundError,
    );
    expect(() => parseSettingUpdate({ key: 'chave.inexistente' }, { value: 1 })).toThrow(
      SettingNotFoundError,
    );
  });

  it('CA9: a meta mensal aceita vazio, e a meta de votos é obrigatória e inteira', () => {
    expect(goalsBodySchema.parse({ monthlySignupGoal: null, votingGoal: 200 })).toEqual({
      monthlySignupGoal: null,
      votingGoal: 200,
    });
    expect(
      fieldsOf(() => goalsBodySchema.parse({ monthlySignupGoal: 0, votingGoal: null })),
    ).toEqual(['monthlySignupGoal', 'votingGoal']);
    expect(
      fieldsOf(() => goalsBodySchema.parse({ monthlySignupGoal: 10.5, votingGoal: 1 })),
    ).toEqual(['monthlySignupGoal']);
  });

  it('R10: recusa a mesma categoria duas vezes e verso que não é URL', () => {
    const id = '0190f3a4-0000-7000-8000-000000000101';

    expect(
      fieldsOf(() =>
        defaultCategoriesBodySchema.parse({
          categories: [
            { id, backImageUrl: null },
            { id, backImageUrl: 'verso.png' },
          ],
        }),
      ),
    ).toEqual(['categories.1.backImageUrl', 'categories']);
  });
});
