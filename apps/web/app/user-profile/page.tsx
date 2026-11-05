"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { toast } from "sonner";
import UserProfileEditor from "@/components/user-profile/UserProfileEditor";
import { useAuth } from "@/context/AuthContext";
import { useRefreshAuthSession } from "@/hooks/use-refresh-auth-session";
import { profileFullQueryOptions } from "@/lib/profile-full-query";
import { openEmailVerificationModal } from "@/lib/email-verification-access";
import { getUserWorkspaceHref } from "@/lib/auth-redirect";
import {
  getProfileFormValues,
  isProfileBackBlockedByGate,
  resolveProfileBackHref,
  validateProfileForm,
} from "@/lib/profile-form";

type Tone = "primary" | "success" | "warning" | "neutral";

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
                onClick={() => openEmailVerificationModal({ kind: "send" })}
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const refreshAuthSession = useRefreshAuthSession();
  const requiresProfileCompletion =
    searchParams.get("profile_required") === "1";
  const redirectedFrom = searchParams.get("from");

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

  const backHref = resolveProfileBackHref(
    redirectedFrom,
    getUserWorkspaceHref(profile),
  );
  // Theo bản đã lưu: còn thiếu thì gate vẫn chặn nhân sự khi bấm Quay lại.
  const blockedByGate =
    validateProfileForm(profile, getProfileFormValues(profile)).missingCount >
    0;
  const backBlocked = isProfileBackBlockedByGate(user, backHref);

  return (
    <div className="min-h-screen bg-bg-primary">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8 sm:py-10">
        <header className="mb-8 border-b border-border-default pb-6">
          <div className="flex items-center gap-4">
            <Link
              href={backHref}
              onClick={async (event) => {
                if (!backBlocked) return;
                // Gate sẽ đẩy ngược về đây: lấy session mới, còn thiếu thì chặn tại chỗ.
                event.preventDefault();
                const nextUser = await refreshAuthSession();
                if (nextUser && !isProfileBackBlockedByGate(nextUser, backHref)) {
                  router.push(backHref);
                  return;
                }
                toast.error("Cần hoàn thiện hồ sơ trước khi quay lại.");
              }}
              className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg border border-border-default bg-bg-surface px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:border-border-focus hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            >
              <svg
                className="size-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              Quay lại
            </Link>
            <h1 className="text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
              Hồ sơ
            </h1>
          </div>
          {blockedByGate ? (
            <p className="mt-2 text-xs text-text-muted">
              Cần hoàn thiện hồ sơ để tiếp tục
            </p>
          ) : null}
        </header>

        <UserProfileEditor
          profile={profile}
          validateOnMount={requiresProfileCompletion}
          // replace: bấm Back ở workspace không quay lại trang hồ sơ vừa lưu.
          onSaveComplete={() => router.replace(backHref)}
        />
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
