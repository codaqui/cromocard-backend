import { describe, expect, it } from 'vitest';

import { categoryOf, eventOf, typesIn } from './notification-types';

describe('notification-types', () => {
  it.each([
    { type: 'NEW_MESSAGE', category: 'MESSAGES', event: 'DIRECT_MESSAGES' },
    { type: 'CATALOG_REQUEST', category: 'PLATFORM', event: 'CATALOG_REQUESTS' },
    { type: 'GLOBAL', category: 'PLATFORM', event: undefined },
    { type: 'SELLER_REVIEW', category: 'PLATFORM', event: undefined },
    { type: 'USER_WARNED', category: 'PLATFORM', event: undefined },
  ])('$type pertence a $category', ({ type, category, event }) => {
    expect(categoryOf(type)).toBe(category);
    expect(eventOf(type)).toBe(event);
  });

  it('tipo desconhecido gravado antes do enum cai em avisos da plataforma, sem evento', () => {
    expect(categoryOf('ANTIGO')).toBe('PLATFORM');
    expect(eventOf('ANTIGO')).toBeUndefined();
  });

  it('lista os tipos de cada categoria', () => {
    expect(typesIn('MESSAGES')).toEqual(['NEW_MESSAGE']);
    expect(typesIn('ORDERS')).toEqual([]);
    expect(typesIn('PLATFORM')).toContain('GLOBAL');
  });
});
