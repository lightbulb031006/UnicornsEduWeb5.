import { Injectable, Logger } from '@nestjs/common';

export type ReceiptPdfRenderOptions = {
  landscape?: boolean;
  margin?: {
    top?: string;
    right?: string;
    bottom?: string;
    left?: string;
  };
};

/**
 * HTML (React Email đã render) → PDF qua Chromium + puppeteer-core.
 * `CHROMIUM_PATH`: macOS Chrome hoặc `/usr/bin/chromium-browser` (Alpine Docker).
 */
@Injectable()
export class ReceiptPdfService {
  private readonly logger = new Logger(ReceiptPdfService.name);

  private readonly chromiumPath: string;

  constructor() {
    this.chromiumPath =
      process.env.CHROMIUM_PATH?.trim() || '/usr/bin/chromium-browser';
  }

  async renderToPdf(
    html: string,
    options?: ReceiptPdfRenderOptions,
  ): Promise<Buffer | null> {
    let pCore: any;
    try {
      pCore = await import('puppeteer-core');
    } catch {
      this.logger.warn('puppeteer-core không load được — bỏ qua PDF.');
      return null;
    }

    const launch: (opts: any) => Promise<any> =
      typeof pCore.launch === 'function'
        ? pCore.launch.bind(pCore)
        : pCore.default?.launch?.bind(pCore.default);

    if (!launch) {
      this.logger.warn('puppeteer-core.launch không tồn tại — bỏ qua PDF.');
      return null;
    }

    let browser: any = null;
    try {
      browser = await launch({
        executablePath: this.chromiumPath,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--font-render-hinting=none',
        ],
        headless: true,
      });

      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'load' });

      const pdfBuffer = await page.pdf({
        format: 'A4',
        landscape: options?.landscape === true,
        printBackground: true,
        margin: {
          top: options?.margin?.top ?? '14mm',
          right: options?.margin?.right ?? '14mm',
          bottom: options?.margin?.bottom ?? '14mm',
          left: options?.margin?.left ?? '14mm',
        },
      });

      return Buffer.from(pdfBuffer);
    } catch (err) {
      this.logger.warn(
        `PDF biên lai thất bại (chromium=${this.chromiumPath}): ${String(err)}`,
      );
      return null;
    } finally {
      if (browser) {
        await browser.close().catch(() => undefined);
      }
    }
  }
}
