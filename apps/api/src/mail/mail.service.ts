import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { render } from '@react-email/render';
import nodemailer, { type SendMailOptions, type Transporter } from 'nodemailer';
import React from 'react';
import {
  ReceiptAssetsService,
  type ReceiptImageDataUris,
} from './receipt-assets.service';
import { ReceiptPdfService } from './receipt-pdf.service';
import type {
  ReceiptLineItem,
  TuitionReceiptEmailProps,
} from './receipt.types';
import {
  DirectTopUpApprovalEmail,
  type DirectTopUpApprovalEmailProps,
} from './templates/direct-topup-approval.email';
import {
  EmailVerificationEmail,
  type EmailVerificationEmailProps,
} from './templates/email-verification.email';
import {
  PasswordResetEmail,
  type PasswordResetEmailProps,
} from './templates/password-reset.email';
import { TuitionReceiptEmail } from './templates/tuition-receipt.email';

/** Khớp `AuthService.verifyTokenExpiresIn` (giây) / 3600 */
const EMAIL_VERIFICATION_EXPIRES_HOURS = 24;
const FORGOT_PASSWORD_EXPIRES_HOURS = 24 * 7;

const LOCAL_FRONTEND_URL = 'http://localhost:3000';
const UNSAFE_PRODUCTION_FRONTEND_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '[::1]',
  'example.com',
  'example.net',
  'example.org',
]);

interface SmtpError {
  code?: string;
  responseCode?: number;
  command?: string;
  message?: string;
}

export interface StudentWalletTopUpReceiptEmailParams {
  to: string;
  parentName?: string | null;
  studentName: string;
  /** Mã HV hiển thị trên biên lai (tùy chọn) */
  studentCode?: string | null;
  amountReceived: number;
  orderCode: string;
  transactionDate?: string | null;
  referenceCode?: string | null;
  balanceAfter?: number | null;
  /** Nội dung chuyển khoản / mã đơn trên QR (từ đơn SePay) */
  transferNote?: string | null;
  extensionClassNames?: string[];
}

export interface DirectTopUpApprovalEmailParams {
  to: string;
  token: string;
  studentName: string;
  studentId: string;
  amount: number;
  reason: string;
  requestedByEmail?: string | null;
  expiresAt: Date;
}

interface StudentWalletTopUpReceiptEmailWebhookPayload {
  parentEmail: string;
  studentName: string | null;
  orderCode: string;
  amountVnd: number;
  transactionDate?: string | null;
  referenceCode?: string | null;
  extensionClassNames?: string[];
}

const RECEIPT_INLINE_IMAGES = [
  {
    key: 'logoMain',
    prop: 'logoMainSrc',
    filename: 'logo-main.png',
    cid: 'receipt-logo-main@unicorns-edu',
  },
  {
    key: 'logoTin',
    prop: 'logoTinSrc',
    filename: 'logo-tin.png',
    cid: 'receipt-logo-tin@unicorns-edu',
  },
  {
    key: 'stamp',
    prop: 'stampSrc',
    filename: 'receipt-stamp.png',
    cid: 'receipt-stamp@unicorns-edu',
  },
] as const;
const AUTH_BRAND_LOGO_CID = 'auth-brand-logo@unicorns-edu';

type ReceiptImageSourceProps = Pick<
  TuitionReceiptEmailProps,
  'logoMainSrc' | 'logoTinSrc' | 'stampSrc'
>;

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;
  private readonly mailFrom: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly receiptPdfService: ReceiptPdfService,
    private readonly receiptAssetsService: ReceiptAssetsService,
  ) {
    const host = this.configService.get<string>('SMTP_HOST');
    if (host) {
      const smtpSecure =
        this.configService.get<string>('SMTP_SECURE') === 'true';
      this.transporter = nodemailer.createTransport({
        host,
        port: Number(this.configService.get<string>('SMTP_PORT') ?? 587),
        secure: smtpSecure,
        auth: {
          user: this.configService.get<string>('SMTP_USER'),
          pass: this.getSmtpPassword(host),
        },
      });
    } else {
      this.transporter = null;
    }
    this.mailFrom =
      this.configService.get<string>('MAIL_FROM') ?? 'no-reply@localhost';
  }

  async sendVerificationEmail(email: string, token: string): Promise<void> {
    if (!this.transporter) {
      throw new ServiceUnavailableException(
        'Chưa cấu hình gửi email (SMTP). Vui lòng cấu hình SMTP trong .env hoặc liên hệ quản trị viên.',
      );
    }
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    const verificationLink = `${frontendUrl}/verify-email?token=${encodeURIComponent(token)}`;
    const inlineLogo = this.buildAuthBrandLogoInlineImage();
    const props: EmailVerificationEmailProps = {
      recipientEmail: email,
      verificationLink,
      expiresInHours: EMAIL_VERIFICATION_EXPIRES_HOURS,
      logoSrc: inlineLogo.logoSrc,
    };

    const html = await render(
      React.createElement(
        EmailVerificationEmail as React.FC<EmailVerificationEmailProps>,
        props,
      ),
    );
    const text = [
      'Xác thực email tài khoản Unicorns Edu',
      `Email: ${props.recipientEmail}`,
      `Liên kết xác thực (hiệu lực ${props.expiresInHours} giờ):`,
      props.verificationLink,
      '',
      'Nếu bạn không tạo tài khoản hoặc không yêu cầu email này, hãy bỏ qua.',
    ].join('\n');

    await this.sendMailOrThrow({
      from: this.mailFrom,
      to: email,
      subject: '[Unicorns Edu] Xác thực email tài khoản',
      text,
      html,
      ...(inlineLogo.attachments.length
        ? { attachments: inlineLogo.attachments }
        : {}),
    });
  }

  async sendForgotPasswordEmail(email: string, token: string): Promise<void> {
    if (!this.transporter) {
      throw new ServiceUnavailableException(
        'Chưa cấu hình gửi email (SMTP). Vui lòng cấu hình SMTP trong .env hoặc liên hệ quản trị viên.',
      );
    }
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    const forgotPasswordLink = `${frontendUrl}/auth/reset-password?token=${encodeURIComponent(token)}`;
    const inlineLogo = this.buildAuthBrandLogoInlineImage();
    const props: PasswordResetEmailProps = {
      recipientEmail: email,
      resetLink: forgotPasswordLink,
      expiresInHours: FORGOT_PASSWORD_EXPIRES_HOURS,
      logoSrc: inlineLogo.logoSrc,
    };

    const html = await render(
      React.createElement(
        PasswordResetEmail as React.FC<PasswordResetEmailProps>,
        props,
      ),
    );
    const text = [
      'Đổi mật khẩu tài khoản Unicorns Edu',
      `Email: ${props.recipientEmail}`,
      `Liên kết đổi mật khẩu (hiệu lực ${props.expiresInHours} giờ):`,
      props.resetLink,
      '',
      'Nếu bạn không yêu cầu đổi mật khẩu, hãy bỏ qua email này.',
    ].join('\n');

    await this.sendMailOrThrow({
      from: this.mailFrom,
      to: email,
      subject: '[Unicorns Edu] Đổi mật khẩu tài khoản',
      text,
      html,
      ...(inlineLogo.attachments.length
        ? { attachments: inlineLogo.attachments }
        : {}),
    });
  }

  async sendStudentWalletDirectTopUpApprovalEmail(
    params: DirectTopUpApprovalEmailParams,
  ): Promise<void> {
    const frontendUrl = this.getDirectTopUpApprovalFrontendUrl();
    const approvalUrl = `${frontendUrl}/wallet-direct-topup-approval?token=${encodeURIComponent(params.token)}`;
    const expiresAt = params.expiresAt.toLocaleString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    const props: DirectTopUpApprovalEmailProps = {
      approvalUrl,
      studentName: this.normalizeReceiptText(params.studentName) || 'Học sinh',
      studentId: params.studentId,
      amount: params.amount,
      reason: this.normalizeReceiptText(params.reason),
      requestedByEmail:
        this.normalizeReceiptText(params.requestedByEmail) || null,
      expiresAt,
    };

    const html = await render(
      React.createElement(
        DirectTopUpApprovalEmail as React.FC<DirectTopUpApprovalEmailProps>,
        props,
      ),
    );
    const text = [
      'Yêu cầu nạp thẳng ví học sinh',
      `Học sinh: ${props.studentName} (${props.studentId})`,
      `Số tiền: ${this.formatVnd(props.amount)} VND`,
      `Lý do: ${props.reason}`,
      `Người yêu cầu: ${props.requestedByEmail || 'Không có email'}`,
      `Hết hạn: ${props.expiresAt}`,
      `Xác nhận tại: ${approvalUrl}`,
    ].join('\n');

    await this.sendMailOrThrow({
      from: this.mailFrom,
      to: params.to,
      subject: `[Unicorns Edu] Xác nhận nạp thẳng — ${props.studentName} — ${this.formatVnd(props.amount)} VND`,
      text,
      html,
    });
  }

  async sendStudentWalletTopUpReceiptEmail(
    params: StudentWalletTopUpReceiptEmailParams,
  ): Promise<void>;
  async sendStudentWalletTopUpReceiptEmail(
    params: StudentWalletTopUpReceiptEmailWebhookPayload,
  ): Promise<void>;
  async sendStudentWalletTopUpReceiptEmail(
    params:
      | StudentWalletTopUpReceiptEmailParams
      | StudentWalletTopUpReceiptEmailWebhookPayload,
  ): Promise<void> {
    const to = 'to' in params ? params.to : params.parentEmail;
    const amount =
      'amountReceived' in params ? params.amountReceived : params.amountVnd;
    const parentName = this.normalizeReceiptText(
      'parentName' in params ? params.parentName : null,
    );
    const studentName =
      this.normalizeReceiptText(params.studentName) || 'Học sinh';
    const studentCode =
      'studentCode' in params
        ? this.normalizeReceiptText(params.studentCode)
        : '';
    const orderCode = this.normalizeReceiptText(params.orderCode);
    const transactionDate = this.normalizeReceiptText(params.transactionDate);
    const referenceCode = this.normalizeReceiptText(params.referenceCode);
    const transferNote =
      'transferNote' in params
        ? this.normalizeReceiptText(params.transferNote)
        : '';
    const balanceAfter =
      'balanceAfter' in params && params.balanceAfter != null
        ? params.balanceAfter
        : null;
    const extensionClassNames =
      'extensionClassNames' in params &&
      Array.isArray(params.extensionClassNames)
        ? params.extensionClassNames
        : [];

    const receiptProps = this.buildTuitionReceiptProps({
      parentName,
      studentName,
      studentCode: studentCode || null,
      orderCode,
      amount,
      transactionDate: transactionDate || null,
      referenceCode: referenceCode || null,
      transferNote: transferNote || null,
      balanceAfter,
      extensionClassNames,
    });

    const imageDataUris = this.receiptAssetsService.getReceiptImageDataUris();
    const pdfProps: TuitionReceiptEmailProps = {
      ...receiptProps,
      logoMainSrc: imageDataUris?.logoMain ?? null,
      logoTinSrc: imageDataUris?.logoTin ?? null,
      stampSrc: imageDataUris?.stamp ?? null,
    };

    const pdfHtml = await this.renderReceiptHtml(pdfProps);
    const pdfBuffer = await this.receiptPdfService.renderToPdf(pdfHtml);
    const inlineImages = this.buildReceiptInlineImages(imageDataUris);
    const emailProps: TuitionReceiptEmailProps = {
      ...receiptProps,
      ...inlineImages.props,
    };
    const html = await this.renderReceiptHtml(emailProps);

    const plainText = this.buildReceiptPlainText(
      receiptProps,
      parentName,
      balanceAfter,
    );

    const attachments: SendMailOptions['attachments'] = [
      ...inlineImages.attachments,
    ];
    if (pdfBuffer) {
      attachments.push({
        filename: `bien-lai-${orderCode}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
      });
    }

    await this.sendMailOrThrow({
      from: this.mailFrom,
      to,
      subject: `[Unicorns Edu] Biên lai nạp ví — ${studentName} — ${orderCode}`,
      text: plainText,
      html,
      ...(attachments.length ? { attachments } : {}),
    });
  }

  private async renderReceiptHtml(
    props: TuitionReceiptEmailProps,
  ): Promise<string> {
    return render(
      React.createElement(
        TuitionReceiptEmail as React.FC<TuitionReceiptEmailProps>,
        props,
      ),
    );
  }

  private buildTuitionReceiptProps(args: {
    parentName: string;
    studentName: string;
    studentCode: string | null;
    orderCode: string;
    amount: number;
    transactionDate: string | null;
    referenceCode: string | null;
    transferNote: string | null;
    balanceAfter: number | null;
    extensionClassNames: string[];
  }): TuitionReceiptEmailProps {
    const documentTitle =
      this.configService.get<string>('RECEIPT_DOCUMENT_TITLE')?.trim() ||
      'Biên lai xác nhận học phí';

    const receiverName =
      this.configService.get<string>('RECEIPT_RECEIVER_NAME')?.trim() ||
      this.configService.get<string>('SEPAY_TRANSFER_ACCOUNT_NAME')?.trim() ||
      'Unicorns Edu';

    const receiverBankName =
      this.configService.get<string>('RECEIPT_RECEIVER_BANK_NAME')?.trim() ||
      this.configService.get<string>('SEPAY_TRANSFER_BANK_NAME')?.trim() ||
      null;

    const receiverBankAccount =
      this.configService.get<string>('RECEIPT_RECEIVER_BANK_ACCOUNT')?.trim() ||
      this.configService.get<string>('SEPAY_TRANSFER_ACCOUNT_NUMBER')?.trim() ||
      null;

    const issueDate = this.formatNowVNDateTime();
    const rowDate = args.transactionDate?.trim()
      ? this.formatDateVNFromTransactionString(args.transactionDate)
      : this.formatNowVNDate();

    const memoParts = [
      args.transferNote || null,
      args.balanceAfter != null
        ? `Số dư ví sau nạp: ${this.formatVnd(args.balanceAfter)} VND`
        : null,
    ].filter(Boolean);
    const memo =
      memoParts.length > 0
        ? memoParts.join(' · ')
        : `Nạp ví SePay — đơn ${args.orderCode}`;

    const lineItems: ReceiptLineItem[] = [
      {
        date: rowDate,
        memo,
        referenceCode: args.referenceCode || '—',
        amount: args.amount,
      },
    ];

    const payerDisplay = args.parentName.trim() || args.studentName;
    const receiptSummary = this.buildReceiptSummary(
      args.studentName,
      args.extensionClassNames,
      args.amount,
    );

    return {
      documentTitle,
      invoiceCode: args.orderCode,
      issueDate,
      studentName: args.studentName,
      studentCode: args.studentCode,
      payerName: payerDisplay,
      receiverName,
      receiverBankName,
      receiverBankAccount,
      receiptSummary,
      lineItems,
      totalAmount: args.amount,
    };
  }

  private buildReceiptSummary(
    studentName: string,
    extensionClassNames: string[],
    amount: number,
  ): string {
    const normalizedClassNames = extensionClassNames
      .map((name) => this.normalizeReceiptText(name))
      .filter(Boolean);
    const classText =
      normalizedClassNames.length > 0
        ? ` gia hạn khoá ${this.joinVietnameseList(normalizedClassNames)}`
        : '';
    return `Em học sinh ${studentName}${classText} số tiền ${this.formatVnd(amount)} VNĐ.`;
  }

  private joinVietnameseList(items: string[]): string {
    if (items.length <= 1) {
      return items[0] ?? '';
    }

    return `${items.slice(0, -1).join(', ')} và ${items[items.length - 1]}`;
  }

  /** Ngày hiển thị trên dòng giao dịch: ưu tiên parse từ SePay `YYYY-MM-DD HH:mm:ss`. */
  private formatDateVNFromTransactionString(
    raw: string | null | undefined,
  ): string {
    if (!raw?.trim()) {
      return this.formatNowVNDate();
    }
    const parsed = new Date(raw.replace(' ', 'T'));
    if (Number.isNaN(parsed.getTime())) {
      return this.formatNowVNDate();
    }
    return parsed.toLocaleDateString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  private formatNowVNDate(): string {
    return new Date().toLocaleDateString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  private formatNowVNDateTime(): string {
    return new Date().toLocaleString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  private buildReceiptPlainText(
    props: TuitionReceiptEmailProps,
    parentName: string,
    balanceAfter: number | null,
  ): string {
    const greet = parentName.trim()
      ? `Kính gửi ${parentName},`
      : 'Kính gửi Quý phụ huynh,';
    const lines = [
      greet,
      '',
      `${props.documentTitle}`,
      `Mã biên lai: ${props.invoiceCode}`,
      `Ngày lập: ${props.issueDate}`,
      `Học viên: ${props.studentName}`,
      `Người thanh toán: ${props.payerName}`,
      `Người nhận: ${props.receiverName}`,
      props.receiverBankName ? `Ngân hàng: ${props.receiverBankName}` : null,
      props.receiverBankAccount ? `STK: ${props.receiverBankAccount}` : null,
      props.receiptSummary ? `Nội dung: ${props.receiptSummary}` : null,
      '',
      'Chi tiết:',
      ...props.lineItems.map(
        (r, i) =>
          `${i + 1}. ${r.date} | ${r.memo} | ${r.referenceCode ?? '—'} | ${this.formatVnd(r.amount)} VND`,
      ),
      `Tổng: ${this.formatVnd(props.totalAmount)} VND`,
      balanceAfter != null
        ? `\nSố dư ví sau nạp: ${this.formatVnd(balanceAfter)} VND`
        : '',
      '',
      'Đính kèm: file PDF biên lai (nếu hệ thống sinh PDF thành công).',
      '',
      'Nếu Quý phụ huynh không thực hiện giao dịch này, vui lòng liên hệ trung tâm ngay.',
      '',
      'Trân trọng,',
      'Unicorns Edu',
    ]
      .filter((x) => x !== null)
      .join('\n');
    return lines;
  }

  private buildReceiptInlineImages(images: ReceiptImageDataUris | null): {
    props: ReceiptImageSourceProps;
    attachments: NonNullable<SendMailOptions['attachments']>;
  } {
    const props: ReceiptImageSourceProps = {
      logoMainSrc: null,
      logoTinSrc: null,
      stampSrc: null,
    };
    const attachments: NonNullable<SendMailOptions['attachments']> = [];
    if (!images) {
      return { props, attachments };
    }

    for (const image of RECEIPT_INLINE_IMAGES) {
      const parsed = this.parseReceiptImageDataUri(images[image.key]);
      if (!parsed) {
        continue;
      }
      props[image.prop] = `cid:${image.cid}`;
      attachments.push({
        filename: image.filename,
        content: parsed.content,
        contentType: parsed.contentType,
        cid: image.cid,
      });
    }

    return { props, attachments };
  }

  private buildAuthBrandLogoInlineImage(): {
    logoSrc: string | null;
    attachments: NonNullable<SendMailOptions['attachments']>;
  } {
    const images = this.receiptAssetsService.getReceiptImageDataUris();
    const parsed = this.parseReceiptImageDataUri(images?.logoMain);
    if (!parsed) {
      return { logoSrc: null, attachments: [] };
    }

    return {
      logoSrc: `cid:${AUTH_BRAND_LOGO_CID}`,
      attachments: [
        {
          filename: 'unicorns-edu-logo.png',
          content: parsed.content,
          contentType: parsed.contentType,
          cid: AUTH_BRAND_LOGO_CID,
        },
      ],
    };
  }

  private parseReceiptImageDataUri(
    dataUri: string | null | undefined,
  ): { content: Buffer; contentType: string } | null {
    const match = dataUri?.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) {
      return null;
    }

    return {
      contentType: match[1],
      content: Buffer.from(match[2], 'base64'),
    };
  }

  private async sendMailOrThrow(options: SendMailOptions): Promise<void> {
    if (!this.transporter) {
      throw new ServiceUnavailableException(
        'Chưa cấu hình gửi email (SMTP). Vui lòng cấu hình SMTP trong .env hoặc liên hệ quản trị viên.',
      );
    }

    try {
      await this.transporter.sendMail(options);
    } catch (error) {
      throw this.buildSmtpException(error);
    }
  }

  private buildSmtpException(error: unknown): ServiceUnavailableException {
    const smtpError = error as SmtpError;
    this.logger.warn(
      `SMTP send failed: code=${smtpError.code ?? 'unknown'} responseCode=${smtpError.responseCode ?? 'unknown'} command=${smtpError.command ?? 'unknown'}`,
    );

    if (smtpError.code === 'EAUTH' || smtpError.responseCode === 535) {
      return new ServiceUnavailableException(
        'Đăng nhập SMTP thất bại. Vui lòng kiểm tra SMTP_USER và SMTP_PASS trong apps/api/.env; nếu dùng Gmail, SMTP_PASS phải là App Password 16 ký tự.',
      );
    }

    if (
      smtpError.code === 'ECONNECTION' ||
      smtpError.code === 'ESOCKET' ||
      smtpError.code === 'ETIMEDOUT' ||
      smtpError.code === 'ECONNREFUSED'
    ) {
      return new ServiceUnavailableException(
        'Không kết nối được máy chủ SMTP. Vui lòng kiểm tra SMTP_HOST, SMTP_PORT, SMTP_SECURE và kết nối mạng.',
      );
    }

    return new ServiceUnavailableException(
      'Không gửi được email qua SMTP. Vui lòng kiểm tra cấu hình SMTP hoặc liên hệ quản trị viên.',
    );
  }

  private getSmtpPassword(host: string): string | undefined {
    const password = this.configService.get<string>('SMTP_PASS');
    if (!password) {
      return password;
    }

    const compactPassword = password.replace(/\s/g, '');
    if (
      host.toLowerCase().includes('gmail.com') &&
      compactPassword.length === 16
    ) {
      return compactPassword;
    }

    return password;
  }

  private getDirectTopUpApprovalFrontendUrl(): string {
    const configuredUrl = this.configService
      .get<string>('FRONTEND_URL')
      ?.trim();
    const isProduction = process.env.NODE_ENV === 'production';

    if (!configuredUrl) {
      if (isProduction) {
        throw new ServiceUnavailableException(
          'FRONTEND_URL chưa được cấu hình nên không thể tạo link duyệt nạp thẳng cho production.',
        );
      }
      return LOCAL_FRONTEND_URL;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(configuredUrl);
    } catch {
      throw new ServiceUnavailableException(
        'FRONTEND_URL không hợp lệ nên không thể tạo link duyệt nạp thẳng.',
      );
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new ServiceUnavailableException(
        'FRONTEND_URL phải dùng giao thức http hoặc https.',
      );
    }

    if (isProduction) {
      if (parsedUrl.protocol !== 'https:') {
        throw new ServiceUnavailableException(
          'FRONTEND_URL production phải dùng HTTPS để bảo vệ link duyệt nạp thẳng.',
        );
      }
      if (this.isUnsafeProductionFrontendHost(parsedUrl.hostname)) {
        throw new ServiceUnavailableException(
          'FRONTEND_URL production phải trỏ tới domain public thật, không dùng localhost hoặc example.com.',
        );
      }
    }

    return configuredUrl.replace(/\/+$/, '');
  }

  private isUnsafeProductionFrontendHost(hostname: string): boolean {
    const normalizedHostname = hostname.trim().toLowerCase();
    return (
      UNSAFE_PRODUCTION_FRONTEND_HOSTS.has(normalizedHostname) ||
      normalizedHostname.endsWith('.localhost') ||
      normalizedHostname.endsWith('.example.com') ||
      normalizedHostname.endsWith('.example.net') ||
      normalizedHostname.endsWith('.example.org')
    );
  }

  private normalizeReceiptText(value: string | null | undefined): string {
    const raw = value ?? '';
    let out = '';
    for (let i = 0; i < raw.length; i += 1) {
      const code = raw.charCodeAt(i);
      if (code > 31 && code !== 127) {
        out += raw[i];
      } else {
        out += ' ';
      }
    }
    return out.replace(/\s+/g, ' ').trim();
  }

  private formatVnd(amount: number): string {
    return new Intl.NumberFormat('vi-VN', {
      maximumFractionDigits: 0,
    }).format(amount);
  }
}
