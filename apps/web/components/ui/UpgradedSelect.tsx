"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { twMerge } from "tailwind-merge";

export type UpgradedSelectOption = {
  value: string;
  label: ReactNode;
  selectedLabel?: ReactNode;
  disabled?: boolean;
  /** Plain-text used for search matching/display when `label` is not a string (e.g. JSX). */
  searchLabel?: string;
};

type DropdownPosition = {
  left: number;
  width: number;
  maxHeight: number;
  top?: number;
  bottom?: number;
};

type Props = {
  id?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  options: UpgradedSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  labelId?: string;
  buttonClassName?: string;
  menuClassName?: string;
  emptyStateLabel?: string;
  /** Render the trigger itself as a text input that filters options while typing. */
  searchable?: boolean;
  noResultsLabel?: string;
  /** When searchable and the typed label is new, show a create action. */
  onCreateOption?: (label: string) => void;
  createOptionLabel?: (query: string) => string;
};

function normalizeForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function getOptionSearchText(option: UpgradedSelectOption | null | undefined): string {
  if (!option) return "";
  if (option.searchLabel) return option.searchLabel;
  if (typeof option.label === "string") return option.label;
  return "";
}

function getFirstEnabledIndex(options: UpgradedSelectOption[]): number {
  return options.findIndex((option) => !option.disabled);
}

function getNextEnabledIndex(
  options: UpgradedSelectOption[],
  startIndex: number,
  direction: 1 | -1,
): number {
  if (options.length === 0) return -1;

  let currentIndex = startIndex;
  for (let step = 0; step < options.length; step += 1) {
    currentIndex = (currentIndex + direction + options.length) % options.length;
    if (!options[currentIndex]?.disabled) {
      return currentIndex;
    }
  }

  return -1;
}

export default function UpgradedSelect({
  id,
  name,
  value,
  defaultValue,
  onValueChange,
  options,
  placeholder = "Chọn giá trị",
  disabled = false,
  ariaLabel,
  labelId,
  buttonClassName,
  menuClassName,
  emptyStateLabel = "Không có tuỳ chọn.",
  searchable = false,
  noResultsLabel = "Không tìm thấy kết quả.",
  onCreateOption,
  createOptionLabel,
}: Props) {
  const generatedId = useId();
  const triggerId = id ?? `upgraded-select-${generatedId}`;
  const listboxId = `${triggerId}-listbox`;
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(defaultValue ?? "");
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<DropdownPosition | null>(null);
  const [query, setQuery] = useState("");
  const triggerRef = useRef<HTMLElement | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  /**
   * Chọn xong thì trả focus về trigger. Với combobox, focus lại chính là tín
   * hiệu mở menu (`handleTriggerFocus`) — cờ này chặn menu bật lại ngay sau khi
   * người dùng vừa chọn.
   */
  const skipNextFocusOpenRef = useRef(false);
  const selectedValue = isControlled ? (value ?? "") : internalValue;
  const selectedOption = useMemo(
    () => options.find((option) => option.value === selectedValue) ?? null,
    [options, selectedValue],
  );
  const selectedContent = selectedOption?.selectedLabel ?? selectedOption?.label;
  const selectedText = getOptionSearchText(selectedOption);
  const visibleOptions = useMemo(() => {
    if (!searchable || !open || !query.trim()) return options;
    const normalizedQuery = normalizeForSearch(query.trim());
    return options.filter((option) =>
      normalizeForSearch(getOptionSearchText(option)).includes(normalizedQuery),
    );
  }, [open, options, query, searchable]);
  const trimmedQuery = query.trim();
  const canCreate =
    Boolean(onCreateOption) &&
    searchable &&
    trimmedQuery.length > 0 &&
    !options.some(
      (option) =>
        normalizeForSearch(getOptionSearchText(option)) ===
        normalizeForSearch(trimmedQuery),
    );

  const commitCreate = () => {
    if (!canCreate || !onCreateOption) return;
    const label = trimmedQuery;
    closeMenu();
    onCreateOption(label);
  };

  const setTriggerRef = (node: HTMLElement | null) => {
    triggerRef.current = node;
  };

  const closeMenu = () => {
    setOpen(false);
    setQuery("");
  };

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (
        triggerRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }

      closeMenu();
    };

    const handleEscape = (event: KeyboardEvent | globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      closeMenu();
      triggerRef.current?.focus();
    };

    const passiveTouchOptions = { passive: true } as const;

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown, passiveTouchOptions);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const updateMenuPosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const viewportMargin = 16;
      const gap = 8;
      const maxWidth = window.innerWidth - viewportMargin * 2;
      const width = Math.min(rect.width, maxWidth);
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

  useEffect(() => {
    if (!open || searchable) return;

    const selectedIndex = options.findIndex(
      (option) => !option.disabled && option.value === selectedValue,
    );
    const fallbackIndex = getFirstEnabledIndex(options);
    const focusIndex = selectedIndex >= 0 ? selectedIndex : fallbackIndex;

    if (focusIndex < 0) return;

    const frame = window.requestAnimationFrame(() => {
      optionRefs.current[focusIndex]?.focus();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [open, options, searchable, selectedValue]);

  const commitValue = (nextValue: string) => {
    if (!isControlled) {
      setInternalValue(nextValue);
    }

    onValueChange?.(nextValue);
    closeMenu();
    skipNextFocusOpenRef.current = searchable;
    triggerRef.current?.focus();
  };

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;

    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen(true);
    }
  };

  const handleSearchTriggerKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const nextIndex = getFirstEnabledIndex(visibleOptions);
      if (nextIndex >= 0) optionRefs.current[nextIndex]?.focus();
      return;
    }

    if (event.key === "Escape") {
      closeMenu();
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const nextIndex = getFirstEnabledIndex(visibleOptions);
      if (nextIndex >= 0) {
        commitValue(visibleOptions[nextIndex].value);
        return;
      }
      commitCreate();
      return;
    }

    if (event.key === "Tab") {
      closeMenu();
    }
  };

  const handleTriggerFocus = (event: FocusEvent<HTMLInputElement>) => {
    if (disabled) return;
    if (skipNextFocusOpenRef.current) {
      skipNextFocusOpenRef.current = false;
      return;
    }
    setOpen(true);
    setQuery("");
    event.target.select();
  };

  const handleTriggerBlur = (event: FocusEvent<HTMLInputElement>) => {
    const nextFocusTarget = event.relatedTarget as Node | null;
    if (nextFocusTarget && menuRef.current?.contains(nextFocusTarget)) return;
    closeMenu();
  };

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const enabledOptions = visibleOptions.filter((option) => !option.disabled);
    if (enabledOptions.length === 0) return;

    const focusedIndex = optionRefs.current.findIndex(
      (button) => button === document.activeElement,
    );
    const currentIndex =
      focusedIndex >= 0 ? focusedIndex : getFirstEnabledIndex(visibleOptions);

    if (event.key === "ArrowDown") {
      event.preventDefault();
      const nextIndex = getNextEnabledIndex(visibleOptions, currentIndex, 1);
      if (nextIndex >= 0) optionRefs.current[nextIndex]?.focus();
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (currentIndex <= 0 && searchable) {
        triggerRef.current?.focus();
        return;
      }
      const nextIndex = getNextEnabledIndex(visibleOptions, currentIndex, -1);
      if (nextIndex >= 0) optionRefs.current[nextIndex]?.focus();
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      const nextIndex = getFirstEnabledIndex(visibleOptions);
      if (nextIndex >= 0) optionRefs.current[nextIndex]?.focus();
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      const reversedIndex = [...visibleOptions]
        .reverse()
        .findIndex((option) => !option.disabled);
      if (reversedIndex >= 0) {
        const nextIndex = visibleOptions.length - reversedIndex - 1;
        optionRefs.current[nextIndex]?.focus();
      }
      return;
    }

    if (event.key === "Tab") {
      closeMenu();
    }
  };

  // Surface mặc định luôn được áp; `buttonClassName` chỉ *đè* lên nó qua
  // `twMerge` (class sau thắng trong cùng nhóm utility). Trước đây nó thay thế
  // toàn bộ surface, nên call site chỉ truyền chiều rộng (`w-full sm:w-72`) bị
  // mất cả viền lẫn padding — trigger trông như text trần.
  const triggerBaseClassName =
    "flex w-full items-center justify-between gap-3 text-left disabled:cursor-not-allowed disabled:opacity-60";
  const triggerSurfaceClassName =
    "min-h-11 rounded-xl border border-border-default bg-bg-surface px-3 py-2 text-sm text-text-primary shadow-sm transition-colors duration-200 hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus";
  const triggerClasses = twMerge(
    triggerBaseClassName,
    triggerSurfaceClassName,
    buttonClassName,
  );

  // Cùng quy ước với `buttonClassName`: `menuClassName` chỉ *đè* lên surface
  // mặc định. Call site chỉ truyền `max-h-72` không được làm mất nền/viền.
  const menuClasses = twMerge(
    "overflow-auto rounded-2xl border border-border-default bg-bg-surface p-1 shadow-[0_24px_60px_-28px_color-mix(in_srgb,var(--ue-text-primary)_45%,transparent)]",
    menuClassName,
  );

  const chevronIcon = (
    <svg
      className={`ml-2 size-4 shrink-0 text-text-muted transition-transform duration-200 ${
        open ? "rotate-180" : ""
      }`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m6 9 6 6 6-6" />
    </svg>
  );

  return (
    <>
      {name ? <input type="hidden" name={name} value={selectedValue} /> : null}
      {searchable ? (
        // Combobox: khung viền nằm ở wrapper (nhận `buttonClassName`), ô nhập
        // bên trong trong suốt — nhờ vậy chevron/nút xoá đứng cạnh chữ giống
        // hệt trigger dạng button, không cần định vị tuyệt đối.
        <div
          className={twMerge(
            triggerClasses,
            "relative cursor-text focus-within:ring-2 focus-within:ring-border-focus",
            disabled ? "cursor-not-allowed opacity-60" : "",
          )}
          onMouseDown={(event) => {
            if (disabled) return;
            if (event.target === triggerRef.current) return;
            event.preventDefault();
            (triggerRef.current as HTMLInputElement | null)?.focus();
          }}
          onClick={() => {
            // Ô đã focus sẵn thì không có `focus` event để mở menu — bấm lại
            // vào khung vẫn phải bung danh sách.
            if (disabled || open) return;
            setOpen(true);
          }}
        >
          <input
            ref={setTriggerRef}
            id={triggerId}
            type="text"
            role="combobox"
            disabled={disabled}
            className="min-w-0 flex-1 border-0 bg-transparent p-0 text-inherit outline-none placeholder:text-text-muted disabled:cursor-not-allowed"
            autoComplete="off"
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={open ? listboxId : undefined}
            aria-label={ariaLabel}
            aria-labelledby={labelId}
            data-upgraded-select-trigger
            value={open ? query : selectedText}
            // Khi đang mở, ô rỗng để gõ tìm — placeholder giữ lại lựa chọn hiện
            // tại để người dùng không mất ngữ cảnh giữa chừng.
            placeholder={open && selectedText ? selectedText : placeholder}
            onFocus={handleTriggerFocus}
            onBlur={handleTriggerBlur}
            onChange={(event) => {
              setQuery(event.target.value);
              if (!open) setOpen(true);
            }}
            onKeyDown={handleSearchTriggerKeyDown}
          />
          {chevronIcon}
        </div>
      ) : (
        <button
          ref={setTriggerRef}
          id={triggerId}
          type="button"
          disabled={disabled}
          className={triggerClasses}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listboxId : undefined}
          aria-label={ariaLabel}
          aria-labelledby={labelId}
          data-upgraded-select-trigger
          onClick={() => {
            if (disabled) return;
            setOpen((current) => !current);
          }}
          onKeyDown={handleTriggerKeyDown}
        >
          <div
            className={`min-w-0 flex-1 ${
              selectedOption ? "text-text-primary" : "text-text-muted"
            }`}
          >
            {selectedContent ?? placeholder}
          </div>
          {chevronIcon}
        </button>
      )}

      {open && menuPosition && typeof document !== "undefined"
        ? createPortal(
          <div
            ref={menuRef}
            id={listboxId}
            role="listbox"
            aria-labelledby={labelId}
            className={`fixed z-[120] ${menuClasses}`}
            style={menuPosition}
            data-upgraded-select-menu
            onKeyDown={handleMenuKeyDown}
          >
            {visibleOptions.length > 0 ? (
              visibleOptions.map((option, index) => {
                const isSelected = option.value === selectedValue;
                return (
                  <button
                    key={option.value}
                    ref={(node) => {
                      optionRefs.current[index] = node;
                    }}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    disabled={option.disabled}
                    className={`flex w-full items-start justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors duration-150 ${
                      option.disabled
                        ? "cursor-not-allowed text-text-muted/60"
                        : isSelected
                          ? "bg-primary/10 font-medium text-text-primary"
                          : "text-text-secondary hover:bg-bg-secondary hover:text-text-primary"
                    }`}
                    onClick={() => {
                      if (option.disabled) return;
                      commitValue(option.value);
                    }}
                  >
                    <div className="min-w-0 flex-1">{option.label}</div>
                    {isSelected ? (
                      <svg
                        className="ml-3 size-4 shrink-0 text-primary"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        aria-hidden
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="m5 12 5 5L20 7"
                        />
                      </svg>
                    ) : null}
                  </button>
                );
              })
            ) : !canCreate ? (
              <div className="px-3 py-2.5 text-sm text-text-muted">
                {searchable && query.trim() ? noResultsLabel : emptyStateLabel}
              </div>
            ) : null}
            {canCreate ? (
              <button
                type="button"
                className="mt-0.5 flex w-full items-center rounded-xl px-3 py-2.5 text-left text-sm font-medium text-primary hover:bg-primary/10"
                onClick={commitCreate}
              >
                {createOptionLabel
                  ? createOptionLabel(trimmedQuery)
                  : `Tạo “${trimmedQuery}”`}
              </button>
            ) : null}
          </div>,
          document.body,
        )
        : null}
    </>
  );
}
