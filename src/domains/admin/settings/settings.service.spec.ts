import { describe, it } from 'vitest';

describe('SettingsService', () => {
  describe('getHomeBanner', () => {
    it.todo('monta o banner a partir das chaves home.banner.* do global_settings');
    it.todo('retorna null quando o banner nunca foi configurado');
  });

  describe('updateHomeBanner', () => {
    it.todo('grava cada campo do banner como uma chave home.banner.*');
    it.todo('registra SETTINGS_UPDATED no log de auditoria com os valores antes e depois');
  });
});
