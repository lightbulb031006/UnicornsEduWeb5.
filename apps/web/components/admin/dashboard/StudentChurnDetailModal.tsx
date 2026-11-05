"use client";

import { useId } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAdminStudentChurnDetails } from "@/lib/apis/dashboard.api";
import type { AdminDashboardStudentChurnType } from "@/dtos/dashboard.dto";
import NewStudentDefinitionHint from "@/components/shared/NewStudentDefinitionHint";
import DroppedStudentDefinitionHint from "@/components/shared/DroppedStudentDefinitionHint";
import { DashboardIcon } from "./DashboardIcon";
import { getErrorMessage } from "./overview/format";

function formatChurnDate(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("vi-VN");
}

export function StudentChurnDetailModal({
  periodLabel,
  newCount,
  droppedCount,
  trialDroppedCount,
  activeCount,
  activeTab,
  onChangeTab,
  onClose,
  month,
  year,
}: {
  periodLabel: string;
  newCount: number;
  droppedCount: number;
  trialDroppedCount: number;
  activeCount: number;
  activeTab: AdminDashboardStudentChurnType;
  onChangeTab: (tab: AdminDashboardStudentChurnType) => void;
  onClose: () => void;
  month: string;
  year: string;
}) {
  const dialogTitleId = useId();
  const isDroppedTab = activeTab === "dropped" || activeTab === "trial_dropped";

  const churnQuery = useQuery({
    queryKey: ["dashboard", "admin", "student-churn-details", activeTab, month, year],
    queryFn: () => getAdminStudentChurnDetails({ type: activeTab, month, year, limit: 500 }),
    staleTime: 20_000,
  });

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-bg-primary/75 backdrop-blur-[2px]"
        aria-hidden
        onClick={onClose}
      />
      <div className="fixed inset-0 z-50 p-3 sm:p-6">
        <div className="mx-auto flex h-full w-full items-center max-w-3xl">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogTitleId}
            className="flex h-auto max-h-full w-full flex-col overflow-hidden rounded-2xl border border-border-default bg-bg-surface shadow-2xl overscroll-contain"
          >
            <div className="flex items-start justify-between gap-4 border-b border-border-default px-5 py-4">
              <div>
                <h2 id={dialogTitleId} className="text-xl font-semibold text-balance text-text-primary">
                  Biến động học sinh
                </h2>
                <p className="mt-1 text-sm text-text-secondary">{periodLabel}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-2 text-text-muted transition-colors hover:bg-bg-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                aria-label="Đóng popup biến động học sinh"
              >
                <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex flex-wrap gap-2 border-b border-border-default px-5 py-3">
              {(
                [
                  { type: "new", label: `Học sinh mới (+${newCount})`, activeClass: "bg-success" },
                  { type: "dropped", label: `Cũ nghỉ (-${droppedCount})`, activeClass: "bg-warning" },
                  { type: "trial_dropped", label: `Thử nghỉ (-${trialDroppedCount})`, activeClass: "bg-warning" },
                  { type: "active", label: `Học sinh hiện tại (${activeCount})`, activeClass: "bg-primary" },
                ] satisfies { type: AdminDashboardStudentChurnType; label: string; activeClass: string }[]
              ).map((tab) => (
                <button
                  key={tab.type}
                  type="button"
                  onClick={() => onChangeTab(tab.type)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${
                    activeTab === tab.type
                      ? `${tab.activeClass} text-text-inverse`
                      : "border border-border-default bg-bg-surface text-text-secondary hover:bg-bg-secondary"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {activeTab === "new" ? <NewStudentDefinitionHint /> : null}
            {isDroppedTab ? <DroppedStudentDefinitionHint /> : null}

            <div className="max-h-[65vh] overflow-auto px-4 py-4 sm:px-5">
              {churnQuery.isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-14 animate-pulse rounded-xl bg-bg-secondary/40" />
                  ))}
                </div>
              ) : churnQuery.isError ? (
                <Alert variant="destructive">
                  <DashboardIcon path="M12 9v4m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" />
                  <AlertTitle>Không tải được danh sách học sinh</AlertTitle>
                  <AlertDescription>{getErrorMessage(churnQuery.error, "Không tải được danh sách học sinh.")}</AlertDescription>
                </Alert>
              ) : churnQuery.data && churnQuery.data.length > 0 ? (
                <>
                  <div className="space-y-3 md:hidden">
                    {churnQuery.data.map((item) => (
                      <article
                        key={item.studentId}
                        className="rounded-xl border border-border-default bg-bg-surface p-4 shadow-sm"
                      >
                        <p className="text-sm font-semibold text-text-primary">{item.studentName}</p>
                        <p className="mt-1 text-sm text-text-secondary">{item.className || "—"}</p>
                        {activeTab !== "active" ? (
                          <p className="mt-1 text-xs text-text-muted">
                            {activeTab === "new" ? "Ngày vào học: " : "Ngày nghỉ: "}
                            {formatChurnDate(item.eventDate)}
                          </p>
                        ) : null}
                        {isDroppedTab ? (
                          <p className="mt-1 text-xs text-text-secondary">
                            Lý do nghỉ: {item.dropOutReason || "—"}
                          </p>
                        ) : null}
                      </article>
                    ))}
                  </div>

                  <div className="hidden overflow-x-auto rounded-xl border border-border-default md:block">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-border-default hover:bg-transparent">
                          <TableHead className="min-w-[220px]">Học sinh</TableHead>
                          <TableHead className="min-w-[200px]">Lớp</TableHead>
                          {activeTab !== "active" ? (
                            <TableHead className="min-w-[140px]">
                              {activeTab === "new" ? "Ngày vào học" : "Ngày nghỉ"}
                            </TableHead>
                          ) : null}
                          {isDroppedTab ? <TableHead className="min-w-[240px]">Lý do nghỉ</TableHead> : null}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {churnQuery.data.map((item) => (
                          <TableRow key={item.studentId} className="border-border-default/80">
                            <TableCell className="align-top font-medium text-text-primary">
                              {item.studentName}
                            </TableCell>
                            <TableCell className="align-top text-text-secondary">
                              {item.className || "—"}
                            </TableCell>
                            {activeTab !== "active" ? (
                              <TableCell className="align-top text-text-secondary">
                                {formatChurnDate(item.eventDate)}
                              </TableCell>
                            ) : null}
                            {isDroppedTab ? (
                              <TableCell className="max-w-[320px] whitespace-normal align-top text-text-secondary">
                                {item.dropOutReason || "—"}
                              </TableCell>
                            ) : null}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              ) : (
                <div className="rounded-xl border border-dashed border-border-default bg-bg-secondary/35 px-4 py-6 text-sm text-text-secondary">
                  {activeTab === "active"
                    ? "Không có học sinh đang học."
                    : "Không có học sinh nào trong kỳ đang chọn."}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
