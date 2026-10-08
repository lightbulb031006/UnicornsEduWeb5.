"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, Suspense } from "react";
import { toast } from "sonner";
import UserProfileEditor, {
  getRoleLabel,
} from "@/components/user-profile/UserProfileEditor";
import { profileFullQueryOptions } from "@/lib/profile-full-query";
import { OPEN_EMAIL_VERIFICATION_MODAL_EVENT } from "@/lib/email-verification-access";
import { getUserWorkspaceHref } from "@/lib/auth-redirect";
import {
  getProfileCompletion,
  type CompletionStats,
} from "@/lib/user-profile-completion";

type Tone = "primary" | "success" | "warning" | "neutral";

type SectionItem = {
  id: string;
  label: string;
  description: string;
  completion: CompletionStats;
  tone: Tone;
};

const surfaceCardClassName =
  "rounded-xl border border-border-default bg-bg-surface shadow-sm";
const ghostButtonClassName =
  "inline-flex items-center justify-center rounded-lg border border-border-default bg-bg-surface px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:border-border-focus hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus";
const primaryButtonClassName =
  "inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-60";

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

function UserProfilePageContent() {
  const searchParams = useSearchParams();
  const getSearchParam = searchParams.get.bind(searchParams);
  const requiresProfileCompletion = getSearchParam("profile_required") === "1";
  const redirectedFrom = getSearchParam("from");

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
  } = useQuery(profileFullQueryOptions);

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (isError || !profile) {
    const status = (error as { response?: { status?: number } })?.response
      ?.status;
    return <ErrorState status={status} />;
  }

  const completion = getProfileCompletion(profile);
  const hasStoredAvatar = Boolean(
    (profile as { avatarPath?: string | null }).avatarPath ??
      profile.avatarUrl,
  );
  const sectionItems: SectionItem[] = [
    {
      id: "profile-account",
      label: "Tài khoản",
      description: "Định danh, liên hệ và handle sử dụng trong hệ thống.",
      completion: completion.account,
      tone: "primary",
    },
    ...(profile.staffInfo
      ? [
          {
            id: "profile-staff",
            label: "Nhân sự",
            description: "Hồ sơ học vấn và thông tin thanh toán.",
            completion: completion.staff!,
            tone: "success" as const,
          },
          {
            id: "profile-data-consent",
            label: "Dữ liệu",
            description: "Xác nhận thu thập và xử lý dữ liệu cá nhân.",
            completion: completion.dataConsent!,
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
            completion: completion.student!,
            tone: "warning" as const,
          },
        ]
      : []),
  ];

  const missingItems = [
    !hasStoredAvatar && {
      label: "Thêm avatar cá nhân",
      href: "#profile-avatar",
      detail:
        "Avatar là bắt buộc để hoàn tất hồ sơ nhân sự và xuất hiện ở trang hồ sơ, navbar.",
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
      !profile.staffInfo.ethnicity && {
        label: "Điền dân tộc",
        href: "#profile-staff",
        detail: "Thông tin CCCD dạng text là bắt buộc để hoàn tất hồ sơ.",
      },
    profile.staffInfo &&
      !profile.staffInfo.gender && {
        label: "Chọn giới tính",
        href: "#profile-staff",
        detail: "Thông tin giới tính là bắt buộc để hoàn tất hồ sơ nhân sự.",
      },
    profile.staffInfo &&
      !profile.staffInfo.currentAddress && {
        label: "Điền địa chỉ hiện tại",
        href: "#profile-staff",
        detail: "Địa chỉ hiện tại là bắt buộc để hoàn tất hồ sơ nhân sự.",
      },
    profile.staffInfo &&
      !completion.staffDataConsentComplete && {
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

  const sectionNavItems = sectionItems.map((item) => ({
    ...item,
    href: `#${item.id}`,
  }));

  return (
    <div className="min-h-screen bg-bg-primary">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8 sm:py-10">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-border-default pb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
            Hồ sơ
          </h1>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Link
              href={getUserWorkspaceHref(profile)}
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

        <div className="mt-2">
          <UserProfileEditor profile={profile} />
        </div>
      </div>
    </div>
  );
}

export default function UserProfilePage() {
  // useSearchParams cần <Suspense>, nếu không Next.js sẽ bỏ static render cả route.
  return (
    <Suspense fallback={null}>
      <UserProfilePageContent />
    </Suspense>
  );
}
