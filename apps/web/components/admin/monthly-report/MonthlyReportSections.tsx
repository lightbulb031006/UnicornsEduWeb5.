"use client";

import type { ReactNode } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type {
  AdminMonthlyReport,
  MonthlyReportCustomerCareRow,
} from "@/dtos/dashboard.dto";
import { useRowLink } from "@/hooks/use-row-link";
import { formatVnDate, formatVnInteger } from "@/lib/formatters";
import {
  MONTHLY_REPORT_NONE_KEY,
  MONTHLY_REPORT_UNPLACED_LABEL,
  buildMonthlyReportMatrix,
  countEarningNewStudents,
  formatCustomerSourceKey,
  formatEarlyDropBreakdown,
  formatMillions,
  formatSignedCount,
} from "@/lib/monthly-report";
import { cn } from "@/lib/utils";
import type { StudentCustomerSource } from "@/dtos/student.dto";

export function ReportSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold text-text-primary">{title}</h2>
        {description ? <p className="mt-1 text-sm text-text-secondary">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function ScrollTable({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="min-w-max rounded-lg border border-border-default">{children}</div>
    </div>
  );
}

function KpiCard({ label, value, hint, tone }: { label: string; value: ReactNode; hint: ReactNode; tone?: "up" | "down" }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border-default bg-bg-surface p-3">
      <span className="text-xs text-text-muted">{label}</span>
      <span
        className={cn(
          "text-xl font-semibold tabular-nums text-text-primary",
          tone === "up" && "text-success",
          tone === "down" && "text-error",
        )}
      >
        {value}
      </span>
      <span className="text-xs text-text-secondary">{hint}</span>
    </div>
  );
}

/** «2/5» kèm dòng phụ «1 cũ · 1 thử» khi có nghỉ sớm. */
function EarlyDropRatio({ total, oldCount, newCount }: { total: number; oldCount: number; newCount: number }) {
  const breakdown = formatEarlyDropBreakdown(total, oldCount);
  return (
    <div className="flex flex-col items-end leading-tight">
      <span className={cn(total > 0 ? "text-error" : "text-success")}>
        {total}/{newCount}
      </span>
      {breakdown ? <span className="text-xs font-normal text-text-muted">{breakdown}</span> : null}
    </div>
  );
}

export function MonthlyReportKpis({ report }: { report: AdminMonthlyReport }) {
  const { kpi } = report;
  const stillActivePercent = kpi.newStudents > 0 ? Math.round((kpi.newStillActive / kpi.newStudents) * 100) : null;
  const careStaffCount = report.customerCare.filter((row) => row.staffId != null).length;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      <KpiCard
        label="Tổng nạp"
        value={formatMillions(kpi.totalTopUpInMonth)}
        hint={`${formatVnInteger(kpi.topUpTransactionCount)} lần nạp`}
      />
      <KpiCard label="Đang học" value={formatVnInteger(kpi.activeStudents)} hint={`qua ${careStaffCount} nhân sự CSKH`} />
      <KpiCard label="Học sinh mới" value={`+${kpi.newStudents}`} hint="theo lần nạp đầu" tone="up" />
      <KpiCard
        label="Học sinh cũ nghỉ"
        value={kpi.droppedStudents > 0 ? `−${kpi.droppedStudents}` : "0"}
        hint={`+ ${kpi.trialDroppedStudents} thử nghỉ (không tính)`}
        tone={kpi.droppedStudents > 0 ? "down" : undefined}
      />
      <KpiCard
        label="Tăng ròng"
        value={formatSignedCount(kpi.netChange)}
        hint="mới trừ nghỉ"
        tone={kpi.netChange > 0 ? "up" : kpi.netChange < 0 ? "down" : undefined}
      />
      <KpiCard
        label="Học sinh mới còn học"
        value={`${kpi.newStillActive}/${kpi.newStudents}`}
        hint={
          stillActivePercent == null
            ? "chưa có học sinh mới"
            : `${stillActivePercent}% · ${kpi.newStudents - kpi.newStillActive} em nghỉ sớm${
                kpi.newStudents > kpi.newStillActive
                  ? ` (${formatEarlyDropBreakdown(kpi.newStudents - kpi.newStillActive, kpi.earlyDropOldCount)})`
                  : ""
              }`
        }
      />
    </div>
  );
}

function useMatrix(report: AdminMonthlyReport) {
  const courseNames = new Map(report.courses.map((course) => [course.courseId, course.courseName]));
  const view = buildMonthlyReportMatrix(
    report.matrix,
    report.courses.map((course) => course.courseId),
  );
  const columnLabel = (key: string) =>
    key === MONTHLY_REPORT_NONE_KEY ? MONTHLY_REPORT_UNPLACED_LABEL : (courseNames.get(key) ?? key);
  const rowLabel = (key: string) =>
    formatCustomerSourceKey(key as StudentCustomerSource);
  return { view, columnLabel, rowLabel };
}

export function MonthlyReportNewStudentMatrix({ report }: { report: AdminMonthlyReport }) {
  const { view, columnLabel, rowLabel } = useMatrix(report);
  if (view.rowKeys.length === 0) {
    return <p className="text-sm text-text-muted">Tháng này chưa có học sinh mới.</p>;
  }

  return (
    <ScrollTable>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="sticky left-0 bg-bg-surface">Nguồn</TableHead>
            {view.columnKeys.map((key) => (
              <TableHead key={key} className="text-right">
                {columnLabel(key)}
              </TableHead>
            ))}
            <TableHead className="text-right">Tổng HS</TableHead>
            <TableHead className="text-right">Nghỉ sớm</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {view.rowKeys.map((rowKey) => {
            const total = view.rowTotal(rowKey);
            return (
              <TableRow key={rowKey}>
                <TableCell className="sticky left-0 bg-bg-surface font-medium">{rowLabel(rowKey)}</TableCell>
                {view.columnKeys.map((columnKey) => {
                  const cell = view.cell(rowKey, columnKey);
                  return (
                    <TableCell key={columnKey} className="text-right tabular-nums">
                      {cell.newCount > 0 ? (
                        <div className="flex flex-col items-end leading-tight">
                          <span className="font-semibold">{cell.newCount}</span>
                          {cell.earlyDropCount > 0 ? (
                            <span
                              className="text-xs text-error"
                              title={formatEarlyDropBreakdown(cell.earlyDropCount, cell.earlyDropOldCount) ?? undefined}
                            >
                              {cell.earlyDropCount} nghỉ
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-text-muted">·</span>
                      )}
                    </TableCell>
                  );
                })}
                <TableCell className="text-right font-semibold tabular-nums">{total.newCount}</TableCell>
                <TableCell className="text-right tabular-nums">
                  <EarlyDropRatio total={total.earlyDropCount} oldCount={total.earlyDropOldCount} newCount={total.newCount} />
                </TableCell>
              </TableRow>
            );
          })}
          <TableRow className="bg-bg-secondary font-semibold">
            <TableCell className="sticky left-0 bg-bg-secondary">Tổng</TableCell>
            {view.columnKeys.map((columnKey) => (
              <TableCell key={columnKey} className="text-right tabular-nums">
                {view.columnTotal(columnKey).newCount}
              </TableCell>
            ))}
            <TableCell className="text-right tabular-nums">{view.grandTotal.newCount}</TableCell>
            <TableCell className="text-right tabular-nums">
              <EarlyDropRatio
                total={view.grandTotal.earlyDropCount}
                oldCount={view.grandTotal.earlyDropOldCount}
                newCount={view.grandTotal.newCount}
              />
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </ScrollTable>
  );
}

export function MonthlyReportRevenueMatrix({ report }: { report: AdminMonthlyReport }) {
  const { view, columnLabel, rowLabel } = useMatrix(report);
  if (view.rowKeys.length === 0) return null;
  const grand = view.grandTotal;
  const grandEarners = countEarningNewStudents(report.newStudents);

  return (
    <ScrollTable>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="sticky left-0 bg-bg-surface">Nguồn</TableHead>
            {view.columnKeys.map((key) => (
              <TableHead key={key} className="text-right">
                {columnLabel(key)}
              </TableHead>
            ))}
            <TableHead className="text-right">Tổng</TableHead>
            <TableHead className="text-right">TB/HS</TableHead>
            <TableHead>Tỉ trọng</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {view.rowKeys.map((rowKey) => {
            const total = view.rowTotal(rowKey);
            const earners = countEarningNewStudents(report.newStudents, rowKey as StudentCustomerSource);
            const share = grand.revenue > 0 ? (total.revenue / grand.revenue) * 100 : 0;
            return (
              <TableRow key={rowKey}>
                <TableCell className="sticky left-0 bg-bg-surface font-medium">{rowLabel(rowKey)}</TableCell>
                {view.columnKeys.map((columnKey) => {
                  const cell = view.cell(rowKey, columnKey);
                  if (cell.earningCount === 0) {
                    return (
                      <TableCell key={columnKey} className="text-right text-text-muted">
                        ·
                      </TableCell>
                    );
                  }
                  const intensity =
                    view.maxCellRevenue > 0 ? Math.round((cell.revenue / view.maxCellRevenue) * 24) : 0;
                  return (
                    <TableCell
                      key={columnKey}
                      className="text-right tabular-nums"
                      style={{
                        background: `color-mix(in srgb, var(--color-text-primary, currentColor) ${intensity}%, transparent)`,
                      }}
                      title={`${formatVnInteger(cell.revenue)} đ`}
                    >
                      <div className="flex flex-col items-end leading-tight">
                        <span className="font-semibold">
                          {formatMillions(cell.revenue)}
                        </span>
                        <span className="text-xs text-text-muted">{cell.earningCount} HS</span>
                      </div>
                    </TableCell>
                  );
                })}
                <TableCell className="text-right font-semibold tabular-nums" title={`${formatVnInteger(total.revenue)} đ`}>
                  {formatMillions(total.revenue)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMillions(earners > 0 ? total.revenue / earners : 0)}
                </TableCell>
                <TableCell>
                  <div className="flex min-w-[120px] items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg-secondary">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${share}%` }} />
                    </div>
                    <span className="text-xs tabular-nums text-text-muted">{share.toFixed(1)}%</span>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
          <TableRow className="bg-bg-secondary font-semibold">
            <TableCell className="sticky left-0 bg-bg-secondary">Tổng</TableCell>
            {view.columnKeys.map((columnKey) => {
              const total = view.columnTotal(columnKey);
              return (
                <TableCell key={columnKey} className="text-right tabular-nums">
                  {formatMillions(total.revenue)}
                </TableCell>
              );
            })}
            <TableCell className="text-right tabular-nums" title={`${formatVnInteger(grand.revenue)} đ`}>
              {formatMillions(grand.revenue)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatMillions(grandEarners > 0 ? grand.revenue / grandEarners : 0)}
            </TableCell>
            <TableCell />
          </TableRow>
        </TableBody>
      </Table>
    </ScrollTable>
  );
}

function NetPill({ value }: { value: number }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
        value > 0 && "bg-success/10 text-success",
        value < 0 && "bg-error/10 text-error",
        value === 0 && "bg-bg-secondary text-text-secondary",
      )}
    >
      {formatSignedCount(value)}
    </span>
  );
}

export function MonthlyReportCustomerCareTable({ rows }: { rows: MonthlyReportCustomerCareRow[] }) {
  const totalTopUp = rows.reduce((total, row) => total + row.totalTopUpInMonth, 0);
  if (rows.length === 0) return <p className="text-sm text-text-muted">Chưa có dữ liệu CSKH.</p>;
  return (
    <ScrollTable>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="sticky left-0 bg-bg-surface">Nhân sự</TableHead>
            <TableHead className="text-right">Đang học</TableHead>
            <TableHead className="text-right">Mới</TableHead>
            <TableHead className="text-right">Nghỉ</TableHead>
            <TableHead className="text-right">Ròng</TableHead>
            <TableHead className="text-right">Tổng nạp trong tháng</TableHead>
            <TableHead>Tỉ trọng</TableHead>
            <TableHead className="text-right">Lần nạp</TableHead>
            <TableHead className="text-right">HS mới nghỉ sớm</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const share = totalTopUp > 0 ? (row.totalTopUpInMonth / totalTopUp) * 100 : 0;
            return (
              <TableRow key={row.staffId ?? MONTHLY_REPORT_NONE_KEY}>
                <TableCell className={cn("sticky left-0 bg-bg-surface font-medium", row.staffId == null && "text-text-muted")}>
                  {row.staffName}
                </TableCell>
                <TableCell className="text-right tabular-nums">{row.activeStudents}</TableCell>
                <TableCell className="text-right tabular-nums text-success">
                  {row.newStudents > 0 ? `+${row.newStudents}` : "0"}
                </TableCell>
                <TableCell className="text-right tabular-nums text-error">
                  {row.droppedStudents > 0 ? `−${row.droppedStudents}` : "0"}
                </TableCell>
                <TableCell className="text-right">
                  <NetPill value={row.netChange} />
                </TableCell>
                <TableCell className="text-right tabular-nums" title={`${formatVnInteger(row.totalTopUpInMonth)} đ`}>
                  {formatMillions(row.totalTopUpInMonth)}
                </TableCell>
                <TableCell>
                  <div className="flex min-w-[120px] items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg-secondary">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${share}%` }} />
                    </div>
                    <span className="text-xs tabular-nums text-text-muted">{share.toFixed(1)}%</span>
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">{row.topUpTransactionCount}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.newStudents > 0 ? (
                    <EarlyDropRatio total={row.earlyDropCount} oldCount={row.earlyDropOldCount} newCount={row.newStudents} />
                  ) : (
                    "—"
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </ScrollTable>
  );
}

export function MonthlyReportNewStudentAppendix({
  report,
  studentHref,
}: {
  report: AdminMonthlyReport;
  studentHref: (studentId: string) => string;
}) {
  const rowLink = useRowLink();
  if (report.newStudents.length === 0) return <p className="text-sm text-text-muted">Không có học sinh mới.</p>;
  return (
    <ScrollTable>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="sticky left-0 bg-bg-surface">Học sinh</TableHead>
            <TableHead>CSKH</TableHead>
            <TableHead>Lớp đầu tiên</TableHead>
            <TableHead>Khoá</TableHead>
            <TableHead>Ngày nạp đầu</TableHead>
            <TableHead>Nguồn</TableHead>
            <TableHead className="text-right">Tổng nạp</TableHead>
            <TableHead>Nghỉ sớm</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {report.newStudents.map((row) => (
            <TableRow
              key={row.studentId}
              className="cursor-pointer hover:bg-bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
              {...rowLink(studentHref(row.studentId), `Xem chi tiết học sinh ${row.fullName}`)}
            >
              <TableCell className="sticky left-0 bg-bg-surface font-medium">{row.fullName}</TableCell>
              <TableCell>{row.customerCareStaffName ?? "—"}</TableCell>
              <TableCell>{row.className ?? MONTHLY_REPORT_UNPLACED_LABEL}</TableCell>
              <TableCell>{row.courseName ?? "—"}</TableCell>
              <TableCell className="tabular-nums">{formatVnDate(row.firstTopUpAt)}</TableCell>
              <TableCell>{formatCustomerSourceKey(row.customerSource)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatVnInteger(row.totalTopUp)} đ</TableCell>
              <TableCell className={cn(row.isEarlyDrop ? "text-error" : "text-text-muted")}>
                {row.isEarlyDrop ? (
                  <div className="flex flex-col leading-tight">
                    <span>{row.dropOutDate ? formatVnDate(row.dropOutDate) : "Đã nghỉ"}</span>
                    <span className="text-xs text-text-muted">{row.earlyDropKind === "old" ? "Cũ nghỉ" : "Thử nghỉ"}</span>
                  </div>
                ) : (
                  "—"
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ScrollTable>
  );
}

export function MonthlyReportDroppedAppendix({
  report,
  studentHref,
}: {
  report: AdminMonthlyReport;
  studentHref: (studentId: string) => string;
}) {
  const rowLink = useRowLink();
  if (report.droppedStudents.length === 0) return <p className="text-sm text-text-muted">Không có học sinh nghỉ.</p>;
  return (
    <ScrollTable>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="sticky left-0 bg-bg-surface">Học sinh</TableHead>
            <TableHead>CSKH</TableHead>
            <TableHead>Lớp gần nhất</TableHead>
            <TableHead>Ngày nghỉ</TableHead>
            <TableHead>Lý do</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {report.droppedStudents.map((row) => (
            <TableRow
              key={row.studentId}
              className="cursor-pointer hover:bg-bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
              {...rowLink(studentHref(row.studentId), `Xem chi tiết học sinh ${row.fullName}`)}
            >
              <TableCell className="sticky left-0 bg-bg-surface font-medium">{row.fullName}</TableCell>
              <TableCell>{row.customerCareStaffName ?? "—"}</TableCell>
              <TableCell>{row.className ?? "—"}</TableCell>
              <TableCell className="tabular-nums">{formatVnDate(row.dropOutDate)}</TableCell>
              <TableCell className="max-w-[280px] whitespace-normal text-text-secondary">{row.dropOutReason ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ScrollTable>
  );
}
