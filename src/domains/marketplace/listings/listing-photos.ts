export const LISTING_PHOTOS_FOLDER = 'listings';

export function createOwnListingPhotoPolicy(urlOf: (key: string) => string) {
  return (url: string, sellerId: string): boolean => {
    if (!URL.canParse(url)) return false;
    return new URL(url).href.startsWith(urlOf(`${LISTING_PHOTOS_FOLDER}/${sellerId}/`));
  };
}
