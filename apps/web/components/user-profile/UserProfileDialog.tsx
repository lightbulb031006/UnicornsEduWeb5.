"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useId, useState, type MouseEvent, type ReactNode } from "react";
import BodyPortal from "@/components/ui/BodyPortal";
import {
  ResponsiveDialog,
  ResponsiveDialogBody,
} from "@/components/ui/ResponsiveDialog";
import UserProfileEditor from "@/components/user-profile/UserProfileEditor";
import {
  isSameTabNavigation,
  profileFullQueryOptions,
} from "@/lib/profile-full-query";

type UserProfileDialogProps = {
  onClose: () => void;
};

/**
 * Popup hồ sơ cá nhân: cùng `UserProfileEditor` với trang `/user-profile` (lưu khi rời ô).
 * Render qua portal vì sidebar staff có `transform` + `overflow-hidden`, `fixed` bên trong sẽ bị cắt.
 */
export function UserProfileDialog({ onClose }: UserProfileDialogProps) {
  const titleId = useId();
  const {
    data: profile,
    isLoading,
    isError,
    refetch,
  } = useQuery(profileFullQueryOptions);

  // Escape/backdrop không làm ô đang sửa mất focus; blur trước để ô đó kịp lưu rồi mới gỡ popup.
  const close = () => {
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
    onClose();
  };

  const closeOnLinkNavigation = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest("a[href]");
    if (!anchor) return;
    if (isSameTabNavigation(event, anchor.getAttribute("target"))) close();
  };

  let body: ReactNode;
  if (isLoading) {
    body = (
      <div className="space-y-3" aria-busy="true">
        <div className="h-24 animate-pulse rounded-2xl bg-bg-secondary" />
        <div className="h-48 animate-pulse rounded-2xl bg-bg-secondary" />
      </div>
    );
  } else if (isError || !profile) {
    body = (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <p className="text-sm text-text-secondary">
          Không tải được hồ sơ. Thử lại hoặc mở trang hồ sơ.
        </p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="min-h-11 rounded-lg border border-border-default px-4 text-sm font-medium text-text-primary transition-colors hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
        >
          Thử lại
        </button>
      </div>
    );
  } else {
    body = <UserProfileEditor profile={profile} />;
  }

  return (
    <BodyPortal>
      <ResponsiveDialog
        size="5xl"
        labelledBy={titleId}
        onBackdropClick={close}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border-subtle px-4 py-3 sm:px-5">
          <h2
            id={titleId}
            className="min-w-0 truncate text-base font-semibold text-text-primary sm:text-lg"
          >
            Hồ sơ của tôi
          </h2>
          <div className="flex shrink-0 items-center gap-1">
            <Link
              href="/user-profile"
              prefetch={false}
              onClick={close}
              className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-primary transition-colors hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            >
              Mở trang hồ sơ
            </Link>
            <button
              type="button"
              onClick={close}
              aria-label="Đóng hồ sơ"
              className="flex size-11 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-bg-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            >
              <svg
                className="size-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden
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
        </div>
        <ResponsiveDialogBody>
          <div onClickCapture={closeOnLinkNavigation}>{body}</div>
        </ResponsiveDialogBody>
      </ResponsiveDialog>
    </BodyPortal>
  );
}

type UserProfileDialogTriggerProps = {
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
  title?: string;
};

/** Nút khối tên/avatar trong shell: mở popup hồ sơ thay vì chuyển trang. */
export function UserProfileDialogTrigger({
  children,
  className,
  ariaLabel,
  title,
}: UserProfileDialogTriggerProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        title={title}
      >
        {children}
      </button>
      {open ? <UserProfileDialog onClose={() => setOpen(false)} /> : null}
    </>
  );
}

export default UserProfileDialog;
