"use client";

import {
  BookOpen,
  CalendarDays,
  ClipboardList,
  Dumbbell,
  Layers,
  Lock,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ClassTimelineKind } from "@/dtos/class-timeline.dto";

export interface TimelineTocEntry {
  id: string;
  index: number;
  title: string;
  kind: ClassTimelineKind;
  lessonKind: "theory" | "practice" | null;
  locked: boolean;
}

function entryIcon(entry: TimelineTocEntry): LucideIcon {
  if (entry.kind === "session") return CalendarDays;
  if (entry.kind === "class_survey") return ClipboardList;
  return entry.lessonKind === "practice" ? Dumbbell : BookOpen;
}

/** Danh sách mục (dùng chung cho mục lục phẳng và mục lục nhóm theo chuyên đề). */
function TocEntryList({
  entries,
  activeId,
  onSelect,
  compact,
}: {
  entries: TimelineTocEntry[];
  activeId: string | null;
  onSelect: (id: string) => void;
  compact: boolean;
}) {
  return (
    <ul className="space-y-0.5">
      {entries.map((entry) => {
        const Icon = entryIcon(entry);
        const active = entry.id === activeId;
        const label = `${entry.index}. ${entry.title}`;
        return (
          <li key={entry.id}>
            <button
              type="button"
              onClick={() => onSelect(entry.id)}
              aria-current={active ? "true" : undefined}
              aria-label={compact ? label : undefined}
              title={compact ? label : undefined}
              className={`group flex w-full items-center rounded-lg py-2 text-left text-sm transition-[gap,padding,background-color,color] duration-300 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-secondary ${
                compact ? "justify-center gap-0 px-2" : "gap-2.5 px-2.5"
              } ${
                active
                  ? "bg-primary font-semibold text-text-inverse"
                  : "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
              }`}
            >
              <span
                className={`flex size-5 shrink-0 items-center justify-center ${
                  active
                    ? "text-text-inverse"
                    : "text-text-muted group-hover:text-text-primary"
                }`}
              >
                <Icon className="size-[1.05rem]" aria-hidden />
              </span>
              <span
                className={`flex min-w-0 flex-1 items-center gap-2 overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-300 ease-out ${
                  compact ? "max-w-0 opacity-0" : "max-w-full opacity-100"
                }`}
              >
                <span
                  className={`w-5 shrink-0 text-right font-mono text-[11px] ${
                    active ? "text-text-inverse/80" : "text-text-muted"
                  }`}
                >
                  {entry.index}
                </span>
                <span className="min-w-0 flex-1 truncate">{entry.title}</span>
                {entry.locked ? (
                  <Lock
                    className={`size-3.5 shrink-0 ${active ? "text-text-inverse/80" : "text-text-muted"}`}
                    aria-label="Chưa mở"
                  />
                ) : null}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Mục lục timeline lớp học: danh sách rút gọn để nhảy nhanh tới từng mục.
 * Component thuần presentational — state active/scroll/collapse do phía gọi quản lý.
 *
 * `compact` = chế độ rail (sidebar thu gọn): chỉ hiện icon, tiêu đề nằm ở tooltip.
 */
export default function StudentClassTimelineToc({
  entries,
  activeId,
  onSelect,
  compact = false,
  className,
}: {
  entries: TimelineTocEntry[];
  activeId: string | null;
  onSelect: (id: string) => void;
  compact?: boolean;
  className?: string;
}) {
  if (!entries.length) return null;

  return (
    <nav aria-label="Mục lục nội dung lớp học" className={className}>
      <TocEntryList
        entries={entries}
        activeId={activeId}
        onSelect={onSelect}
        compact={compact}
      />
    </nav>
  );
}

export interface TimelineTocSection {
  key: string;
  /** Id thẻ chuyên đề — bấm tên chuyên đề gọi `onSelect(id)`. */
  id: string;
  title: string;
  entries: TimelineTocEntry[];
}

/**
 * Mục lục tab Chuyên đề: tên chuyên đề làm đầu nhóm (bấm để tới thẻ), các
 * tiết nằm dưới, đánh số lại từ 1 trong mỗi nhóm.
 */
export function StudentClassGroupedToc({
  sections,
  activeId,
  onSelect,
  className,
}: {
  sections: TimelineTocSection[];
  activeId: string | null;
  onSelect: (id: string) => void;
  className?: string;
}) {
  if (!sections.length) return null;

  return (
    <nav aria-label="Mục lục chuyên đề" className={className}>
      <div className="space-y-4">
        {sections.map((section) => {
          const active = section.id === activeId;
          return (
            <section
              key={section.key}
              aria-labelledby={`toc-section-${section.key}`}
            >
              <h3 id={`toc-section-${section.key}`} className="mb-1">
                <button
                  type="button"
                  onClick={() => onSelect(section.id)}
                  aria-current={active ? "true" : undefined}
                  title={section.title}
                  className={`flex min-h-9 w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold uppercase tracking-wide transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${
                    active
                      ? "bg-primary text-text-inverse"
                      : "text-text-muted hover:bg-bg-tertiary hover:text-text-primary"
                  }`}
                >
                  <Layers className="size-3.5 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">
                    {section.title}
                  </span>
                </button>
              </h3>
              {section.entries.length ? (
                <TocEntryList
                  entries={section.entries}
                  activeId={activeId}
                  onSelect={onSelect}
                  compact={false}
                />
              ) : (
                <p className="px-2.5 py-1 pl-8 text-xs text-text-muted">
                  Chưa có tiết
                </p>
              )}
            </section>
          );
        })}
      </div>
    </nav>
  );
}
