"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronRight,
  Dumbbell,
  Layers,
  Search,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  getClassModules,
  getCourseLessonsForClass,
} from "@/lib/apis/class.api";
import type {
  ClassModuleDto,
  CourseLessonForClassDto,
} from "@/dtos/course-content.dto";
import { classKeys } from "@/lib/query-keys";

interface CourseLessonPickerProps {
  classId: string;
  selectedLessonId: string;
  /** `null` khi đổi chuyên đề (bỏ chọn tiết cũ). */
  onSelect: (lesson: CourseLessonForClassDto | null) => void;
}

/**
 * Chọn tiết để thêm vào lớp theo hai bước: chuyên đề của khoá (kể cả chuyên đề lớp
 * chưa có tiết nào) → tiết lý thuyết hoặc thực hành của chuyên đề đó.
 */
export default function CourseLessonPicker({
  classId,
  selectedLessonId,
  onSelect,
}: CourseLessonPickerProps) {
  const [moduleId, setModuleId] = useState<string | null>(null);

  const modulesQuery = useQuery<ClassModuleDto[]>({
    queryKey: classKeys.modules(classId),
    queryFn: () => getClassModules(classId),
  });
  const lessonsQuery = useQuery<CourseLessonForClassDto[]>({
    queryKey: classKeys.courseLessons(classId),
    queryFn: () => getCourseLessonsForClass(classId),
  });

  const modules = modulesQuery.data ?? [];
  const lessonsByModule = useMemo(() => {
    const map = new Map<string, CourseLessonForClassDto[]>();
    for (const lesson of lessonsQuery.data ?? []) {
      const arr = map.get(lesson.moduleId) ?? [];
      arr.push(lesson);
      map.set(lesson.moduleId, arr);
    }
    return map;
  }, [lessonsQuery.data]);

  // Quay lại từ bước "Đặt lần giao" (picker mount lại): suy chuyên đề từ tiết đang chọn.
  const activeModuleId =
    moduleId ??
    lessonsQuery.data?.find((lesson) => lesson.id === selectedLessonId)
      ?.moduleId ??
    null;
  const selectedModule = modules.find(
    (module) => module.moduleId === activeModuleId,
  );

  if (modulesQuery.isLoading || lessonsQuery.isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-12 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (modulesQuery.isError || lessonsQuery.isError) {
    return (
      <p className="rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
        Không tải được danh sách tiết học.
      </p>
    );
  }

  if (modules.length === 0) {
    return (
      <EmptyState>
        Khoá chưa có chuyên đề nào. Hãy tạo chuyên đề và tiết học trong quản trị
        khoá học trước.
      </EmptyState>
    );
  }

  if (!selectedModule) {
    return (
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
          Chọn chuyên đề
        </p>
        {modules.map((module) => (
          <ModuleRow
            key={module.moduleId}
            module={module}
            lessons={lessonsByModule.get(module.moduleId) ?? []}
            onOpen={() => {
              setModuleId(module.moduleId);
              onSelect(null);
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <ModuleLessonList
      module={selectedModule}
      lessons={lessonsByModule.get(selectedModule.moduleId) ?? []}
      selectedLessonId={selectedLessonId}
      onBack={() => {
        setModuleId(null);
        onSelect(null);
      }}
      onSelect={onSelect}
    />
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-border-default bg-bg-secondary/20 p-6 text-center text-sm text-text-muted">
      {children}
    </div>
  );
}

function ModuleRow({
  module,
  lessons,
  onOpen,
}: {
  module: ClassModuleDto;
  lessons: CourseLessonForClassDto[];
  onOpen: () => void;
}) {
  const addable = lessons.filter((lesson) => !lesson.alreadyAdded).length;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-xl border border-border-default bg-bg-surface p-3 text-left transition-colors hover:border-border-focus/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
    >
      <Layers className="size-4 shrink-0 text-text-muted" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-text-primary">
          {module.title}
        </div>
        <div className="text-xs text-text-muted">
          {lessons.length === 0
            ? "Chưa có tiết học"
            : `${lessons.length} tiết · ${addable} chưa thêm`}
          {module.added ? " · đã có trong lớp" : ""}
        </div>
      </div>
      <ChevronRight className="size-4 shrink-0 text-text-muted" aria-hidden />
    </button>
  );
}

function ModuleLessonList({
  module,
  lessons,
  selectedLessonId,
  onBack,
  onSelect,
}: {
  module: ClassModuleDto;
  lessons: CourseLessonForClassDto[];
  selectedLessonId: string;
  onBack: () => void;
  onSelect: (lesson: CourseLessonForClassDto) => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return lessons;
    return lessons.filter((lesson) => lesson.title.toLowerCase().includes(q));
  }, [lessons, search]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-text-muted hover:bg-bg-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus sm:min-h-9"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Chuyên đề
        </button>
        <span className="min-w-0 truncate text-sm font-semibold text-text-primary">
          {module.title}
        </span>
      </div>

      {lessons.length === 0 ? (
        <EmptyState>
          Chuyên đề này chưa có tiết học. Hãy tạo tiết trong quản trị khoá học
          trước.
        </EmptyState>
      ) : (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Tìm tiết học"
              placeholder="Tìm tiết học..."
              className="w-full rounded-xl border border-border-default bg-bg-surface py-2.5 pl-9 pr-4 text-sm text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            />
          </div>
          <div
            role="group"
            aria-label={`Tiết học của ${module.title}`}
            className="max-h-[50vh] space-y-1.5 overflow-y-auto overscroll-contain [scrollbar-width:thin]"
          >
            {filtered.length === 0 ? (
              <div className="py-6 text-center text-sm text-text-muted">
                Không tìm thấy tiết học phù hợp.
              </div>
            ) : (
              filtered.map((lesson) => (
                <LessonRow
                  key={lesson.id}
                  lesson={lesson}
                  isSelected={lesson.id === selectedLessonId}
                  onSelect={onSelect}
                />
              ))
            )}
          </div>
        </>
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
  onSelect: (lesson: CourseLessonForClassDto) => void;
}) {
  const isPractice = lesson.kind === "practice";
  return (
    <button
      type="button"
      onClick={() => !lesson.alreadyAdded && onSelect(lesson)}
      disabled={lesson.alreadyAdded}
      aria-pressed={isSelected}
      className={cn(
        "flex min-h-11 w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors",
        lesson.alreadyAdded
          ? "cursor-not-allowed border-border-default bg-bg-secondary/30 opacity-60"
          : isSelected
            ? "cursor-pointer border-primary bg-primary/5"
            : "cursor-pointer border-border-default hover:border-border-focus/50",
      )}
    >
      <div
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg",
          isPractice ? "bg-warning/10 text-warning" : "bg-info/10 text-info",
        )}
      >
        {isPractice ? (
          <Dumbbell className="size-4" aria-hidden />
        ) : (
          <BookOpen className="size-4" aria-hidden />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-text-primary">
          {lesson.title}
        </div>
        <div className="text-xs text-text-muted">
          {isPractice ? "Tiết thực hành" : "Tiết lý thuyết"}
        </div>
      </div>
      {lesson.alreadyAdded ? (
        <span className="shrink-0 text-xs font-medium text-text-muted">
          Đã có trong lớp
        </span>
      ) : (
        isSelected && <Check className="size-4 shrink-0 text-primary" />
      )}
    </button>
  );
}
