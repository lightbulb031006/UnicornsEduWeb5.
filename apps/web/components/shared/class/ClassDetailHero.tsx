import type { ReactNode } from "react";
import { ClassCoverImageCard } from "@/components/shared/class/ClassCoverImageCard";
import { cn } from "@/lib/utils";

type ClassDetailHeroProps = {
  classId: string;
  title: string;
  /** Chip trạng thái / khoá / workspace, hiện trên tên lớp. */
  badges?: ReactNode;
  /** Nút sửa, kết thúc lớp… cạnh tên lớp. */
  actions?: ReactNode;
  className?: string;
};

/**
 * Đầu trang chi tiết lớp (admin + staff): ảnh bìa, tên lớp, chip và nút thao tác
 * trong một thẻ. Mobile xếp dọc (ảnh trên), từ `sm` ảnh nằm trái.
 */
export function ClassDetailHero({
  classId,
  title,
  badges,
  actions,
  className,
}: ClassDetailHeroProps) {
  return (
    <header
      className={cn(
        "mb-4 flex flex-col gap-4 rounded-2xl border border-border-default bg-bg-surface p-3 shadow-sm sm:mb-5 sm:flex-row sm:p-4",
        className,
      )}
    >
      <ClassCoverImageCard
        classId={classId}
        className="shrink-0 sm:w-56 lg:w-64"
      />

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {/* Chip + nút chung một hàng phía trên để tên lớp có trọn chiều ngang. */}
        {badges || actions ? (
          <div className="flex flex-wrap items-center gap-2">
            {badges ? (
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                {badges}
              </div>
            ) : null}
            {actions ? (
              <div className="ml-auto flex shrink-0 items-center gap-2">
                {actions}
              </div>
            ) : null}
          </div>
        ) : null}

        <h1 className="break-words text-lg font-semibold leading-snug text-text-primary sm:text-xl">
          {title}
        </h1>
      </div>
    </header>
  );
}

/** Chip trạng thái lớp: đang chạy xanh, đã kết thúc xám. */
export function ClassStatusBadge({
  running,
  label,
}: {
  running: boolean;
  label: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium",
        running
          ? "bg-success/15 text-success"
          : "bg-text-muted/15 text-text-muted",
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          running ? "bg-success" : "bg-text-muted",
        )}
        aria-hidden
      />
      {label}
    </span>
  );
}

export const classHeroChipClassName =
  "inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary";
