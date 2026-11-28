export function digitsOfZipCode(zipCode: string): string {
  return zipCode.replace(/\D/g, '');
}
