const MAX_LENGTH = 100;
const FALLBACK = 'categoria';

/**
 * Gera o slug de uma categoria a partir do nome: sem acentos, em minúsculas, só `a-z0-9` e hífens
 * únicos, com até 100 caracteres. Nome sem nenhum caractere aproveitável (ex.: "!!!") vira `categoria`.
 * A migration `add_display_fields_to_categories_table` repete esta regra em SQL.
 */
export function slugify(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_LENGTH)
    .replace(/-+$/g, '');

  return slug || FALLBACK;
}
