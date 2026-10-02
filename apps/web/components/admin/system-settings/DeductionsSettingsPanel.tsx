"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DateInput } from "@/components/ui/DateInput";
import UpgradedSelect from "@/components/ui/UpgradedSelect";
import type {
  RoleTaxDeductionRate,
  StaffRoleType,
} from "@/dtos/deduction-settings.dto";
import { getFullProfile } from "@/lib/apis/auth.api";
import * as deductionSettingsApi from "@/lib/apis/deduction-settings.api";
import { resolveAdminShellAccess } from "@/lib/admin-shell-access";
import { ROLE_LABELS } from "@/lib/staff.constants";

type RoleDefaultFormState = {
  roleType: StaffRoleType;
  ratePercentInput: string;
  effectiveFrom: string;
};

const STAFF_ROLE_OPTIONS: { value: StaffRoleType; label: string }[] = [
  { value: "teacher", label: ROLE_LABELS.teacher },
  { value: "assistant", label: ROLE_LABELS.assistant },
  { value: "accountant_income", label: ROLE_LABELS.accountant_income },
  { value: "accountant_expense", label: ROLE_LABELS.accountant_expense },
  { value: "customer_care", label: ROLE_LABELS.customer_care },
  { value: "lesson_plan", label: ROLE_LABELS.lesson_plan },
  { value: "lesson_plan_head", label: ROLE_LABELS.lesson_plan_head },
  { value: "communication", label: ROLE_LABELS.communication },
  { value: "technical", label: ROLE_LABELS.technical },
  { value: "training", label: ROLE_LABELS.training },
];

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function getTodayDateString() {
  return new Date().toISOString().slice(0, 10);
}

function createRoleDefaultFormState(today: string): RoleDefaultFormState {
  return {
    roleType: "teacher",
    ratePercentInput: "",
    effectiveFrom: today,
  };
}

function getApiErrorMessage(error: unknown, fallbackMessage: string) {
  const message = (
    error as { response?: { data?: { message?: string | string[] } } }
  )?.response?.data?.message;

  if (Array.isArray(message) && message.length > 0) {
    return message.join(", ");
  }

  if (typeof message === "string" && message.trim()) {
    return message;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallbackMessage;
}

function parseRatePercentOrThrow(rawValue: string) {
  const normalized = rawValue.trim();
  if (!normalized) {
    throw new Error("Vui lòng nhập tỷ lệ %.");
  }

  const numericValue = Number(normalized);
  if (!Number.isFinite(numericValue) || numericValue < 0 || numericValue > 100) {
    throw new Error("Tỷ lệ % phải nằm trong khoảng 0-100.");
  }

  return Number(numericValue.toFixed(2));
}

function RoleDefaultHistorySkeleton() {
  return (
    <div
      className="mt-3 max-h-64 overflow-hidden rounded-lg border border-border-default bg-bg-surface"
      aria-hidden
    >
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className="flex items-start justify-between gap-3 border-b border-border-default/70 px-3 py-2 last:border-b-0"
        >
          <div className="min-w-0 flex-1">
            <div className="h-4 w-40 animate-pulse rounded bg-bg-tertiary" />
            <div className="mt-2 h-3 w-60 max-w-full animate-pulse rounded bg-bg-secondary" />
          </div>
          <div className="h-9 w-20 shrink-0 animate-pulse rounded-lg border border-border-default bg-bg-secondary" />
        </div>
      ))}
    </div>
  );
}

export function DeductionsSettingsPanel() {
  const queryClient = useQueryClient();
  const [today] = useState(() => getTodayDateString());
  const [asOfDate, setAsOfDate] = useState(today);
  const [editingRoleDefaultId, setEditingRoleDefaultId] = useState<string | null>(
    null,
  );
  const [roleDefaultForm, setRoleDefaultForm] = useState<RoleDefaultFormState>(() =>
    createRoleDefaultFormState(today),
  );

  const isEditingRoleDefault = editingRoleDefaultId !== null;

  const resetRoleDefaultForm = () => {
    setEditingRoleDefaultId(null);
    setRoleDefaultForm(createRoleDefaultFormState(today));
  };

  const { data: fullProfile } = useQuery({
    queryKey: ["auth", "full-profile"],
    queryFn: getFullProfile,
    retry: false,
    staleTime: 60_000,
  });
  const { isAdmin } = resolveAdminShellAccess(fullProfile);
  const canEditSettings = isAdmin;

  const {
    data: settings,
    isLoading: isSettingsLoading,
    isError: isSettingsError,
  } = useQuery({
    queryKey: ["deduction-settings", "tax", asOfDate],
    queryFn: () =>
      deductionSettingsApi.getTaxDeductionSettings({
        asOfDate,
      }),
    staleTime: 30_000,
  });

  const appendRoleDefaultMutation = useMutation({
    mutationFn: deductionSettingsApi.appendRoleTaxDeductionRate,
    onSuccess: async () => {
      toast.success("Đã thêm mức khấu trừ thuế theo role.");
      resetRoleDefaultForm();
      await queryClient.invalidateQueries({ queryKey: ["deduction-settings", "tax"] });
    },
    onError: (error: unknown) => {
      toast.error(
        getApiErrorMessage(error, "Không thể thêm mức khấu trừ theo role."),
      );
    },
  });

  const updateRoleDefaultMutation = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: {
        ratePercent: number;
        effectiveFrom: string;
      };
    }) => deductionSettingsApi.updateRoleTaxDeductionRate(id, payload),
    onSuccess: async () => {
      toast.success("Đã cập nhật mức khấu trừ thuế theo role.");
      resetRoleDefaultForm();
      await queryClient.invalidateQueries({ queryKey: ["deduction-settings", "tax"] });
    },
    onError: (error: unknown) => {
      toast.error(
        getApiErrorMessage(error, "Không thể cập nhật mức khấu trừ theo role."),
      );
    },
  });

  const handleEditRoleDefault = (item: RoleTaxDeductionRate) => {
    setEditingRoleDefaultId(item.id);
    setRoleDefaultForm({
      roleType: item.roleType,
      ratePercentInput: String(item.ratePercent),
      effectiveFrom: item.effectiveFrom,
    });
  };

  const handleSubmitRoleDefault = async () => {
    if (!canEditSettings) return;

    let ratePercent: number;
    try {
      ratePercent = parseRatePercentOrThrow(roleDefaultForm.ratePercentInput);
    } catch (error) {
      toast.error((error as Error).message);
      return;
    }

    if (editingRoleDefaultId) {
      await updateRoleDefaultMutation
        .mutateAsync({
          id: editingRoleDefaultId,
          payload: {
            ratePercent,
            effectiveFrom: roleDefaultForm.effectiveFrom || today,
          },
        })
        .catch(() => undefined);
      return;
    }

    await appendRoleDefaultMutation
      .mutateAsync({
        roleType: roleDefaultForm.roleType,
        ratePercent,
        effectiveFrom: roleDefaultForm.effectiveFrom || today,
      })
      .catch(() => undefined);
  };

  const roleDefaultHistory = settings?.roleDefaults.history ?? [];
  const isRoleDefaultSubmitting =
    appendRoleDefaultMutation.isPending || updateRoleDefaultMutation.isPending;

  let roleDefaultSubmitLabel = "Thêm mức theo role";
  if (isEditingRoleDefault) {
    roleDefaultSubmitLabel = "Lưu điều chỉnh";
  }
  if (isRoleDefaultSubmitting) {
    roleDefaultSubmitLabel = "Đang lưu…";
  }

  const roleDefaultHelperText = isEditingRoleDefault
    ? "Đang điều chỉnh một mức đã có. Role được giữ nguyên, chỉ sửa tỷ lệ và ngày hiệu lực."
    : "Thiết lập mức thuế mặc định cho từng role. Việc chỉnh mức riêng cho từng nhân sự được thực hiện tại trang chi tiết nhân sự.";

  return (
    <div>
        <section className="relative mb-4 overflow-hidden rounded-2xl border border-border-default bg-gradient-to-br from-bg-secondary via-bg-surface to-bg-secondary/70 p-4 sm:p-5">
          <div
            className="pointer-events-none absolute -right-8 -top-8 size-28 rounded-full bg-primary/10 blur-2xl"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -bottom-8 left-16 size-24 rounded-full bg-warning/10 blur-2xl"
            aria-hidden
          />

          <div className="relative flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-text-primary sm:text-xl">
                Cấu hình khấu trừ
              </h2>
              <p className="mt-1 text-sm text-text-secondary">
                Thuế áp dụng cho mọi staff và được tính trên tổng thu nhập của
                từng nguồn trong kỳ; bonus không chịu thuế. Trang này chỉ quản
                lý mức thuế mặc định theo role. Nếu cần chỉnh mức riêng cho từng
                nhân sự, hãy thao tác tại card thuế trong trang chi tiết nhân
                sự.
              </p>
            </div>
            <label className="flex flex-col gap-1 text-sm text-text-secondary sm:w-56">
              <span>Hiệu lực tại ngày</span>
              <DateInput
                value={asOfDate}
                onChange={(event) => setAsOfDate(event.target.value || today)}
                className="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
              />
            </label>
          </div>
        </section>

        {!canEditSettings ? (
          <div className="mb-4 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
            Bạn đang ở chế độ chỉ xem. Chỉ admin mới có quyền thêm hoặc chỉnh
            sửa mức khấu trừ.
          </div>
        ) : null}

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <section className="w-full rounded-xl border border-border-default bg-bg-secondary/45 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-text-primary">
                  Khấu trừ thuế theo role
                </h2>
                <p className="mt-1 text-xs text-text-muted">{roleDefaultHelperText}</p>
              </div>
              {isEditingRoleDefault ? (
                <button
                  type="button"
                  onClick={resetRoleDefaultForm}
                  className="inline-flex min-h-10 items-center justify-center rounded-lg border border-border-default px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-bg-surface"
                >
                  Hủy
                </button>
              ) : null}
            </div>
            <div className="mt-3 grid gap-3">
              <label className="flex flex-col gap-1 text-sm text-text-secondary">
                <span>Role</span>
                <UpgradedSelect
                  name="tax-deduction-role"
                  value={roleDefaultForm.roleType}
                  onValueChange={(value) =>
                    setRoleDefaultForm((prev) => ({
                      ...prev,
                      roleType: value as StaffRoleType,
                    }))
                  }
                  options={STAFF_ROLE_OPTIONS}
                  disabled={!canEditSettings || isEditingRoleDefault}
                  buttonClassName="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-text-secondary">
                <span>Tỷ lệ (%)</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={roleDefaultForm.ratePercentInput}
                  onChange={(event) =>
                    setRoleDefaultForm((prev) => ({
                      ...prev,
                      ratePercentInput: event.target.value,
                    }))
                  }
                  placeholder="0"
                  className="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-right text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-text-secondary">
                <span>Hiệu lực từ ngày</span>
                <DateInput
                  value={roleDefaultForm.effectiveFrom}
                  onChange={(event) =>
                    setRoleDefaultForm((prev) => ({
                      ...prev,
                      effectiveFrom: event.target.value,
                    }))
                  }
                  className="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                />
              </label>
              <button
                type="button"
                onClick={handleSubmitRoleDefault}
                disabled={!canEditSettings || isRoleDefaultSubmitting}
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
              >
                {roleDefaultSubmitLabel}
              </button>
            </div>
          </section>

          <section className="rounded-xl border border-border-default bg-bg-secondary/45 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-text-primary">
              Lịch sử mức theo role
            </h2>
            {isSettingsLoading ? (
              <RoleDefaultHistorySkeleton />
            ) : isSettingsError ? null : roleDefaultHistory.length === 0 ? (
              <p className="mt-3 text-sm text-text-muted">Chưa có lịch sử.</p>
            ) : (
              <div className="mt-3 max-h-64 overflow-auto rounded-lg border border-border-default bg-bg-surface">
                {roleDefaultHistory.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start justify-between gap-3 border-b border-border-default/70 px-3 py-2 text-sm last:border-b-0"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-text-primary">
                        {ROLE_LABELS[item.roleType] ?? item.roleType}:{" "}
                        {item.ratePercent}%
                      </p>
                      <p className="text-xs text-text-muted">
                        Hiệu lực: {item.effectiveFrom} · Tạo lúc:{" "}
                        {formatDateTime(item.createdAt)}
                      </p>
                    </div>
                    {canEditSettings ? (
                      <button
                        type="button"
                        onClick={() => handleEditRoleDefault(item)}
                        className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-lg border border-border-default px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-bg-secondary"
                      >
                        Chỉnh sửa
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {isSettingsError ? (
          <p className="mt-4 rounded-lg border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
            Không tải được dữ liệu cấu hình khấu trừ từ backend.
          </p>
        ) : null}
    </div>
  );
}
