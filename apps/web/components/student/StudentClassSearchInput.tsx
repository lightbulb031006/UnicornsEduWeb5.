"use client";

import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Ô tìm trong nội dung lớp (tab đang mở); có nút xoá từ khoá, Escape cũng xoá. */
export default function StudentClassSearchInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** Kích thước/vị trí khung ngoài; input cao theo khung từ `sm`. */
  className?: string;
}) {
  return (
    <div role="search" className={cn("relative", className)}>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted"
        aria-hidden
      />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && value) {
            event.preventDefault();
            onChange("");
          }
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        aria-controls="student-class-tabpanel"
        className="h-11 w-full rounded-2xl border border-border-default bg-bg-surface pl-9 pr-10 text-base text-text-primary shadow-sm placeholder:text-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus sm:h-full sm:text-sm [&::-webkit-search-cancel-button]:appearance-none"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Xoá từ khoá"
          className="absolute right-1.5 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-xl text-text-muted hover:bg-bg-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
        >
          <X className="size-4" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
