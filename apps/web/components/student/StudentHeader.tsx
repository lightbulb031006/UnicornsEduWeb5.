"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import * as authApi from "@/lib/apis/auth.api";
import { clearLogoutScopedQueries } from "@/lib/query-invalidation";
import { AUTH_FULL_PROFILE_QUERY_KEY } from "@/lib/profile-full-query";
import { SidebarThemePicker } from "@/components/shell";
import UserAvatar from "@/components/ui/UserAvatar";
import { UserProfileDialogTrigger } from "@/components/user-profile/UserProfileDialog";
import { BrandLogoLockup } from "@/components/BrandLogoLockup";
import { cn } from "@/lib/utils";
import { UserRound, WalletCards, type LucideIcon } from "lucide-react";

export default function StudentHeader() {
  const { push } = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: fullProfile } = useQuery({
    queryKey: AUTH_FULL_PROFILE_QUERY_KEY,
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
    // Fixed, không chiếm chỗ trong layout: <main> cuộn bên dưới và tự chừa `pt` bằng chiều
    // cao navbar (4.25rem mobile = pt-3 + h-14, 5rem từ sm = pt-4 + h-16). Đổi chiều cao ở đây
    // thì sửa cùng padding/scroll-padding của <main> trong app/student/layout.tsx.
    // Lớp ngoài trải full width nên tắt pointer-events, chỉ thanh nổi nhận click.
    <header className="pointer-events-none fixed inset-x-0 top-0 z-40 px-3 pt-3 sm:px-6 sm:pt-4 lg:px-8">
      <div className="pointer-events-auto mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 rounded-2xl border border-border-default bg-bg-surface/85 px-3 shadow-lg backdrop-blur-md transition-colors sm:h-16 sm:px-4">
        <Link
          href="/student"
          className="flex shrink-0 items-center gap-2 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
        >
          <BrandLogoLockup variant="navbar" showWordmark={true} wordmarkClassName="hidden md:inline" />
        </Link>

        <div className="flex min-w-0 items-center gap-1 sm:gap-2">
          <nav aria-label="Điều hướng học sinh" className="flex items-center gap-1 sm:gap-2">
            <StudentNavAction href="/user-profile" label="Hồ sơ & Lịch thi" icon={UserRound} />
            <StudentNavAction href="/student/tuition" label="Nạp ví" icon={WalletCards} primary />
          </nav>

          <div className="mx-1 hidden h-6 w-px bg-border-default sm:block" aria-hidden="true" />

          <SidebarThemePicker compact onMobileClose={() => {}} />

          <UserProfileDialogTrigger
            ariaLabel="Mở hồ sơ của tôi"
            title="Hồ sơ của tôi"
            className="flex items-center gap-2.5 rounded-full p-1 text-sm font-medium text-text-primary transition-colors hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          >
            <UserAvatar
              src={avatarSrc}
              fallback={avatarInitial}
              alt={`Avatar của ${displayName}`}
              className="size-8 ring-1 ring-border-default sm:size-9"
              fallbackClassName="text-xs font-semibold"
            />
            <span className="hidden max-w-[120px] truncate text-xs font-semibold text-text-primary sm:inline">
              {displayName}
            </span>
          </UserProfileDialogTrigger>

          <button
            type="button"
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
            className="flex size-9 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-danger hover:text-text-inverse focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
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

/** Nút điều hướng trên navbar: dưới `lg` chỉ icon (kèm aria-label), từ `lg` hiện chữ. */
function StudentNavAction({
  href,
  label,
  icon: Icon,
  primary = false,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center gap-2 rounded-xl text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus lg:size-auto lg:px-3 lg:py-2",
        primary
          ? "bg-primary text-text-inverse hover:bg-primary-hover"
          : "border border-border-default bg-bg-secondary/60 text-text-primary hover:bg-bg-secondary",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="hidden whitespace-nowrap lg:inline">{label}</span>
    </Link>
  );
}
