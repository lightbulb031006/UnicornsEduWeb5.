import { cn } from "@/lib/utils";

/** Giải thích cách tách Học sinh cũ nghỉ / Học sinh thử nghỉ trong admin shell. */
export default function DroppedStudentDefinitionHint({ className }: { className?: string }) {
  return (
    <p className={cn("px-4 pt-3 text-xs leading-relaxed text-text-muted sm:px-5", className)}>
      Cũ nghỉ: đã nạp ví thành công và đã học từ 2 buổi trở lên (có mặt, nghỉ phép hoặc học thử; cộng mọi lớp).
      Thử nghỉ: các học sinh nghỉ còn lại.
    </p>
  );
}
