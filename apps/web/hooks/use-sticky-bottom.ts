"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * Mép dưới (px, tính từ mép trên vùng cuộn) của một phần tử sticky khi đang
 * dính: `top` + chiều cao, đo lại khi phần tử đổi cỡ. Phần tử khác muốn dính
 * ngay bên dưới dùng giá trị này làm `top`. `enabled` false hoặc chưa đo → null.
 */
export function useStickyBottom(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean,
): number | null {
  const [bottom, setBottom] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return;
    // ResizeObserver gọi callback ngay lần observe đầu → có giá trị ban đầu.
    const observer = new ResizeObserver(() => {
      const top = Number.parseFloat(getComputedStyle(el).top);
      setBottom(Number.isNaN(top) ? null : top + el.offsetHeight);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, enabled]);

  return enabled ? bottom : null;
}
