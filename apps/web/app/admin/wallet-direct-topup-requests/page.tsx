"use client";

import { Suspense } from "react";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import type {
  StudentWalletDirectTopUpRequestListResponse,
  StudentWalletDirectTopUpRequestListStatus,
  StudentWalletDirectTopUpRequestResponse,
  StudentWalletDirectTopUpRequestStatus,
} from "@/dtos/student.dto";
import * as studentApi from "@/lib/apis/student.api";
import { cn } from "@/lib/utils";
import {
  formatVnCurrency,
  formatVnDateTime,
} from "@/lib/formatters";

const PAGE_SIZE = 20;

const STATUS_OPTIONS: Array<{
  value: StudentWalletDirectTopUpRequestListStatus;
  label: string;
  description: string;
}> = [
  { value: "pending", label: "Chờ duyệt", description: "Yêu cầu còn hạn cần admin xử lý" },
  { value: "approved", label: "Đã duyệt", description: "Yêu cầu đã cộng ví" },
  { value: "expired", label: "Hết hạn", description: "Yêu cầu quá hạn hoặc đã bị đóng" },
  { value: "all", label: "Tất cả", description: "Toàn bộ lịch sử yêu cầu" },
];

const STATUS_LABELS: Record<StudentWalletDirectTopUpRequestStatus, string> = {
  pending: "Chờ duyệt",
  approved: "Đã duyệt",
  expired: "Hết hạn",
};

function normalizeStatus(value: string | null): StudentWalletDirectTopUpRequestListStatus {
  return STATUS_OPTIONS.some((option) => option.value === value)
    ? (value as StudentWalletDirectTopUpRequestListStatus)
    : "pending";
}

function normalizePage(value: string | null): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function buildUrl(pathname: string, params: URLSearchParams): string {
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function formatCurrency(value: number): string {
  return formatVnCurrency(value);
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return formatVnDateTime(date);
}

function getErrorMessage(error: unknown, fallback: string): string {
  return (
    (error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
    (error as Error)?.message ??
    fallback
  );
}

function statusBadgeClass(status: StudentWalletDirectTopUpRequestStatus): string {
  if (status === "approved") return "bg-success/10 text-success ring-success/20";
  if (status === "expired") return "bg-error/10 text-error ring-error/20";
  return "bg-warning/10 text-warning ring-warning/20";
}

function DirectTopUpRequestCard({
  request,
  approving,
  onApprove,
}: {
  request: StudentWalletDirectTopUpRequestResponse;
  approving: boolean;
  onApprove: (request: StudentWalletDirectTopUpRequestResponse) => void;
}) {
  return (
    <article className="rounded-lg border border-border-default bg-bg-surface p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-text-primary">
            {request.studentName}
          </p>
          <p className="mt-1 break-all text-xs text-text-muted">{request.studentId}</p>
        </div>
        <span
          className={cn(
            "inline-flex shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ring-1",
            statusBadgeClass(request.status),
          )}
        >
          {STATUS_LABELS[request.status]}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs font-medium text-text-muted">Số tiền</p>
          <p className="mt-1 font-semibold tabular-nums text-primary">
            {formatCurrency(request.amount)}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-text-muted">Người yêu cầu</p>
          <p className="mt-1 truncate text-text-primary">
            {request.requestedByUserEmail || "-"}
          </p>
          <p className="mt-0.5 text-xs text-text-muted">
            {request.requestedByRoleType || "unknown"}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <p className="text-xs font-medium text-text-muted">Lý do</p>
        <p className="mt-1 text-sm text-text-secondary">{request.reason}</p>
      </div>

      <dl className="mt-4 grid gap-2 text-xs text-text-secondary">
        <div className="flex justify-between gap-3">
          <dt className="text-text-muted">Tạo</dt>
          <dd className="text-right">{formatDateTime(request.createdAt)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-text-muted">Hết hạn</dt>
          <dd className="text-right">{formatDateTime(request.expiresAt)}</dd>
        </div>
        {request.approvedAt ? (
          <div className="flex justify-between gap-3">
            <dt className="text-text-muted">Duyệt</dt>
            <dd className="text-right">{formatDateTime(request.approvedAt)}</dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-4">
        {request.status === "pending" ? (
          <button
            type="button"
            onClick={() => onApprove(request)}
            disabled={approving}
              className="w-full rounded-md bg-primary px-3 py-2 text-sm font-semibold text-text-inverse transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {approving ? "Đang duyệt" : "Duyệt"}
          </button>
        ) : (
          <p className="text-right text-xs text-text-muted">Đã xử lý</p>
        )}
      </div>
    </article>
  );
}

function AdminWalletDirectTopUpRequestsPageContent() {
  const pathname = usePathname();
  const { replace } = useRouter();
  const searchParams = useSearchParams();
  const getSearchParam = searchParams.get.bind(searchParams);
  const queryClient = useQueryClient();

  const status = normalizeStatus(getSearchParam("status"));
  const page = normalizePage(getSearchParam("page"));

  const {
    data: response,
    isLoading,
    isFetching,
    isError,
    error,
  } = useQuery<StudentWalletDirectTopUpRequestListResponse>({
    queryKey: ["student", "wallet-direct-topup-requests", status, page, PAGE_SIZE],
    queryFn: () =>
      studentApi.getStudentWalletDirectTopUpRequests({
        status,
        page,
        limit: PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
  });

  const approveMutation = useMutation({
    mutationFn: (request: StudentWalletDirectTopUpRequestResponse) =>
      studentApi.approveStudentWalletDirectTopUpRequest(request.id),
    onSuccess: async (result, request) => {
      toast.success(result.message || "Đã duyệt yêu cầu nạp ví.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["student", "wallet-direct-topup-requests"] }),
        queryClient.invalidateQueries({ queryKey: ["student", "detail", request.studentId] }),
        queryClient.invalidateQueries({ queryKey: ["student", "wallet-history", request.studentId] }),
        queryClient.invalidateQueries({ queryKey: ["student", "list"] }),
      ]);
    },
    onError: (err: unknown) => {
      toast.error(getErrorMessage(err, "Không thể duyệt yêu cầu nạp ví."));
    },
  });

  const list = response?.data ?? [];
  const total = response?.meta.total ?? 0;
  const currentPage = response?.meta.page ?? page;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pendingCountLabel =
    status === "pending" ? `${total} yêu cầu chờ duyệt` : `${total} yêu cầu`;

  const setStatus = (nextStatus: StudentWalletDirectTopUpRequestListStatus) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("status", nextStatus);
    params.set("page", "1");
    replace(buildUrl(pathname, params));
  };

  const setPage = (nextPage: number) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("status", status);
    params.set("page", String(Math.min(totalPages, Math.max(1, nextPage))));
    replace(buildUrl(pathname, params));
  };

  const handleApprove = (request: StudentWalletDirectTopUpRequestResponse) => {
    const ok = window.confirm(
      `Duyệt nạp ${formatCurrency(request.amount)} cho ${request.studentName}?`,
    );
    if (!ok) return;
    approveMutation.mutate(request);
  };

  return (
    <div className="min-h-screen bg-bg-primary px-4 py-6 text-text-primary sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <header className="flex flex-col gap-3 border-b border-border-default pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-text-muted">
              Nạp ví
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-text-primary sm:text-3xl">
              Duyệt nạp ví học sinh
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-text-secondary">
              Theo dõi yêu cầu nạp thẳng từ CSKH, kế toán và trợ lí; admin duyệt thì ví học sinh mới được cộng.
            </p>
          </div>
          <div className="rounded-lg border border-border-default bg-bg-surface px-4 py-3 text-sm">
            <p className="font-semibold text-text-primary">{pendingCountLabel}</p>
            <p className="mt-1 text-xs text-text-muted">
              {isFetching ? "Đang đồng bộ…" : "Đã cập nhật"}
            </p>
          </div>
        </header>

        <nav className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="Lọc trạng thái">
          {STATUS_OPTIONS.map((option) => {
            const active = option.value === status;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setStatus(option.value)}
                className={cn(
                  "rounded-lg border px-4 py-3 text-left transition",
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border-default bg-bg-surface text-text-secondary hover:border-primary/50 hover:text-text-primary",
                )}
              >
                <span className="block text-sm font-semibold">{option.label}</span>
                <span className="mt-1 block text-xs text-text-muted">{option.description}</span>
              </button>
            );
          })}
        </nav>

        <section className="overflow-hidden rounded-lg border border-border-default bg-bg-surface">
          <div className="flex items-center justify-between gap-3 border-b border-border-default px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-text-primary">Danh sách yêu cầu</h2>
              <p className="mt-1 text-xs text-text-muted">
                Trang {currentPage}/{totalPages}
              </p>
            </div>
            {isFetching ? (
              <span className="text-xs font-medium text-text-muted">Đang tải…</span>
            ) : null}
          </div>

          {isError ? (
            <div className="px-4 py-8 text-sm text-error">
              {getErrorMessage(error, "Không thể tải hàng chờ nạp ví.")}
            </div>
          ) : (
            <>
            <div className="grid gap-3 p-3 md:hidden">
              {isLoading
                ? Array.from({ length: 4 }).map((_, index) => (
                    <div
                      key={index}
                      className="h-44 animate-pulse rounded-lg border border-border-default bg-bg-secondary"
                    />
                  ))
                : list.map((request) => (
                    <DirectTopUpRequestCard
                      key={request.id}
                      request={request}
                      approving={approveMutation.isPending}
                      onApprove={handleApprove}
                    />
                  ))}
              {!isLoading && list.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border-default px-4 py-10 text-center text-sm text-text-muted">
                  Không có yêu cầu trong trạng thái này.
                </div>
              ) : null}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full divide-y divide-border-default text-sm">
                <thead className="bg-bg-secondary/70 text-left text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">
                  <tr>
                    <th className="px-4 py-3">Học sinh</th>
                    <th className="px-4 py-3">Số tiền</th>
                    <th className="px-4 py-3">Người yêu cầu</th>
                    <th className="px-4 py-3">Lý do</th>
                    <th className="px-4 py-3">Thời gian</th>
                    <th className="px-4 py-3">Trạng thái</th>
                    <th className="px-4 py-3 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-default">
                  {isLoading
                    ? Array.from({ length: 5 }).map((_, index) => (
                        <tr key={index} className="animate-pulse">
                          <td className="px-4 py-4" colSpan={7}>
                            <div className="h-4 rounded bg-bg-secondary" />
                          </td>
                        </tr>
                      ))
                    : list.map((request) => (
                        <tr key={request.id} className="align-top hover:bg-bg-secondary/50">
                          <td className="px-4 py-4">
                            <p className="font-semibold text-text-primary">{request.studentName}</p>
                            <p className="mt-1 text-xs text-text-muted">{request.studentId}</p>
                          </td>
                          <td className="px-4 py-4 font-semibold tabular-nums text-primary">
                            {formatCurrency(request.amount)}
                          </td>
                          <td className="px-4 py-4">
                            <p className="text-text-primary">
                              {request.requestedByUserEmail || "-"}
                            </p>
                            <p className="mt-1 text-xs text-text-muted">
                              {request.requestedByRoleType || "unknown"}
                            </p>
                          </td>
                          <td className="max-w-sm px-4 py-4 text-text-secondary">
                            {request.reason}
                          </td>
                          <td className="px-4 py-4 text-text-secondary">
                            <p>Tạo: {formatDateTime(request.createdAt)}</p>
                            <p className="mt-1">Hết hạn: {formatDateTime(request.expiresAt)}</p>
                            {request.approvedAt ? (
                              <p className="mt-1">Duyệt: {formatDateTime(request.approvedAt)}</p>
                            ) : null}
                          </td>
                          <td className="px-4 py-4">
                            <span
                              className={cn(
                                "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1",
                                statusBadgeClass(request.status),
                              )}
                            >
                              {STATUS_LABELS[request.status]}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-right">
                            {request.status === "pending" ? (
                              <button
                                type="button"
                                onClick={() => handleApprove(request)}
                                disabled={approveMutation.isPending}
                    className="rounded-md bg-primary px-3 py-2 text-xs font-semibold text-text-inverse transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {approveMutation.isPending ? "Đang duyệt" : "Duyệt"}
                              </button>
                            ) : (
                              <span className="text-xs text-text-muted">Đã xử lý</span>
                            )}
                          </td>
                        </tr>
                      ))}
                  {!isLoading && list.length === 0 ? (
                    <tr>
                      <td className="px-4 py-10 text-center text-sm text-text-muted" colSpan={7}>
                        Không có yêu cầu trong trạng thái này.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            </>
          )}

          <div className="flex flex-col gap-3 border-t border-border-default px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-text-muted">
              Tổng {total} yêu cầu
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage(currentPage - 1)}
                disabled={currentPage <= 1}
                className="rounded-md border border-border-default px-3 py-2 text-xs font-semibold text-text-secondary disabled:cursor-not-allowed disabled:opacity-50"
              >
                Trước
              </button>
              <button
                type="button"
                onClick={() => setPage(currentPage + 1)}
                disabled={currentPage >= totalPages}
                className="rounded-md border border-border-default px-3 py-2 text-xs font-semibold text-text-secondary disabled:cursor-not-allowed disabled:opacity-50"
              >
                Sau
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default function AdminWalletDirectTopUpRequestsPage() {
  // useSearchParams cần <Suspense>, nếu không Next.js sẽ bỏ static render cả route.
  return (
    <Suspense fallback={null}>
      <AdminWalletDirectTopUpRequestsPageContent />
    </Suspense>
  );
}
