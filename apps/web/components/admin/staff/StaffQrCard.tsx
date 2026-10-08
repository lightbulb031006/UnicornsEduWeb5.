"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { buildStaffQrDisplaySrc } from "@/lib/staff-qr-image";

function isHttpOrHttpsUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

type Props = {
  qrLink: string | null;
  onEditClick: () => void;
  className?: string;
  /** `minimal`: tiny corner QR. `compact`: dense block. `default`: full card. */
  size?: "default" | "compact" | "minimal";
  /** Strip outer card chrome; use inside another section. */
  embedded?: boolean;
  /** When false, hide edit control and block "add QR" flow (read-only / open link only). */
  allowEdit?: boolean;
};

export default function StaffQrCard({
  qrLink,
  onEditClick,
  className = "",
  size = "default",
  embedded = false,
  allowEdit = true,
}: Props) {
  const isMinimal = size === "minimal";
  const isCompact = size === "compact";
  const pixel = isMinimal ? 64 : isCompact ? 100 : 150;

  const hasLink = Boolean(qrLink?.trim());
  const displayUrl = qrLink?.trim() || "";
  const thumbnail = hasLink
    ? buildStaffQrDisplaySrc(displayUrl, pixel)
    : null;
  const canOpenOriginal = hasLink && isHttpOrHttpsUrl(displayUrl);

  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [displayUrl]);

  const imgClass = isMinimal
    ? "size-12 object-contain"
    : isCompact
      ? "size-[72px] object-contain"
      : "size-28 object-contain";
  const boxClass = isMinimal
    ? "size-[52px] shrink-0 rounded-md border border-border-subtle bg-bg-secondary/30 p-0.5"
    : isCompact
      ? "min-h-[88px] min-w-[88px] max-w-[104px] gap-1.5 rounded-md border-2 border-dashed px-2 py-2"
      : "min-h-[140px] w-full min-w-[140px] max-w-[160px] gap-2 rounded-lg border-2 border-dashed";
  const iconClass = isMinimal ? "size-7" : isCompact ? "size-10" : "size-14";
  const captionClass = isCompact
    ? "max-w-[5.5rem] text-[10px] leading-tight"
    : "text-xs";

  const outerClass = embedded
    ? `relative ${className}`
    : `relative flex flex-col items-center justify-center rounded-lg border border-border-default bg-bg-surface p-4 shadow-sm transition-colors duration-200 sm:p-5 ${className}`;

  const borderTone = isMinimal
    ? ""
    : hasLink
      ? "border-primary/30 bg-primary/5 hover:border-primary/45 hover:bg-primary/10"
      : "border-border-default bg-bg-secondary/50 opacity-80 hover:bg-bg-tertiary hover:opacity-95";

  const thumbnailLabel = hasLink
    ? imageFailed
      ? "Không sinh được mã QR, nhấn để mở link"
      : "Mở link QR thanh toán"
    : allowEdit
      ? "Thêm link QR thanh toán"
      : undefined;

  const mainBody = (
    <>
      {hasLink && thumbnail && !imageFailed ? (
        <Image
          src={thumbnail}
          alt=""
          width={isMinimal ? 48 : isCompact ? 72 : 112}
          height={isMinimal ? 48 : isCompact ? 72 : 112}
          className={imgClass}
          unoptimized
          referrerPolicy="no-referrer"
          onError={() => setImageFailed(true)}
        />
      ) : hasLink && imageFailed ? (
        <svg
          className={`${iconClass} text-danger`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.75}
            d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
          />
        </svg>
      ) : (
        <svg
          className={`${iconClass} text-text-muted`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.75}
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
          />
        </svg>
      )}
      {isMinimal ? (
        <span className="sr-only">
          {hasLink
            ? imageFailed
              ? "Không sinh được mã QR thanh toán, nhấn để mở link"
              : "Đã có QR thanh toán, nhấn để mở link"
            : allowEdit
              ? "Chưa có link QR, nhấn để thêm"
              : "Chưa có link QR thanh toán"}
        </span>
      ) : (
        <span
          className={`text-center font-medium ${
            imageFailed ? "text-danger" : "text-text-muted"
          } ${captionClass}`}
        >
          {hasLink
            ? imageFailed
              ? "Không sinh được mã"
              : "Mở link QR"
            : allowEdit
              ? "Thêm link"
              : "Chưa có link"}
        </span>
      )}
    </>
  );

  return (
    <section className={outerClass} aria-label="QR thanh toán">
      {allowEdit ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEditClick();
          }}
          className={`absolute z-10 rounded p-0.5 text-text-muted transition-colors duration-200 hover:bg-bg-tertiary hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${
            embedded ? "right-0 top-0" : "right-2 top-2"
          }`}
          title="Chỉnh sửa link QR"
          aria-label="Chỉnh sửa link QR thanh toán"
        >
          <svg
            className={isMinimal ? "size-3" : "size-3.5 sm:size-4"}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
            />
          </svg>
        </button>
      ) : null}
      {canOpenOriginal ? (
        <a
          href={displayUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`relative flex touch-manipulation flex-col items-center justify-center transition-colors duration-200 ${boxClass} ${
            isMinimal
              ? "cursor-pointer hover:bg-bg-tertiary/80"
              : `border-dashed ${borderTone} cursor-pointer`
          }`}
          title={thumbnailLabel}
          aria-label={thumbnailLabel}
        >
          {mainBody}
        </a>
      ) : allowEdit && !hasLink ? (
        <button
          type="button"
          onClick={onEditClick}
          className={`relative flex touch-manipulation flex-col items-center justify-center transition-colors duration-200 ${boxClass} ${
            isMinimal
              ? "cursor-pointer opacity-75 hover:opacity-100"
              : `border-dashed ${borderTone} cursor-pointer`
          }`}
          title={thumbnailLabel}
          aria-label={thumbnailLabel}
        >
          {mainBody}
        </button>
      ) : (
        <div
          className={`relative flex flex-col items-center justify-center ${boxClass} ${
            isMinimal ? "cursor-default opacity-75" : `border-dashed ${borderTone} cursor-default`
          }`}
        >
          {mainBody}
        </div>
      )}
    </section>
  );
}
