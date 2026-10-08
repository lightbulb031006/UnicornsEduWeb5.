"use client";

import {
  useId,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { ImageOff, Trophy, X } from "lucide-react";
import type { AchievementDto, AchievementOwnerRef } from "@/dtos/achievement.dto";
import * as achievementApi from "@/lib/apis/achievement.api";
import { staffAchievementsButtonLabel } from "@/lib/staff-achievements";
import ImageLightbox from "@/components/ui/ImageLightbox";
import {
  ResponsiveDialog,
  ResponsiveDialogBody,
} from "@/components/ui/ResponsiveDialog";
import { Skeleton } from "@/components/ui/skeleton";

/** Nút «Xem thành tích (n)» trong dòng danh sách; không hiện khi n = 0. */
export function StaffAchievementsButton({
  count,
  onOpen,
  className = "",
}: {
  count: number | null | undefined;
  onOpen: () => void;
  className?: string;
}) {
  const label = staffAchievementsButtonLabel(count);
  if (!label) return null;

  // Dòng danh sách tự điều hướng khi click / Enter: chặn để chỉ mở popup.
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onOpen();
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Enter" || event.key === " ") event.stopPropagation();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={`inline-flex min-h-10 items-center gap-1.5 rounded-md text-xs font-medium text-primary underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${className}`}
    >
      <Trophy className="size-3.5 shrink-0" aria-hidden />
      {label}
    </button>
  );
}

/** Popup chỉ đọc: thành tích nhân sự theo thứ tự hồ sơ, bấm ảnh để phóng to. */
export default function StaffAchievementsDialog({
  staffId,
  staffName,
  onClose,
  mode = "admin",
}: {
  staffId: string;
  staffName: string;
  onClose: () => void;
  /** `training`: Ban Đào Tạo đọc qua endpoint đã lọc field. */
  mode?: "admin" | "training";
}) {
  const titleId = useId();
  const owner: AchievementOwnerRef = { kind: "staff", mode, staffId };
  const [preview, setPreview] = useState<{ src: string; title: string } | null>(
    null,
  );
  const closePreview = () => setPreview(null);
  const { data: items = [], isLoading, isError } = useQuery({
    queryKey: achievementApi.achievementQueryKey(owner),
    queryFn: () => achievementApi.listAchievements(owner),
  });

  return (
    <ResponsiveDialog
      size="lg"
      labelledBy={titleId}
      // Escape khi đang xem ảnh chỉ đóng lightbox, không đóng popup.
      onBackdropClick={() => {
        if (!preview) onClose();
      }}
    >
      <div className="flex items-start justify-between gap-3 border-b border-border-subtle px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2 id={titleId} className="text-base font-semibold text-text-primary">
            Thành tích
          </h2>
          <p className="truncate text-sm text-text-muted">{staffName || "Nhân sự"}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          aria-label="Đóng"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <ResponsiveDialogBody>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        ) : isError ? (
          <p className="rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
            Không tải được thành tích.
          </p>
        ) : items.length === 0 ? (
          <p className="py-6 text-center text-sm text-text-muted">
            Nhân sự chưa có thành tích.
          </p>
        ) : (
          <ol className="space-y-2">
            {items.map((item, index) => (
              <AchievementReadonlyRow
                key={item.id}
                item={item}
                order={index + 1}
                onPreview={setPreview}
              />
            ))}
          </ol>
        )}
      </ResponsiveDialogBody>
      <ImageLightbox
        open={Boolean(preview)}
        onClose={closePreview}
        src={preview?.src ?? ""}
        title={preview?.title}
      />
    </ResponsiveDialog>
  );
}

function AchievementReadonlyRow({
  item,
  order,
  onPreview,
}: {
  item: AchievementDto;
  order: number;
  onPreview: (preview: { src: string; title: string }) => void;
}) {
  const title = item.title?.trim() || "Thành tích";
  return (
    <li className="flex items-center gap-3 rounded-lg border border-border-default bg-bg-secondary/20 p-2">
      {item.imageUrl ? (
        <button
          type="button"
          onClick={() => onPreview({ src: item.imageUrl!, title })}
          className="size-16 shrink-0 cursor-zoom-in overflow-hidden rounded-md border border-border-default focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          aria-label={`Phóng to ảnh: ${title}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
        </button>
      ) : (
        <span className="flex size-16 shrink-0 flex-col items-center justify-center gap-0.5 rounded-md border border-dashed border-border-default text-[11px] text-text-muted">
          <ImageOff className="size-4" aria-hidden />
          Chưa có ảnh
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xs text-text-muted">#{order}</p>
        <p className="text-sm font-medium text-text-primary wrap-anywhere">{title}</p>
      </div>
    </li>
  );
}
