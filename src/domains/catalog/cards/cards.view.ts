import type { CardListingsSummary } from '@/domains/marketplace/listings/listings.module';
import type { Prisma } from '@/generated/prisma/client';

import type { PublicCardRecord } from './cards.repository';

interface Named {
  id: string;
  name: string;
}

export interface CardProfile {
  id: string;
  name: string;
  images: { front: string | null; back: string | null; photos: string[] };
  breadcrumb: { category: Named | null };
  identification: {
    number: string | null;
    album: { id: string; title: string } | null;
    category: Named | null;
    rarity: Named | null;
    language: Named | null;
  };
  market: { averagePrice: string | null } & CardListingsSummary;
}

function categoryOf({ category }: PublicCardRecord): Named | null {
  if (!category) return null;
  return { id: category.id, name: category.name };
}

function breadcrumbCategoryOf(card: PublicCardRecord): Named | null {
  return card.category?.parentCategory ?? categoryOf(card);
}

export function toCardProfile(
  card: PublicCardRecord,
  averagePrice: Prisma.Decimal | null,
  listings: CardListingsSummary,
): CardProfile {
  return {
    id: card.id,
    name: card.name,
    images: {
      front: card.frontImageUrl,
      back: card.backImageUrl,
      photos: card.photos.map(({ url }) => url),
    },
    breadcrumb: { category: breadcrumbCategoryOf(card) },
    identification: {
      number: card.number,
      album: card.album,
      category: categoryOf(card),
      rarity: card.rarity,
      language: card.language,
    },
    market: { averagePrice: averagePrice ? averagePrice.toFixed(2) : null, ...listings },
  };
}
