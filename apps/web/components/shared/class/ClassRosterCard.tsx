"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import ClassCard from "@/components/admin/class/ClassCard";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { isRosterCollapsedByDefault } from "@/lib/class-roster";

const TOGGLE_CLASS =
  "inline-flex min-h-11 items-center justify-center gap-1 rounded-md border border-border-default bg-bg-surface px-3 py-1.5 text-xs font-medium text-text-primary transition-colors duration-200 hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus sm:min-h-0";

interface ClassRosterCardProps {
  activeCount: number;
  /** Thao tác chỉnh sửa roster (nếu có quyền), luôn hiện trên đầu card. */
  action?: ReactNode;
  /** Danh sách học sinh đang học (mobile + bảng desktop). */
  children: ReactNode;
  inactiveCount: number;
  /** Nội dung khối Học sinh đã nghỉ (chỉ hiện khi mở khối). */
  inactiveContent?: ReactNode;
}

/**
 * Card roster trang chi tiết lớp (admin + staff): lớp có hơn 7 học sinh đang
 * học thì danh sách mặc định thu gọn, đầu card vẫn có tiêu đề, số học sinh
 * đang học và thao tác chỉnh sửa. Khối Học sinh đã nghỉ luôn mặc định thu gọn,
 * chỉ hiện số lượng.
 */
export default function ClassRosterCard({
  activeCount,
  action,
  children,
  inactiveCount,
  inactiveContent,
}: ClassRosterCardProps) {
  // `null` = theo mặc định của sĩ số; người dùng bấm thì giữ lựa chọn.
  const [openOverride, setOpenOverride] = useState<boolean | null>(null);
  const open = openOverride ?? !isRosterCollapsedByDefault(activeCount);

  return (
    <Collapsible open={open} onOpenChange={setOpenOverride} className="w-full">
      <ClassCard
        title="Danh sách học sinh"
        className="w-full"
        action={
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <span className="text-xs text-text-muted">
              {activeCount} học sinh đang học
            </span>
            <CollapsibleTrigger className={TOGGLE_CLASS}>
              {open ? "Thu gọn" : "Xem danh sách"}
              <ChevronDown
                className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`}
                aria-hidden
              />
            </CollapsibleTrigger>
            {action}
          </div>
        }
      >
        <CollapsibleContent>{children}</CollapsibleContent>

        {inactiveCount > 0 ? (
          <Collapsible className="mt-3 rounded-lg border border-border-default bg-bg-secondary/40">
            <CollapsibleTrigger className="group flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg p-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted hover:bg-bg-secondary/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus">
              Học sinh đã nghỉ ({inactiveCount})
              <ChevronDown
                className="size-3.5 shrink-0 transition-transform group-data-[state=open]:rotate-180"
                aria-hidden
              />
            </CollapsibleTrigger>
            <CollapsibleContent className="px-3 pb-3">
              {inactiveContent}
            </CollapsibleContent>
          </Collapsible>
        ) : null}
      </ClassCard>
    </Collapsible>
  );
}
