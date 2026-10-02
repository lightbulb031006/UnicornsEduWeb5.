"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MoneyInput } from "@/components/ui/MoneyInput";
import StaffCard from "@/components/admin/staff/StaffCard";
import { formatCurrency } from "@/lib/class.helpers";
import * as staffApi from "@/lib/apis/staff.api";
import {
  moneyInputInitialFromNumber,
  parseMoneyInput,
} from "@/lib/money-input.helpers";
import type { StaffFixedSalaryPayableItem } from "@/dtos/staff.dto";

function formatMonthLabel(monthKey: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey.trim());
  if (!match) return monthKey;
  return `Tháng ${match[2]}/${match[1]}`;
}

export default function StaffFixedSalaryIncomeCard({
  staffId,
  payables,
  canEdit,
  isLoading,
  isError,
}: {
  staffId: string;
  payables: StaffFixedSalaryPayableItem[];
  canEdit: boolean;
  isLoading?: boolean;
  isError?: boolean;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<StaffFixedSalaryPayableItem | null>(
    null,
  );
  const [amountDraft, setAmountDraft] = useState("");
  const [noteDraft, setNoteDraft] = useState("");

  useEffect(() => {
    if (!editing) return;
    setAmountDraft(moneyInputInitialFromNumber(editing.grossAmount));
    setNoteDraft(editing.note ?? "");
  }, [editing]);

  const updateMutation = useMutation({
    mutationFn: (payload: { amount: number; note: string | null }) =>
      staffApi.updateStaffFixedSalaryPayable(staffId, editing!.id, payload),
    onSuccess: async () => {
      toast.success("Đã cập nhật khoản lương cứng.");
      setEditing(null);
      await queryClient.invalidateQueries({
        queryKey: ["staff", "income-summary", staffId],
      });
      await queryClient.invalidateQueries({
        queryKey: ["staff", "payment-preview", staffId],
      });
    },
    onError: (error: unknown) => {
      const message =
        error && typeof error === "object" && "response" in error
          ? String(
              (error as { response?: { data?: { message?: string } } }).response
                ?.data?.message ?? "Không cập nhật được lương cứng.",
            )
          : "Không cập nhật được lương cứng.";
      toast.error(message);
    },
  });

  const handleSave = () => {
    if (!editing) return;
    const parsed = parseMoneyInput(amountDraft);
    if (parsed == null || parsed < 0) {
      toast.error("Số tiền phải là số không âm.");
      return;
    }
    const note = noteDraft.trim();
    updateMutation.mutate({
      amount: parsed,
      note: note.length > 0 ? note : null,
    });
  };

  return (
    <StaffCard title="Lương cứng">
      <p className="mb-3 text-xs text-text-muted">
        Tách khỏi trợ cấp, thưởng và trợ cấp thêm. Mỗi dòng là một khoản đã
        chốt theo tháng. Số gộp, khấu trừ vận hành, thuế và thực nhận lấy từ
        mức đóng băng khi chốt tháng.
      </p>
      {isLoading ? (
        <p className="text-text-muted" aria-live="polite">
          Đang tải lương cứng…
        </p>
      ) : isError ? (
        <p className="text-error" role="alert">
          Không tải được dữ liệu lương cứng.
        </p>
      ) : payables.length === 0 ? (
        <p className="text-text-muted">Chưa có khoản lương cứng.</p>
      ) : (
        <ul className="space-y-2">
          {payables.map((item) => {
            const isPending = item.status === "pending";
            return (
              <li
                key={item.id}
                className="rounded-lg border border-border-default px-4 py-3"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-medium text-text-primary">
                      {item.roleLabel} · {formatMonthLabel(item.month)}
                    </p>
                    {item.note ? (
                      <p className="mt-1 text-xs text-text-muted">{item.note}</p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-text-secondary">
                      <span>Gộp {formatCurrency(item.grossAmount)}</span>
                      <span>
                        KH VH {formatCurrency(item.operatingDeductionAmount)}{" "}
                        ({item.operatingRatePercent}%)
                      </span>
                      <span>
                        Thuế {formatCurrency(item.taxDeductionAmount)} (
                        {item.taxRatePercent}%)
                      </span>
                      <span className="font-semibold text-primary">
                        Thực nhận {formatCurrency(item.netAmount)}
                      </span>
                      <span className={isPending ? "text-error" : "text-success"}>
                        {isPending ? "Chờ thanh toán" : "Đã thanh toán"}
                      </span>
                    </div>
                  </div>
                  {canEdit && isPending ? (
                    <button
                      type="button"
                      className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-md border border-border-default px-3 text-sm font-medium text-text-primary"
                      onClick={() => setEditing(item)}
                    >
                      Sửa
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editing ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-fixed-salary-title"
          onClick={() => {
            if (!updateMutation.isPending) setEditing(null);
          }}
        >
          <div
            className="w-full max-w-md rounded-lg border border-border-default bg-bg-surface p-4 shadow-lg"
            onClick={(event) => event.stopPropagation()}
          >
            <h3
              id="edit-fixed-salary-title"
              className="text-base font-semibold text-text-primary"
            >
              Sửa lương cứng · {editing.roleLabel}
            </h3>
            <p className="mt-1 text-xs text-text-muted">
              Thực nhận tính lại theo % vận hành {editing.operatingRatePercent}%
              và thuế {editing.taxRatePercent}% đã đóng băng trên khoản này.
              Không xoá được khoản — muốn không trả thì đặt mức đè 0 ở tab Lương
              cứng.
            </p>
            <label className="mt-4 block text-sm font-medium text-text-primary">
              Số gộp
              <div className="mt-1">
                <MoneyInput
                  value={amountDraft}
                  onValueChange={setAmountDraft}
                  aria-label="Số gộp lương cứng"
                  className="w-full rounded-md border border-border-default bg-bg-secondary px-3 py-2 text-sm"
                />
              </div>
            </label>
            <label className="mt-3 block text-sm font-medium text-text-primary">
              Ghi chú
              <textarea
                className="mt-1 min-h-20 w-full rounded-md border border-border-default bg-bg-secondary px-3 py-2 text-sm"
                value={noteDraft}
                onChange={(event) => setNoteDraft(event.target.value)}
              />
            </label>
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="inline-flex min-h-11 items-center justify-center rounded-md border border-border-default px-4 text-sm"
                disabled={updateMutation.isPending}
                onClick={() => setEditing(null)}
              >
                Hủy
              </button>
              <button
                type="button"
                className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-text-inverse"
                disabled={updateMutation.isPending}
                onClick={handleSave}
              >
                {updateMutation.isPending ? "Đang lưu…" : "Lưu"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </StaffCard>
  );
}
