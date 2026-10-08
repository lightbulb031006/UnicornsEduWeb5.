import { GraduationCap } from "lucide-react";
import { cn } from "@/lib/utils";

interface ClassStandingTeachersProps {
  /** Họ tên Gia sư đứng lớp đang hoạt động (chỉ tên, không email). */
  names: string[];
  className?: string;
}

/**
 * Dòng "Gia sư đứng lớp" ở đầu trang lớp (bỏ trùng, sắp theo tên — cùng thứ tự
 * cho admin/staff/học sinh). Lớp chưa có gia sư thì không hiện.
 */
export default function ClassStandingTeachers({
  names,
  className,
}: ClassStandingTeachersProps) {
  const sortedNames = Array.from(new Set(names.filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, "vi"),
  );
  if (sortedNames.length === 0) return null;
  return (
    <p
      className={cn(
        "flex min-w-0 items-start gap-1.5 text-xs text-text-secondary sm:text-sm",
        className,
      )}
    >
      <GraduationCap
        className="mt-0.5 size-3.5 shrink-0 text-text-muted sm:size-4"
        aria-hidden
      />
      <span className="min-w-0">
        <span className="text-text-muted">Gia sư đứng lớp: </span>
        <span className="font-medium text-text-primary">
          {sortedNames.join(", ")}
        </span>
      </span>
    </p>
  );
}
