"use client";

import type { ReactNode } from "react";
import PreviewableUserAvatar from "@/components/ui/PreviewableUserAvatar";
import UserAvatar from "@/components/ui/UserAvatar";
import type { StaffStatus } from "@/dtos/staff.dto";
import { pickAvatarUrl } from "@/lib/avatar";
import { ROLE_LABELS } from "@/lib/staff.constants";

const STATUS_LABELS: Record<StaffStatus, string> = {
  active: "Hoạt động",
  inactive: "Ngừng hoạt động",
};

const AVATAR_CLASS =
  "size-14 bg-bg-tertiary text-xl font-semibold text-text-primary ring-2 ring-border-default sm:size-16 sm:text-2xl";

const IDENTITY_TITLE = "Xem và chỉnh sửa thông tin nhân sự";

type Props = {
  fullName: string;
  avatarUrl: string | null;
  status: StaffStatus;
  /** Ẩn chip role khi người xem không được thấy role (vd Quản lý lớp xem gia sư). */
  roles?: readonly string[];
  /** Chip phụ cạnh role (vd «Đã khoá tài khoản»). */
  badges?: ReactNode;
  /** Dòng phụ dưới chip (trường học, % CSKH…). */
  meta?: ReactNode;
  /** Nút thao tác; mobile xuống dòng dưới, desktop nằm bên phải. */
  actions?: ReactNode;
  /**
   * Có → avatar + tên thành nút mở dialog thông tin nhân sự (như admin bấm
   * avatar/tên mở `EditStaffPopup`). Không có → avatar chỉ xem ảnh.
   */
  onIdentityClick?: () => void;
};

/**
 * Đầu trang hồ sơ nhân sự theo bố cục `/admin/staffs/:id`: avatar to có chấm
 * trạng thái, tên, chip role, nút thao tác.
 */
export default function StaffDetailHero({
  fullName,
  avatarUrl,
  status,
  roles,
  badges,
  meta,
  actions,
  onIdentityClick,
}: Props) {
  const name = fullName.trim() || "Nhân sự";
  const hasChips = (roles?.length ?? 0) > 0 || badges != null;
  const src = pickAvatarUrl(avatarUrl);
  const fallback = name.charAt(0).toUpperCase();

  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <div className="relative flex shrink-0">
          {onIdentityClick ? (
            <button
              type="button"
              onClick={onIdentityClick}
              className="inline-flex shrink-0 rounded-full transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary"
              aria-label={`Mở thông tin nhân sự ${name}`}
              title={IDENTITY_TITLE}
            >
              <UserAvatar
                src={src}
                fallback={fallback}
                alt={`Avatar ${name}`}
                className={AVATAR_CLASS}
              />
            </button>
          ) : (
            <PreviewableUserAvatar
              src={src}
              fallback={fallback}
              alt={`Avatar ${name}`}
              displayName={name}
              className={AVATAR_CLASS}
            />
          )}
          <span
            className={`absolute bottom-0 right-0 block size-3 rounded-full border-2 border-bg-surface ${status === "active" ? "bg-success" : "bg-error"}`}
            title={STATUS_LABELS[status]}
            aria-hidden
          />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="min-w-0 truncate text-lg font-semibold text-text-primary sm:text-xl">
            {onIdentityClick ? (
              <button
                type="button"
                onClick={onIdentityClick}
                className="max-w-full truncate rounded-md text-left underline-offset-4 transition-colors hover:text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary"
                title={IDENTITY_TITLE}
              >
                {name}
              </button>
            ) : (
              name
            )}
          </h1>
          <p className="sr-only">Trạng thái: {STATUS_LABELS[status]}</p>
          {hasChips ? (
            <div className="flex flex-wrap gap-1.5">
              {roles?.map((role) => (
                <span
                  key={role}
                  className="inline-flex rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-medium text-primary"
                >
                  {ROLE_LABELS[role] ?? role}
                </span>
              ))}
              {badges}
            </div>
          ) : null}
          {meta ? (
            <div className="mt-2 text-sm text-text-secondary">{meta}</div>
          ) : null}
        </div>
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap gap-2 sm:max-w-[50%] sm:justify-end">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
