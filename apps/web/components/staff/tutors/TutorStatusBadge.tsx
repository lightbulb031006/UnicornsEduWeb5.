import type { StaffStatus } from "@/dtos/staff.dto";

const STATUS_LABELS: Record<StaffStatus, string> = {
  active: "Hoạt động",
  inactive: "Ngừng hoạt động",
};

export default function TutorStatusBadge({ status }: { status: StaffStatus }) {
  const tone =
    status === "active"
      ? "bg-success/15 text-success"
      : "bg-bg-tertiary text-text-muted";
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
