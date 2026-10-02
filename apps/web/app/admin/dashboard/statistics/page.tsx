"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import UpgradedSelect from "@/components/ui/UpgradedSelect";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  downloadAdminMonthlyStatisticsPdf,
  getAdminDashboardFinancialDetail,
  getAdminMonthlyStatistics,
} from "@/lib/apis/dashboard.api";
import { VIETNAMESE_MONTH_OPTIONS } from "@/lib/month-format";
import { resolveAdminLikeRouteBase, buildAdminLikePath } from "@/lib/admin-shell-paths";
import { FinancialDetailModal } from "@/components/admin/dashboard/FinancialDetailModal";
import {
  EXPENSE_METRIC_GLOSSARY,
  FINANCE_METRIC_GLOSSARY,
  MetricGlossary,
  OPERATIONS_METRIC_GLOSSARY,
} from "@/components/admin/dashboard/MetricGlossary";
import type { AdminDashboardMonthlyStatistic } from "@/dtos/dashboard.dto";
import {
  formatVnCompactNumber,
  formatVnInteger,
} from "@/lib/formatters";

const MAX_MONTH_RANGE = 36;

function formatCurrency(value: number) {
  return `${formatVnInteger(value)} đ`;
}

function getErrorMessage(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    typeof (error as { response?: { data?: { message?: string } } }).response?.data?.message === "string"
  ) {
    return (error as { response?: { data?: { message?: string } } }).response?.data?.message as string;
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Không thể tải thống kê theo tháng.";
}

function monthKeyToIndex(month: string, year: string) {
  return Number(year) * 12 + (Number(month) - 1);
}

function buildYearOptions() {
  const currentYear = new Date().getFullYear();
  return Array.from({ length: 8 }).map((_, index) => {
    const y = String(currentYear - index);
    return { value: y, label: y };
  });
}

function ChartSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-4 w-40 bg-bg-tertiary" />
      <Skeleton className="h-72 w-full rounded-xl bg-bg-tertiary" />
    </div>
  );
}

function FinancialTrendChart({ data }: { data: AdminDashboardMonthlyStatistic[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 10, right: 10, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} />
          <YAxis
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: number) => formatVnCompactNumber(value)}
          />
          <Tooltip
            formatter={(value) => formatCurrency(Number(value))}
            contentStyle={{
              backgroundColor: "var(--ue-bg-surface)",
              borderColor: "var(--ue-border-default)",
              borderRadius: "0.75rem",
              fontSize: "12px",
              color: "var(--ue-text-primary)",
            }}
          />
          <Legend wrapperStyle={{ fontSize: "12px" }} />
          <Bar dataKey="revenue" name="Doanh thu" fill="var(--ue-primary)" radius={[4, 4, 0, 0]} maxBarSize={28} />
          <Bar dataKey="expense" name="Chi phí" fill="var(--ue-error)" radius={[4, 4, 0, 0]} maxBarSize={28} />
          <Line
            dataKey="profit"
            name="Lợi nhuận"
            stroke="var(--ue-success)"
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
          <Line
            dataKey="totalTopup"
            name="Tổng nạp"
            stroke="var(--ue-viz-4)"
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

const EXPENSE_BREAKDOWN_SERIES: Array<{
  key: keyof AdminDashboardMonthlyStatistic;
  name: string;
  color: string;
}> = [
  { key: "teacherCost", name: "Dạy", color: "var(--ue-viz-1)" },
  { key: "customerCareCost", name: "CSKH", color: "var(--ue-viz-2)" },
  { key: "lessonCost", name: "Giáo án", color: "var(--ue-viz-3)" },
  { key: "bonusCost", name: "Thưởng", color: "var(--ue-viz-4)" },
  { key: "extraAllowanceCost", name: "Trợ cấp khác", color: "var(--ue-viz-5)" },
  { key: "fixedSalaryCost", name: "Lương cứng", color: "var(--ue-viz-9)" },
  { key: "assistantCost", name: "Trợ lí", color: "var(--ue-viz-6)" },
  { key: "trainingManagerCost", name: "QL lớp", color: "var(--ue-viz-7)" },
  { key: "operatingCost", name: "Vận hành", color: "var(--ue-viz-8)" },
];

function ExpenseBreakdownChart({ data }: { data: AdminDashboardMonthlyStatistic[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 10, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} />
          <YAxis
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: number) => formatVnCompactNumber(value)}
          />
          <Tooltip
            formatter={(value) => formatCurrency(Number(value))}
            contentStyle={{
              backgroundColor: "var(--ue-bg-surface)",
              borderColor: "var(--ue-border-default)",
              borderRadius: "0.75rem",
              fontSize: "12px",
              color: "var(--ue-text-primary)",
            }}
          />
          <Legend wrapperStyle={{ fontSize: "12px" }} />
          {EXPENSE_BREAKDOWN_SERIES.map((series) => (
            <Line
              key={series.key}
              dataKey={series.key}
              name={series.name}
              stroke={series.color}
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function OperationsTrendChart({ data }: { data: AdminDashboardMonthlyStatistic[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 10, right: 10, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} />
          <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--ue-bg-surface)",
              borderColor: "var(--ue-border-default)",
              borderRadius: "0.75rem",
              fontSize: "12px",
              color: "var(--ue-text-primary)",
            }}
          />
          <Legend wrapperStyle={{ fontSize: "12px" }} />
          <Bar dataKey="students" name="Học sinh" fill="var(--ue-primary)" radius={[4, 4, 0, 0]} maxBarSize={22} />
          <Bar dataKey="classes" name="Lớp học" fill="var(--ue-info)" radius={[4, 4, 0, 0]} maxBarSize={22} />
          <Bar dataKey="teachers" name="Gia sư" fill="var(--ue-warning)" radius={[4, 4, 0, 0]} maxBarSize={22} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function AdminDashboardStatisticsPage() {
  const pathname = usePathname();
  const routeBase = resolveAdminLikeRouteBase(pathname);
  const yearOptions = useMemo(buildYearOptions, []);

  const defaultRange = useMemo(() => {
    const now = new Date();
    const toMonth = String(now.getMonth() + 1).padStart(2, "0");
    const toYear = String(now.getFullYear());
    const fromDate = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    const fromMonth = String(fromDate.getMonth() + 1).padStart(2, "0");
    const fromYear = String(fromDate.getFullYear());
    return { fromMonth, fromYear, toMonth, toYear };
  }, []);

  const [selectedExpenseMonthKey, setSelectedExpenseMonthKey] = useState<string | null>(null);
  const [selectedTopupMonthKey, setSelectedTopupMonthKey] = useState<string | null>(null);
  const [fromMonth, setFromMonth] = useState(defaultRange.fromMonth);
  const [fromYear, setFromYear] = useState(defaultRange.fromYear);
  const [toMonth, setToMonth] = useState(defaultRange.toMonth);
  const [toYear, setToYear] = useState(defaultRange.toYear);

  const fromIndex = monthKeyToIndex(fromMonth, fromYear);
  const toIndex = monthKeyToIndex(toMonth, toYear);
  const isRangeInvalid = fromIndex > toIndex;
  const monthSpan = toIndex - fromIndex + 1;
  const isRangeTooLong = !isRangeInvalid && monthSpan > MAX_MONTH_RANGE;
  const canQuery = !isRangeInvalid && !isRangeTooLong;

  const statisticsQuery = useQuery({
    queryKey: ["dashboard", "admin", "monthly-statistics", fromMonth, fromYear, toMonth, toYear],
    queryFn: () => getAdminMonthlyStatistics({ fromMonth, fromYear, toMonth, toYear }),
    enabled: canQuery,
    staleTime: 30_000,
  });

  const months = statisticsQuery.data?.months ?? [];

  const topupDetailQuery = useQuery({
    queryKey: [
      "dashboard", "admin", "financial-detail", "topup",
      selectedTopupMonthKey ? selectedTopupMonthKey.split("-")[1] : null,
      selectedTopupMonthKey ? selectedTopupMonthKey.split("-")[0] : null,
    ],
    queryFn: () =>
      getAdminDashboardFinancialDetail({
        rowKey: "topup",
        month: selectedTopupMonthKey!.split("-")[1],
        year: selectedTopupMonthKey!.split("-")[0],
      }),
    enabled: selectedTopupMonthKey != null,
  });

  const triggerBlobDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const exportPdfMutation = useMutation({
    mutationFn: () =>
      downloadAdminMonthlyStatisticsPdf({
        fromMonth,
        fromYear,
        toMonth,
        toYear,
      }),
    onMutate: () => ({ toastId: toast.loading("Đang chuẩn bị báo cáo PDF…") }),
    onSuccess: ({ blob, filename }, _vars, context) => {
      triggerBlobDownload(blob, filename);
      toast.success("Đã tải báo cáo PDF.", { id: context?.toastId });
    },
    onError: (error, _vars, context) => {
      const message =
        error instanceof Error ? error.message : "Không xuất được báo cáo PDF.";
      toast.error(message, { id: context?.toastId });
    },
  });

  return (
    <div className="min-h-full bg-bg-primary p-4 sm:p-6">
      <div className="mx-auto w-full max-w-[1320px] space-y-4 rounded-xl border border-border-default bg-bg-surface p-4 sm:p-5">
        <section className="flex flex-col gap-3 border-b border-border-default pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-lg font-semibold text-text-primary">Thống kê theo tháng</h1>
              <p className="mt-1 text-sm text-text-secondary">
                Học sinh, lớp học, gia sư, doanh thu, lợi nhuận và chi phí theo từng tháng trong khoảng thời gian đã chọn.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (!canQuery || exportPdfMutation.isPending) return;
                  exportPdfMutation.mutate();
                }}
                disabled={!canQuery || exportPdfMutation.isPending || statisticsQuery.isLoading}
                className="inline-flex min-h-9 items-center rounded-md border border-border-default bg-bg-surface px-3 text-xs font-medium text-text-primary transition-colors hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-60"
              >
                {exportPdfMutation.isPending ? "Đang xuất…" : "Xuất PDF"}
              </button>
              <Link
                href={buildAdminLikePath(routeBase, "dashboard")}
                className="whitespace-nowrap rounded-md border border-border-default bg-bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-secondary hover:text-text-primary"
              >
                ← Quay lại Dashboard
              </Link>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-text-muted">Từ tháng</span>
              <div className="flex gap-2">
                <UpgradedSelect
                  value={fromMonth}
                  onValueChange={setFromMonth}
                  options={VIETNAMESE_MONTH_OPTIONS}
                  ariaLabel="Tháng bắt đầu"
                  buttonClassName="min-w-[110px]"
                />
                <UpgradedSelect
                  value={fromYear}
                  onValueChange={setFromYear}
                  options={yearOptions}
                  ariaLabel="Năm bắt đầu"
                  buttonClassName="min-w-[90px]"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-text-muted">Đến tháng</span>
              <div className="flex gap-2">
                <UpgradedSelect
                  value={toMonth}
                  onValueChange={setToMonth}
                  options={VIETNAMESE_MONTH_OPTIONS}
                  ariaLabel="Tháng kết thúc"
                  buttonClassName="min-w-[110px]"
                />
                <UpgradedSelect
                  value={toYear}
                  onValueChange={setToYear}
                  options={yearOptions}
                  ariaLabel="Năm kết thúc"
                  buttonClassName="min-w-[90px]"
                />
              </div>
            </div>
          </div>

          {isRangeInvalid ? (
            <Alert variant="destructive">
              <AlertTitle>Khoảng thời gian không hợp lệ</AlertTitle>
              <AlertDescription>Tháng bắt đầu phải trước hoặc bằng tháng kết thúc.</AlertDescription>
            </Alert>
          ) : isRangeTooLong ? (
            <Alert variant="destructive">
              <AlertTitle>Khoảng thời gian quá dài</AlertTitle>
              <AlertDescription>
                Chỉ xem được tối đa {MAX_MONTH_RANGE} tháng/lần. Khoảng hiện tại đang chọn {monthSpan} tháng, vui lòng thu hẹp lại.
              </AlertDescription>
            </Alert>
          ) : null}
        </section>

        {!canQuery ? null : statisticsQuery.isLoading ? (
          <div className="space-y-6">
            <ChartSkeleton />
            <ChartSkeleton />
            <ChartSkeleton />
          </div>
        ) : statisticsQuery.isError ? (
          <Alert variant="destructive">
            <AlertTitle>Không tải được thống kê</AlertTitle>
            <AlertDescription>{getErrorMessage(statisticsQuery.error)}</AlertDescription>
          </Alert>
        ) : (
          <>
            <section className="space-y-3">
              <div>
                <h2 className="text-sm font-semibold text-text-primary">Doanh thu · Chi phí · Lợi nhuận</h2>
              </div>
              <FinancialTrendChart data={months} />
              <div className="overflow-x-auto rounded-xl border border-border-default">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border-default hover:bg-transparent">
                      <TableHead className="min-w-[100px]">Tháng</TableHead>
                      <TableHead className="min-w-[140px] text-right">Doanh thu</TableHead>
                      <TableHead className="min-w-[140px] text-right">Chi phí</TableHead>
                      <TableHead className="min-w-[140px] text-right">Lợi nhuận</TableHead>
                      <TableHead className="min-w-[140px] text-right">Tổng nạp</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {months.map((row) => (
                      <TableRow key={`finance-${row.monthKey}`} className="border-border-default/80">
                        <TableCell className="font-medium text-text-primary">{row.monthKey}</TableCell>
                        <TableCell className="text-right tabular-nums text-text-primary">
                          {formatCurrency(row.revenue)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-text-primary">
                          <button
                            type="button"
                            onClick={() => setSelectedExpenseMonthKey(row.monthKey)}
                            className="rounded-md underline decoration-dotted underline-offset-4 transition-colors hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                            aria-label={`Mở chi tiết chi phí tháng ${row.monthKey}`}
                          >
                            {formatCurrency(row.expense)}
                          </button>
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-semibold text-text-primary">
                          {formatCurrency(row.profit)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-text-primary">
                          <button
                            type="button"
                            onClick={() => setSelectedTopupMonthKey(row.monthKey)}
                            className="rounded-md underline decoration-dotted underline-offset-4 transition-colors hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                            aria-label={`Mở chi tiết tổng nạp tháng ${row.monthKey}`}
                          >
                            {formatCurrency(row.totalTopup)}
                          </button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <MetricGlossary items={FINANCE_METRIC_GLOSSARY} />
            </section>

            <section className="space-y-3">
              <div>
                <h2 className="text-sm font-semibold text-text-primary">Chi phí theo từng khoản</h2>
              </div>
              <ExpenseBreakdownChart data={months} />
              <div className="overflow-x-auto rounded-xl border border-border-default">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border-default hover:bg-transparent">
                      <TableHead className="min-w-[100px]">Tháng</TableHead>
                      {EXPENSE_BREAKDOWN_SERIES.map((series) => (
                        <TableHead key={series.key} className="min-w-[110px] text-right">
                          {series.name}
                        </TableHead>
                      ))}
                      <TableHead className="min-w-[140px] text-right">Tổng</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {months.map((row) => (
                      <TableRow key={`expense-${row.monthKey}`} className="border-border-default/80">
                        <TableCell className="font-medium text-text-primary">{row.monthKey}</TableCell>
                        {EXPENSE_BREAKDOWN_SERIES.map((series) => (
                          <TableCell
                            key={series.key}
                            className="text-right tabular-nums text-text-primary"
                          >
                            {formatCurrency(Number(row[series.key]))}
                          </TableCell>
                        ))}
                        <TableCell className="text-right tabular-nums font-semibold text-text-primary">
                          <button
                            type="button"
                            onClick={() => setSelectedExpenseMonthKey(row.monthKey)}
                            className="rounded-md underline decoration-dotted underline-offset-4 transition-colors hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                            aria-label={`Mở chi tiết chi phí tháng ${row.monthKey}`}
                          >
                            {formatCurrency(row.expense)}
                          </button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <MetricGlossary items={EXPENSE_METRIC_GLOSSARY} />
            </section>

            <section className="space-y-3">
              <div>
                <h2 className="text-sm font-semibold text-text-primary">Học sinh · Lớp học · Gia sư</h2>
              </div>
              <OperationsTrendChart data={months} />
              <div className="overflow-x-auto rounded-xl border border-border-default">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border-default hover:bg-transparent">
                      <TableHead className="min-w-[100px]">Tháng</TableHead>
                      <TableHead className="min-w-[100px] text-right">Học sinh</TableHead>
                      <TableHead className="min-w-[100px] text-right">Lớp học</TableHead>
                      <TableHead className="min-w-[100px] text-right">Gia sư</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {months.map((row) => (
                      <TableRow key={`ops-${row.monthKey}`} className="border-border-default/80">
                        <TableCell className="font-medium text-text-primary">{row.monthKey}</TableCell>
                        <TableCell className="text-right tabular-nums text-text-secondary">
                          {row.students}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-text-secondary">
                          {row.classes}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-text-secondary">
                          {row.teachers}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <MetricGlossary items={OPERATIONS_METRIC_GLOSSARY} />
            </section>
          </>
        )}
      </div>

      {selectedExpenseMonthKey ? (
        <FinancialDetailModal
          rowLabel={`chi phí tháng ${selectedExpenseMonthKey}`}
          onClose={() => setSelectedExpenseMonthKey(null)}
          month={selectedExpenseMonthKey.split("-")[1]}
          year={selectedExpenseMonthKey.split("-")[0]}
          tabs={[
            { key: "personnel-cost", label: "Nhân sự", rowKey: "personnel-cost" },
            { key: "other-cost", label: "Khác", rowKey: "other-cost" },
          ]}
        />
      ) : null}

      {selectedTopupMonthKey ? (
        <FinancialDetailModal
          rowLabel={`tổng nạp tháng ${selectedTopupMonthKey}`}
          detail={topupDetailQuery.data}
          isLoading={topupDetailQuery.isLoading}
          error={topupDetailQuery.error}
          onClose={() => setSelectedTopupMonthKey(null)}
        />
      ) : null}
    </div>
  );
}
