"use client";

import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import * as authApi from "@/lib/apis/auth.api";
import { BrandLogoLockup } from "@/components/BrandLogoLockup";
import { AuthCardSkeleton } from "@/components/auth/AuthCardSkeleton";
import type { VerifyLoginStatus } from "@/dtos/Auth.dto";
import { authKeys } from "@/lib/query-keys";

type VerifyState = "loading" | VerifyLoginStatus | "system";

const STATE_CONTENT: Record<
  Exclude<VerifyState, "loading">,
  { tone: "success" | "primary" | "error"; title: string; message: string }
> = {
  verified: {
    tone: "success",
    title: "Xác minh thành công",
    message:
      "Đã xác minh yêu cầu đăng nhập. Quay lại máy/laptop vừa bấm Đăng nhập (màn hình “Chờ xác minh”) để hoàn tất — phiên được kích hoạt tại thiết bị đó.",
  },
  used: {
    tone: "primary",
    title: "Liên kết đã được sử dụng",
    message:
      "Liên kết xác minh này chỉ dùng được một lần và đã được bấm trước đó. Nếu bạn vẫn cần đăng nhập, hãy bấm Đăng nhập trên máy bạn muốn dùng.",
  },
  expired: {
    tone: "error",
    title: "Liên kết đã hết hạn",
    message:
      "Liên kết xác minh chỉ có hiệu lực 10 phút và đã hết hạn. Vui lòng đăng nhập lại để nhận một liên kết mới.",
  },
  invalid: {
    tone: "error",
    title: "Liên kết không hợp lệ",
    message:
      "Liên kết không hợp lệ hoặc đã bị cắt mất phần token. Vui lòng kiểm tra lại email hoặc đăng nhập lại.",
  },
  system: {
    tone: "error",
    title: "Không xác minh được",
    message:
      "Hệ thống gặp sự cố hoặc mất kết nối. Kiểm tra mạng rồi tải lại trang, hoặc đăng nhập lại để nhận liên kết mới.",
  },
};

const TONE_STYLES = {
  success: {
    chip: "bg-success/10",
    icon: "text-success",
    path: "M4.5 12.75l6 6 9-13.5",
  },
  primary: {
    chip: "bg-primary/10",
    icon: "text-primary",
    path: "M4.5 12.75l6 6 9-13.5",
  },
  error: {
    chip: "bg-error/10",
    icon: "text-error",
    path: "M6 18L18 6M6 6l12 12",
  },
} as const;

function VerifyLoginContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const query = useQuery({
    queryKey: authKeys.verifyLogin(token ?? ""),
    queryFn: () => authApi.verifyLoginLink(token!),
    enabled: Boolean(token),
    retry: false,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  const state: VerifyState = !token
    ? "invalid"
    : query.isError
      ? "system"
      : query.data
        ? query.data.status
        : "loading";

  const content =
    state === "loading" ? null : STATE_CONTENT[state] ?? STATE_CONTENT.invalid;
  const tone = content ? TONE_STYLES[content.tone] : null;

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

          {state === "loading" && (
            <div className="text-center">
              <div className="mx-auto mb-5 size-8 animate-spin rounded-full border-2 border-border-default border-t-primary" />
              <p className="text-text-secondary">Đang xác minh…</p>
            </div>
          )}

          {content && tone && (
            <div className="text-center">
              <div className="mb-4 flex justify-center">
                <div
                  className={`flex size-12 items-center justify-center rounded-full ${tone.chip}`}
                >
                  <svg
                    className={`size-6 ${tone.icon}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d={tone.path}
                    />
                  </svg>
                </div>
              </div>
              <h1 className="text-xl font-semibold text-text-primary mb-2">
                {content.title}
              </h1>
              <p className="text-sm leading-6 text-text-secondary">
                {content.message}
              </p>
            </div>
          )}

          <p className="mt-6 text-center text-xs text-text-muted">
            Đóng trang này và quay lại thiết bị vừa đăng nhập.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function VerifyLoginPage() {
  return (
    <Suspense
      fallback={
        <AuthCardSkeleton
          showInlineActions={false}
          showDivider={false}
          showSecondaryButton={false}
          footerRows={0}
        />
      }
    >
      <VerifyLoginContent />
    </Suspense>
  );
}
