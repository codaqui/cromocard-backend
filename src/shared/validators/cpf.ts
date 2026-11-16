const CPF_LENGTH = 11;

function checkDigit(digits: number[], length: number): number {
  const sum = digits
    .slice(0, length)
    .reduce((acc, digit, index) => acc + digit * (length + 1 - index), 0);
  const remainder = (sum * 10) % 11;
  return remainder === 10 ? 0 : remainder;
}

export function normalizeCpf(raw: string): string {
  return raw.replace(/\D/g, '');
}

export function isValidCpf(raw: string): boolean {
  const cpf = normalizeCpf(raw);
  if (cpf.length !== CPF_LENGTH || /^(\d)\1{10}$/.test(cpf)) return false;

  const digits = cpf.split('').map(Number);
  return checkDigit(digits, 9) === digits[9] && checkDigit(digits, 10) === digits[10];
}
