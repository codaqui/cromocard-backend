/** CEP só com os 8 dígitos, como as transportadoras recebem. */
export function digitsOfZipCode(zipCode: string): string {
  return zipCode.replace(/\D/g, '');
}
