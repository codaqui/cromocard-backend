import { describe, expect, it } from 'vitest';

import { PresenceRegistry } from './presence.registry';

describe('PresenceRegistry (R15)', () => {
  it('CA15: fica online no primeiro socket e offline só ao fechar o último', () => {
    const presence = new PresenceRegistry();

    expect(presence.connect('elisa')).toBe(true);
    expect(presence.connect('elisa')).toBe(false);
    expect(presence.disconnect('elisa')).toBe(false);
    expect(presence.onlineAmong(['elisa', 'thiago'])).toEqual(['elisa']);
    expect(presence.disconnect('elisa')).toBe(true);
    expect(presence.onlineAmong(['elisa'])).toEqual([]);
  });

  it('ignora a desconexão de quem não estava conectado', () => {
    expect(new PresenceRegistry().disconnect('ninguem')).toBe(false);
  });
});
