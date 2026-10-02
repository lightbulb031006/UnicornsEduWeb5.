"use client";

import { useEffect, useRef, useState } from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

function liveAnnouncement(leftMs: number): string {
  if (leftMs <= 0) return "Hết giờ";
  const totalSec = Math.ceil(leftMs / 1000);
  const mm = Math.floor(totalSec / 60);
  if (mm === 0) return "Còn dưới một phút";
  return `Còn ${mm} phút`;
}

export default function StudentAttemptTimer({
  endsAt,
  onExpire,
}: {
  remainingMs?: number;
  endsAt: string;
  onExpire?: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const expiredRef = useRef(false);
  const onExpireRef = useRef(onExpire);
  const left = Math.max(0, new Date(endsAt).getTime() - now);

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (left > 0 || expiredRef.current) return;
    expiredRef.current = true;
    onExpireRef.current?.();
  }, [left]);

  const totalSec = Math.ceil(left / 1000);
  const mm = Math.floor(totalSec / 60);
  const ss = totalSec % 60;
  const urgent = totalSec <= 60;

  return (
    <div
      className={cn(
        "sticky top-0 z-30 -mx-1 mb-4 flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 shadow-sm backdrop-blur-sm",
        urgent
          ? "border-error/40 bg-error/10 text-error supports-[backdrop-filter]:bg-error/15"
          : "border-border-default bg-bg-surface text-text-primary supports-[backdrop-filter]:bg-bg-surface/95",
      )}
      role="timer"
    >
      <span className="inline-flex items-center gap-2 text-sm font-semibold">
        <Clock className="size-4" aria-hidden />
        Thời gian còn lại
      </span>
      <span aria-hidden="true" className="font-mono text-lg font-bold tabular-nums">
        {String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}
      </span>
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {liveAnnouncement(left)}
      </span>
    </div>
  );
}
