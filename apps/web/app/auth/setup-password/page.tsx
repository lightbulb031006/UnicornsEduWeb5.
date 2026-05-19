"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import type { SyntheticEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createGuestUser, type UserInfoDto } from "@/dtos/Auth.dto";
import { useAuth } from "@/context/AuthContext";
import * as authApi from "@/lib/apis/auth.api";
import { BrandLogoLockup } from "@/components/BrandLogoLockup";
import {
  readSafeNextPath,
  resolvePostLoginRedirect,
} from "@/lib/auth-redirect";

function hasAuthenticatedSession(user: { id: string; accountHandle: string }) {
  return Boolean(user.id && user.accountHandle);
}

async function redirectAfterSetup(params: {
  nextPath: string | null;
  queryClient: ReturnType<typeof useQueryClient>;
  replace: ReturnType<typeof useRouter>["replace"];
  setUser: (user: UserInfoDto) => void;
  fallbackUser: UserInfoDto;
}) {
  let session: UserInfoDto | null = null;

  try {
    session = await authApi.getSession();
    params.queryClient.setQueryData(["auth", "session"], session);
    params.setUser(session);
  } catch {
    session = null;
  }

  params.replace(
    params.nextPath ?? resolvePostLoginRedirect(session ?? params.fallbackUser),
  );
}

function SetupPasswordPageContent() {
  const { replace } = useRouter();
  const searchParams = useSearchParams();
  const getSearchParam = searchParams.get.bind(searchParams);
  const queryClient = useQueryClient();
  const { user, setUser, isAuthReady } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const source = getSearchParam("source");
  const nextPath = readSafeNextPath(getSearchParam("next"));
  const hasSession = hasAuthenticatedSession(user);

  useEffect(() => {
    if (!isAuthReady) {
      return;
    }

    if (!hasSession) {
      replace("/auth/login");
      return;
    }

    if (!user.requiresPasswordSetup) {
      void redirectAfterSetup({
        nextPath,
        queryClient,
        replace,
        setUser,
        fallbackUser: user,
      });
    }
  }, [hasSession, isAuthReady, nextPath, queryClient, replace, setUser, user]);

  const setupPasswordMutation = useMutation({
    mutationFn: authApi.setupPassword,
    onSuccess: async () => {
      const nextUser = {
        ...user,
        requiresPasswordSetup: false,
      };

      toast.success("Mật khẩu đã được tạo. Đang chuyển tiếp…");
      setUser(nextUser);
      await redirectAfterSetup({
        nextPath,
        queryClient,
        replace,
        setUser,
        fallbackUser: nextUser,
      });
    },
    onError: (err: unknown) => {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Không thể thiết lập mật khẩu. Vui lòng thử lại.";
      toast.error(message);
    },
  });

  const handleSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (password !== confirmPassword) {
      toast.error("Mật khẩu xác nhận không khớp.");
      return;
    }

    if (password.length < 6) {
      toast.error("Mật khẩu cần ít nhất 6 ký tự.");
      return;
    }

    setupPasswordMutation.mutate({ password });
  };

  if (!isAuthReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-primary">
        <p className="text-text-muted">Đang xác thực phiên đăng nhập…</p>
      </div>
    );
  }

  if (!hasSession) {
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-primary px-4">
      <div className="w-full max-w-md motion-fade-up">
        <div className="rounded-2xl border border-border-default bg-bg-surface p-8 shadow-lg motion-hover-lift">
          <div className="mb-8 flex justify-center px-1">
            <BrandLogoLockup
              variant="auth"
              className="max-w-full flex-wrap justify-center"
              priority
            />
          </div>
          <h1 className="text-2xl font-semibold text-text-primary text-center mb-2">
            Tạo mật khẩu
          </h1>
          <p className="text-sm text-text-muted text-center mb-6">
            {source === "google"
              ? "Đăng nhập Google đã thành công. Hoàn tất bước cuối để tiếp tục."
              : "Tài khoản này cần được thiết lập mật khẩu trước khi sử dụng."}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="setup-password"
                className="block text-sm font-medium text-text-primary mb-1"
              >
                Mật khẩu mới
              </label>
              <input
                id="setup-password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-lg border border-border-default bg-bg-surface px-3 py-2.5 text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-border-focus/30 transition-colors duration-200"
                placeholder="Ít nhất 6 ký tự"
              />
            </div>

            <div>
              <label
                htmlFor="setup-confirm-password"
                className="block text-sm font-medium text-text-primary mb-1"
              >
                Xác nhận mật khẩu
              </label>
              <input
                id="setup-confirm-password"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="w-full rounded-lg border border-border-default bg-bg-surface px-3 py-2.5 text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-border-focus/30 transition-colors duration-200"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={setupPasswordMutation.isPending}
              className="w-full rounded-lg bg-primary py-2.5 font-medium text-text-inverse hover:bg-primary-hover active:bg-primary-active focus:outline-none focus:ring-2 focus:ring-border-focus focus:ring-offset-2 disabled:opacity-60 transition-colors duration-200"
            >
              {setupPasswordMutation.isPending
                ? "Đang lưu mật khẩu…"
                : "Hoàn tất và tiếp tục"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-text-muted">
            Bạn cần hoàn tất bước này trước khi dùng các route đã đăng nhập.
          </p>
          <p className="mt-2 text-center">
            <button
              type="button"
              onClick={async () => {
                try {
                  await authApi.logout();
                } finally {
                  setUser(createGuestUser());
                  replace("/auth/login");
                }
              }}
              className="text-sm text-primary hover:text-primary-hover font-medium"
            >
              Đăng xuất và quay lại đăng nhập
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function SetupPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-bg-primary">
          <p className="text-text-muted">Đang tải…</p>
        </div>
      }
    >
      <SetupPasswordPageContent />
    </Suspense>
  );
}
