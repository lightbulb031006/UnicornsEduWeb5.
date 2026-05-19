"use client";

import Link from "next/link";
import { useState } from "react";
import type { SyntheticEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import * as authApi from "@/lib/apis/auth.api";
import { BrandLogoLockup } from "@/components/BrandLogoLockup";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");

  const forgotPasswordMutation = useMutation({
    mutationFn: (body: { email: string }) => authApi.forgotPassword(body),
    onSuccess: () => {
      toast.success(
        "Nếu email tồn tại và đã xác thực, bạn sẽ nhận được link đặt lại mật khẩu. Kiểm tra hộp thư (và thư mục spam).",
      );
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Gửi yêu cầu thất bại. Thử lại sau.";
      toast.error(msg);
    },
  });

  const handleSubmit = (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    forgotPasswordMutation.mutate({ email });
  };

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
            Quên mật khẩu
          </h1>
          <p className="text-sm text-text-muted text-center mb-6">
            Nhập email đăng ký để nhận link đặt lại mật khẩu
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="forgot-email"
                className="block text-sm font-medium text-text-primary mb-1"
              >
                Email
              </label>
              <input
                id="forgot-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-border-default bg-bg-surface px-3 py-2.5 text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-border-focus/30 transition-colors duration-200"
                placeholder="you@example.com"
              />
            </div>

            <button
              type="submit"
              disabled={forgotPasswordMutation.isPending}
              className="w-full rounded-lg bg-primary py-2.5 font-medium text-text-inverse hover:bg-primary-hover active:bg-primary-active focus:outline-none focus:ring-2 focus:ring-border-focus focus:ring-offset-2 disabled:opacity-60 transition-colors duration-200"
            >
              {forgotPasswordMutation.isPending
                ? "Đang gửi..."
                : "Gửi link đặt lại mật khẩu"}
            </button>
          </form>

          <p className="mt-6 text-center">
            <Link
              href="/auth/login"
              className="text-sm text-primary hover:text-primary-hover font-medium"
            >
              ← Quay lại đăng nhập
            </Link>
          </p>
          <p className="mt-2 text-center">
            <Link
              href="/"
              className="text-sm text-text-secondary hover:text-text-primary"
            >
              Về trang chủ
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
