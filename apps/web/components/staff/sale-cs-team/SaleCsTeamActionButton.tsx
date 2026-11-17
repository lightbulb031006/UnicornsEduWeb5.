"use client";

import type { KeyboardEvent, MouseEvent, ReactNode } from "react";

/** Nút hành động trong dòng danh sách: chặn điều hướng của row link. */
export default function SaleCsTeamActionButton({
  onClick,
  icon,
  children,
  tone = "primary",
  disabled = false,
}: {
  onClick: () => void;
  icon?: ReactNode;
  children: ReactNode;
  tone?: "primary" | "danger";
  disabled?: boolean;
}) {
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onClick();
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Enter" || event.key === " ") event.stopPropagation();
  };
  const toneClass = tone === "danger" ? "text-error" : "text-primary";

  return (
    <button
      type="button"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      disabled={disabled}
      className={`inline-flex min-h-10 items-center gap-1.5 rounded-md text-xs font-medium underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50 ${toneClass}`}
    >
      {icon}
      {children}
    </button>
  );
}
