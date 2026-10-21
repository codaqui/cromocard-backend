import { describe, it } from 'vitest';

describe('UploadsService', () => {
  it.todo('salva a imagem pelo StorageProvider na pasta informada e devolve { key, url }');
  it.todo('lança MissingFileError quando nenhum arquivo é enviado');
  it.todo('lança InvalidFileTypeError para formatos fora de PNG, JPG e WEBP');
  it.todo('lança FileTooLargeError para arquivos acima de 4 MB');
});
