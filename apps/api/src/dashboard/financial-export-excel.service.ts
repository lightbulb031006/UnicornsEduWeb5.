import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import type { AdminDashboardFinancialExportDto } from '../dtos/dashboard.dto';

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFF3F4F6' },
};

const CURRENCY_FORMAT = '#,##0 "₫"';

function styleHeaderRow(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = HEADER_FILL;
    cell.border = { bottom: { style: 'thin' } };
  });
}

/** Xuất báo cáo tài chính admin dashboard sang Excel: sheet 1 doanh thu, sheet 2 chi phí. */
@Injectable()
export class FinancialExportExcelService {
  async toExcelBuffer(
    payload: AdminDashboardFinancialExportDto,
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Unicorns Edu';
    workbook.created = new Date();

    this.buildRevenueSheet(workbook, payload);
    this.buildCostSheet(workbook, payload);

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }

  private buildRevenueSheet(
    workbook: ExcelJS.Workbook,
    payload: AdminDashboardFinancialExportDto,
  ) {
    const sheet = workbook.addWorksheet('Doanh thu');
    sheet.columns = [
      { header: '#', key: 'index', width: 6 },
      { header: 'Học sinh', key: 'studentName', width: 28 },
      { header: 'Lớp', key: 'className', width: 20 },
      { header: 'Lượt học', key: 'attendanceCount', width: 12 },
      { header: 'Doanh thu', key: 'amount', width: 18 },
    ];
    styleHeaderRow(sheet.getRow(1));

    payload.revenueItems.forEach((item, index) => {
      sheet.addRow({
        index: index + 1,
        studentName: item.studentName,
        className: item.className || '—',
        attendanceCount: item.attendanceCount,
        amount: item.amount,
      });
    });

    sheet.getColumn('amount').numFmt = CURRENCY_FORMAT;

    if (payload.meta.revenueTruncated) {
      const note = sheet.addRow([]);
      note.getCell(1).value =
        `Đã cắt bớt — chỉ hiển thị ${payload.meta.revenueItemCount} học sinh đầu (theo số tiền giảm dần).`;
      note.getCell(1).font = { italic: true, color: { argb: 'FF666666' } };
    }
  }

  private buildCostSheet(
    workbook: ExcelJS.Workbook,
    payload: AdminDashboardFinancialExportDto,
  ) {
    const sheet = workbook.addWorksheet('Chi phí');
    sheet.columns = [
      { header: '#', key: 'index', width: 6 },
      { header: 'Mục', key: 'name', width: 28 },
      { header: 'Ghi chú', key: 'note', width: 32 },
      { header: 'Số tiền', key: 'amount', width: 18 },
    ];
    styleHeaderRow(sheet.getRow(1));

    const sectionHeader = (label: string) => {
      const row = sheet.addRow([]);
      row.getCell(2).value = label;
      row.getCell(2).font = { bold: true };
      return row;
    };

    sectionHeader(`Chi phí nhân sự (${payload.meta.personnelItemCount})`);
    payload.personnelItems.forEach((item, index) => {
      sheet.addRow({
        index: index + 1,
        name: item.staffName,
        note: item.note,
        amount: item.amount,
      });
    });
    if (payload.meta.personnelTruncated) {
      const note = sheet.addRow([]);
      note.getCell(2).value =
        `Đã cắt bớt — chỉ hiển thị ${payload.meta.personnelItemCount} nhân sự đầu.`;
      note.getCell(2).font = { italic: true, color: { argb: 'FF666666' } };
    }

    sheet.addRow([]);
    sectionHeader(`Chi phí khác (${payload.meta.otherCostItemCount})`);
    payload.otherCostItems.forEach((item, index) => {
      sheet.addRow({
        index: index + 1,
        name: item.label,
        note: item.note,
        amount: item.amount,
      });
    });
    if (payload.meta.otherCostTruncated) {
      const note = sheet.addRow([]);
      note.getCell(2).value =
        `Đã cắt bớt — chỉ hiển thị ${payload.meta.otherCostItemCount} dòng đầu.`;
      note.getCell(2).font = { italic: true, color: { argb: 'FF666666' } };
    }

    sheet.getColumn('amount').numFmt = CURRENCY_FORMAT;
  }
}
