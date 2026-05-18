"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useRef, useState, useEffect, useSyncExternalStore } from "react";
import { animate, stagger } from "animejs";
import * as authApi from "@/lib/apis/auth.api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { Role } from "@/dtos/Auth.dto";
import { SidebarNotificationTray, SidebarThemePicker } from "@/components/shell";
import {
  ACCOUNTANT_VISIBLE_HREFS,
  resolveAdminShellAccess,
} from "@/lib/admin-shell-access";
import { clearLogoutScopedQueries } from "@/lib/query-invalidation";
import UserAvatar from "@/components/ui/UserAvatar";
import { BrandLogoLockup } from "@/components/BrandLogoLockup";

const MENU_ITEMS: {
  href: string;
  label: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
}[] = [
  { href: "/admin/dashboard", label: "Dashboard", icon: <IconDashboard /> },
  {
    href: "/admin/notification",
    label: "Thông báo",
    icon: <IconNotifications />,
    adminOnly: true,
  },
  { href: "/admin/users", label: "User", icon: <IconUsers /> },
  { href: "/admin/staffs", label: "Nhân sự", icon: <IconStaff /> },
  { href: "/admin/classes", label: "Lớp học", icon: <IconClasses /> },
  { href: "/admin/students", label: "Học sinh", icon: <IconStudents /> },
  { href: "/admin/costs", label: "Chi phí", icon: <IconCosts /> },
  { href: "/admin/lesson-plans", label: "Giáo Án", icon: <IconLessonPlans /> },
  { href: "/admin/calendar", label: "Lịch", icon: <IconCalendar /> },
  { href: "/admin/deductions", label: "Khấu trừ", icon: <IconDeductions /> },
  { href: "/admin/notes-subject", label: "Ghi chú môn học", icon: <IconNotesSubject /> },
  {
    href: "/admin/wallet-direct-topup-requests",
    label: "Duyệt nạp ví",
    icon: <IconWalletApproval />,
    adminOnly: true,
  },
  { href: "/admin/history", label: "Lịch sử", icon: <IconHistory /> },
];

const SIDEBAR_WIDTH_EXPANDED = 224;
const SIDEBAR_WIDTH_COLLAPSED = 60;
const SIDEBAR_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === "undefined") return () => undefined;
      const mediaQuery = window.matchMedia(query);
      mediaQuery.addEventListener("change", onStoreChange);
      return () => mediaQuery.removeEventListener("change", onStoreChange);
    },
    () => (typeof window !== "undefined" ? window.matchMedia(query).matches : false),
    () => false,
  );
}

function IconDashboard() {
  return (
    <svg className="size-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
    </svg>
  );
}
function IconHome() {
  return (
    <svg className="size-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  );
}
function IconUsers() {
  return (
    <svg className="size-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  );
}
function IconNotifications() {
  return (
    <svg className="size-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V4a2 2 0 10-4 0v1.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
      />
    </svg>
  );
}
function IconStaff() {
  return (
    <svg className="size-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  );
}
function IconClasses() {
  return (
    <svg className="size-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  );
}
function IconNotesSubject() {
  return (
    <svg className="size-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}
function IconStudents() {
  return (
    <svg className="size-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
    </svg>
  );
}
function IconWalletApproval() {
  return (
    <svg className="size-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 7h18v10H3V7zm3 3h4m4 0h4M7 17v2m10-2v2m-5-6.5l1.5 1.5L17 10"
      />
    </svg>
  );
}
function IconCosts() {
  return (
    <svg className="size-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
function IconDeductions() {
  return (
    <svg className="size-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 14h6m-6 4h3m6-10V6a2 2 0 00-2-2H8a2 2 0 00-2 2v2m12 0H6m12 0a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2v-8a2 2 0 012-2"
      />
    </svg>
  );
}
function IconLessonPlans() {
  return (
    <svg className="size-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}
function IconHistory() {
  return (
    <svg className="size-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
function IconCalendar() {
  return (
    <svg className="size-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    </svg>
  );
}

export default function AdminSidebar() {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { push } = useRouter();
  const asideRef = useRef<HTMLElement>(null);
  const navListRef = useRef<HTMLUListElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const isMobile = useMediaQuery("(max-width: 767px)");
  const prefersReducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const { setUser } = useAuth();
  const {
    data: fullProfile,
    isError: isProfileError,
    isLoading: isProfileLoading,
  } = useQuery({
    queryKey: ["auth", "full-profile"],
    queryFn: authApi.getFullProfile,
    retry: false,
    staleTime: 60_000,
  });
  const { isAdmin, isAssistant, isAccountant, isLessonPlanHead, staffId } =
    resolveAdminShellAccess(fullProfile);
  const assistantDashboardHref =
    isAssistant && staffId
      ? `/admin/staffs/${encodeURIComponent(staffId)}`
      : "/admin/dashboard";

  const menuItems = isProfileLoading || isProfileError || !fullProfile
    ? []
    : isAssistant || isAdmin
      ? MENU_ITEMS.filter((item) => isAdmin || !item.adminOnly)
      : isAccountant
        ? MENU_ITEMS.filter((item) => ACCOUNTANT_VISIBLE_HREFS.has(item.href))
        : isLessonPlanHead
          ? MENU_ITEMS.filter((item) => item.href === "/admin/lesson-plans")
          : [];

  useEffect(() => {
    if (!isMobile) {
      document.body.style.overflow = "";
      return;
    }
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMobile, mobileOpen]);

  useEffect(() => {
    if (!navListRef.current || prefersReducedMotion) return;
    const items = navListRef.current.querySelectorAll(".sidebar-item");
    animate(items, {
      opacity: [0, 1],
      translateX: [-12, 0],
      delay: stagger(40, { start: 100 }),
      duration: 380,
      ease: "easeOutQuad",
    });
  }, [prefersReducedMotion]);

  const toggleCollapse = () => {
    setCollapsed((c) => !c);
  };

  const handleMobileClose = () => {
    if (isMobile) setMobileOpen(false);
  };

  const sidebarWidth = isMobile
    ? SIDEBAR_WIDTH_EXPANDED
    : collapsed
      ? SIDEBAR_WIDTH_COLLAPSED
      : SIDEBAR_WIDTH_EXPANDED;
  const compact = collapsed && !isMobile;
  const mobileTransform = isMobile
    ? mobileOpen
      ? "translateX(0)"
      : "translateX(-100%)"
    : "translateX(0)";
  const avatarFallback =
    fullProfile?.accountHandle?.slice(0, 1).toUpperCase() ?? "?";
  const avatarSrc = fullProfile?.avatarUrl ?? null;

  const logoutMutation = useMutation({
    mutationFn: authApi.logout,
    onSuccess: async () => {
      await clearLogoutScopedQueries(queryClient);
      setUser({
        id: "",
        accountHandle: "",
        roleType: Role.guest,
        requiresPasswordSetup: false,
        avatarUrl: null,
      });
      push("/");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleLogout = async () => {
    await logoutMutation.mutateAsync();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed left-3 top-3 z-30 flex size-10 items-center justify-center rounded-md border border-border-default bg-bg-surface text-text-primary shadow-sm transition-transform duration-200 hover:scale-105 active:scale-95 md:hidden"
        aria-label="Mở menu"
      >
        <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <button
        type="button"
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-300 ${mobileOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"} md:hidden`}
        onClick={() => setMobileOpen(false)}
        aria-label="Đóng menu"
      />
      <aside
        ref={asideRef}
        style={{
          width: sidebarWidth,
          transform: mobileTransform,
          transition: prefersReducedMotion
            ? "none"
            : `width 0.3s ${SIDEBAR_EASE}, transform 0.34s ${SIDEBAR_EASE}`,
        }}
        className="fixed inset-y-0 left-0 z-50 flex h-dvh shrink-0 flex-col overflow-hidden border-r border-border-default bg-bg-secondary text-text-secondary md:sticky md:top-0 md:z-auto md:h-screen"
        aria-label="Menu admin"
      >
        <div className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-border-default px-2.5 py-1.5 sm:px-3">
          <div
            className={`flex min-w-0 flex-1 items-center overflow-hidden transition-[justify-content] duration-300 ease-out ${compact ? "justify-center" : "justify-start"}`}
          >
            <BrandLogoLockup
              variant="navbar"
              showWordmark={!compact}
              dense={compact}
              className="w-full min-w-0 transition-all duration-300 ease-out"
              wordmarkClassName="truncate"
            />
          </div>
          <button
            type="button"
            onClick={isMobile ? () => setMobileOpen(false) : toggleCollapse}
            className="flex size-9 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors duration-200 hover:bg-bg-tertiary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-secondary"
            aria-label={isMobile ? "Đóng menu" : collapsed ? "Mở rộng menu" : "Thu gọn menu"}
          >
            <svg
              className={`size-5 transition-transform duration-300 ease-out ${collapsed && !isMobile ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden
            >
              {isMobile ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              )}
            </svg>
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2 overscroll-contain">
          <ul ref={navListRef} className="space-y-0.5 px-2">
            {menuItems.length === 0 && (
              <li className="px-1.5 py-2" aria-hidden>
                <div className="h-10 animate-pulse rounded-xl bg-bg-tertiary" />
              </li>
            )}
            {menuItems.map((item) => {
              const resolvedHref =
                item.href === "/admin/dashboard"
                  ? assistantDashboardHref
                  : item.href;
              const isAssistantDashboardTarget =
                isAssistant &&
                item.href === "/admin/dashboard" &&
                Boolean(fullProfile?.staffInfo?.id);
              const isActive =
                item.href === "/admin/dashboard"
                  ? pathname === "/admin" ||
                    pathname === "/admin/dashboard" ||
                    (isAssistantDashboardTarget && pathname === assistantDashboardHref)
                  : item.href === "/admin/staffs" &&
                      isAssistantDashboardTarget &&
                      pathname === assistantDashboardHref
                    ? false
                    : pathname.startsWith(item.href);
              return (
                <li key={`${item.href}-${resolvedHref}`} className="sidebar-item">
                  <Link
                    href={resolvedHref}
                    prefetch={false}
                    onClick={handleMobileClose}
                    className={`flex items-center rounded-lg py-2.5 text-sm font-medium transition-[gap,padding,background-color,color] duration-300 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-secondary ${compact ? "gap-0 px-2.5" : "gap-3 px-3"} ${isActive
                      ? "bg-primary text-text-inverse"
                      : "hover:bg-bg-tertiary hover:text-text-primary"
                      }`}
                    aria-label={collapsed && !isMobile ? item.label : undefined}
                    title={collapsed && !isMobile ? item.label : undefined}
                  >
                    <span className="flex size-5 shrink-0 items-center justify-center [&>svg]:size-5">
                      {item.icon}
                    </span>
                    <span
                      className={`truncate whitespace-nowrap transition-[max-width,opacity] duration-300 ease-out ${compact ? "max-w-0 opacity-0" : "max-w-[140px] opacity-100"}`}
                    >
                      {item.label}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="shrink-0 border-t border-border-default p-2">
          <Link
            href="/"
            prefetch={false}
            onClick={handleMobileClose}
            className={`sidebar-item flex items-center rounded-lg py-2.5 text-sm font-medium transition-[gap,padding,background-color,color] duration-300 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-secondary ${compact ? "gap-0 px-2.5" : "gap-3 px-3"} ${pathname === "/"
              ? "bg-primary text-text-inverse"
              : "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
              }`}
            aria-label={collapsed && !isMobile ? "Trang chủ" : undefined}
            title={collapsed && !isMobile ? "Trang chủ" : undefined}
          >
            <span className="flex size-5 shrink-0 items-center justify-center [&>svg]:size-5">
              <IconHome />
            </span>
            <span
              className={`truncate whitespace-nowrap transition-[max-width,opacity] duration-300 ease-out ${compact ? "max-w-0 opacity-0" : "max-w-[140px] opacity-100"}`}
            >
              Trang chủ
            </span>
          </Link>
          <div className={`mt-2 flex items-center gap-2 ${compact ? "flex-wrap justify-center" : ""}`}>
            <Link
              href="/user-profile"
              prefetch={false}
              onClick={handleMobileClose}
              className="sidebar-item flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-bg-tertiary text-text-primary transition-colors duration-200 hover:bg-primary hover:text-text-inverse focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-secondary"
              aria-label="Thông tin cá nhân"
              title="Thông tin cá nhân"
            >
              <UserAvatar
                src={avatarSrc}
                fallback={avatarFallback}
                alt={`Avatar của ${fullProfile?.accountHandle || "người dùng"}`}
                className="size-full"
                fallbackClassName="text-sm font-semibold"
              />
            </Link>

            <SidebarThemePicker compact={compact} onMobileClose={handleMobileClose} />

            <SidebarNotificationTray compact={compact} />

            <div className={`min-w-0 flex-1 ${compact ? "hidden" : ""}`} aria-hidden />

            <button
              type="button"
              onClick={handleLogout}
              className="sidebar-item flex size-10 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors duration-200 hover:bg-red-500 hover:ring-red-800 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-secondary"
              aria-label="Đăng xuất"
              title="Đăng xuất"
            >
              <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
