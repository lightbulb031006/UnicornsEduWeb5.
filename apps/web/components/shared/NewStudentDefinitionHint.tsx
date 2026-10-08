import { cn } from "@/lib/utils";

/** Giải thích định nghĩa Học sinh mới, dùng chung ở mọi bảng/popup thống kê học sinh mới. */
export default function NewStudentDefinitionHint({ className }: { className?: string }) {
  return (
    <p className={cn("px-4 pt-3 text-xs leading-relaxed text-text-muted sm:px-5", className)}>
      Học sinh mới tính theo lần nạp ví thành công đầu tiên (QR hoặc nạp thẳng đã duyệt); ngày vào
      học là ngày của lần nạp đó.
    </p>
  );
}
