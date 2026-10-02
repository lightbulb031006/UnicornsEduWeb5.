"use client";

import { useId, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAdminDashboardFinancialDetail } from "@/lib/apis/dashboard.api";
import type {
  AdminDashboardFinancialDetail,
  AdminDashboardFinancialDetailRowKey,
  AdminDashboardFinancialDetailSource,
} from "@/dtos/dashboard.dto";
import { AdminDashboardFinancialDetailSkeleton } from "@/components/admin/dashboard/AdminDashboardSkeleton";
import { DashboardIcon } from "@/components/admin/dashboard/DashboardIcon";
import { formatVnInteger } from "@/lib/formatters";

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
  return "Không thể tải chi tiết số liệu.";
}

function formatFinancialSourceAmount(source: AdminDashboardFinancialDetailSource) {
  if (source.tone === "negative" && source.amount !== 0) {
    return `- ${formatCurrency(source.amount)}`;
  }

  if (source.tone === "positive" && source.amount !== 0) {
    return `+ ${formatCurrency(source.amount)}`;
  }

  return formatCurrency(source.amount);
}

function getFinancialSourceAccentClasses(tone: AdminDashboardFinancialDetailSource["tone"]) {
  if (tone === "positive") {
    return {
      card: "border-success/25 bg-success/5",
      value: "text-success",
    };
  }

  if (tone === "negative") {
    return {
      card: "border-error/20 bg-error/5",
      value: "text-error",
    };
  }

  return {
    card: "border-border-default bg-bg-secondary/35",
    value: "text-text-primary",
  };
}

function getAmountForSource(
  item: { amount: number; note: string | null; secondaryLabel?: string | null },
  sourceKey: string,
  rowKey: string
): { amount: number; note: string | null } {
  // If rowKey is pending-payroll or personnel-cost, they use the note-prefix-split mapping:
  if (rowKey === "pending-payroll" || rowKey === "personnel-cost") {
    if (!item.note) return { amount: 0, note: null };
    const prefixMap: Record<string, string> = {
      "pending-session": "Buổi dạy",
      "pending-customer-care": "CSKH",
      "pending-lesson": "Giáo án",
      "pending-bonus": "Bonus",
      "pending-extra": "Trợ cấp",
      "pending-assistant": "Trợ lí",
      "pending-training-manager": "QL lớp",
      "teacher-cost": "Dạy",
      "customer-care-cost": "CSKH",
      "lesson-cost": "Giáo án",
      "bonus-cost": "Bonus",
      "extra-allowance-cost": "Trợ cấp khác",
      "assistant-cost": "Trợ lí",
      "training-manager-cost": "QL lớp",
    };
    const prefix = prefixMap[sourceKey];
    if (!prefix) return { amount: item.amount, note: item.note };

    const parts = item.note.split(" • ");
    const matchingPart = parts.find((p) => p.startsWith(prefix));
    if (!matchingPart) return { amount: 0, note: null };

    const digitStr = matchingPart.replace(/[^\d]/g, "");
    const amount = parseInt(digitStr, 10) || 0;
    // Keep sign of original item amount
    const signedAmount = item.amount < 0 ? -amount : amount;
    return { amount: signedAmount, note: matchingPart };
  }

  // If rowKey is other-cost, profit, or total-in, they filter by secondaryLabel:
  if (rowKey === "other-cost" || rowKey === "profit" || rowKey === "total-in") {
    const labelMap: Record<string, string> = {
      "operating-cost": "Chi phí vận hành",
      "extra-allowance-cost": "Trợ cấp khác",
      "assistant-cost": "Trợ cấp trợ lí",
      "training-manager-cost": "Trợ cấp quản lý lớp",
      "profit-revenue": "Học phí đã học",
      "profit-personnel": "Chi phí nhân sự",
      "profit-other": "Chi phí khác",
      "total-in-topup": "Dòng tiền vào",
      "total-in-personnel": "Chi phí nhân sự",
      "total-in-other": "Chi phí khác",
    };
    const targetLabel = labelMap[sourceKey];
    if (!targetLabel) return { amount: item.amount, note: item.note };

    if (item.secondaryLabel === targetLabel) {
      return { amount: item.amount, note: item.note };
    }
    return { amount: 0, note: null };
  }

  // Default: no filtering
  return { amount: item.amount, note: item.note };
}

export interface FinancialDetailTabConfig {
  key: string;
  label: string;
  rowKey: AdminDashboardFinancialDetailRowKey;
}

interface FinancialDetailModalContentProps {
  rowLabel: string;
  detail?: AdminDashboardFinancialDetail;
  isLoading: boolean;
  error: unknown;
}

function FinancialDetailModalContent({ rowLabel, detail, isLoading, error }: FinancialDetailModalContentProps) {
  const [selectedSourceKey, setSelectedSourceKey] = useState<string | null>(null);

  // Reset ngay trong render: effect sẽ hiện 1 frame với filter của dòng trước.
  const detailIdentity = `${detail?.rowKey ?? ""}|${detail?.title ?? ""}`;
  const [prevDetailIdentity, setPrevDetailIdentity] = useState(detailIdentity);
  if (prevDetailIdentity !== detailIdentity) {
    setPrevDetailIdentity(detailIdentity);
    setSelectedSourceKey(null);
  }

  const filteredItems = useMemo(() => {
    if (!detail) return [];
    if (!selectedSourceKey) return detail.items;

    return detail.items
      .map((item) => {
        const { amount, note } = getAmountForSource(item, selectedSourceKey, detail.rowKey);
        return { ...item, amount, note };
      })
      .filter((item) => item.amount !== 0);
  }, [detail, selectedSourceKey]);

  const showSourceNote = Boolean(detail?.items.some((item) => "sourceNote" in item));

  if (isLoading) {
    return <AdminDashboardFinancialDetailSkeleton />;
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <DashboardIcon path="M12 9v4m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" />
        <AlertTitle>Không tải được chi tiết số liệu</AlertTitle>
        <AlertDescription>{getErrorMessage(error)}</AlertDescription>
      </Alert>
    );
  }

  if (!detail) return null;

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-primary/15 bg-primary/8 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary/80">Tổng hợp</p>
        <p className="mt-2 text-3xl font-semibold tabular-nums text-text-primary">{formatCurrency(detail.amount)}</p>
        <p className="mt-2 text-sm leading-6 text-text-secondary">{detail.description}</p>
      </section>

      {detail.sources.length > 0 ? (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <DashboardIcon path="M3 12h18M12 3v18" />
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-text-primary">
              Nguồn cộng trừ (Nhấp thẻ để lọc chi tiết)
            </h3>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {detail.sources.map((source) => {
              const isSelected = selectedSourceKey === source.key;
              const accent = getFinancialSourceAccentClasses(source.tone);

              const interactiveBorderClass = isSelected
                ? source.tone === "positive"
                  ? "ring-2 ring-success border-success bg-success/10"
                  : source.tone === "negative"
                    ? "ring-2 ring-error border-error bg-error/10"
                    : "ring-2 ring-primary border-primary bg-primary/5"
                : "hover:border-border-default/80 hover:bg-bg-secondary/50 cursor-pointer";

              return (
                <button
                  key={source.key}
                  type="button"
                  onClick={() => setSelectedSourceKey((prev) => (prev === source.key ? null : source.key))}
                  className={`rounded-xl border p-4 shadow-sm text-left transition-all duration-200 hover:scale-[1.01] active:scale-[0.995] select-none ${accent.card} ${interactiveBorderClass} w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-text-primary">{source.label}</p>
                    {isSelected && (
                      <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary animate-pulse">
                        Đang lọc
                      </span>
                    )}
                  </div>
                  <p className={`mt-2 text-xl font-semibold tabular-nums ${accent.value}`}>
                    {formatFinancialSourceAmount(source)}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-text-secondary">{source.note}</p>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <DashboardIcon path="M4 7h16M4 12h16M4 17h10" />
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-text-primary">Chi tiết đóng góp</h3>
          </div>
          {selectedSourceKey && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-secondary">
                Đang lọc theo:{" "}
                <span className="font-semibold text-primary">
                  {detail.sources.find((s) => s.key === selectedSourceKey)?.label}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setSelectedSourceKey(null)}
                className="text-xs font-semibold text-primary hover:text-primary-hover hover:underline"
              >
                Xoá bộ lọc
              </button>
            </div>
          )}
        </div>

        {filteredItems.length > 0 ? (
          <>
            <div className="space-y-3 md:hidden">
              {filteredItems.map((item) => (
                <article key={item.id} className="rounded-xl border border-border-default bg-bg-surface p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-text-primary">{item.label}</p>
                      {item.secondaryLabel ? (
                        <p className="mt-1 text-sm text-text-secondary">{item.secondaryLabel}</p>
                      ) : null}
                    </div>
                    <p className="text-right text-sm font-semibold tabular-nums text-text-primary">
                      {formatCurrency(item.amount)}
                    </p>
                  </div>
                  {item.note ? (
                    <p className="mt-3 border-t border-border-default pt-3 text-sm leading-6 text-text-secondary">
                      {item.note}
                    </p>
                  ) : null}
                  {showSourceNote ? (
                    <p className="mt-2 text-sm leading-6 text-text-secondary">
                      Chú thích: {item.sourceNote?.trim() || "—"}
                    </p>
                  ) : null}
                </article>
              ))}
            </div>

            <div className="hidden overflow-x-auto rounded-xl border border-border-default md:block">
              <Table>
                <TableHeader>
                  <TableRow className="border-border-default hover:bg-transparent">
                    <TableHead className="min-w-[220px]">Nội dung</TableHead>
                    <TableHead className="min-w-[180px]">Nguồn</TableHead>
                    <TableHead className="min-w-[180px] text-right">Giá trị</TableHead>
                    <TableHead className="min-w-[260px]">Ghi chú</TableHead>
                    {showSourceNote ? <TableHead className="min-w-[220px]">Chú thích</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map((item) => (
                    <TableRow key={item.id} className="border-border-default/80">
                      <TableCell className="align-top font-medium text-text-primary">{item.label}</TableCell>
                      <TableCell className="align-top text-text-secondary">{item.secondaryLabel ?? "—"}</TableCell>
                      <TableCell className="align-top text-right font-semibold tabular-nums text-text-primary">
                        {formatCurrency(item.amount)}
                      </TableCell>
                      <TableCell className="align-top text-text-secondary">{item.note ?? "—"}</TableCell>
                      {showSourceNote ? (
                        <TableCell className="align-top text-text-secondary">{item.sourceNote?.trim() || "—"}</TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-border-default bg-bg-secondary/35 px-4 py-6 text-sm text-text-secondary">
            {selectedSourceKey ? "Không có khoản đóng góp nào phù hợp với bộ lọc." : detail.emptyState}
          </div>
        )}
      </section>
    </div>
  );
}

interface FinancialDetailModalProps {
  rowLabel: string;
  onClose: () => void;
  /** Single-detail mode: detail is fetched by the caller (dashboard main page). */
  detail?: AdminDashboardFinancialDetail;
  isLoading?: boolean;
  error?: unknown;
  /** Tabbed mode: pass 2+ tabs and the modal fetches each rowKey's detail itself. */
  tabs?: FinancialDetailTabConfig[];
  month?: string;
  year?: string;
  dateFrom?: string;
  dateTo?: string;
}

function TabbedFinancialDetailBody({
  rowLabel,
  tabs,
  month,
  year,
  dateFrom,
  dateTo,
}: {
  rowLabel: string;
  tabs: FinancialDetailTabConfig[];
  month?: string;
  year?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const [activeTabKey, setActiveTabKey] = useState(tabs[0].key);
  const activeTab = tabs.find((tab) => tab.key === activeTabKey) ?? tabs[0];

  const detailQuery = useQuery({
    queryKey: ["dashboard", "admin", "financial-detail", activeTab.rowKey, month, year, dateFrom, dateTo],
    queryFn: () =>
      getAdminDashboardFinancialDetail({
        rowKey: activeTab.rowKey,
        month,
        year,
        dateFrom,
        dateTo,
        limit: 500,
      }),
    staleTime: 20_000,
  });

  return (
    <>
      {tabs.length > 1 ? (
        <div className="flex gap-2 border-b border-border-default px-5 py-3">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTabKey(tab.key)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${
                activeTab.key === tab.key
                  ? "bg-primary text-text-inverse"
                  : "border border-border-default bg-bg-surface text-text-secondary hover:bg-bg-secondary"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      ) : null}
      <div className="max-h-[72vh] overflow-auto px-4 py-4 sm:px-5">
        <FinancialDetailModalContent
          rowLabel={rowLabel}
          detail={detailQuery.data}
          isLoading={detailQuery.isLoading}
          error={detailQuery.error}
        />
      </div>
    </>
  );
}

export function FinancialDetailModal({
  rowLabel,
  detail,
  isLoading = false,
  error,
  onClose,
  tabs,
  month,
  year,
  dateFrom,
  dateTo,
}: FinancialDetailModalProps) {
  const dialogTitleId = useId();
  const isTabbed = Boolean(tabs && tabs.length > 0);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-bg-primary/75 backdrop-blur-[2px]" aria-hidden onClick={onClose} />
      <div className="fixed inset-0 z-50 p-3 sm:p-6">
        <div className="mx-auto flex h-full w-full items-center max-w-6xl">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogTitleId}
            className="flex h-auto max-h-full w-full flex-col overflow-hidden rounded-2xl border border-border-default bg-bg-surface shadow-2xl overscroll-contain"
          >
            <div className="flex items-start justify-between gap-4 border-b border-border-default px-5 py-4">
              <div>
                <h2 id={dialogTitleId} className="text-xl font-semibold text-balance text-text-primary">
                  {isTabbed ? `Chi tiết ${rowLabel}` : (detail?.title ?? `Chi tiết ${rowLabel}`)}
                </h2>
                <p className="mt-1 text-sm text-text-secondary">
                  {isTabbed ? "Chọn tab để xem chi tiết từng nhóm chi phí." : (detail?.description ?? "Đang tải chi tiết số liệu từ backend…")}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-2 text-text-muted transition-colors hover:bg-bg-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                aria-label={`Đóng popup ${rowLabel}`}
              >
                <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {isTabbed ? (
              <TabbedFinancialDetailBody rowLabel={rowLabel} tabs={tabs!} month={month} year={year} dateFrom={dateFrom} dateTo={dateTo} />
            ) : (
              <div className="max-h-[72vh] overflow-auto px-4 py-4 sm:px-5">
                <FinancialDetailModalContent rowLabel={rowLabel} detail={detail} isLoading={isLoading} error={error} />
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
