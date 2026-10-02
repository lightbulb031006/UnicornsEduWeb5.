"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { StaffFixedSalaryPayable } from "@/dtos/fixed-salary-settings.dto";
import * as fixedSalarySettingsApi from "@/lib/apis/fixed-salary-settings.api";
import { ROLE_LABELS } from "@/lib/staff.constants";
import { getFixedSalaryApiErrorMessage } from "@/lib/fixed-salary-settings.helpers";

function formatVnd(amount: number) {
  return `${amount.toLocaleString("vi-VN")}đ`;
}

function formatPercent(value: number) {
  return `${value.toLocaleString("vi-VN")}%`;
}

function statusLabel(status: StaffFixedSalaryPayable["status"]) {
  return status === "paid" ? "Đã thanh toán" : "Chờ thanh toán";
}

export function FixedSalaryClosePanel({ canEdit }: { canEdit: boolean }) {
  const queryClient = useQueryClient();
  const payablesQuery = useQuery({
    queryKey: ["fixed-salary-settings", "payables", "current"],
    queryFn: () => fixedSalarySettingsApi.getStaffFixedSalaryPayables(),
  });

  const closeMutation = useMutation({
    mutationFn: fixedSalarySettingsApi.closeFixedSalaryMonth,
    onSuccess: async (result) => {
      queryClient.setQueryData(
        ["fixed-salary-settings", "payables", "current"],
        {
          month: result.month,
          items: result.items,
        },
      );
      await queryClient.invalidateQueries({
        queryKey: ["fixed-salary-settings", "payables"],
      });
      toast.success(
        `Đã chốt tháng ${result.month}: sinh ${result.createdCount} khoản, bỏ qua ${result.skippedCount} khoản đã có.`,
      );
    },
    onError: (error) => {
      toast.error(
        getFixedSalaryApiErrorMessage(error, "Không chốt được lương tháng này."),
      );
    },
  });

  const month = payablesQuery.data?.month ?? "tháng này";
  const items = payablesQuery.data?.items ?? [];

  return (
    <section className="flex flex-col">
      <div className="relative mb-4 overflow-hidden rounded-2xl border border-border-default bg-gradient-to-br from-bg-secondary via-bg-surface to-bg-secondary/70 p-4 sm:p-5">
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-text-primary sm:text-xl">
              Chốt lương tháng này
            </h2>
            <p className="mt-1 text-sm text-text-secondary">
              Sinh khoản lương cứng tháng hiện tại. Ngày 28 hàng tháng hệ thống
              tự chốt; nếu tháng này đã chốt sớm thì lần tự động đó bỏ qua. Bấm
              chốt lại vẫn chạy như bình thường.
            </p>
          </div>
          <button
            type="button"
            onClick={() => closeMutation.mutate()}
            disabled={!canEdit || closeMutation.isPending}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-text-inverse transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-10 sm:w-auto"
          >
            {closeMutation.isPending ? "Đang chốt…" : "Chốt lương tháng này"}
          </button>
        </div>
      </div>

      {payablesQuery.isError ? (
        <p className="mb-4 text-sm text-error">
          Không tải được khoản lương cứng đã chốt. Thử tải lại trang.
        </p>
      ) : null}

      <p className="mb-3 text-sm text-text-secondary">
        Khoản tháng {month}: {items.length} dòng.
      </p>

      <div className="grid gap-3 md:hidden">
        {payablesQuery.isLoading
          ? Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="h-32 animate-pulse rounded-xl border border-border-default bg-bg-secondary/45"
              />
            ))
          : items.length === 0
            ? (
                <p className="rounded-xl border border-dashed border-border-default px-4 py-6 text-sm text-text-muted">
                  Chưa có khoản nào cho tháng này. Bấm chốt để sinh khoản chờ
                  thanh toán.
                </p>
              )
            : items.map((item) => (
                <section
                  key={item.id}
                  className="rounded-xl border border-border-default bg-bg-secondary/45 p-4"
                >
                  <h3 className="text-sm font-semibold text-text-primary">
                    {item.staffFullName}
                  </h3>
                  <p className="mt-1 text-xs text-text-muted">
                    {ROLE_LABELS[item.roleType] ?? item.roleType} ·{" "}
                    {statusLabel(item.status)}
                  </p>
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <dt className="text-text-muted">Gộp</dt>
                      <dd className="tabular-nums text-text-primary">
                        {formatVnd(item.grossAmount)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-text-muted">Thực nhận</dt>
                      <dd className="tabular-nums font-medium text-text-primary">
                        {formatVnd(item.netAmount)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-text-muted">Vận hành</dt>
                      <dd className="tabular-nums text-text-secondary">
                        {formatPercent(item.operatingRatePercent)} ·{" "}
                        {formatVnd(item.operatingDeductionAmount)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-text-muted">Thuế</dt>
                      <dd className="tabular-nums text-text-secondary">
                        {formatPercent(item.taxRatePercent)} ·{" "}
                        {formatVnd(item.taxDeductionAmount)}
                      </dd>
                    </div>
                  </dl>
                </section>
              ))}
      </div>

      <div className="hidden overflow-x-auto md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nhân sự</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead className="text-right">Gộp</TableHead>
              <TableHead className="text-right">% vận hành</TableHead>
              <TableHead className="text-right">Khấu trừ vận hành</TableHead>
              <TableHead className="text-right">% thuế</TableHead>
              <TableHead className="text-right">Khấu trừ thuế</TableHead>
              <TableHead className="text-right">Thực nhận</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payablesQuery.isLoading ? (
              Array.from({ length: 4 }).map((_, index) => (
                <TableRow key={index}>
                  <TableCell colSpan={9}>
                    <div className="h-8 animate-pulse rounded bg-bg-secondary" />
                  </TableCell>
                </TableRow>
              ))
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="py-8 text-center text-sm text-text-muted"
                >
                  Chưa có khoản nào cho tháng này.
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium text-text-primary">
                    {item.staffFullName}
                  </TableCell>
                  <TableCell>
                    {ROLE_LABELS[item.roleType] ?? item.roleType}
                  </TableCell>
                  <TableCell>{statusLabel(item.status)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatVnd(item.grossAmount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPercent(item.operatingRatePercent)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatVnd(item.operatingDeductionAmount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPercent(item.taxRatePercent)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatVnd(item.taxDeductionAmount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {formatVnd(item.netAmount)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
