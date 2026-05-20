"use client";

import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useDebounce } from "use-debounce";
import { toast } from "sonner";
import * as staffApi from "@/lib/apis/staff.api";
import { ROLE_LABELS } from "@/lib/staff.constants";
import { MonthInput } from "@/components/ui/MonthInput";
import UpgradedSelect from "@/components/ui/UpgradedSelect";
import type {
  ExtraAllowanceBaseFields,
  ExtraAllowanceRoleType,
  ExtraAllowanceStatus,
  ExtraAllowanceUpsertMode,
} from "@/dtos/extra-allowance.dto";
import type { StaffOption } from "@/dtos/staff.dto";
import {
  EXTRA_ALLOWANCE_ROLE_OPTIONS,
  EXTRA_ALLOWANCE_STATUS_OPTIONS,
  getExtraAllowanceRoleLabel,
  getExtraAllowanceStatusLabel,
} from "./extraAllowancePresentation";

export interface ExtraAllowanceFormSubmitPayload {
  staffId: string;
  month: string;
  amount: number;
  status: ExtraAllowanceStatus;
  note?: string;
  roleType: ExtraAllowanceRoleType;
}

type Props = {
  open: boolean;
  mode: ExtraAllowanceUpsertMode;
  onClose: () => void;
  initialData?: ExtraAllowanceBaseFields | null;
  lockedContext?: {
    staff: StaffOption;
    roleType: ExtraAllowanceRoleType;
  } | null;
  lockedRoleType?: ExtraAllowanceRoleType | null;
  /** When provided, status stays fixed to this value and cannot be edited. */
  lockedStatus?: ExtraAllowanceStatus | null;
  /** Backward-compatible alias for self-service create. */
  lockStatusToPending?: boolean;
  onSubmit: (payload: ExtraAllowanceFormSubmitPayload) => Promise<void> | void;
  isSubmitting?: boolean;
};

function getPopupTitle(mode: ExtraAllowanceUpsertMode): string {
  return mode === "create" ? "Thêm trợ cấp" : "Chỉnh sửa trợ cấp";
}

function getSubmitLabel(
  mode: ExtraAllowanceUpsertMode,
  isSubmitting: boolean,
): string {
  if (isSubmitting) return "Đang lưu…";
  return mode === "create" ? "Tạo trợ cấp" : "Lưu thay đổi";
}

function getInitialMonth(initialData?: ExtraAllowanceBaseFields | null): string {
  return initialData?.month?.trim() ?? "";
}

function getInitialStatus(
  initialData?: ExtraAllowanceBaseFields | null,
): ExtraAllowanceStatus {
  return initialData?.status ?? "pending";
}

function getInitialRoleType(
  initialData?: ExtraAllowanceBaseFields | null,
): ExtraAllowanceRoleType {
  return initialData?.roleType ?? "teacher";
}

function getInitialAmountInput(
  initialData?: ExtraAllowanceBaseFields | null,
): string {
  return initialData?.amount == null || Number.isNaN(initialData.amount)
    ? ""
    : String(initialData.amount);
}

function getInitialNote(initialData?: ExtraAllowanceBaseFields | null): string {
  return initialData?.note?.trim() ?? "";
}

function getInitialStaff(
  initialData?: ExtraAllowanceBaseFields | null,
): StaffOption | null {
  if (!initialData?.staff?.id || !initialData.staff.fullName) {
    return null;
  }

  return {
    id: initialData.staff.id,
    fullName: initialData.staff.fullName,
    status: initialData.staff.status,
    roles: Array.isArray(initialData.staff.roles) ? initialData.staff.roles : [],
  };
}

function formatStaffRoleSummary(roles: string[] | undefined): string {
  if (!roles?.length) {
    return "Chưa gắn role nội bộ";
  }

  return roles.map((role) => ROLE_LABELS[role] ?? role).join(" · ");
}

export default function ExtraAllowanceFormPopup({
  open,
  mode,
  onClose,
  initialData,
  lockedContext,
  lockedRoleType = null,
  lockedStatus = null,
  lockStatusToPending = false,
  onSubmit,
  isSubmitting = false,
}: Props) {
  const isContextLocked = Boolean(lockedContext);
  const effectiveLockedRoleType = lockedContext?.roleType ?? lockedRoleType;
  const effectiveLockedStatus = lockedStatus ?? (lockStatusToPending ? "pending" : null);
  const [selectedStaff, setSelectedStaff] = useState<StaffOption | null>(() =>
    lockedContext?.staff ?? getInitialStaff(initialData),
  );
  const [staffSearchInput, setStaffSearchInput] = useState("");
  const [staffSearchFocused, setStaffSearchFocused] = useState(false);
  const [month, setMonth] = useState(() => getInitialMonth(initialData));
  const [status, setStatus] = useState<ExtraAllowanceStatus>(() =>
    effectiveLockedStatus ?? getInitialStatus(initialData),
  );
  const [roleType, setRoleType] = useState<ExtraAllowanceRoleType>(() =>
    effectiveLockedRoleType ?? getInitialRoleType(initialData),
  );
  const [amountInput, setAmountInput] = useState(() =>
    getInitialAmountInput(initialData),
  );
  const [note, setNote] = useState(() => getInitialNote(initialData));
  const [debouncedStaffSearch] = useDebounce(staffSearchInput.trim(), 250);
  const staffSearchRef = useRef<HTMLDivElement | null>(null);

  const { data: staffOptions = [], isLoading: isStaffOptionsLoading } = useQuery({
    queryKey: [
      "staff",
      "options",
      { search: debouncedStaffSearch, limit: 12 },
    ],
    queryFn: () =>
      staffApi.searchStaffOptions({
        search: debouncedStaffSearch || undefined,
        limit: 12,
      }),
    enabled: open && !isContextLocked,
  });

  const availableStaffOptions = staffOptions.filter(
    (option) => option.id !== selectedStaff?.id,
  );

  useEffect(() => {
    if (!staffSearchFocused) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!staffSearchRef.current?.contains(event.target as Node)) {
        setStaffSearchFocused(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setStaffSearchFocused(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [staffSearchFocused]);

  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedStaff?.id) {
      toast.error("Nhân sự là bắt buộc.");
      return;
    }

    const trimmedMonth = month.trim();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(trimmedMonth)) {
      toast.error("Tháng phải đúng định dạng YYYY-MM.");
      return;
    }

    const trimmedAmount = amountInput.trim();
    const parsedAmount = Number(trimmedAmount);
    if (!trimmedAmount || !Number.isFinite(parsedAmount) || parsedAmount < 0) {
      toast.error("Số tiền phải là số hợp lệ và lớn hơn hoặc bằng 0.");
      return;
    }

    await onSubmit({
      staffId: selectedStaff.id,
      month: trimmedMonth,
      amount: Math.floor(parsedAmount),
      status: effectiveLockedStatus ?? status,
      note: note.trim() || undefined,
      roleType,
    });
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-bg-primary/75" aria-hidden onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="extra-allowance-form-popup-title"
        className="fixed inset-x-3 top-1/2 z-50 max-h-[88vh] -translate-y-1/2 overflow-y-auto overscroll-contain rounded-xl border border-border-default bg-bg-surface p-4 shadow-xl sm:left-1/2 sm:w-full sm:max-w-2xl sm:-translate-x-1/2 sm:p-5"
      >
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2
            id="extra-allowance-form-popup-title"
            className="text-lg font-semibold text-text-primary"
          >
            {getPopupTitle(mode)}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-text-muted transition-colors duration-200 hover:bg-bg-tertiary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            aria-label="Đóng"
          >
            <svg
              className="size-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {isContextLocked && lockedContext ? (
              <div className="rounded-xl border border-border-default bg-bg-secondary/45 px-3 py-2.5 sm:col-span-2">
                <p className="text-xs font-medium text-text-muted">Nhân sự</p>
                <p className="mt-1 truncate text-sm font-semibold text-text-primary">
                  {lockedContext.staff.fullName}
                </p>
                <p className="mt-1 truncate text-xs text-text-muted">
                  {formatStaffRoleSummary(lockedContext.staff.roles)}
                </p>
              </div>
            ) : (
              <label className="flex flex-col gap-1 text-sm text-text-secondary sm:col-span-2">
                <span>Nhân sự</span>
                <div className="space-y-2">
                  {selectedStaff ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-text-primary">
                          {selectedStaff.fullName}
                        </p>
                        <p className="truncate text-xs text-text-muted">
                          {formatStaffRoleSummary(selectedStaff.roles)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedStaff(null)}
                        className="inline-flex min-h-10 items-center justify-center rounded-full border border-border-default bg-bg-surface px-3 text-xs font-semibold text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                      >
                        Đổi nhân sự
                      </button>
                    </div>
                  ) : null}

                  <div className="relative" ref={staffSearchRef}>
                    <div
                      className={`flex min-h-11 items-center rounded-md border bg-bg-surface px-3 ${staffSearchFocused
                        ? "border-border-focus ring-2 ring-border-focus/30"
                        : "border-border-default"
                        }`}
                    >
                      <svg
                        className="size-4 shrink-0 text-text-muted"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        aria-hidden
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="m21 21-4.35-4.35m1.85-5.15a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z"
                        />
                      </svg>
                      <input
                        name="extra_allowance_staff_search"
                        type="text"
                        autoComplete="off"
                        spellCheck={false}
                        value={staffSearchInput}
                        onChange={(event) => setStaffSearchInput(event.target.value)}
                        onFocus={() => setStaffSearchFocused(true)}
                        aria-haspopup="listbox"
                        aria-controls={
                          staffSearchFocused
                            ? "extra-allowance-staff-options"
                            : undefined
                        }
                        aria-autocomplete="list"
                        placeholder={
                          selectedStaff
                            ? "Tìm nhân sự khác theo họ và tên…"
                            : "Tìm nhân sự theo họ và tên…"
                        }
                        className="min-w-0 flex-1 bg-transparent px-2 py-2.5 text-sm text-text-primary outline-none placeholder:text-text-muted"
                      />
                      {staffSearchInput ? (
                        <button
                          type="button"
                          onClick={() => setStaffSearchInput("")}
                          className="rounded-full p-1 text-text-muted transition-colors hover:bg-bg-tertiary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                          aria-label="Xóa từ khóa tìm nhân sự"
                        >
                          <svg
                            className="size-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            aria-hidden
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M6 18 18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      ) : null}
                    </div>

                    {staffSearchFocused ? (
                      <div
                        id="extra-allowance-staff-options"
                        role="listbox"
                        className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-xl border border-border-default bg-bg-surface py-1 shadow-lg"
                      >
                        {isStaffOptionsLoading ? (
                          <p
                            className="px-3 py-2 text-sm text-text-muted"
                            aria-live="polite"
                          >
                            Đang tìm nhân sự…
                          </p>
                        ) : availableStaffOptions.length === 0 ? (
                          <p className="px-3 py-2 text-sm text-text-muted">
                            {staffSearchInput.trim()
                              ? "Không tìm thấy nhân sự phù hợp."
                              : "Nhập tên để tìm nhân sự."}
                          </p>
                        ) : (
                          availableStaffOptions.map((option) => (
                            <button
                              key={option.id}
                              type="button"
                              role="option"
                              aria-selected={selectedStaff?.id === option.id}
                              onClick={() => {
                                setSelectedStaff(option);
                                setStaffSearchInput("");
                                setStaffSearchFocused(false);
                              }}
                              className="flex w-full flex-col items-start gap-1 px-3 py-2 text-left text-sm text-text-primary transition-colors hover:bg-bg-tertiary focus:bg-bg-tertiary focus:outline-none"
                            >
                              <span className="font-medium">{option.fullName}</span>
                              <span className="text-xs text-text-muted">
                                {formatStaffRoleSummary(option.roles)}
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
              </label>
            )}

            {effectiveLockedRoleType ? (
              <div className="flex flex-col gap-1 text-sm text-text-secondary">
                <span>Loại vai trò</span>
                <div className="min-h-11 rounded-md border border-border-default bg-bg-secondary/50 px-3 py-2.5 text-text-primary">
                  <span className="font-medium">
                    {getExtraAllowanceRoleLabel(effectiveLockedRoleType)}
                  </span>
                </div>
              </div>
            ) : (
              <label className="flex flex-col gap-1 text-sm text-text-secondary">
                <span>Loại vai trò</span>
                <UpgradedSelect
                  name="extra-allowance-role-type"
                  value={roleType}
                  onValueChange={(nextValue) =>
                    setRoleType(nextValue as ExtraAllowanceRoleType)
                  }
                  options={EXTRA_ALLOWANCE_ROLE_OPTIONS}
                  buttonClassName="min-h-11 rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                />
              </label>
            )}

            <label className="flex flex-col gap-1 text-sm text-text-secondary">
              <span>Tháng</span>
              <MonthInput
                name="extra_allowance_month"
                autoComplete="off"
                value={month}
                onChange={(event) => setMonth(event.target.value)}
                className="min-h-11 rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                required
              />
            </label>

            <div className="flex flex-col gap-1 text-sm text-text-secondary">
              <span>Trạng thái</span>
              {effectiveLockedStatus ? (
                <div className="min-h-11 rounded-md border border-border-default bg-bg-secondary/50 px-3 py-2.5 text-text-primary">
                  <span className="font-medium">
                    {getExtraAllowanceStatusLabel(effectiveLockedStatus)}
                  </span>

                </div>
              ) : (
                <UpgradedSelect
                  name="extra-allowance-status"
                  value={status}
                  onValueChange={(nextValue) =>
                    setStatus(nextValue as ExtraAllowanceStatus)
                  }
                  options={EXTRA_ALLOWANCE_STATUS_OPTIONS}
                  buttonClassName="min-h-11 rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                />
              )}
            </div>

            <label className="flex flex-col gap-1 text-sm text-text-secondary lg:col-span-2">
              <span>Số tiền</span>
              <input
                name="extra_allowance_amount"
                autoComplete="off"
                inputMode="numeric"
                type="number"
                min={0}
                step={1}
                value={amountInput}
                onChange={(event) => setAmountInput(event.target.value)}
                placeholder="Ví dụ: 500000…"
                className="min-h-11 rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                required
              />
            </label>

            <label className="flex flex-col gap-1 text-sm text-text-secondary sm:col-span-2">
              <span>Ghi chú</span>
              <textarea
                name="extra_allowance_note"
                autoComplete="off"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Ví dụ: Hỗ trợ thêm cho tháng này…"
                rows={3}
                className="rounded-md border border-border-default bg-bg-surface px-3 py-2.5 text-sm text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
              />
            </label>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border-default pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border-default bg-bg-surface px-4 py-2 text-sm font-medium text-text-primary transition-colors duration-200 hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-text-inverse transition-colors duration-200 hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:opacity-60"
            >
              {getSubmitLabel(mode, isSubmitting)}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
