import type { ChatRepository } from './chat.repository';
import type { ContactsRepository } from './contacts.repository';
import {
  ContactBlockedByYouError,
  ListingNotFoundError,
  ListingUnavailableError,
  OwnListingError,
  SellerUnavailableError,
} from './listing-contact.errors';
import type { ContactListing, ListingContactRepository } from './listing-contact.repository';

export interface ListingContactDeps {
  listings: Pick<ListingContactRepository, 'findListing' | 'hasBlocked'>;
  contacts: Pick<ContactsRepository, 'isReachable'>;
  conversations: Pick<ChatRepository, 'findDirectConversationId' | 'createDirectConversation'>;
}

export interface ListingContact {
  conversationId: string;
  created: boolean;
}

export class ListingContactService {
  constructor(private readonly deps: ListingContactDeps) {}

  async contactSeller(userId: string, listingId: string): Promise<ListingContact> {
    const { sellerId } = this.ensureContactable(
      await this.deps.listings.findListing(listingId),
      userId,
    );
    await this.ensureSellerReachable(userId, sellerId);
    const existing = await this.deps.conversations.findDirectConversationId(userId, sellerId);
    if (existing) return { conversationId: existing, created: false };
    const conversationId = await this.deps.conversations.createDirectConversation(userId, sellerId);
    return { conversationId, created: true };
  }

  private ensureContactable(listing: ContactListing | null, userId: string): ContactListing {
    if (!listing) throw new ListingNotFoundError();
    if (listing.sellerId === userId) throw new OwnListingError();
    if (listing.status !== 'ACTIVE') throw new ListingUnavailableError();
    return listing;
  }

  private async ensureSellerReachable(userId: string, sellerId: string): Promise<void> {
    if (await this.deps.listings.hasBlocked(userId, sellerId)) throw new ContactBlockedByYouError();
    if (!(await this.deps.contacts.isReachable(userId, sellerId)))
      throw new SellerUnavailableError();
  }
}
