import { Injectable } from '@nestjs/common';
import { ReceiptPdfService } from 'src/mail/receipt-pdf.service';
import type { AdminDashboardFinancialExportDto } from '../dtos/dashboard.dto';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(value);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Render báo cáo tài chính admin dashboard sang PDF (qua puppeteer, dùng chung ReceiptPdfService). */
@Injectable()
export class FinancialExportPdfService {
  constructor(private readonly receiptPdfService: ReceiptPdfService) {}

  private renderSummaryTable(payload: AdminDashboardFinancialExportDto) {
    const rows: Array<[string, number]> = [
      ['Tổng nạp (Dòng tiền vào)', payload.summary.topup],
      ['Học phí đã học (Doanh thu)', payload.summary.revenue],
      ['Chi phí nhân sự', payload.summary.personnelCost],
      ['Chi phí khác', payload.summary.otherCost],
      ['Lợi nhuận thực tế', payload.summary.profit],
      ['Dòng tiền thuần', payload.summary.totalIn],
    ];

    return `
      <table>
        <thead>
          <tr><th>Danh mục</th><th class="num">Giá trị</th></tr>
        </thead>
        <tbody>
          ${rows
            .map(
              ([label, amount]) =>
                `<tr><td>${escapeHtml(label)}</td><td class="num">${escapeHtml(formatCurrency(amount))}</td></tr>`,
            )
            .join('')}
        </tbody>
      </table>
    `;
  }

  private renderRevenueTable(payload: AdminDashboardFinancialExportDto) {
    if (payload.revenueItems.length === 0) {
      return `<p class="empty">Chưa có dòng doanh thu trong kỳ.</p>`;
    }

    const truncatedNote = payload.meta.revenueTruncated
      ? `<p class="note">Đã cắt bớt — chỉ hiển thị ${payload.meta.revenueItemCount} học sinh đầu (theo số tiền giảm dần).</p>`
      : '';

    return `
      ${truncatedNote}
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Học sinh</th>
            <th>Lớp</th>
            <th class="num">Lượt học</th>
            <th class="num">Doanh thu</th>
          </tr>
        </thead>
        <tbody>
          ${payload.revenueItems
            .map(
              (item, index) => `
            <tr>
              <td>${index + 1}</td>
              <td>${escapeHtml(item.studentName)}</td>
              <td>${escapeHtml(item.className || '—')}</td>
              <td class="num">${item.attendanceCount}</td>
              <td class="num">${escapeHtml(formatCurrency(item.amount))}</td>
            </tr>`,
            )
            .join('')}
        </tbody>
      </table>
    `;
  }

  private renderPersonnelTable(payload: AdminDashboardFinancialExportDto) {
    if (payload.personnelItems.length === 0) {
      return `<p class="empty">Chưa có chi phí nhân sự trong kỳ.</p>`;
    }

    const truncatedNote = payload.meta.personnelTruncated
      ? `<p class="note">Đã cắt bớt — chỉ hiển thị ${payload.meta.personnelItemCount} nhân sự đầu.</p>`
      : '';

    return `
      ${truncatedNote}
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Nhân sự</th>
            <th>Chi tiết</th>
            <th class="num">Chi phí</th>
          </tr>
        </thead>
        <tbody>
          ${payload.personnelItems
            .map(
              (item, index) => `
            <tr>
              <td>${index + 1}</td>
              <td>${escapeHtml(item.staffName)}</td>
              <td>${escapeHtml(item.note)}</td>
              <td class="num">${escapeHtml(formatCurrency(item.amount))}</td>
            </tr>`,
            )
            .join('')}
        </tbody>
      </table>
    `;
  }

  private renderOtherCostTable(payload: AdminDashboardFinancialExportDto) {
    if (payload.otherCostItems.length === 0) {
      return `<p class="empty">Chưa có chi phí khác trong kỳ.</p>`;
    }

    const truncatedNote = payload.meta.otherCostTruncated
      ? `<p class="note">Đã cắt bớt — chỉ hiển thị ${payload.meta.otherCostItemCount} dòng đầu.</p>`
      : '';

    return `
      ${truncatedNote}
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Mô tả</th>
            <th>Ghi chú</th>
            <th class="num">Số tiền</th>
          </tr>
        </thead>
        <tbody>
          ${payload.otherCostItems
            .map(
              (item, index) => `
            <tr>
              <td>${index + 1}</td>
              <td>${escapeHtml(item.label)}</td>
              <td>${escapeHtml(item.note)}</td>
              <td class="num">${escapeHtml(formatCurrency(item.amount))}</td>
            </tr>`,
            )
            .join('')}
        </tbody>
      </table>
    `;
  }

  private buildHtml(payload: AdminDashboardFinancialExportDto) {
    const generatedAt = new Intl.DateTimeFormat('vi-VN', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date());

    return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <title>Báo cáo tài chính — ${escapeHtml(payload.period.monthLabel)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
      color: #111;
      margin: 24px;
      font-size: 12px;
      line-height: 1.45;
    }
    h1 { font-size: 20px; margin: 0 0 4px; }
    h2 { font-size: 14px; margin: 24px 0 8px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
    .meta { color: #555; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; vertical-align: top; }
    th { background: #f3f4f6; font-weight: 600; }
    td.num, th.num { text-align: right; white-space: nowrap; }
    .empty, .note { color: #666; font-style: italic; margin: 8px 0; }
  </style>
</head>
<body>
  <h1>Báo cáo tài chính Unicorns Edu</h1>
  <p class="meta">Kỳ: <strong>${escapeHtml(payload.period.monthLabel)}</strong> · Xuất lúc ${escapeHtml(generatedAt)}</p>

  <h2>Tóm tắt</h2>
  ${this.renderSummaryTable(payload)}

  <h2>Doanh thu theo học sinh (${payload.meta.revenueItemCount})</h2>
  ${this.renderRevenueTable(payload)}

  <h2>Chi phí nhân sự (${payload.meta.personnelItemCount})</h2>
  ${this.renderPersonnelTable(payload)}

  <h2>Chi phí khác (${payload.meta.otherCostItemCount})</h2>
  ${this.renderOtherCostTable(payload)}
</body>
</html>`;
  }

  async toPdfBuffer(
    payload: AdminDashboardFinancialExportDto,
  ): Promise<Buffer> {
    const html = this.buildHtml(payload);
    const buffer = await this.receiptPdfService.renderToPdf(html);
    if (!buffer) {
      throw new Error(
        'Không tạo được PDF (Chromium không khả dụng trên server).',
      );
    }
    return buffer;
  }
}
