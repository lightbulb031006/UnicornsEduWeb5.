"use client";

import { useState } from "react";
import Image from "next/image";
import { getClassMascot } from "@/lib/class-mascot";
import { cn } from "@/lib/utils";

type ClassCoverArtProps = {
  classId: string;
  /** Signed URL ảnh bìa; null/undefined = hiện mascot theo ID lớp. */
  coverImageUrl?: string | null;
  className?: string;
  /** Bật hiệu ứng phóng nhẹ khi hover nhóm cha (`group`). */
  hoverZoom?: boolean;
};

/** Khung ảnh bìa lớp tỉ lệ 16:9: ảnh bìa nếu có, ngược lại mascot kỳ lân trên nền tint. */
export function ClassCoverArt({
  classId,
  coverImageUrl,
  className,
  hoverZoom = false,
}: ClassCoverArtProps) {
  const zoomClassName = hoverZoom
    ? "transition-transform duration-300 group-hover:scale-105 motion-reduce:transition-none"
    : undefined;

  // Signed URL hết hạn/lỗi tải → quay về mascot; đổi URL thì thử lại.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  if (coverImageUrl && coverImageUrl !== failedUrl) {
    return (
      <div className={cn("relative aspect-[16/9] overflow-hidden bg-bg-tertiary", className)}>
        {/* Signed URL Supabase đổi mỗi lần tải; dùng <img> để không phụ thuộc remotePatterns của next/image. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={coverImageUrl}
          alt=""
          onError={() => setFailedUrl(coverImageUrl)}
          className={cn("absolute inset-0 size-full object-cover", zoomClassName)}
        />
      </div>
    );
  }

  const mascot = getClassMascot(classId);
  return (
    <div
      className={cn(
        "flex aspect-[16/9] items-center justify-center",
        mascot.tintClassName,
        className,
      )}
    >
      <div className="relative aspect-square h-3/4">
        <Image
          src={mascot.src}
          alt=""
          fill
          sizes="160px"
          className={cn("object-contain", zoomClassName)}
        />
      </div>
    </div>
  );
}
