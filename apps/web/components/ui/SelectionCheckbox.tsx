"use client";

import { useEffect, useRef } from "react";

type Props = {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  disabled?: boolean;
  ariaLabel: string;
  appearance?: "minimal" | "fancy";
};

export default function SelectionCheckbox({
  checked,
  indeterminate = false,
  onChange,
  disabled = false,
  ariaLabel,
  appearance = "minimal",
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!inputRef.current) return;
    inputRef.current.indeterminate = indeterminate;
  }, [indeterminate]);

  if (appearance === "fancy") {
    const isActive = checked || indeterminate;
    const outerClassName = isActive
      ? checked
        ? "border-primary/35 bg-gradient-to-br from-primary/20 via-primary/8 to-info/18 shadow-[0_16px_35px_-22px_color-mix(in_srgb,var(--ue-primary)_55%,transparent)]"
        : "border-warning/35 bg-gradient-to-br from-warning/22 via-warning/10 to-info/18 shadow-[0_16px_35px_-24px_color-mix(in_srgb,var(--ue-warning)_58%,transparent)]"
      : "border-border-default/80 bg-bg-surface shadow-[0_10px_25px_-18px_color-mix(in_srgb,var(--ue-text-primary)_18%,transparent)] hover:border-primary/30 hover:bg-bg-secondary";
    const innerShellClassName = isActive
      ? checked
        ? "border-bg-surface/35 bg-bg-surface/15"
        : "border-warning/25 bg-bg-surface/12"
      : "border-border-default/70 bg-bg-surface/95 group-hover:border-primary/20 group-hover:bg-bg-secondary/90";
    const iconPlateClassName = isActive
      ? checked
        ? "border-bg-surface/20 bg-transparent text-text-inverse shadow-none"
        : "border-warning/35 bg-warning/15 text-warning"
      : "border-border-default bg-bg-surface text-transparent group-hover:border-primary/25 group-hover:bg-primary/5";

    return (
      <label
        className={`group touch-manipulation relative inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center overflow-hidden rounded-[1.05rem] border p-[5px] transition-all duration-200 motion-reduce:transition-none focus-within:ring-2 focus-within:ring-border-focus focus-within:ring-offset-2 focus-within:ring-offset-bg-surface ${outerClassName} ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <input
          ref={inputRef}
          type="checkbox"
          checked={checked}
          onChange={(event) => {
            event.stopPropagation();
            onChange();
          }}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          disabled={disabled}
          aria-label={ariaLabel}
          className="sr-only"
        />
        <span
          className={`absolute inset-[5px] rounded-[0.8rem] border transition-all duration-200 motion-reduce:transition-none ${innerShellClassName}`}
          aria-hidden
        />
        <span
          className="pointer-events-none absolute inset-0 rounded-[inherit] bg-[radial-gradient(circle_at_top,_color-mix(in_srgb,var(--ue-bg-surface)_22%,transparent),_transparent_58%)] opacity-90"
          aria-hidden
        />
        {checked ? (
          <span
            className="pointer-events-none absolute left-1/2 top-1/2 z-0 size-[1.45rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-success/35 bg-success shadow-[0_0_0_4px_color-mix(in_srgb,var(--ue-success)_12%,transparent),0_12px_26px_-14px_color-mix(in_srgb,var(--ue-success)_70%,transparent)] transition-colors duration-200 motion-reduce:transition-none"
            aria-hidden
          />
        ) : null}
        <span
          className={`relative z-10 flex size-5 items-center justify-center rounded-[0.68rem] border shadow-sm transition-all duration-200 motion-reduce:transition-none ${iconPlateClassName}`}
          aria-hidden
        >
          {checked ? (
            <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="m5 12 4.2 4.2L19 6.8" />
            </svg>
          ) : indeterminate ? (
            <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 12h12" />
            </svg>
          ) : (
            <span className="size-1.5 rounded-full bg-primary/30" />
          )}
        </span>
      </label>
    );
  }

  const isActive = checked || indeterminate;
  const frameClassName = isActive
    ? checked
      ? "border-primary/45 bg-primary/10"
      : "border-warning/45 bg-warning/10"
    : "border-border-default bg-bg-surface hover:border-primary/30 hover:bg-bg-secondary";
  const boxClassName = checked
    ? "border-primary bg-primary text-text-inverse"
    : indeterminate
      ? "border-warning/60 bg-warning/15 text-warning"
      : "border-border-default bg-bg-surface text-transparent";

  return (
    <label
      className={`group touch-manipulation inline-flex min-h-10 min-w-10 cursor-pointer items-center justify-center overflow-hidden rounded-xl border transition-colors focus-within:ring-2 focus-within:ring-border-focus focus-within:ring-offset-2 focus-within:ring-offset-bg-surface ${frameClassName} ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <input
        ref={inputRef}
        type="checkbox"
        checked={checked}
        onChange={(event) => {
          event.stopPropagation();
          onChange();
        }}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        disabled={disabled}
        aria-label={ariaLabel}
        className="sr-only"
      />
      <span
        className={`relative z-10 flex size-5 items-center justify-center rounded-md border text-[11px] font-bold transition-colors ${boxClassName}`}
        aria-hidden
      >
        {checked ? (
          <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="m5 12 4.2 4.2L19 6.8" />
          </svg>
        ) : indeterminate ? (
          <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 12h12" />
          </svg>
        ) : (
          "•"
        )}
      </span>
    </label>
  );
}
