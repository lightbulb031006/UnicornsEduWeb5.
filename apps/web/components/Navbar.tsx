"use client";

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { Role } from "@/dtos/Auth.dto";
import { logout } from "@/lib/apis/auth.api";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import UserAvatar from "@/components/ui/UserAvatar";
import { BrandLogoLockup } from "@/components/BrandLogoLockup";
import { SidebarThemePicker } from "@/components/shell";
import {
  isRestrictedByEmailVerification,
  openEmailVerificationModal,
} from "@/lib/email-verification-access";
import { clearLogoutScopedQueries } from "@/lib/query-invalidation";

const HOME_MENU = [
  { id: "intro", label: "Giới thiệu" },
  { id: "news", label: "Khóa học" },
  { id: "docs", label: "Cuộc thi" },
  { id: "policy", label: "Liên hệ" },
] as const;

const links = {
  'admin': '/admin',
  'guest': '/',
  'student': '/student',
  'staff': '/staff',
}

function scrollToSection(id: string) {
  const el = document.getElementById(id);
  el?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function Navbar({ showHomeMenu = true }: { showHomeMenu?: boolean }) {
  const { user, setUser } = useAuth();
  const { push } = useRouter();
  const queryClient = useQueryClient();

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: async () => {
      setUser({
        id: "",
        accountHandle: "",
        roleType: Role.guest,
        requiresPasswordSetup: false,
        avatarUrl: null,
      });
      await clearLogoutScopedQueries(queryClient);
      toast.success("Đăng xuất thành công");
      push("/");
    },
  });

  const avatarFallback =
    user.accountHandle?.slice(0, 1).toUpperCase() ?? "?";
  const restrictedByEmailVerification = isRestrictedByEmailVerification(user);

  return (
    <header className="sticky top-0 z-50 border-b border-border-default bg-bg-primary/90 backdrop-blur transition-colors duration-300 supports-[backdrop-filter]:bg-bg-primary/75">
      <div className="mx-auto flex h-[4.5rem] max-w-6xl items-center justify-between gap-2 px-3 sm:h-20 sm:px-6">
        <button
          type="button"
          onClick={() => scrollToSection("hero")}
          className="group flex min-w-0 items-center rounded-xl px-2 py-1.5 -ml-2 transition-colors duration-200 hover:bg-bg-secondary/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ue-border-focus)]"
          aria-label="Về đầu trang"
        >
          <BrandLogoLockup
            variant="navbar"
            className="transition-opacity duration-200 group-hover:opacity-[0.97]"
          />
        </button>

        {showHomeMenu ? (
          <nav className="hidden gap-1 sm:flex" aria-label="Trang chủ">
            {HOME_MENU.map((item, index) => (
              <button
                key={item.id}
                type="button"
                onClick={() => scrollToSection(`section-${item.id}`)}
                className="motion-fade-up rounded-md px-3 py-2 text-sm font-medium text-text-secondary transition-colors duration-200 hover:cursor-pointer hover:bg-bg-tertiary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ue-border-focus)]"
                style={{ animationDelay: `${index * 40}ms` }}
              >
                {item.label}
              </button>
            ))}
          </nav>
        ) : (
          <div className="hidden sm:block" aria-hidden />
        )}

        <div className="flex items-center gap-2">
          <SidebarThemePicker compact />
          {user.id ? (
            <>
              <Link
                href={restrictedByEmailVerification ? "#" : "/user-profile"}
                onClick={(event) => {
                  if (!restrictedByEmailVerification) {
                    return;
                  }
                  event.preventDefault();
                  openEmailVerificationModal({ kind: "status" });
                }}
                className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-bg-tertiary font-semibold text-text-primary ring-2 ring-border-default transition hover:bg-primary hover:text-text-inverse hover:ring-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ue-border-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary sm:size-10"
              >
                <UserAvatar
                  src={user.avatarUrl}
                  fallback={avatarFallback}
                  alt={`Avatar của ${user.accountHandle || "người dùng"}`}
                  className="size-full"
                  fallbackClassName="text-sm"
                />
              </Link>

              <Link
                href={
                  restrictedByEmailVerification
                    ? "#"
                    : links[user.roleType as keyof typeof links] ?? "/"
                }
                onClick={(event) => {
                  if (!restrictedByEmailVerification) {
                    return;
                  }
                  event.preventDefault();
                  openEmailVerificationModal({ kind: "status" });
                }}
                className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-bg-tertiary font-semibold text-text-primary ring-2 ring-border-default transition hover:bg-primary hover:text-text-inverse hover:ring-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ue-border-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary"
                aria-label="Về trang chính theo vai trò"
                title="Trang chính"
              >
                <svg
                  className="size-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                  />
                </svg>
              </Link>

              <button
                type="button"
                onClick={() => {
                  logoutMutation.mutate();
                }}
                className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-bg-tertiary font-semibold text-text-primary ring-2 ring-border-default transition-colors duration-200 hover:cursor-pointer hover:bg-danger hover:text-text-inverse hover:ring-danger focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ue-border-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary"
              >
                <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </>
          ) : (
            <Link
              href="/auth/login"
              className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-text-inverse transition-colors duration-200 hover:bg-[var(--ue-primary-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ue-border-focus)]"
            >
              Đăng nhập
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
