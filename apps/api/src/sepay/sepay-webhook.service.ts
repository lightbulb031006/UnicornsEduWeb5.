import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { MailService } from 'src/mail/mail.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { SePayWebhookDto } from './sepay-webhook.dto';

type SePayWebhookAction =
  | 'ignored_non_inbound'
  | 'duplicate'
  | 'unmatched'
  | 'amount_mismatch'
  | 'account_mismatch'
  | 'credited';

export interface SePayWebhookReconcileResult {
  action: SePayWebhookAction;
  orderCode?: string;
  walletTransactionId?: string;
}

type StudentWalletSepayOrderRecord = {
  orderCode: string;
  studentId: string;
  status: string;
  amountRequested?: number | null;
  amountReceived?: number | null;
  transferNote?: string | null;
  sepayTransactionId?: string | null;
  sepayReferenceCode?: string | null;
  walletTransactionId?: string | null;
  completedAt?: Date | null;
  receiptEmailSentAt?: Date | null;
  sepayAccountNumber?: string | null;
  parentEmail?: string | null;
  student?: {
    fullName?: string | null;
    parentName?: string | null;
    parentEmail?: string | null;
  } | null;
};

type StudentWalletSepayOrderDelegate = {
  create(args: unknown): Promise<StudentWalletSepayOrderRecord>;
  findFirst(args: unknown): Promise<StudentWalletSepayOrderRecord | null>;
  findUnique(args: unknown): Promise<StudentWalletSepayOrderRecord | null>;
  updateMany(args: unknown): Promise<{ count: number }>;
  update(args: unknown): Promise<StudentWalletSepayOrderRecord>;
};

type WalletTransactionsHistoryDelegate = {
  create(args: unknown): Promise<{ id: string }>;
};

type CustomerCareServiceDelegate = {
  findUnique(args: unknown): Promise<{
    staff?: {
      user?: {
        email?: string | null;
      } | null;
    } | null;
  } | null>;
};

type ClassDelegate = {
  findMany(args: unknown): Promise<Array<{ id: string; name: string }>>;
};

type StudentInfoDelegate = {
  findUnique(args: unknown): Promise<{
    id?: string;
    accountBalance?: number | null;
    fullName?: string | null;
    parentName?: string | null;
    parentEmail?: string | null;
  } | null>;
  findMany(args: unknown): Promise<
    Array<{
      id: string;
      accountBalance?: number | null;
      fullName?: string | null;
      parentName?: string | null;
      parentEmail?: string | null;
    }>
  >;
  update(args: unknown): Promise<unknown>;
};

type SePayWebhookPrismaClient = {
  studentWalletSepayOrder: StudentWalletSepayOrderDelegate;
  walletTransactionsHistory: WalletTransactionsHistoryDelegate;
  studentInfo: StudentInfoDelegate;
  customerCareService?: CustomerCareServiceDelegate;
  class?: ClassDelegate;
};

type StaticQrContext = {
  studentId: string;
  studentIdIsPartial: boolean;
  classIds: string[];
};

type NormalizedPrefixedIdToken = {
  id: string;
  isPartial: boolean;
};

@Injectable()
export class SePayWebhookService {
  private readonly logger = new Logger(SePayWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  async reconcile(
    payload: SePayWebhookDto,
  ): Promise<SePayWebhookReconcileResult> {
    if (payload.transferType !== 'in') {
      return { action: 'ignored_non_inbound' };
    }

    const client = this.getPrismaClient(this.prisma);
    const duplicate = await this.findProcessedOrder(client, payload);
    if (duplicate) {
      return {
        action: 'duplicate',
        orderCode: duplicate.orderCode,
        walletTransactionId: duplicate.walletTransactionId ?? undefined,
      };
    }

    const order = await this.findMatchingOrder(client, payload);
    const staticQrContext = order ? null : this.getStaticQrContext(payload);
    if (!order && !staticQrContext) {
      this.logUnmatchedWebhook(payload);
      return { action: 'unmatched' };
    }

    if (order && this.isCompleted(order)) {
      return {
        action: 'duplicate',
        orderCode: order.orderCode,
        walletTransactionId: order.walletTransactionId ?? undefined,
      };
    }

    if (order) {
      const preflightMismatch = this.getMismatchAction(order, payload);
      if (preflightMismatch) {
        this.logMismatch(preflightMismatch, order.orderCode, payload);
        return { action: preflightMismatch, orderCode: order.orderCode };
      }
    } else if (this.isStaticQrAccountMismatch(payload)) {
      this.logStaticQrAccountMismatch(payload);
      return { action: 'account_mismatch' };
    } else if (payload.transferAmount <= 0) {
      this.logger.warn(
        `SePay webhook unmatched: non-positive static QR amount id=${payload.id} reference=${payload.referenceCode}`,
      );
      return { action: 'unmatched' };
    }

    const result = await this.prisma.$transaction(async (transactionClient) => {
      const txClient = this.getPrismaClient(transactionClient);
      const txDuplicate = await this.findProcessedOrder(txClient, payload);
      if (txDuplicate) {
        return {
          action: 'duplicate' as const,
          order: txDuplicate,
          walletTransactionId: txDuplicate.walletTransactionId ?? undefined,
        };
      }

      if (!order) {
        if (!staticQrContext) {
          return { action: 'unmatched' as const, order: null };
        }

        const student = await this.findStaticQrStudent(
          txClient,
          staticQrContext,
        );
        if (!student) {
          return { action: 'unmatched' as const, order: null };
        }

        const orderCode = this.buildStaticQrOrderCode(payload);
        const resolvedStaticQrContext = {
          ...staticQrContext,
          studentId: student.id,
        };
        const transferNote = this.buildStaticQrTransferNote(
          resolvedStaticQrContext,
        );
        const completedAt = new Date();
        await txClient.studentWalletSepayOrder.create({
          data: {
            studentId: student.id,
            orderCode,
            status: 'completed',
            amountRequested: payload.transferAmount,
            amountReceived: payload.transferAmount,
            transferNote,
            parentEmail: student.parentEmail ?? null,
            sepayTransactionId: String(payload.id),
            sepayReferenceCode: payload.referenceCode,
            sepayAccountNumber: payload.accountNumber,
            completedAt,
            webhookPayload: this.buildStoredWebhookPayload(payload),
          },
          include: { student: true },
        });

        const walletTransaction =
          await txClient.walletTransactionsHistory.create({
            data: {
              studentId: student.id,
              type: 'topup',
              amount: payload.transferAmount,
              note: this.buildWalletTransactionNote(
                {
                  orderCode,
                  studentId: student.id,
                  status: 'completed',
                  amountRequested: payload.transferAmount,
                  amountReceived: payload.transferAmount,
                  transferNote,
                },
                payload,
              ),
              date: this.parseTransactionDate(payload.transactionDate),
            },
          });

        await txClient.studentInfo.update({
          where: { id: student.id },
          data: { accountBalance: { increment: payload.transferAmount } },
        });

        const completedOrder = await txClient.studentWalletSepayOrder.update({
          where: { orderCode },
          data: { walletTransactionId: walletTransaction.id },
          include: { student: true },
        });

        return {
          action: 'credited' as const,
          order: completedOrder,
          walletTransactionId: walletTransaction.id,
        };
      }

      const currentOrder = await txClient.studentWalletSepayOrder.findUnique({
        where: { orderCode: order.orderCode },
        include: { student: true },
      });
      if (!currentOrder) {
        return { action: 'unmatched' as const, order: null };
      }

      if (this.isCompleted(currentOrder)) {
        return {
          action: 'duplicate' as const,
          order: currentOrder,
          walletTransactionId: currentOrder.walletTransactionId ?? undefined,
        };
      }

      const mismatch = this.getMismatchAction(currentOrder, payload);
      if (mismatch) {
        return { action: mismatch, order: currentOrder };
      }

      const completedAt = new Date();
      const claimed = await txClient.studentWalletSepayOrder.updateMany({
        where: {
          orderCode: currentOrder.orderCode,
          status: 'pending',
          walletTransactionId: null,
        },
        data: {
          status: 'completed',
          amountReceived: payload.transferAmount,
          sepayTransactionId: String(payload.id),
          sepayReferenceCode: payload.referenceCode,
          completedAt,
          webhookPayload: this.buildStoredWebhookPayload(payload),
        },
      });

      if (claimed.count !== 1) {
        const afterClaim = await txClient.studentWalletSepayOrder.findUnique({
          where: { orderCode: currentOrder.orderCode },
          include: { student: true },
        });
        return {
          action: afterClaim ? ('duplicate' as const) : ('unmatched' as const),
          order: afterClaim,
          walletTransactionId: afterClaim?.walletTransactionId ?? undefined,
        };
      }

      const walletTransaction = await txClient.walletTransactionsHistory.create(
        {
          data: {
            studentId: currentOrder.studentId,
            type: 'topup',
            amount: payload.transferAmount,
            note: this.buildWalletTransactionNote(currentOrder, payload),
            date: this.parseTransactionDate(payload.transactionDate),
          },
        },
      );

      await txClient.studentInfo.update({
        where: { id: currentOrder.studentId },
        data: { accountBalance: { increment: payload.transferAmount } },
      });

      const completedOrder = await txClient.studentWalletSepayOrder.update({
        where: { orderCode: currentOrder.orderCode },
        data: { walletTransactionId: walletTransaction.id },
        include: { student: true },
      });

      return {
        action: 'credited' as const,
        order: completedOrder,
        walletTransactionId: walletTransaction.id,
      };
    });

    if (
      result.action === 'amount_mismatch' ||
      result.action === 'account_mismatch'
    ) {
      this.logMismatch(result.action, result.order?.orderCode, payload);
    }

    if (result.action === 'credited' && result.order) {
      await this.sendReceiptAfterCommit(result.order, payload);
      return {
        action: 'credited',
        orderCode: result.order.orderCode,
        walletTransactionId: result.walletTransactionId,
      };
    }

    return {
      action: result.action,
      orderCode: result.order?.orderCode,
      walletTransactionId: result.walletTransactionId,
    };
  }

  private getPrismaClient(client: unknown): SePayWebhookPrismaClient {
    const candidate = client as Partial<SePayWebhookPrismaClient>;
    if (!candidate.studentWalletSepayOrder) {
      throw new ServiceUnavailableException(
        'SePay wallet order storage is not available.',
      );
    }

    return candidate as SePayWebhookPrismaClient;
  }

  private async findProcessedOrder(
    client: SePayWebhookPrismaClient,
    payload: SePayWebhookDto,
  ): Promise<StudentWalletSepayOrderRecord | null> {
    return client.studentWalletSepayOrder.findFirst({
      where: {
        OR: [
          { sepayTransactionId: String(payload.id) },
          { sepayReferenceCode: payload.referenceCode },
        ],
      },
      include: { student: true },
    });
  }

  private async findMatchingOrder(
    client: SePayWebhookPrismaClient,
    payload: SePayWebhookDto,
  ): Promise<StudentWalletSepayOrderRecord | null> {
    for (const orderCode of this.getOrderCodeCandidates(payload)) {
      const order = await client.studentWalletSepayOrder.findUnique({
        where: { orderCode },
        include: { student: true },
      });
      if (order) {
        return order;
      }
    }

    return null;
  }

  private getOrderCodeCandidates(payload: SePayWebhookDto): string[] {
    const candidates: string[] = [];
    this.addOrderCodeCandidate(candidates, payload.code);

    const text = `${payload.content ?? ''} ${payload.description ?? ''}`;
    for (const match of text.match(/[A-Za-z0-9]{6,50}/g) ?? []) {
      this.addOrderCodeCandidate(candidates, match);
    }

    return candidates;
  }

  private getStaticQrContext(payload: SePayWebhookDto): StaticQrContext | null {
    const text = `${payload.content ?? ''} ${payload.description ?? ''}`;
    return this.extractStaticQrContextFromText(text);
  }

  private async findStaticQrStudent(
    client: SePayWebhookPrismaClient,
    context: StaticQrContext,
  ): Promise<{
    id: string;
    fullName?: string | null;
    parentName?: string | null;
    parentEmail?: string | null;
  } | null> {
    const select = {
      id: true,
      fullName: true,
      parentName: true,
      parentEmail: true,
    };

    if (!context.studentIdIsPartial) {
      const student = await client.studentInfo.findUnique({
        where: { id: context.studentId },
        select,
      });
      return student?.id ? { ...student, id: student.id } : null;
    }

    const matches = await client.studentInfo.findMany({
      where: { id: { startsWith: context.studentId } },
      select,
      take: 2,
    });

    if (matches.length !== 1) {
      this.logger.warn(
        `SePay webhook unmatched: static QR partial student id ${context.studentId} matched ${matches.length} students`,
      );
      return null;
    }

    return matches[0];
  }

  private extractStaticQrContextFromText(text: string): StaticQrContext | null {
    const uuid =
      '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
    const compactUuidPrefix = '[0-9a-f]{20,32}';
    const studentPart = `(?:UNIST-${uuid}|UNIST-?${compactUuidPrefix})`;
    const classPart = `(?:UNICL-${uuid}|UNICL-?${compactUuidPrefix})`;
    const optionalMarker = '(?:NAP\\s*VI\\s+)?';
    const match = text.match(
      new RegExp(
        `\\b${optionalMarker}(${studentPart})((?:[\\s-]+${classPart})*)`,
        'i',
      ),
    );
    const studentToken = match?.[1];
    const studentId = this.normalizePrefixedIdToken(studentToken, 'UNIST');
    if (!studentId) {
      return null;
    }

    const classPattern = new RegExp(classPart, 'gi');
    const classIds = Array.from(
      new Set(
        (match?.[2]?.match(classPattern) ?? [])
          .map((classToken) =>
            this.normalizePrefixedIdToken(classToken, 'UNICL'),
          )
          .filter((classId): classId is NormalizedPrefixedIdToken =>
            Boolean(classId?.id && !classId.isPartial),
          )
          .map((classId) => classId.id),
      ),
    );

    return {
      studentId: studentId.id,
      studentIdIsPartial: studentId.isPartial,
      classIds,
    };
  }

  private normalizePrefixedIdToken(
    token: string | null | undefined,
    prefix: 'UNIST' | 'UNICL',
  ): NormalizedPrefixedIdToken | null {
    const value = token?.trim();
    if (!value) {
      return null;
    }

    const uuid =
      '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
    const exactMatch = value.match(new RegExp(`^${prefix}-(${uuid})$`, 'i'));
    if (exactMatch?.[1]) {
      return {
        id: `${prefix}-${exactMatch[1].toLowerCase()}`,
        isPartial: false,
      };
    }

    const compactMatch = value.match(
      new RegExp(`^${prefix}-?([0-9a-f]{20,32})$`, 'i'),
    );
    const compactHex = compactMatch?.[1]?.toLowerCase();
    if (!compactHex) {
      return null;
    }

    return {
      id: `${prefix}-${this.hyphenateCompactUuidPrefix(compactHex)}`,
      isPartial: compactHex.length !== 32,
    };
  }

  private hyphenateCompactUuidPrefix(compactHex: string): string {
    const breakpoints = [8, 12, 16, 20];
    const segments: string[] = [];
    let cursor = 0;

    for (const breakpoint of breakpoints) {
      if (compactHex.length <= cursor) {
        break;
      }

      const next = Math.min(breakpoint, compactHex.length);
      segments.push(compactHex.slice(cursor, next));
      cursor = next;
    }

    if (cursor < compactHex.length) {
      segments.push(compactHex.slice(cursor));
    }

    return segments.filter(Boolean).join('-');
  }

  private buildStaticQrTransferNote(context: StaticQrContext): string {
    return [context.studentId, ...context.classIds].join(' ');
  }

  private buildStaticQrOrderCode(payload: SePayWebhookDto): string {
    return `STATIC${createHash('sha256')
      .update(`${payload.referenceCode}:${payload.id}`)
      .digest('hex')
      .slice(0, 44)}`;
  }

  private addOrderCodeCandidate(
    candidates: string[],
    value: string | null,
  ): void {
    const trimmed = value?.trim();
    if (!trimmed) {
      return;
    }

    const variants = [trimmed, trimmed.toUpperCase()];
    for (const variant of variants) {
      if (!candidates.includes(variant)) {
        candidates.push(variant);
      }
    }
  }

  private isCompleted(order: StudentWalletSepayOrderRecord): boolean {
    return Boolean(order.walletTransactionId || order.status === 'completed');
  }

  private getMismatchAction(
    order: StudentWalletSepayOrderRecord,
    payload: SePayWebhookDto,
  ): 'amount_mismatch' | 'account_mismatch' | null {
    if (order.amountRequested !== payload.transferAmount) {
      return 'amount_mismatch';
    }

    const expectedAccountNumber = this.getExpectedAccountNumber(order);
    if (
      expectedAccountNumber &&
      this.normalizeAccountNumber(payload.accountNumber) !==
        expectedAccountNumber
    ) {
      return 'account_mismatch';
    }

    return null;
  }

  private getExpectedAccountNumber(
    order: StudentWalletSepayOrderRecord,
  ): string | null {
    return this.normalizeAccountNumber(order.sepayAccountNumber);
  }

  private getExpectedStaticQrAccountNumber(): string | null {
    return this.normalizeAccountNumber(
      process.env.SEPAY_TRANSFER_ACCOUNT_NUMBER,
    );
  }

  private isStaticQrAccountMismatch(payload: SePayWebhookDto): boolean {
    const expectedAccountNumber = this.getExpectedStaticQrAccountNumber();
    const receivedAccountNumber = this.normalizeAccountNumber(
      payload.accountNumber,
    );
    return (
      !expectedAccountNumber || receivedAccountNumber !== expectedAccountNumber
    );
  }

  private normalizeAccountNumber(
    value: string | null | undefined,
  ): string | null {
    const normalized = value?.replace(/\s+/g, '').trim();
    return normalized ? normalized : null;
  }

  private buildStoredWebhookPayload(
    payload: SePayWebhookDto,
  ): Record<string, unknown> {
    return {
      id: payload.id,
      gateway: payload.gateway,
      transactionDate: payload.transactionDate,
      accountNumber: payload.accountNumber,
      code: payload.code,
      content: payload.content,
      transferType: payload.transferType,
      transferAmount: payload.transferAmount,
      accumulated: payload.accumulated,
      subAccount: payload.subAccount,
      referenceCode: payload.referenceCode,
      description: payload.description,
    };
  }

  private buildWalletTransactionNote(
    order: StudentWalletSepayOrderRecord,
    payload: SePayWebhookDto,
  ): string {
    return `SePay top-up ${order.orderCode} | Reference ${payload.referenceCode} | SePay ID ${payload.id}`;
  }

  private parseTransactionDate(value: string): Date {
    const parsed = new Date(value.replace(' ', 'T'));
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }

  private async sendReceiptAfterCommit(
    order: StudentWalletSepayOrderRecord,
    payload: SePayWebhookDto,
  ): Promise<void> {
    try {
      const studentRow = await this.prisma.studentInfo.findUnique({
        where: { id: order.studentId },
        select: { accountBalance: true },
      });
      const customerCareEmail = await this.getCustomerCareEmail(order);
      const recipients = this.getReceiptRecipients(order, customerCareEmail);
      if (recipients.length === 0) {
        return;
      }

      const extensionClassNames = await this.getExtensionClassNames(order);
      let sentAny = false;
      for (const to of recipients) {
        try {
          await this.mailService.sendStudentWalletTopUpReceiptEmail({
            to,
            parentName: order.student?.parentName ?? null,
            studentName: order.student?.fullName ?? 'Học sinh',
            studentCode: order.studentId,
            orderCode: order.orderCode,
            amountReceived: payload.transferAmount,
            transactionDate: payload.transactionDate,
            referenceCode: payload.referenceCode,
            balanceAfter: studentRow?.accountBalance ?? null,
            transferNote: order.transferNote ?? null,
            extensionClassNames,
          });
          sentAny = true;
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : 'Unknown receipt mail failure';
          this.logger.warn(
            `SePay receipt email failed for order=${order.orderCode} to=${to}: ${message}`,
          );
        }
      }

      if (sentAny) {
        const client = this.getPrismaClient(this.prisma);
        await client.studentWalletSepayOrder.update({
          where: { orderCode: order.orderCode },
          data: { receiptEmailSentAt: new Date() },
        });
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown receipt mail failure';
      this.logger.warn(
        `SePay receipt email failed for order=${order.orderCode}: ${message}`,
      );
    }
  }

  private async getCustomerCareEmail(
    order: StudentWalletSepayOrderRecord,
  ): Promise<string | null> {
    const client = this.getPrismaClient(this.prisma);
    const assignment = await client.customerCareService?.findUnique({
      where: { studentId: order.studentId },
      select: {
        staff: {
          select: {
            user: {
              select: { email: true },
            },
          },
        },
      },
    });
    const email = assignment?.staff?.user?.email?.trim();
    return email || null;
  }

  private async getExtensionClassNames(
    order: StudentWalletSepayOrderRecord,
  ): Promise<string[]> {
    const classIds =
      this.extractStaticQrContextFromText(order.transferNote ?? '')?.classIds ??
      [];
    if (classIds.length === 0) {
      return [];
    }

    const client = this.getPrismaClient(this.prisma);
    const classes =
      (await client.class?.findMany({
        where: { id: { in: classIds } },
        select: { id: true, name: true },
      })) ?? [];
    const namesById = new Map(classes.map((item) => [item.id, item.name]));

    return classIds
      .map((classId) => namesById.get(classId))
      .filter((name): name is string => Boolean(name?.trim()));
  }

  private getReceiptRecipients(
    order: StudentWalletSepayOrderRecord,
    customerCareEmail: string | null,
  ): string[] {
    return Array.from(
      new Set(
        [this.getParentEmail(order), customerCareEmail]
          .map((email) => email?.trim())
          .filter((email): email is string => Boolean(email)),
      ),
    );
  }

  private getParentEmail(order: StudentWalletSepayOrderRecord): string | null {
    const parentEmail = order.parentEmail ?? order.student?.parentEmail;
    const trimmed = parentEmail?.trim();
    return trimmed ? trimmed : null;
  }

  private logMismatch(
    action: 'amount_mismatch' | 'account_mismatch',
    orderCode: string | undefined,
    payload: SePayWebhookDto,
  ): void {
    this.logger.warn(
      `SePay webhook ${action}: order=${orderCode ?? 'unknown'} id=${payload.id} reference=${payload.referenceCode}`,
    );
  }

  private logUnmatchedWebhook(payload: SePayWebhookDto): void {
    this.logger.warn(
      `SePay webhook unmatched: ${JSON.stringify({
        id: payload.id,
        referenceCode: payload.referenceCode,
        accountNumber: this.maskAccountNumber(payload.accountNumber),
        transferAmount: payload.transferAmount,
        code: payload.code,
        orderCandidates: this.getOrderCodeCandidates(payload).slice(0, 5),
        hasNapviMarker: /\bNAP\s*VI\b/i.test(
          `${payload.content ?? ''} ${payload.description ?? ''}`,
        ),
        contentSnippet: this.toLogSnippet(payload.content),
        descriptionSnippet: this.toLogSnippet(payload.description),
      })}`,
    );
  }

  private logStaticQrAccountMismatch(payload: SePayWebhookDto): void {
    this.logger.warn(
      `SePay webhook account_mismatch: static QR id=${payload.id} reference=${payload.referenceCode} account=${payload.accountNumber}`,
    );
  }

  private maskAccountNumber(value: string | null | undefined): string | null {
    const normalized = this.normalizeAccountNumber(value);
    if (!normalized) {
      return null;
    }

    if (normalized.length <= 4) {
      return '*'.repeat(normalized.length);
    }

    return `${'*'.repeat(Math.max(normalized.length - 4, 0))}${normalized.slice(-4)}`;
  }

  private toLogSnippet(value: string | null | undefined): string {
    return (value ?? '').replace(/\s+/g, ' ').trim().slice(0, 160);
  }
}
