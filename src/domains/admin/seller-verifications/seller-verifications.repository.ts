import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import type { SellerDocumentStatus, SellerVerificationStatus } from '@/generated/prisma/enums';
import type { Transaction } from '@/lib/transaction';
import { toSkipTake } from '@/shared/utils/pagination';
import { notDeleted } from '@/shared/utils/soft-delete';
import type { DateRange } from '@/shared/utils/time-zone';

import type { ListSellerVerificationsQuery } from './seller-verifications.validator';

const sellerSummarySelect = {
  id: true,
  name: true,
  email: true,
} satisfies Prisma.UserSelect;

const listItemSelect = {
  id: true,
  status: true,
  legalName: true,
  cnpj: true,
  createdAt: true,
  seller: { select: sellerSummarySelect },
} satisfies Prisma.SellerVerificationSelect;

export type SellerVerificationListItem = Prisma.SellerVerificationGetPayload<{
  select: typeof listItemSelect;
}>;

const documentSelect = {
  id: true,
  type: true,
  fileUrl: true,
  fileSize: true,
  status: true,
  validatedAt: true,
  validatedById: true,
  createdAt: true,
} satisfies Prisma.SellerDocumentSelect;

export type SellerDocumentItem = Prisma.SellerDocumentGetPayload<{ select: typeof documentSelect }>;

const noteSelect = {
  id: true,
  content: true,
  createdAt: true,
  author: { select: { id: true, name: true } },
} satisfies Prisma.SellerVerificationNoteSelect;

export type SellerVerificationNoteItem = Prisma.SellerVerificationNoteGetPayload<{
  select: typeof noteSelect;
}>;

const detailSelect = {
  id: true,
  status: true,
  legalName: true,
  tradeName: true,
  cnpj: true,
  stateRegistration: true,
  openingDate: true,
  companySize: true,
  cnae: true,
  responsibleName: true,
  responsibleCpf: true,
  responsiblePhone: true,
  bankName: true,
  bankBranch: true,
  bankAccount: true,
  pixKey: true,
  rejectionReason: true,
  reviewedAt: true,
  createdAt: true,
  seller: { select: sellerSummarySelect },
  documents: { where: notDeleted, select: documentSelect, orderBy: { createdAt: 'asc' } },
  notes: { where: notDeleted, select: noteSelect, orderBy: { createdAt: 'desc' } },
} satisfies Prisma.SellerVerificationSelect;

export type SellerVerificationDetail = Prisma.SellerVerificationGetPayload<{
  select: typeof detailSelect;
}>;

export interface SellerVerificationsPage {
  items: SellerVerificationListItem[];
  total: number;
}

export interface StatusCounts {
  underReview: number;
  pending: number;
  approved: number;
  rejected: number;
}

export interface DecisionUpdate {
  status: SellerVerificationStatus;
  reviewedById: string;
  rejectionReason?: string;
}

export interface SellerVerificationsRepository {
  findPage(query: ListSellerVerificationsQuery): Promise<SellerVerificationsPage>;
  findById(id: string): Promise<{ id: string; status: SellerVerificationStatus } | null>;
  findDetailById(id: string): Promise<SellerVerificationDetail | null>;
  countByStatusWithin(range: DateRange): Promise<StatusCounts>;
  findDocumentById(
    sellerVerificationId: string,
    documentId: string,
  ): Promise<{ id: string; status: SellerDocumentStatus } | null>;
  validateDocument(documentId: string, validatedById: string, tx: Transaction): Promise<void>;
  addNote(sellerVerificationId: string, authorId: string, content: string): Promise<void>;
  updateDecision(id: string, update: DecisionUpdate, tx: Transaction): Promise<void>;
}

function buildWhere(status?: SellerVerificationStatus): Prisma.SellerVerificationWhereInput {
  return { ...notDeleted, ...(status && { status }) };
}

export class PrismaSellerVerificationsRepository implements SellerVerificationsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findPage({
    status,
    ...pagination
  }: ListSellerVerificationsQuery): Promise<SellerVerificationsPage> {
    const where = buildWhere(status);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.sellerVerification.findMany({
        where,
        select: listItemSelect,
        orderBy: { createdAt: 'desc' },
        ...toSkipTake(pagination),
      }),
      this.prisma.sellerVerification.count({ where }),
    ]);

    return { items, total };
  }

  findById(id: string): Promise<{ id: string; status: SellerVerificationStatus } | null> {
    return this.prisma.sellerVerification.findFirst({
      where: { id, ...notDeleted },
      select: { id: true, status: true },
    });
  }

  findDetailById(id: string): Promise<SellerVerificationDetail | null> {
    return this.prisma.sellerVerification.findFirst({
      where: { id, ...notDeleted },
      select: detailSelect,
    });
  }

  async countByStatusWithin({ from, to }: DateRange): Promise<StatusCounts> {
    const where = { ...notDeleted, createdAt: { gte: from, lte: to } };
    const [underReview, pending, approved, rejected] = await this.prisma.$transaction([
      this.prisma.sellerVerification.count({ where: { ...where, status: 'UNDER_REVIEW' } }),
      this.prisma.sellerVerification.count({ where: { ...where, status: 'PENDING' } }),
      this.prisma.sellerVerification.count({ where: { ...where, status: 'APPROVED' } }),
      this.prisma.sellerVerification.count({ where: { ...where, status: 'REJECTED' } }),
    ]);
    return { underReview, pending, approved, rejected };
  }

  findDocumentById(
    sellerVerificationId: string,
    documentId: string,
  ): Promise<{ id: string; status: SellerDocumentStatus } | null> {
    return this.prisma.sellerDocument.findFirst({
      where: { id: documentId, sellerVerificationId, ...notDeleted },
      select: { id: true, status: true },
    });
  }

  async validateDocument(
    documentId: string,
    validatedById: string,
    tx: Transaction,
  ): Promise<void> {
    await tx.sellerDocument.update({
      where: { id: documentId },
      data: { status: 'VALIDATED', validatedById, validatedAt: new Date() },
    });
  }

  async addNote(sellerVerificationId: string, authorId: string, content: string): Promise<void> {
    await this.prisma.sellerVerificationNote.create({
      data: { sellerVerificationId, authorId, content },
    });
  }

  async updateDecision(
    id: string,
    { status, reviewedById, rejectionReason }: DecisionUpdate,
    tx: Transaction,
  ): Promise<void> {
    await tx.sellerVerification.update({
      where: { id },
      data: { status, reviewedById, reviewedAt: new Date(), rejectionReason },
    });
  }
}
