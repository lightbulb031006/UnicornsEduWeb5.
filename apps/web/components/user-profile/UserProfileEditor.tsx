"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import UpgradedSelect, {
  type UpgradedSelectOption,
} from "@/components/ui/UpgradedSelect";
import { DateInput } from "@/components/ui/DateInput";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import EmailVerificationInline from "@/components/user-profile/EmailVerificationInline";
import PreviewableUserAvatar from "@/components/ui/PreviewableUserAvatar";
import DataConsentSection, {
  EMPTY_DATA_CONSENT_TICKS,
  type DataConsentTicks,
} from "@/components/user-profile/DataConsentSection";
import { StudentExamCard } from "@/components/admin/student";
import AchievementListEditor from "@/components/shared/achievement/AchievementListEditor";
import ParentReceiptEmailSwitch from "@/components/student/ParentReceiptEmailSwitch";
import { useRefreshAuthSession } from "@/hooks/use-refresh-auth-session";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { resolveEmailVerified } from "@/mocks/user-profile-verification.mock";
import * as authApi from "@/lib/apis/auth.api";
import { openEmailVerificationModal } from "@/lib/email-verification-access";
import {
  AUTH_FULL_PROFILE_QUERY_KEY,
  PROFILE_FULL_QUERY_KEY,
} from "@/lib/profile-full-query";
import type { FullProfileDto } from "@/dtos/profile.dto";
import {
  ACHIEVEMENTS_FIELD_KEY,
  AVATAR_FIELD_KEY,
  DATA_CONSENT_FIELD_KEY,
  buildProfilePatches,
  getProfileFieldDomId,
  getProfileFormFields,
  getProfileFormValues,
  isProfileFormDirty,
  rebaseProfileFormValues,
  validateProfileForm,
  type ProfileFormGroup,
} from "@/lib/profile-form";
import {
  getProfileCompletion,
  getProfileDisplayName,
} from "@/lib/user-profile-completion";

/** Mọi lần lưu hồ sơ chạy nối tiếp để response cuối luôn chứa mọi thay đổi trước đó. */
const PROFILE_SAVE_SCOPE = { id: "profile-self-save" };

const GENDER_OPTIONS: UpgradedSelectOption[] = [
  { value: "male", label: "Nam" },
  { value: "female", label: "Nữ" },
];

type SaveStepGroup = ProfileFormGroup | "consent";

const GROUP_LABELS: Record<SaveStepGroup, string> = {
  account: "Thông tin chung",
  staff: "Nhân sự",
  student: "Học viên",
  consent: "Điều khoản dữ liệu",
};

const inputClassName =
  "w-full rounded-lg border border-border-default bg-bg-primary px-3 py-2.5 text-sm text-text-primary transition-colors placeholder:text-text-muted focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-border-focus/20";
const inputErrorClassName =
  "border-error focus:border-error focus:ring-error/20";
/** Nhãn phải, giá trị trái từ `sm`; mobile xếp dọc. */
const fieldRowClassName =
  "grid grid-cols-1 gap-x-8 gap-y-1.5 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(7.5rem,11rem)_minmax(0,1fr)] sm:items-start";
const fieldRowStackedClassName =
  "grid grid-cols-1 gap-y-1.5 py-3 first:pt-0 last:pb-0";
const labelClassName =
  "text-sm font-semibold text-text-primary sm:pt-2.5 sm:text-right";
const labelStackedClassName = "text-sm font-semibold text-text-primary";
const fieldListClassName = "min-w-0 divide-y divide-border-default/80";
const ghostButtonClassName =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-border-default bg-bg-surface px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:border-border-focus hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-60";
const primaryButtonClassName =
  "inline-flex min-h-10 items-center justify-center rounded-lg bg-primary px-5 py-2 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-60";
const secondaryPillClassName =
  "inline-flex w-full items-center justify-center rounded-full bg-bg-secondary px-4 py-2.5 text-center text-sm font-medium text-text-primary transition-colors hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus";

export function humanizeToken(value: string | null | undefined): string {
  if (!value) return "—";
  return value
    .split(/[_-\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function getRoleLabel(role: string | null | undefined): string {
  const roleMap: Record<string, string> = {
    admin: "Quản trị viên",
    staff: "Nhân sự",
    student: "Học viên",
    guest: "Khách",
  };
  return role ? (roleMap[role] ?? humanizeToken(role)) : "Chưa xác định";
}

function getInitials(profile: FullProfileDto): string {
  const source = getProfileDisplayName(profile)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (!source.length) return "UE";
  return source.map((part) => part.charAt(0).toUpperCase()).join("");
}

function getErrorMessage(err: unknown): string | undefined {
  return (err as { response?: { data?: { message?: string } } })?.response?.data
    ?.message;
}

/** Cuộn tới ô và focus nếu focus được (ô điều khoản là section, chỉ cuộn). */
function focusProfileField(key: string | undefined) {
  if (!key) return;
  const element = document.getElementById(getProfileFieldDomId(key));
  if (!element) return;
  element.scrollIntoView({ block: "center", behavior: "smooth" });
  if (element.matches("input, textarea, button")) {
    element.focus({ preventScroll: true });
  }
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 text-xs font-medium text-error">
      {message}
    </p>
  );
}

type FormFieldProps = {
  fieldKey: string;
  label: string;
  required: boolean;
  error?: string;
  value: string;
  onChange: (value: string) => void;
};

function FieldRow({
  id,
  labelId,
  label,
  required,
  error,
  stacked,
  hint,
  children,
}: {
  id?: string;
  labelId?: string;
  label: string;
  required?: boolean;
  error?: string;
  stacked?: boolean;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={stacked ? fieldRowStackedClassName : fieldRowClassName}>
      <label
        id={labelId}
        htmlFor={id}
        className={stacked ? labelStackedClassName : labelClassName}
      >
        {label}
        {required ? (
          <>
            <span aria-hidden className="ml-0.5 text-error">
              *
            </span>
            <span className="sr-only"> (bắt buộc)</span>
          </>
        ) : null}
      </label>
      <div className="min-w-0">
        {children}
        <FieldError id={`${id}-error`} message={error} />
        {hint ? (
          <div className="mt-1 text-xs leading-relaxed text-text-secondary">
            {hint}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ReadOnlyRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className={`${fieldRowClassName} sm:items-center`}>
      <span className={`${labelClassName} sm:pt-0`}>{label}</span>
      <span className="min-w-0 text-sm leading-relaxed text-text-primary">
        {value}
      </span>
    </div>
  );
}

function TextField({
  fieldKey,
  label,
  required,
  error,
  value,
  onChange,
  type = "text",
  multiline,
  placeholder,
  autoComplete,
  inputMode,
  min,
  max,
  stacked,
  hint,
}: FormFieldProps & {
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  multiline?: boolean;
  placeholder?: string;
  autoComplete?: string;
  min?: number;
  max?: number;
  stacked?: boolean;
  hint?: ReactNode;
}) {
  const id = getProfileFieldDomId(fieldKey);
  const inputProps = {
    id,
    value,
    placeholder,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? `${id}-error` : undefined,
    className: `${inputClassName} ${error ? inputErrorClassName : ""}`,
  };
  return (
    <FieldRow
      id={id}
      label={label}
      required={required}
      error={error}
      stacked={stacked}
      hint={hint}
    >
      {multiline ? (
        <textarea
          {...inputProps}
          rows={3}
          className={`${inputProps.className} min-h-24 resize-y leading-relaxed`}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : type === "date" ? (
        <DateInput
          {...inputProps}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          {...inputProps}
          type={type}
          min={min}
          max={max}
          autoComplete={autoComplete}
          inputMode={inputMode}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </FieldRow>
  );
}

function SelectField({
  fieldKey,
  label,
  required,
  error,
  value,
  onChange,
  options,
}: FormFieldProps & { options: UpgradedSelectOption[] }) {
  const id = getProfileFieldDomId(fieldKey);
  const labelId = `${id}-label`;
  return (
    <FieldRow
      id={id}
      labelId={labelId}
      label={label}
      required={required}
      error={error}
    >
      <UpgradedSelect
        id={id}
        value={value}
        onValueChange={onChange}
        options={options}
        placeholder={`Chọn ${label.toLowerCase()}`}
        labelId={labelId}
        buttonClassName={`${inputClassName} ${error ? inputErrorClassName : ""}`}
      />
    </FieldRow>
  );
}

function ProfileSection({
  id,
  title,
  description,
  error,
  children,
}: {
  id: string;
  title: string;
  description: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="motion-fade-up scroll-mt-28">
      <div className="border-b border-border-default pb-3">
        <h2 className="text-base font-semibold text-text-primary sm:text-lg">
          {title}
        </h2>
        <p className="mt-0.5 text-xs text-text-muted">{description}</p>
        <FieldError id={`${id}-error`} message={error} />
      </div>
      <div className="pt-4">{children}</div>
    </section>
  );
}

function ProfileSaveBar({
  dirty,
  saving,
  onSave,
  onReset,
}: {
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 border-t border-border-default pt-6 sm:flex-row sm:items-center sm:justify-end">
      <p
        className="text-sm text-text-muted sm:mr-auto"
        role="status"
        aria-live="polite"
      >
        {dirty ? "Có thay đổi chưa lưu" : ""}
      </p>
      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onReset}
          disabled={!dirty || saving}
          className={ghostButtonClassName}
        >
          Huỷ thay đổi
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={!dirty || saving}
          className={primaryButtonClassName}
        >
          {saving ? "Đang lưu…" : "Lưu"}
        </button>
      </div>
    </div>
  );
}

/**
 * Hồ sơ của chính người dùng: sửa các ô rồi bấm một nút "Lưu" chung ở cuối form.
 * Tick điều khoản dữ liệu cũng ghi nhận qua nút "Lưu" này. Avatar (tải lên khi chọn
 * ảnh), thành tích và switch biên lai vẫn lưu riêng. Cột trái: avatar, tên, mật khẩu. Cột phải: thông tin chung rồi khối
 * Nhân sự / Học viên. Mobile xếp dọc.
 */
export default function UserProfileEditor({
  profile,
  validateOnMount = false,
  onSaveComplete,
}: {
  profile: FullProfileDto;
  /** Hiện lỗi trường bắt buộc ngay khi mở (người dùng bị gate chuyển về trang hồ sơ). */
  validateOnMount?: boolean;
  /** Gọi sau khi lưu thành công và hồ sơ không còn trường bắt buộc nào thiếu. */
  onSaveComplete?: () => void;
}) {
  const queryClient = useQueryClient();
  const refreshAuthSession = useRefreshAuthSession();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();

  const savedValues = useMemo(() => getProfileFormValues(profile), [profile]);
  const [values, setValues] = useState(savedValues);
  const [baseline, setBaseline] = useState(savedValues);
  if (baseline !== savedValues) {
    setBaseline(savedValues);
    setValues(rebaseProfileFormValues(values, baseline, savedValues));
  }
  const [showErrors, setShowErrors] = useState(validateOnMount);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [consentTicks, setConsentTicks] = useState<DataConsentTicks>(
    EMPTY_DATA_CONSENT_TICKS,
  );

  const fieldDefs = useMemo(
    () =>
      Object.fromEntries(
        getProfileFormFields(profile).map((field) => [field.key, field]),
      ),
    [profile],
  );
  const validation = useMemo(
    () => validateProfileForm(profile, values),
    [profile, values],
  );
  const isStaff = Boolean(profile.staffInfo);
  const consentPending =
    isStaff &&
    !(
      profile.dataConsentAcceptedAt && profile.requiresStaffDataConsent !== true
    );
  const consentTicked =
    consentPending && (consentTicks.readTerms || consentTicks.accuracy);
  const consentReady =
    consentPending && consentTicks.readTerms && consentTicks.accuracy;
  const dirty = isProfileFormDirty(savedValues, values) || consentTicked;

  useUnsavedChangesGuard(dirty, confirm);

  const focusedOnMountRef = useRef(false);
  useEffect(() => {
    if (!validateOnMount || focusedOnMountRef.current) return;
    focusedOnMountRef.current = true;
    focusProfileField(validation.orderedKeys[0]);
  }, [validateOnMount, validation.orderedKeys]);

  const errorFor = (key: string) =>
    serverErrors[key] ??
    (showErrors ? validation.errors[key]?.message : undefined);

  const setFieldValue = (key: string, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    if (serverErrors[key]) {
      setServerErrors((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    }
  };

  const field = (key: string): FormFieldProps => ({
    fieldKey: key,
    label: fieldDefs[key]?.label ?? key,
    required: isStaff && Boolean(fieldDefs[key]?.requiredForStaff),
    error: errorFor(key),
    value: values[key] ?? "",
    onChange: (value) => setFieldValue(key, value),
  });

  const syncFullProfile = (data: FullProfileDto) => {
    queryClient.setQueryData(PROFILE_FULL_QUERY_KEY, data);
    queryClient.setQueryData(AUTH_FULL_PROFILE_QUERY_KEY, data);

    void queryClient.invalidateQueries({
      queryKey: ["staff", "self", "detail"],
    });
    if (data.staffInfo?.id) {
      void queryClient.invalidateQueries({
        queryKey: ["staff", "detail", data.staffInfo.id],
      });
    }
  };

  /** Lưu có thể đổi trạng thái gate hồ sơ nên làm mới cả session. */
  const syncProfileAndSession = async (data: FullProfileDto) => {
    syncFullProfile(data);
    await refreshAuthSession();
  };

  const updateProfileMutation = useMutation({
    mutationFn: authApi.updateMyProfile,
    scope: PROFILE_SAVE_SCOPE,
    onSuccess: syncProfileAndSession,
  });

  const updateStaffMutation = useMutation({
    mutationFn: authApi.updateMyStaffProfile,
    scope: PROFILE_SAVE_SCOPE,
    onSuccess: syncProfileAndSession,
  });

  const updateStudentMutation = useMutation({
    mutationFn: authApi.updateMyStudentProfile,
    scope: PROFILE_SAVE_SCOPE,
    onSuccess: (data) => {
      syncFullProfile(data);
      void queryClient.invalidateQueries({
        queryKey: ["student", "self", "detail"],
      });
    },
  });

  const acceptConsentMutation = useMutation({
    mutationFn: authApi.acceptDataConsent,
    scope: PROFILE_SAVE_SCOPE,
    onSuccess: async (payload) => {
      const latest =
        queryClient.getQueryData<FullProfileDto>(PROFILE_FULL_QUERY_KEY) ??
        profile;
      setConsentTicks(EMPTY_DATA_CONSENT_TICKS);
      await syncProfileAndSession({
        ...latest,
        dataConsentAcceptedAt: payload.dataConsentAcceptedAt,
        dataConsentVersion: payload.dataConsentVersion,
        requiresStaffDataConsent: false,
      });
    },
  });

  const uploadAvatarMutation = useMutation({
    mutationFn: authApi.uploadMyAvatar,
    scope: PROFILE_SAVE_SCOPE,
    onSuccess: async (data) => {
      syncFullProfile(data);
      await refreshAuthSession();
      toast.success("Đã cập nhật avatar.");
    },
    onError: (err: unknown) => {
      toast.error(getErrorMessage(err) ?? "Tải avatar thất bại.");
    },
  });

  const deleteAvatarMutation = useMutation({
    mutationFn: authApi.deleteMyAvatar,
    scope: PROFILE_SAVE_SCOPE,
    onSuccess: async (data) => {
      syncFullProfile(data);
      await refreshAuthSession();
      toast.success("Đã xoá avatar.");
    },
    onError: (err: unknown) => {
      toast.error(getErrorMessage(err) ?? "Không thể xoá avatar.");
    },
  });

  const requestVerifyEmailMutation = useMutation({
    mutationFn: () => authApi.resendVerificationEmail(),
    onSuccess: (data) => {
      openEmailVerificationModal({ kind: "sent", email: data.email });
    },
    onError: (err: unknown) => {
      toast.error(
        getErrorMessage(err) ?? "Không gửi được yêu cầu xác minh. Thử lại sau.",
      );
    },
  });

  const receiptEmailMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      authApi.updateMyStudentProfile({ parent_receipt_email_enabled: enabled }),
    scope: PROFILE_SAVE_SCOPE,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: PROFILE_FULL_QUERY_KEY }),
        queryClient.invalidateQueries({
          queryKey: ["student", "self", "detail"],
        }),
      ]);
      toast.success("Đã cập nhật cài đặt gửi biên lai.");
    },
    onError: () => {
      toast.error("Không thể cập nhật cài đặt gửi biên lai.");
    },
  });

  const handleAvatarFileChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) uploadAvatarMutation.mutate(file);
  };

  const handleReset = () => {
    setValues(savedValues);
    setServerErrors({});
    setConsentTicks(EMPTY_DATA_CONSENT_TICKS);
  };

  const handleSave = async () => {
    setShowErrors(true);
    if (validation.hasBlockingError) {
      focusProfileField(
        validation.orderedKeys.find(
          (key) => validation.errors[key]?.kind === "invalid",
        ),
      );
      toast.error("Kiểm tra lại các ô đang báo lỗi trước khi lưu.");
      return;
    }
    if (consentTicked && !consentReady) {
      focusProfileField(DATA_CONSENT_FIELD_KEY);
      toast.error("Tick đủ 2 xác nhận điều khoản dữ liệu trước khi lưu.");
      return;
    }

    const patches = buildProfilePatches(profile, savedValues, values);
    const steps: Array<[SaveStepGroup, () => Promise<unknown>]> = [];
    if (patches.account) {
      const patch = patches.account;
      steps.push(["account", () => updateProfileMutation.mutateAsync(patch)]);
    }
    if (patches.staff) {
      const patch = patches.staff;
      steps.push(["staff", () => updateStaffMutation.mutateAsync(patch)]);
    }
    if (patches.student) {
      const patch = patches.student;
      steps.push(["student", () => updateStudentMutation.mutateAsync(patch)]);
    }
    // Ghi nhận điều khoản sau cùng: chỉ đồng ý khi mọi thay đổi hồ sơ đã lưu được.
    if (consentReady) {
      steps.push(["consent", () => acceptConsentMutation.mutateAsync()]);
    }

    setSaving(true);
    const failures: string[] = [];
    const nextServerErrors: Record<string, string> = {};
    for (const [group, run] of steps) {
      if (group === "consent" && failures.length) break;
      try {
        await run();
      } catch (err) {
        const message = getErrorMessage(err);
        failures.push(
          `Không lưu được mục ${GROUP_LABELS[group]}${message ? `: ${message}` : "."}`,
        );
        // API gộp lỗi trùng email/handle thành một message: gắn vào ô vừa đổi.
        if (group === "account" && message && /tồn tại|exists/i.test(message)) {
          if (patches.account?.email !== undefined) {
            nextServerErrors["account.email"] = message;
          }
          if (patches.account?.accountHandle !== undefined) {
            nextServerErrors["account.accountHandle"] = message;
          }
        }
      }
    }
    setSaving(false);
    setServerErrors(nextServerErrors);

    if (failures.length) {
      failures.forEach((message) => toast.error(message));
      focusProfileField(Object.keys(nextServerErrors)[0]);
      return;
    }
    const remainingKeys = consentReady
      ? validation.orderedKeys.filter((key) => key !== DATA_CONSENT_FIELD_KEY)
      : validation.orderedKeys;
    const remainingMissing = remainingKeys.filter(
      (key) => validation.errors[key]?.kind === "missing",
    ).length;
    if (remainingMissing > 0) {
      toast.warning(
        `Đã lưu. Còn ${remainingMissing} trường bắt buộc chưa điền.`,
      );
      focusProfileField(remainingKeys[0]);
      return;
    }
    toast.success("Đã lưu hồ sơ.");
    onSaveComplete?.();
  };

  const completion = getProfileCompletion(profile);
  const displayName = getProfileDisplayName(profile);
  const storedAvatarPath =
    (profile as FullProfileDto & { avatarPath?: string | null }).avatarPath ??
    null;
  const hasStoredAvatar = Boolean(storedAvatarPath || profile.avatarUrl);
  const avatarBusy =
    uploadAvatarMutation.isPending || deleteAvatarMutation.isPending;
  const avatarError = errorFor(AVATAR_FIELD_KEY);

  const emailVerifiedDisplay = resolveEmailVerified(profile.emailVerified);
  const accountEmailNorm = profile.email?.trim().toLowerCase() ?? "";
  const studentEmailRaw = profile.studentInfo?.email?.trim() ?? "";
  const studentEmailMatchesAccount =
    Boolean(studentEmailRaw) &&
    studentEmailRaw.toLowerCase() === accountEmailNorm;
  const studentEmailNotApplicableMessage =
    studentEmailRaw && !studentEmailMatchesAccount
      ? "Đây là email liên hệ trên hồ sơ học viên; trạng thái xác minh chỉ áp dụng cho email đăng nhập ở mục Thông tin chung."
      : undefined;
  const studentEmailVerifiedDisplay = studentEmailMatchesAccount
    ? resolveEmailVerified(profile.emailVerified)
    : false;

  const saveBar = (
    <ProfileSaveBar
      dirty={dirty}
      saving={saving}
      onSave={() => void handleSave()}
      onReset={handleReset}
    />
  );

  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(220px,300px)_minmax(0,1fr)] lg:gap-x-12">
      {confirmDialog}
      <aside
        id="profile-avatar"
        className="flex scroll-mt-28 flex-col items-center lg:sticky lg:top-6 lg:self-start"
      >
        <PreviewableUserAvatar
          src={profile.avatarUrl ?? null}
          fallback={getInitials(profile)}
          alt={`Avatar của ${displayName}`}
          displayName={displayName}
          className={`size-28 shrink-0 rounded-full border bg-bg-surface object-cover sm:size-32 ${avatarError ? "border-error" : "border-border-default"} ${avatarBusy ? "opacity-60" : ""}`}
          fallbackClassName="text-2xl font-semibold text-text-primary sm:text-3xl"
        />
        <p className="mt-4 text-center text-sm font-semibold text-text-primary">
          {displayName}
        </p>
        <p className="mt-1 text-xs text-text-muted">
          Hoàn thiện:{" "}
          <span className="font-medium tabular-nums text-text-primary">
            {completion.overall.percentage}%
          </span>
        </p>

        <div className="mt-4 flex w-full max-w-[300px] flex-col items-center">
          <label
            htmlFor={getProfileFieldDomId(AVATAR_FIELD_KEY)}
            className="sr-only"
          >
            Chọn ảnh đại diện
          </label>
          <input
            id={getProfileFieldDomId(AVATAR_FIELD_KEY)}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={avatarBusy}
            onChange={handleAvatarFileChange}
            aria-invalid={avatarError ? true : undefined}
            aria-describedby={
              avatarError
                ? `${getProfileFieldDomId(AVATAR_FIELD_KEY)}-error`
                : undefined
            }
            className="block w-full text-xs text-text-secondary file:mr-2 file:rounded-full file:border-0 file:bg-bg-secondary file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-text-primary hover:file:bg-bg-tertiary"
          />
          <p className="mt-1 self-start text-[11px] leading-relaxed text-text-muted">
            {uploadAvatarMutation.isPending
              ? "Đang tải ảnh lên…"
              : "Chọn ảnh là lưu luôn · JPEG, PNG, WebP · tối đa 5MB"}
          </p>
          <div className="self-start">
            <FieldError
              id={`${getProfileFieldDomId(AVATAR_FIELD_KEY)}-error`}
              message={avatarError}
            />
          </div>
          {hasStoredAvatar ? (
            <button
              type="button"
              onClick={() => deleteAvatarMutation.mutate()}
              disabled={avatarBusy}
              className={`${ghostButtonClassName} mt-2 self-start`}
            >
              {deleteAvatarMutation.isPending ? "Đang xoá…" : "Xoá ảnh"}
            </button>
          ) : null}
        </div>

        <div
          id="profile-name"
          className={`${fieldListClassName} mt-6 w-full max-w-[300px] border-t border-border-default pt-4`}
        >
          <TextField
            {...field("account.first_name")}
            placeholder="Ví dụ: An"
            autoComplete="given-name"
            stacked
          />
          <TextField
            {...field("account.last_name")}
            placeholder="Ví dụ: Nguyễn Văn"
            autoComplete="family-name"
            stacked
          />
        </div>

        <div className="mt-6 w-full max-w-[300px]">
          <Link href="/auth/forgot-password" className={secondaryPillClassName}>
            Đặt lại mật khẩu
          </Link>
        </div>
      </aside>

      <div className="min-w-0 space-y-10 border-t border-border-default pt-10 lg:border-t-0 lg:pt-0">
        <ProfileSection
          id="profile-account"
          title="Thông tin chung"
          description="Tài khoản và liên hệ"
        >
          <div className={fieldListClassName}>
            <TextField
              {...field("account.email")}
              type="email"
              placeholder="email@example.com"
              autoComplete="email"
              hint={
                <EmailVerificationInline
                  email={profile.email ?? ""}
                  verified={emailVerifiedDisplay}
                  onRequestVerify={() => requestVerifyEmailMutation.mutate()}
                  verifyPending={requestVerifyEmailMutation.isPending}
                />
              }
            />
            <TextField
              {...field("account.phone")}
              type="tel"
              placeholder="0901234567"
              autoComplete="tel"
            />
            <TextField
              {...field("account.accountHandle")}
              placeholder="nguyenvana"
              autoComplete="username"
            />
            <TextField
              {...field("account.province")}
              placeholder="TP. HCM"
              autoComplete="address-level1"
            />
            <ReadOnlyRow
              label="Vai trò"
              value={getRoleLabel(profile.roleType)}
            />
          </div>
        </ProfileSection>

        {profile.staffInfo ? (
          <>
            <hr className="border-border-default" />
            <ProfileSection
              id="profile-staff"
              title="Nhân sự"
              description="Định danh, học vấn và thanh toán"
            >
              <div className={fieldListClassName}>
                <TextField
                  {...field("staff.cccd_number")}
                  placeholder="12 số"
                  inputMode="numeric"
                />
                <TextField {...field("staff.ethnicity")} />
                <SelectField
                  {...field("staff.gender")}
                  options={GENDER_OPTIONS}
                />
                <TextField {...field("staff.current_address")} multiline />
                <TextField {...field("staff.cccd_issued_date")} type="date" />
                <TextField {...field("staff.cccd_issued_place")} />
                <TextField {...field("staff.birth_date")} type="date" />
                <TextField {...field("staff.university")} />
                <TextField {...field("staff.high_school")} />
                <TextField {...field("staff.bank_account")} />
                <TextField
                  {...field("staff.bank_qr_link")}
                  type="url"
                  placeholder="https://..."
                />
                <ReadOnlyRow
                  label="Trạng thái"
                  value={humanizeToken(profile.staffInfo.status)}
                />
                <ReadOnlyRow
                  label="Vai trò đảm nhiệm"
                  value={
                    profile.staffInfo.roles?.length
                      ? profile.staffInfo.roles.map(humanizeToken).join(", ")
                      : "—"
                  }
                />
              </div>
              <div
                id={getProfileFieldDomId(ACHIEVEMENTS_FIELD_KEY)}
                className="mt-6 border-t border-border-default pt-6"
              >
                <AchievementListEditor
                  owner={{ kind: "staff", mode: "self" }}
                />
                <FieldError
                  id={`${getProfileFieldDomId(ACHIEVEMENTS_FIELD_KEY)}-error`}
                  message={errorFor(ACHIEVEMENTS_FIELD_KEY)}
                />
              </div>
            </ProfileSection>
            <hr className="border-border-default" />
            <ProfileSection
              id={getProfileFieldDomId(DATA_CONSENT_FIELD_KEY)}
              title="Dữ liệu cá nhân"
              description="Điều khoản thu thập và xử lý dữ liệu"
              error={
                consentReady ? undefined : errorFor(DATA_CONSENT_FIELD_KEY)
              }
            >
              <DataConsentSection
                profile={profile}
                ticks={consentTicks}
                onTicksChange={setConsentTicks}
                disabled={saving}
              />
            </ProfileSection>
            {profile.studentInfo ? null : saveBar}
          </>
        ) : null}

        {profile.studentInfo ? (
          <>
            <hr className="border-border-default" />
            <ProfileSection
              id="profile-student"
              title="Học viên"
              description="Trường lớp, phụ huynh, mục tiêu"
            >
              <div className={fieldListClassName}>
                <TextField {...field("student.full_name")} />
                <TextField
                  {...field("student.email")}
                  type="email"
                  hint={
                    <EmailVerificationInline
                      email={profile.studentInfo.email ?? ""}
                      verified={studentEmailVerifiedDisplay}
                      notApplicableMessage={studentEmailNotApplicableMessage}
                      onRequestVerify={() =>
                        requestVerifyEmailMutation.mutate()
                      }
                      verifyPending={requestVerifyEmailMutation.isPending}
                    />
                  }
                />
                <TextField {...field("student.school")} />
                <TextField {...field("student.province")} />
                <TextField
                  {...field("student.birth_year")}
                  type="number"
                  min={1900}
                  max={new Date().getFullYear()}
                />
                <SelectField
                  {...field("student.gender")}
                  options={GENDER_OPTIONS}
                />
                <TextField {...field("student.parent_name")} />
                <TextField {...field("student.parent_phone")} type="tel" />
                <TextField
                  {...field("student.parent_email")}
                  type="email"
                  placeholder="parent@example.com"
                  hint="Email phụ huynh nhận biên lai nạp ví SePay."
                />
                <TextField
                  {...field("student.goal")}
                  placeholder="Ví dụ: 7.5 IELTS hoặc đỗ chuyên Tin"
                />
                <ReadOnlyRow
                  label="Trạng thái"
                  value={humanizeToken(profile.studentInfo.status)}
                />
              </div>
              <div className="mt-6 border-t border-border-subtle pt-4">
                <ParentReceiptEmailSwitch
                  enabled={
                    profile.studentInfo.parentReceiptEmailEnabled !== false
                  }
                  disabled={receiptEmailMutation.isPending}
                  onToggle={(enabled) => receiptEmailMutation.mutate(enabled)}
                />
              </div>
            </ProfileSection>

            {saveBar}

            <Link
              href="/student/tuition"
              className="flex items-center justify-between gap-3 rounded-2xl bg-primary px-5 py-4 text-text-inverse shadow-sm transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            >
              <span className="min-w-0">
                <span className="block text-sm font-semibold">Học phí</span>
                <span className="mt-0.5 block text-xs text-text-inverse/80">
                  Xem số dư, nạp học phí và lịch sử giao dịch.
                </span>
              </span>
              <svg
                className="size-5 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </Link>

            <StudentExamCard
              studentId={profile.studentInfo.id}
              editable
              selfService
            />
          </>
        ) : null}

        {!profile.staffInfo && !profile.studentInfo ? saveBar : null}
      </div>
    </div>
  );
}
