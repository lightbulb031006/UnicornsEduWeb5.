"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ResponsiveDialog } from "@/components/ui/ResponsiveDialog";
import type { UserDetailWithStaff } from "@/dtos/user.dto";
import * as userApi from "@/lib/apis/user.api";
import { getUserDisplayName } from "@/lib/user-manage-form";

const TITLE_ID = "set-user-password-title";
const DESCRIPTION_ID = "set-user-password-description";
const MIN_PASSWORD_LENGTH = 6;
const DEFAULT_PASSWORD = "123456";

const INPUT_CLASS =
  "mt-1 min-h-11 w-full rounded-xl border border-border-default bg-bg-surface px-3.5 py-2.5 text-sm text-text-primary shadow-sm transition-[border-color,box-shadow] duration-200 placeholder:text-text-muted focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus/40";

type Props = {
  user: UserDetailWithStaff;
  open: boolean;
  onClose: () => void;
};

export default function SetUserPasswordDialog({ user, open, onClose }: Props) {
  if (!open) return null;
  // Mount lại mỗi lần mở để form luôn trống.
  return <SetUserPasswordForm user={user} onClose={onClose} />;
}

function SetUserPasswordForm({
  user,
  onClose,
}: Omit<Props, "open">) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);

  const displayName = getUserDisplayName(user) || user.accountHandle || user.email;
  const isDirty = password.length > 0 || confirmPassword.length > 0;

  const mutation = useMutation({
    mutationFn: (newPassword: string) =>
      userApi.setUserPassword(user.id, { newPassword }),
    onSuccess: () => {
      toast.success(`Đã đổi mật khẩu cho ${displayName}.`);
      onClose();
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ??
        (err as Error)?.message ??
        "Đổi mật khẩu thất bại.";
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

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Mật khẩu tối thiểu ${MIN_PASSWORD_LENGTH} ký tự.`);
      return;
    }
    if (password !== confirmPassword) {
      setError("Mật khẩu nhập lại không khớp.");
      return;
    }
    setError(null);
    mutation.mutate(password);
  };

  const fillDefaultPassword = () => {
    setPassword(DEFAULT_PASSWORD);
    setConfirmPassword(DEFAULT_PASSWORD);
    setShowPassword(true);
    setError(null);
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
            <h2 id={TITLE_ID} className="text-base font-semibold text-text-primary">
              Đổi mật khẩu
            </h2>
            <p id={DESCRIPTION_ID} className="mt-1 text-sm text-text-secondary">
              Đặt mật khẩu mới cho{" "}
              <span className="font-semibold text-text-primary">{displayName}</span>.
              User sẽ bị đăng xuất khỏi mọi thiết bị.
            </p>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-text-secondary">
              Mật khẩu mới
            </span>
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
              className={INPUT_CLASS}
              autoComplete="new-password"
              aria-invalid={Boolean(error)}
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-text-secondary">
              Nhập lại mật khẩu
            </span>
            <input
              type={showPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setError(null);
              }}
              className={INPUT_CLASS}
              autoComplete="new-password"
              aria-invalid={Boolean(error)}
            />
          </label>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex min-h-11 items-center gap-2 text-sm text-text-primary">
              <input
                type="checkbox"
                checked={showPassword}
                onChange={(e) => setShowPassword(e.target.checked)}
                className="size-4 rounded border-border-default text-primary focus:ring-border-focus"
              />
              Hiện mật khẩu
            </label>
            <button
              type="button"
              onClick={fillDefaultPassword}
              className="min-h-11 rounded-md px-3 text-sm font-medium text-primary transition hover:bg-primary/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            >
              Dùng {DEFAULT_PASSWORD}
            </button>
          </div>

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
              {mutation.isPending ? "Đang lưu…" : "Đổi mật khẩu"}
            </button>
          </div>
        </form>
      </ResponsiveDialog>

      <ConfirmDialog
        open={confirmDiscardOpen}
        onOpenChange={setConfirmDiscardOpen}
        title="Bỏ mật khẩu vừa nhập?"
        description="Mật khẩu mới chưa được lưu."
        confirmLabel="Bỏ"
        cancelLabel="Tiếp tục nhập"
        variant="destructive"
        onConfirm={onClose}
      />
    </>
  );
}
