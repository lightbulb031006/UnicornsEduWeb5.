"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { EnvelopeIcon } from "@heroicons/react/24/outline";
import { useAuth } from "@/context/AuthContext";
import type { UserInfoDto } from "@/dtos/Auth.dto";
import * as authApi from "@/lib/apis/auth.api";
import {
  EMAIL_VERIFICATION_RESEND_COOLDOWN_MS,
  type EmailVerificationModalRequest,
  isAuthenticatedUser,
  maskEmailAddress,
  OPEN_EMAIL_VERIFICATION_MODAL_EVENT,
  readEmailVerificationSentRecord,
  writeEmailVerificationSentRecord,
} from "@/lib/email-verification-access";
import { useResendCooldown } from "@/hooks/use-resend-cooldown";
import { ResponsiveDialog } from "@/components/ui/ResponsiveDialog";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { SentToEmailNotice } from "@/components/auth/SentToEmailNotice";

type DialogView = "closed" | "prompt" | "enter-email" | "sent";

type SentState = { email: string; sentAt: number };

const TITLE_ID = "email-verification-dialog-title";
const DESCRIPTION_ID = "email-verification-dialog-description";

const secondaryButtonClassName =
  "min-h-11 rounded-lg border border-border-default bg-bg-surface px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-60";
const primaryButtonClassName =
  "min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-60";

function getErrorMessage(error: unknown) {
  const ax = error as { response?: { data?: { message?: string } } };
  return ax.response?.data?.message ?? "Không gửi được email xác minh.";
}

/**
 * Popup xác minh email dùng chung cho mọi role. Mở bằng
 * `openEmailVerificationModal()`; một lần bấm là gửi mail, gửi xong hiện
 * «Đã gửi thành công tới ...abcd@domain» kèm Gửi lại (chờ 60 giây) và Đóng.
 */
export function EmailVerificationDialog() {
  const queryClient = useQueryClient();
  const { user, setUser } = useAuth();
  const [view, setView] = useState<DialogView>("closed");
  const [sent, setSent] = useState<SentState | null>(null);
  const [emailInput, setEmailInput] = useState("");
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);

  const currentEmail = user.email?.trim() ?? "";
  const secondsLeft = useResendCooldown(
    sent?.sentAt ?? null,
    EMAIL_VERIFICATION_RESEND_COOLDOWN_MS,
  );

  const sendMutation = useMutation({
    mutationFn: (email?: string) =>
      authApi.resendVerificationEmail(email ? { email } : {}),
    onSuccess: (payload) => {
      const sentEmail = payload.email?.trim() || currentEmail;
      const patch: Partial<UserInfoDto> = {
        email: sentEmail,
        emailVerified: false,
      };
      setUser((currentUser) => ({ ...currentUser, ...patch }));
      queryClient.setQueryData(["auth", "session"], (prev?: UserInfoDto) =>
        prev ? { ...prev, ...patch } : prev,
      );
      const record = { email: sentEmail, sentAt: Date.now() };
      writeEmailVerificationSentRecord({ userId: user.id, ...record });
      setSent(record);
      setEmailInput("");
      setView("sent");
    },
    onError: (error: unknown) => {
      // Gửi lỗi chỉ toast, không mở popup «đã gửi».
      toast.error(getErrorMessage(error));
    },
  });

  // Giữ handler mới nhất mà không phải gắn lại listener mỗi lần render.
  const handleRequestRef = useRef<
    (request: EmailVerificationModalRequest) => void
  >(() => {});
  useEffect(() => {
    handleRequestRef.current = (request) => {
      if (!isAuthenticatedUser(user)) return;
      const record = readEmailVerificationSentRecord(user.id);

      if (request.kind === "sent") {
        const next = { email: request.email, sentAt: Date.now() };
        writeEmailVerificationSentRecord({ userId: user.id, ...next });
        setSent(next);
        setView("sent");
        return;
      }

      if (!currentEmail) {
        setView("enter-email");
        return;
      }

      const sentRecently =
        record !== null &&
        record.email.toLowerCase() === currentEmail.toLowerCase() &&
        Date.now() - record.sentAt < EMAIL_VERIFICATION_RESEND_COOLDOWN_MS;

      if (request.kind === "send" && !sentRecently) {
        if (!sendMutation.isPending) sendMutation.mutate(undefined);
        return;
      }

      if (record) {
        setSent({ email: record.email, sentAt: record.sentAt });
        setView("sent");
        return;
      }

      setView("prompt");
    };
  });

  useEffect(() => {
    const handleOpen = (event: Event) => {
      const detail = (event as CustomEvent<EmailVerificationModalRequest>)
        .detail;
      handleRequestRef.current(detail ?? { kind: "status" });
    };
    window.addEventListener(OPEN_EMAIL_VERIFICATION_MODAL_EVENT, handleOpen);
    return () => {
      window.removeEventListener(
        OPEN_EMAIL_VERIFICATION_MODAL_EVENT,
        handleOpen,
      );
    };
  }, []);

  if (view === "closed" || !isAuthenticatedUser(user)) {
    return null;
  }

  const close = () => {
    setView("closed");
    setEmailInput("");
    setConfirmDiscardOpen(false);
  };

  const requestClose = () => {
    if (sendMutation.isPending) return;
    if (view === "enter-email" && emailInput.trim().length > 0) {
      setConfirmDiscardOpen(true);
      return;
    }
    close();
  };

  return (
    <>
      <ResponsiveDialog
        size="md"
        labelledBy={TITLE_ID}
        describedBy={DESCRIPTION_ID}
        onBackdropClick={requestClose}
        className="z-100"
      >
        <div className="flex flex-col gap-4 overflow-y-auto p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <EnvelopeIcon className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <h2
                id={TITLE_ID}
                className="text-lg font-semibold text-text-primary"
              >
                {view === "sent"
                  ? "Đã gửi email xác minh"
                  : "Vui lòng xác minh email"}
              </h2>
              <p
                id={DESCRIPTION_ID}
                className="mt-1 text-sm text-text-secondary"
              >
                {view === "sent"
                  ? "Bấm liên kết trong email để hoàn tất xác minh. Không thấy mail thì kiểm tra thư mục Spam."
                  : "Cần xác minh email để mở các trang cá nhân và lớp học."}
              </p>
            </div>
          </div>

          {view === "sent" && sent ? (
            <SentToEmailNotice maskedEmail={maskEmailAddress(sent.email)} />
          ) : null}

          {view === "prompt" ? (
            <p className="rounded-lg border border-border-default bg-bg-secondary px-3 py-2 text-sm text-text-primary">
              Email nhận xác minh:{" "}
              <span className="break-all font-medium">
                {maskEmailAddress(currentEmail)}
              </span>
            </p>
          ) : null}

          {view === "enter-email" ? (
            <form
              id="email-verification-form"
              onSubmit={(event) => {
                event.preventDefault();
                const email = emailInput.trim();
                if (email) sendMutation.mutate(email);
              }}
            >
              <label
                htmlFor="verification-email"
                className="mb-1 block text-xs font-medium text-text-muted"
              >
                Nhập email để nhận liên kết xác minh
              </label>
              <input
                id="verification-email"
                type="email"
                required
                autoComplete="email"
                value={emailInput}
                onChange={(event) => setEmailInput(event.target.value)}
                placeholder="you@example.com"
                className="min-h-11 w-full rounded-lg border border-border-default bg-bg-primary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-border-focus/20"
              />
            </form>
          ) : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={requestClose}
              disabled={sendMutation.isPending}
              className={secondaryButtonClassName}
            >
              Đóng
            </button>

            {view === "sent" ? (
              <button
                type="button"
                disabled={sendMutation.isPending || secondsLeft > 0}
                onClick={() => sendMutation.mutate(undefined)}
                className={primaryButtonClassName}
              >
                {sendMutation.isPending
                  ? "Đang gửi…"
                  : secondsLeft > 0
                    ? `Gửi lại (${secondsLeft} giây)`
                    : "Gửi lại"}
              </button>
            ) : null}

            {view === "prompt" ? (
              <button
                type="button"
                disabled={sendMutation.isPending}
                onClick={() => sendMutation.mutate(undefined)}
                className={primaryButtonClassName}
              >
                {sendMutation.isPending ? "Đang gửi…" : "Gửi email xác minh"}
              </button>
            ) : null}

            {view === "enter-email" ? (
              <button
                type="submit"
                form="email-verification-form"
                disabled={
                  sendMutation.isPending || emailInput.trim().length === 0
                }
                className={primaryButtonClassName}
              >
                {sendMutation.isPending ? "Đang gửi…" : "Gửi email xác minh"}
              </button>
            ) : null}
          </div>
        </div>
      </ResponsiveDialog>

      <ConfirmDialog
        open={confirmDiscardOpen}
        onOpenChange={setConfirmDiscardOpen}
        title="Bỏ email vừa nhập?"
        description="Email bạn vừa nhập chưa được gửi xác minh."
        confirmLabel="Bỏ"
        cancelLabel="Tiếp tục nhập"
        variant="destructive"
        onConfirm={close}
      />
    </>
  );
}
