"use client";

import { useEffect, useState } from "react";

/**
 * Số giây còn phải chờ trước khi được gửi lại, tính từ `lastSentAt`.
 * Trả 0 khi đã hết chờ hoặc chưa gửi lần nào.
 */
export function useResendCooldown(
  lastSentAt: number | null,
  cooldownMs: number,
): number {
  const [now, setNow] = useState(() => Date.now());
  const endsAt = lastSentAt === null ? 0 : lastSentAt + cooldownMs;

  useEffect(() => {
    if (endsAt <= Date.now()) return;
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= endsAt) {
        window.clearInterval(timer);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [endsAt]);

  return Math.max(0, Math.ceil((endsAt - Math.max(now, lastSentAt ?? 0)) / 1000));
}
