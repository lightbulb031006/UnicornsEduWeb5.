"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { UserDevice } from "@/dtos/device.dto";
import * as deviceApi from "@/lib/apis/device.api";
import { cn } from "@/lib/utils";
import {
  formatVnDate,
  formatVnDateTime,
} from "@/lib/formatters";
import {
  ResponsiveDialog,
  ResponsiveDialogBody,
  ResponsiveActionFooter,
} from "@/components/ui/ResponsiveDialog";

type Props = {
  open: boolean;
  onClose: () => void;
  studentId: string;
  studentName?: string;
};

function formatDateTime(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return formatVnDateTime(new Date(iso));
  } catch {
    return "—";
  }
}

function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return formatVnDate(new Date(iso));
  } catch {
    return "—";
  }
}

function getDeviceLabel(deviceInfo: Record<string, unknown> | null): string {
  if (!deviceInfo) return "Thiết bị không xác định";
  const platform = deviceInfo.platform as string;
  const browser = deviceInfo.browser as string;
  const os = deviceInfo.os as string;

  if (platform) return platform;
  if (browser && os) return `${browser} trên ${os}`;
  if (browser) return browser;
  if (os) return os;
  return "Thiết bị không xác định";
}

function getStatusBadgeClass(device: UserDevice): string {
  if (device.isActive) {
    return "bg-success/10 text-success ring-success/20";
  }
  return "bg-bg-tertiary text-text-muted ring-border-default";
}

function getStatusLabel(device: UserDevice): string {
  if (device.isActive) return "Đang hoạt động";
  return "Đã hết hạn";
}

function getErrorMessage(error: unknown): string {
  return (
    (error as { response?: { data?: { message?: string } } })?.response?.data
      ?.message ??
    (error as Error)?.message ??
    "Không thể tải danh sách thiết bị."
  );
}

export default function StudentDevicePopup({
  open,
  onClose,
  studentId,
  studentName,
}: Props) {
  const queryClient = useQueryClient();

  const {
    data: devices,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["student-devices", studentId],
    queryFn: () => deviceApi.getStudentDevices(studentId, true),
    enabled: open && !!studentId,
    retry: false,
  });

  const forceLogoutMutation = useMutation({
    mutationFn: deviceApi.forceLogoutDevice,
    onSuccess: () => {
      toast.success("Đã buộc đăng xuất thiết bị");
      queryClient.invalidateQueries({ queryKey: ["student-devices", studentId] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Không thể buộc đăng xuất");
    },
  });

  if (!open) return null;

  return (
    <ResponsiveDialog onBackdropClick={onClose} labelledBy="device-popup-title">
      <div className="flex items-center justify-between border-b border-border-default px-6 py-4">
        <div>
          <h2
            id="device-popup-title"
            className="text-lg font-semibold text-text-primary"
          >
            Quản trị thiết bị
          </h2>
          {studentName && (
            <p className="text-sm text-text-secondary">{studentName}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng"
          className="rounded-lg p-2 text-text-muted transition-colors hover:bg-bg-tertiary hover:text-text-primary"
        >
          <svg
            className="size-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <ResponsiveDialogBody>
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <div className="size-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        )}

        {isError && (
          <div className="rounded-lg bg-error/10 p-4 text-center text-sm text-error">
            {getErrorMessage(error)}
          </div>
        )}

        {devices && devices.length === 0 && (
          <div className="py-8 text-center text-sm text-text-muted">
            Học sinh chưa có thiết bị nào đăng nhập.
          </div>
        )}

        {devices && devices.length > 0 && (
          <div className="space-y-3">
            {devices.map((device) => (
              <div
                key={device.id}
                className={cn(
                  "rounded-xl border p-4 transition-colors",
                  device.isActive
                    ? "border-success/30 bg-success/5"
                    : "border-border-default bg-bg-secondary",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-text-primary">
                        {getDeviceLabel(device.deviceInfo)}
                      </span>
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
                          getStatusBadgeClass(device),
                        )}
                      >
                        {getStatusLabel(device)}
                      </span>
                    </div>
                    <div className="mt-1 space-y-0.5 text-xs text-text-secondary">
                      <p>IP: {device.ipAddress ?? "—"}</p>
                      <p>
                        Lần hoạt động cuối:{" "}
                        {formatDateTime(device.lastActiveAt)}
                      </p>
                      <p>Đăng nhập lúc: {formatDate(device.createdAt)}</p>
                      {device.daysSinceActive > 0 && (
                        <p className="text-text-muted">
                          {device.daysSinceActive} ngày chưa hoạt động
                        </p>
                      )}
                    </div>
                  </div>
                  {device.isActive && (
                    <button
                      type="button"
                      onClick={() => {
                        // TODO(#11): thay window.confirm bằng dialog xác nhận dùng chung khi ticket #11 merge.
                        const label = getDeviceLabel(device.deviceInfo);
                        if (
                          !window.confirm(
                            `Buộc đăng xuất thiết bị "${label}"? Học sinh sẽ phải đăng nhập lại.`,
                          )
                        ) {
                          return;
                        }
                        forceLogoutMutation.mutate(device.id);
                      }}
                      disabled={forceLogoutMutation.isPending}
                      className="shrink-0 rounded-lg border border-error/40 bg-error/10 px-3 py-1.5 text-xs font-medium text-error transition-colors hover:bg-error/20 disabled:opacity-50"
                    >
                      {forceLogoutMutation.isPending
                        ? "Đang xử lý..."
                        : "Buộc đăng xuất"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </ResponsiveDialogBody>

      <ResponsiveActionFooter>
        <button
          onClick={onClose}
          className="col-span-full rounded-lg bg-bg-tertiary px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-bg-secondary sm:col-span-1"
        >
          Đóng
        </button>
      </ResponsiveActionFooter>
    </ResponsiveDialog>
  );
}
