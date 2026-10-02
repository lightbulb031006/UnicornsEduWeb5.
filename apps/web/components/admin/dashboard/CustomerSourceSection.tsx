"use client";

import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AdminDashboardCustomerSourceRow } from "@/dtos/dashboard.dto";
import { formatVnInteger } from "@/lib/formatters";

function formatCurrency(value: number) {
  return `${formatVnInteger(value)} đ`;
}

function formatShare(value: number) {
  return `${new Intl.NumberFormat("vi-VN", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value)}%`;
}

const linkClassName =
  "text-left font-semibold text-primary underline-offset-2 transition-colors hover:text-primary-hover hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus";

export function CustomerSourceSection({
  rows,
  dimmed = false,
  onOpen,
}: {
  rows: AdminDashboardCustomerSourceRow[];
  dimmed?: boolean;
  onOpen: (row: AdminDashboardCustomerSourceRow) => void;
}) {
  return (
    <section
      className={`overflow-hidden rounded-xl border border-border-default bg-bg-surface shadow-sm transition-opacity ${
        dimmed ? "opacity-70" : ""
      }`}
    >
      <div className="px-5 py-4 sm:px-6 sm:py-5">
        <h2 className="text-base font-bold tracking-tight text-text-primary sm:text-lg">Nguồn khách</h2>
        <p className="mt-1 text-sm leading-6 text-text-secondary">
          Số học sinh và học phí đã học trong kỳ đang xem, theo nguồn hiện tại trên hồ sơ.
        </p>
      </div>

      <div className="space-y-3 border-t border-border-default p-4 md:hidden">
        {rows.map((row) => (
          <article key={row.key} className="rounded-xl border border-border-default bg-bg-surface px-4 py-3 shadow-sm">
            <button type="button" onClick={() => onOpen(row)} className={`${linkClassName} text-sm`}>
              {row.label}
            </button>
            <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-border-default/70 pt-3">
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Khách</dt>
                <dd className="mt-1 text-sm font-semibold tabular-nums text-text-primary">{formatVnInteger(row.studentCount)}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Doanh thu</dt>
                <dd className="mt-1 text-sm font-semibold tabular-nums text-text-primary">{formatCurrency(row.revenue)}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Tỷ trọng</dt>
                <dd className="mt-1 text-sm font-semibold tabular-nums text-text-primary">{formatShare(row.sharePercent)}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>

      <div className="hidden overflow-x-auto border-t border-border-default md:block">
        <Table>
          <TableCaption className="sr-only">
            Thống kê nguồn khách theo học phí đã học trong kỳ. Bấm tên nguồn để xem danh sách học sinh.
          </TableCaption>
          <TableHeader>
            <TableRow className="border-border-default hover:bg-transparent">
              <TableHead className="h-auto min-w-[220px] py-3.5 pl-5 text-left text-xs font-semibold uppercase tracking-[0.14em] text-text-muted sm:pl-6">
                Nguồn
              </TableHead>
              <TableHead className="h-auto min-w-[100px] py-3.5 text-right text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">
                Khách
              </TableHead>
              <TableHead className="h-auto min-w-[160px] py-3.5 text-right text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">
                Doanh thu
              </TableHead>
              <TableHead className="h-auto min-w-[110px] py-3.5 pr-5 text-right text-xs font-semibold uppercase tracking-[0.14em] text-text-muted sm:pr-6">
                Tỷ trọng
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.key} className="border-border-default/80 hover:bg-bg-secondary/25">
                <TableCell className="py-4 pl-5 sm:pl-6">
                  <button type="button" onClick={() => onOpen(row)} className={`${linkClassName} text-sm`}>
                    {row.label}
                  </button>
                </TableCell>
                <TableCell className="py-4 text-right text-sm tabular-nums text-text-primary">
                  {formatVnInteger(row.studentCount)}
                </TableCell>
                <TableCell className="py-4 text-right text-sm font-semibold tabular-nums text-text-primary">
                  {formatCurrency(row.revenue)}
                </TableCell>
                <TableCell className="py-4 pr-5 text-right text-sm tabular-nums text-text-primary sm:pr-6">
                  {formatShare(row.sharePercent)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
