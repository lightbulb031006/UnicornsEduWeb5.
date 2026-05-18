"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  canAccessAdminShellRoute,
  resolveAdminShellAccess,
  resolveAdminShellFallbackHref,
  isStrictAdminRoute,
} from "@/lib/admin-shell-access";
import {
  isRestrictedByEmailVerification,
  OPEN_EMAIL_VERIFICATION_MODAL_EVENT,
} from "@/lib/email-verification-access";

export default function AdminAccessGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { replace } = useRouter();
  const { user, isAuthReady } = useAuth();

  const access = resolveAdminShellAccess(user);
  const restrictedByEmailVerification = isRestrictedByEmailVerification(user);
  const restrictedByDataConsent = Boolean(
    user.requiresStaffDataConsent &&
    (user.access?.staff?.canAccess ?? user.hasStaffProfile),
  );
  const strictAdminRoute = isStrictAdminRoute(pathname);
  const isAllowed = canAccessAdminShellRoute(access, pathname);
  const fallbackHref = resolveAdminShellFallbackHref(access, pathname);

  useEffect(() => {
    if (isAuthReady && restrictedByEmailVerification) {
      window.dispatchEvent(new Event(OPEN_EMAIL_VERIFICATION_MODAL_EVENT));
      replace("/");
      return;
    }

    if (isAuthReady && restrictedByDataConsent) {
      replace(`/staff/data-consent?from=${encodeURIComponent(pathname)}`);
      return;
    }

    if (isAuthReady && !isAllowed) {
      replace(fallbackHref);
    }
  }, [
    fallbackHref,
    isAllowed,
    isAuthReady,
    pathname,
    restrictedByDataConsent,
    restrictedByEmailVerification,
    replace,
  ]);

  if (!isAuthReady) {
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-bg-primary px-4"
        aria-live="polite"
      >
        <div className="w-full max-w-xl rounded-[2rem] border border-border-default bg-bg-surface p-6 shadow-sm">
          <div className="h-3 w-32 animate-pulse rounded-full bg-bg-tertiary" />
          <div className="mt-4 h-8 w-56 animate-pulse rounded-xl bg-bg-tertiary" />
          <div className="mt-3 space-y-2">
            <div className="h-4 w-full animate-pulse rounded bg-bg-tertiary" />
            <div className="h-4 w-5/6 animate-pulse rounded bg-bg-tertiary" />
          </div>
        </div>
      </div>
    );
  }

  if (restrictedByEmailVerification) {
    return null;
  }

  if (restrictedByDataConsent) {
    return null;
  }

  if (!isAllowed) {
    const title = strictAdminRoute
      ? "Route này chỉ mở cho admin."
      : access.isLessonPlanHead
        ? "Role Trưởng giáo án chỉ mở được module Giáo Án."
        : "Tài khoản này không mở được khu quản trị.";
    const description = strictAdminRoute
      ? "Trang quản lý notification là nơi phát thông báo toàn hệ thống. Assistant và các staff role khác chỉ dùng `/staff/notification` để xem feed."
      : access.isLessonPlanHead
        ? "Bạn có toàn quyền trên phần giáo án, nhưng các module admin khác vẫn bị khóa."
        : "Route này hiện chỉ mở cho admin, hoặc các staff role được cấp quyền riêng trên từng module admin.";

    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-primary px-4">
        <div className="w-full max-w-xl rounded-[2rem] border border-warning/30 bg-warning/10 p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-warning">
            Admin Access Locked
          </p>
          <h1 className="mt-3 text-2xl font-semibold text-text-primary">
            {title}
          </h1>
          <p className="mt-3 text-sm text-text-secondary">{description}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href={fallbackHref}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            >
              {strictAdminRoute
                ? "Đi tới feed staff"
                : access.isLessonPlanHead
                  ? "Đi tới Giáo Án"
                  : "Về trang chủ"}
            </Link>
            <Link
              href="/user-profile"
              className="rounded-xl border border-border-default bg-bg-surface px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            >
              Xem hồ sơ
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
