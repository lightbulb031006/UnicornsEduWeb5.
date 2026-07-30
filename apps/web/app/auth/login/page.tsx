"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import type { SyntheticEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { toast } from "sonner";
import * as authApi from "@/lib/apis/auth.api";
import type { LoginDto } from "@/dtos/Auth.dto";
import { useAuth } from "@/context/AuthContext";
import { BrandLogoLockup } from "@/components/BrandLogoLockup";
import { AuthCardSkeleton } from "@/components/auth/AuthCardSkeleton";
import {
  buildSetupPasswordHref,
  readSafeNextPath,
} from "@/lib/auth-redirect";
import {
  bootstrapPostLoginSession,
  buildLoginFallbackSession,
} from "@/lib/post-login-session";
import { getClientApiBaseUrl } from "@/lib/api-base-url";

function nestMessageFromResponseData(data: unknown): string | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  const raw = (data as { message?: unknown }).message;
  if (typeof raw === "string" && raw.trim()) {
    return raw.trim();
  }
  if (
    Array.isArray(raw) &&
    raw.every((m): m is string => typeof m === "string")
  ) {
    return raw.join(" ");
  }
  return null;
}

function getLoginErrorToastMessage(error: unknown): string {
  if (!isAxiosError(error)) {
    return "Đăng nhập thất bại.";
  }

  const status = error.response?.status;
  const data = error.response?.data;
  const serverMsg = nestMessageFromResponseData(data);

  if (status === 400) {
    return (
      serverMsg ??
      "Dữ liệu không hợp lệ. Mật khẩu cần ít nhất 6 ký tự (theo quy định server)."
    );
  }

  if (status === 401) {
    return serverMsg ?? "Sai tài khoản hoặc mật khẩu.";
  }

  if (status === 429) {
    return (
      serverMsg ??
      "Too many requests. Bạn thao tác quá nhanh. Vui lòng đợi một chút rồi thử lại."
    );
  }

  return "Đăng nhập thất bại.";
}

function hasAuthenticatedSession(user: { id: string; accountHandle: string }) {
  return Boolean(user.id && user.accountHandle);
}

function LoginPageContent() {
  const { replace } = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const getSearchParam = searchParams.get.bind(searchParams);
  const [accountHandle, setAccountHandle] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const { setUser, user, isAuthReady } = useAuth();

  useEffect(() => {
    const err = getSearchParam("error");
    if (err === "registration_disabled") {
      toast.error("Tài khoản chưa tồn tại trong hệ thống. Vui lòng liên hệ quản trị viên để được cấp tài khoản.");
      return;
    }
    if (err === "google_no_user") toast.error("Không lấy được thông tin từ Google. Vui lòng thử lại.");
  }, [getSearchParam]);

  const loginMutation = useMutation({
    mutationFn: async (body: LoginDto) => {
      const loginResponse = await authApi.logIn(body);
      return loginResponse;
    },
    onSuccess: async (loginResponse) => {
      setIsRedirecting(true);
      toast.success("Đăng nhập thành công.");

      const fallbackSession = buildLoginFallbackSession(loginResponse);
      setUser(fallbackSession);
      queryClient.setQueryData(["auth", "session"], fallbackSession);

      const { session, redirectHref } = await bootstrapPostLoginSession({
        fallbackUser: fallbackSession,
        queryClient,
        setUser,
        requestedNextPath: getSearchParam("next"),
      });

      replace(
        session.requiresPasswordSetup
          ? buildSetupPasswordHref(redirectHref)
          : redirectHref,
      );
    },
    onError: (error) => {
      setIsRedirecting(false);
      toast.error(getLoginErrorToastMessage(error));
    },
  });

  useEffect(() => {
    if (!isAuthReady || loginMutation.isPending || isRedirecting) {
      return;
    }

    if (!hasAuthenticatedSession(user) || user.requiresPasswordSetup) {
      return;
    }

    setIsRedirecting(true);
    const nextPath = readSafeNextPath(getSearchParam("next"));
    void bootstrapPostLoginSession({
      fallbackUser: user,
      queryClient,
      setUser,
      requestedNextPath: nextPath,
    }).then(({ redirectHref }) => {
      replace(redirectHref);
    });
  }, [
    getSearchParam,
    isAuthReady,
    isRedirecting,
    loginMutation.isPending,
    queryClient,
    replace,
    setUser,
    user,
  ]);

  const handleSubmit = (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    loginMutation.mutate({ accountHandle, password, rememberMe });
  };

  return (
    <div className="flex min-h-dvh items-start justify-center bg-bg-primary px-4 py-6 sm:items-center sm:py-10">
      <div className="w-full max-w-md motion-fade-up">
        <div className="rounded-2xl border border-border-default bg-bg-surface p-5 shadow-lg motion-hover-lift sm:p-8">
          <div className="mb-6 flex justify-center px-1 sm:mb-8">
            <BrandLogoLockup
              variant="auth"
              className="max-w-full flex-wrap justify-center"
              priority
            />
          </div>
          <h1 className="text-2xl font-semibold text-text-primary text-center mb-6">
            Đăng nhập
          </h1>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="login-account-handle" className="block text-sm font-medium text-text-primary mb-1">
                Email hoặc account handle
              </label>
              <input
                id="login-account-handle"
                type="text"
                autoComplete="username"
                required
                value={accountHandle}
                onChange={(e) => setAccountHandle(e.target.value)}
                className="w-full rounded-lg border border-border-default bg-bg-surface px-3 py-2.5 text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-border-focus/30 transition-colors duration-200"
                placeholder="you@example.com hoặc nguyenvan"
              />
            </div>

            <div>
              <label htmlFor="login-password" className="block text-sm font-medium text-text-primary mb-1">
                Mật khẩu
              </label>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-border-default bg-bg-surface px-3 py-2.5 text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-border-focus/30 transition-colors duration-200"
                placeholder="Ít nhất 6 ký tự"
              />
            </div>

            <div className="flex flex-col gap-3 min-[380px]:flex-row min-[380px]:items-center min-[380px]:justify-between">
              <span className="flex min-h-11 items-center">
                <input
                  id="remember-me"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="size-5 rounded-sm border border-border-default bg-bg-surface accent-primary transition-colors duration-200 focus:ring-2 focus:ring-border-focus focus:ring-offset-2"
                />
                <label htmlFor="remember-me" className="select-none text-sm text-text-primary ml-2">
                  Remember me for a month
                </label>
              </span>
              <Link
                href="/auth/forgot-password"
                className="inline-flex min-h-11 items-center rounded-md px-3 py-2 text-sm text-primary hover:text-primary-hover focus:outline-none focus:ring-2 focus:ring-border-focus min-[380px]:px-0"
              >
                Quên mật khẩu?
              </Link>
            </div>

            <button
              type="submit"
              disabled={loginMutation.isPending || isRedirecting}
              className="w-full rounded-lg bg-primary py-2.5 font-medium text-text-inverse hover:bg-primary-hover active:bg-primary-active focus:outline-none focus:ring-2 focus:ring-border-focus focus:ring-offset-2 disabled:opacity-60 transition-colors duration-200"
            >
              {loginMutation.isPending ? "Đang đăng nhập…" : isRedirecting ? "Đang chuyển tiếp…" : "Đăng nhập"}
            </button>

            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border-default" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-bg-surface px-2 text-text-muted">hoặc</span>
              </div>
            </div>

            <a
              href={`${getClientApiBaseUrl()}/auth/google`}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-border-default bg-bg-surface py-2.5 font-medium text-text-primary hover:bg-bg-tertiary focus:outline-none focus:ring-2 focus:ring-border-focus focus:ring-offset-2 transition-colors duration-200"
            >
              <svg className="size-5" viewBox="0 0 24 24" aria-hidden>
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Đăng nhập bằng Google
            </a>
          </form>

          <p className="mt-6 text-center">
            <Link href="/" className="inline-flex min-h-11 items-center rounded-md px-3 py-2 text-sm text-text-secondary hover:text-text-primary">
              ← Về trang chủ
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <AuthCardSkeleton
          showInlineActions
          showDivider
          showSecondaryButton
          footerRows={2}
        />
      }
    >
      <LoginPageContent />
    </Suspense>
  );
}
