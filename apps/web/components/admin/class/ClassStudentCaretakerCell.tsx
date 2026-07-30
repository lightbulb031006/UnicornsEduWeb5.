"use client";

import Link from "next/link";
import type { ClassStudentCaretaker } from "@/dtos/class.dto";
import { cn } from "@/lib/utils";

type ClassStudentCaretakerCellProps = {
  caretaker?: ClassStudentCaretaker | null;
  href?: string | null;
  /** Mobile secondary line: prefix with "Người chăm sóc: " */
  layout?: "table" | "mobile";
  className?: string;
};

export default function ClassStudentCaretakerCell({
  caretaker,
  href,
  layout = "table",
  className,
}: ClassStudentCaretakerCellProps) {
  const name = caretaker?.fullName?.trim() || "";
  const displayName = name || "—";
  const isEmpty = !name;

  const value = href && !isEmpty ? (
    <Link
      href={href}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      className="font-medium text-primary underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
    >
      {displayName}
    </Link>
  ) : (
    <span className={isEmpty ? "text-text-muted" : "text-text-secondary"}>
      {displayName}
    </span>
  );

  if (layout === "mobile") {
    return (
      <p className={cn("mt-1 text-xs text-text-muted", className)}>
        Người chăm sóc: {value}
      </p>
    );
  }

  return <div className={cn("text-sm", className)}>{value}</div>;
}
