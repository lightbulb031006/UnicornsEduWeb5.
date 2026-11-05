"use client";

import type { KeyboardEvent, MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { hasTextSelection, isFromNestedInteractive } from "@/lib/row-link";

/**
 * Props cho card / dòng bảng bấm vào đâu cũng mở trang chi tiết.
 * Nút / link con vẫn giữ hành động riêng; Enter trên card cũng mở chi tiết;
 * Ctrl/⌘ + click hoặc click chuột giữa mở tab mới.
 */
export function useRowLink() {
  const router = useRouter();

  return (href: string, label: string) => ({
    role: "link" as const,
    tabIndex: 0,
    "aria-label": label,
    onClick: (event: MouseEvent<HTMLElement>) => {
      if (isFromNestedInteractive(event.target, event.currentTarget)) return;
      if (hasTextSelection()) return;
      if (event.metaKey || event.ctrlKey) {
        window.open(href, "_blank", "noopener");
        return;
      }
      router.push(href);
    },
    onAuxClick: (event: MouseEvent<HTMLElement>) => {
      if (event.button !== 1) return;
      if (isFromNestedInteractive(event.target, event.currentTarget)) return;
      window.open(href, "_blank", "noopener");
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (event.key !== "Enter" || event.target !== event.currentTarget) return;
      event.preventDefault();
      router.push(href);
    },
  });
}
