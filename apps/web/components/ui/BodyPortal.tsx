"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type BodyPortalProps = {
  children: ReactNode;
};

/**
 * Render children vào `document.body` qua React portal, nhưng chỉ sau khi
 * component đã mount ở client.
 *
 * Lý do: `createPortal(node, document.body)` gọi trực tiếp trong thân render sẽ
 * đọc biến toàn cục của browser ngay trong pha render — trên server (SSR/RSC
 * payload của Next.js) `document` không tồn tại nên sẽ crash, và nếu có tồn tại
 * thì output server/client cũng lệch nhau gây hydration mismatch.
 *
 * Trả về `null` ở lần render đầu (server + hydration pass), rồi mới portal sau
 * khi effect chạy → server và client render giống nhau.
 */
export function BodyPortal({ children }: BodyPortalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return createPortal(children, document.body);
}

export default BodyPortal;
