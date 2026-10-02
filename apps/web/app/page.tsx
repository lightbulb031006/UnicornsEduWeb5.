"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { resolvePostLoginRedirect } from "@/lib/auth-redirect";
import { BrandLogoLockup } from "@/components/BrandLogoLockup";

export default function RootHomePage() {
  const { user, isAuthReady } = useAuth();
  const { replace } = useRouter();

  useEffect(() => {
    if (!isAuthReady) return;

    if (!user?.id || user.roleType === "guest") {
      replace("/auth/login");
      return;
    }

    const destination = resolvePostLoginRedirect(user);
    const safeDestination =
      destination === "/" || destination === "/user-profile"
        ? user.roleType === "student" ||
          user.access?.student?.canAccess ||
          user.hasStudentProfile
          ? "/student"
          : user.roleType === "staff" ||
            user.access?.staff?.canAccess ||
            user.hasStaffProfile
            ? "/staff"
            : user.roleType === "admin" ||
              user.access?.admin?.tier === "full"
              ? "/admin"
              : "/auth/login"
        : destination;

    replace(safeDestination);
  }, [isAuthReady, replace, user]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-bg-primary p-4">
      <div className="flex flex-col items-center gap-4 text-center">
        <BrandLogoLockup variant="auth" />
        <div className="flex items-center gap-2 text-xs font-medium text-text-muted mt-2">
          <div className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span>Đang chuyển hướng tới không gian làm việc...</span>
        </div>
      </div>
    </div>
  );
}
