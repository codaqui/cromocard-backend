import { prisma } from '@/lib/prisma';

import { ContactModerationRepository } from './contact-moderation.repository';
import { ContactReportResolutionService } from './contact-report-resolution.service';

export const contactReportResolution = new ContactReportResolutionService(
  new ContactModerationRepository(prisma),
);
