import { HttpService } from '@nestjs/axios';
import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { firstValueFrom } from 'rxjs';
import type {
  SePayNormalizedCreateOrderResult,
  SePayStudentWalletStaticQrResult,
  SePayWalletTopUpMode,
  SePayWalletTopUpPaymentResult,
} from './sepay.types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeUniqueTextList(values: string[] | undefined): string[] {
  return Array.from(
    new Set(
      (values ?? [])
        .map((value) => value.trim().replace(/\s+/g, ' '))
        .filter(Boolean),
    ),
  );
}

function normalizeTransferNotePrefix(value: string | undefined): string | null {
  const normalized = value?.trim().replace(/\s+/g, ' ');
  return normalized || null;
}

export class SePayDuplicateOrderCodeException extends ConflictException {
  constructor(message = 'SePay order_code already exists.') {
    super(message);
  }
}

@Injectable()
export class SePayService {
  private readonly logger = new Logger(SePayService.name);

  constructor(private readonly http: HttpService) {}

  isWalletTopUpConfigured(): boolean {
    if (this.getWalletTopUpMode() === 'bank_transfer') {
      return Boolean(
        process.env.SEPAY_TRANSFER_BANK_BIN?.trim() &&
        process.env.SEPAY_TRANSFER_ACCOUNT_NUMBER?.trim(),
      );
    }

    return Boolean(
      process.env.SEPAY_API_ACCESS_TOKEN?.trim() &&
      process.env.SEPAY_BANK_ACCOUNT_XID?.trim(),
    );
  }

  isStudentWalletStaticQrConfigured(): boolean {
    return Boolean(
      process.env.SEPAY_TRANSFER_BANK_BIN?.trim() &&
      process.env.SEPAY_TRANSFER_ACCOUNT_NUMBER?.trim(),
    );
  }

  getWalletTopUpMode(): SePayWalletTopUpMode {
    return process.env.SEPAY_TOPUP_MODE?.trim() === 'bank_transfer'
      ? 'bank_transfer'
      : 'va_order';
  }

  /**
   * Mã đơn alphanumeric 6–50 ký tự (ràng buộc SePay).
   */
  buildStudentWalletOrderCode(studentId: string): string {
    const hex = randomBytes(4).toString('hex').toUpperCase();
    // Strip prefix (e.g. "UNIST-") and dashes to get the UUID hex chars
    const uuidPart = studentId.replace(/^[A-Z]+-/i, '').replace(/-/g, '');
    const compact = uuidPart.slice(0, 10).toUpperCase();
    const code = `U${compact}${hex}`;
    return code.slice(0, 50);
  }

  async createStudentWalletTopUpPayment(params: {
    amountVnd: number;
    orderCode: string;
    baseTransferNote: string;
  }): Promise<SePayWalletTopUpPaymentResult> {
    const transferNote = this.buildStudentWalletTransferNote(
      params.baseTransferNote,
      params.orderCode,
    );

    const payment =
      this.getWalletTopUpMode() === 'bank_transfer'
        ? this.createBankTransferPayment({
            amountVnd: params.amountVnd,
            orderCode: params.orderCode,
            transferNote,
          })
        : await this.createBankAccountOrder({
            amountVnd: params.amountVnd,
            orderCode: params.orderCode,
            description: transferNote,
          });

    return { ...payment, transferNote };
  }

  buildStudentWalletTransferNote(
    baseTransferNote: string,
    orderCode: string,
  ): string {
    const transferNote =
      this.getWalletTopUpMode() === 'bank_transfer'
        ? `NAPVI ${orderCode}`.trim()
        : this.buildVaOrderTransferNote(baseTransferNote, orderCode);

    return this.applyTransferNotePrefix(transferNote);
  }

  private buildVaOrderTransferNote(
    baseTransferNote: string,
    orderCode: string,
  ): string {
    const trimmed = baseTransferNote.trim();
    if (trimmed.includes(orderCode)) {
      return trimmed;
    }
    return `${trimmed} ${orderCode}`.trim();
  }

  buildStudentWalletStaticTransferNote(
    studentId: string,
    classIds: string[] = [],
    classNames: string[] = [],
  ): string {
    const baseTransferNote = [studentId, ...classIds].join(' ').trim();
    if (classNames.length === 0) {
      return baseTransferNote;
    }
    return `${baseTransferNote} LOP ${classNames.join(', ')}`.trim();
  }

  createStudentWalletStaticQr(params: {
    studentId: string;
    classIds?: string[];
    classNames?: string[];
  }): SePayStudentWalletStaticQrResult {
    const bankBin = process.env.SEPAY_TRANSFER_BANK_BIN?.trim();
    const accountNumber = process.env.SEPAY_TRANSFER_ACCOUNT_NUMBER?.trim();
    if (!bankBin || !accountNumber) {
      throw new ServiceUnavailableException(
        'SePay static bank-transfer QR chưa được cấu hình (thiếu SEPAY_TRANSFER_BANK_BIN hoặc SEPAY_TRANSFER_ACCOUNT_NUMBER).',
      );
    }

    const accountName = process.env.SEPAY_TRANSFER_ACCOUNT_NAME?.trim() ?? null;
    const bankName = process.env.SEPAY_TRANSFER_BANK_NAME?.trim() ?? null;
    const template =
      process.env.SEPAY_TRANSFER_QR_TEMPLATE?.trim() || 'compact2';
    const baseUrl =
      process.env.SEPAY_VIETQR_IMAGE_BASE_URL?.trim() ||
      'https://img.vietqr.io/image';
    const classIds = normalizeUniqueTextList(params.classIds);
    const classNames = normalizeUniqueTextList(params.classNames);
    const transferNote = this.buildStudentWalletStaticTransferNote(
      params.studentId,
      classIds,
      classNames,
    );
    const prefixedTransferNote = this.applyTransferNotePrefix(transferNote);
    const qrUrl = this.buildBankTransferQrUrl({
      baseUrl,
      bank: bankName ?? bankBin,
      bankBin,
      accountNumber,
      accountName,
      template,
      transferNote: prefixedTransferNote,
    });

    return {
      studentId: params.studentId,
      classIds,
      transferNote: prefixedTransferNote,
      bankName,
      accountNumber,
      accountHolderName: accountName,
      qrCodeUrl: qrUrl.toString(),
    };
  }

  async createBankAccountOrder(params: {
    amountVnd: number;
    orderCode: string;
    description?: string;
    qrcodeTemplate?: 'compact' | 'qronly';
  }): Promise<SePayNormalizedCreateOrderResult> {
    const base =
      process.env.SEPAY_USERAPI_BASE_URL?.trim() || 'https://userapi.sepay.vn';
    const token = process.env.SEPAY_API_ACCESS_TOKEN?.trim();
    const baXid = process.env.SEPAY_BANK_ACCOUNT_XID?.trim();
    if (!token || !baXid) {
      throw new ServiceUnavailableException(
        'SePay chưa được cấu hình (thiếu SEPAY_API_ACCESS_TOKEN hoặc SEPAY_BANK_ACCOUNT_XID).',
      );
    }
    this.assertCreateOrderInput(params.amountVnd, params.orderCode);

    const url = `${base.replace(/\/$/, '')}/v2/bank-accounts/${encodeURIComponent(baXid)}/orders`;

    const body: Record<string, string | number> = {
      order_code: params.orderCode,
      amount: params.amountVnd,
      with_qrcode: 1,
      qrcode_template: params.qrcodeTemplate ?? 'compact',
    };
    const description = params.description?.trim();
    if (description) {
      body.description = description;
    }

    const vaPrefix = process.env.SEPAY_VA_PREFIX?.trim();
    if (vaPrefix) {
      body.va_prefix = vaPrefix;
    }

    const durationRaw = process.env.SEPAY_ORDER_DURATION_SECONDS?.trim();
    const duration = durationRaw ? Number.parseInt(durationRaw, 10) : 900;
    if (Number.isFinite(duration) && duration > 0) {
      body.duration = duration;
    }

    try {
      const response = await firstValueFrom(
        this.http.post<unknown>(url, body, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          timeout: 45_000,
        }),
      );
      return this.normalizeCreateOrderResponse(response.data);
    } catch (error: unknown) {
      const err = error as {
        response?: { status?: number; data?: unknown };
        message?: string;
      };
      const status = err.response?.status;
      const data = err.response?.data;
      this.logger.warn(
        `SePay create order failed: status=${status} data=${JSON.stringify(data)?.slice(0, 500)}`,
      );
      const message = this.extractSePayErrorMessage(data) ?? err.message;
      if (status === 409) {
        throw new SePayDuplicateOrderCodeException(
          message ?? 'SePay order_code already exists.',
        );
      }
      throw new BadGatewayException(
        message ??
          'Không tạo được đơn SePay. Vui lòng thử lại hoặc liên hệ trung tâm.',
      );
    }
  }

  private createBankTransferPayment(params: {
    amountVnd: number;
    orderCode: string;
    transferNote: string;
  }): SePayNormalizedCreateOrderResult {
    this.assertCreateOrderInput(params.amountVnd, params.orderCode);

    const bankBin = process.env.SEPAY_TRANSFER_BANK_BIN?.trim();
    const accountNumber = process.env.SEPAY_TRANSFER_ACCOUNT_NUMBER?.trim();
    if (!bankBin || !accountNumber) {
      throw new ServiceUnavailableException(
        'SePay bank-transfer QR chưa được cấu hình (thiếu SEPAY_TRANSFER_BANK_BIN hoặc SEPAY_TRANSFER_ACCOUNT_NUMBER).',
      );
    }

    const accountName = process.env.SEPAY_TRANSFER_ACCOUNT_NAME?.trim() ?? null;
    const bankName = process.env.SEPAY_TRANSFER_BANK_NAME?.trim() ?? null;
    const template =
      process.env.SEPAY_TRANSFER_QR_TEMPLATE?.trim() || 'compact2';
    const baseUrl =
      process.env.SEPAY_VIETQR_IMAGE_BASE_URL?.trim() ||
      'https://img.vietqr.io/image';
    const qrUrl = this.buildBankTransferQrUrl({
      baseUrl,
      bank: bankName ?? bankBin,
      bankBin,
      accountNumber,
      accountName,
      template,
      transferNote: params.transferNote,
      amountVnd: params.amountVnd,
    });

    return {
      orderId: null,
      orderCode: params.orderCode,
      amount: params.amountVnd,
      sepayStatus: 'Pending',
      vaNumber: null,
      vaHolderName: null,
      bankName,
      accountNumber,
      accountHolderName: accountName,
      expiredAt: null,
      qrCode: null,
      qrCodeUrl: qrUrl.toString(),
      raw: {
        mode: 'bank_transfer',
        bankBin,
        accountNumber,
        accountName,
        bankName,
        template,
      },
    };
  }

  private applyTransferNotePrefix(transferNote: string): string {
    const note = transferNote.trim();
    const prefix = normalizeTransferNotePrefix(
      process.env.SEPAY_TRANSFER_NOTE_PREFIX,
    );
    if (!prefix) {
      return note;
    }

    const lowerNote = note.toLowerCase();
    const lowerPrefix = prefix.toLowerCase();
    if (lowerNote === lowerPrefix || lowerNote.startsWith(`${lowerPrefix} `)) {
      return note;
    }

    return `${prefix} ${note}`.trim();
  }

  private buildBankTransferQrUrl(params: {
    baseUrl: string;
    bank: string;
    bankBin: string;
    accountNumber: string;
    accountName: string | null;
    template: string;
    transferNote: string;
    amountVnd?: number;
  }): URL {
    const normalizedBaseUrl = params.baseUrl.replace(/\/$/, '');
    const usesSePayQr =
      normalizedBaseUrl === 'https://qr.sepay.vn/img' ||
      normalizedBaseUrl.endsWith('/qr.sepay.vn/img');

    if (usesSePayQr) {
      const qrUrl = new URL(normalizedBaseUrl);
      qrUrl.searchParams.set('acc', params.accountNumber);
      qrUrl.searchParams.set('bank', params.bank);
      qrUrl.searchParams.set('des', params.transferNote);
      if (params.amountVnd !== undefined) {
        qrUrl.searchParams.set('amount', String(params.amountVnd));
      }
      if (params.template) {
        qrUrl.searchParams.set('template', params.template);
      }
      return qrUrl;
    }

    const qrUrl = new URL(
      `${normalizedBaseUrl}/${encodeURIComponent(params.bankBin)}-${encodeURIComponent(params.accountNumber)}-${encodeURIComponent(params.template)}.png`,
    );
    if (params.amountVnd !== undefined) {
      qrUrl.searchParams.set('amount', String(params.amountVnd));
    }
    qrUrl.searchParams.set('addInfo', params.transferNote);
    if (params.accountName) {
      qrUrl.searchParams.set('accountName', params.accountName);
    }
    return qrUrl;
  }

  private extractSePayErrorMessage(data: unknown): string | undefined {
    if (!isRecord(data)) {
      return undefined;
    }
    const msg = data.message ?? data.error;
    if (typeof msg === 'string' && msg.trim()) {
      return msg.trim();
    }
    const nested = data.data;
    if (isRecord(nested) && typeof nested.message === 'string') {
      return nested.message.trim();
    }
    return undefined;
  }

  private assertCreateOrderInput(amountVnd: number, orderCode: string) {
    if (!Number.isInteger(amountVnd) || amountVnd <= 0) {
      throw new BadRequestException(
        'SePay order amount must be a positive integer.',
      );
    }

    if (!/^[A-Za-z0-9]{6,50}$/.test(orderCode)) {
      throw new BadRequestException(
        'SePay order_code must be 6-50 alphanumeric characters.',
      );
    }
  }

  private normalizeCreateOrderResponse(
    data: unknown,
  ): SePayNormalizedCreateOrderResult {
    const raw = data;
    let payload: Record<string, unknown> | null = null;

    if (isRecord(data) && data.status === 'success' && isRecord(data.data)) {
      payload = data.data;
    } else if (isRecord(data)) {
      payload = data;
    }

    if (!payload) {
      return { raw };
    }

    const qrCode =
      typeof payload.qr_code === 'string' ? payload.qr_code : undefined;
    const qrCodeUrl =
      typeof payload.qr_code_url === 'string' ? payload.qr_code_url : undefined;

    return {
      orderId:
        typeof payload.id === 'string'
          ? payload.id
          : typeof payload.order_id === 'string'
            ? payload.order_id
            : null,
      orderCode:
        typeof payload.order_code === 'string' ? payload.order_code : null,
      amount: typeof payload.amount === 'number' ? payload.amount : null,
      sepayStatus: typeof payload.status === 'string' ? payload.status : null,
      vaNumber:
        typeof payload.va_number === 'string' ? payload.va_number : null,
      vaHolderName:
        typeof payload.va_holder_name === 'string'
          ? payload.va_holder_name
          : null,
      bankName:
        typeof payload.bank_name === 'string' ? payload.bank_name : null,
      accountNumber:
        typeof payload.account_number === 'string'
          ? payload.account_number
          : null,
      accountHolderName:
        typeof payload.account_holder_name === 'string'
          ? payload.account_holder_name
          : null,
      expiredAt:
        typeof payload.expired_at === 'string'
          ? payload.expired_at
          : payload.expired_at === null
            ? null
            : null,
      qrCode: qrCode ?? null,
      qrCodeUrl: qrCodeUrl ?? null,
      raw,
    };
  }
}
