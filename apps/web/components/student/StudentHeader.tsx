"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import * as authApi from "@/lib/apis/auth.api";
import { clearLogoutScopedQueries } from "@/lib/query-invalidation";
import { SidebarThemePicker } from "@/components/shell";
import UserAvatar from "@/components/ui/UserAvatar";
import { BrandLogoLockup } from "@/components/BrandLogoLockup";

export default function StudentHeader() {
  const { push } = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: fullProfile } = useQuery({
    queryKey: ["auth", "fullProfile"],
    queryFn: authApi.getFullProfile,
    staleTime: 60 * 1000,
  });

  const logoutMutation = useMutation({
    mutationFn: () => authApi.studentLogout(),
    onSuccess: async () => {
      clearLogoutScopedQueries(queryClient);
      toast.success("Đã đăng xuất");
      push("/auth/login");
    },
    onError: () => {
      toast.error("Đăng xuất thất bại");
    },
  });

  const avatarSrc = fullProfile?.avatarUrl || undefined;
  const displayName =
    fullProfile?.studentInfo?.fullName ||
    fullProfile?.accountHandle ||
    user?.accountHandle ||
    "Học sinh";
  const avatarInitial = displayName.charAt(0).toUpperCase();

  return (
    <header className="sticky top-0 z-40 w-full shrink-0 border-b border-border-default bg-bg-surface/90 backdrop-blur-md transition-colors">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Left: Brand Logo */}
        <div className="flex items-center gap-6">
          <Link href="/student" className="flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus rounded-lg">
            <BrandLogoLockup variant="navbar" showWordmark={true} />
          </Link>
        </div>

        {/* Right: Actions, Theme, User */}
        <div className="flex items-center gap-2 sm:gap-3">
          <SidebarThemePicker compact onMobileClose={() => {}} />

          <div className="h-6 w-px bg-border-default hidden sm:block" aria-hidden="true" />

          {/* User profile link & avatar */}
          <Link
            href="/user-profile"
            prefetch={false}
            className="flex items-center gap-2.5 rounded-full p-1 text-sm font-medium text-text-primary transition-colors hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          >
            <UserAvatar
              src={avatarSrc}
              fallback={avatarInitial}
              alt={`Avatar của ${displayName}`}
              className="size-8 sm:size-9 ring-1 ring-border-default"
              fallbackClassName="text-xs font-semibold"
            />
            <span className="hidden sm:inline max-w-[120px] truncate text-xs font-semibold text-text-primary">
              {displayName}
            </span>
          </Link>

          {/* Logout button */}
          <button
            type="button"
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
            className="flex size-9 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-danger hover:text-text-inverse focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            aria-label="Đăng xuất"
            title="Đăng xuất"
          >
            <svg className="size-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}
