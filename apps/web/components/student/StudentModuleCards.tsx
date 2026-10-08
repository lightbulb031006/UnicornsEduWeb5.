"use client";

import Link from "next/link";
import { ChevronDown, Layers, Lock } from "lucide-react";
import type {
  ClassContentItemDto,
  ClassContentModuleGroupDto,
} from "@/dtos/class-content.dto";
import { TimelineKindBadge } from "@/components/class-timeline/TimelineKindBadge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  isLockedModuleItem,
  moduleCardItems,
  moduleCardKey,
  moduleItemHref,
} from "@/lib/student-module-cards";
import { cn } from "@/lib/utils";

interface StudentModuleCardsProps {
  classId: string;
  groups: ClassContentModuleGroupDto[];
  openKeys: ReadonlySet<string>;
  onToggle: (key: string) => void;
  /** Đăng ký DOM row để mục lục cuộn tới. */
  registerRow: (id: string, el: HTMLElement | null) => void;
  selectedId: string | null;
}

/**
 * Tab Chuyên đề trang lớp học sinh: mỗi chuyên đề một thẻ, mặc định thu gọn
 * (tên + số tiết lý thuyết / thực hành đã giao); mở được nhiều thẻ cùng lúc.
 */
export default function StudentModuleCards({
  classId,
  groups,
  openKeys,
  onToggle,
  registerRow,
  selectedId,
}: StudentModuleCardsProps) {
  return (
    <div className="space-y-3">
      {groups.map((group) => {
        const key = moduleCardKey(group);
        const items = moduleCardItems(group);
        return (
          <Collapsible
            key={key}
            open={openKeys.has(key)}
            onOpenChange={() => onToggle(key)}
            className="rounded-xl border border-border-default bg-bg-surface shadow-sm"
          >
            <CollapsibleTrigger className="group flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-xl p-4 text-left hover:bg-bg-secondary/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Layers className="size-4" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-semibold text-text-primary">
                  {group.title}
                </h3>
                <p className="text-xs text-text-muted">
                  {group.theoryItems.length} tiết lý thuyết ·{" "}
                  {group.practiceItems.length} tiết thực hành
                </p>
              </div>
              <ChevronDown
                className="size-4 shrink-0 text-text-muted transition-transform group-data-[state=open]:rotate-180"
                aria-hidden
              />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 px-3 pb-3 sm:px-4 sm:pb-4">
              {items.length === 0 ? (
                <p className="py-2 text-center text-xs text-text-muted">
                  Chuyên đề chưa có tiết học.
                </p>
              ) : (
                items.map((item) => (
                  <ModuleItemRow
                    key={item.id}
                    classId={classId}
                    item={item}
                    selected={selectedId === item.id}
                    registerRow={registerRow}
                  />
                ))
              )}
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
}

function ModuleItemRow({
  classId,
  item,
  selected,
  registerRow,
}: {
  classId: string;
  item: ClassContentItemDto;
  selected: boolean;
  registerRow: StudentModuleCardsProps["registerRow"];
}) {
  const locked = isLockedModuleItem(item);
  const className = cn(
    "flex min-h-11 scroll-mt-24 items-center gap-2 rounded-lg border bg-bg-secondary/20 px-3 py-2",
    selected
      ? "border-primary ring-2 ring-primary ring-offset-2 ring-offset-bg-primary"
      : "border-border-default",
  );
  const body = (
    <>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">
        {item.title}
      </span>
      <TimelineKindBadge
        kind="content_item"
        lessonKind={item.lessonKind}
        label={item.kindLabel}
      />
      {locked ? (
        <Lock
          className="size-3.5 shrink-0 text-text-muted"
          aria-label="Chưa mở"
        />
      ) : null}
    </>
  );

  if (locked) {
    return (
      <div
        ref={(el) => registerRow(item.id, el)}
        className={cn(className, "opacity-70")}
      >
        {body}
      </div>
    );
  }

  return (
    <Link
      ref={(el) => registerRow(item.id, el)}
      href={moduleItemHref(classId, item)}
      className={cn(
        className,
        "transition-colors hover:border-primary/40 hover:bg-bg-secondary/60",
      )}
    >
      {body}
    </Link>
  );
}
