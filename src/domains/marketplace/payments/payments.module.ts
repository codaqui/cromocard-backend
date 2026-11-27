import { env } from '@/config/env';
import { prisma } from '@/lib/prisma';
import { createPaymentProvider } from '@/providers/payment/payment.factory';
import type { DomainModule } from '@/shared/types/domain-module';

import { ConnectedAccountsController } from './connected-accounts.controller';
import { PrismaConnectedAccountsRepository } from './connected-accounts.repository';
import { createConnectedAccountsRoutes } from './connected-accounts.routes';
import { ConnectedAccountsService } from './connected-accounts.service';
import { registerConnectedAccountsDocs } from './connected-accounts.swagger';
import { PaymentsWebhookController } from './payments-webhook.controller';
import { createPaymentsWebhookRoutes, PAYMENTS_BASE_PATH } from './payments-webhook.routes';
import { PaymentsWebhookService } from './payments-webhook.service';
import { registerPaymentsWebhookDocs } from './payments-webhook.swagger';

export const paymentProvider = createPaymentProvider();

export const connectedAccountsService = new ConnectedAccountsService({
  repository: new PrismaConnectedAccountsRepository(prisma),
  provider: paymentProvider,
  urls: {
    returnUrl: `${env.FRONTEND_URL}/vendedor/stripe/retorno`,
    refreshUrl: `${env.FRONTEND_URL}/vendedor/stripe/renovar`,
  },
});

export const connectedAccountsModule: DomainModule = {
  basePath: '/me/stripe-account',
  router: createConnectedAccountsRoutes(new ConnectedAccountsController(connectedAccountsService)),
  registerDocs: registerConnectedAccountsDocs,
};

const webhookService = new PaymentsWebhookService({
  provider: paymentProvider,
  connectedAccounts: connectedAccountsService,
});

export const paymentsWebhookModule: DomainModule = {
  basePath: PAYMENTS_BASE_PATH,
  router: createPaymentsWebhookRoutes(new PaymentsWebhookController(webhookService)),
  registerDocs: registerPaymentsWebhookDocs,
};
