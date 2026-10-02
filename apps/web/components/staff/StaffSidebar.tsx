"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useRef, useState, useEffect, useSyncExternalStore } from "react";
import { animate, stagger } from "animejs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Role } from "@/dtos/Auth.dto";
import { resolveCanonicalUserName } from "@/dtos/user-name.dto";
import { useAuth } from "@/context/AuthContext";
import * as authApi from "@/lib/apis/auth.api";
import { resolveStaffLessonWorkspace } from "@/lib/staff-lesson-workspace";
import { clearLogoutScopedQueries } from "@/lib/query-invalidation";
import { SidebarNotificationTray, SidebarThemePicker } from "@/components/shell";
import UserAvatar from "@/components/ui/UserAvatar";
import { BrandLogoLockup } from "@/components/BrandLogoLockup";

type MenuVisibility = {
  hasStaffProfile: boolean;
  canAccessClassWorkspace: boolean;
  canAccessCustomerCareSelf: boolean;
  canAccessLessonPlanWorkspace: boolean;
  canAccessCourseWorkspace: boolean;
  canAccessSurveys: boolean;
  isTraining: boolean;
  isAccountant: boolean;
  isAccountantIncome: boolean;
  isAccountantExpense: boolean;
  isCommunication: boolean;
  isTechnical: boolean;
};

type MenuItem = {
  href: string;
  label: string | ((options: MenuVisibility) => string);
  icon: React.ReactNode;
  isActive: (pathname: string) => boolean;
  isVisible: (options: MenuVisibility) => boolean;
};

function resolveActiveMenuHref(pathname: string, items: MenuItem[]) {
  let activeHref: string | null = null;
  let bestHrefLength = -1;

  items.forEach((item) => {
    if (!item.isActive(pathname)) {
      return;
    }

    if (item.href.length > bestHrefLength) {
      activeHref = item.href;
      bestHrefLength = item.href.length;
      return;
    }

    if (item.href.length === bestHrefLength) {
      activeHref = item.href;
    }
  });

  return activeHref;
}

function dedupeMenuItems(items: MenuItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.href)) {
      return false;
    }
    seen.add(item.href);
    return true;
  });
}

const DEFAULT_MENU_ITEMS: MenuItem[] = [
    {
      href: "/staff",
      label: "Dashboard",
      icon: <IconHome />,
      isActive: (pathname) => pathname === "/staff",
      isVisible: ({ hasStaffProfile }) => hasStaffProfile,
    },
    {
      href: "/staff/profile",
      label: "Cá nhân",
      icon: <IconOperations />,
      isActive: (pathname) =>
        pathname === "/staff/profile" || pathname.startsWith("/staff/classes/"),
      isVisible: ({ hasStaffProfile }) => hasStaffProfile,
    },
    {
      href: "/staff/staffs",
      label: "Nhân sự",
      icon: <IconStaff />,
      isActive: (pathname) => pathname.startsWith("/staff/staffs"),
      isVisible: ({ isAccountantExpense }) => isAccountantExpense,
    },
    {
      href: "/staff/classes",
      label: "Lớp học",
      icon: <IconClasses />,
      isActive: (pathname) =>
        pathname === "/staff/classes" || pathname.startsWith("/staff/classes/"),
      isVisible: ({ isAccountant, isTraining }) => isAccountant || isTraining,
    },
    {
      href: "/staff/students",
      label: "Học sinh",
      icon: <IconStudents />,
      isActive: (pathname) => pathname.startsWith("/staff/students"),
      isVisible: ({ isAccountantIncome }) => isAccountantIncome,
    },
    {
      href: "/staff/calendar",
      label: ({ isTraining }) => (isTraining ? "Lịch lớp" : "Lịch dạy"),
      icon: <IconCalendar />,
      isActive: (pathname) =>
        pathname === "/staff/calendar" || pathname.startsWith("/staff/calendar/"),
      isVisible: ({ canAccessClassWorkspace, isTraining }) =>
        canAccessClassWorkspace || isTraining,
    },
    {
      href: "/staff/costs",
      label: "Chi phí",
      icon: <IconCosts />,
      isActive: (pathname) => pathname.startsWith("/staff/costs"),
      isVisible: ({ isAccountantExpense }) => isAccountantExpense,
    },
    {
      href: "/staff/customer-care-detail",
      label: "CSKH",
      icon: <IconCustomerCare />,
      isActive: (pathname) => pathname === "/staff/customer-care-detail",
      isVisible: ({ canAccessCustomerCareSelf }) => canAccessCustomerCareSelf,
    },
    {
      href: "/staff/lesson-plans",
      label: "Giáo Án",
      icon: <IconLessonPlans />,
      isActive: (pathname) =>
        pathname.startsWith("/staff/lesson-plan-tasks") ||
        pathname.startsWith("/staff/lesson-plan-manage-details") ||
        pathname.startsWith("/staff/lesson-plans") ||
        pathname.startsWith("/staff/lesson-manage-details"),
      isVisible: ({ canAccessLessonPlanWorkspace, isAccountantExpense }) =>
        canAccessLessonPlanWorkspace || isAccountantExpense,
    },
    {
      href: "/staff/courses",
      label: "Nội dung khoá",
      icon: <IconExamLibrary />,
      isActive: (pathname) => pathname.startsWith("/staff/courses"),
      isVisible: ({ canAccessCourseWorkspace }) => canAccessCourseWorkspace,
    },
    {
      href: "/staff/surveys",
      label: "Bài khảo sát",
      icon: <IconSurveys />,
      isActive: (pathname) => pathname.startsWith("/staff/surveys"),
      isVisible: ({ canAccessSurveys }) => canAccessSurveys,
    },
    {
      href: "/staff/communication-detail",
      label: "Truyền thông",
      icon: <IconCommunication />,
      isActive: (pathname) => pathname.startsWith("/staff/communication-detail"),
      isVisible: ({ isCommunication }) => isCommunication,
    },
    {
      href: "/staff/technical-detail",
      label: "Kỹ thuật",
      icon: <IconCommunication />,
      isActive: (pathname) => pathname.startsWith("/staff/technical-detail"),
      isVisible: ({ isTechnical }) => isTechnical,
    },
    {
      href: "/staff/training-detail",
      label: "Đào Tạo",
      icon: <IconCalendar />,
      isActive: (pathname) => pathname.startsWith("/staff/training-detail"),
      isVisible: ({ isTraining }) => isTraining,
    },
    {
      href: "/staff/notes-subject",
      label: "Quy định",
      icon: <IconNotesSubject />,
      isActive: (pathname) => pathname.startsWith("/staff/notes-subject"),
      isVisible: ({ hasStaffProfile }) => hasStaffProfile,
    },
  ];

function buildAssistantMenuItems(ownStaffId: string): MenuItem[] {
  const ownStaffDetailHref = ownStaffId
    ? `/staff/staffs/${encodeURIComponent(ownStaffId)}`
    : "";

  return [
    {
      href: "/staff",
      label: "Dashboard",
      icon: <IconHome />,
      isActive: (pathname) => pathname === "/staff",
      isVisible: () => true,
    },
    {
      href: ownStaffDetailHref || "/staff",
      label: "Cá nhân",
      icon: <IconOperations />,
      isActive: (pathname) =>
        Boolean(ownStaffId) &&
        (pathname === ownStaffDetailHref ||
          pathname.startsWith(`${ownStaffDetailHref}/`)),
      isVisible: () => Boolean(ownStaffId),
    },
    {
      href: "/staff/users",
      label: "User",
      icon: <IconUsers />,
      isActive: (pathname) => pathname.startsWith("/staff/users"),
      isVisible: () => true,
    },
    {
      href: "/staff/staffs",
      label: "Nhân sự",
      icon: <IconStaff />,
      isActive: (pathname) =>
        pathname.startsWith("/staff/staffs") && pathname !== ownStaffDetailHref,
      isVisible: () => true,
    },
    {
      href: "/staff/classes",
      label: "Lớp học",
      icon: <IconClasses />,
      isActive: (pathname) =>
        pathname === "/staff/classes" || pathname.startsWith("/staff/classes/"),
      isVisible: () => true,
    },
    {
      href: "/staff/notes-subject",
      label: "Quy định",
      icon: <IconNotesSubject />,
      isActive: (pathname) => pathname.startsWith("/staff/notes-subject"),
      isVisible: () => true,
    },
    {
      href: "/staff/students",
      label: "Học sinh",
      icon: <IconStudents />,
      isActive: (pathname) => pathname.startsWith("/staff/students"),
      isVisible: () => true,
    },
    {
      href: "/staff/system-settings",
      label: "Cài đặt hệ thống",
      icon: <IconSystemSettings />,
      isActive: (pathname) =>
        pathname.startsWith("/staff/system-settings") ||
        pathname.startsWith("/staff/deductions"),
      isVisible: () => true,
    },
    {
      href: "/staff/costs",
      label: "Chi phí",
      icon: <IconCosts />,
      isActive: (pathname) => pathname.startsWith("/staff/costs"),
      isVisible: () => true,
    },
    {
      href: "/staff/lesson-plans",
      label: "Giáo Án",
      icon: <IconLessonPlans />,
      isActive: (pathname) =>
        pathname.startsWith("/staff/lesson-plan-tasks") ||
        pathname.startsWith("/staff/lesson-plan-manage-details") ||
        pathname.startsWith("/staff/lesson-plans") ||
        pathname.startsWith("/staff/lesson-manage-details"),
      isVisible: () => true,
    },
    {
      href: "/staff/surveys",
      label: "Bài khảo sát",
      icon: <IconSurveys />,
      isActive: (pathname) => pathname.startsWith("/staff/surveys"),
      isVisible: () => true,
    },
    {
      href: "/staff/history",
      label: "Lịch sử",
      icon: <IconHistory />,
      isActive: (pathname) => pathname.startsWith("/staff/history"),
      isVisible: () => true,
    },
  ];
}

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

function IconOperations() {
  return (
    <svg className="size-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 7h16M7 3v4m10-4v4M5 11h14v8a2 2 0 01-2 2H7a2 2 0 01-2-2v-8zm3 4h3m-3 4h8"
      />
    </svg>
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

function IconUsers() {
  return (
    <svg className="size-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
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

function IconStudents() {
  return (
    <svg className="size-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
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

function IconSystemSettings() {
  return (
    <svg className="size-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
    </svg>
  );
}

function IconCustomerCare() {
  return (
    <svg className="size-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M18 10a6 6 0 10-12 0v3a2 2 0 01-1 1.732V16a2 2 0 002 2h1m10-3.268A2 2 0 0117 13v-3m1 4v2a2 2 0 01-2 2h-1m-6 0v1a3 3 0 006 0v-1m-6 0h6"
      />
    </svg>
  );
}

function IconLessonPlans() {
  return (
    <svg className="size-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  );
}

function IconExamLibrary() {
  return (
    <svg className="size-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
      />
    </svg>
  );
}

function IconSurveys() {
  return (
    <svg className="size-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 8l2 2 4-4"
      />
    </svg>
  );
}

function IconCommunication() {
  return (
    <svg className="size-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
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

function IconNotesSubject() {
  return (
    <svg className="size-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg className="size-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

export default function StaffSidebar() {
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

  const staffRoles = fullProfile?.staffInfo?.roles ?? [];
  const hasStaffProfile = Boolean(fullProfile?.staffInfo?.id);
  const isFullAdmin =
    fullProfile?.roleType === "admin" || staffRoles.includes("admin");
  const isAssistant = hasStaffProfile && staffRoles.includes("assistant");
  const canAccessClassWorkspace =
    fullProfile?.roleType === "admin" || staffRoles.includes("teacher");
  const isTraining = staffRoles.includes("training");
  const canAccessCustomerCareSelf =
    hasStaffProfile && staffRoles.includes("customer_care");
  const lessonWorkspace = resolveStaffLessonWorkspace(fullProfile);
  const isAccountantIncome =
    staffRoles.includes("accountant_income") || staffRoles.includes("accountant");
  const isAccountantExpense = staffRoles.includes("accountant_expense");
  const isAccountant = isAccountantIncome || isAccountantExpense;
  const canAccessLessonPlanWorkspace =
    lessonWorkspace.canAccessWorkspace || isAccountantExpense;
  const canAccessCourseWorkspace =
    lessonWorkspace.isLessonPlan || lessonWorkspace.isLessonPlanHead;
  const canAccessSurveys =
    isFullAdmin ||
    isAssistant ||
    lessonWorkspace.isLessonPlan ||
    lessonWorkspace.isLessonPlanHead;
  const isCommunication = staffRoles.includes("communication");
  const isTechnical = staffRoles.includes("technical");
  const baseMenuItems = isFullAdmin || isAssistant
    ? [
        ...buildAssistantMenuItems(fullProfile?.staffInfo?.id ?? ""),
        ...DEFAULT_MENU_ITEMS.filter((item) => item.href !== "/staff/profile"),
      ]
    : DEFAULT_MENU_ITEMS;
  const menuItems = dedupeMenuItems(baseMenuItems).filter((item) =>
    item.isVisible({
      hasStaffProfile,
      canAccessClassWorkspace,
      canAccessCustomerCareSelf,
      canAccessLessonPlanWorkspace,
      canAccessCourseWorkspace,
      canAccessSurveys,
      isTraining,
      isAccountant,
      isAccountantIncome,
      isAccountantExpense,
      isCommunication,
      isTechnical,
    }),
  );
  const activeMenuHref = resolveActiveMenuHref(pathname, menuItems);
  const resolvedActiveMenuHref = activeHrefState || activeMenuHref;

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
    setCollapsed((value) => !value);
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

  const resolvedStaffName = resolveCanonicalUserName(
    fullProfile,
    fullProfile?.staffInfo?.fullName,
  );
  const avatarInitial =
    resolvedStaffName.trim().charAt(0).toUpperCase() ||
    fullProfile?.accountHandle?.slice(0, 1).toUpperCase() ||
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
        className={`fixed inset-0 z-40 bg-bg-primary/70 transition-opacity duration-300 ${mobileOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
          } md:hidden`}
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
        aria-label="Menu staff"
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
              className={`size-5 transition-transform duration-300 ease-out ${collapsed && !isMobile ? "rotate-180" : ""
                }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden
            >
              {isMobile ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
                />
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
              const isActive = item.href === resolvedActiveMenuHref;
              const itemLabel =
                typeof item.label === "function"
                  ? item.label({
                      hasStaffProfile,
                      canAccessClassWorkspace,
                      canAccessCustomerCareSelf,
                      canAccessLessonPlanWorkspace,
                      canAccessCourseWorkspace,
                      canAccessSurveys,
                      isTraining,
                      isAccountant,
                      isAccountantIncome,
                      isAccountantExpense,
                      isCommunication,
                      isTechnical,
                    })
                  : item.label;

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
                    className={`flex items-center rounded-lg py-2.5 text-sm font-medium transition-[gap,padding,background-color,color] duration-300 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-secondary ${compact ? "gap-0 px-2.5" : "gap-3 px-3"
                      } ${isActive
                        ? "bg-primary text-text-inverse"
                        : "hover:bg-bg-tertiary hover:text-text-primary"
                      }`}
                    aria-label={collapsed && !isMobile ? itemLabel : undefined}
                    title={collapsed && !isMobile ? itemLabel : undefined}
                  >
                    <span className="flex size-5 shrink-0 items-center justify-center [&>svg]:size-5">
                      {item.icon}
                    </span>
                    <span
                      className={`truncate whitespace-nowrap transition-[max-width,opacity] duration-300 ease-out ${compact ? "max-w-0 opacity-0" : "max-w-[140px] opacity-100"
                        }`}
                    >
                      {itemLabel}
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
            onClick={async () => {
              handleMobileClose();
              setActiveHrefState("/");
              await Promise.resolve();
            }}
            className={`sidebar-item flex items-center rounded-lg py-2.5 text-sm font-medium transition-[gap,padding,background-color,color] duration-300 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-secondary ${compact ? "gap-0 px-2.5" : "gap-3 px-3"
              } ${(activeHrefState ? activeHrefState === "/" : pathname === "/")
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
              className={`truncate whitespace-nowrap transition-[max-width,opacity] duration-300 ease-out ${compact ? "max-w-0 opacity-0" : "max-w-[140px] opacity-100"
                }`}
            >
              Trang chủ
            </span>
          </Link>

          <div
            className={`mt-2 flex items-center gap-2 ${compact ? "flex-wrap justify-center" : ""}`}
          >
            <Link
              href="/user-profile"
              prefetch={false}
              onClick={handleMobileClose}
              className="sidebar-item flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-bg-tertiary text-text-primary ring-2 ring-border-default transition-colors duration-200 hover:bg-primary hover:text-text-inverse focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-secondary"
              aria-label="Thông tin cá nhân"
              title="Thông tin cá nhân"
            >
              <UserAvatar
                src={avatarSrc}
                fallback={avatarInitial}
                alt={`Avatar của ${fullProfile?.accountHandle || "nhân sự"}`}
                className="size-full"
                fallbackClassName="text-sm font-semibold"
              />
            </Link>

            <SidebarThemePicker compact={compact} onMobileClose={handleMobileClose} />

            <SidebarNotificationTray compact={compact} enableUnreadWarning />

            <div className={`min-w-0 flex-1 ${compact ? "hidden" : ""}`} aria-hidden />

            <button
              type="button"
              onClick={handleLogout}
              className="sidebar-item flex size-10 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors duration-200 hover:bg-danger hover:text-text-inverse hover:ring-danger focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-secondary"
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
