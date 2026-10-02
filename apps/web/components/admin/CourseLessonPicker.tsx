"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronRight, Search, BookOpen, Dumbbell } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { getCourseLessonsForClass } from "@/lib/apis/class.api";
import type { CourseLessonForClassDto } from "@/dtos/course-content.dto";

interface CourseLessonPickerProps {
  classId: string;
  selectedLessonId: string;
  onSelect: (lessonId: string, kind: CourseLessonForClassDto["kind"]) => void;
}

export default function CourseLessonPicker({
  classId,
  selectedLessonId,
  onSelect,
}: CourseLessonPickerProps) {
  const [search, setSearch] = useState("");

  const { data: lessons, isLoading } = useQuery<CourseLessonForClassDto[]>({
    queryKey: ["course-lessons-for-class", classId],
    queryFn: () => getCourseLessonsForClass(classId),
  });

  const filtered = useMemo(() => {
    if (!lessons) return [];
    if (!search.trim()) return lessons;
    const q = search.toLowerCase();
    return lessons.filter(
      (lesson) =>
        lesson.title.toLowerCase().includes(q) ||
        lesson.moduleTitle.toLowerCase().includes(q),
    );
  }, [lessons, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, CourseLessonForClassDto[]>();
    for (const lesson of filtered) {
      const arr = map.get(lesson.moduleTitle) ?? [];
      arr.push(lesson);
      map.set(lesson.moduleTitle, arr);
    }
    return map;
  }, [filtered]);

  const [collapsedModules, setCollapsedModules] = useState<Set<string>>(
    () => new Set(),
  );
  const isSearching = search.trim().length > 0;

  function toggleModule(moduleTitle: string) {
    setCollapsedModules((prev) => {
      const next = new Set(prev);
      if (next.has(moduleTitle)) next.delete(moduleTitle);
      else next.add(moduleTitle);
      return next;
    });
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-12 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (!lessons || lessons.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border-default bg-bg-secondary/20 p-6 text-center text-sm text-text-muted">
        Khoá học này chưa có tiết học nào. Hãy tạo tiết học trong quản trị
        khoá học trước.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-text-muted" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Tìm tiết học"
          placeholder="Tìm tiết học..."
          className="w-full rounded-xl border border-border-default bg-bg-surface pl-9 pr-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
        />
      </div>

      <div className="max-h-[50vh] overflow-y-auto overscroll-contain space-y-3 [scrollbar-width:thin]">
        {filtered.length === 0 && (
          <div className="py-6 text-center text-sm text-text-muted">
            Không tìm thấy tiết học phù hợp.
          </div>
        )}

        {Array.from(grouped.entries()).map(([moduleTitle, moduleLessons]) => {
          const expanded = isSearching || !collapsedModules.has(moduleTitle);
          return (
            <ModuleBranch
              key={moduleTitle}
              moduleTitle={moduleTitle}
              lessons={moduleLessons}
              expanded={expanded}
              selectedLessonId={selectedLessonId}
              onToggle={() => toggleModule(moduleTitle)}
              onSelect={onSelect}
            />
          );
        })}
      </div>
    </div>
  );
}

function ModuleBranch({
  moduleTitle,
  lessons,
  expanded,
  selectedLessonId,
  onToggle,
  onSelect,
}: {
  moduleTitle: string;
  lessons: CourseLessonForClassDto[];
  expanded: boolean;
  selectedLessonId: string;
  onToggle: () => void;
  onSelect: (id: string, kind: CourseLessonForClassDto["kind"]) => void;
}) {
  const panelId = `module-lessons-${moduleTitle.replace(/\s+/g, "-").toLowerCase()}`;

  return (
    <div className="rounded-xl border border-border-default bg-bg-surface">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={panelId}
        className="flex min-h-11 w-full cursor-pointer items-center gap-2 px-3 py-2.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus"
      >
        <ChevronRight
          className={cn(
            "size-4 shrink-0 text-text-muted transition-transform",
            expanded && "rotate-90",
          )}
        />
        <span className="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wider text-text-muted">
          {moduleTitle}
        </span>
        <span className="shrink-0 text-xs text-text-muted">{lessons.length}</span>
      </button>
      {expanded && (
        <div
          id={panelId}
          role="group"
          className="space-y-1.5 border-t border-border-default px-2 pb-2 pt-1.5 sm:px-3"
        >
          {lessons.map((lesson) => (
            <LessonRow
              key={lesson.id}
              lesson={lesson}
              isSelected={lesson.id === selectedLessonId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LessonRow({
  lesson,
  isSelected,
  onSelect,
}: {
  lesson: CourseLessonForClassDto;
  isSelected: boolean;
  onSelect: (id: string, kind: CourseLessonForClassDto["kind"]) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => !lesson.alreadyAdded && onSelect(lesson.id, lesson.kind)}
      disabled={lesson.alreadyAdded}
      className={cn(
        "w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-colors",
        lesson.alreadyAdded
          ? "border-border-default bg-bg-secondary/30 opacity-60 cursor-not-allowed"
          : isSelected
            ? "border-primary bg-primary/5 cursor-pointer"
            : "border-border-default hover:border-border-focus/50 cursor-pointer",
      )}
    >
      <div
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg",
          lesson.kind === "theory"
            ? "bg-primary/10 text-primary"
            : "bg-warning/10 text-warning",
        )}
      >
        {lesson.kind === "theory" ? (
          <BookOpen className="size-4" />
        ) : (
          <Dumbbell className="size-4" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-text-primary truncate">
          {lesson.title}
        </div>
        <div className="text-xs text-text-muted">
          {lesson.kind === "theory" ? "Tiết lý thuyết" : "Tiết thực hành"}
        </div>
      </div>
      {lesson.alreadyAdded ? (
        <span className="shrink-0 text-xs font-medium text-text-muted">
          Đã thêm
        </span>
      ) : (
        isSelected && (
          <Check className="size-4 shrink-0 text-primary" />
        )
      )}
    </button>
  );
}
