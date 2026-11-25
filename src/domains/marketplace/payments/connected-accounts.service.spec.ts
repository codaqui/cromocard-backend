import { beforeEach, describe, expect, it } from 'vitest';

import type { StripeAccountStatus } from '@/generated/prisma/enums';
import { PaymentProviderError } from '@/providers/payment/payment.errors';
import { FakePaymentProvider } from '@/providers/payment/fake.payment-provider';
import { UnauthorizedError } from '@/shared/errors/http-errors';

import {
  StripeAccountNotFoundError,
  StripeAccountNotReadyError,
} from './connected-accounts.errors';
import type { ConnectedAccountsRepository, SellerAccount } from './connected-accounts.repository';
import { ConnectedAccountsService } from './connected-accounts.service';

const SELLER = 'vendedor-1';
const urls = {
  returnUrl: 'http://localhost:5173/vendedor/stripe/retorno',
  refreshUrl: 'http://localhost:5173/vendedor/stripe/renovar',
};

class InMemoryAccounts implements ConnectedAccountsRepository {
  readonly sellers = new Map<string, SellerAccount>();

  findSeller(sellerId: string) {
    return Promise.resolve(this.sellers.get(sellerId) ?? null);
  }

  linkAccount(sellerId: string, stripeAccountId: string) {
    this.patch(sellerId, { stripeAccountId, stripeAccountStatus: 'PENDING' });
    return Promise.resolve();
  }

  saveStatus(sellerId: string, stripeAccountStatus: StripeAccountStatus) {
    this.patch(sellerId, { stripeAccountStatus });
    return Promise.resolve();
  }

  saveStatusByAccount(stripeAccountId: string, stripeAccountStatus: StripeAccountStatus) {
    const owners = [...this.sellers.entries()].filter(
      ([, seller]) => seller.stripeAccountId === stripeAccountId,
    );
    owners.forEach(([id]) => this.patch(id, { stripeAccountStatus }));
    return Promise.resolve(owners.length);
  }

  private patch(sellerId: string, changes: Partial<SellerAccount>) {
    const seller = this.sellers.get(sellerId);
    if (seller) this.sellers.set(sellerId, { ...seller, ...changes });
  }
}

let repository: InMemoryAccounts;
let provider: FakePaymentProvider;
let service: ConnectedAccountsService;

function givenSeller(changes: Partial<SellerAccount> = {}) {
  repository.sellers.set(SELLER, {
    email: 'rodrigo@cromocard.dev',
    stripeAccountId: null,
    stripeAccountStatus: null,
    ...changes,
  });
}

beforeEach(() => {
  repository = new InMemoryAccounts();
  provider = new FakePaymentProvider();
  service = new ConnectedAccountsService({ repository, provider, urls });
});

describe('getAccount', () => {
  it('CA1: vendedor sem conta conectada vê NOT_CONNECTED', async () => {
    givenSeller();

    await expect(service.getAccount(SELLER)).resolves.toEqual({
      status: 'NOT_CONNECTED',
      pendingReason: null,
    });
  });

  it('CA3: conta em análise devolve VERIFYING sem consultar a Stripe', async () => {
    givenSeller({ stripeAccountId: 'acct_ausente', stripeAccountStatus: 'VERIFYING' });

    await expect(service.getAccount(SELLER)).resolves.toEqual({
      status: 'VERIFYING',
      pendingReason: null,
    });
  });

  it('CA7: conta pendente traz o motivo lido na Stripe', async () => {
    const { id } = await provider.createConnectedAccount();
    provider.updateAccount(id, { detailsSubmitted: true, requirementsDue: 2 });
    givenSeller({ stripeAccountId: id, stripeAccountStatus: 'PENDING' });

    await expect(service.getAccount(SELLER)).resolves.toEqual({
      status: 'PENDING',
      pendingReason: 'MORE_INFO_REQUIRED',
    });
  });

  it('conta pendente sem resposta da Stripe devolve o motivo nulo, sem erro', async () => {
    givenSeller({ stripeAccountId: 'acct_que_a_stripe_nao_acha', stripeAccountStatus: 'PENDING' });

    await expect(service.getAccount(SELLER)).resolves.toEqual({
      status: 'PENDING',
      pendingReason: null,
    });
  });

  it('recusa quem não existe mais', async () => {
    await expect(service.getAccount('excluido')).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe('createOnboardingLink', () => {
  it('CA2: cria a conta conectada, grava o id como PENDING e devolve o link de cadastro', async () => {
    givenSeller();

    await expect(service.createOnboardingLink(SELLER)).resolves.toEqual({ url: urls.returnUrl });
    expect(repository.sellers.get(SELLER)).toMatchObject({
      stripeAccountId: [...provider.accounts.keys()][0],
      stripeAccountStatus: 'PENDING',
    });
  });

  it('CA6: retoma o cadastro na mesma conta conectada, sem criar outra', async () => {
    givenSeller();
    await service.createOnboardingLink(SELLER);
    const first = repository.sellers.get(SELLER)?.stripeAccountId;

    await service.createOnboardingLink(SELLER);

    expect(provider.accounts.size).toBe(1);
    expect(repository.sellers.get(SELLER)?.stripeAccountId).toBe(first);
  });

  it('CA9: com a Stripe fora do ar, lança PAYMENT_PROVIDER_ERROR e não grava nada', async () => {
    givenSeller();
    provider.createConnectedAccount = () => Promise.reject(new PaymentProviderError());

    await expect(service.createOnboardingLink(SELLER)).rejects.toBeInstanceOf(PaymentProviderError);
    expect(repository.sellers.get(SELLER)?.stripeAccountId).toBeNull();
  });
});

describe('refresh', () => {
  it('CA3: na volta com o cadastro enviado, grava VERIFYING', async () => {
    givenSeller();
    await service.createOnboardingLink(SELLER);

    await expect(service.refresh(SELLER)).resolves.toEqual({
      status: 'VERIFYING',
      pendingReason: null,
    });
    expect(repository.sellers.get(SELLER)?.stripeAccountStatus).toBe('VERIFYING');
  });

  it('CA6: na volta sem terminar o cadastro, mantém PENDING com o motivo', async () => {
    const { id } = await provider.createConnectedAccount();
    givenSeller({ stripeAccountId: id, stripeAccountStatus: 'PENDING' });

    await expect(service.refresh(SELLER)).resolves.toEqual({
      status: 'PENDING',
      pendingReason: 'NOT_SUBMITTED',
    });
  });

  it('responde STRIPE_ACCOUNT_NOT_FOUND para quem ainda não conectou', async () => {
    givenSeller();

    await expect(service.refresh(SELLER)).rejects.toBeInstanceOf(StripeAccountNotFoundError);
  });
});

describe('applyAccountUpdate', () => {
  it('CA4: transferências liberadas marcam a conta READY', async () => {
    givenSeller({ stripeAccountId: 'acct_1', stripeAccountStatus: 'VERIFYING' });

    const applied = await service.applyAccountUpdate(
      provider.updateAccount('acct_1', { detailsSubmitted: true, transfersEnabled: true }),
    );

    expect(applied).toBe(true);
    expect(repository.sellers.get(SELLER)?.stripeAccountStatus).toBe('READY');
  });

  it('CA12: conta READY que perde as transferências volta a PENDING', async () => {
    givenSeller({ stripeAccountId: 'acct_1', stripeAccountStatus: 'READY' });

    await service.applyAccountUpdate(
      provider.updateAccount('acct_1', {
        detailsSubmitted: true,
        disabledReason: 'requirements.past_due',
      }),
    );

    expect(repository.sellers.get(SELLER)?.stripeAccountStatus).toBe('PENDING');
  });

  it('ignora a conta que não é de nenhum vendedor', async () => {
    givenSeller({ stripeAccountId: 'acct_1', stripeAccountStatus: 'VERIFYING' });

    await expect(
      service.applyAccountUpdate(provider.updateAccount('acct_outra', {})),
    ).resolves.toBe(false);
    expect(repository.sellers.get(SELLER)?.stripeAccountStatus).toBe('VERIFYING');
  });
});

describe('assertReady', () => {
  it('libera o vendedor com a conta READY', async () => {
    givenSeller({ stripeAccountId: 'acct_1', stripeAccountStatus: 'READY' });

    await expect(service.assertReady(SELLER)).resolves.toBeUndefined();
  });

  it.each<[string, Partial<SellerAccount>]>([
    ['sem conta', {}],
    ['pendente', { stripeAccountId: 'acct_1', stripeAccountStatus: 'PENDING' }],
    ['em verificação', { stripeAccountId: 'acct_1', stripeAccountStatus: 'VERIFYING' }],
  ])('CA7: recusa com 422 STRIPE_ACCOUNT_NOT_READY o vendedor %s', async (_case, account) => {
    givenSeller(account);

    await expect(service.assertReady(SELLER)).rejects.toBeInstanceOf(StripeAccountNotReadyError);
  });
});
