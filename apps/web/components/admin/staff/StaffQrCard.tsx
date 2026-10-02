"use client";

import Image from "next/image";
import { useEffect, useId, useState } from "react";
import {
  ResponsiveActionFooter,
  ResponsiveDialog,
  ResponsiveDialogBody,
} from "@/components/ui/ResponsiveDialog";
import {
  STAFF_QR_SCANNABLE_PIXEL,
  buildStaffQrDisplaySrc,
} from "@/lib/staff-qr-image";

function isHttpOrHttpsUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function openOriginalLink(url: string) {
  if (!isHttpOrHttpsUrl(url)) return;
  window.open(url, "_blank", "noopener,noreferrer");
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
  const previewTitleId = useId();

  const hasLink = Boolean(qrLink?.trim());
  const displayUrl = qrLink?.trim() || "";
  const thumbnail = hasLink
    ? buildStaffQrDisplaySrc(displayUrl, pixel)
    : null;
  const preview = hasLink
    ? buildStaffQrDisplaySrc(displayUrl, STAFF_QR_SCANNABLE_PIXEL)
    : null;
  const canOpenOriginal = hasLink && isHttpOrHttpsUrl(displayUrl);

  const [previewOpen, setPreviewOpen] = useState(false);
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

  const mainInteractive = allowEdit || hasLink;

  const handleMainClick = () => {
    if (hasLink) {
      setPreviewOpen(true);
      return;
    }
    if (allowEdit) {
      onEditClick();
    }
  };

  const thumbnailLabel = hasLink
    ? imageFailed
      ? "Không sinh được mã QR, nhấn để xem chi tiết"
      : "Xem mã QR thanh toán đủ lớn để quét"
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
              ? "Không sinh được mã QR thanh toán, nhấn để xem chi tiết"
              : "Đã có QR thanh toán, nhấn để xem mã đủ lớn để quét"
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
              : "Xem mã / quét QR"
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
      {mainInteractive ? (
        <button
          type="button"
          onClick={handleMainClick}
          className={`relative flex touch-manipulation flex-col items-center justify-center transition-colors duration-200 ${boxClass} ${
            isMinimal
              ? `cursor-pointer ${hasLink ? "hover:bg-bg-tertiary/80" : "opacity-75 hover:opacity-100"}`
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

      {previewOpen && preview ? (
        <ResponsiveDialog
          labelledBy={previewTitleId}
          onBackdropClick={() => setPreviewOpen(false)}
          size="sm"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-border-subtle p-4 sm:p-5">
            <h2
              id={previewTitleId}
              className="text-lg font-semibold text-text-primary"
            >
              QR thanh toán
            </h2>
            <button
              type="button"
              onClick={() => setPreviewOpen(false)}
              className="rounded p-1 text-text-muted transition-colors duration-200 hover:bg-bg-tertiary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
              aria-label="Đóng"
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
          <ResponsiveDialogBody className="space-y-3">
            {imageFailed ? (
              <p className="text-sm text-text-secondary">
                Không sinh được mã QR. Hãy mở link gốc để kiểm tra, hoặc thử lại
                sau.
              </p>
            ) : (
              <div className="mx-auto w-full max-w-none sm:max-w-sm">
                <Image
                  src={preview}
                  alt="Mã QR thanh toán đủ lớn để quét"
                  width={STAFF_QR_SCANNABLE_PIXEL}
                  height={STAFF_QR_SCANNABLE_PIXEL}
                  className="h-auto w-full bg-bg-surface object-contain"
                  unoptimized
                  referrerPolicy="no-referrer"
                  onError={() => setImageFailed(true)}
                />
              </div>
            )}
          </ResponsiveDialogBody>
          <ResponsiveActionFooter
            className={canOpenOriginal ? undefined : "min-[380px]:grid-cols-1"}
          >
            {canOpenOriginal ? (
              <button
                type="button"
                onClick={() => openOriginalLink(displayUrl)}
                className={`inline-flex min-h-11 items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors duration-200 sm:min-h-10 ${
                  imageFailed
                    ? "bg-primary text-text-inverse hover:bg-primary-hover"
                    : "border border-border-default bg-bg-surface text-text-primary hover:bg-bg-tertiary"
                }`}
              >
                Mở link gốc
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setPreviewOpen(false)}
              className={`inline-flex min-h-11 items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors duration-200 sm:min-h-10 ${
                imageFailed
                  ? "border border-border-default bg-bg-surface text-text-primary hover:bg-bg-tertiary"
                  : "bg-primary text-text-inverse hover:bg-primary-hover"
              }`}
            >
              Đóng
            </button>
          </ResponsiveActionFooter>
        </ResponsiveDialog>
      ) : null}
    </section>
  );
}
