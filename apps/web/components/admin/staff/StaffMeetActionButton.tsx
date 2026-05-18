"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type StaffMeetActionButtonProps = {
  meetLink?: string | null;
  className?: string;
};

function isHttpOrHttpsUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export default function StaffMeetActionButton({
  meetLink,
  className,
}: StaffMeetActionButtonProps) {
  const normalizedMeetLink = meetLink?.trim() ?? "";
  const hasMeetLink = normalizedMeetLink.length > 0;
  const isValidMeetLink = hasMeetLink && isHttpOrHttpsUrl(normalizedMeetLink);
  const disabled = !isValidMeetLink;

  const handleClick = useCallback(async () => {
    if (!isValidMeetLink) return;

    const opened = window.open(normalizedMeetLink, "_blank");
    if (opened) {
      opened.opener = null;
    }

    try {
      await navigator.clipboard.writeText(normalizedMeetLink);
      if (opened) {
        toast.success("Đã copy link và mở Google Meet.");
        return;
      }
      toast.warning("Đã copy link, nhưng trình duyệt chặn mở tab.");
    } catch {
      if (opened) {
        toast.warning("Đã mở Google Meet, nhưng không copy được link.");
        return;
      }
      toast.error("Không mở hoặc copy được link Google Meet.");
    }
  }, [isValidMeetLink, normalizedMeetLink]);

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={disabled}
      aria-disabled={disabled}
      aria-label="Copy link Google Meet và vào lớp"
      title={
        disabled
          ? hasMeetLink
            ? "Link Google Meet của nhân sự này chưa hợp lệ"
            : "Nhân sự này chưa có link Google Meet"
          : "Copy link Google Meet và mở tab mới"
      }
      className={cn(
        "inline-flex min-h-10 w-full touch-manipulation items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface sm:w-auto",
        disabled
          ? "cursor-not-allowed border-border-default bg-bg-secondary text-text-muted opacity-70"
          : "border-primary/35 bg-primary text-text-inverse hover:bg-primary-hover",
        className,
      )}
    >
      <span
        className="relative inline-flex size-4 shrink-0 items-center justify-center"
        aria-hidden
      >
        <svg
          className="absolute size-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
      </span>
      Copy & vào lớp
    </button>
  );
}
