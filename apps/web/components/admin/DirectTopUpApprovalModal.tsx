"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { Role } from "@/dtos/Auth.dto";
import type {
  StudentWalletDirectTopUpRequestResponse,
  StudentWalletDirectTopUpRequestStatus,
} from "@/dtos/student.dto";
import {
  OPEN_DIRECT_TOPUP_APPROVAL_EVENT,
  type OpenDirectTopUpApprovalPayload,
} from "@/lib/direct-topup-notification";
import { markNotificationFeedRead } from "@/lib/apis/notification.api";
import * as studentApi from "@/lib/apis/student.api";
import { notificationFeedQueryKey } from "@/lib/notification-feed-query";
import { cn } from "@/lib/utils";
import {
  formatVnCurrency,
  formatVnDateTime,
} from "@/lib/formatters";

const STATUS_LABELS: Record<StudentWalletDirectTopUpRequestStatus, string> = {
  pending: "Chờ duyệt",
  approved: "Đã duyệt",
  expired: "Hết hạn",
};

function canUseAdminApproval(user: ReturnType<typeof useAuth>["user"]) {
  return Boolean(
    user.access?.admin?.canAccess ||
      user.roleType === Role.admin ||
      user.effectiveRoleTypes?.includes(Role.admin),
  );
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

function ApprovalDetailRows({
  request,
}: {
  request: StudentWalletDirectTopUpRequestResponse;
}) {
  return (
    <dl className="grid gap-3 text-sm">
      <div className="grid gap-1 rounded-lg border border-border-default bg-bg-secondary/40 px-3 py-2 sm:grid-cols-[8rem_1fr] sm:gap-3">
        <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          Học sinh
        </dt>
        <dd className="min-w-0">
          <p className="font-semibold text-text-primary">{request.studentName}</p>
          <p className="mt-0.5 break-all text-xs text-text-muted">
            {request.studentId}
          </p>
        </dd>
      </div>
      <div className="grid gap-1 rounded-lg border border-border-default bg-bg-secondary/40 px-3 py-2 sm:grid-cols-[8rem_1fr] sm:gap-3">
        <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          Số tiền
        </dt>
        <dd className="font-semibold tabular-nums text-primary">
          {formatCurrency(request.amount)}
        </dd>
      </div>
      <div className="grid gap-1 rounded-lg border border-border-default bg-bg-secondary/40 px-3 py-2 sm:grid-cols-[8rem_1fr] sm:gap-3">
        <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          Người yêu cầu
        </dt>
        <dd className="min-w-0 text-text-primary">
          <p className="break-all">{request.requestedByUserEmail || "-"}</p>
          <p className="mt-0.5 text-xs text-text-muted">
            {request.requestedByRoleType || "unknown"}
          </p>
        </dd>
      </div>
      <div className="grid gap-1 rounded-lg border border-border-default bg-bg-secondary/40 px-3 py-2 sm:grid-cols-[8rem_1fr] sm:gap-3">
        <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          Lý do
        </dt>
        <dd className="text-text-secondary">{request.reason}</dd>
      </div>
      <div className="grid gap-2 rounded-lg border border-border-default bg-bg-secondary/40 px-3 py-2 text-xs text-text-secondary sm:grid-cols-3">
        <div>
          <dt className="font-semibold uppercase tracking-wide text-text-muted">
            Tạo
          </dt>
          <dd className="mt-1">{formatDateTime(request.createdAt)}</dd>
        </div>
        <div>
          <dt className="font-semibold uppercase tracking-wide text-text-muted">
            Hết hạn
          </dt>
          <dd className="mt-1">{formatDateTime(request.expiresAt)}</dd>
        </div>
        <div>
          <dt className="font-semibold uppercase tracking-wide text-text-muted">
            Duyệt
          </dt>
          <dd className="mt-1">{formatDateTime(request.approvedAt)}</dd>
        </div>
      </div>
    </dl>
  );
}

export function DirectTopUpApprovalModal() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const canApprove = canUseAdminApproval(user);

  const close = useCallback(() => {
    setOpen(false);
    setRequestId(null);
  }, []);

  const markReadMutation = useMutation({
    mutationFn: (notificationId: string) => markNotificationFeedRead(notificationId),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: notificationFeedQueryKey() });
    },
  });

  useEffect(() => {
    if (!canApprove) return;

    const openFromEvent = (event: Event) => {
      const detail = (event as CustomEvent<OpenDirectTopUpApprovalPayload>)
        .detail;
      if (!detail?.requestId) return;
      setRequestId(detail.requestId);
      setOpen(true);
      if (detail.notificationId) {
        markReadMutation.mutate(detail.notificationId);
      }
    };

    window.addEventListener(OPEN_DIRECT_TOPUP_APPROVAL_EVENT, openFromEvent);
    return () => {
      window.removeEventListener(
        OPEN_DIRECT_TOPUP_APPROVAL_EVENT,
        openFromEvent,
      );
    };
  }, [canApprove, markReadMutation]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [close, open]);

  const requestQuery = useQuery({
    queryKey: ["student", "wallet-direct-topup-request", requestId],
    queryFn: () => studentApi.getStudentWalletDirectTopUpRequest(requestId!),
    enabled: open && canApprove && Boolean(requestId),
  });

  const request = requestQuery.data ?? null;

  const approveMutation = useMutation({
    mutationFn: () =>
      studentApi.approveStudentWalletDirectTopUpRequest(requestId ?? ""),
    onSuccess: async (result) => {
      toast.success(result.message || "Đã duyệt yêu cầu nạp ví.");
      const studentId = request?.studentId;
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["student", "wallet-direct-topup-requests"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["student", "wallet-direct-topup-request", requestId],
        }),
        ...(studentId
          ? [
              queryClient.invalidateQueries({
                queryKey: ["student", "detail", studentId],
              }),
              queryClient.invalidateQueries({
                queryKey: ["student", "wallet-history", studentId],
              }),
            ]
          : []),
        queryClient.invalidateQueries({ queryKey: ["student", "list"] }),
      ]);
      close();
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, "Không thể duyệt yêu cầu nạp ví."));
    },
  });

  if (!open || !canApprove || typeof document === "undefined") {
    return null;
  }

  const body = (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[130] bg-bg-primary/75"
        aria-label="Đóng popup duyệt nạp ví"
        onClick={close}
      />
      <div className="pointer-events-none fixed inset-0 z-[131] flex items-center justify-center p-3 sm:p-4">
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="direct-topup-approval-title"
          className="pointer-events-auto flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border-default bg-bg-surface shadow-2xl"
        >
          <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border-default px-4 py-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
                Nạp ví
              </p>
              <h2
                id="direct-topup-approval-title"
                className="mt-1 text-xl font-semibold text-text-primary"
              >
                Duyệt yêu cầu nạp thẳng
              </h2>
            </div>
            <button
              type="button"
              onClick={close}
              className="shrink-0 rounded-lg p-1.5 text-text-muted transition-colors hover:bg-bg-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
              aria-label="Đóng"
            >
              <span aria-hidden className="text-xl leading-none">
                ×
              </span>
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {requestQuery.isLoading ? (
              <div className="space-y-3" aria-busy="true">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-12 animate-pulse rounded-lg bg-bg-secondary"
                  />
                ))}
              </div>
            ) : requestQuery.isError ? (
              <div className="rounded-lg border border-error/20 bg-error/5 px-3 py-3 text-sm text-error">
                {getErrorMessage(
                  requestQuery.error,
                  "Không thể tải yêu cầu nạp ví.",
                )}
              </div>
            ) : request ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span
                    className={cn(
                      "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1",
                      statusBadgeClass(request.status),
                    )}
                  >
                    {STATUS_LABELS[request.status]}
                  </span>
                  <span className="break-all text-xs text-text-muted">
                    {request.id}
                  </span>
                </div>
                <ApprovalDetailRows request={request} />
              </div>
            ) : null}
          </div>

          <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-border-default p-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={close}
              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-border-default bg-bg-surface px-4 text-sm font-medium text-text-primary transition-colors hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            >
              Đóng
            </button>
            {request?.status === "pending" ? (
              <button
                type="button"
                onClick={() => approveMutation.mutate()}
                disabled={approveMutation.isPending}
                className="inline-flex min-h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-text-inverse transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-60"
              >
                {approveMutation.isPending ? "Đang duyệt..." : "Duyệt nạp ví"}
              </button>
            ) : null}
          </footer>
        </section>
      </div>
    </>
  );

  return createPortal(body, document.body);
}
