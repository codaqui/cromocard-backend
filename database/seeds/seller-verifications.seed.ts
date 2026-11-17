import type { PrismaClient } from '@/generated/prisma/client';
import { SellerVerificationStatus } from '@/generated/prisma/enums';
import { z } from '@/lib/zod';

import { daysAgo, loadSeedData, seedKey } from './load-seed-data';
import { optional, SeedNamespace, seedId } from './seed-id';
import { userIdOf } from './users.seed';

const companyFieldsSchema = z.object({
  status: z.enum(SellerVerificationStatus),
  legalName: z.string().max(160),
  tradeName: z.string().max(160).optional(),
  cnpj: z.string().max(18),
  stateRegistration: z.string().max(30).optional(),
  companySize: z.string().max(40).optional(),
  cnae: z.string().max(120).optional(),
  responsibleName: z.string().max(120),
  responsibleCpf: z.string().max(14),
  responsiblePhone: z.string().max(20).optional(),
  bankName: z.string().max(80).optional(),
  bankBranch: z.string().max(10).optional(),
  bankAccount: z.string().max(20).optional(),
  pixKey: z.string().max(120).optional(),
  rejectionReason: z.string().max(255).optional(),
});

const sellerVerificationsSchema = z.array(
  companyFieldsSchema.extend({
    key: seedKey,
    seller: seedKey,
    reviewer: seedKey.optional(),
    openingDate: z.iso.date().optional(),
    createdDaysAgo: z.number().int().min(0),
    reviewedDaysAgo: z.number().int().min(0).optional(),
    address: z.object({
      zipCode: z.string().max(9),
      street: z.string().max(160),
      number: z.string().max(15),
      complement: z.string().max(60).optional(),
      neighborhood: z.string().max(90),
      city: z.string().max(90),
      state: z.string().length(2),
    }),
    documents: z.array(
      z.object({ type: z.string().max(60), validated: z.boolean().default(false) }),
    ),
  }),
);

type SeedVerification = z.infer<typeof sellerVerificationsSchema>[number];
type SeedDocument = SeedVerification['documents'][number];

const sellerVerifications = loadSeedData('seller-verifications.json', sellerVerificationsSchema);

const SAMPLE_DOCUMENT_SIZE_IN_BYTES = 240_000;

const toAddressData = ({ key, seller, address }: SeedVerification) => ({
  ...address,
  id: seedId(SeedNamespace.addresses, key),
  userId: userIdOf(seller),
  label: 'Endereço comercial',
});

function toVerificationData(verification: SeedVerification) {
  const { key, seller, reviewer, openingDate, createdDaysAgo, reviewedDaysAgo } = verification;

  return {
    ...companyFieldsSchema.parse(verification),
    id: seedId(SeedNamespace.sellerVerifications, key),
    userId: userIdOf(seller),
    reviewedById: optional(userIdOf)(reviewer),
    addressId: seedId(SeedNamespace.addresses, key),
    openingDate: openingDate ? new Date(openingDate) : undefined,
    createdAt: daysAgo(createdDaysAgo),
    reviewedAt: reviewedDaysAgo === undefined ? undefined : daysAgo(reviewedDaysAgo),
  };
}

function toDocumentData(verification: SeedVerification, { type, validated }: SeedDocument) {
  const validator = verification.reviewer ?? 'admin';

  return {
    id: seedId(SeedNamespace.sellerDocuments, `${verification.key}-${type}`),
    sellerVerificationId: seedId(SeedNamespace.sellerVerifications, verification.key),
    type,
    fileUrl: `https://files.cromocard.dev/seed/${verification.key}/${type.toLowerCase()}.pdf`,
    fileSize: SAMPLE_DOCUMENT_SIZE_IN_BYTES,
    status: validated ? ('VALIDATED' as const) : ('SUBMITTED' as const),
    validatedById: validated ? userIdOf(validator) : undefined,
    validatedAt: validated ? daysAgo(verification.createdDaysAgo - 1) : undefined,
    createdAt: daysAgo(verification.createdDaysAgo),
  };
}

async function seedVerification(prisma: PrismaClient, verification: SeedVerification) {
  const address = toAddressData(verification);
  await prisma.address.upsert({ where: { id: address.id }, create: address, update: address });

  const data = toVerificationData(verification);
  await prisma.sellerVerification.upsert({ where: { id: data.id }, create: data, update: data });

  for (const document of verification.documents.map((doc) => toDocumentData(verification, doc))) {
    await prisma.sellerDocument.upsert({
      where: { id: document.id },
      create: document,
      update: document,
    });
  }
}

export async function seedSellerVerifications(prisma: PrismaClient): Promise<void> {
  for (const verification of sellerVerifications) {
    await seedVerification(prisma, verification);
  }
}
