export class InvalidStorageKeyError extends Error {
  constructor(key: string) {
    super(`Chave de arquivo fora da pasta do storage: ${key}`);
    this.name = 'InvalidStorageKeyError';
  }
}
