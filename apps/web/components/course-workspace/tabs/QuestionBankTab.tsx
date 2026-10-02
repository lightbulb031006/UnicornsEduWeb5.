"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useDebounce } from "use-debounce";
import * as questionApi from "@/lib/apis/question.api";
import { questionKeys } from "@/lib/query-keys";
import { invalidateQuestionScopedQueries } from "@/lib/query-invalidation";
import { useCourseModules } from "@/lib/hooks/useCourseModules";
import { useCourseDifficultyLevels } from "@/lib/hooks/useCourseDifficultyLevels";
import MathContent from "@/components/ui/MathContent";
import UpgradedSelect from "@/components/ui/UpgradedSelect";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import type { Question, QuestionFilter } from "@/dtos/question.dto";
import { QuestionTypeDto } from "@/dtos/question.dto";
import QuestionFormDialog from "@/components/admin/question/QuestionFormDialog";
import { Skeleton } from "@/components/ui/skeleton";
import AiImportModal from "@/components/admin/question-bank/AiImportModal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { resolveQuestionBankEmptyModuleCopy } from "@/lib/question-bank-empty-module";

const PAGE_SIZE = 20;

export function QuestionBankTab({
  courseId,
  canMutateQuestions,
  canViewContentTab,
  onOpenContentTab,
}: {
  courseId: string;
  canMutateQuestions: boolean;
  canViewContentTab: boolean;
  onOpenContentTab: () => void;
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search.trim(), 300);
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [chapterFilter, setChapterFilter] = useState<string>("");
  const [difficultyFilter, setDifficultyFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [showAiImport, setShowAiImport] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Question | null>(null);

  const { data: modules = [], isLoading: isChaptersLoading } =
    useCourseModules(courseId);
  const { data: difficultyLevels = [] } = useCourseDifficultyLevels(courseId);
  const hasChapters = modules.length > 0;

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, typeFilter, chapterFilter, difficultyFilter]);

  const filter: QuestionFilter = {
    courseId,
    search: debouncedSearch || undefined,
    type: (typeFilter as QuestionTypeDto) || undefined,
    moduleId: chapterFilter || undefined,
    difficultyLevelId: difficultyFilter || undefined,
  };
  const skip = (page - 1) * PAGE_SIZE;

  const { data: questionPage = [], isLoading } = useQuery({
    queryKey: questionKeys.list({
      ...filter,
      skip,
      take: PAGE_SIZE,
    } as Record<string, unknown>),
    queryFn: () => questionApi.getQuestions(filter, skip, PAGE_SIZE + 1),
    enabled: Boolean(courseId) && hasChapters,
  });

  const hasNextPage = questionPage.length > PAGE_SIZE;
  const questions = hasNextPage ? questionPage.slice(0, PAGE_SIZE) : questionPage;

  const invalidate = async (scopeCourseId?: string) => {
    await invalidateQuestionScopedQueries(queryClient, scopeCourseId || courseId);
  };

  const deleteMutation = useMutation({
    mutationFn: questionApi.deleteQuestion,
    onSuccess: async () => {
      const scopedId = deleteTarget?.courseId || courseId;
      toast.success("Đã xoá câu hỏi.");
      setDeleteTarget(null);
      await invalidate(scopedId);
    },
    onError: (err: {
      response?: { data?: { message?: string; usedBy?: string[] } };
    }) => {
      const data = err?.response?.data;
      if (data?.usedBy?.length) {
        toast.error(
          `Câu hỏi đang được dùng ở ${data.usedBy.length} chuyên đề. Không thể xoá.`,
        );
      } else {
        toast.error(data?.message || "Không thể xoá câu hỏi.");
      }
    },
  });

  const openCreate = () => {
    setEditingQuestion(null);
    setShowForm(true);
  };

  const openEdit = (q: Question) => {
    setEditingQuestion(q);
    setShowForm(true);
  };

  const chapterOptions = [
    { value: "", label: "Tất cả chuyên đề" },
    ...modules.map((ch) => ({ value: ch.id, label: ch.title })),
  ];
  const difficultyOptions = [
    { value: "", label: "Tất cả độ khó" },
    ...difficultyLevels.map((d) => ({ value: d.id, label: d.name })),
  ];
  const typeOptions = [
    { value: "", label: "Tất cả loại" },
    { value: "single_choice", label: "Trắc nghiệm" },
    { value: "essay", label: "Tự luận" },
  ];

  if (isChaptersLoading) {
    return (
      <div
        className="space-y-2 rounded-xl border border-border-default bg-bg-surface p-3 sm:rounded-lg sm:p-5"
        role="status"
        aria-label="Đang tải ngân hàng câu hỏi"
      >
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-20 w-full md:h-10" />
        <Skeleton className="h-20 w-full md:h-10" />
        <Skeleton className="h-20 w-full md:h-10" />
      </div>
    );
  }

  if (!hasChapters) {
    const copy = resolveQuestionBankEmptyModuleCopy(canViewContentTab);
    return (
      <section className="rounded-xl border border-dashed border-border-default bg-bg-surface p-4 sm:rounded-lg sm:p-6">
        <h2 className="text-base font-semibold text-text-primary">{copy.title}</h2>
        <p className="mt-1 text-sm text-text-secondary">{copy.body}</p>
        {copy.actionLabel ? (
          <button
            type="button"
            onClick={onOpenContentTab}
            className="mt-4 inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-text-inverse hover:bg-primary/90 sm:min-h-10"
          >
            {copy.actionLabel}
          </button>
        ) : null}
      </section>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4 rounded-xl border border-border-default bg-bg-surface p-3 shadow-sm sm:rounded-lg sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-bold text-text-primary sm:text-xl">
          Ngân hàng câu hỏi
        </h2>
        {canMutateQuestions ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowAiImport(true)}
              className="inline-flex min-h-11 flex-1 items-center justify-center rounded-md border border-border-default bg-bg-surface px-4 py-2 text-sm font-medium text-text-primary hover:bg-bg-secondary/40 sm:min-h-10 sm:flex-none sm:w-auto"
            >
              Nhập từ AI
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex min-h-11 flex-1 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-text-inverse hover:bg-primary/90 sm:min-h-10 sm:flex-none"
            >
              + Thêm câu hỏi
            </button>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-start">
        <input
          type="text"
          aria-label="Tìm kiếm nội dung"
          placeholder="Tìm kiếm nội dung..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-h-11 w-full rounded-md border border-border-default bg-bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus md:w-64 md:shrink-0"
        />
        <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <UpgradedSelect
            value={chapterFilter}
            onValueChange={setChapterFilter}
            searchable
            options={chapterOptions}
            placeholder="Chuyên đề"
            ariaLabel="Lọc theo chuyên đề"
            noResultsLabel="Không tìm thấy chuyên đề phù hợp."
          />
          <UpgradedSelect
            value={difficultyFilter}
            onValueChange={setDifficultyFilter}
            options={difficultyOptions}
            placeholder="Độ khó"
            ariaLabel="Lọc theo độ khó"
          />
          <UpgradedSelect
            value={typeFilter}
            onValueChange={setTypeFilter}
            options={typeOptions}
            placeholder="Loại câu hỏi"
            ariaLabel="Lọc theo loại"
          />
        </div>
      </div>

      {isLoading ? (
        <div
          className="space-y-2"
          role="status"
          aria-label="Đang tải danh sách câu hỏi"
        >
          <Skeleton className="h-20 w-full md:h-10" />
          <Skeleton className="h-20 w-full md:h-10" />
          <Skeleton className="h-20 w-full md:h-10" />
          <Skeleton className="h-20 w-full md:h-10" />
          <Skeleton className="h-20 w-full md:h-10" />
        </div>
      ) : questions.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border-default p-6 text-center text-sm text-text-muted">
          Chưa có câu hỏi nào.
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-3 md:hidden">
            {questions.map((q) => (
              <li
                key={q.id}
                role="button"
                tabIndex={0}
                className="group relative cursor-pointer rounded-lg border border-border-default bg-bg-primary p-3 transition-colors hover:bg-bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                onClick={() => openEdit(q)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openEdit(q);
                  }
                }}
                aria-label="Sửa câu hỏi"
              >
                {canMutateQuestions ? (
                  <button
                    type="button"
                    className="absolute right-2 top-2 rounded-lg p-2 text-text-muted transition-colors hover:bg-error/10 hover:text-error focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                    aria-label="Xoá câu hỏi"
                    title="Xoá"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(q);
                    }}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                ) : null}
                <MathContent
                  content={q.content}
                  className="line-clamp-4 pr-10 text-sm text-text-primary"
                />
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                  <Badge variant={q.type === "single_choice" ? "info" : "success"}>
                    {q.type === "single_choice" ? "Trắc nghiệm" : "Tự luận"}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>

          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nội dung</TableHead>
                  <TableHead className="w-28">Loại</TableHead>
                  <TableHead className="w-12">
                    <span className="sr-only">Xoá</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {questions.map((q) => (
                  <TableRow
                    key={q.id}
                    role="button"
                    tabIndex={0}
                    className="group cursor-pointer"
                    onClick={() => openEdit(q)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openEdit(q);
                      }
                    }}
                    aria-label="Sửa câu hỏi"
                  >
                    <TableCell className="max-w-xs">
                      <MathContent
                        content={q.content}
                        className="line-clamp-2 text-sm"
                      />
                    </TableCell>
                    <TableCell>
                      <Badge variant={q.type === "single_choice" ? "info" : "success"}>
                        {q.type === "single_choice" ? "Trắc nghiệm" : "Tự luận"}
                      </Badge>
                    </TableCell>
                    <TableCell
                      className="text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {canMutateQuestions ? (
                        <button
                          type="button"
                          className="rounded-lg p-2 text-text-muted opacity-0 transition-[opacity,background-color,color] group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-error/10 hover:text-error focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                          aria-label="Xoá câu hỏi"
                          title="Xoá"
                          onClick={() => setDeleteTarget(q)}
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {page > 1 || hasNextPage ? (
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="min-h-11 rounded-md border border-border-default px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-tertiary disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-10"
              >
                Trước
              </button>
              <span className="text-xs text-text-secondary">Trang {page}</span>
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                disabled={!hasNextPage}
                className="min-h-11 rounded-md border border-border-default px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-tertiary disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-10"
              >
                Sau
              </button>
            </div>
          ) : null}
        </>
      )}

      {deleteTarget ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null);
          }}
          title="Xác nhận xoá"
          description="Bạn có chắc muốn xoá câu hỏi này? Hành động này không thể hoàn tác."
          confirmLabel="Xoá"
          cancelLabel="Huỷ"
          variant="destructive"
          confirmPending={deleteMutation.isPending}
          onConfirm={() => {
            deleteMutation.mutate(deleteTarget.id);
          }}
        />
      ) : null}

      {showForm ? (
        <QuestionFormDialog
          question={editingQuestion}
          courseId={courseId}
          onClose={() => {
            setShowForm(false);
            setEditingQuestion(null);
          }}
          onSaved={() => {
            setShowForm(false);
            setEditingQuestion(null);
          }}
        />
      ) : null}

      {showAiImport ? (
        <AiImportModal
          courseId={courseId}
          onClose={() => setShowAiImport(false)}
          onImported={async () => {
            setShowAiImport(false);
            await invalidate();
          }}
        />
      ) : null}
    </div>
  );
}
