import { describe, expect, it } from 'vitest';

import { checklistFileName, toChecklistCsv } from './catalog-requests.checklist';

describe('toChecklistCsv', () => {
  it('CA6: traz o cabeçalho e uma linha por carta, separadas por ponto e vírgula', () => {
    const csv = toChecklistCsv([
      {
        number: '001',
        code: 'OP06-001',
        name: 'Yamato',
        rarity: 'Rara',
        variants: 'Textured Foil',
      },
      {
        number: '022',
        code: 'OP06-022',
        name: 'Roronoa Zoro',
        rarity: 'Lendária',
        variants: 'Manga',
      },
    ]);

    expect(csv).toBe(
      '﻿Nº;Código;Nome da carta;Raridade;Variantes\r\n' +
        '001;OP06-001;Yamato;Rara;Textured Foil\r\n' +
        '022;OP06-022;Roronoa Zoro;Lendária;Manga\r\n',
    );
  });

  it('põe aspas no valor com separador ou aspas e deixa vazio o que falta', () => {
    const csv = toChecklistCsv([{ number: 7, name: 'Sanji "Black Leg"; Raid', rarity: undefined }]);

    expect(csv.split('\r\n')[1]).toBe('7;;"Sanji ""Black Leg""; Raid";;');
  });

  it.each([
    ['=1+1', "'=1+1"],
    ['+x', "'+x"],
    ['-x', "'-x"],
    ['@SUM(A1)', "'@SUM(A1)"],
    ['=HYPERLINK("http://x")', `"'=HYPERLINK(""http://x"")"`],
  ])('neutraliza a fórmula %s para o Excel não executar', (name, expected) => {
    const csv = toChecklistCsv([{ number: 1, name }]);

    expect(csv.split('\r\n')[1]).toBe(`1;;${expected};;`);
  });

  it('não mexe em números negativos nem em texto com sinal no meio', () => {
    const csv = toChecklistCsv([{ number: -5, name: 'Zoro +1' }]);

    expect(csv.split('\r\n')[1]).toBe('-5;;Zoro +1;;');
  });
});

describe('checklistFileName', () => {
  it('usa o protocolo da solicitação no nome do arquivo', () => {
    expect(checklistFileName('0199a000-0000-7000-8000-0000000088a2')).toBe(
      'checklist-SOL-88A2.csv',
    );
  });
});
