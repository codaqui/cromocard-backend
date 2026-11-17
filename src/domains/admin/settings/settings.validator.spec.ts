import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import { SETTING_KEYS } from './setting-schemas';
import {
  defaultCategoriesBodySchema,
  goalsBodySchema,
  settingUpdateSchema,
  settingValueBodySchema,
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

const CATEGORY_ID = '0190f3a4-0000-7000-8000-000000000101';

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
  settingUpdateSchema.parse({ key: SETTING_KEYS.homeBanner, value: { ...BANNER, ...value } });

const templatesUpdate = (value: object[]) =>
  settingUpdateSchema.parse({ key: SETTING_KEYS.notificationTemplates, value });

const backsUpdate = (backImageUrl: string | null) =>
  defaultCategoriesBodySchema.parse({ categories: [{ id: CATEGORY_ID, backImageUrl }] });

describe('settings.validator', () => {
  it('R9: aceita o banner completo e o devolve com a chave', () => {
    expect(bannerUpdate({})).toEqual({ key: SETTING_KEYS.homeBanner, value: BANNER });
  });

  it('R4: o corpo do PATCH /:key exige o value', () => {
    expect(fieldsOf(() => settingValueBodySchema.parse({}))).toEqual(['value']);
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

  it('R12: a imagem do banner e o verso só aceitam endereço http ou https', () => {
    expect(bannerUpdate({ imageUrl: 'http://localhost:3000/uploads/b.png' }).value).toMatchObject({
      imageUrl: 'http://localhost:3000/uploads/b.png',
    });
    expect(fieldsOf(() => bannerUpdate({ imageUrl: 'javascript:alert(1)' }))).toEqual([
      'value.imageUrl',
    ]);
    expect(fieldsOf(() => backsUpdate('data:image/png;base64,AAAA'))).toEqual([
      'categories.0.backImageUrl',
    ]);
  });

  it('CA7: aceita {campo} no template e recusa dois templates com o mesmo nome', () => {
    expect(templatesUpdate([TEMPLATE]).value).toEqual([TEMPLATE]);
    expect(
      fieldsOf(() => templatesUpdate([TEMPLATE, { ...TEMPLATE, name: 'NOVO ÁLBUM DISPONÍVEL' }])),
    ).toEqual(['value.1.name']);
  });

  it('R11: recusa dois templates com o mesmo id', () => {
    const templateId = '0190f3a4-0000-7000-8000-000000000701';

    expect(
      fieldsOf(() =>
        templatesUpdate([
          { ...TEMPLATE, id: templateId },
          { ...TEMPLATE, name: 'Outro nome', id: templateId },
        ]),
      ),
    ).toEqual(['value.1.id']);
  });

  it('R11: recusa título acima de 120 e texto acima de 500 caracteres', () => {
    const tooLong = { ...TEMPLATE, title: 'x'.repeat(121), content: 'x'.repeat(501) };

    expect(fieldsOf(() => templatesUpdate([tooLong]))).toEqual([
      'value.0.title',
      'value.0.content',
    ]);
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
    expect(
      fieldsOf(() =>
        defaultCategoriesBodySchema.parse({
          categories: [
            { id: CATEGORY_ID, backImageUrl: null },
            { id: CATEGORY_ID, backImageUrl: 'verso.png' },
          ],
        }),
      ),
    ).toEqual(['categories.1.backImageUrl', 'categories']);
  });

  it('CCD104 CA8: aceita uma categoria fixada e recusa duas, no campo categories', () => {
    const otherId = '0190f3a4-0000-7000-8000-000000000102';
    const pinned = (...ids: string[]) =>
      defaultCategoriesBodySchema.parse({
        categories: ids.map((id) => ({ id, backImageUrl: null, isPinned: true })),
      });

    expect(pinned(CATEGORY_ID).categories).toEqual([
      { id: CATEGORY_ID, backImageUrl: null, isPinned: true },
    ]);
    expect(fieldsOf(() => pinned(CATEGORY_ID, otherId))).toEqual(['categories']);
    expect(() => pinned(CATEGORY_ID, otherId)).toThrow('Só uma categoria pode ser fixada no topo');
  });

  it('CCD104 R5: o isPinned é opcional e uma lista sem nenhum fixado vale', () => {
    expect(backsUpdate(null).categories[0]).not.toHaveProperty('isPinned');
  });
});
