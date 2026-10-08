import { Badge } from "@/components/ui/badge";

/** Nhãn khoá bán một lần, dùng ở danh sách và chi tiết khoá học. */
export default function CourseOneTimeBadge({ isOneTime }: { isOneTime?: boolean }) {
  if (!isOneTime) return null;
  return (
    <Badge variant="info" title="Học sinh trừ cả gói ở buổi học đầu">
      Bán một lần
    </Badge>
  );
}
