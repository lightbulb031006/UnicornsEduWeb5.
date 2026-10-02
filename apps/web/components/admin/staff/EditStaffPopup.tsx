"use client";

import { useMemo, useState, type SyntheticEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DateInput } from "@/components/ui/DateInput";
import { Switch } from "@/components/ui/switch";
import UpgradedSelect from "@/components/ui/UpgradedSelect";
import AchievementListEditor from "@/components/shared/achievement/AchievementListEditor";
import StaffRoleFixedSalaryFields from "@/components/admin/staff/StaffRoleFixedSalaryFields";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { StaffDetail, StaffGender } from "@/dtos/staff.dto";
import {
  isFixedSalaryStaffRole,
  type StaffRoleFixedSalaryOverrideItem,
} from "@/dtos/fixed-salary-settings.dto";
import * as staffApi from "@/lib/apis/staff.api";
import * as fixedSalarySettingsApi from "@/lib/apis/fixed-salary-settings.api";
import {
  collectDisabledRoleOverrideWarnings,
  formatDisabledRoleOverrideWarningLine,
  LOCKED_FIXED_SALARY_MONTH_NOTE,
  parseOptionalFixedSalaryAmountInput,
  parseOptionalFixedSalaryOperatingRateInput,
  type DisabledRoleOverrideWarning,
} from "@/lib/fixed-salary-settings.helpers";
import { moneyInputInitialFromNumber } from "@/lib/money-input.helpers";
import { ROLE_LABELS } from "@/lib/staff.constants";
import { runBackgroundSave } from "@/lib/mutation-feedback";

type Props = {
  open: boolean;
  onClose: () => void;
  staff: StaffDetail;
  /** Called after a successful update (after internal query invalidation). Use to invalidate page-level queries. */
  onSuccess?: () => void | Promise<void>;
};

const STATUS_OPTIONS: { value: StaffDetail["status"]; label: string; hint: string }[] = [
  { value: "active", label: "Hoạt động", hint: "Nhân sự đang làm việc và hiển thị bình thường." },
  { value: "inactive", label: "Ngừng hoạt động", hint: "Ẩn khỏi luồng làm việc chính, không dùng cho phân công mới." },
];

const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "teacher", label: "Giáo viên" },
  { value: "assistant", label: "Trợ lí" },
  { value: "lesson_plan", label: "Giáo án" },
  { value: "lesson_plan_head", label: "Trưởng giáo án" },
  { value: "accountant_income", label: "Kế toán thu" },
  { value: "accountant_expense", label: "Kế toán chi" },
  { value: "communication", label: "Truyền thông" },
  { value: "technical", label: "Kỹ thuật" },
  { value: "customer_care", label: "CSKH" },
  { value: "training", label: "Đào Tạo" },
];

function formatDateInput(iso?: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  } catch {
    return "";
  }
}

export default function EditStaffPopup({ open, onClose, staff, onSuccess }: Props) {
  const queryClient = useQueryClient();

  const [fullName, setFullName] = useState(staff.fullName ?? "");
  const [cccdNumber, setCccdNumber] = useState(staff.cccdNumber ?? "");
  const [ethnicity, setEthnicity] = useState(staff.ethnicity ?? "");
  const [gender, setGender] = useState<StaffGender | "">(staff.gender ?? "");
  const [currentAddress, setCurrentAddress] = useState(
    staff.currentAddress ?? "",
  );
  const [cccdIssuedDateInput, setCccdIssuedDateInput] = useState(
    () => formatDateInput(staff.cccdIssuedDate),
  );
  const [cccdIssuedPlace, setCccdIssuedPlace] = useState(
    staff.cccdIssuedPlace ?? "",
  );
  const [status, setStatus] = useState<StaffDetail["status"]>(staff.status ?? "active");
  const [statusReason, setStatusReason] = useState("");
  const [birthDateInput, setBirthDateInput] = useState(() => formatDateInput(staff.birthDate));
  const [university, setUniversity] = useState(staff.university ?? "");
  const [highSchool, setHighSchool] = useState(staff.highSchool ?? "");
  const [bankAccount, setBankAccount] = useState(staff.bankAccount ?? "");
  const [bankQrLink, setBankQrLink] = useState(staff.bankQrLink ?? "");
  const [revenueSharePercent, setRevenueSharePercent] = useState(
    staff.revenueSharePercent != null ? String(staff.revenueSharePercent) : "",
  );
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(
    () => new Set(staff.roles ?? []),
  );
  const [amountDraft, setAmountDraft] = useState<Record<string, string>>({});
  const [rateDraft, setRateDraft] = useState<Record<string, string>>({});
  const [overrideRemovalWarnings, setOverrideRemovalWarnings] = useState<
    DisabledRoleOverrideWarning[]
  >([]);
  const [managedByStaffId, setManagedByStaffId] = useState<string | null>(() => {
    if (
      staff.customerCareManagedByStaffId &&
      staff.customerCareManagedByStaffId === staff.id
    ) {
      return null;
    }
    return staff.customerCareManagedByStaffId ?? null;
  });

  const hasCustomerCareRole = selectedRoles.has("customer_care");
  const hasAssistantRole = selectedRoles.has("assistant");
  const isDualRole = hasCustomerCareRole && hasAssistantRole;
  const showManagedByField = hasCustomerCareRole && !isDualRole;
  const showRevenueShareField = selectedRoles.has("lesson_plan_head");

  const assistantOptionsQuery = useQuery({
    queryKey: ["staff", "assistant-options"],
    queryFn: () => staffApi.searchAssistantStaff({ limit: 50 }),
    enabled: showManagedByField,
    staleTime: 60_000,
  });
  const assistantOptions = (assistantOptionsQuery.data ?? []).filter(
    (option) => option.id !== staff.id,
  );

  const overridesQuery = useQuery({
    queryKey: ["fixed-salary-settings", "staff-overrides", { staffId: staff.id }],
    queryFn: () =>
      fixedSalarySettingsApi.getStaffFixedSalaryOverrides({
        staffId: staff.id,
        limit: 1,
      }),
    enabled: open,
    staleTime: 15_000,
  });
  const roleDefaultsQuery = useQuery({
    queryKey: ["fixed-salary-settings", "role-defaults"],
    queryFn: fixedSalarySettingsApi.getRoleFixedSalaryDefaults,
    enabled: open,
    staleTime: 60_000,
  });
  const roleOperatingRatesQuery = useQuery({
    queryKey: ["fixed-salary-settings", "role-operating-rates"],
    queryFn: fixedSalarySettingsApi.getRoleFixedSalaryOperatingRates,
    enabled: open,
    staleTime: 60_000,
  });

  const overrideStaff = overridesQuery.data?.staff?.[0] ?? null;
  const serverDrafts = useMemo(() => {
    const amount: Record<string, string> = {};
    const rate: Record<string, string> = {};
    for (const row of overrideStaff?.roles ?? []) {
      amount[row.roleType] = row.amount.hasOverride
        ? moneyInputInitialFromNumber(row.amount.overrideValue)
        : "";
      rate[row.roleType] =
        row.operatingRate.hasOverride && row.operatingRate.overrideValue != null
          ? String(row.operatingRate.overrideValue)
          : "";
    }
    return { amount, rate };
  }, [overrideStaff]);

  const amountValue = (role: string) =>
    amountDraft[role] ?? serverDrafts.amount[role] ?? "";
  const rateValue = (role: string) =>
    rateDraft[role] ?? serverDrafts.rate[role] ?? "";
  const roleDefaultAmount = (role: string) =>
    roleDefaultsQuery.data?.roles.find((row) => row.roleType === role)?.amount ??
    null;
  const roleDefaultRate = (role: string) =>
    roleOperatingRatesQuery.data?.roles.find((row) => row.roleType === role)
      ?.operatingRatePercent ?? null;

  const toggleRole = (role: string, enabled: boolean) => {
    setSelectedRoles((prev) => {
      const next = new Set(prev);
      if (enabled) {
        next.add(role);
      } else {
        next.delete(role);
      }
      return next;
    });
  };

  const persistStaffUpdate = (params: {
    roleFixedSalaryOverrides: StaffRoleFixedSalaryOverrideItem[];
    trimmedName: string;
    normalizedCccd: string;
    trimmedRevenueSharePercent: string;
  }) => {
    const {
      roleFixedSalaryOverrides,
      trimmedName,
      normalizedCccd,
      trimmedRevenueSharePercent,
    } = params;
    setOverrideRemovalWarnings([]);
    onClose();
    runBackgroundSave({
      loadingMessage: "Đang lưu thông tin nhân sự...",
      successMessage: "Đã lưu thông tin nhân sự.",
      errorMessage: "Không thể cập nhật thông tin nhân sự.",
      action: async () => {
        await staffApi.updateStaffWithFixedSalaryOverrides({
          id: staff.id,
          full_name: trimmedName || undefined,
          cccd_number: normalizedCccd || undefined,
          ethnicity: ethnicity.trim() || undefined,
          gender: gender || undefined,
          current_address: currentAddress.trim() || undefined,
          cccd_issued_date: cccdIssuedDateInput.trim() || undefined,
          cccd_issued_place: cccdIssuedPlace.trim() || undefined,
          birth_date: birthDateInput.trim() || undefined,
          university: university.trim() || undefined,
          high_school: highSchool.trim() || undefined,
          bank_account: bankAccount.trim() || undefined,
          bank_qr_link: bankQrLink.trim() || undefined,
          roles: Array.from(selectedRoles),
          roleFixedSalaryOverrides,
          customer_care_managed_by_staff_id: showManagedByField
            ? (managedByStaffId || null)
            : null,
          revenue_share_percent: showRevenueShareField
            ? (trimmedRevenueSharePercent ? Number(trimmedRevenueSharePercent) : null)
            : null,
        });
        const statusChanged = status !== staff.status;
        if (statusChanged) {
          await staffApi.updateStaffStatus(
            staff.id,
            status,
            statusReason.trim() || undefined,
          );
        }
      },
      onSuccess: async () => {
        const statusChanged = status !== staff.status;
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["staff", "detail", staff.id] }),
          queryClient.invalidateQueries({ queryKey: ["staff", "list"] }),
          queryClient.invalidateQueries({
            queryKey: ["fixed-salary-settings", "staff-overrides"],
          }),
          queryClient.invalidateQueries({ queryKey: ["staff", "income-summary", staff.id] }),
          ...(statusChanged
            ? [queryClient.invalidateQueries({ queryKey: ["class", "list"] })]
            : []),
        ]);
        await onSuccess?.();
      },
    });
  };

  const handleSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (overridesQuery.isLoading || overridesQuery.isError) {
      return;
    }
    const trimmedName = fullName.trim();
    const normalizedCccd = cccdNumber.trim();
    const isMarkingInactive = staff.status !== "inactive" && status === "inactive";
    if (
      isMarkingInactive &&
      !window.confirm(
        "Chuyển nhân sự sang Ngừng hoạt động? Nhân sự sẽ không thể truy cập workspace nhân sự hoặc nhận phân công mới, nhưng lịch sử vẫn được giữ.",
      )
    ) {
      return;
    }

    const trimmedRevenueSharePercent = revenueSharePercent.trim();
    if (showRevenueShareField && trimmedRevenueSharePercent) {
      const parsed = Number(trimmedRevenueSharePercent);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
        toast.error("Tỷ lệ % hoa hồng doanh thu phải là số từ 0 đến 100.");
        return;
      }
    }

    let roleFixedSalaryOverrides: StaffRoleFixedSalaryOverrideItem[];
    try {
      roleFixedSalaryOverrides = ROLE_OPTIONS.filter(
        (opt) =>
          selectedRoles.has(opt.value) && isFixedSalaryStaffRole(opt.value),
      ).map((opt) => ({
        roleType: opt.value as StaffRoleFixedSalaryOverrideItem["roleType"],
        amount: parseOptionalFixedSalaryAmountInput(amountValue(opt.value)),
        operatingRatePercent: parseOptionalFixedSalaryOperatingRateInput(
          rateValue(opt.value),
        ),
      }));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Mức đè lương cứng không hợp lệ.",
      );
      return;
    }

    const warnings = collectDisabledRoleOverrideWarnings({
      originalRoles: staff.roles ?? [],
      nextRoles: selectedRoles,
      roleRows: overrideStaff?.roles,
      roleLabels: ROLE_LABELS,
    });
    if (warnings.length > 0) {
      setOverrideRemovalWarnings(warnings);
      return;
    }

    persistStaffUpdate({
      roleFixedSalaryOverrides,
      trimmedName,
      normalizedCccd,
      trimmedRevenueSharePercent,
    });
  };

  const confirmOverrideRemoval = () => {
    const trimmedName = fullName.trim();
    const normalizedCccd = cccdNumber.trim();
    const trimmedRevenueSharePercent = revenueSharePercent.trim();
    let roleFixedSalaryOverrides: StaffRoleFixedSalaryOverrideItem[];
    try {
      roleFixedSalaryOverrides = ROLE_OPTIONS.filter(
        (opt) =>
          selectedRoles.has(opt.value) && isFixedSalaryStaffRole(opt.value),
      ).map((opt) => ({
        roleType: opt.value as StaffRoleFixedSalaryOverrideItem["roleType"],
        amount: parseOptionalFixedSalaryAmountInput(amountValue(opt.value)),
        operatingRatePercent: parseOptionalFixedSalaryOperatingRateInput(
          rateValue(opt.value),
        ),
      }));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Mức đè lương cứng không hợp lệ.",
      );
      return;
    }

    persistStaffUpdate({
      roleFixedSalaryOverrides,
      trimmedName,
      normalizedCccd,
      trimmedRevenueSharePercent,
    });
  };

  const cancelOverrideRemoval = () => {
    setSelectedRoles((prev) => {
      const next = new Set(prev);
      for (const warning of overrideRemovalWarnings) {
        next.add(warning.roleType);
      }
      return next;
    });
    setOverrideRemovalWarnings([]);
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-bg-primary/75" aria-hidden onClick={() => {
        if (overrideRemovalWarnings.length > 0) {
          return;
        }
        onClose();
      }} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-staff-title"
        className="fixed left-1/2 top-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 max-h-[90vh] overflow-hidden flex flex-col rounded-xl border border-border-default bg-bg-surface p-5 shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between shrink-0">
          <h2 id="edit-staff-title" className="text-lg font-semibold text-text-primary">
            Chỉnh sửa thông tin nhân sự
          </h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-text-muted transition-colors duration-200 hover:bg-bg-tertiary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
              aria-label="Đóng"
              disabled={overrideRemovalWarnings.length > 0}
            >
            <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto space-y-4 pr-1">
          <section className="rounded-lg border border-border-default bg-bg-secondary/50 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm text-text-secondary sm:col-span-2">
                <span>Họ và tên</span>
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  placeholder="Ví dụ: Nguyễn Văn A"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm text-text-secondary sm:col-span-2">
                <span>Trạng thái</span>
                <UpgradedSelect
                  name="staff-status"
                  value={status}
                  onValueChange={(nextValue) =>
                    setStatus(nextValue === "inactive" ? "inactive" : "active")
                  }
                  options={STATUS_OPTIONS.map((opt) => ({
                    value: opt.value,
                    label: opt.label,
                  }))}
                  buttonClassName="rounded-md border border-border-default bg-bg-surface px-3 py-2.5 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                />
                <p className="text-xs text-text-muted">
                  {STATUS_OPTIONS.find((o) => o.value === status)?.hint ?? ""}
                </p>
              </label>

              {status !== (staff.status ?? "active") ? (
                <label className="flex flex-col gap-1 text-sm text-text-secondary sm:col-span-2">
                  <span>Lý do đổi trạng thái (không bắt buộc)</span>
                  <textarea
                    name="status-reason"
                    rows={2}
                    value={statusReason}
                    onChange={(event) => setStatusReason(event.target.value)}
                    className="resize-none rounded-md border border-border-default bg-bg-surface px-3 py-2.5 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                    placeholder="Ví dụ: Nghỉ việc, chuyển công tác…"
                  />
                </label>
              ) : null}

              <label className="flex flex-col gap-1 text-sm text-text-secondary">
                <span>Số CCCD</span>
                <input
                  value={cccdNumber}
                  onChange={(e) => setCccdNumber(e.target.value)}
                  inputMode="numeric"
                  className="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  placeholder="012345678901"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm text-text-secondary">
                <span>Ngày cấp CCCD</span>
                <DateInput
                  value={cccdIssuedDateInput}
                  onChange={(e) => setCccdIssuedDateInput(e.target.value)}
                  className="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm text-text-secondary">
                <span>Dân tộc</span>
                <input
                  value={ethnicity}
                  onChange={(e) => setEthnicity(e.target.value)}
                  className="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  placeholder="Ví dụ: Kinh"
                />
              </label>

              <div className="flex flex-col gap-1 text-sm text-text-secondary">
                <span>Giới tính</span>
                <UpgradedSelect
                  name="staff-gender"
                  value={gender}
                  onValueChange={(nextValue) =>
                    setGender(
                      nextValue === "male" || nextValue === "female"
                        ? nextValue
                        : "",
                    )
                  }
                  placeholder="Chọn giới tính"
                  options={[
                    { value: "male", label: "Nam" },
                    { value: "female", label: "Nữ" },
                  ]}
                  buttonClassName="rounded-md border border-border-default bg-bg-surface px-3 py-2.5 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                />
              </div>

              <label className="flex flex-col gap-1 text-sm text-text-secondary sm:col-span-2">
                <span>Địa chỉ hiện tại</span>
                <textarea
                  value={currentAddress}
                  onChange={(e) => setCurrentAddress(e.target.value)}
                  rows={2}
                  className="resize-none rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  placeholder="Ví dụ: 123 Nguyễn Trãi, Quận 1, TP.HCM"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm text-text-secondary sm:col-span-2">
                <span>Nơi cấp CCCD</span>
                <input
                  value={cccdIssuedPlace}
                  onChange={(e) => setCccdIssuedPlace(e.target.value)}
                  className="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  placeholder="Ví dụ: Cục CSQLHC về TTXH"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm text-text-secondary">
                <span>Ngày sinh</span>
                <DateInput
                  value={birthDateInput}
                  onChange={(e) => setBirthDateInput(e.target.value)}
                  className="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm text-text-secondary">
                <span>Tỉnh / Thành phố</span>
                <input
                  value={staff.user?.province ?? ""}
                  readOnly
                  className="rounded-md border border-border-default bg-bg-tertiary px-3 py-2 text-text-muted cursor-not-allowed"
                  title="Chỉnh sửa qua tài khoản người dùng"
                />
                <p className="text-xs text-text-muted">Chỉnh sửa qua quản lý tài khoản.</p>
              </label>

              <label className="flex flex-col gap-1 text-sm text-text-secondary">
                <span>Trường đại học</span>
                <input
                  value={university}
                  onChange={(e) => setUniversity(e.target.value)}
                  className="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  placeholder="Ví dụ: ĐH Bách Khoa"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm text-text-secondary">
                <span>Trường THPT</span>
                <input
                  value={highSchool}
                  onChange={(e) => setHighSchool(e.target.value)}
                  className="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  placeholder="Ví dụ: THPT Lê Hồng Phong"
                />
              </label>

              <div className="sm:col-span-2">
                <AchievementListEditor
                  owner={{ kind: "staff", mode: "admin", staffId: staff.id }}
                  heading="Thành tích"
                />
              </div>

              <label className="flex flex-col gap-1 text-sm text-text-secondary">
                <span>Số tài khoản ngân hàng</span>
                <input
                  value={bankAccount}
                  onChange={(e) => setBankAccount(e.target.value)}
                  className="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  placeholder="Ví dụ: 1234567890"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm text-text-secondary">
                <span>Link QR thanh toán</span>
                <input
                  value={bankQrLink}
                  onChange={(e) => setBankQrLink(e.target.value)}
                  className="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  placeholder="https://..."
                />
              </label>

              <div className="sm:col-span-2">
                <p className="mb-1 text-sm font-medium text-text-secondary">Vai trò</p>
                <p className="mb-2 text-xs text-text-muted">
                  Giáo viên không có lương cứng (trợ cấp buổi học giữ nguyên). Vai trò
                  khác: để trống = mặc định vai trò; nhập 0 = cố ý loại / 0%.
                </p>
                {overridesQuery.isError ? (
                  <p className="mb-2 text-sm text-error">
                    Không tải được mức đè lương cứng. Đóng dialog rồi mở lại để thử lại.
                  </p>
                ) : null}
                <ul className="flex flex-col gap-2">
                  {ROLE_OPTIONS.map((opt) => {
                    const enabled = selectedRoles.has(opt.value);
                    const showSalaryFields =
                      enabled && isFixedSalaryStaffRole(opt.value);
                    return (
                      <li
                        key={opt.value}
                        className="rounded-lg border border-border-default bg-bg-surface px-3 py-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-medium text-text-primary">
                            {ROLE_LABELS[opt.value] ?? opt.label}
                          </span>
                          <Switch
                            checked={enabled}
                            onCheckedChange={(next) => toggleRole(opt.value, next)}
                            aria-label={opt.label}
                          />
                        </div>
                        {showSalaryFields ? (
                          <StaffRoleFixedSalaryFields
                            roleLabel={ROLE_LABELS[opt.value] ?? opt.label}
                            amountValue={amountValue(opt.value)}
                            rateValue={rateValue(opt.value)}
                            roleDefaultAmount={roleDefaultAmount(opt.value)}
                            roleDefaultRate={roleDefaultRate(opt.value)}
                            onAmountChange={(value) =>
                              setAmountDraft((prev) => ({
                                ...prev,
                                [opt.value]: value,
                              }))
                            }
                            onRateChange={(value) =>
                              setRateDraft((prev) => ({
                                ...prev,
                                [opt.value]: value,
                              }))
                            }
                          />
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>

              {showRevenueShareField && (
                <label className="flex flex-col gap-1 text-sm text-text-secondary sm:col-span-2">
                  <span>Tỷ lệ % hoa hồng doanh thu (Trưởng giáo án)</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    value={revenueSharePercent}
                    onChange={(e) => setRevenueSharePercent(e.target.value)}
                    className="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                    placeholder="VD: 3"
                  />
                  <p className="text-xs text-text-muted">
                    Nhân sự sẽ nhận % này trên tổng doanh thu hệ thống mỗi tháng.
                  </p>
                </label>
              )}

              {showManagedByField && (
                <label className="flex flex-col gap-1 text-sm text-text-secondary sm:col-span-2">
                  <span>Trợ lí quản lí (3% học phí)</span>
                  <select
                    value={managedByStaffId ?? ""}
                    onChange={(e) =>
                      setManagedByStaffId(e.target.value || null)
                    }
                    className="cursor-pointer rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  >
                    <option value="">Chưa phân công</option>
                    {assistantOptions.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.fullName}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-text-muted">
                    Trợ lí được chọn sẽ nhận 3% học phí đã học từ học sinh do CSKH này phụ trách.
                  </p>
                </label>
              )}
            </div>
          </section>

          <div className="flex items-center justify-end gap-2 border-t border-border-default pt-4 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={overrideRemovalWarnings.length > 0}
              className="rounded-md border border-border-default bg-bg-surface px-4 py-2 text-sm font-medium text-text-primary transition-colors duration-200 hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-60"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={
                overridesQuery.isLoading ||
                overridesQuery.isError ||
                overrideRemovalWarnings.length > 0
              }
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-text-inverse transition-colors duration-200 hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-60"
            >
              Lưu thông tin
            </button>
          </div>
        </form>
      </div>

      <ConfirmDialog
        open={overrideRemovalWarnings.length > 0}
        onOpenChange={(open) => {
          if (!open) cancelOverrideRemoval();
        }}
        title="Tắt vai trò sẽ xóa mức đè lương cứng"
        description={
          <>
            {overrideRemovalWarnings.map((warning) => (
              <p key={warning.roleType}>
                {formatDisabledRoleOverrideWarningLine(warning)}
              </p>
            ))}
            <p>{LOCKED_FIXED_SALARY_MONTH_NOTE}</p>
          </>
        }
        confirmLabel="Xóa mức đè và lưu"
        variant="destructive"
        onConfirm={confirmOverrideRemoval}
      />
    </>
  );
}
