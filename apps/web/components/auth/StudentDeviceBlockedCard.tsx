"use client";

import { useState } from "react";
import { BrandLogoLockup } from "@/components/BrandLogoLockup";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

type StudentDeviceBlockedCardProps = {
  /** Đang gửi lại đăng nhập kèm «đăng xuất mọi thiết bị». */
  forcePending: boolean;
  /** Học sinh xác nhận đăng xuất mọi thiết bị cũ và vào trên máy này. */
  onForceLogoutOthers: () => void;
  onRetry: () => void;
};

/**
 * Màn «tài khoản đang đăng nhập ở thiết bị khác» (`409 DEVICE_ACTIVE`, hoặc
 * Google callback `error=device_blocked`). Học sinh vừa chứng minh danh tính
 * nên được chọn đăng xuất mọi thiết bị cũ — máy đăng nhập sau cùng thắng.
 */
export function StudentDeviceBlockedCard({
  forcePending,
  onForceLogoutOthers,
  onRetry,
}: StudentDeviceBlockedCardProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

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
          <h1 className="mb-4 text-center text-xl font-semibold text-text-primary sm:text-2xl">
            Tài khoản đang đăng nhập ở thiết bị khác
          </h1>
          <div className="mb-6 rounded-lg border border-error/20 bg-error/10 p-4">
            <p className="text-center text-sm text-error">
              Mỗi học sinh chỉ đăng nhập trên một thiết bị tại một thời điểm.
            </p>
          </div>
          <p className="text-sm text-text-secondary">
            Nếu thiết bị cũ không còn dùng (mất máy, quên đăng xuất, đổi trình
            duyệt), bạn có thể đăng xuất tất cả thiết bị cũ và đăng nhập ngay
            trên thiết bị này.
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              disabled={forcePending}
              className="min-h-11 w-full rounded-lg bg-primary px-4 py-2.5 font-medium text-text-inverse transition-colors duration-200 hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-border-focus focus:ring-offset-2 active:bg-primary-active disabled:cursor-not-allowed disabled:opacity-60"
            >
              {forcePending
                ? "Đang đăng nhập..."
                : "Đăng xuất tất cả thiết bị và đăng nhập"}
            </button>
            <button
              type="button"
              onClick={onRetry}
              disabled={forcePending}
              className="min-h-11 w-full rounded-lg border border-border-default px-4 py-2.5 font-medium text-text-primary transition-colors duration-200 hover:bg-bg-secondary focus:outline-none focus:ring-2 focus:ring-border-focus focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Quay lại
            </button>
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Đăng xuất tất cả thiết bị?"
        description="Thiết bị đang đăng nhập tài khoản này sẽ bị đăng xuất ngay và thấy thông báo tài khoản vừa đăng nhập ở thiết bị khác. Nếu đó không phải bạn, hãy đổi mật khẩu sau khi vào."
        confirmLabel="Đăng xuất và đăng nhập"
        cancelLabel="Huỷ"
        variant="destructive"
        confirmPending={forcePending}
        onConfirm={() => {
          setConfirmOpen(false);
          onForceLogoutOthers();
        }}
      />
    </div>
  );
}
