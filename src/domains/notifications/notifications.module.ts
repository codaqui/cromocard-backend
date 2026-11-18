import { prisma } from '@/lib/prisma';

import { PrismaNotificationsRepository } from './notifications.repository';
import { NotificationsService } from './notifications.service';

const notificationsRepository = new PrismaNotificationsRepository(prisma);

export const notificationsService = new NotificationsService(notificationsRepository);
