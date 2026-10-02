"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  getFocusableElements,
  hasNestedAlertDialog,
  lockBodyScroll,
  unlockBodyScroll,
} from "@/lib/dialog-a11y";

type ResponsiveDialogSize =
  | "sm"
  | "md"
  | "lg"
  | "xl"
  | "2xl"
  | "3xl"
  | "4xl"
  | "5xl"
  | "6xl"
  | "7xl"
  | "full";

type ResponsiveDialogProps = {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  labelledBy?: string;
  describedBy?: string;
  onBackdropClick?: () => void;
  size?: ResponsiveDialogSize;
};

const sizeClasses: Record<ResponsiveDialogSize, string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-lg",
  xl: "sm:max-w-xl",
  "2xl": "sm:max-w-2xl",
  "3xl": "sm:max-w-3xl",
  "4xl": "sm:max-w-4xl",
  "5xl": "sm:max-w-5xl",
  "6xl": "sm:max-w-6xl",
  "7xl": "sm:max-w-7xl",
  full: "sm:max-w-[96vw] max-w-[1600px]",
};

export function ResponsiveDialog({
  children,
  className,
  contentClassName,
  labelledBy,
  describedBy,
  onBackdropClick,
  size = "md",
}: ResponsiveDialogProps) {
  const resolvedSizeClass = sizeClasses[size] || sizeClasses.md;
  const panelRef = useRef<HTMLDivElement>(null);
  const onBackdropClickRef = useRef(onBackdropClick);
  useEffect(() => {
    onBackdropClickRef.current = onBackdropClick;
  }, [onBackdropClick]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    lockBodyScroll();

    const focusables = getFocusableElements(panel);
    if (focusables[0]) {
      focusables[0].focus();
    } else {
      panel.tabIndex = -1;
      panel.focus();
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (hasNestedAlertDialog()) return;

      if (event.key === "Escape") {
        event.preventDefault();
        onBackdropClickRef.current?.();
        return;
      }

      if (event.key !== "Tab") return;
      const items = getFocusableElements(panel);
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      unlockBodyScroll();
      previouslyFocused?.focus?.();
    };
  }, []);

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-end justify-center p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-center sm:p-4",
        className,
      )}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
    >
      <button
        type="button"
        className="absolute inset-0 bg-bg-primary/70"
        aria-label="Đóng"
        onClick={onBackdropClick}
      />
      <div
        ref={panelRef}
        className={cn(
          "relative z-10 flex min-h-0 max-h-[calc(100dvh-1.5rem)] w-full min-w-0 max-w-[100vw] flex-col overflow-hidden rounded-2xl border border-border-default bg-bg-surface shadow-2xl sm:max-h-[calc(100dvh-2rem)]",
          resolvedSizeClass,
          contentClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}

type ResponsiveDialogBodyProps = {
  children: ReactNode;
  className?: string;
};

export function ResponsiveDialogBody({
  children,
  className,
}: ResponsiveDialogBodyProps) {
  return (
    <div className={cn("min-h-0 flex-1 overflow-y-auto p-4 sm:p-5", className)}>
      {children}
    </div>
  );
}

type ResponsiveActionFooterProps = {
  children: ReactNode;
  className?: string;
};

export function ResponsiveActionFooter({
  children,
  className,
}: ResponsiveActionFooterProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-2 border-t border-border-subtle bg-bg-surface p-4 min-[380px]:grid-cols-2 sm:p-5",
        className,
      )}
    >
      {children}
    </div>
  );
}
