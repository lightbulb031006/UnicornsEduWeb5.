import Link from "next/link";
import StaffCard from "@/components/admin/staff/StaffCard";
import type { TrainingTutorClass } from "@/dtos/training-tutor.dto";
import { cn } from "@/lib/utils";

type ClassRow = TrainingTutorClass & { retired: boolean };

const classHref = (classId: string) =>
  `/staff/classes/${encodeURIComponent(classId)}`;

function RetiredTeachingLabel() {
  return (
    <span className="mt-1 inline-flex w-fit rounded-full border border-warning/25 bg-warning/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning">
      Nghỉ dạy
    </span>
  );
}

/** Tên lớp: link sang trang lớp khi người xem mở được lớp đó, không thì chữ thường. */
function ClassName({
  item,
  linkable,
  className,
}: {
  item: ClassRow;
  linkable: boolean;
  className?: string;
}) {
  if (!linkable) {
    return <span className={className}>{item.name}</span>;
  }
  return (
    <Link
      href={classHref(item.id)}
      className={cn(
        "rounded-sm underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus",
        className,
      )}
    >
      {item.name}
    </Link>
  );
}

/**
 * «Lớp phụ trách» cùng bố cục `/admin/staffs/:id` (thẻ trên mobile, bảng trên
 * desktop, lớp đã nghỉ mờ + nhãn «Nghỉ dạy») nhưng không có cột tiền (#270).
 * `linkable`: chỉ Trưởng ban Đào tạo mở được mọi lớp (#277) — Ban Đào Tạo
 * thường chỉ mở lớp mình dạy / quản lý nên không gắn link để tránh 404.
 */
export default function TrainingTutorClassesCard({
  currentClasses,
  pastClasses,
  linkable,
}: {
  currentClasses: TrainingTutorClass[];
  pastClasses: TrainingTutorClass[];
  linkable: boolean;
}) {
  const rows: ClassRow[] = [
    ...currentClasses.map((item) => ({ ...item, retired: false })),
    ...pastClasses.map((item) => ({ ...item, retired: true })),
  ];

  return (
    <StaffCard title="Lớp phụ trách">
      {rows.length === 0 ? (
        <p className="text-text-muted">Chưa gán lớp nào.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <ul className="space-y-3 md:hidden">
            {rows.map((item) => (
              <li
                key={`${item.retired ? "past" : "current"}-${item.id}`}
                className={cn(
                  "flex flex-col items-start rounded-lg border border-border-default bg-bg-secondary px-4 py-3",
                  item.retired && "opacity-60",
                )}
              >
                <ClassName
                  item={item}
                  linkable={linkable}
                  className="text-left font-medium text-text-primary"
                />
                {item.retired ? <RetiredTeachingLabel /> : null}
              </li>
            ))}
          </ul>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border-default bg-bg-secondary">
                  <th
                    scope="col"
                    className="px-4 py-3 font-medium text-text-primary"
                  >
                    Lớp
                  </th>
                  <th
                    scope="col"
                    className="w-32 px-4 py-3 font-medium text-text-primary"
                  >
                    Trạng thái
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => (
                  <tr
                    key={`${item.retired ? "past" : "current"}-${item.id}`}
                    className={cn(
                      "border-b border-border-default bg-bg-surface transition-colors duration-200 hover:bg-bg-secondary",
                      item.retired && "opacity-60",
                    )}
                  >
                    <td className="px-4 py-3 text-text-primary">
                      <ClassName item={item} linkable={linkable} />
                    </td>
                    <td className="px-4 py-3">
                      {item.retired ? (
                        <RetiredTeachingLabel />
                      ) : (
                        <span className="text-text-secondary">Đang dạy</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-text-muted">
            Học phí, trợ cấp theo lớp chỉ Admin / Kế toán chi xem.
          </p>
        </div>
      )}
    </StaffCard>
  );
}
