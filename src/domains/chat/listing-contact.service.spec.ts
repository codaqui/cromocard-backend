import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ContactBlockedByYouError,
  ListingNotFoundError,
  ListingUnavailableError,
  OwnListingError,
  SellerUnavailableError,
} from './listing-contact.errors';
import type { ContactListing } from './listing-contact.repository';
import { ListingContactService } from './listing-contact.service';

const GABRIEL = 'gabriel';
const TIAGO = 'tiago';
const LISTING = 'anuncio-messi';

const listings = { findListing: vi.fn(), hasBlocked: vi.fn() };
const contacts = { isReachable: vi.fn() };
const conversations = { findDirectConversationId: vi.fn(), createDirectConversation: vi.fn() };
const service = new ListingContactService({ listings, contacts, conversations });

const activeListing = (changes: Partial<ContactListing> = {}): ContactListing => ({
  sellerId: TIAGO,
  status: 'ACTIVE',
  ...changes,
});

describe('ListingContactService.contactSeller', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    listings.findListing.mockResolvedValue(activeListing());
    listings.hasBlocked.mockResolvedValue(false);
    contacts.isReachable.mockResolvedValue(true);
    conversations.findDirectConversationId.mockResolvedValue(null);
    conversations.createDirectConversation.mockResolvedValue('conversa-nova');
  });

  it('CA1: cria a conversa direta com o vendedor do anúncio', async () => {
    await expect(service.contactSeller(GABRIEL, LISTING)).resolves.toEqual({
      conversationId: 'conversa-nova',
      created: true,
    });
    expect(listings.findListing).toHaveBeenCalledWith(LISTING);
    expect(conversations.createDirectConversation).toHaveBeenCalledWith(GABRIEL, TIAGO);
  });

  it('CA2: abre a conversa que já existe entre os dois, sem criar outra', async () => {
    conversations.findDirectConversationId.mockResolvedValue('conversa-antiga');

    await expect(service.contactSeller(GABRIEL, LISTING)).resolves.toEqual({
      conversationId: 'conversa-antiga',
      created: false,
    });
    expect(conversations.findDirectConversationId).toHaveBeenCalledWith(GABRIEL, TIAGO);
    expect(conversations.createDirectConversation).not.toHaveBeenCalled();
  });

  it('CA3: recusa o vendedor indisponível ou que bloqueou o cliente, sem criar nada', async () => {
    contacts.isReachable.mockResolvedValue(false);

    await expect(service.contactSeller(GABRIEL, LISTING)).rejects.toBeInstanceOf(
      SellerUnavailableError,
    );
    expect(contacts.isReachable).toHaveBeenCalledWith(GABRIEL, TIAGO);
    expect(conversations.createDirectConversation).not.toHaveBeenCalled();
  });

  it('CA4: recusa quando o cliente bloqueou o vendedor, antes de olhar a disponibilidade', async () => {
    listings.hasBlocked.mockResolvedValue(true);

    await expect(service.contactSeller(GABRIEL, LISTING)).rejects.toBeInstanceOf(
      ContactBlockedByYouError,
    );
    expect(listings.hasBlocked).toHaveBeenCalledWith(GABRIEL, TIAGO);
    expect(contacts.isReachable).not.toHaveBeenCalled();
    expect(conversations.createDirectConversation).not.toHaveBeenCalled();
  });

  it.each([
    ['inexistente ou excluído', null, ListingNotFoundError],
    ['do próprio cliente', activeListing({ sellerId: GABRIEL }), OwnListingError],
    ['pausado', activeListing({ status: 'PAUSED' }), ListingUnavailableError],
    ['encerrado', activeListing({ status: 'CLOSED' }), ListingUnavailableError],
  ])('CA5: recusa o anúncio %s, sem criar nada', async (_case, listing, error) => {
    listings.findListing.mockResolvedValue(listing);

    await expect(service.contactSeller(GABRIEL, LISTING)).rejects.toBeInstanceOf(error);
    expect(listings.hasBlocked).not.toHaveBeenCalled();
    expect(conversations.createDirectConversation).not.toHaveBeenCalled();
  });
});
