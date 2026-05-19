"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import UpgradedSelect, {
  type UpgradedSelectOption,
} from "@/components/ui/UpgradedSelect";
import { DateInput } from "@/components/ui/DateInput";
import EmailVerificationInline from "@/components/user-profile/EmailVerificationInline";
import UserAvatar from "@/components/ui/UserAvatar";
import CccdImageUploadFields from "@/components/staff/CccdImageUploadFields";
import StaffSpecializationMarkdown from "@/components/staff/StaffSpecializationMarkdown";
import DataConsentSection from "@/components/user-profile/DataConsentSection";
import { useAuth } from "@/context/AuthContext";
import { resolveEmailVerified } from "@/mocks/user-profile-verification.mock";
import * as authApi from "@/lib/apis/auth.api";
import type {
  FullProfileDto,
  UpdateMyProfileDto,
  UpdateMyStaffProfileDto,
  UpdateMyStudentProfileDto,
} from "@/dtos/profile.dto";
import { Role } from "@/dtos/Auth.dto";
import { resolveCanonicalUserName } from "@/dtos/user-name.dto";
import { OPEN_EMAIL_VERIFICATION_MODAL_EVENT } from "@/lib/email-verification-access";

type Tone = "primary" | "success" | "warning" | "neutral";

type CompletionStats = {
  filled: number;
  total: number;
  percentage: number;
};

type SectionItem = {
  id: string;
  label: string;
  description: string;
  completion: CompletionStats;
  tone: Tone;
};

type DetailItem = {
  label: string;
  value: ReactNode;
  hint?: string;
  fullWidth?: boolean;
};

type FieldProps = {
  id: string;
  name: string;
  label: string;
  type?: string;
  defaultValue?: string | number;
  placeholder?: string;
  min?: number;
  max?: number;
  autoComplete?: string;
};

const inputClassName =
  "w-full rounded-lg border border-border-default bg-bg-primary px-3 py-2.5 text-sm text-text-primary transition-colors placeholder:text-text-muted focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-border-focus/20";
const labelClassName = "mb-1.5 block text-xs font-medium text-text-muted";
const surfaceCardClassName =
  "rounded-xl border border-border-default bg-bg-surface shadow-sm";
const ghostButtonClassName =
  "inline-flex items-center justify-center rounded-lg border border-border-default bg-bg-surface px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:border-border-focus hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus";
const primaryButtonClassName =
  "inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-60";
/** Secondary pill — như nút "Change your password" trong reference */
const secondaryPillClassName =
  "inline-flex w-full max-w-[260px] items-center justify-center rounded-full bg-bg-secondary px-4 py-2.5 text-center text-sm font-medium text-text-primary transition-colors hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus";

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

function displayName(profile: FullProfileDto): string {
  return (
    resolveCanonicalUserName(profile, profile.staffInfo?.fullName) ||
    profile.accountHandle ||
    profile.email ||
    "—"
  );
}

function getInitials(profile: FullProfileDto): string {
  const source = displayName(profile).split(/\s+/).filter(Boolean).slice(0, 2);
  if (!source.length) return "UE";
  return source.map((part) => part.charAt(0).toUpperCase()).join("");
}

function isFilled(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") return value.trim().length > 0;
  return value !== null && value !== undefined;
}

function getCompletionStats(values: Array<unknown>): CompletionStats {
  const total = values.length;
  const filled = values.filter(isFilled).length;
  return {
    filled,
    total,
    percentage: total ? Math.round((filled / total) * 100) : 0,
  };
}

function humanizeToken(value: string | null | undefined): string {
  if (!value) return "—";
  return value
    .split(/[_-\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getRoleLabel(role: string | null | undefined): string {
  const roleMap: Record<string, string> = {
    admin: "Quản trị viên",
    staff: "Nhân sự",
    student: "Học viên",
    guest: "Khách",
  };
  return role ? (roleMap[role] ?? humanizeToken(role)) : "Chưa xác định";
}

function getGenderLabel(gender: string | null | undefined): string {
  if (gender === "female") return "Nữ";
  if (gender === "male") return "Nam";
  return "—";
}

function normalizeRoleType(value: string | undefined, fallback: Role): Role {
  return Object.values(Role).includes(value as Role)
    ? (value as Role)
    : fallback;
}

function getToneColor(tone: Tone): string {
  switch (tone) {
    case "primary":
      return "var(--ue-primary)";
    case "success":
      return "var(--ue-success)";
    case "warning":
      return "var(--ue-warning)";
    default:
      return "var(--ue-text-muted)";
  }
}

function getFieldValue(
  form: HTMLFormElement,
  name: string,
): string | undefined {
  const field = form.elements.namedItem(name);
  if (!field) return undefined;

  if (field instanceof RadioNodeList) {
    const value = field.value?.trim();
    return value || undefined;
  }

  if (
    field instanceof HTMLInputElement ||
    field instanceof HTMLSelectElement ||
    field instanceof HTMLTextAreaElement
  ) {
    const value = field.value?.trim();
    return value || undefined;
  }

  return undefined;
}

function Tag({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border-default bg-bg-surface px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-text-secondary shadow-sm">
      <span
        className="size-2 rounded-full"
        style={{ backgroundColor: getToneColor(tone) }}
      />
      {label}
    </span>
  );
}

function ProfileSectionNav({
  items,
}: {
  items: Array<SectionItem & { href: string }>;
}) {
  return (
    <nav
      className="mb-8 flex flex-wrap gap-x-1 gap-y-2 text-sm text-text-muted"
      aria-label="Mục hồ sơ"
    >
      {items.map((item, i) => (
        <span key={item.id} className="inline-flex items-center gap-1">
          {i > 0 ? (
            <span aria-hidden className="text-border-default">
              ·
            </span>
          ) : null}
          <Link
            href={item.href}
            className="font-medium text-text-secondary transition-colors hover:text-text-primary"
          >
            {item.label}
            <span className="tabular-nums text-text-muted">
              {" "}
              ({item.completion.percentage}%)
            </span>
          </Link>
        </span>
      ))}
    </nav>
  );
}

/** Hàng nhãn căn phải / giá trị căn trái (gutter cố định), giống reference */
function DetailRows({ items }: { items: DetailItem[] }) {
  return (
    <dl className="min-w-0 divide-y divide-border-default/80">
      {items.map((item) => (
        <div
          key={item.label}
          className={
            item.fullWidth
              ? "grid grid-cols-1 gap-y-1.5 py-3 first:pt-0 last:pb-0"
              : "grid grid-cols-1 gap-x-8 gap-y-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(7.5rem,11rem)_minmax(0,1fr)] sm:items-baseline"
          }
        >
          <dt
            className={
              item.fullWidth
                ? "text-sm font-semibold text-text-primary"
                : "text-sm font-semibold text-text-primary sm:text-right"
            }
          >
            {item.label}
          </dt>
          <dd className="min-w-0 text-sm font-normal leading-relaxed text-text-primary">
            {item.value}
            {item.hint ? (
              <p className="mt-1 text-xs leading-relaxed text-text-secondary">
                {item.hint}
              </p>
            ) : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function TextField({
  id,
  name,
  label,
  type = "text",
  defaultValue,
  placeholder,
  min,
  max,
  autoComplete,
}: FieldProps) {
  return (
    <div>
      <label htmlFor={id} className={labelClassName}>
        {label}
      </label>
      {type === "date" ? (
        <DateInput
          id={id}
          name={name}
          className={inputClassName}
          defaultValue={defaultValue ?? ""}
          placeholder={placeholder}
          min={min}
          max={max}
          autoComplete={autoComplete}
        />
      ) : (
        <input
          id={id}
          name={name}
          type={type}
          className={inputClassName}
          defaultValue={defaultValue ?? ""}
          placeholder={placeholder}
          min={min}
          max={max}
          autoComplete={autoComplete}
        />
      )}
    </div>
  );
}

function TextAreaField({
  id,
  name,
  label,
  defaultValue,
  placeholder,
  rows = 8,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue?: string | number;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <div>
      <label htmlFor={id} className={labelClassName}>
        {label}
      </label>
      <textarea
        id={id}
        name={name}
        className={`${inputClassName} min-h-[180px] resize-y leading-relaxed`}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        rows={rows}
      />
      <p className="mt-1.5 text-xs text-text-muted">
        Mỗi dòng sẽ được lưu trực tiếp vào hồ sơ. Dùng{" "}
        <code className="rounded bg-bg-tertiary px-1">- </code>ở đầu dòng để tạo
        danh sách Markdown.
      </p>
    </div>
  );
}

function SelectField({
  id,
  name,
  label,
  defaultValue,
  options,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue?: string;
  options: UpgradedSelectOption[];
}) {
  const labelId = `${id}-label`;
  return (
    <div>
      <label id={labelId} className={labelClassName}>
        {label}
      </label>
      <UpgradedSelect
        key={`${id}-${defaultValue ?? ""}`}
        id={id}
        name={name}
        defaultValue={defaultValue}
        options={options}
        labelId={labelId}
        buttonClassName={inputClassName}
      />
    </div>
  );
}

function FormActions({
  pending,
  onCancel,
}: {
  pending: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 border-t border-border-default pt-4">
      <button
        type="submit"
        disabled={pending}
        className={primaryButtonClassName}
      >
        {pending ? "Đang lưu…" : "Lưu thay đổi"}
      </button>
      <button type="button" onClick={onCancel} className={ghostButtonClassName}>
        Hủy
      </button>
    </div>
  );
}

function ProfileSection({
  id,
  title,
  description,
  completion,
  isEditing,
  onEdit,
  children,
}: {
  id: string;
  title: string;
  description: string;
  completion: CompletionStats;
  isEditing: boolean;
  onEdit?: () => void;
  children: ReactNode;
}) {
  return (
    <section id={id} className="motion-fade-up scroll-mt-28">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border-default pb-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-text-primary sm:text-lg">
            {title}
          </h2>
          <p className="mt-0.5 text-xs text-text-muted">
            {description} · {completion.filled}/{completion.total} trường (
            {completion.percentage}%)
          </p>
        </div>
        {!isEditing && onEdit ? (
          <button
            type="button"
            onClick={onEdit}
            className={ghostButtonClassName}
          >
            Chỉnh sửa
          </button>
        ) : null}
      </div>
      <div className="pt-4">{children}</div>
    </section>
  );
}

function LoadingSkeleton() {
  return (
    <div className="min-h-screen bg-bg-primary">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
        <div className="mb-8 h-9 max-w-xs animate-pulse rounded-lg bg-bg-tertiary" />
        <div className="lg:grid lg:grid-cols-[minmax(200px,280px)_1fr] lg:gap-12">
          <div className="mb-10 flex flex-col items-center lg:mb-0">
            <div className="size-28 animate-pulse rounded-full bg-bg-tertiary sm:size-32" />
            <div className="mt-4 h-4 w-32 rounded bg-bg-tertiary" />
            <div className="mt-6 h-10 w-full max-w-[260px] animate-pulse rounded-full bg-bg-tertiary" />
          </div>
          <div className="min-w-0 space-y-4 border-t border-border-default pt-8 lg:border-t-0 lg:pt-0">
            <div className="h-6 w-40 animate-pulse rounded bg-bg-tertiary" />
            <div className="space-y-3">
              {[
                "profile-field-skeleton-name",
                "profile-field-skeleton-email",
                "profile-field-skeleton-phone",
                "profile-field-skeleton-address",
                "profile-field-skeleton-role",
              ].map((skeletonKey) => (
                <div
                  key={skeletonKey}
                  className="h-10 animate-pulse rounded bg-bg-tertiary/70"
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ErrorState({ status }: { status?: number }) {
  const needAuth = status === 401;
  const needsVerifiedEmail = status === 403;

  return (
    <div className="min-h-screen overflow-hidden bg-bg-primary">
      <div className="mx-auto flex min-h-screen max-w-3xl items-center px-4 py-8 sm:px-6">
        <div
          className={`${surfaceCardClassName} motion-fade-up w-full p-6 sm:p-8`}
        >
          <Tag
            label={
              needAuth
                ? "Yêu cầu đăng nhập"
                : needsVerifiedEmail
                  ? "Yêu cầu xác minh email"
                  : "Không thể tải dữ liệu"
            }
            tone={needAuth || needsVerifiedEmail ? "warning" : "neutral"}
          />
          <h1 className="mt-5 text-3xl font-semibold tracking-[-0.05em] text-text-primary">
            {needAuth
              ? "Bạn cần đăng nhập để xem hồ sơ."
              : needsVerifiedEmail
                ? "Bạn cần xác minh email để mở hồ sơ."
                : "Trang hồ sơ hiện chưa khả dụng."}
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-text-secondary">
            {needAuth
              ? "Phiên truy cập hiện tại không hợp lệ hoặc đã hết hạn. Đăng nhập lại để tiếp tục chỉnh sửa thông tin cá nhân."
              : needsVerifiedEmail
                ? "Tài khoản của bạn đã đăng nhập thành công nhưng chưa xác minh email. Vui lòng xác minh email để truy cập trang hồ sơ và các dữ liệu cá nhân."
                : "Có lỗi xảy ra khi lấy dữ liệu hồ sơ từ hệ thống. Bạn có thể quay lại trang chủ hoặc thử tải lại sau."}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            {needsVerifiedEmail ? (
              <button
                type="button"
                onClick={() =>
                  window.dispatchEvent(
                    new Event(OPEN_EMAIL_VERIFICATION_MODAL_EVENT),
                  )
                }
                className={primaryButtonClassName}
              >
                Xác minh email
              </button>
            ) : (
              <Link
                href={needAuth ? "/auth/login" : "/"}
                className={primaryButtonClassName}
              >
                {needAuth ? "Đăng nhập" : "Về trang chủ"}
              </Link>
            )}
            <Link href="/" className={ghostButtonClassName}>
              Quay lại hệ thống
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function UserProfilePage() {
  const queryClient = useQueryClient();
  const { user, setUser } = useAuth();
  const searchParams = useSearchParams();
  const getSearchParam = searchParams.get.bind(searchParams);
  const [editUser, setEditUser] = useState(false);
  const [editStaff, setEditStaff] = useState(false);
  const [editStudent, setEditStudent] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [staffFrontImage, setStaffFrontImage] = useState<File | null>(null);
  const [staffBackImage, setStaffBackImage] = useState<File | null>(null);
  const avatarPreviewUrl = useMemo(
    () => (avatarFile ? URL.createObjectURL(avatarFile) : null),
    [avatarFile],
  );
  const requiresProfileCompletion = getSearchParam("profile_required") === "1";
  const redirectedFrom = getSearchParam("from");

  useEffect(() => {
    return () => {
      if (avatarPreviewUrl) {
        URL.revokeObjectURL(avatarPreviewUrl);
      }
    };
  }, [avatarPreviewUrl]);

  useEffect(() => {
    if (!requiresProfileCompletion) {
      return;
    }

    toast.warning(
      "Bạn chưa điền đầy đủ thông tin bắt buộc. Vui lòng hoàn thiện hồ sơ để tiếp tục.",
      {
        id: "profile-required-warning",
      },
    );
  }, [requiresProfileCompletion]);

  const {
    data: profile,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["profile", "full"],
    queryFn: authApi.getFullProfile,
    retry: (failureCount, err) => {
      const status = (err as { response?: { status?: number } })?.response
        ?.status;
      if (status === 401) return false;
      return failureCount < 2;
    },
  });

  const syncFullProfile = (
    data: FullProfileDto,
    options?: { syncAuthUser?: boolean },
  ) => {
    queryClient.setQueryData(["profile", "full"], data);
    queryClient.setQueryData(["auth", "full-profile"], data);

    if (!options?.syncAuthUser) {
      return;
    }

    setUser({
      ...user,
      id: data.id,
      accountHandle: data.accountHandle,
      roleType: normalizeRoleType(data.roleType, user.roleType),
      requiresPasswordSetup: user.requiresPasswordSetup,
      avatarUrl: data.avatarUrl ?? null,
      dataConsentAcceptedAt: data.dataConsentAcceptedAt ?? null,
      dataConsentVersion: data.dataConsentVersion ?? null,
      requiresStaffDataConsent: Boolean(data.requiresStaffDataConsent),
      staffRoles: data.staffInfo?.roles ?? [],
      hasStaffProfile: Boolean(data.staffInfo?.id),
      hasStudentProfile: Boolean(data.studentInfo?.id),
    });

    void queryClient.invalidateQueries({
      queryKey: ["staff", "self", "detail"],
    });
    if (data.staffInfo?.id) {
      void queryClient.invalidateQueries({
        queryKey: ["staff", "detail", data.staffInfo.id],
      });
    }
  };

  const updateProfileMutation = useMutation({
    mutationFn: authApi.updateMyProfile,
    onSuccess: (data) => {
      syncFullProfile(data, { syncAuthUser: true });
      setEditUser(false);
      toast.success("Đã cập nhật thông tin tài khoản.");
    },
    onError: (err: unknown) => {
      const ax = err as { response?: { data?: { message?: string } } };
      toast.error(ax.response?.data?.message ?? "Cập nhật thất bại.");
    },
  });

  const updateStaffMutation = useMutation({
    mutationFn: authApi.updateMyStaffProfile,
    onSuccess: (data) => {
      syncFullProfile(data);
      setEditStaff(false);
      toast.success("Đã cập nhật thông tin nhân sự.");
    },
    onError: (err: unknown) => {
      const ax = err as { response?: { data?: { message?: string } } };
      toast.error(ax.response?.data?.message ?? "Cập nhật thất bại.");
    },
  });

  const uploadStaffCccdMutation = useMutation({
    mutationFn: authApi.uploadMyStaffCccdImages,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile", "full"] });
      queryClient.invalidateQueries({ queryKey: ["auth", "full-profile"] });
      setStaffFrontImage(null);
      setStaffBackImage(null);
      toast.success("Đã cập nhật ảnh CCCD.");
    },
    onError: (err: unknown) => {
      const ax = err as { response?: { data?: { message?: string } } };
      toast.error(ax.response?.data?.message ?? "Không thể tải ảnh CCCD.");
    },
  });

  const updateStudentMutation = useMutation({
    mutationFn: authApi.updateMyStudentProfile,
    onSuccess: (data) => {
      syncFullProfile(data);
      setEditStudent(false);
      toast.success("Đã cập nhật thông tin học viên.");
    },
    onError: (err: unknown) => {
      const ax = err as { response?: { data?: { message?: string } } };
      toast.error(ax.response?.data?.message ?? "Cập nhật thất bại.");
    },
  });

  const uploadAvatarMutation = useMutation({
    mutationFn: authApi.uploadMyAvatar,
    onSuccess: (data) => {
      syncFullProfile(data, { syncAuthUser: true });
      setAvatarFile(null);
      toast.success("Đã cập nhật avatar.");
    },
    onError: (err: unknown) => {
      const ax = err as { response?: { data?: { message?: string } } };
      toast.error(ax.response?.data?.message ?? "Tải avatar thất bại.");
    },
  });

  const deleteAvatarMutation = useMutation({
    mutationFn: authApi.deleteMyAvatar,
    onSuccess: (data) => {
      syncFullProfile(data, { syncAuthUser: true });
      setAvatarFile(null);
      toast.success("Đã xoá avatar.");
    },
    onError: (err: unknown) => {
      const ax = err as { response?: { data?: { message?: string } } };
      toast.error(ax.response?.data?.message ?? "Không thể xoá avatar.");
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
      const ax = err as { response?: { data?: { message?: string } } };
      toast.error(
        ax.response?.data?.message ??
          "Không gửi được yêu cầu xác minh. Thử lại sau.",
      );
    },
  });

  const handleSubmitUser = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const payload: UpdateMyProfileDto = {
      first_name: getFieldValue(form, "first_name"),
      last_name: getFieldValue(form, "last_name"),
      email: getFieldValue(form, "email"),
      phone: getFieldValue(form, "phone"),
      province: getFieldValue(form, "province"),
      accountHandle: getFieldValue(form, "accountHandle"),
    };
    updateProfileMutation.mutate(payload);
  };

  const handleSubmitStaff = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const achievementRaw = getFieldValue(form, "personal_achievement_link");
    const payload: UpdateMyStaffProfileDto = {
      cccd_number: getFieldValue(form, "cccd_number"),
      cccd_issued_date: getFieldValue(form, "cccd_issued_date"),
      cccd_issued_place: getFieldValue(form, "cccd_issued_place"),
      birth_date: getFieldValue(form, "birth_date"),
      university: getFieldValue(form, "university"),
      high_school: getFieldValue(form, "high_school"),
      specialization: getFieldValue(form, "specialization"),
      bank_account: getFieldValue(form, "bank_account"),
      bank_qr_link: getFieldValue(form, "bank_qr_link"),
      personal_achievement_link: achievementRaw?.trim()
        ? achievementRaw.trim()
        : null,
    };
    updateStaffMutation.mutate(payload);
  };

  const handleSubmitStaffCccdImages = () => {
    if (!staffFrontImage && !staffBackImage) {
      toast.error("Vui lòng chọn ít nhất một ảnh CCCD.");
      return;
    }
    uploadStaffCccdMutation.mutate({
      frontImage: staffFrontImage,
      backImage: staffBackImage,
    });
  };

  const handleSubmitStudent = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const birthYear = getFieldValue(form, "birth_year");
    const gender = getFieldValue(form, "gender") as
      | "male"
      | "female"
      | undefined;

    const payload: UpdateMyStudentProfileDto = {
      full_name: getFieldValue(form, "full_name"),
      email: getFieldValue(form, "email"),
      school: getFieldValue(form, "school"),
      province: getFieldValue(form, "province"),
      birth_year: birthYear ? Number(birthYear) : undefined,
      parent_name: getFieldValue(form, "parent_name"),
      parent_phone: getFieldValue(form, "parent_phone"),
      parent_email: getFieldValue(form, "parent_email"),
      gender,
      goal: getFieldValue(form, "goal"),
    };
    updateStudentMutation.mutate(payload);
  };

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

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (isError || !profile) {
    const status = (error as { response?: { status?: number } })?.response
      ?.status;
    return <ErrorState status={status} />;
  }

  const storedAvatarPath =
    (profile as FullProfileDto & { avatarPath?: string | null }).avatarPath ??
    null;
  const effectiveAvatarUrl = avatarPreviewUrl ?? profile.avatarUrl ?? null;
  const hasStoredAvatar = Boolean(storedAvatarPath || profile.avatarUrl);
  const avatarBusy =
    uploadAvatarMutation.isPending || deleteAvatarMutation.isPending;
  const staffDataConsentComplete =
    !profile.staffInfo ||
    Boolean(
      profile.dataConsentAcceptedAt &&
      profile.requiresStaffDataConsent !== true,
    );
  const dataConsentCompletion = profile.staffInfo
    ? getCompletionStats([staffDataConsentComplete])
    : null;

  const accountCompletion = getCompletionStats([
    storedAvatarPath ?? profile.avatarUrl,
    profile.first_name,
    profile.last_name,
    profile.email,
    profile.phone,
    profile.accountHandle,
    profile.province,
  ]);

  const staffCompletion = profile.staffInfo
    ? getCompletionStats([
        displayName(profile),
        profile.staffInfo.birthDate,
        profile.staffInfo.university,
        profile.staffInfo.highSchool,
        profile.staffInfo.specialization,
        profile.staffInfo.bankAccount,
        profile.staffInfo.bankQrLink,
        profile.staffInfo.cccdNumber,
        profile.staffInfo.cccdIssuedDate,
        profile.staffInfo.cccdIssuedPlace,
        profile.staffInfo.cccdFrontPath ?? profile.staffInfo.cccdFrontUrl,
        profile.staffInfo.cccdBackPath ?? profile.staffInfo.cccdBackUrl,
        staffDataConsentComplete,
      ])
    : null;

  const studentCompletion = profile.studentInfo
    ? getCompletionStats([
        profile.studentInfo.fullName,
        profile.studentInfo.email,
        profile.studentInfo.school,
        profile.studentInfo.province,
        profile.studentInfo.birthYear,
        profile.studentInfo.parentName,
        profile.studentInfo.parentPhone,
        profile.studentInfo.parentEmail,
        profile.studentInfo.gender,
        profile.studentInfo.goal,
        profile.studentInfo.status,
      ])
    : null;

  const allProfileValues: Array<unknown> = [
    storedAvatarPath ?? profile.avatarUrl,
    profile.first_name,
    profile.last_name,
    profile.email,
    profile.phone,
    profile.accountHandle,
    profile.province,
  ];

  if (profile.staffInfo) {
    allProfileValues.push(
      displayName(profile),
      profile.staffInfo.birthDate,
      profile.staffInfo.university,
      profile.staffInfo.highSchool,
      profile.staffInfo.specialization,
      profile.staffInfo.bankAccount,
      profile.staffInfo.bankQrLink,
      profile.staffInfo.cccdNumber,
      profile.staffInfo.cccdIssuedDate,
      profile.staffInfo.cccdIssuedPlace,
      profile.staffInfo.cccdFrontPath ?? profile.staffInfo.cccdFrontUrl,
      profile.staffInfo.cccdBackPath ?? profile.staffInfo.cccdBackUrl,
      staffDataConsentComplete,
    );
  }

  if (profile.studentInfo) {
    allProfileValues.push(
      profile.studentInfo.fullName,
      profile.studentInfo.email,
      profile.studentInfo.school,
      profile.studentInfo.province,
      profile.studentInfo.birthYear,
      profile.studentInfo.parentName,
      profile.studentInfo.parentPhone,
      profile.studentInfo.parentEmail,
      profile.studentInfo.gender,
      profile.studentInfo.goal,
      profile.studentInfo.status,
    );
  }

  const overallCompletion = getCompletionStats(allProfileValues);
  const sectionItems: SectionItem[] = [
    {
      id: "profile-account",
      label: "Tài khoản",
      description: "Định danh, liên hệ và handle sử dụng trong hệ thống.",
      completion: accountCompletion,
      tone: "primary",
    },
    ...(profile.staffInfo
      ? [
          {
            id: "profile-staff",
            label: "Nhân sự",
            description: "Hồ sơ học vấn, chuyên môn và thông tin thanh toán.",
            completion: staffCompletion!,
            tone: "success" as const,
          },
          {
            id: "profile-data-consent",
            label: "Dữ liệu",
            description: "Xác nhận thu thập và xử lý dữ liệu cá nhân.",
            completion: dataConsentCompletion!,
            tone: "warning" as const,
          },
        ]
      : []),
    ...(profile.studentInfo
      ? [
          {
            id: "profile-student",
            label: "Học viên",
            description: "Thông tin học tập, phụ huynh và mục tiêu cá nhân.",
            completion: studentCompletion!,
            tone: "warning" as const,
          },
        ]
      : []),
  ];

  const missingItems = [
    !hasStoredAvatar && {
      label: "Thêm avatar cá nhân",
      href: "#profile-account",
      detail:
        "Avatar sẽ xuất hiện ở trang hồ sơ, navbar và menu điều hướng theo vai trò.",
    },
    !profile.phone && {
      label: "Bổ sung số điện thoại",
      href: "#profile-account",
      detail: "Giúp trung tâm liên hệ nhanh khi cần xác nhận lịch hoặc hỗ trợ.",
    },
    !profile.province && {
      label: "Cập nhật tỉnh/thành",
      href: "#profile-account",
      detail: "Hữu ích cho phân nhóm lớp, khu vực học và báo cáo vận hành.",
    },
    profile.staffInfo &&
      !profile.staffInfo.bankAccount && {
        label: "Thêm tài khoản ngân hàng",
        href: "#profile-staff",
        detail: "Cần thiết để hoàn thiện luồng thanh toán cho nhân sự.",
      },
    profile.staffInfo &&
      !profile.staffInfo.cccdNumber && {
        label: "Điền số CCCD",
        href: "#profile-staff",
        detail: "Thông tin định danh là bắt buộc để hoàn tất hồ sơ nhân sự.",
      },
    profile.staffInfo &&
      !(profile.staffInfo.cccdFrontPath ?? profile.staffInfo.cccdFrontUrl) && {
        label: "Tải ảnh CCCD mặt trước",
        href: "#profile-staff",
        detail: "Ảnh CCCD mặt trước dùng cho bước xác minh hồ sơ nhân sự.",
      },
    profile.staffInfo &&
      !(profile.staffInfo.cccdBackPath ?? profile.staffInfo.cccdBackUrl) && {
        label: "Tải ảnh CCCD mặt sau",
        href: "#profile-staff",
        detail: "Ảnh CCCD mặt sau dùng cho bước xác minh hồ sơ nhân sự.",
      },
    profile.staffInfo &&
      !profile.staffInfo.specialization && {
        label: "Điền chuyên ngành",
        href: "#profile-staff",
        detail:
          "Làm rõ năng lực chuyên môn và thuận tiện khi phân công công việc.",
      },
    profile.staffInfo &&
      !staffDataConsentComplete && {
        label: "Xác nhận điều khoản dữ liệu cá nhân",
        href: "#profile-data-consent",
        detail: "Đây là trường bắt buộc để hoàn tất hồ sơ nhân sự.",
      },
    profile.studentInfo &&
      !profile.studentInfo.goal && {
        label: "Xác định mục tiêu học tập",
        href: "#profile-student",
        detail:
          "Giúp giáo viên và phụ huynh theo dõi tiến độ theo đúng kỳ vọng.",
      },
    profile.studentInfo &&
      !profile.studentInfo.parentPhone && {
        label: "Bổ sung liên hệ phụ huynh",
        href: "#profile-student",
        detail:
          "Quan trọng cho nhắc lịch, phản hồi và xử lý các tình huống khẩn.",
      },
  ].filter(Boolean) as Array<{ label: string; href: string; detail: string }>;

  const profileSubtitle = profile.studentInfo
    ? "Học viên — thông tin học tập và liên hệ phụ huynh."
    : profile.staffInfo
      ? "Nhân sự — chuyên môn và thông tin thanh toán."
      : "Tài khoản và liên hệ trong hệ thống.";

  const sectionNavItems = sectionItems.map((item) => ({
    ...item,
    href: `#${item.id}`,
  }));

  const emailVerifiedDisplay = resolveEmailVerified(profile.emailVerified);
  const accountEmailNorm = profile.email?.trim().toLowerCase() ?? "";
  const studentEmailRaw = profile.studentInfo?.email?.trim() ?? "";
  const studentEmailNorm = studentEmailRaw.toLowerCase();
  const studentEmailMatchesAccount =
    Boolean(studentEmailRaw) && studentEmailNorm === accountEmailNorm;
  const studentEmailNotApplicableMessage =
    studentEmailRaw && !studentEmailMatchesAccount
      ? "Đây là email liên hệ trên hồ sơ học viên; trạng thái xác minh chỉ áp dụng cho email đăng nhập ở mục Tài khoản phía trên."
      : undefined;
  const studentEmailVerifiedDisplay = studentEmailMatchesAccount
    ? resolveEmailVerified(profile.emailVerified)
    : false;

  const accountDetails: DetailItem[] = [
    { label: "Họ tên hiển thị", value: displayName(profile) },
    {
      label: "Email",
      value: (
        <EmailVerificationInline
          email={profile.email ?? ""}
          verified={emailVerifiedDisplay}
          onRequestVerify={() => requestVerifyEmailMutation.mutate()}
          verifyPending={requestVerifyEmailMutation.isPending}
        />
      ),
    },
    { label: "Số điện thoại", value: profile.phone ?? "—" },
    {
      label: "Handle",
      value: profile.accountHandle ? `@${profile.accountHandle}` : "—",
    },
    { label: "Tỉnh / Thành phố", value: profile.province ?? "—" },
    { label: "Vai trò", value: getRoleLabel(profile.roleType) },
  ];

  const staffAchievementLink =
    profile.staffInfo?.personalAchievementLink?.trim() || null;

  const staffDetails: DetailItem[] | null = profile.staffInfo
    ? [
        {
          label: "Họ tên tài khoản",
          value: displayName(profile),
          hint: "Tên chính thức của nhân sự được đồng bộ từ hồ sơ tài khoản.",
        },
        { label: "Số CCCD", value: profile.staffInfo.cccdNumber ?? "—" },
        {
          label: "Ngày cấp CCCD",
          value: formatDate(profile.staffInfo.cccdIssuedDate),
        },
        {
          label: "Nơi cấp CCCD",
          value: profile.staffInfo.cccdIssuedPlace ?? "—",
        },
        { label: "Ngày sinh", value: formatDate(profile.staffInfo.birthDate) },
        { label: "Trường đại học", value: profile.staffInfo.university ?? "—" },
        { label: "Trường THPT", value: profile.staffInfo.highSchool ?? "—" },
        {
          label: "Chuyên ngành",
          value: profile.staffInfo.specialization?.trim() ? (
            <StaffSpecializationMarkdown
              text={profile.staffInfo.specialization}
              emptyFallback="—"
            />
          ) : (
            "—"
          ),
          fullWidth: true,
        },
        { label: "Số tài khoản", value: profile.staffInfo.bankAccount ?? "—" },
        {
          label: "Link QR ngân hàng",
          value: profile.staffInfo.bankQrLink ?? "—",
          fullWidth: true,
        },
        {
          label: "Minh chứng thành tích",
          value: staffAchievementLink ? (
            <a
              href={staffAchievementLink}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary"
              title={staffAchievementLink}
            >
              Xem liên kết
            </a>
          ) : (
            "—"
          ),
          fullWidth: true,
          hint: "URL http(s) tới tài liệu minh chứng (ví dụ Google Drive).",
        },
        {
          label: "Trạng thái",
          value: humanizeToken(profile.staffInfo.status) ?? "—",
        },
        {
          label: "Vai trò đảm nhiệm",
          value: profile.staffInfo.roles?.length
            ? profile.staffInfo.roles.map(humanizeToken).join(", ")
            : "—",
          fullWidth: true,
        },
      ]
    : null;

  const studentDetails: DetailItem[] | null = profile.studentInfo
    ? [
        { label: "Họ tên", value: profile.studentInfo.fullName ?? "—" },
        {
          label: "Email",
          value: (
            <EmailVerificationInline
              email={profile.studentInfo.email ?? ""}
              verified={studentEmailVerifiedDisplay}
              notApplicableMessage={studentEmailNotApplicableMessage}
              onRequestVerify={() => requestVerifyEmailMutation.mutate()}
              verifyPending={requestVerifyEmailMutation.isPending}
            />
          ),
        },
        { label: "Trường", value: profile.studentInfo.school ?? "—" },
        {
          label: "Tỉnh / Thành phố",
          value: profile.studentInfo.province ?? "—",
        },
        { label: "Năm sinh", value: profile.studentInfo.birthYear ?? "—" },
        {
          label: "Phụ huynh",
          value: profile.studentInfo.parentName ?? "—",
          hint: profile.studentInfo.parentPhone
            ? `Liên hệ: ${profile.studentInfo.parentPhone}`
            : "Chưa có số điện thoại phụ huynh.",
        },
        {
          label: "Email phụ huynh",
          value: profile.studentInfo.parentEmail ?? "—",
          hint: "Email phụ huynh nhận biên lai nạp ví SePay.",
        },
        {
          label: "Giới tính",
          value: getGenderLabel(profile.studentInfo.gender),
        },
        {
          label: "Trạng thái",
          value: humanizeToken(profile.studentInfo.status),
        },
        {
          label: "Mục tiêu học tập",
          value: profile.studentInfo.goal ?? "—",
          fullWidth: true,
        },
      ]
    : null;

  return (
    <div className="min-h-screen bg-bg-primary">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8 sm:py-10">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-border-default pb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
            Hồ sơ
          </h1>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Link
              href="/"
              className="text-text-muted transition-colors hover:text-text-primary"
            >
              ← Trang chủ
            </Link>
            <Tag label={getRoleLabel(profile.roleType)} tone="neutral" />
          </div>
        </header>

        {requiresProfileCompletion ? (
          <div className="mb-6 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-text-primary">
            Bạn chưa điền đầy đủ thông tin bắt buộc. Vui lòng cập nhật đầy đủ hồ
            sơ để tiếp tục sử dụng hệ thống
            {redirectedFrom ? ` (được chuyển từ ${redirectedFrom}).` : "."}
          </div>
        ) : null}

        {missingItems.length > 0 ? (
          <div className="mb-8 rounded-lg border border-warning/30 bg-bg-surface px-4 py-3 text-sm">
            <p className="font-medium text-text-primary">Gợi ý bổ sung</p>
            <ul className="mt-2 space-y-2 text-text-secondary">
              {missingItems.map((item) => (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    className="font-medium text-text-primary hover:underline"
                  >
                    {item.label}
                  </Link>
                  <span className="text-text-muted">, {item.detail}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <ProfileSectionNav items={sectionNavItems} />

        <div className="mt-2 lg:grid lg:grid-cols-[minmax(200px,280px)_minmax(0,1fr)] lg:gap-x-12 lg:gap-y-0">
          <aside className="mb-10 flex flex-col items-center lg:sticky lg:top-6 lg:mb-0 lg:self-start">
            <UserAvatar
              src={effectiveAvatarUrl}
              fallback={getInitials(profile)}
              alt={`Avatar của ${displayName(profile)}`}
              className="size-28 shrink-0 rounded-full border border-border-default bg-bg-surface object-cover sm:size-32"
              fallbackClassName="text-2xl font-semibold text-text-primary sm:text-3xl"
            />
            <p className="mt-4 text-center text-sm font-semibold text-text-primary">
              {displayName(profile)}
            </p>
            <p className="mt-1 max-w-[260px] text-center text-xs leading-relaxed text-text-secondary">
              {profileSubtitle}
            </p>
            <p className="mt-3 text-xs text-text-muted">
              Hoàn thiện:{" "}
              <span className="font-medium tabular-nums text-text-primary">
                {overallCompletion.percentage}%
              </span>
            </p>

            <div className="mt-6 flex w-full max-w-[260px] flex-col gap-3">
              <Link
                href="/auth/forgot-password"
                className={secondaryPillClassName}
              >
                Đặt lại mật khẩu
              </Link>

              <div className="w-full">
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
                        {uploadAvatarMutation.isPending
                          ? "Đang tải…"
                          : "Lưu ảnh"}
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
            </div>
          </aside>

          <div className="min-w-0 space-y-10 border-t border-border-default pt-10 lg:border-t-0 lg:pt-0">
            <ProfileSection
              id="profile-account"
              title="Thông tin chung"
              description="Tài khoản và liên hệ"
              completion={accountCompletion}
              isEditing={editUser}
              onEdit={() => setEditUser(true)}
            >
              {editUser ? (
                <form onSubmit={handleSubmitUser} className="space-y-6">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <TextField
                      id="user-first_name"
                      name="first_name"
                      label="Tên"
                      defaultValue={profile.first_name ?? ""}
                      placeholder="Ví dụ: An"
                      autoComplete="given-name"
                    />
                    <TextField
                      id="user-last_name"
                      name="last_name"
                      label="Họ và tên đệm"
                      defaultValue={profile.last_name ?? ""}
                      placeholder="Ví dụ: Nguyễn Văn"
                      autoComplete="family-name"
                    />
                    <TextField
                      id="user-email"
                      name="email"
                      label="Email"
                      type="email"
                      defaultValue={profile.email ?? ""}
                      placeholder="email@example.com"
                      autoComplete="email"
                    />
                    <TextField
                      id="user-phone"
                      name="phone"
                      label="Số điện thoại"
                      type="tel"
                      defaultValue={profile.phone ?? ""}
                      placeholder="0901234567"
                      autoComplete="tel"
                    />
                    <TextField
                      id="user-accountHandle"
                      name="accountHandle"
                      label="Account handle"
                      defaultValue={profile.accountHandle ?? ""}
                      placeholder="nguyenvana"
                      autoComplete="username"
                    />
                    <TextField
                      id="user-province"
                      name="province"
                      label="Tỉnh / Thành phố"
                      defaultValue={profile.province ?? ""}
                      placeholder="TP. HCM"
                      autoComplete="address-level1"
                    />
                  </div>

                  <FormActions
                    pending={updateProfileMutation.isPending}
                    onCancel={() => setEditUser(false)}
                  />
                </form>
              ) : (
                <DetailRows items={accountDetails} />
              )}
            </ProfileSection>

            {profile.staffInfo ? (
              <>
                <hr className="border-border-default" />
                <ProfileSection
                  id="profile-staff"
                  title="Nhân sự"
                  description="Học vấn, chuyên môn và thanh toán"
                  completion={staffCompletion!}
                  isEditing={editStaff}
                  onEdit={() => setEditStaff(true)}
                >
                  {editStaff ? (
                    <form onSubmit={handleSubmitStaff} className="space-y-6">
                      <div className="rounded-lg border border-border-default bg-bg-secondary/50 px-4 py-3 text-sm text-text-secondary">
                        Tên nhân sự hiện lấy từ mục{" "}
                        <span className="font-medium text-text-primary">
                          Thông tin chung
                        </span>
                        . Nếu cần đổi tên hiển thị, hãy cập nhật `Tên` và `Họ và
                        tên đệm` ở phần đó.
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <TextField
                          id="staff-cccd_number"
                          name="cccd_number"
                          label="Số CCCD (12 số)"
                          defaultValue={profile.staffInfo.cccdNumber ?? ""}
                        />
                        <TextField
                          id="staff-cccd_issued_date"
                          name="cccd_issued_date"
                          label="Ngày cấp CCCD"
                          type="date"
                          defaultValue={
                            profile.staffInfo.cccdIssuedDate
                              ? new Date(profile.staffInfo.cccdIssuedDate)
                                  .toISOString()
                                  .slice(0, 10)
                              : ""
                          }
                        />
                        <TextField
                          id="staff-cccd_issued_place"
                          name="cccd_issued_place"
                          label="Nơi cấp CCCD"
                          defaultValue={profile.staffInfo.cccdIssuedPlace ?? ""}
                        />
                        <TextField
                          id="staff-birth_date"
                          name="birth_date"
                          label="Ngày sinh"
                          type="date"
                          defaultValue={
                            profile.staffInfo.birthDate
                              ? new Date(profile.staffInfo.birthDate)
                                  .toISOString()
                                  .slice(0, 10)
                              : ""
                          }
                        />
                        <TextField
                          id="staff-university"
                          name="university"
                          label="Trường đại học"
                          defaultValue={profile.staffInfo.university ?? ""}
                        />
                        <TextField
                          id="staff-high_school"
                          name="high_school"
                          label="Trường THPT"
                          defaultValue={profile.staffInfo.highSchool ?? ""}
                        />
                        <div className="sm:col-span-2">
                          <TextAreaField
                            id="staff-specialization"
                            name="specialization"
                            label="Chuyên ngành"
                            defaultValue={
                              profile.staffInfo.specialization ?? ""
                            }
                            placeholder={
                              "Thành tích cá nhân:\n- Giải Nhì HSG Quốc gia môn Tin học\n- Huy chương Bạc Olympic..."
                            }
                          />
                        </div>
                        <TextField
                          id="staff-bank_account"
                          name="bank_account"
                          label="Số tài khoản ngân hàng"
                          defaultValue={profile.staffInfo.bankAccount ?? ""}
                        />
                        <div className="sm:col-span-2">
                          <TextField
                            id="staff-bank_qr_link"
                            name="bank_qr_link"
                            label="Link QR ngân hàng"
                            type="url"
                            defaultValue={profile.staffInfo.bankQrLink ?? ""}
                            placeholder="https://..."
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <TextField
                            id="staff-personal_achievement_link"
                            name="personal_achievement_link"
                            label="Minh chứng thành tích (tùy chọn)"
                            type="url"
                            defaultValue={
                              profile.staffInfo.personalAchievementLink ?? ""
                            }
                            placeholder="https://drive.google.com/…"
                          />
                          <p className="mt-1.5 text-xs text-text-muted">
                            Link Google Drive hoặc trang http(s) lưu minh chứng
                            thành tích. Để trống để xóa liên kết.
                          </p>
                        </div>
                      </div>

                      <FormActions
                        pending={updateStaffMutation.isPending}
                        onCancel={() => setEditStaff(false)}
                      />

                      <div className="space-y-3">
                        <CccdImageUploadFields
                          frontImage={staffFrontImage}
                          backImage={staffBackImage}
                          frontPath={profile.staffInfo.cccdFrontPath}
                          backPath={profile.staffInfo.cccdBackPath}
                          frontUrl={profile.staffInfo.cccdFrontUrl}
                          backUrl={profile.staffInfo.cccdBackUrl}
                          disabled={uploadStaffCccdMutation.isPending}
                          isUploading={uploadStaffCccdMutation.isPending}
                          onFrontImageChange={setStaffFrontImage}
                          onBackImageChange={setStaffBackImage}
                        />
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={handleSubmitStaffCccdImages}
                            disabled={uploadStaffCccdMutation.isPending}
                            className={primaryButtonClassName}
                          >
                            {uploadStaffCccdMutation.isPending
                              ? "Đang tải ảnh CCCD…"
                              : "Lưu ảnh CCCD"}
                          </button>
                          {staffFrontImage || staffBackImage ? (
                            <button
                              type="button"
                              onClick={() => {
                                setStaffFrontImage(null);
                                setStaffBackImage(null);
                              }}
                              disabled={uploadStaffCccdMutation.isPending}
                              className={ghostButtonClassName}
                            >
                              Huỷ chọn ảnh
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </form>
                  ) : (
                    <DetailRows items={staffDetails ?? []} />
                  )}
                </ProfileSection>
                <hr className="border-border-default" />
                <ProfileSection
                  id="profile-data-consent"
                  title="Dữ liệu cá nhân"
                  description="Điều khoản thu thập và xử lý dữ liệu"
                  completion={dataConsentCompletion!}
                  isEditing={false}
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
                  completion={studentCompletion!}
                  isEditing={editStudent}
                  onEdit={() => setEditStudent(true)}
                >
                  {editStudent ? (
                    <form onSubmit={handleSubmitStudent} className="space-y-6">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <TextField
                          id="student-full_name"
                          name="full_name"
                          label="Họ tên đầy đủ"
                          defaultValue={profile.studentInfo.fullName ?? ""}
                        />
                        <TextField
                          id="student-email"
                          name="email"
                          label="Email"
                          type="email"
                          defaultValue={profile.studentInfo.email ?? ""}
                        />
                        <TextField
                          id="student-school"
                          name="school"
                          label="Trường"
                          defaultValue={profile.studentInfo.school ?? ""}
                        />
                        <TextField
                          id="student-province"
                          name="province"
                          label="Tỉnh / Thành phố"
                          defaultValue={profile.studentInfo.province ?? ""}
                        />
                        <TextField
                          id="student-birth_year"
                          name="birth_year"
                          label="Năm sinh"
                          type="number"
                          min={1900}
                          max={new Date().getFullYear()}
                          defaultValue={profile.studentInfo.birthYear ?? ""}
                        />
                        <SelectField
                          id="student-gender"
                          name="gender"
                          label="Giới tính"
                          defaultValue={profile.studentInfo.gender ?? "male"}
                          options={[
                            { value: "male", label: "Nam" },
                            { value: "female", label: "Nữ" },
                          ]}
                        />
                        <TextField
                          id="student-parent_name"
                          name="parent_name"
                          label="Tên phụ huynh"
                          defaultValue={profile.studentInfo.parentName ?? ""}
                        />
                        <TextField
                          id="student-parent_phone"
                          name="parent_phone"
                          label="SĐT phụ huynh"
                          type="tel"
                          defaultValue={profile.studentInfo.parentPhone ?? ""}
                        />
                        <TextField
                          id="student-parent_email"
                          name="parent_email"
                          label="Email phụ huynh"
                          type="email"
                          defaultValue={profile.studentInfo.parentEmail ?? ""}
                          placeholder="parent@example.com"
                        />
                        <div className="sm:col-span-2">
                          <TextField
                            id="student-goal"
                            name="goal"
                            label="Mục tiêu học tập"
                            defaultValue={profile.studentInfo.goal ?? ""}
                            placeholder="Ví dụ: 7.5 IELTS hoặc đỗ chuyên Tin"
                          />
                        </div>
                      </div>

                      <FormActions
                        pending={updateStudentMutation.isPending}
                        onCancel={() => setEditStudent(false)}
                      />
                    </form>
                  ) : (
                    <DetailRows items={studentDetails ?? []} />
                  )}
                </ProfileSection>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
