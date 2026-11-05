import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import type { Browser, HTTPRequest, Page } from 'puppeteer-core';
import {
  ANSWER_SECTION_ID,
  PAGE_COUNT_ELEMENT_ID,
  buildExamFooterTemplate,
} from './exam-print-html';
import { chooseOptionColumns, type OptionColumns } from './option-columns';

/** Bề rộng vùng in A4 trừ lề trái/phải 15mm, theo px CSS (96 dpi). */
const CONTENT_WIDTH_PX = Math.round(((210 - 30) * 96) / 25.4);
const PDF_MARGIN = { top: '14mm', right: '15mm', bottom: '16mm', left: '15mm' };
const OPTION_GAP_PX = Math.round((10 * 96) / 72);
const CACHE_MAX_ENTRIES = 40;
const MAX_CONCURRENT_RENDERS = 2;
const RENDER_TIMEOUT_MS = 45_000;

export interface ExamPdfRenderRequest {
  /** HTML trước khi ký ảnh — làm khoá cache (URL ký đổi mỗi lần, nội dung thì không). */
  unsignedHtml: string;
  /** Ký URL ảnh vào HTML; chỉ gọi khi cache trượt. */
  signImages: (html: string) => Promise<string>;
  lessonTitle: string;
  withAnswers: boolean;
}

/** Đếm trang của PDF Chromium: lấy `/Count` lớn nhất (gốc cây trang). */
export function countPdfPages(pdf: Uint8Array): number {
  const text = Buffer.from(pdf).toString('latin1');
  let max = 0;
  for (const match of text.matchAll(
    /\/Type\s*\/Pages\b[^>]*?\/Count\s+(\d+)/g,
  )) {
    max = Math.max(max, Number(match[1]));
  }
  for (const match of text.matchAll(
    /\/Count\s+(\d+)[^>]*?\/Type\s*\/Pages\b/g,
  )) {
    max = Math.max(max, Number(match[1]));
  }
  return max;
}

/** "Đề có 04 trang" — hai chữ số như đề của Bộ. */
export function formatPageCount(pages: number): string {
  return String(pages).padStart(2, '0');
}

/**
 * HTML Đề in → PDF qua Chromium (`CHROMIUM_PATH`, như ReceiptPdfService).
 * - Hai lượt `pdf()` trên cùng một trang: lượt đầu đếm số trang phần đề (ẩn
 *   trang đáp án), lượt sau in thật với "Đề có N trang".
 * - Chỉ cho request `data:`/`about:` và origin Supabase (ảnh đã ký): nội dung
 *   do phía dạy soạn không gọi được ra ngoài từ server.
 * - Cache LRU theo hash HTML chưa ký + gộp các request trùng đang render.
 */
@Injectable()
export class ExamPdfRendererService {
  private readonly logger = new Logger(ExamPdfRendererService.name);
  private readonly chromiumPath =
    process.env.CHROMIUM_PATH?.trim() || '/usr/bin/chromium-browser';
  private readonly cache = new Map<string, Buffer>();
  private readonly inFlight = new Map<string, Promise<Buffer>>();
  private readonly waiters: Array<() => void> = [];
  private activeRenders = 0;
  private katexCss: string | null = null;

  /** KaTeX CSS với font woff2 nhúng base64 — đọc một lần. */
  getKatexCss(): string {
    if (this.katexCss !== null) return this.katexCss;
    try {
      const cssPath = require.resolve('katex/dist/katex.min.css');
      const fontsDir = join(dirname(cssPath), 'fonts');
      this.katexCss = readFileSync(cssPath, 'utf8').replace(
        /src:url\(fonts\/([^)]+?)\.woff2\) format\("woff2"\)(?:,url\([^)]*\) format\("[^"]*"\))*/g,
        (_, name: string) => {
          const font = readFileSync(join(fontsDir, `${name}.woff2`));
          return `src:url(data:font/woff2;base64,${font.toString('base64')}) format("woff2")`;
        },
      );
    } catch (err) {
      this.logger.warn(`Không đọc được KaTeX CSS: ${String(err)}`);
      this.katexCss = '';
    }
    return this.katexCss;
  }

  async render(request: ExamPdfRenderRequest): Promise<Buffer> {
    const key = createHash('sha256')
      .update(request.unsignedHtml)
      .update(request.withAnswers ? '\u0000answers' : '\u0000exam')
      .digest('hex');

    const cached = this.cache.get(key);
    if (cached) {
      this.cache.delete(key);
      this.cache.set(key, cached);
      return cached;
    }

    const pending = this.inFlight.get(key);
    if (pending) return pending;

    const job = this.withRenderSlot(async () => {
      const html = await request.signImages(request.unsignedHtml);
      return this.renderPdf(html, request);
    })
      .then((pdf) => {
        this.cache.set(key, pdf);
        if (this.cache.size > CACHE_MAX_ENTRIES) {
          // Map giữ thứ tự chèn → khoá đầu tiên là khoá dùng lâu nhất.
          for (const oldest of this.cache.keys()) {
            this.cache.delete(oldest);
            break;
          }
        }
        return pdf;
      })
      .finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, job);
    return job;
  }

  /** Mỗi lượt render mở một Chromium; giới hạn số lượt song song để không ăn hết RAM. */
  private async withRenderSlot<T>(fn: () => Promise<T>): Promise<T> {
    if (this.activeRenders >= MAX_CONCURRENT_RENDERS) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    this.activeRenders += 1;
    try {
      return await fn();
    } finally {
      this.activeRenders -= 1;
      this.waiters.shift()?.();
    }
  }

  private allowedOrigins(): Set<string> {
    const origins = new Set<string>();
    const supabaseUrl = process.env.SUPABASE_URL?.trim();
    if (supabaseUrl) {
      try {
        origins.add(new URL(supabaseUrl).origin);
      } catch {
        // URL sai cấu hình → không ảnh nào tải được, PDF vẫn in phần chữ.
      }
    }
    return origins;
  }

  private async launch(): Promise<Browser> {
    const { default: puppeteer } = await import('puppeteer-core');
    return puppeteer.launch({
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
  }

  private async guardRequests(page: Page): Promise<void> {
    const origins = this.allowedOrigins();
    await page.setRequestInterception(true);
    page.on('request', (req: HTTPRequest) => {
      const url = req.url();
      let allowed = url.startsWith('data:') || url.startsWith('about:');
      if (!allowed) {
        try {
          const parsed = new URL(url);
          allowed = parsed.protocol === 'https:' && origins.has(parsed.origin);
        } catch {
          allowed = false;
        }
      }
      void (allowed ? req.continue() : req.abort('blockedbyclient'));
    });
  }

  private async layoutOptions(page: Page): Promise<void> {
    const measured = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('.options')).map(
        (box) => {
          box.classList.add('measuring');
          const widths = Array.from(
            box.querySelectorAll<HTMLElement>(':scope > .opt'),
          ).map((opt) => Math.ceil(opt.getBoundingClientRect().width));
          box.classList.remove('measuring');
          return { widths, rowWidth: box.clientWidth };
        },
      ),
    );
    const columns: OptionColumns[] = measured.map(({ widths, rowWidth }) =>
      chooseOptionColumns(widths, rowWidth, OPTION_GAP_PX),
    );
    await page.evaluate((cols: number[]) => {
      document.querySelectorAll<HTMLElement>('.options').forEach((box, i) => {
        box.dataset.cols = String(cols[i] ?? 1);
      });
    }, columns);
  }

  private async renderPdf(
    html: string,
    request: ExamPdfRenderRequest,
  ): Promise<Buffer> {
    let browser: Browser | null = null;
    try {
      browser = await this.launch();
      const page = await browser.newPage();
      page.setDefaultTimeout(RENDER_TIMEOUT_MS);
      await page.setViewport({ width: CONTENT_WIDTH_PX, height: 1200 });
      await this.guardRequests(page);
      await page.setContent(html, { waitUntil: 'load' });
      await this.layoutOptions(page);

      const pdfOptions = {
        format: 'A4' as const,
        printBackground: true,
        margin: PDF_MARGIN,
        displayHeaderFooter: true,
        headerTemplate: '<div></div>',
        footerTemplate: buildExamFooterTemplate(request.lessonTitle),
      };

      // Lượt 1: chỉ phần đề, để đếm "Đề có N trang".
      await page.evaluate((id: string) => {
        document.getElementById(id)?.classList.add('hidden');
      }, ANSWER_SECTION_ID);
      const examPages = countPdfPages(await page.pdf(pdfOptions));
      if (examPages < 1) throw new Error('Không đếm được số trang PDF.');

      await page.evaluate(
        (countId: string, answersId: string, count: string) => {
          const el = document.getElementById(countId);
          if (el) el.textContent = count;
          document.getElementById(answersId)?.classList.remove('hidden');
        },
        PAGE_COUNT_ELEMENT_ID,
        ANSWER_SECTION_ID,
        formatPageCount(examPages),
      );
      return Buffer.from(await page.pdf(pdfOptions));
    } catch (err) {
      this.logger.error(
        `Render Đề in thất bại: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw err;
    } finally {
      await browser?.close().catch(() => undefined);
    }
  }
}
