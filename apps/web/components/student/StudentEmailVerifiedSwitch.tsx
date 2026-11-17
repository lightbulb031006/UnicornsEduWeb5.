"use client";

import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type Props = {
  verified: boolean;
  /** `false` → chỉ hiện trạng thái, không cho bật/tắt. */
  editable: boolean;
  disabled?: boolean;
  onToggle: (verified: boolean) => void;
  className?: string;
};

/**
 * 16/11: «Email đã xác thực» của tài khoản học sinh trên hồ sơ học sinh —
 * Admin, Trưởng phòng Sale & CSKH, CSKH phụ trách bật/tắt được (giống
 * checkbox ở popup Quản lý user của Admin).
 */
export default function StudentEmailVerifiedSwitch({
  verified,
  editable,
  disabled = false,
  onToggle,
  className,
}: Props) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-2xl border border-border-default bg-bg-primary/80 px-4 py-3",
        className,
      )}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-text-primary">Email đã xác thực</p>
        <p className="text-xs leading-relaxed text-text-muted">
          {verified
            ? "Học sinh đăng nhập được ngay, không cần mở link xác thực trong email."
            : "Học sinh phải bấm link xác thực trong email trước khi dùng tài khoản."}
        </p>
      </div>
      {editable ? (
        <Switch
          checked={verified}
          disabled={disabled}
          onCheckedChange={onToggle}
          aria-label="Email đã xác thực"
          className="shrink-0"
        />
      ) : (
        <span
          className={cn(
            "inline-flex shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ring-1",
            verified
              ? "bg-success/10 text-success ring-success/20"
              : "bg-warning/10 text-warning ring-warning/20",
          )}
        >
          {verified ? "Đã xác thực" : "Chưa xác thực"}
        </span>
      )}
    </div>
  );
}
