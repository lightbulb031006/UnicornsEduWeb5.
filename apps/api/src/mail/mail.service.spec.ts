jest.mock('nodemailer', () => ({
  __esModule: true,
  default: {
    createTransport: jest.fn(),
  },
}));

import type { ReactElement } from 'react';
import * as ReactDOMServer from 'react-dom/server';

jest.mock('@react-email/render', () => ({
  render: (element: ReactElement) =>
    Promise.resolve(
      `<!DOCTYPE html>${ReactDOMServer.renderToStaticMarkup(element)}`,
    ),
}));

import { ServiceUnavailableException } from '@nestjs/common';
import type { SendMailOptions } from 'nodemailer';
import nodemailer from 'nodemailer';
import { MailService } from './mail.service';

function getLastSendMailOptions(
  sendMailFn: jest.MockedFunction<
    (options: SendMailOptions) => Promise<unknown>
  >,
): SendMailOptions {
  const call = sendMailFn.mock.calls[0];
  if (!call?.[0]) {
    throw new Error('sendMail was not called with options');
  }
  return call[0];
}

describe('MailService', () => {
  const sendMail = jest.fn<Promise<unknown>, [SendMailOptions]>();
  const configService = {
    get: jest.fn((key: string) => {
      const values: Record<string, string> = {
        SMTP_HOST: 'smtp.gmail.com',
        SMTP_PORT: '587',
        SMTP_USER: 'sender@gmail.com',
        SMTP_PASS: 'app-password',
        SMTP_SECURE: 'false',
        MAIL_FROM: 'Unicorns Edu <sender@gmail.com>',
        FRONTEND_URL: 'http://localhost:3000',
      };
      return values[key];
    }),
  };

  const receiptPdfService = {
    renderToPdf: jest.fn().mockResolvedValue(null),
  };

  const receiptAssetsService = {
    getReceiptImageDataUris: jest.fn().mockReturnValue(null),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
  });

  it('sends verification email with React Email HTML and plain-text fallback', async () => {
    sendMail.mockResolvedValueOnce(undefined);
    const service = new MailService(
      configService as never,
      receiptPdfService as never,
      receiptAssetsService as never,
    );

    await service.sendVerificationEmail('user@example.com', 'verify-token');

    expect(sendMail).toHaveBeenCalledTimes(1);
    const sent = getLastSendMailOptions(sendMail);
    expect(sent.to).toBe('user@example.com');
    expect(sent.subject).toContain('Xác thực email');
    expect(sent.text).toContain('user@example.com');
    expect(sent.text).toContain(
      'http://localhost:3000/verify-email?token=verify-token',
    );
    expect(sent.html).toContain('Xác thực email tài khoản');
    expect(sent.html).toContain('user@example.com');
    expect(sent.html).toContain(
      'http://localhost:3000/verify-email?token=verify-token',
    );
  });

  it('reports SMTP authentication failures as service unavailable', async () => {
    sendMail.mockRejectedValueOnce(
      Object.assign(new Error('Invalid login'), {
        code: 'EAUTH',
        responseCode: 535,
      }),
    );
    const service = new MailService(
      configService as never,
      receiptPdfService as never,
      receiptAssetsService as never,
    );

    await expect(
      service.sendVerificationEmail('user@example.com', 'token'),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('removes Gmail app password grouping spaces before creating the transport', () => {
    configService.get.mockImplementation((key: string) => {
      const values: Record<string, string> = {
        SMTP_HOST: 'smtp.gmail.com',
        SMTP_PORT: '587',
        SMTP_USER: 'sender@gmail.com',
        SMTP_PASS: 'abcd efgh ijkl mnop',
        SMTP_SECURE: 'false',
        MAIL_FROM: 'Unicorns Edu <sender@gmail.com>',
        FRONTEND_URL: 'http://localhost:3000',
      };
      return values[key];
    });

    new MailService(
      configService as never,
      receiptPdfService as never,
      receiptAssetsService as never,
    );

    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: {
          user: 'sender@gmail.com',
          pass: 'abcdefghijklmnop',
        },
      }),
    );
  });

  it('rejects production direct top-up approval emails when FRONTEND_URL is unsafe', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    configService.get.mockImplementation((key: string) => {
      const values: Record<string, string> = {
        SMTP_HOST: 'smtp.gmail.com',
        SMTP_PORT: '587',
        SMTP_USER: 'sender@gmail.com',
        SMTP_PASS: 'app-password',
        SMTP_SECURE: 'false',
        MAIL_FROM: 'Unicorns Edu <sender@gmail.com>',
        FRONTEND_URL: 'http://localhost:3000',
      };
      return values[key];
    });
    const service = new MailService(
      configService as never,
      receiptPdfService as never,
      receiptAssetsService as never,
    );

    try {
      await expect(
        service.sendStudentWalletDirectTopUpApprovalEmail({
          to: 'admin@unicornsedu.com',
          token: 'approval-token',
          studentName: 'Nguyen Van A',
          studentId: 'student-1',
          amount: 500000,
          reason: 'Phụ huynh chuyển khoản ngoài SePay',
          requestedByEmail: 'care@example.com',
          expiresAt: new Date('2026-05-30T03:00:00.000Z'),
        }),
      ).rejects.toThrow('FRONTEND_URL');
      expect(sendMail).not.toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it('sends a wallet top-up receipt to the exact parent email', async () => {
    sendMail.mockResolvedValueOnce(undefined);
    const service = new MailService(
      configService as never,
      receiptPdfService as never,
      receiptAssetsService as never,
    );

    await service.sendStudentWalletTopUpReceiptEmail({
      to: 'parent@example.com',
      parentName: 'Phụ huynh A',
      studentName: 'Nguyễn Minh',
      amountReceived: 150000,
      orderCode: 'UEDU-20260511-001',
      transactionDate: '2026-05-11 09:30:00',
      referenceCode: 'FT26069ABC',
      balanceAfter: 450000,
      extensionClassNames: ['Toán 8A', 'Lý 8A'],
    });

    expect(sendMail).toHaveBeenCalledTimes(1);
    const sent = getLastSendMailOptions(sendMail);
    expect(sent.from).toBe('Unicorns Edu <sender@gmail.com>');
    expect(sent.to).toBe('parent@example.com');
    expect(sent.subject).toContain('UEDU-20260511-001');
    expect(sent.text).toContain('Nguyễn Minh');
    expect(sent.html).toContain('Nguyễn Minh');
    expect(sent.text).toContain('150.000');
    expect(sent.text).toContain('UEDU-20260511-001');
    expect(sent.text).toContain('FT26069ABC');
    expect(sent.text).toContain(
      'Em học sinh Nguyễn Minh gia hạn khoá Toán 8A và Lý 8A số tiền 150.000 VNĐ.',
    );
    expect(sent.html).toContain('150.000');
    expect(sent.html).toContain('UEDU-20260511-001');
    expect(sent.html).toContain('Toán 8A và Lý 8A');
    expect(receiptPdfService.renderToPdf).toHaveBeenCalled();
  });

  it('embeds receipt images as inline CID attachments while keeping data URIs for the PDF', async () => {
    sendMail.mockResolvedValueOnce(undefined);
    receiptAssetsService.getReceiptImageDataUris.mockReturnValueOnce({
      logoMain: `data:image/png;base64,${Buffer.from('main-logo').toString('base64')}`,
      logoTin: `data:image/png;base64,${Buffer.from('tin-logo').toString('base64')}`,
      stamp: `data:image/png;base64,${Buffer.from('stamp').toString('base64')}`,
    });
    const service = new MailService(
      configService as never,
      receiptPdfService as never,
      receiptAssetsService as never,
    );

    await service.sendStudentWalletTopUpReceiptEmail({
      to: 'parent@example.com',
      studentName: 'Nguyễn Minh',
      amountReceived: 50000,
      orderCode: 'ORD-123',
    });

    const sent = getLastSendMailOptions(sendMail);
    expect(sent.html).toContain('src="cid:receipt-logo-main@unicorns-edu"');
    expect(sent.html).toContain('src="cid:receipt-logo-tin@unicorns-edu"');
    expect(sent.html).toContain('src="cid:receipt-stamp@unicorns-edu"');
    expect(sent.html).not.toContain('data:image/png;base64');
    expect(sent.attachments).toHaveLength(3);
    expect(sent.attachments?.map((a) => a.cid)).toEqual([
      'receipt-logo-main@unicorns-edu',
      'receipt-logo-tin@unicorns-edu',
      'receipt-stamp@unicorns-edu',
    ]);
    expect(Buffer.isBuffer(sent.attachments?.[0].content)).toBe(true);
    expect(receiptPdfService.renderToPdf).toHaveBeenCalledWith(
      expect.stringContaining('data:image/png;base64'),
    );
  });

  it('escapes risky HTML content in wallet top-up receipts', async () => {
    sendMail.mockResolvedValueOnce(undefined);
    const service = new MailService(
      configService as never,
      receiptPdfService as never,
      receiptAssetsService as never,
    );

    await service.sendStudentWalletTopUpReceiptEmail({
      to: 'parent@example.com',
      parentName: '<img src=x onerror=alert(1)>',
      studentName: 'An <script>alert(1)</script>',
      amountReceived: 1000,
      orderCode: 'ORD-<script>alert(1)</script>',
      referenceCode: '<b>REF</b>',
    });

    const sent = getLastSendMailOptions(sendMail);
    expect(sent.html).not.toContain('<script>');
    expect(sent.html).not.toContain('<img');
    expect(sent.html).not.toContain('<img src=x onerror=alert(1)>');
    expect(sent.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(sent.html).toContain('&lt;script&gt;');
    expect(sent.html).toContain('&lt;b&gt;REF&lt;/b&gt;');
  });

  it('maps receipt SMTP authentication failures as service unavailable', async () => {
    sendMail.mockRejectedValueOnce(
      Object.assign(new Error('Invalid login'), {
        code: 'EAUTH',
        responseCode: 535,
      }),
    );
    const service = new MailService(
      configService as never,
      receiptPdfService as never,
      receiptAssetsService as never,
    );

    await expect(
      service.sendStudentWalletTopUpReceiptEmail({
        to: 'parent@example.com',
        studentName: 'Nguyễn Minh',
        amountReceived: 150000,
        orderCode: 'UEDU-20260511-001',
      }),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('attaches PDF when renderToPdf returns a buffer', async () => {
    sendMail.mockResolvedValueOnce(undefined);
    receiptPdfService.renderToPdf.mockResolvedValueOnce(
      Buffer.from('%PDF-1.4 test'),
    );
    const service = new MailService(
      configService as never,
      receiptPdfService as never,
      receiptAssetsService as never,
    );

    await service.sendStudentWalletTopUpReceiptEmail({
      to: 'parent@example.com',
      studentName: 'Nguyễn Minh',
      amountReceived: 50000,
      orderCode: 'ORD-123',
    });

    const sent = getLastSendMailOptions(sendMail);
    const attachments = sent.attachments;
    expect(attachments).toBeDefined();
    expect(attachments).toHaveLength(1);
    expect(attachments![0].filename).toBe('bien-lai-ORD-123.pdf');
    expect(attachments![0].contentType).toBe('application/pdf');
  });
});
