"use client";

import {
  ACTION_HISTORY_INVALIDATION_EVENT,
  RATE_LIMIT_TOAST_EVENT,
  type RateLimitToastDetail,
} from "@/lib/client";
import { getNotificationSocketTarget } from "@/lib/api-base-url";
import { AuthProvider } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { createGuestUser, Role, UserInfoDto } from "@/dtos/Auth.dto";
import type { NotificationPushEvent } from "@/dtos/notification.dto";
import { DirectTopUpApprovalModal } from "@/components/admin/DirectTopUpApprovalModal";
import { summarizeNotificationContent } from "@/lib/format-sidebar-notification-time";
import {
  extractDirectTopUpRequestId,
  openDirectTopUpApprovalPopup,
} from "@/lib/direct-topup-notification";
import {
  OPEN_NOTIFICATION_DETAIL_EVENT,
  type OpenNotificationDetailPayload,
} from "@/lib/notification-tray-events";
import {
  useMutation,
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { toast, Toaster } from "sonner";
import * as authApi from "@/lib/apis/auth.api";
import {
  buildSetupPasswordHref,
  resolvePasswordSetupNextPath,
} from "@/lib/auth-redirect";
import {
  isRestrictedByEmailVerification,
  maskEmailAddress,
  OPEN_EMAIL_VERIFICATION_MODAL_EVENT,
} from "@/lib/email-verification-access";
import {
  invalidateActionHistoryScopedQueries,
  invalidateNotificationFeedScopedQueries,
} from "@/lib/query-invalidation";
import { SidebarThemePicker } from "@/components/shell";
import NextTopLoader from "nextjs-toploader";
import { LazyMotion, domAnimation } from "framer-motion";

const defaultUser: UserInfoDto = createGuestUser();

const PASSWORD_SETUP_PATH = "/auth/setup-password";

function hasAuthenticatedSession(user: UserInfoDto) {
  return Boolean(user.id && user.accountHandle);
}

function hasEffectiveRole(user: UserInfoDto, role: Role) {
  return user.roleType === role || Boolean(user.effectiveRoleTypes?.includes(role));
}

function EmailVerificationAccessModal() {
  const queryClient = useQueryClient();
  const { user, setUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [emailInput, setEmailInput] = useState("");

  useEffect(() => {
    const handleOpen = () => {
      setOpen(true);
      setEmailInput("");
    };
    window.addEventListener(OPEN_EMAIL_VERIFICATION_MODAL_EVENT, handleOpen);
    return () => {
      window.removeEventListener(
        OPEN_EMAIL_VERIFICATION_MODAL_EVENT,
        handleOpen,
      );
    };
  }, []);

  const resendVerificationMutation = useMutation({
    mutationFn: authApi.resendVerificationEmail,
    onSuccess: (payload) => {
      const normalizedEmail = payload.email?.trim() ?? "";
      setUser((currentUser) => ({
        ...currentUser,
        email: normalizedEmail || currentUser.email || "",
        emailVerified: false,
        canAccessRestrictedRoutes: false,
      }));
      queryClient.setQueryData(["auth", "session"], (prev: UserInfoDto) => ({
        ...(prev ?? user),
        email: normalizedEmail || user.email || "",
        emailVerified: false,
        canAccessRestrictedRoutes: false,
      }));
      toast.success("Đã gửi email xác minh. Vui lòng kiểm tra hộp thư.");
      setOpen(false);
    },
    onError: (err: unknown) => {
      const ax = err as { response?: { data?: { message?: string } } };
      toast.error(ax.response?.data?.message ?? "Không gửi được email xác minh.");
    },
  });

  if (!open || !isRestrictedByEmailVerification(user)) {
    return null;
  }

  const currentEmail = user.email?.trim() ?? "";
  const hasEmail = currentEmail.length > 0;

  return (
      <div className="fixed inset-0 z-100 flex items-center justify-center bg-bg-primary/75 px-4">
      <div className="w-full max-w-md rounded-2xl border border-border-default bg-bg-surface p-5 shadow-xl">
        <h2 className="text-lg font-semibold text-text-primary">
          Vui lòng xác minh email
        </h2>
        <p className="mt-2 text-sm text-text-secondary">
          Bạn đã đăng nhập thành công nhưng cần xác minh email để mở các trang cá nhân và lớp học.
        </p>

        {hasEmail ? (
          <p className="mt-4 rounded-lg border border-border-default bg-bg-secondary px-3 py-2 text-sm text-text-primary">
            Email hiện tại: <span className="font-medium">{maskEmailAddress(currentEmail)}</span>
          </p>
        ) : (
          <div className="mt-4">
            <label
              htmlFor="verification-email"
              className="mb-1 block text-xs font-medium text-text-muted"
            >
              Nhập email để nhận link xác minh
            </label>
            <input
              id="verification-email"
              type="email"
              value={emailInput}
              onChange={(event) => setEmailInput(event.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-lg border border-border-default bg-bg-primary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-border-focus/20"
            />
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg border border-border-default bg-bg-surface px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-secondary"
          >
            Đóng
          </button>
          <button
            type="button"
            disabled={
              resendVerificationMutation.isPending ||
              (!hasEmail && emailInput.trim().length === 0)
            }
            onClick={() =>
              resendVerificationMutation.mutate(
                hasEmail ? {} : { email: emailInput.trim() },
              )
            }
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {resendVerificationMutation.isPending ? "Đang gửi…" : "Xác minh"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ActionHistoryInvalidationBridge() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const handleInvalidate = () => {
      void invalidateActionHistoryScopedQueries(queryClient);
    };

    window.addEventListener(
      ACTION_HISTORY_INVALIDATION_EVENT,
      handleInvalidate,
    );
    return () => {
      window.removeEventListener(
        ACTION_HISTORY_INVALIDATION_EVENT,
        handleInvalidate,
      );
    };
  }, [queryClient]);

  return null;
}

function RateLimitToastBridge() {
  useEffect(() => {
    const handleRateLimitToast = (event: Event) => {
      const detail = (event as CustomEvent<RateLimitToastDetail>).detail;

      toast.error(detail?.title ?? "Too many requests", {
        id: RATE_LIMIT_TOAST_EVENT,
        description:
          detail?.description ??
          "Bạn thao tác quá nhanh. Vui lòng đợi một chút rồi thử lại.",
      });
    };

    window.addEventListener(RATE_LIMIT_TOAST_EVENT, handleRateLimitToast);
    return () => {
      window.removeEventListener(RATE_LIMIT_TOAST_EVENT, handleRateLimitToast);
    };
  }, []);

  return null;
}

function NotificationSocketBridge() {
  const { user, isAuthReady } = useAuth();
  const queryClient = useQueryClient();
  const recentNotificationKeysRef = useRef<string[]>([]);
  const canOpenAdminChannel = Boolean(
    user.access?.admin?.canAccess ?? hasEffectiveRole(user, Role.admin),
  );
  const canOpenStaffChannel = Boolean(
    user.access?.staff?.canAccess ??
      (hasEffectiveRole(user, Role.staff) && user.hasStaffProfile),
  );
  const canConnectRealtimeNotifications =
    isAuthReady &&
    hasAuthenticatedSession(user) &&
    (canOpenAdminChannel || canOpenStaffChannel);

  useEffect(() => {
    if (!canConnectRealtimeNotifications) {
      return;
    }

    if (!canOpenAdminChannel && !canOpenStaffChannel) {
      return;
    }

    const { url: socketUrl, options: socketOptions } =
      getNotificationSocketTarget();
    const socket = io(socketUrl, socketOptions);

    const rememberNotification = (key: string) => {
      const recentKeys = recentNotificationKeysRef.current;
      if (recentKeys.includes(key)) {
        return false;
      }

      recentKeys.push(key);
      if (recentKeys.length > 200) {
        recentKeys.splice(0, recentKeys.length - 200);
      }

      return true;
    };

    const handleNotificationPushed = (event: NotificationPushEvent) => {
      const eventKey = `${event.id}:${event.version}`;
      if (!rememberNotification(eventKey)) {
        return;
      }

      void invalidateNotificationFeedScopedQueries(queryClient);

      const openNotificationDetail = () => {
        const payload: OpenNotificationDetailPayload = {
          id: event.id,
          title: event.title,
          message: event.message,
          lastPushedAt: event.lastPushedAt,
          deliveryKind: event.deliveryKind,
          version: event.version,
        };
        window.dispatchEvent(
          new CustomEvent<OpenNotificationDetailPayload>(
            OPEN_NOTIFICATION_DETAIL_EVENT,
            { detail: payload },
          ),
        );
      };

      const compactSummary = summarizeNotificationContent(event.message, 88);
      const directTopUpRequestId = canOpenAdminChannel
        ? extractDirectTopUpRequestId(event.message)
        : null;
      toast.custom(
        (toastId) => (
          <button
            type="button"
            onClick={() => {
              if (directTopUpRequestId) {
                openDirectTopUpApprovalPopup({
                  requestId: directTopUpRequestId,
                  notificationId: event.id,
                });
              } else {
                openNotificationDetail();
              }
              toast.dismiss(toastId);
            }}
            className="w-full rounded-lg border border-border-default bg-bg-surface px-3 py-2 text-left shadow-sm transition hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          >
            <p className="text-sm font-semibold text-text-primary">
              {directTopUpRequestId
                ? "Yêu cầu nạp thẳng mới"
                : event.deliveryKind === "adjusted"
                  ? "Thông báo được cập nhật"
                  : "Thông báo mới từ admin"}
            </p>
            <p className="mt-1 text-xs text-text-secondary">
              {event.title} · {compactSummary}
            </p>
            <p className="mt-1 text-[11px] text-primary">
              {directTopUpRequestId ? "Bấm để duyệt" : "Bấm để mở chi tiết"}
            </p>
          </button>
        ),
        { id: eventKey, duration: 10000 },
      );
    };

    socket.on("notification.pushed", handleNotificationPushed);

    return () => {
      socket.off("notification.pushed", handleNotificationPushed);
      socket.disconnect();
    };
  }, [
    canOpenAdminChannel,
    canOpenStaffChannel,
    canConnectRealtimeNotifications,
    queryClient,
  ]);

  return null;
}

function AuthPasswordSetupGate() {
  const { user, isAuthReady } = useAuth();
  const pathname = usePathname();
  const { replace } = useRouter();
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  useEffect(() => {
    if (!isAuthReady) {
      return;
    }

    if (!hasAuthenticatedSession(user) || !user.requiresPasswordSetup) {
      return;
    }

    if (pathname === PASSWORD_SETUP_PATH) {
      return;
    }

    replace(
      buildSetupPasswordHref(
        resolvePasswordSetupNextPath(pathname, searchParams),
      ),
    );
  }, [pathname, replace, search, searchParams, isAuthReady, user]);

  return null;
}

function PublicThemePickerBridge() {
  const pathname = usePathname();
  const shouldShow =
    pathname.startsWith("/auth") ||
    pathname === "/verify-email" ||
    pathname === "/wallet-direct-topup-approval";

  if (!shouldShow) return null;

  return (
    <div className="fixed right-4 top-4 z-[80]">
      <SidebarThemePicker compact />
    </div>
  );
}

export function Providers({
  children,
  initialUser,
}: Readonly<{
  children: React.ReactNode;
  initialUser?: UserInfoDto;
}>) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false, // Stop query spam when tab-focusing
        staleTime: 30000,            // 30 seconds default stale time
      }
    }
  }));

  return (
    <QueryClientProvider client={queryClient}>
      <NextTopLoader
        color="var(--ue-primary, #2563EB)"
        initialPosition={0.08}
        crawlSpeed={200}
        height={3}
        crawl={true}
        showSpinner={false}
        easing="ease"
        speed={200}
        shadow="0 0 10px var(--ue-primary, #2563EB),0 0 5px var(--ue-primary, #2563EB)"
      />
      {/*
        LazyMotion + component `m` thay cho `motion`: `motion` kéo theo toàn bộ
        feature bundle (~30kb). `strict` bắt lỗi ngay nếu có chỗ nào lỡ dùng lại
        `motion.*` bên trong cây này.
      */}
      <LazyMotion features={domAnimation} strict>
        <ThemeProvider>
          <ActionHistoryInvalidationBridge />
          <RateLimitToastBridge />
          <AuthProvider initialUser={initialUser ?? defaultUser}>
            <NotificationSocketBridge />
            <DirectTopUpApprovalModal />
            <AuthPasswordSetupGate />
            <EmailVerificationAccessModal />
            <PublicThemePickerBridge />
            {children}
            <Toaster richColors position="top-right" />
          </AuthProvider>
        </ThemeProvider>
      </LazyMotion>
    </QueryClientProvider>
  );
}
