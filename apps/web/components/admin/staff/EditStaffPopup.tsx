"use client";

import { useMemo, useState, type ReactNode, type SyntheticEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DateInput } from "@/components/ui/DateInput";
import { Switch } from "@/components/ui/switch";
import UpgradedSelect from "@/components/ui/UpgradedSelect";
import AchievementListEditor from "@/components/shared/achievement/AchievementListEditor";
import StaffRoleFixedSalaryFields from "@/components/admin/staff/StaffRoleFixedSalaryFields";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import PreviewableUserAvatar from "@/components/ui/PreviewableUserAvatar";
import {
  ResponsiveDialog,
  ResponsiveDialogBody,
} from "@/components/ui/ResponsiveDialog";
import type { StaffDetail, StaffGender } from "@/dtos/staff.dto";
import {
  isFixedSalaryStaffRole,
  type StaffRoleFixedSalaryOverrideItem,
} from "@/dtos/fixed-salary-settings.dto";
import * as staffApi from "@/lib/apis/staff.api";
import * as fixedSalarySettingsApi from "@/lib/apis/fixed-salary-settings.api";
import {
  collectDisabledRoleOverrideWarnings,
  fixedSalaryInputClassName,
  formatDisabledRoleOverrideWarningLine,
  LOCKED_FIXED_SALARY_MONTH_NOTE,
  parseOptionalFixedSalaryAmountInput,
  parseOptionalFixedSalaryOperatingRateInput,
  type DisabledRoleOverrideWarning,
} from "@/lib/fixed-salary-settings.helpers";
import { moneyInputInitialFromNumber } from "@/lib/money-input.helpers";
import { LESSON_PLAN_LABEL, ROLE_LABELS } from "@/lib/staff.constants";
import { runBackgroundSave } from "@/lib/mutation-feedback";

type Props = {
  open: boolean;
  onClose: () => void;
  staff: StaffDetail;
  /** Called after a successful update (after internal query invalidation). Use to invalidate page-level queries. */
  onSuccess?: () => void | Promise<void>;
  /** Avatar đã resolve ở trang chi tiết (signed URL) để hiển thị cột trái. */
  avatarUrl?: string | null;
  /** Chỉ admin đầy đủ: hiện nút xoá ảnh đại diện của user gắn với nhân sự. */
  canDeleteAvatar?: boolean;
};

/** Bố cục hàng nhãn–giá trị giống `/user-profile`: mobile xếp dọc, từ `sm` nhãn bên trái. */
const inputClassName =
  "w-full rounded-lg border border-border-default bg-bg-primary px-3 py-2.5 text-sm text-text-primary transition-colors placeholder:text-text-muted focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-border-focus/20";
const fieldRowClassName =
  "grid grid-cols-1 gap-x-6 gap-y-1.5 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(7.5rem,10rem)_minmax(0,1fr)] sm:items-start";
const labelClassName =
  "text-sm font-semibold text-text-primary sm:pt-2.5 sm:text-right";
const fieldListClassName = "min-w-0 divide-y divide-border-default/80";
const ghostButtonClassName =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-border-default bg-bg-surface px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:border-border-focus hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-60";
const primaryButtonClassName =
  "inline-flex min-h-10 items-center justify-center rounded-lg bg-primary px-5 py-2 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-60";

const STATUS_OPTIONS: { value: StaffDetail["status"]; label: string; hint: string }[] = [
  { value: "active", label: "Hoạt động", hint: "Nhân sự đang làm việc và hiển thị bình thường." },
  { value: "inactive", label: "Ngừng hoạt động", hint: "Ẩn khỏi luồng làm việc chính, không dùng cho phân công mới." },
];

const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "teacher", label: "Giáo viên" },
  { value: "assistant", label: "Trợ lí" },
  { value: "lesson_plan", label: LESSON_PLAN_LABEL },
  { value: "lesson_plan_head", label: "Trưởng giáo án" },
  { value: "accountant_income", label: "Kế toán thu" },
  { value: "accountant_expense", label: "Kế toán chi" },
  { value: "communication", label: "Truyền thông" },
  { value: "technical", label: "Kỹ thuật" },
  { value: "customer_care", label: "CSKH" },
  { value: "training", label: "Đào Tạo" },
  { value: "sale", label: "Sale" },
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

export default function EditStaffPopup({
  open,
  onClose,
  staff,
  onSuccess,
  avatarUrl,
  canDeleteAvatar = false,
}: Props) {
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
  const [customerCareDefaultPercent, setCustomerCareDefaultPercent] = useState(
    () => String(Math.round((staff.customerCareDefaultProfitPercent ?? 0) * 100)),
  );
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(
    () => new Set(staff.roles ?? []),
  );
  const [amountDraft, setAmountDraft] = useState<Record<string, string>>({});
  const [rateDraft, setRateDraft] = useState<Record<string, string>>({});
  const [overrideRemovalWarnings, setOverrideRemovalWarnings] = useState<
    DisabledRoleOverrideWarning[]
  >([]);
  const [inactiveConfirmOpen, setInactiveConfirmOpen] = useState(false);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [deleteAvatarConfirmOpen, setDeleteAvatarConfirmOpen] = useState(false);

  const deleteAvatarMutation = useMutation({
    mutationFn: () => staffApi.deleteStaffAvatar(staff.id),
    onSuccess: async (data) => {
      queryClient.setQueryData(["staff", "detail", staff.id], data);
      setDeleteAvatarConfirmOpen(false);
      toast.success("Đã xoá ảnh đại diện.");
      await onSuccess?.();
    },
    onError: () => toast.error("Không thể xoá ảnh đại diện."),
  });
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
          ...(hasCustomerCareRole
            ? {
                customer_care_default_profit_percent:
                  Number(customerCareDefaultPercent.trim() || 0) / 100,
              }
            : {}),
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


  const isDirty =
    fullName !== (staff.fullName ?? "") ||
    cccdNumber !== (staff.cccdNumber ?? "") ||
    ethnicity !== (staff.ethnicity ?? "") ||
    gender !== (staff.gender ?? "") ||
    currentAddress !== (staff.currentAddress ?? "") ||
    cccdIssuedDateInput !== formatDateInput(staff.cccdIssuedDate) ||
    cccdIssuedPlace !== (staff.cccdIssuedPlace ?? "") ||
    status !== (staff.status ?? "active") ||
    birthDateInput !== formatDateInput(staff.birthDate) ||
    university !== (staff.university ?? "") ||
    highSchool !== (staff.highSchool ?? "") ||
    bankAccount !== (staff.bankAccount ?? "") ||
    bankQrLink !== (staff.bankQrLink ?? "") ||
    revenueSharePercent !==
      (staff.revenueSharePercent != null ? String(staff.revenueSharePercent) : "") ||
    customerCareDefaultPercent !==
      String(Math.round((staff.customerCareDefaultProfitPercent ?? 0) * 100)) ||
    selectedRoles.size !== (staff.roles ?? []).length ||
    (staff.roles ?? []).some((role) => !selectedRoles.has(role)) ||
    Object.keys(amountDraft).length > 0 ||
    Object.keys(rateDraft).length > 0 ||
    managedByStaffId !==
      (staff.customerCareManagedByStaffId === staff.id
        ? null
        : (staff.customerCareManagedByStaffId ?? null));

  const requestClose = () => {
    if (overrideRemovalWarnings.length > 0 || inactiveConfirmOpen) return;
    if (isDirty) {
      setDiscardConfirmOpen(true);
      return;
    }
    onClose();
  };

  const buildRoleFixedSalaryOverrides = ():
    | StaffRoleFixedSalaryOverrideItem[]
    | null => {
    try {
      return ROLE_OPTIONS.filter(
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
      return null;
    }
  };

  const submit = ({ inactiveConfirmed }: { inactiveConfirmed: boolean }) => {
    if (overridesQuery.isLoading || overridesQuery.isError) {
      return;
    }
    const isMarkingInactive = staff.status !== "inactive" && status === "inactive";
    if (isMarkingInactive && !inactiveConfirmed) {
      setInactiveConfirmOpen(true);
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

    if (hasCustomerCareRole) {
      const parsed = Number(customerCareDefaultPercent.trim() || 0);
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 99) {
        toast.error("% mặc định CSKH phải là số nguyên từ 0 đến 99.");
        return;
      }
    }

    const roleFixedSalaryOverrides = buildRoleFixedSalaryOverrides();
    if (!roleFixedSalaryOverrides) return;

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
      trimmedName: fullName.trim(),
      normalizedCccd: cccdNumber.trim(),
      trimmedRevenueSharePercent,
    });
  };

  const handleSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    submit({ inactiveConfirmed: false });
  };

  const confirmOverrideRemoval = () => {
    const roleFixedSalaryOverrides = buildRoleFixedSalaryOverrides();
    if (!roleFixedSalaryOverrides) return;
    persistStaffUpdate({
      roleFixedSalaryOverrides,
      trimmedName: fullName.trim(),
      normalizedCccd: cccdNumber.trim(),
      trimmedRevenueSharePercent: revenueSharePercent.trim(),
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

  const displayName = fullName.trim() || staff.fullName?.trim() || "Nhân sự";
  const avatarFallback = (displayName || staff.user?.email || "?")
    .charAt(0)
    .toUpperCase();
  const saveBlocked =
    overridesQuery.isLoading ||
    overridesQuery.isError ||
    overrideRemovalWarnings.length > 0;

  return (
    <>
      <ResponsiveDialog
        size="5xl"
        labelledBy="edit-staff-title"
        onBackdropClick={requestClose}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border-subtle px-4 py-3 sm:px-5">
          <h2
            id="edit-staff-title"
            className="text-base font-semibold text-text-primary sm:text-lg"
          >
            Thông tin nhân sự
          </h2>
          <button
            type="button"
            onClick={requestClose}
            className="flex size-10 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-bg-tertiary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            aria-label="Đóng"
          >
            <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form
          id="edit-staff-form"
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col"
        >
          <ResponsiveDialogBody className="sm:p-6">
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(200px,240px)_minmax(0,1fr)] lg:gap-x-10">
              <aside className="flex flex-col items-center lg:sticky lg:top-0 lg:self-start">
                <PreviewableUserAvatar
                  src={avatarUrl ?? null}
                  fallback={avatarFallback}
                  alt={`Avatar của ${displayName}`}
                  displayName={displayName}
                  className="size-24 shrink-0 border border-border-default bg-bg-tertiary sm:size-28"
                  fallbackClassName="text-2xl font-semibold text-text-primary sm:text-3xl"
                />
                {canDeleteAvatar && avatarUrl ? (
                  <button
                    type="button"
                    onClick={() => setDeleteAvatarConfirmOpen(true)}
                    disabled={deleteAvatarMutation.isPending}
                    className="mt-3 inline-flex min-h-9 items-center justify-center rounded-lg border border-error/40 bg-bg-surface px-3 py-1.5 text-xs font-medium text-error transition-colors hover:bg-error/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {deleteAvatarMutation.isPending ? "Đang xoá…" : "Xoá ảnh đại diện"}
                  </button>
                ) : null}
                <p className="mt-4 text-center text-sm font-semibold text-text-primary">
                  {displayName}
                </p>
                {staff.user?.email ? (
                  <p className="mt-0.5 max-w-full truncate text-xs text-text-muted">
                    {staff.user.email}
                  </p>
                ) : null}
                <span
                  className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${status === "active" ? "bg-success/15 text-success" : "bg-error/15 text-error"}`}
                >
                  <span
                    className={`size-1.5 rounded-full ${status === "active" ? "bg-success" : "bg-error"}`}
                    aria-hidden
                  />
                  {STATUS_OPTIONS.find((o) => o.value === status)?.label}
                </span>
                <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                  {ROLE_OPTIONS.filter((opt) => selectedRoles.has(opt.value)).map(
                    (opt) => (
                      <span
                        key={opt.value}
                        className="inline-flex rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-medium text-primary"
                      >
                        {ROLE_LABELS[opt.value] ?? opt.label}
                      </span>
                    ),
                  )}
                </div>
                <p className="mt-4 text-center text-[11px] leading-relaxed text-text-muted">
                  {canDeleteAvatar
                    ? "Email, SĐT và tỉnh/thành do nhân sự tự cập nhật hoặc sửa qua quản lý tài khoản. Ảnh đại diện chỉ tải lên từ phía nhân sự."
                    : "Ảnh đại diện, email, SĐT và tỉnh/thành do nhân sự tự cập nhật hoặc sửa qua quản lý tài khoản."}
                </p>
              </aside>

              <div className="min-w-0 space-y-8 border-t border-border-default pt-8 lg:border-t-0 lg:pt-0">
                <StaffFormSection title="Thông tin chung" description="Tên hiển thị và trạng thái làm việc">
                  <div className={fieldListClassName}>
                    <StaffFieldRow id="staff-full-name" label="Họ và tên">
                      <input
                        id="staff-full-name"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className={inputClassName}
                        placeholder="Ví dụ: Nguyễn Văn A"
                      />
                    </StaffFieldRow>
                    <StaffFieldRow
                      id="staff-status"
                      label="Trạng thái"
                      hint={STATUS_OPTIONS.find((o) => o.value === status)?.hint}
                    >
                      <UpgradedSelect
                        id="staff-status"
                        name="staff-status"
                        value={status}
                        onValueChange={(nextValue) =>
                          setStatus(nextValue === "inactive" ? "inactive" : "active")
                        }
                        options={STATUS_OPTIONS.map((opt) => ({
                          value: opt.value,
                          label: opt.label,
                        }))}
                        buttonClassName={inputClassName}
                      />
                    </StaffFieldRow>
                    {status !== (staff.status ?? "active") ? (
                      <StaffFieldRow id="staff-status-reason" label="Lý do đổi trạng thái">
                        <textarea
                          id="staff-status-reason"
                          name="status-reason"
                          rows={2}
                          value={statusReason}
                          onChange={(event) => setStatusReason(event.target.value)}
                          className={`${inputClassName} resize-none`}
                          placeholder="Không bắt buộc. Ví dụ: Nghỉ việc, chuyển công tác…"
                        />
                      </StaffFieldRow>
                    ) : null}
                    <StaffReadOnlyRow label="Số điện thoại" value={staff.user?.phone || "—"} />
                    <StaffReadOnlyRow label="Tỉnh / Thành phố" value={staff.user?.province || "—"} />
                  </div>
                </StaffFormSection>

                <hr className="border-border-default" />

                <StaffFormSection title="Định danh" description="CCCD, ngày sinh và địa chỉ">
                  <div className={fieldListClassName}>
                    <StaffFieldRow id="staff-cccd" label="Số CCCD">
                      <input
                        id="staff-cccd"
                        value={cccdNumber}
                        onChange={(e) => setCccdNumber(e.target.value)}
                        inputMode="numeric"
                        className={inputClassName}
                        placeholder="012345678901"
                      />
                    </StaffFieldRow>
                    <StaffFieldRow id="staff-cccd-issued-date" label="Ngày cấp CCCD">
                      <DateInput
                        id="staff-cccd-issued-date"
                        value={cccdIssuedDateInput}
                        onChange={(e) => setCccdIssuedDateInput(e.target.value)}
                        className={inputClassName}
                      />
                    </StaffFieldRow>
                    <StaffFieldRow id="staff-cccd-issued-place" label="Nơi cấp CCCD">
                      <input
                        id="staff-cccd-issued-place"
                        value={cccdIssuedPlace}
                        onChange={(e) => setCccdIssuedPlace(e.target.value)}
                        className={inputClassName}
                        placeholder="Ví dụ: Cục CSQLHC về TTXH"
                      />
                    </StaffFieldRow>
                    <StaffFieldRow id="staff-birth-date" label="Ngày sinh">
                      <DateInput
                        id="staff-birth-date"
                        value={birthDateInput}
                        onChange={(e) => setBirthDateInput(e.target.value)}
                        className={inputClassName}
                      />
                    </StaffFieldRow>
                    <StaffFieldRow id="staff-gender" label="Giới tính">
                      <UpgradedSelect
                        id="staff-gender"
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
                        buttonClassName={inputClassName}
                      />
                    </StaffFieldRow>
                    <StaffFieldRow id="staff-ethnicity" label="Dân tộc">
                      <input
                        id="staff-ethnicity"
                        value={ethnicity}
                        onChange={(e) => setEthnicity(e.target.value)}
                        className={inputClassName}
                        placeholder="Ví dụ: Kinh"
                      />
                    </StaffFieldRow>
                    <StaffFieldRow id="staff-current-address" label="Địa chỉ hiện tại">
                      <textarea
                        id="staff-current-address"
                        value={currentAddress}
                        onChange={(e) => setCurrentAddress(e.target.value)}
                        rows={2}
                        className={`${inputClassName} resize-y`}
                        placeholder="Ví dụ: 123 Nguyễn Trãi, Quận 1, TP.HCM"
                      />
                    </StaffFieldRow>
                  </div>
                </StaffFormSection>

                <hr className="border-border-default" />

                <StaffFormSection title="Học vấn & thanh toán" description="Trường học, thành tích và tài khoản nhận lương">
                  <div className={fieldListClassName}>
                    <StaffFieldRow id="staff-university" label="Trường đại học">
                      <input
                        id="staff-university"
                        value={university}
                        onChange={(e) => setUniversity(e.target.value)}
                        className={inputClassName}
                        placeholder="Ví dụ: ĐH Bách Khoa"
                      />
                    </StaffFieldRow>
                    <StaffFieldRow id="staff-high-school" label="Trường THPT">
                      <input
                        id="staff-high-school"
                        value={highSchool}
                        onChange={(e) => setHighSchool(e.target.value)}
                        className={inputClassName}
                        placeholder="Ví dụ: THPT Lê Hồng Phong"
                      />
                    </StaffFieldRow>
                    <StaffFieldRow id="staff-bank-account" label="Số tài khoản">
                      <input
                        id="staff-bank-account"
                        value={bankAccount}
                        onChange={(e) => setBankAccount(e.target.value)}
                        className={inputClassName}
                        placeholder="Ví dụ: 1234567890"
                      />
                    </StaffFieldRow>
                    <StaffFieldRow id="staff-bank-qr-link" label="Link QR thanh toán">
                      <input
                        id="staff-bank-qr-link"
                        value={bankQrLink}
                        onChange={(e) => setBankQrLink(e.target.value)}
                        className={inputClassName}
                        placeholder="https://..."
                      />
                    </StaffFieldRow>
                  </div>
                  <div className="mt-6 border-t border-border-default pt-6">
                    <AchievementListEditor
                      owner={{ kind: "staff", mode: "admin", staffId: staff.id }}
                      heading="Thành tích"
                    />
                  </div>
                </StaffFormSection>

                <hr className="border-border-default" />

                <StaffFormSection
                  title="Vai trò & lương cứng"
                  description="Giáo viên không có lương cứng (trợ cấp buổi học giữ nguyên). Vai trò khác: để trống = mặc định vai trò; nhập 0 = cố ý loại / 0%."
                >
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
                          {enabled && opt.value === "customer_care" ? (
                            <label className="mt-2 flex flex-col gap-1 text-sm text-text-secondary">
                              <span>% mặc định CSKH</span>
                              <input
                                type="number"
                                inputMode="numeric"
                                min={0}
                                max={99}
                                step={1}
                                value={customerCareDefaultPercent}
                                onChange={(e) =>
                                  setCustomerCareDefaultPercent(e.target.value)
                                }
                                className={fixedSalaryInputClassName}
                                placeholder="VD: 10"
                                aria-label="% mặc định CSKH"
                              />
                              <span className="text-xs leading-snug text-text-muted">
                                Áp vào học sinh khi gán CSKH này. Học sinh đã gán và
                                buổi đã tính không đổi.
                              </span>
                            </label>
                          ) : null}
                          {enabled &&
                          opt.value === "customer_care" &&
                          showManagedByField ? (
                            <label className="mt-2 flex flex-col gap-1 text-sm text-text-secondary">
                              <span>Trợ lí quản lí (3% học phí)</span>
                              <UpgradedSelect
                                name="staff-customer-care-managed-by"
                                value={managedByStaffId ?? ""}
                                onValueChange={(nextValue) =>
                                  setManagedByStaffId(nextValue || null)
                                }
                                options={[
                                  { value: "", label: "Chưa phân công" },
                                  ...assistantOptions.map((assistant) => ({
                                    value: assistant.id,
                                    label: assistant.fullName,
                                  })),
                                ]}
                                ariaLabel="Trợ lí quản lí CSKH"
                                buttonClassName="rounded-md border border-border-default bg-bg-surface px-3 py-2.5 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                              />
                              <span className="text-xs leading-snug text-text-muted">
                                Trợ lí được chọn sẽ nhận 3% học phí đã học từ học sinh
                                do CSKH này phụ trách.
                              </span>
                            </label>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>

                  {showRevenueShareField ? (
                    <div className={`${fieldListClassName} mt-4`}>
                      <StaffFieldRow
                        id="staff-revenue-share"
                        label="% hoa hồng doanh thu"
                        hint="Trưởng giáo án nhận % này trên tổng doanh thu hệ thống mỗi tháng."
                      >
                        <input
                          id="staff-revenue-share"
                          type="number"
                          min={0}
                          max={100}
                          step={0.01}
                          value={revenueSharePercent}
                          onChange={(e) => setRevenueSharePercent(e.target.value)}
                          className={inputClassName}
                          placeholder="VD: 3"
                        />
                      </StaffFieldRow>
                    </div>
                  ) : null}
                </StaffFormSection>
              </div>
            </div>
          </ResponsiveDialogBody>

          <div className="flex shrink-0 flex-col gap-3 border-t border-border-subtle bg-bg-surface p-4 sm:flex-row sm:items-center sm:justify-end sm:px-5">
            <p
              className="text-sm text-text-muted sm:mr-auto"
              role="status"
              aria-live="polite"
            >
              {isDirty ? "Có thay đổi chưa lưu" : ""}
            </p>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <button
                type="button"
                onClick={requestClose}
                disabled={overrideRemovalWarnings.length > 0}
                className={ghostButtonClassName}
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={saveBlocked}
                className={primaryButtonClassName}
              >
                Lưu thông tin
              </button>
            </div>
          </div>
        </form>
      </ResponsiveDialog>

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

      <ConfirmDialog
        open={inactiveConfirmOpen}
        onOpenChange={setInactiveConfirmOpen}
        title="Chuyển nhân sự sang Ngừng hoạt động?"
        description="Nhân sự sẽ không thể truy cập workspace nhân sự hoặc nhận phân công mới, nhưng lịch sử vẫn được giữ."
        confirmLabel="Ngừng hoạt động"
        variant="destructive"
        onConfirm={() => {
          setInactiveConfirmOpen(false);
          submit({ inactiveConfirmed: true });
        }}
      />

      <ConfirmDialog
        open={deleteAvatarConfirmOpen}
        onOpenChange={(open) => {
          if (!deleteAvatarMutation.isPending) setDeleteAvatarConfirmOpen(open);
        }}
        title="Xoá ảnh đại diện?"
        description={`Ảnh đại diện của ${displayName} sẽ bị xoá vĩnh viễn khỏi kho lưu trữ (cả bản gốc và bản watermark). Nhân sự có thể tải ảnh mới sau.`}
        confirmLabel="Xoá ảnh"
        variant="destructive"
        confirmPending={deleteAvatarMutation.isPending}
        onConfirm={() => deleteAvatarMutation.mutate()}
      />

      <ConfirmDialog
        open={discardConfirmOpen}
        onOpenChange={setDiscardConfirmOpen}
        title="Bỏ thay đổi chưa lưu?"
        description="Các chỉnh sửa thông tin nhân sự trong bảng này sẽ bị mất."
        confirmLabel="Bỏ thay đổi"
        cancelLabel="Tiếp tục sửa"
        variant="destructive"
        onConfirm={() => {
          setDiscardConfirmOpen(false);
          onClose();
        }}
      />
    </>
  );
}

function StaffFormSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="border-b border-border-default pb-3">
        <h3 className="text-base font-semibold text-text-primary">{title}</h3>
        <p className="mt-0.5 text-xs leading-relaxed text-text-muted">{description}</p>
      </div>
      <div className="pt-4">{children}</div>
    </section>
  );
}

function StaffFieldRow({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={fieldRowClassName}>
      <label htmlFor={id} className={labelClassName}>
        {label}
      </label>
      <div className="min-w-0">
        {children}
        {hint ? (
          <p className="mt-1 text-xs leading-relaxed text-text-muted">{hint}</p>
        ) : null}
      </div>
    </div>
  );
}

function StaffReadOnlyRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className={`${fieldRowClassName} sm:items-center`}>
      <span className={`${labelClassName} sm:pt-0`}>{label}</span>
      <span className="min-w-0 text-sm leading-relaxed text-text-primary">{value}</span>
    </div>
  );
}
