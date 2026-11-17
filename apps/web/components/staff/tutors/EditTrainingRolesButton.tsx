"use client";

import type { KeyboardEvent, MouseEvent } from "react";
import { UserCog } from "lucide-react";

/** Nút «Sửa role» trong dòng danh sách: chặn điều hướng của row link. */
export default function EditTrainingRolesButton({
  onOpen,
  className = "",
}: {
  onOpen: () => void;
  className?: string;
}) {
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onOpen();
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Enter" || event.key === " ") event.stopPropagation();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={`inline-flex min-h-10 items-center gap-1.5 rounded-md text-xs font-medium text-primary underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${className}`}
    >
      <UserCog className="size-3.5 shrink-0" aria-hidden />
      Sửa role
    </button>
  );
}
