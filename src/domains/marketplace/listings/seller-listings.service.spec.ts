import { describe, expect, it, vi } from 'vitest';

import { Prisma } from '@/generated/prisma/client';

import {
  CardConditionNotFoundError,
  ForeignListingPhotoError,
  ListingCardNotFoundError,
  PrimaryAddressRequiredError,
  StripeAccountNotReadyError,
} from './seller-listings.errors';
import type {
  CreatedListing,
  NewListing,
  SellerAccount,
  SellerListingsRepository,
} from './seller-listings.repository';
import { SellerListingsService } from './seller-listings.service';
import { createListingSchema, INVALID_PRICE_MESSAGE } from './seller-listings.validator';

const SELLER_ID = '0190a000-0000-7000-8000-000000000001';
const CARD_ID = '0190a000-0000-7000-8000-000000000002';
const CONDITION_ID = '0190a000-0000-7000-8000-000000000003';
const STORAGE_URL = 'http://storage.test/uploads/listings/';

const readyAccount: SellerAccount = { stripeAccountStatus: 'READY', hasPrimaryAddress: true };

const validInput = {
  cardId: CARD_ID,
  conditionId: CONDITION_ID,
  price: '1850.00',
  availableQuantity: 1,
  description: 'Carta perfeita sem marcas',
  photoUrls: [`${STORAGE_URL}frente.png`, `${STORAGE_URL}verso.png`],
};

const persisted = (listing: NewListing): CreatedListing => ({
  id: '0190a000-0000-7000-8000-000000000009',
  status: 'ACTIVE',
  price: new Prisma.Decimal(listing.price),
  availableQuantity: listing.availableQuantity,
  description: listing.description ?? null,
  card: { id: listing.cardId, name: 'Charizard VMAX' },
  condition: { id: listing.conditionId, name: 'Mint' },
  photos: listing.photoUrls.map((url, sortOrder) => ({ url, sortOrder })),
});

function setup(
  account: SellerAccount = readyAccount,
  overrides: Partial<SellerListingsRepository> = {},
) {
  const create = vi.fn((listing: NewListing) => Promise.resolve(persisted(listing)));
  const repository: SellerListingsRepository = {
    findSellerAccount: vi.fn().mockResolvedValue(account),
    cardExists: vi.fn().mockResolvedValue(true),
    conditionExists: vi.fn().mockResolvedValue(true),
    create,
    ...overrides,
  };
  const isListingPhotoUrl = (url: string) => url.startsWith(STORAGE_URL);
  return { service: new SellerListingsService({ repository, isListingPhotoUrl }), create };
}

const createWith = (service: SellerListingsService, input: unknown) =>
  service.create(SELLER_ID, createListingSchema.parse(input));

describe('SellerListingsService.create', () => {
  it('CA1: grava o anúncio ativo do vendedor e devolve a taxa e o líquido', async () => {
    const { service, create } = setup();

    const listing = await createWith(service, validInput);

    expect(create).toHaveBeenCalledWith({ ...validInput, sellerId: SELLER_ID });
    expect(listing).toMatchObject({
      status: 'ACTIVE',
      price: '1850.00',
      platformFee: '92.50',
      netAmount: '1757.50',
      condition: { name: 'Mint' },
    });
  });

  it('CA5: grava as fotos na ordem enviada; sem fotos, grava o anúncio sem foto', async () => {
    const { service } = setup();

    const withPhotos = await createWith(service, validInput);
    const withoutPhotos = await createWith(service, { ...validInput, photoUrls: undefined });

    expect(withPhotos.photos).toEqual([
      { url: `${STORAGE_URL}frente.png`, sortOrder: 0 },
      { url: `${STORAGE_URL}verso.png`, sortOrder: 1 },
    ]);
    expect(withoutPhotos.photos).toEqual([]);
  });

  it('CA7: recusa o vendedor sem conta de recebimento pronta, sem gravar', async () => {
    const { service, create } = setup({
      stripeAccountStatus: 'VERIFYING',
      hasPrimaryAddress: true,
    });

    await expect(createWith(service, validInput)).rejects.toThrow(StripeAccountNotReadyError);
    expect(create).not.toHaveBeenCalled();
  });

  it('CA8: recusa o vendedor com conta pronta e sem endereço principal, sem gravar', async () => {
    const { service, create } = setup({ stripeAccountStatus: 'READY', hasPrimaryAddress: false });

    await expect(createWith(service, validInput)).rejects.toThrow(PrimaryAddressRequiredError);
    expect(create).not.toHaveBeenCalled();
  });

  it('confere a conta antes do endereço quando faltam os dois', async () => {
    const { service } = setup({ stripeAccountStatus: null, hasPrimaryAddress: false });

    await expect(createWith(service, validInput)).rejects.toThrow(StripeAccountNotReadyError);
  });

  it('CA3: recusa carta fora do catálogo com 404', async () => {
    const { service, create } = setup(readyAccount, {
      cardExists: vi.fn().mockResolvedValue(false),
    });

    await expect(createWith(service, validInput)).rejects.toThrow(ListingCardNotFoundError);
    expect(create).not.toHaveBeenCalled();
  });

  it('recusa condição inexistente com 404', async () => {
    const conditionExists = vi.fn().mockResolvedValue(false);
    const { service } = setup(readyAccount, { conditionExists });

    await expect(createWith(service, validInput)).rejects.toThrow(CardConditionNotFoundError);
  });

  it('recusa foto que não veio do upload do anúncio', async () => {
    const { service, create } = setup();
    const input = { ...validInput, photoUrls: ['https://outro-site.com/carta.png'] };

    await expect(createWith(service, input)).rejects.toThrow(ForeignListingPhotoError);
    expect(create).not.toHaveBeenCalled();
  });
});

describe('SellerListingsService.getEligibility', () => {
  it('só pode anunciar com a conta pronta e o endereço principal', async () => {
    await expect(setup().service.getEligibility(SELLER_ID)).resolves.toEqual({
      canCreate: true,
      stripeAccountReady: true,
      hasPrimaryAddress: true,
    });
    const pending = setup({ stripeAccountStatus: 'PENDING', hasPrimaryAddress: true });
    await expect(pending.service.getEligibility(SELLER_ID)).resolves.toMatchObject({
      canCreate: false,
      stripeAccountReady: false,
    });
  });
});

describe('createListingSchema', () => {
  const issuesOf = (input: unknown) =>
    createListingSchema.safeParse(input).error?.issues.map(({ path, message }) => ({
      field: path.join('.'),
      message,
    }));

  it('CA4: recusa preço zero ou negativo com a mensagem do caso de uso', () => {
    expect(issuesOf({ ...validInput, price: '0' })).toEqual([
      { field: 'price', message: INVALID_PRICE_MESSAGE },
    ]);
    expect(issuesOf({ ...validInput, price: '-10' })?.[0]?.message).toBe(INVALID_PRICE_MESSAGE);
    expect(issuesOf({ ...validInput, price: '10.999' })?.[0]?.field).toBe('price');
  });

  it('CA13: recusa sem condição e com quantidade 0 ou 100', () => {
    const withoutCondition = { ...validInput, conditionId: undefined };
    expect(issuesOf(withoutCondition)?.[0]?.field).toBe('conditionId');
    expect(issuesOf({ ...validInput, availableQuantity: 0 })?.[0]?.field).toBe('availableQuantity');
    expect(issuesOf({ ...validInput, availableQuantity: 100 })?.[0]?.field).toBe(
      'availableQuantity',
    );
    expect(issuesOf({ ...validInput, availableQuantity: 99 })).toBeUndefined();
  });

  it('CA6: recusa a quinta foto', () => {
    const photoUrls = Array.from({ length: 5 }, (_, index) => `${STORAGE_URL}${index}.png`);

    expect(issuesOf({ ...validInput, photoUrls })?.[0]?.field).toBe('photoUrls');
  });

  it('descrição é opcional e tem até 2000 caracteres', () => {
    const withoutDescription = { ...validInput, description: undefined };
    expect(createListingSchema.parse({ ...validInput, description: '   ' }).description).toBe(
      undefined,
    );
    expect(issuesOf(withoutDescription)).toBeUndefined();
    expect(issuesOf({ ...validInput, description: 'a'.repeat(2001) })?.[0]?.field).toBe(
      'description',
    );
  });
});
