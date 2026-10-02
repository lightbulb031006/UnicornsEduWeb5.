"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useRef, useState, useEffect, useSyncExternalStore } from "react";
import { animate, stagger } from "animejs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Role } from "@/dtos/Auth.dto";
import { useAuth } from "@/context/AuthContext";
import * as authApi from "@/lib/apis/auth.api";
import { clearLogoutScopedQueries } from "@/lib/query-invalidation";
import { SidebarThemePicker } from "@/components/shell";
import UserAvatar from "@/components/ui/UserAvatar";
import { BrandLogoLockup } from "@/components/BrandLogoLockup";

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

function IconHome() {
  return (
    <svg className="size-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
      />
    </svg>
  );
}

function IconUserCircle() {
  return (
    <svg className="size-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

const MENU_ITEMS: {
  href: string;
  label: string;
  icon: React.ReactNode;
  match: (pathname: string) => boolean;
}[] = [
  {
    href: "/student",
    label: "Học tập",
    icon: <IconHome />,
    match: (pathname) => pathname === "/student",
  },
  {
    href: "/user-profile",
    label: "Tài khoản",
    icon: <IconUserCircle />,
    match: (pathname) => pathname.startsWith("/user-profile"),
  },
];

function resolveActiveHref(pathname: string) {
  let best: string | null = null;
  let len = -1;
  for (const item of MENU_ITEMS) {
    if (!item.match(pathname)) continue;
    if (item.href.length >= len) {
      best = item.href;
      len = item.href.length;
    }
  }
  return best;
}

export default function StudentSidebar() {
  const pathname = usePathname();
  const { push } = useRouter();
  const queryClient = useQueryClient();
  const navListRef = useRef<HTMLUListElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const isMobile = useMediaQuery("(max-width: 767px)");
  const prefersReducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const { setUser } = useAuth();
  const [activeHrefState, setActiveHrefState] = useState<string | null>(null);
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setActiveHrefState(null);
  }

  const { data: fullProfile } = useQuery({
    queryKey: ["auth", "full-profile"],
    queryFn: authApi.getFullProfile,
    retry: false,
    staleTime: 60_000,
  });

  const activeHref = resolveActiveHref(pathname);
  const resolvedActiveHref = activeHrefState || activeHref;

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

  const toggleCollapse = () => setCollapsed((c) => !c);
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

  const logoutMutation = useMutation({
    mutationFn: authApi.studentLogout,
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

  const avatarInitial =
    fullProfile?.studentInfo?.fullName?.trim()?.charAt(0)?.toUpperCase() ??
    fullProfile?.first_name?.trim()?.charAt(0)?.toUpperCase() ??
    fullProfile?.accountHandle?.slice(0, 1).toUpperCase() ??
    "?";
  const avatarSrc = fullProfile?.avatarUrl ?? null;

  return (
    <>
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed left-3 top-3 z-30 flex size-11 items-center justify-center rounded-md border border-border-default bg-bg-surface text-text-primary shadow-sm transition-transform duration-200 hover:scale-105 active:scale-95 md:hidden"
        aria-label="Mở menu"
      >
        <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      <button
        type="button"
        className={`fixed inset-0 z-40 bg-bg-primary/70 transition-opacity duration-300 ${mobileOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"} md:hidden`}
        onClick={() => setMobileOpen(false)}
        aria-label="Đóng menu"
      />

      <aside
        style={{
          width: sidebarWidth,
          transform: mobileTransform,
          transition: prefersReducedMotion
            ? "none"
            : `width 0.3s ${SIDEBAR_EASE}, transform 0.34s ${SIDEBAR_EASE}`,
        }}
        className="fixed inset-y-0 left-0 z-50 flex h-dvh shrink-0 flex-col overflow-hidden border-r border-border-default bg-bg-secondary text-text-secondary md:sticky md:top-0 md:z-auto md:h-screen"
        aria-label="Menu học sinh"
      >
        <div className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-border-default px-2.5 py-1.5 sm:px-3">
          <div
            className={`flex min-w-0 flex-1 items-center overflow-hidden transition-[justify-content] duration-300 ease-out ${compact ? "justify-center" : "justify-start"}`}
          >
            <BrandLogoLockup
              variant="navbar"
              showWordmark={!compact}
              dense={compact}
              className="w-full min-w-0 transition-[width,opacity] duration-300 ease-out"
              wordmarkClassName="truncate"
            />
          </div>
          <button
            type="button"
            onClick={isMobile ? () => setMobileOpen(false) : toggleCollapse}
            className="flex size-11 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors duration-200 hover:bg-bg-tertiary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-secondary md:size-9"
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
            {MENU_ITEMS.map((item) => {
              const isActive = item.href === resolvedActiveHref;
              return (
                <li key={item.href} className="sidebar-item">
                  <Link
                    href={item.href}
                    prefetch={false}
                    onClick={async () => {
                      handleMobileClose();
                      setActiveHrefState(item.href);
                      await Promise.resolve();
                    }}
                    className={`flex items-center rounded-lg py-2.5 text-sm font-medium transition-[gap,padding,background-color,color] duration-300 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-secondary ${compact ? "gap-0 px-2.5" : "gap-3 px-3"} ${isActive ? "bg-primary text-text-inverse" : "hover:bg-bg-tertiary hover:text-text-primary"}`}
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
            href="/student"
            prefetch={false}
            onClick={async () => {
              handleMobileClose();
              setActiveHrefState("/student");
              await Promise.resolve();
            }}
            className={`sidebar-item flex items-center rounded-lg py-2.5 text-sm font-medium transition-[gap,padding,background-color,color] duration-300 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-secondary ${compact ? "gap-0 px-2.5" : "gap-3 px-3"} ${(activeHrefState ? activeHrefState === "/student" : pathname === "/student") ? "bg-primary text-text-inverse" : "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"}`}
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
              className="sidebar-item flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-bg-tertiary text-text-primary ring-2 ring-border-default transition-colors duration-200 hover:bg-primary hover:text-text-inverse focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-secondary"
              aria-label="Hồ sơ tài khoản"
              title="Hồ sơ tài khoản"
            >
              <UserAvatar
                src={avatarSrc}
                fallback={avatarInitial}
                alt={`Avatar của ${fullProfile?.accountHandle || "học viên"}`}
                className="size-full"
                fallbackClassName="text-sm font-semibold"
              />
            </Link>

            <SidebarThemePicker compact={compact} onMobileClose={handleMobileClose} />

            <div className={`min-w-0 flex-1 ${compact ? "hidden" : ""}`} aria-hidden />

            <button
              type="button"
              onClick={() => logoutMutation.mutate()}
              className="sidebar-item flex size-10 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors duration-200 hover:bg-danger hover:text-text-inverse focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-secondary"
              aria-label="Đăng xuất"
              title="Đăng xuất"
            >
              <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
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
      </aside>

    </>
  );
}
