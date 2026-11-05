"use client";

import { CheckIcon, SwatchIcon } from "@heroicons/react/24/outline";
import Image from "next/image";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { useTheme } from "@/context/ThemeContext";
import {
  type AppThemeId,
  THEME_OPTIONS,
} from "@/dtos/theme.dto";
import brandLogo from "@/image/logo/logo.png";

const previewSwatches: Record<AppThemeId, string> = {
  light:
    "linear-gradient(135deg,var(--ue-theme-preview-light-start),var(--ue-theme-preview-light-end))",
  dark:
    "linear-gradient(135deg,var(--ue-theme-preview-dark-start),var(--ue-theme-preview-dark-end))",
  pink:
    "linear-gradient(135deg,var(--ue-theme-preview-pink-start),var(--ue-theme-preview-pink-end))",
};

type Props = {
  compact: boolean;
  /** Đóng drawer mobile sau khi chọn theme. */
  onMobileClose?: () => void;
};

export function SidebarThemePicker({ compact, onMobileClose }: Props) {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t)) return;
      if (triggerRef.current?.contains(t)) return;
      close();
    };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [open, close]);

  const selectTheme = (t: AppThemeId) => {
    setTheme(t);
    onMobileClose?.();
    setOpen(false);
    toast.success("Đã đổi giao diện.");
    triggerRef.current?.focus();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`sidebar-item flex size-11 shrink-0 items-center justify-center rounded-full border border-transparent text-text-muted transition-colors duration-200 hover:border-border-default hover:bg-bg-tertiary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-secondary md:size-10 ${compact ? "" : ""}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? titleId : undefined}
        title="Giao diện"
        aria-label="Chọn giao diện (sáng / tối / hoa anh đào)"
      >
        <SwatchIcon className="size-5" aria-hidden />
      </button>

      {open
        ? createPortal(
            <div
              className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center sm:p-6"
              role="presentation"
            >
              <button
                type="button"
                className="absolute inset-0 bg-bg-primary/75 backdrop-blur-[2px]"
                aria-label="Đóng"
                onClick={close}
              />
              <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-border-default bg-bg-surface shadow-[0_24px_64px_-24px_color-mix(in_srgb,var(--ue-text-primary)_32%,transparent)]"
              >
                <div className="border-b border-border-default px-5 py-4">
                  <h2
                    id={titleId}
                    className="text-lg font-semibold tracking-tight text-text-primary"
                  >
                    Chọn giao diện
                  </h2>
                  <p className="mt-1 text-sm text-text-secondary">
                    Logo và màu nền thay đổi theo lựa chọn. Đã lưu trên thiết bị
                    này.
                  </p>
                </div>

                <ul className="max-h-[min(70vh,28rem)] divide-y divide-border-default overflow-y-auto p-2">
                  {THEME_OPTIONS.map((opt) => {
                    const selected = theme === opt.id;
                    return (
                      <li key={opt.id}>
                        <button
                          type="button"
                          onClick={() => selectTheme(opt.id)}
                          className={`flex w-full items-center gap-4 rounded-xl px-3 py-3 text-left transition-colors hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus ${selected ? "bg-bg-secondary" : ""}`}
                        >
                          <span
                            className="relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border-default shadow-inner"
                            style={{ background: previewSwatches[opt.id] }}
                            aria-hidden
                          >
                            <Image
                              src={brandLogo}
                              alt=""
                              width={40}
                              height={40}
                              className="size-10 object-contain"
                            />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block font-semibold text-text-primary">
                              {opt.title}
                            </span>
                            <span className="mt-0.5 block text-sm text-text-secondary">
                              {opt.description}
                            </span>
                          </span>
                          {selected ? (
                            <CheckIcon
                              className="size-6 shrink-0 text-primary"
                              aria-hidden
                            />
                          ) : (
                            <span className="size-6 shrink-0" aria-hidden />
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
