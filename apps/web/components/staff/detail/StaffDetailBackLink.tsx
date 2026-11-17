import Link from "next/link";
import { ChevronLeft } from "lucide-react";

/** Link quay lại danh sách, cùng kiểu nút «Quay lại» của `/admin/staffs/:id`. */
export default function StaffDetailBackLink({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 items-center gap-1.5 self-start rounded-md py-2 text-sm font-medium text-primary hover:text-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary"
    >
      <ChevronLeft className="size-4 shrink-0" aria-hidden />
      {label}
    </Link>
  );
}
