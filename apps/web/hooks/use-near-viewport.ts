"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * `true` từ lần đầu phần tử vào gần viewport (`rootMargin`) và giữ nguyên sau đó,
 * dùng để lazy-mount nội dung nặng (trình phát video) trong danh sách dài.
 */
export function useNearViewport<T extends Element>(
  ref: RefObject<T | null>,
  rootMargin = "300px",
) {
  const [near, setNear] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, rootMargin, near]);

  return near;
}
