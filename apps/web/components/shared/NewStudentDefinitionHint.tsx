import { cn } from "@/lib/utils";

/**
 * Giải thích định nghĩa Học sinh mới. `first-top-up` cho admin shell (Học sinh
 * mới), `profile-created` cho mọi khối CSKH trên `/staff` (Học sinh mới đăng ký).
 */
export default function NewStudentDefinitionHint({
  className,
  definition = "first-top-up",
}: {
  className?: string;
  definition?: "first-top-up" | "profile-created";
}) {
  return (
    <p className={cn("px-4 pt-3 text-xs leading-relaxed text-text-muted sm:px-5", className)}>
      {definition === "profile-created"
        ? "Học sinh mới tính theo ngày tạo hồ sơ học sinh trong tháng, kể cả chưa nạp tiền; ngày hiển thị là ngày tạo hồ sơ."
        : "Học sinh mới tính theo lần nạp ví thành công đầu tiên (QR, nạp thẳng đã duyệt, hoặc nạp tay lúc đăng ký); ngày vào học là ngày của lần nạp đó."}
    </p>
  );
}
