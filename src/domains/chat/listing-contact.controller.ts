import type { Request, Response } from 'express';

import { getAuthenticatedUser } from '@/shared/middlewares/authenticate';
import { created, ok } from '@/shared/utils/http-response';

import type { ListingContactService } from './listing-contact.service';
import { listingIdParamSchema } from './listing-contact.validator';

export class ListingContactController {
  constructor(private readonly service: ListingContactService) {}

  contact = async (req: Request, res: Response): Promise<void> => {
    const { id } = listingIdParamSchema.parse(req.params);
    const result = await this.service.contactSeller(getAuthenticatedUser(req).id, id);
    (result.created ? created : ok)(res, result);
  };
}
