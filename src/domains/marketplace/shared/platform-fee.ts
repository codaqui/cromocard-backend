const PLATFORM_FEE_PERCENT = 5n;
const PERCENT_BASE = 100n;
const CENTS_PER_REAL = 100n;
const DECIMAL_AMOUNT = /^(\d+)(?:\.(\d{1,2}))?$/;

export interface PlatformFeeBreakdown {
  platformFee: string;
  netAmount: string;
}

export function toCents(amount: string): bigint {
  const match = DECIMAL_AMOUNT.exec(amount);
  if (!match) throw new RangeError(`Valor monetário inválido: ${amount}`);
  const [, reais = '0', cents = ''] = match;
  return BigInt(reais) * CENTS_PER_REAL + BigInt(cents.padEnd(2, '0'));
}

export function fromCents(cents: bigint): string {
  const reais = cents / CENTS_PER_REAL;
  const remainder = (cents % CENTS_PER_REAL).toString().padStart(2, '0');
  return `${reais}.${remainder}`;
}

export function platformFeeOf(priceCents: bigint): bigint {
  return (priceCents * PLATFORM_FEE_PERCENT) / PERCENT_BASE;
}

export function calculatePlatformFee(price: string): PlatformFeeBreakdown {
  const priceCents = toCents(price);
  const feeCents = platformFeeOf(priceCents);
  return { platformFee: fromCents(feeCents), netAmount: fromCents(priceCents - feeCents) };
}
