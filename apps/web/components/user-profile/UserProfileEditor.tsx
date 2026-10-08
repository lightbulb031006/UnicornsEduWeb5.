"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import UpgradedSelect, {
  type UpgradedSelectOption,
} from "@/components/ui/UpgradedSelect";
import { DateInput } from "@/components/ui/DateInput";
import EmailVerificationInline from "@/components/user-profile/EmailVerificationInline";
import PreviewableUserAvatar from "@/components/ui/PreviewableUserAvatar";
import DataConsentSection from "@/components/user-profile/DataConsentSection";
import { StudentExamCard } from "@/components/admin/student";
import AchievementListEditor from "@/components/shared/achievement/AchievementListEditor";
import ParentReceiptEmailSwitch from "@/components/student/ParentReceiptEmailSwitch";
import { useAuth } from "@/context/AuthContext";
import { resolveEmailVerified } from "@/mocks/user-profile-verification.mock";
import * as authApi from "@/lib/apis/auth.api";
import {
  AUTH_FULL_PROFILE_QUERY_KEY,
  PROFILE_FULL_QUERY_KEY,
} from "@/lib/profile-full-query";
import type {
  FullProfileDto,
  UpdateMyProfileDto,
  UpdateMyStaffProfileDto,
  UpdateMyStudentProfileDto,
} from "@/dtos/profile.dto";
import {
  resolveBlurSave,
  toBlurSaveText,
  toDateInputValue,
  validateBirthYear,
  type BlurSaveEmptyPolicy,
} from "@/lib/profile-blur-save";
import {
  getProfileCompletion,
  getProfileDisplayName,
  type CompletionStats,
} from "@/lib/user-profile-completion";

/** Mọi lần lưu hồ sơ chạy nối tiếp để response cuối luôn chứa mọi thay đổi trước đó. */
const PROFILE_SAVE_SCOPE = { id: "profile-self-save" };

const GENDER_OPTIONS: UpgradedSelectOption[] = [
  { value: "male", label: "Nam" },
  { value: "female", label: "Nữ" },
];

const inputClassName =
  "w-full rounded-lg border border-border-default bg-bg-primary px-3 py-2.5 text-sm text-text-primary transition-colors placeholder:text-text-muted focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-border-focus/20";
/** Nhãn phải, giá trị trái từ `sm`; mobile xếp dọc. */
const fieldRowClassName =
  "grid grid-cols-1 gap-x-8 gap-y-1.5 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(7.5rem,11rem)_minmax(0,1fr)] sm:items-center";
const fieldRowStackedClassName =
  "grid grid-cols-1 gap-y-1.5 py-3 first:pt-0 last:pb-0";
const labelClassName = "text-sm font-semibold text-text-primary sm:text-right";
const labelStackedClassName = "text-sm font-semibold text-text-primary";
const fieldListClassName = "min-w-0 divide-y divide-border-default/80";
const ghostButtonClassName =
  "inline-flex items-center justify-center rounded-lg border border-border-default bg-bg-surface px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:border-border-focus hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus";
const primaryButtonClassName =
  "inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-60";
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
  return (err as { response?: { data?: { message?: string } } })?.response
    ?.data?.message;
}

type SaveField = (value: string | null) => Promise<unknown>;

/** Cách một ô lưu khi rời ô; `validate` trả thông báo lỗi để chặn gọi API. */
type BlurSaveConfig = {
  label: string;
  savedValue: string | number | null | undefined;
  onSave: SaveField;
  emptyPolicy?: BlurSaveEmptyPolicy;
  validate?: (value: string) => string | null;
};

/**
 * Lưu một ô khi rời ô: không đổi thì không gọi API; lỗi, giá trị không hợp lệ
 * hoặc xoá trường bắt buộc thì trả ô về giá trị đã lưu. Toast báo theo nhãn ô.
 */
async function commitFieldOnBlur(
  input: HTMLInputElement | HTMLTextAreaElement,
  {
    label,
    savedValue,
    onSave,
    emptyPolicy = "empty-string",
    validate,
  }: BlurSaveConfig,
) {
  const decision = resolveBlurSave(savedValue, input.value, emptyPolicy);
  if (decision.kind === "skip") return;
  const invalidMessage =
    decision.kind === "revert"
      ? `${label} không được để trống.`
      : decision.value && validate
        ? validate(decision.value)
        : null;
  if (invalidMessage) {
    input.value = toBlurSaveText(savedValue);
    toast.error(invalidMessage);
    return;
  }
  if (decision.kind !== "save") return;
  try {
    await onSave(decision.value);
    toast.success(`Đã lưu ${label.toLowerCase()}.`);
  } catch (err) {
    input.value = toBlurSaveText(savedValue);
    toast.error(getErrorMessage(err) ?? `Không lưu được ${label.toLowerCase()}.`);
  }
}

function FieldRow({
  id,
  labelId,
  label,
  stacked,
  hint,
  children,
}: {
  id?: string;
  labelId?: string;
  label: string;
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
      </label>
      <div className="min-w-0">
        {children}
        {hint ? (
          <div className="mt-1 text-xs leading-relaxed text-text-secondary">
            {hint}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ReadOnlyRow({
  label,
  value,
  stacked,
}: {
  label: string;
  value: ReactNode;
  stacked?: boolean;
}) {
  return (
    <div className={stacked ? fieldRowStackedClassName : fieldRowClassName}>
      <span className={stacked ? labelStackedClassName : labelClassName}>
        {label}
      </span>
      <span className="min-w-0 text-sm leading-relaxed text-text-primary">
        {value}
      </span>
    </div>
  );
}

type BlurFieldProps = BlurSaveConfig & {
  id: string;
  placeholder?: string;
  stacked?: boolean;
  hint?: ReactNode;
};

function BlurTextField({
  id,
  placeholder,
  stacked,
  hint,
  type = "text",
  min,
  max,
  autoComplete,
  ...saveConfig
}: BlurFieldProps & {
  type?: string;
  min?: number;
  max?: number;
  autoComplete?: string;
}) {
  const { label } = saveConfig;
  const savedText = toBlurSaveText(saveConfig.savedValue);
  const inputProps = {
    id,
    className: inputClassName,
    defaultValue: savedText,
    placeholder,
    min,
    max,
    autoComplete,
    onBlur: (event: React.FocusEvent<HTMLInputElement>) =>
      void commitFieldOnBlur(event.currentTarget, saveConfig),
  };
  return (
    <FieldRow id={id} label={label} stacked={stacked} hint={hint}>
      {/* Remount khi giá trị đã lưu đổi để ô hiện đúng dữ liệu mới nhất. */}
      {type === "date" ? (
        <DateInput key={savedText} {...inputProps} />
      ) : (
        <input key={savedText} type={type} {...inputProps} />
      )}
    </FieldRow>
  );
}

function BlurTextAreaField({
  id,
  placeholder,
  stacked,
  hint,
  ...saveConfig
}: BlurFieldProps) {
  const { label } = saveConfig;
  const savedText = toBlurSaveText(saveConfig.savedValue);
  return (
    <FieldRow id={id} label={label} stacked={stacked} hint={hint}>
      <textarea
        key={savedText}
        id={id}
        className={`${inputClassName} min-h-24 resize-y leading-relaxed`}
        defaultValue={savedText}
        placeholder={placeholder}
        rows={3}
        onBlur={(event) => void commitFieldOnBlur(event.currentTarget, saveConfig)}
      />
    </FieldRow>
  );
}

/** Chọn xong là lưu luôn (tương đương rời ô với ô chọn). */
function SaveOnSelectField({
  id,
  label,
  savedValue,
  options,
  onSave,
}: {
  id: string;
  label: string;
  savedValue: string | null | undefined;
  options: UpgradedSelectOption[];
  onSave: (value: string) => Promise<unknown>;
}) {
  const labelId = `${id}-label`;
  // Đổi key để UpgradedSelect quay về giá trị đã lưu khi lưu lỗi.
  const [resetCount, setResetCount] = useState(0);

  const handleChange = async (next: string) => {
    if (next === (savedValue ?? "")) return;
    try {
      await onSave(next);
      toast.success(`Đã lưu ${label.toLowerCase()}.`);
    } catch (err) {
      setResetCount((count) => count + 1);
      toast.error(getErrorMessage(err) ?? `Không lưu được ${label.toLowerCase()}.`);
    }
  };

  return (
    <FieldRow id={id} labelId={labelId} label={label}>
      <UpgradedSelect
        key={`${savedValue ?? ""}-${resetCount}`}
        id={id}
        defaultValue={savedValue ?? undefined}
        onValueChange={(next) => void handleChange(next)}
        options={options}
        placeholder={`Chọn ${label.toLowerCase()}`}
        labelId={labelId}
        buttonClassName={inputClassName}
      />
    </FieldRow>
  );
}

function ProfileSection({
  id,
  title,
  description,
  completion,
  children,
}: {
  id: string;
  title: string;
  description: string;
  completion: CompletionStats;
  children: ReactNode;
}) {
  return (
    <section id={id} className="motion-fade-up scroll-mt-28">
      <div className="border-b border-border-default pb-3">
        <h2 className="text-base font-semibold text-text-primary sm:text-lg">
          {title}
        </h2>
        <p className="mt-0.5 text-xs text-text-muted">
          {description} · {completion.filled}/{completion.total} trường (
          {completion.percentage}%)
        </p>
      </div>
      <div className="pt-4">{children}</div>
    </section>
  );
}

/**
 * Hồ sơ của chính người dùng, lưu từng ô khi rời ô (không có nút lưu chung).
 * Cột trái: avatar, tên, mật khẩu. Cột phải: thông tin chung rồi khối Nhân sự /
 * Học viên. Mobile xếp dọc.
 */
export default function UserProfileEditor({
  profile,
}: {
  profile: FullProfileDto;
}) {
  const queryClient = useQueryClient();
  const { setUser } = useAuth();
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const avatarPreviewUrl = useMemo(
    () => (avatarFile ? URL.createObjectURL(avatarFile) : null),
    [avatarFile],
  );

  useEffect(() => {
    return () => {
      if (avatarPreviewUrl) {
        URL.revokeObjectURL(avatarPreviewUrl);
      }
    };
  }, [avatarPreviewUrl]);

  const refreshAuthSession = async () => {
    try {
      const nextUser = await authApi.getSession();
      setUser(nextUser);
      queryClient.setQueryData(["auth", "session"], nextUser);
    } catch {
      // Phiên cũ vẫn dùng được; navbar sẽ tự làm mới ở lần tải sau.
    }
  };

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

  const uploadAvatarMutation = useMutation({
    mutationFn: authApi.uploadMyAvatar,
    scope: PROFILE_SAVE_SCOPE,
    onSuccess: async (data) => {
      syncFullProfile(data);
      await refreshAuthSession();
      setAvatarFile(null);
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
      setAvatarFile(null);
      toast.success("Đã xoá avatar.");
    },
    onError: (err: unknown) => {
      toast.error(getErrorMessage(err) ?? "Không thể xoá avatar.");
    },
  });

  const requestVerifyEmailMutation = useMutation({
    mutationFn: () => authApi.resendVerificationEmail(),
    onSuccess: (data) => {
      toast.success(
        data?.message ?? "Đã gửi email xác minh. Vui lòng kiểm tra hộp thư.",
      );
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

  const saveAccount = (patch: UpdateMyProfileDto) =>
    updateProfileMutation.mutateAsync(patch);
  const saveStaff = (patch: UpdateMyStaffProfileDto) =>
    updateStaffMutation.mutateAsync(patch);
  const saveStudent = (patch: UpdateMyStudentProfileDto) =>
    updateStudentMutation.mutateAsync(patch);

  const handleAvatarFileChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const nextFile = event.target.files?.[0] ?? null;
    setAvatarFile(nextFile);
    event.target.value = "";
  };

  const handleAvatarUpload = () => {
    if (!avatarFile) {
      toast.error("Vui lòng chọn ảnh trước khi tải lên.");
      return;
    }

    uploadAvatarMutation.mutate(avatarFile);
  };

  const completion = getProfileCompletion(profile);
  const displayName = getProfileDisplayName(profile);
  const storedAvatarPath =
    (profile as FullProfileDto & { avatarPath?: string | null }).avatarPath ??
    null;
  const effectiveAvatarUrl = avatarPreviewUrl ?? profile.avatarUrl ?? null;
  const hasStoredAvatar = Boolean(storedAvatarPath || profile.avatarUrl);
  const avatarBusy =
    uploadAvatarMutation.isPending || deleteAvatarMutation.isPending;

  const profileSubtitle = profile.studentInfo
    ? "Học viên — thông tin học tập và liên hệ phụ huynh."
    : profile.staffInfo
      ? "Nhân sự — học vấn và thông tin thanh toán."
      : "Tài khoản và liên hệ trong hệ thống.";

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

  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(220px,300px)_minmax(0,1fr)] lg:gap-x-12">
      <aside
        id="profile-avatar"
        className="flex scroll-mt-28 flex-col items-center lg:sticky lg:top-6 lg:self-start"
      >
        <PreviewableUserAvatar
          src={effectiveAvatarUrl}
          fallback={getInitials(profile)}
          alt={`Avatar của ${displayName}`}
          displayName={displayName}
          className="size-28 shrink-0 rounded-full border border-border-default bg-bg-surface object-cover sm:size-32"
          fallbackClassName="text-2xl font-semibold text-text-primary sm:text-3xl"
        />
        <p className="mt-4 text-center text-sm font-semibold text-text-primary">
          {displayName}
        </p>
        <p className="mt-1 max-w-[260px] text-center text-xs leading-relaxed text-text-secondary">
          {profileSubtitle}
        </p>
        <p className="mt-3 text-xs text-text-muted">
          Hoàn thiện:{" "}
          <span className="font-medium tabular-nums text-text-primary">
            {completion.overall.percentage}%
          </span>
        </p>

        <div className="mt-4 w-full max-w-[300px]">
          <label htmlFor="profile-avatar-upload" className="sr-only">
            Chọn ảnh đại diện
          </label>
          <input
            id="profile-avatar-upload"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={avatarBusy}
            onChange={handleAvatarFileChange}
            className="block w-full text-xs text-text-secondary file:mr-2 file:rounded-full file:border-0 file:bg-bg-secondary file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-text-primary hover:file:bg-bg-tertiary"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {avatarFile ? (
              <>
                <button
                  type="button"
                  onClick={handleAvatarUpload}
                  disabled={avatarBusy}
                  className={primaryButtonClassName}
                >
                  {uploadAvatarMutation.isPending ? "Đang tải…" : "Lưu ảnh"}
                </button>
                <button
                  type="button"
                  onClick={() => setAvatarFile(null)}
                  disabled={avatarBusy}
                  className={ghostButtonClassName}
                >
                  Huỷ
                </button>
              </>
            ) : hasStoredAvatar ? (
              <button
                type="button"
                onClick={() => deleteAvatarMutation.mutate()}
                disabled={avatarBusy}
                className={ghostButtonClassName}
              >
                {deleteAvatarMutation.isPending ? "Đang xoá…" : "Xoá ảnh"}
              </button>
            ) : null}
          </div>
          {avatarFile ? (
            <p className="mt-1 truncate text-xs text-text-muted">
              {avatarFile.name}
            </p>
          ) : (
            <p className="mt-1 text-[11px] leading-relaxed text-text-muted">
              JPEG, PNG, WebP · tối đa 5MB
            </p>
          )}
        </div>

        <div
          id="profile-name"
          className={`${fieldListClassName} mt-6 w-full max-w-[300px] border-t border-border-default pt-4`}
        >
          <BlurTextField
            id="user-first_name"
            label="Tên"
            savedValue={profile.first_name}
            emptyPolicy="keep"
            placeholder="Ví dụ: An"
            autoComplete="given-name"
            stacked
            onSave={(value) => saveAccount({ first_name: value ?? "" })}
          />
          <BlurTextField
            id="user-last_name"
            label="Họ và tên đệm"
            savedValue={profile.last_name}
            placeholder="Ví dụ: Nguyễn Văn"
            autoComplete="family-name"
            stacked
            onSave={(value) => saveAccount({ last_name: value ?? "" })}
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
          completion={completion.account}
        >
          <div className={fieldListClassName}>
            <BlurTextField
              id="user-email"
              label="Email"
              type="email"
              savedValue={profile.email}
              emptyPolicy="keep"
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
              onSave={(value) => saveAccount({ email: value ?? "" })}
            />
            <BlurTextField
              id="user-phone"
              label="Số điện thoại"
              type="tel"
              savedValue={profile.phone}
              placeholder="0901234567"
              autoComplete="tel"
              onSave={(value) => saveAccount({ phone: value ?? "" })}
            />
            <BlurTextField
              id="user-accountHandle"
              label="Handle"
              savedValue={profile.accountHandle}
              emptyPolicy="keep"
              placeholder="nguyenvana"
              autoComplete="username"
              onSave={(value) => saveAccount({ accountHandle: value ?? "" })}
            />
            <BlurTextField
              id="user-province"
              label="Tỉnh / Thành phố"
              savedValue={profile.province}
              placeholder="TP. HCM"
              autoComplete="address-level1"
              onSave={(value) => saveAccount({ province: value ?? "" })}
            />
            <ReadOnlyRow label="Vai trò" value={getRoleLabel(profile.roleType)} />
          </div>
        </ProfileSection>

        {profile.staffInfo ? (
          <>
            <hr className="border-border-default" />
            <ProfileSection
              id="profile-staff"
              title="Nhân sự"
              description="Học vấn và thanh toán"
              completion={completion.staff!}
            >
              <div className="mb-4 rounded-lg border border-border-default bg-bg-secondary/50 px-4 py-3 text-sm text-text-secondary">
                Tên nhân sự lấy từ ô{" "}
                <span className="font-medium text-text-primary">
                  Tên
                </span>{" "}
                và{" "}
                <span className="font-medium text-text-primary">
                  Họ và tên đệm
                </span>{" "}
                ở cột ảnh đại diện.
              </div>
              <div className={fieldListClassName}>
                <BlurTextField
                  id="staff-cccd_number"
                  label="Số CCCD"
                  savedValue={profile.staffInfo.cccdNumber}
                  emptyPolicy="keep"
                  placeholder="12 số"
                  onSave={(value) => saveStaff({ cccd_number: value ?? "" })}
                />
                <BlurTextField
                  id="staff-ethnicity"
                  label="Dân tộc"
                  savedValue={profile.staffInfo.ethnicity}
                  onSave={(value) => saveStaff({ ethnicity: value ?? "" })}
                />
                <SaveOnSelectField
                  id="staff-gender"
                  label="Giới tính"
                  savedValue={profile.staffInfo.gender}
                  options={GENDER_OPTIONS}
                  onSave={(value) =>
                    saveStaff({
                      gender: value as UpdateMyStaffProfileDto["gender"],
                    })
                  }
                />
                <BlurTextAreaField
                  id="staff-current_address"
                  label="Địa chỉ hiện tại"
                  savedValue={profile.staffInfo.currentAddress}
                  onSave={(value) =>
                    saveStaff({ current_address: value ?? "" })
                  }
                />
                <BlurTextField
                  id="staff-cccd_issued_date"
                  label="Ngày cấp CCCD"
                  type="date"
                  savedValue={toDateInputValue(
                    profile.staffInfo.cccdIssuedDate,
                  )}
                  emptyPolicy="keep"
                  onSave={(value) =>
                    saveStaff({ cccd_issued_date: value ?? "" })
                  }
                />
                <BlurTextField
                  id="staff-cccd_issued_place"
                  label="Nơi cấp CCCD"
                  savedValue={profile.staffInfo.cccdIssuedPlace}
                  onSave={(value) =>
                    saveStaff({ cccd_issued_place: value ?? "" })
                  }
                />
                <BlurTextField
                  id="staff-birth_date"
                  label="Ngày sinh"
                  type="date"
                  savedValue={toDateInputValue(profile.staffInfo.birthDate)}
                  emptyPolicy="keep"
                  onSave={(value) => saveStaff({ birth_date: value ?? "" })}
                />
                <BlurTextField
                  id="staff-university"
                  label="Trường đại học"
                  savedValue={profile.staffInfo.university}
                  onSave={(value) => saveStaff({ university: value ?? "" })}
                />
                <BlurTextField
                  id="staff-high_school"
                  label="Trường THPT"
                  savedValue={profile.staffInfo.highSchool}
                  onSave={(value) => saveStaff({ high_school: value ?? "" })}
                />
                <BlurTextField
                  id="staff-bank_account"
                  label="Số tài khoản"
                  savedValue={profile.staffInfo.bankAccount}
                  onSave={(value) => saveStaff({ bank_account: value ?? "" })}
                />
                <BlurTextField
                  id="staff-bank_qr_link"
                  label="Link QR ngân hàng"
                  type="url"
                  savedValue={profile.staffInfo.bankQrLink}
                  placeholder="https://..."
                  onSave={(value) => saveStaff({ bank_qr_link: value ?? "" })}
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
              <div className="mt-6 border-t border-border-default pt-6">
                <AchievementListEditor owner={{ kind: "staff", mode: "self" }} />
              </div>
            </ProfileSection>
            <hr className="border-border-default" />
            <ProfileSection
              id="profile-data-consent"
              title="Dữ liệu cá nhân"
              description="Điều khoản thu thập và xử lý dữ liệu"
              completion={completion.dataConsent!}
            >
              <DataConsentSection
                profile={profile}
                onAccepted={(payload) =>
                  syncFullProfile({
                    ...profile,
                    dataConsentAcceptedAt: payload.dataConsentAcceptedAt,
                    dataConsentVersion: payload.dataConsentVersion,
                    requiresStaffDataConsent: false,
                  })
                }
              />
            </ProfileSection>
          </>
        ) : null}

        {profile.studentInfo ? (
          <>
            <hr className="border-border-default" />
            <ProfileSection
              id="profile-student"
              title="Học viên"
              description="Trường lớp, phụ huynh, mục tiêu"
              completion={completion.student!}
            >
              <div className={fieldListClassName}>
                <BlurTextField
                  id="student-full_name"
                  label="Họ tên"
                  savedValue={profile.studentInfo.fullName}
                  emptyPolicy="keep"
                  onSave={(value) => saveStudent({ full_name: value ?? "" })}
                />
                <BlurTextField
                  id="student-email"
                  label="Email"
                  type="email"
                  savedValue={profile.studentInfo.email}
                  emptyPolicy="keep"
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
                  onSave={(value) => saveStudent({ email: value ?? "" })}
                />
                <BlurTextField
                  id="student-school"
                  label="Trường"
                  savedValue={profile.studentInfo.school}
                  onSave={(value) => saveStudent({ school: value ?? "" })}
                />
                <BlurTextField
                  id="student-province"
                  label="Tỉnh / Thành phố"
                  savedValue={profile.studentInfo.province}
                  onSave={(value) => saveStudent({ province: value ?? "" })}
                />
                <BlurTextField
                  id="student-birth_year"
                  label="Năm sinh"
                  type="number"
                  min={1900}
                  max={new Date().getFullYear()}
                  savedValue={profile.studentInfo.birthYear}
                  emptyPolicy="keep"
                  validate={(value) =>
                    validateBirthYear(value, new Date().getFullYear())
                  }
                  onSave={(value) =>
                    saveStudent({ birth_year: Number(value) })
                  }
                />
                <SaveOnSelectField
                  id="student-gender"
                  label="Giới tính"
                  savedValue={profile.studentInfo.gender}
                  options={GENDER_OPTIONS}
                  onSave={(value) =>
                    saveStudent({
                      gender: value as UpdateMyStudentProfileDto["gender"],
                    })
                  }
                />
                <BlurTextField
                  id="student-parent_name"
                  label="Phụ huynh"
                  savedValue={profile.studentInfo.parentName}
                  onSave={(value) => saveStudent({ parent_name: value ?? "" })}
                />
                <BlurTextField
                  id="student-parent_phone"
                  label="SĐT phụ huynh"
                  type="tel"
                  savedValue={profile.studentInfo.parentPhone}
                  onSave={(value) =>
                    saveStudent({ parent_phone: value ?? "" })
                  }
                />
                <BlurTextField
                  id="student-parent_email"
                  label="Email phụ huynh"
                  type="email"
                  savedValue={profile.studentInfo.parentEmail}
                  emptyPolicy="null"
                  placeholder="parent@example.com"
                  hint="Email phụ huynh nhận biên lai nạp ví SePay."
                  onSave={(value) => saveStudent({ parent_email: value })}
                />
                <BlurTextField
                  id="student-goal"
                  label="Mục tiêu học tập"
                  savedValue={profile.studentInfo.goal}
                  placeholder="Ví dụ: 7.5 IELTS hoặc đỗ chuyên Tin"
                  onSave={(value) => saveStudent({ goal: value ?? "" })}
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
      </div>
    </div>
  );
}
