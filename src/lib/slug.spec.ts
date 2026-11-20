import { describe, expect, it } from 'vitest';

import { slugify } from './slug';

describe('slugify', () => {
  it.each([
    ['Pokémon TCG', 'pokemon-tcg'],
    ['Pokemon TCG', 'pokemon-tcg'],
    ['Yu-Gi-Oh!', 'yu-gi-oh'],
    ['Magic: The Gathering', 'magic-the-gathering'],
    ['  Copa   do Mundo  ', 'copa-do-mundo'],
    ['Brasileirão 2026', 'brasileirao-2026'],
    ['Açaí & Cia', 'acai-cia'],
  ])('CA6: gera o slug de "%s" como "%s"', (name, slug) => {
    expect(slugify(name)).toBe(slug);
  });

  it('corta em 100 caracteres sem deixar hífen no fim', () => {
    const slug = slugify(`${'a'.repeat(99)} b`);

    expect(slug).toHaveLength(99);
    expect(slug.endsWith('-')).toBe(false);
  });

  it('devolve "categoria" quando o nome não tem nenhum caractere aproveitável', () => {
    expect(slugify('!!!')).toBe('categoria');
  });
});
