"use client";

import {
  memo,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ComponentProps,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type Ref,
} from "react";
import { createPortal } from "react-dom";
import UpgradedSelect from "@/components/ui/UpgradedSelect";
import { cn } from "@/lib/utils";
import {
  TIME_MINUTE_OPTIONS,
  currentTimePrefillValue,
  formatTimeValue,
  isMinuteOnPickerGrid,
  normalizeTypedTime,
  parseTimeValue,
  toTimeDisplay,
} from "./time-input.helpers";

export type TimeInputProps = Omit<ComponentProps<"input">, "type" | "step">;

type MenuPosition = {
  left: number;
  width: number;
  maxHeight: number;
  top?: number;
  bottom?: number;
};

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, hour) => {
  const label = String(hour).padStart(2, "0");
  return { value: label, label };
});

const BASE_MINUTE_OPTIONS = TIME_MINUTE_OPTIONS.map((minute) => {
  const label = String(minute).padStart(2, "0");
  return { value: label, label };
});

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (!ref) return;
  if (typeof ref === "function") {
    ref(value);
    return;
  }
  ref.current = value;
}

function emitChange(
  onChange: TimeInputProps["onChange"],
  name: string | undefined,
  nextValue: string,
) {
  if (!onChange) return;
  onChange({
    target: { value: nextValue, name: name ?? "" },
    currentTarget: { value: nextValue, name: name ?? "" },
  } as ChangeEvent<HTMLInputElement>);
}

function isInsideTimePickerChrome(target: Node | null) {
  if (!target || !(target instanceof Element)) return false;
  return Boolean(
    target.closest("[data-time-input-root]") ||
      target.closest("[data-time-input-menu]") ||
      target.closest("[data-upgraded-select-trigger]") ||
      target.closest("[data-upgraded-select-menu]"),
  );
}

function TimeInputComponent({
  className,
  disabled,
  readOnly,
  value,
  defaultValue,
  name,
  id,
  onChange,
  onBlur,
  onFocus,
  onClick,
  onKeyDown,
  ref,
  ...props
}: TimeInputProps) {
  const isControlled = value !== undefined;
  const [uncontrolledValue, setUncontrolledValue] = useState(() =>
    String(defaultValue ?? ""),
  );
  const committedValue = isControlled
    ? String(value ?? "")
    : uncontrolledValue;
  /** Text / optimistic display (`HH:mm`). */
  const [draft, setDraft] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const generatedId = useId();
  const pickerId = `${id ?? `time-input-${generatedId}`}-picker`;

  const displayValue = draft ?? toTimeDisplay(committedValue);
  const parsedCommitted = parseTimeValue(
    draft != null ? (normalizeTypedTime(draft) ?? committedValue) : committedValue,
  );

  // Drop draft once the controlled prop matches what we already show.
  useEffect(() => {
    const committedDisplay = toTimeDisplay(committedValue);
    setDraft((current) =>
      current != null && current === committedDisplay ? null : current,
    );
  }, [committedValue]);

  const minuteOptions = useMemo(() => {
    const minutes = parsedCommitted?.minutes;
    if (minutes != null && !isMinuteOnPickerGrid(minutes)) {
      const label = String(minutes).padStart(2, "0");
      return [{ value: label, label }, ...BASE_MINUTE_OPTIONS];
    }
    return BASE_MINUTE_OPTIONS;
  }, [parsedCommitted?.minutes]);

  const hourValue =
    parsedCommitted != null
      ? String(parsedCommitted.hours).padStart(2, "0")
      : "";
  const minuteValue =
    parsedCommitted != null
      ? String(parsedCommitted.minutes).padStart(2, "0")
      : "";

  const commitValue = (next: string) => {
    if (!isControlled) {
      setUncontrolledValue(next);
    }
    // Always paint the new time immediately (do not clear draft to null —
    // a sync focus() after select can otherwise restore a stale draft).
    setDraft(toTimeDisplay(next));
    emitChange(onChange, name, next);
  };

  const ensurePrefillIfEmpty = (): string => {
    if (disabled || readOnly) return committedValue;
    const liveValue =
      draft != null ? (normalizeTypedTime(draft) ?? committedValue) : committedValue;
    if (liveValue.trim() !== "") return liveValue;

    const prefilled = currentTimePrefillValue();
    commitValue(prefilled);
    return prefilled;
  };

  const openPicker = () => {
    if (disabled || readOnly) return;
    const nextValue = ensurePrefillIfEmpty();
    setDraft(toTimeDisplay(nextValue));
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: globalThis.MouseEvent | TouchEvent) => {
      if (isInsideTimePickerChrome(event.target as Node | null)) return;
      setOpen(false);
    };

    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      inputRef.current?.focus();
    };

    const touchOptions: AddEventListenerOptions = { passive: true };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown, touchOptions);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown, touchOptions);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setMenuPosition(null);
      return;
    }

    const updateMenuPosition = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;

      const viewportMargin = 16;
      const gap = 8;
      const preferredWidth = Math.max(rect.width, 260);
      const maxWidth = window.innerWidth - viewportMargin * 2;
      const width = Math.min(preferredWidth, maxWidth);
      const left = Math.min(
        Math.max(rect.left, viewportMargin),
        window.innerWidth - width - viewportMargin,
      );
      const spaceBelow = window.innerHeight - rect.bottom - viewportMargin;
      const spaceAbove = rect.top - viewportMargin;
      const shouldOpenUp = spaceBelow < 220 && spaceAbove > spaceBelow;

      setMenuPosition({
        left,
        width,
        maxHeight: Math.max(
          160,
          shouldOpenUp ? spaceAbove - gap : spaceBelow - gap,
        ),
        ...(shouldOpenUp
          ? { bottom: window.innerHeight - rect.top + gap }
          : { top: rect.bottom + gap }),
      });
    };

    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);

    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open]);

  const handleFocus = (event: FocusEvent<HTMLInputElement>) => {
    const nextValue = ensurePrefillIfEmpty();
    // Functional update: keep a draft already set by commitValue in the same tick
    // (e.g. selectMinute → focus) instead of overwriting with a stale closure.
    setDraft((current) => current ?? toTimeDisplay(nextValue));
    onFocus?.(event);
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    const related = event.relatedTarget as Node | null;
    if (isInsideTimePickerChrome(related)) {
      onBlur?.(event);
      return;
    }

    if (draft != null) {
      const normalized = normalizeTypedTime(draft);
      if (normalized === "") {
        commitValue("");
      } else if (normalized != null) {
        commitValue(normalized);
      } else {
        setDraft(null);
      }
    }

    setOpen(false);
    onBlur?.(event);
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    setDraft(event.target.value);
  };

  const handleInputClick = (event: MouseEvent<HTMLInputElement>) => {
    onClick?.(event);
    if (event.defaultPrevented || disabled || readOnly) return;
    openPicker();
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented || disabled || readOnly) return;

    if (event.key === "ArrowDown" || event.key === "F4") {
      event.preventDefault();
      openPicker();
    }
  };

  const selectHour = (nextHour: string) => {
    const hours = Number(nextHour);
    const minutes = parsedCommitted?.minutes ?? 0;
    commitValue(formatTimeValue(hours, minutes, 0));
  };

  const selectMinute = (nextMinute: string) => {
    const minutes = Number(nextMinute);
    const hours = parsedCommitted?.hours ?? new Date().getHours();
    commitValue(formatTimeValue(hours, minutes, 0));
    setOpen(false);
    // Defer focus until after commit draft is applied.
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  };

  return (
    <div ref={rootRef} data-time-input-root className="relative w-full">
      {name ? (
        <input type="hidden" name={name} value={committedValue} />
      ) : null}
      <div className="relative">
        <input
          {...props}
          ref={(node) => {
            inputRef.current = node;
            assignRef(ref, node);
          }}
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          disabled={disabled}
          readOnly={readOnly}
          aria-controls={open ? pickerId : undefined}
          aria-expanded={open}
          aria-haspopup="dialog"
          value={displayValue}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onClick={handleInputClick}
          onKeyDown={handleInputKeyDown}
          className={cn(
            !disabled && !readOnly && "cursor-pointer",
            "w-full pr-10",
            className,
          )}
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled || readOnly}
          aria-label="Mở chọn giờ"
          aria-expanded={open}
          aria-controls={open ? pickerId : undefined}
          className={cn(
            "absolute inset-y-0 right-0 flex w-10 items-center justify-center text-text-muted transition-colors",
            disabled || readOnly
              ? "cursor-not-allowed opacity-50"
              : "hover:text-text-primary",
          )}
          onMouseDown={(event) => {
            event.preventDefault();
          }}
          onClick={() => {
            if (open) {
              setOpen(false);
              return;
            }
            openPicker();
          }}
        >
          <svg
            className="size-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 6v6l4 2m4-2a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z"
            />
          </svg>
        </button>
      </div>

      {open && menuPosition && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              id={pickerId}
              role="dialog"
              aria-label="Chọn giờ 24h"
              data-time-input-menu
              className="fixed z-50 overflow-visible rounded-2xl border border-border-default bg-bg-surface p-3"
              style={{
                left: menuPosition.left,
                width: menuPosition.width,
                maxHeight: menuPosition.maxHeight,
                top: menuPosition.top,
                bottom: menuPosition.bottom,
              }}
            >
              <div className="grid grid-cols-2 gap-2">
                <div className="min-w-0 space-y-1.5">
                  <p className="px-0.5 text-xs font-medium text-text-muted">
                    Giờ
                  </p>
                  <UpgradedSelect
                    ariaLabel="Chọn giờ"
                    value={hourValue}
                    onValueChange={selectHour}
                    options={HOUR_OPTIONS}
                    placeholder="--"
                    buttonClassName="min-h-10 rounded-xl border border-border-default bg-bg-surface px-3 py-2 font-mono text-sm tabular-nums text-text-primary shadow-sm transition-colors duration-200 hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  />
                </div>
                <div className="min-w-0 space-y-1.5">
                  <p className="px-0.5 text-xs font-medium text-text-muted">
                    Phút
                  </p>
                  <UpgradedSelect
                    ariaLabel="Chọn phút"
                    value={minuteValue}
                    onValueChange={selectMinute}
                    options={minuteOptions}
                    placeholder="--"
                    buttonClassName="min-h-10 rounded-xl border border-border-default bg-bg-surface px-3 py-2 font-mono text-sm tabular-nums text-text-primary shadow-sm transition-colors duration-200 hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  />
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

export const TimeInput = memo(TimeInputComponent);
