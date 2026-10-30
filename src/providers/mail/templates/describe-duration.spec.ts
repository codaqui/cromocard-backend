import { describe, expect, it } from 'vitest';

import { describeDuration } from './describe-duration';

describe('describeDuration', () => {
  it.each([
    [3600, '1 hora'],
    [86400, '24 horas'],
    [1800, '30 minutos'],
    [60, '1 minuto'],
  ])('%i segundos viram "%s"', (seconds, text) => {
    expect(describeDuration(seconds)).toBe(text);
  });
});
