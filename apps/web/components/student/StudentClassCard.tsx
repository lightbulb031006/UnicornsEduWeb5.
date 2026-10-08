import type { ReactNode } from "react";
import Link from "next/link";
import { ClassCoverArt } from "@/components/shared/class/ClassCoverArt";
import type { StudentClassCardItem } from "@/dtos/student-class.dto";

/** Lưới thẻ lớp mobile-first: 1 cột → 2 cột (sm) → 3 cột (lg). Dùng chung cho trang và skeleton. */
export function StudentClassCardGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>;
}

export function StudentClassCard({ card }: { card: StudentClassCardItem }) {
  const teacherLabel =
    card.teacherNames.length > 0 ? card.teacherNames.join(", ") : "Chưa phân công";

  return (
    <Link
      href={`/student/classes/${card.classId}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-border-default bg-bg-surface shadow-sm transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <ClassCoverArt classId={card.classId} coverImageUrl={card.coverImageUrl} hoverZoom />

      <div className="flex flex-1 flex-col gap-1 p-4">
        <p className="truncate text-xs font-medium uppercase tracking-wide text-text-muted">
          {card.courseName}
        </p>
        <h2 className="line-clamp-2 text-base font-semibold text-text-primary transition-colors group-hover:text-primary">
          {card.className}
        </h2>
        <p className="mt-auto pt-2 text-sm text-text-secondary">
          <span className="text-text-muted">Gia sư: </span>
          {teacherLabel}
        </p>
      </div>
    </Link>
  );
}
