"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { Download, X } from "lucide-react";
import { downloadAvatar, suggestAvatarFilename } from "@/lib/avatar";
import { toast } from "sonner";

type ImageLightboxProps = {
  open: boolean;
  onClose: () => void;
  src: string;
  title?: string;
  alt?: string;
};

export default function ImageLightbox({
  open,
  onClose,
  src,
  title,
  alt = "",
}: ImageLightboxProps) {
  const titleId = useId();
  const [mounted, setMounted] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const heading = title?.trim() || "Ảnh minh chứng";

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open || !mounted || !src.trim()) return null;

  const handleDownload = async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    try {
      const filename = suggestAvatarFilename(heading, src).replace(
        "-avatar.",
        "-achievement.",
      );
      await downloadAvatar(src, filename);
      toast.success("Đã tải ảnh minh chứng.");
    } catch {
      toast.error("Không tải được ảnh minh chứng. Vui lòng thử lại.");
    } finally {
      setIsDownloading(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[90] flex flex-col bg-black/90">
      <button
        type="button"
        className="absolute inset-0 z-0 cursor-zoom-out"
        aria-label="Đóng xem ảnh"
        onClick={onClose}
      />

      <div className="relative z-20 flex shrink-0 items-center justify-between gap-3 px-3 py-3 sm:px-5">
        <h2
          id={titleId}
          className="min-w-0 truncate text-sm font-medium text-white sm:text-base"
        >
          {heading}
        </h2>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => void handleDownload()}
            disabled={isDownloading}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/25 text-white hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-50"
            aria-label="Tải ảnh"
            title="Tải ảnh"
          >
            <Download className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/25 text-white hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            aria-label="Đóng"
            title="Đóng"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 flex min-h-0 flex-1 items-center justify-center p-3 sm:p-6"
        onClick={onClose}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt || heading}
          className="max-h-full max-w-full object-contain"
          onClick={(event) => event.stopPropagation()}
        />
      </div>
    </div>,
    document.body,
  );
}
