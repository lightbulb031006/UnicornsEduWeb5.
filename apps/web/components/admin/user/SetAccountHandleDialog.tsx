"use client";

import { useState } from "react";
import {
  useMutation,
  useQueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ResponsiveDialog } from "@/components/ui/ResponsiveDialog";
import type { AccountHandleResult } from "@/dtos/user.dto";
import {
  ACCOUNT_HANDLE_MAX_LENGTH,
  validateAccountHandle,
} from "@/lib/account-handle";

const TITLE_ID = "set-account-handle-title";
const DESCRIPTION_ID = "set-account-handle-description";

const INPUT_CLASS =
  "mt-1 min-h-11 w-full rounded-xl border border-border-default bg-bg-surface px-3.5 py-2.5 text-sm text-text-primary shadow-sm transition-[border-color,box-shadow] duration-200 placeholder:text-text-muted focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus/40";

type Props = {
  /** Tên hiển thị trong dialog / toast. */
  displayName: string;
  /** Tên đăng nhập hiện tại — điền sẵn vào ô nhập. */
  currentHandle: string | null | undefined;
  open: boolean;
  onClose: () => void;
  /**
   * Gọi API tương ứng vai trò người sửa: `/users/:id/account-handle` (Admin,
   * Trưởng phòng Sale & CSKH với học sinh), `/sale-cs-team/members/...`,
   * `/training/tutors/...`.
   */
  mutationFn: (accountHandle: string) => Promise<AccountHandleResult>;
  /** Query cần làm mới sau khi đổi (chi tiết học sinh / nhân sự...). */
  invalidateKeys: QueryKey[];
};

/** Đổi tên đăng nhập (16/11). Không đăng xuất thiết bị đang đăng nhập. */
export default function SetAccountHandleDialog({ open, ...props }: Props) {
  if (!open) return null;
  // Mount lại mỗi lần mở để ô nhập luôn lấy handle mới nhất.
  return <SetAccountHandleForm {...props} />;
}

function SetAccountHandleForm({
  displayName,
  currentHandle,
  onClose,
  mutationFn,
  invalidateKeys,
}: Omit<Props, "open">) {
  const initialHandle = currentHandle ?? "";
  const [handle, setHandle] = useState(initialHandle);
  const [error, setError] = useState<string | null>(null);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);
  const queryClient = useQueryClient();

  const isDirty = handle.trim() !== initialHandle;

  const mutation = useMutation({
    mutationFn,
    onSuccess: async (result) => {
      await Promise.all(
        invalidateKeys.map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
      toast.success(
        `Đã đổi tên đăng nhập của ${displayName} thành @${result.accountHandle}.`,
      );
      onClose();
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ??
        (err as Error)?.message ??
        "Đổi tên đăng nhập thất bại.";
      toast.error(msg);
    },
  });

  const requestClose = () => {
    if (mutation.isPending) return;
    if (isDirty) {
      setConfirmDiscardOpen(true);
      return;
    }
    onClose();
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (mutation.isPending) return;

    const result = validateAccountHandle(handle);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    if (result.value === initialHandle) {
      onClose();
      return;
    }
    setError(null);
    mutation.mutate(result.value);
  };

  return (
    <>
      <ResponsiveDialog
        size="md"
        labelledBy={TITLE_ID}
        describedBy={DESCRIPTION_ID}
        onBackdropClick={requestClose}
        className="z-[80]"
      >
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 overflow-y-auto p-4 sm:p-5"
          noValidate
        >
          <div>
            <h2
              id={TITLE_ID}
              className="text-base font-semibold text-text-primary"
            >
              Đổi tên đăng nhập
            </h2>
            <p id={DESCRIPTION_ID} className="mt-1 text-sm text-text-secondary">
              Đặt tên đăng nhập mới cho{" "}
              <span className="font-semibold text-text-primary">
                {displayName}
              </span>
              . Lần đăng nhập sau dùng tên mới; mật khẩu giữ nguyên.
            </p>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-text-secondary">
              Tên đăng nhập mới
            </span>
            <input
              type="text"
              value={handle}
              onChange={(e) => {
                setHandle(e.target.value);
                setError(null);
              }}
              className={INPUT_CLASS}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              maxLength={ACCOUNT_HANDLE_MAX_LENGTH + 10}
              placeholder="vd: nguyenvana"
              aria-invalid={Boolean(error)}
              aria-describedby="set-account-handle-hint"
              autoFocus
            />
            <span
              id="set-account-handle-hint"
              className="mt-1 block text-xs text-text-muted"
            >
              3–50 ký tự, không khoảng trắng, không ký tự @. Không trùng tài
              khoản khác (không phân biệt hoa thường).
            </span>
          </label>

          {error ? (
            <p className="text-sm text-error" aria-live="polite">
              {error}
            </p>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={requestClose}
              disabled={mutation.isPending}
              className="min-h-11 flex-1 rounded-md border border-border-default bg-bg-surface px-4 py-2.5 text-sm font-medium text-text-primary transition hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="min-h-11 flex-1 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-text-inverse transition hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none"
            >
              {mutation.isPending ? "Đang lưu…" : "Đổi tên đăng nhập"}
            </button>
          </div>
        </form>
      </ResponsiveDialog>

      <ConfirmDialog
        open={confirmDiscardOpen}
        onOpenChange={setConfirmDiscardOpen}
        title="Bỏ tên đăng nhập vừa nhập?"
        description="Tên đăng nhập mới chưa được lưu."
        confirmLabel="Bỏ"
        cancelLabel="Tiếp tục nhập"
        variant="destructive"
        onConfirm={onClose}
      />
    </>
  );
}
