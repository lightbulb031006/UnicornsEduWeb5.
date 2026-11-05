"use client";

import { useEffect, useRef } from "react";
import {
  UNSAVED_CLOSE_CONFIRM,
  type ConfirmRequest,
} from "@/components/ui/ConfirmDialog";
import { isSameTabNavigation } from "@/lib/profile-full-query";

/**
 * Khi `dirty`: hỏi trước khi đóng tab/reload (`beforeunload`) và trước khi bấm link
 * chuyển trang cùng tab. Đồng ý thì click lại đúng link đó để luồng điều hướng gốc
 * (Next `Link`, handler đóng popup…) chạy như bình thường.
 */
export function useUnsavedChangesGuard(
  dirty: boolean,
  confirm: (opts: ConfirmRequest) => Promise<boolean>,
) {
  const bypassRef = useRef(false);

  useEffect(() => {
    if (!dirty) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    const onClickCapture = (event: MouseEvent) => {
      if (bypassRef.current) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.hasAttribute("download")) return;
      if (!isSameTabNavigation(event, anchor.getAttribute("target"))) return;
      const url = new URL(anchor.href, window.location.href);
      const samePage =
        url.origin === window.location.origin &&
        url.pathname === window.location.pathname &&
        url.search === window.location.search;
      if (samePage) return;

      event.preventDefault();
      event.stopPropagation();
      void confirm(UNSAVED_CLOSE_CONFIRM).then((ok) => {
        if (!ok) return;
        bypassRef.current = true;
        try {
          anchor.click();
        } finally {
          bypassRef.current = false;
        }
      });
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClickCapture, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClickCapture, true);
    };
  }, [dirty, confirm]);
}
