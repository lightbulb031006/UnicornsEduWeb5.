"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BrandLogoLockup } from "@/components/BrandLogoLockup";
import type { StudentWalletDirectTopUpRequestResponse } from "@/dtos/student.dto";
import * as studentApi from "@/lib/apis/student.api";
import { formatCurrency } from "@/lib/class.helpers";
import { formatVnDateTime } from "@/lib/formatters";

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  try {
    return formatVnDateTime(new Date(value));
  } catch {
    return "—";
  }
}

function getErrorMessage(error: unknown): string {
  return (
    (error as { response?: { data?: { message?: string } } })?.response?.data
      ?.message ??
    (error as Error)?.message ??
    "Không thể xử lý link xác nhận."
  );
}

function statusLabel(request?: StudentWalletDirectTopUpRequestResponse | null) {
  if (!request) return "Đang kiểm tra";
  if (request.status === "approved") return "Đã duyệt";
  if (request.status === "expired") return "Đã hết hạn";
  return "Chờ xác nhận";
}

function DirectTopUpApprovalContent() {
  const searchParams = useSearchParams();
  const getSearchParam = searchParams.get.bind(searchParams);
  const queryClient = useQueryClient();
  const token = getSearchParam("token")?.trim() ?? "";
  const queryKey = ["student", "wallet-direct-topup-approval", token];

  const approvalQuery = useQuery({
    queryKey,
    queryFn: () => studentApi.getStudentWalletDirectTopUpApproval(token),
    enabled: token.length > 0,
    retry: false,
  });

  const confirmMutation = useMutation({
    mutationFn: () => studentApi.confirmStudentWalletDirectTopUpApproval(token),
    onSuccess: async (result) => {
      toast.success(result.message);
      await queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });

  const request = approvalQuery.data;
  const missingToken = token.length === 0;
  const canConfirm =
    Boolean(request) &&
    request?.status === "pending" &&
    !confirmMutation.isSuccess;
  const result = confirmMutation.data;
  const title = missingToken
    ? "Thiếu token xác nhận"
    : approvalQuery.isPending
      ? "Đang tải yêu cầu"
      : approvalQuery.isError
        ? "Link xác nhận không hợp lệ"
        : result?.status === "approved"
          ? "Đã nạp ví học sinh"
          : statusLabel(request);

  return (
    <main className="min-h-screen bg-bg-primary px-4 py-8 sm:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-3xl flex-col justify-center">
        <section className="rounded-[1.5rem] border border-border-default bg-bg-surface p-5 shadow-lg sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <BrandLogoLockup
                variant="auth"
                className="max-w-full flex-wrap"
                priority
              />
              <p className="mt-8 text-xs font-semibold uppercase tracking-[0.24em] text-primary">
                Direct Wallet Top-Up
              </p>
              <h1 className="mt-3 text-2xl font-semibold text-text-primary sm:text-3xl">
                {title}
              </h1>
            </div>
            {request ? (
              <span
                className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
                  request.status === "approved" || result?.status === "approved"
                    ? "bg-success/10 text-success ring-success/20"
                    : request.status === "expired"
                      ? "bg-error/10 text-error ring-error/20"
                      : "bg-warning/15 text-text-primary ring-warning/20"
                }`}
              >
                {result?.status === "approved" ? "Đã duyệt" : statusLabel(request)}
              </span>
            ) : null}
          </div>

          {missingToken ? (
            <p className="mt-6 rounded-xl border border-error/20 bg-error/10 px-4 py-3 text-sm leading-6 text-error">
              Link bị thiếu token. Vui lòng mở lại đúng link trong email.
            </p>
          ) : approvalQuery.isPending ? (
            <div className="mt-8 grid gap-3" aria-busy="true">
              <div className="h-16 animate-pulse rounded-xl bg-bg-secondary" />
              <div className="h-16 animate-pulse rounded-xl bg-bg-secondary" />
              <div className="h-24 animate-pulse rounded-xl bg-bg-secondary" />
            </div>
          ) : approvalQuery.isError ? (
            <p className="mt-6 rounded-xl border border-error/20 bg-error/10 px-4 py-3 text-sm leading-6 text-error">
              {getErrorMessage(approvalQuery.error)}
            </p>
          ) : request ? (
            <>
              <dl className="mt-8 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-border-default bg-bg-secondary/60 px-4 py-3">
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                    Học sinh
                  </dt>
                  <dd className="mt-1 break-words text-sm font-semibold text-text-primary">
                    {request.studentName}
                  </dd>
                </div>
                <div className="rounded-xl border border-border-default bg-bg-secondary/60 px-4 py-3">
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                    Mã học sinh
                  </dt>
                  <dd className="mt-1 break-all text-sm font-semibold text-text-primary">
                    {request.studentId}
                  </dd>
                </div>
                <div className="rounded-xl border border-border-default bg-bg-secondary/60 px-4 py-3">
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                    Số tiền
                  </dt>
                  <dd className="mt-1 text-lg font-semibold tabular-nums text-primary">
                    {formatCurrency(request.amount)}
                  </dd>
                </div>
                <div className="rounded-xl border border-border-default bg-bg-secondary/60 px-4 py-3">
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                    Hết hạn
                  </dt>
                  <dd className="mt-1 text-sm font-semibold text-text-primary">
                    {formatDateTime(request.expiresAt)}
                  </dd>
                </div>
                <div className="rounded-xl border border-border-default bg-bg-secondary/60 px-4 py-3 sm:col-span-2">
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                    Lý do
                  </dt>
                  <dd className="mt-1 whitespace-pre-wrap text-sm leading-6 text-text-primary">
                    {request.reason}
                  </dd>
                </div>
                <div className="rounded-xl border border-border-default bg-bg-secondary/60 px-4 py-3 sm:col-span-2">
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                    Người yêu cầu
                  </dt>
                  <dd className="mt-1 break-all text-sm font-semibold text-text-primary">
                    {request.requestedByUserEmail || "—"}
                  </dd>
                </div>
              </dl>

              {result ? (
                <p className="mt-6 rounded-xl border border-success/20 bg-success/10 px-4 py-3 text-sm leading-6 text-success">
                  {result.message}
                  {typeof result.balanceAfter === "number"
                    ? ` Số dư sau nạp: ${formatCurrency(result.balanceAfter)}.`
                    : ""}
                </p>
              ) : request.status === "expired" ? (
                <p className="mt-6 rounded-xl border border-error/20 bg-error/10 px-4 py-3 text-sm leading-6 text-error">
                  Link này đã hết hạn. Vui lòng yêu cầu nhân sự tạo lại yêu cầu
                  nạp thẳng nếu vẫn cần xử lý.
                </p>
              ) : request.status === "approved" ? (
                <p className="mt-6 rounded-xl border border-success/20 bg-success/10 px-4 py-3 text-sm leading-6 text-success">
                  Yêu cầu này đã được duyệt trước đó.
                </p>
              ) : null}

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => confirmMutation.mutate()}
                  disabled={!canConfirm || confirmMutation.isPending}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-text-inverse transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {confirmMutation.isPending
                    ? "Đang xác nhận..."
                    : "Xác nhận nạp ví"}
                </button>
              </div>
            </>
          ) : null}
        </section>
      </div>
    </main>
  );
}

export default function WalletDirectTopUpApprovalPage() {
  return (
    <Suspense fallback={null}>
      <DirectTopUpApprovalContent />
    </Suspense>
  );
}
