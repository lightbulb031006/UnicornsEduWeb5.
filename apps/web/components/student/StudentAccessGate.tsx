"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Role } from "@/dtos/Auth.dto";
import { useAuth } from "@/context/AuthContext";
import {
  isRestrictedByEmailVerification,
  OPEN_EMAIL_VERIFICATION_MODAL_EVENT,
} from "@/lib/email-verification-access";

export default function StudentAccessGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const { replace } = useRouter();
  const { user, isAuthReady } = useAuth();
  const restrictedByEmailVerification = isRestrictedByEmailVerification(user);

  const hasStudentProfile = Boolean(user.hasStudentProfile);
  const isAllowed = Boolean(
    user.roleType === Role.student ||
      user.effectiveRoleTypes?.includes(Role.student) ||
      user.access?.student?.canAccess ||
      hasStudentProfile,
  );
  const hasStudentWorkspaceHint =
    user.roleType === "student" ||
    hasStudentProfile ||
    Boolean(user.effectiveRoleTypes?.includes(Role.student));

  useEffect(() => {
    if (isAuthReady && restrictedByEmailVerification) {
      window.dispatchEvent(new Event(OPEN_EMAIL_VERIFICATION_MODAL_EVENT));
      replace("/");
      return;
    }

    if (isAuthReady && !isAllowed) {
      replace(hasStudentWorkspaceHint ? "/user-profile" : "/");
    }
  }, [
    hasStudentWorkspaceHint,
    isAllowed,
    isAuthReady,
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

  if (!isAllowed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-primary px-4">
        <div className="w-full max-w-xl rounded-[2rem] border border-warning/30 bg-warning/10 p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-warning">
            Student View Locked
          </p>
          <h1 className="mt-3 text-2xl font-semibold text-text-primary">
            Tài khoản này chưa mở được trang học sinh tự phục vụ.
          </h1>
          <p className="mt-3 text-sm text-text-secondary">
            Route `/student` chỉ mở khi tài khoản đang đăng nhập được liên kết
            đúng với hồ sơ học sinh của chính mình.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/"
              className="rounded-xl border border-border-default bg-bg-surface px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            >
              Về trang chủ
            </Link>
            <Link
              href="/user-profile"
              className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
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
