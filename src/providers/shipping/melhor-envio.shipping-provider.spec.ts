import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  MelhorEnvioShippingProvider,
  SHIPPING_QUOTE_TIMEOUT_MS,
} from './melhor-envio.shipping-provider';
import { ShippingProviderError } from './shipping.errors';
import type { ShippingQuoteInput } from './shipping.provider';

const input: ShippingQuoteInput = {
  fromZipCode: '01310-100',
  toZipCode: '20040-020',
  package: { heightCm: 2, widthCm: 11, lengthCm: 16, weightKg: 0.1 },
  declaredValueInCents: 15000,
};

const calculateResponse = [
  {
    id: 1,
    name: 'PAC',
    price: '18.90',
    custom_price: '17.50',
    delivery_time: 9,
    custom_delivery_time: 8,
    company: { id: 1, name: 'Correios' },
  },
  { id: 2, name: 'SEDEX', price: '32.50', delivery_time: 3, company: { id: 1, name: 'Correios' } },
  { id: 3, name: '.Package', price: 21.4, delivery_time: 6, company: { id: 2, name: 'Jadlog' } },
  {
    id: 4,
    name: '.Com',
    error: 'Transportadora não atende este trecho.',
    company: { id: 2, name: 'Jadlog' },
  },
  {
    id: 17,
    name: 'Mini Envios',
    price: '9.00',
    delivery_time: 12,
    company: { id: 1, name: 'Correios' },
  },
  {
    id: 31,
    name: 'Expresso',
    price: '25.00',
    delivery_time: 4,
    company: { id: 9, name: 'Azul Cargo' },
  },
  { id: 33, name: 'Sem prazo', price: '25.00', company: { id: 2, name: 'Jadlog' } },
];

function providerReplying(reply: () => Promise<Response>) {
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(reply);
  const provider = new MelhorEnvioShippingProvider({
    baseUrl: 'https://sandbox.melhorenvio.com.br',
    token: 'token-teste',
    fetch,
  });
  return { provider, fetch };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('MelhorEnvioShippingProvider', () => {
  it('cota só Correios e Jadlog em centavos, sem os serviços com erro ou sem prazo, e prefere o preço e o prazo customizados', async () => {
    const { provider } = providerReplying(() => Promise.resolve(json(calculateResponse)));

    await expect(provider.quote(input)).resolves.toEqual([
      { serviceId: '1', carrier: 'Correios', service: 'PAC', priceInCents: 1750, deliveryDays: 8 },
      {
        serviceId: '2',
        carrier: 'Correios',
        service: 'SEDEX',
        priceInCents: 3250,
        deliveryDays: 3,
      },
      {
        serviceId: '3',
        carrier: 'Jadlog',
        service: '.Package',
        priceInCents: 2140,
        deliveryDays: 6,
      },
      {
        serviceId: '17',
        carrier: 'Correios',
        service: 'Mini Envios',
        priceInCents: 900,
        deliveryDays: 12,
      },
    ]);
  });

  it('chama o calculate com o token, os CEPs só com dígitos, a caixa, o valor declarado em reais e o tempo limite', async () => {
    const { provider, fetch } = providerReplying(() => Promise.resolve(json([])));

    await provider.quote(input);

    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe('https://sandbox.melhorenvio.com.br/api/v2/me/shipment/calculate');
    expect(init?.method).toBe('POST');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer token-teste',
      'User-Agent': 'CromoCard',
    });
    expect(JSON.parse(init?.body as string)).toEqual({
      from: { postal_code: '01310100' },
      to: { postal_code: '20040020' },
      package: { height: 2, width: 11, length: 16, weight: 0.1 },
      options: { insurance_value: 150, receipt: false, own_hand: false },
    });
  });

  describe('sem fetch injetado', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('chama o fetch global', async () => {
      const globalFetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(json([]));
      vi.stubGlobal('fetch', globalFetch);
      const provider = new MelhorEnvioShippingProvider({ baseUrl: 'https://x', token: 't' });

      await provider.quote(input);

      expect(globalFetch).toHaveBeenCalledWith(
        'https://x/api/v2/me/shipment/calculate',
        expect.anything(),
      );
    });
  });

  it.each([
    ['o preço vazio', { price: '' }],
    ['o preço que não é número', { price: 'abc' }],
  ])('descarta só o serviço com %s e mantém os outros', async (_case, broken) => {
    const sedex = {
      id: 2,
      name: 'SEDEX',
      price: '32.50',
      delivery_time: 3,
      company: { name: 'Correios' },
    };
    const { provider } = providerReplying(() =>
      Promise.resolve(json([{ ...sedex, id: 1, name: 'PAC', ...broken }, sedex])),
    );

    await expect(provider.quote(input)).resolves.toEqual([
      {
        serviceId: '2',
        carrier: 'Correios',
        service: 'SEDEX',
        priceInCents: 3250,
        deliveryDays: 3,
      },
    ]);
  });

  it.each<[string, () => Promise<Response>]>([
    ['a rede falha', () => Promise.reject(new TypeError('fetch failed'))],
    [
      'o Melhor Envio passa do tempo limite',
      () => Promise.reject(new DOMException(`${SHIPPING_QUOTE_TIMEOUT_MS} ms`, 'TimeoutError')),
    ],
    ['a API responde erro', () => Promise.resolve(json({ message: 'Unauthenticated.' }, 401))],
    ['o corpo não é JSON', () => Promise.resolve(new Response('<html>', { status: 200 }))],
    ['o formato muda', () => Promise.resolve(json({ data: [] }))],
  ])('lança SHIPPING_PROVIDER_ERROR quando %s', async (_case, reply) => {
    const { provider } = providerReplying(reply);

    await expect(provider.quote(input)).rejects.toBeInstanceOf(ShippingProviderError);
  });
});
