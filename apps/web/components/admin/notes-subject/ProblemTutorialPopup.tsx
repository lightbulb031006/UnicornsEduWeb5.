"use client";

import { useEffect, useRef } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import NotesSubjectRichEditor from "./NotesSubjectRichEditor";
import {
  getProblemTutorial,
  upsertProblemTutorial,
} from "@/lib/apis/cf-problem-tutorial.api";
import { tutorialStoredContentToMarkdownSource } from "@/lib/tutorial-markdown";
import type { CfProblem } from "@/dtos/codeforces.dto";

type Props = {
  open: boolean;
  onClose: () => void;
  problem: CfProblem | null;
  mode: "view" | "edit";
};

type FormValues = {
  tutorial: string;
};

export default function ProblemTutorialPopup({
  open,
  onClose,
  problem,
  mode,
}: Props) {
  const queryClient = useQueryClient();
  const contestId = problem?.contestId ?? 0;
  const problemIndex = problem?.index ?? "";

  const { data, isLoading, isError } = useQuery({
    queryKey: ["cf-problem-tutorial", contestId, problemIndex],
    queryFn: () => getProblemTutorial(contestId, problemIndex),
    enabled: open && !!problem && contestId > 0 && !!problemIndex,
  });

  const { mutate: saveTutorial, isPending: isSaving } = useMutation({
    mutationFn: (tutorial: string | null) =>
      upsertProblemTutorial(contestId, problemIndex, tutorial),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["cf-problem-tutorial", contestId, problemIndex],
      });
      toast.success("Đã lưu tutorial.");
      onClose();
    },
    onError: () => {
      toast.error("Không lưu được tutorial.");
    },
  });

  const {
    control,
    setValue,
    handleSubmit,
    reset,
    formState: { isDirty },
  } = useForm<FormValues>({
    defaultValues: { tutorial: "" },
  });

  const tutorialValue = useWatch({
    control,
    name: "tutorial",
  });
  const initializedKeyRef = useRef<string | null>(null);
  const tutorialQueryKey = `${contestId}:${problemIndex}`;

  useEffect(() => {
    if (!open) return;

    const existing = document.getElementById("katex-styles");
    if (existing) return;

    const link = document.createElement("link");
    link.id = "katex-styles";
    link.rel = "stylesheet";
    link.href = "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css";
    link.crossOrigin = "anonymous";
    document.head.appendChild(link);
  }, [open]);

  useEffect(() => {
    if (!open || !problem || isLoading) return;

    const isNewProblem = initializedKeyRef.current !== tutorialQueryKey;
    if (!isNewProblem && isDirty) return;

    const val = data?.tutorial ?? "";
    reset({ tutorial: val });
    initializedKeyRef.current = tutorialQueryKey;
  }, [
    open,
    problem,
    isLoading,
    tutorialQueryKey,
    data?.tutorial,
    reset,
    isDirty,
  ]);

  useEffect(() => {
    if (!open) {
      initializedKeyRef.current = null;
    }
  }, [open]);

  const onFormSubmit = (values: FormValues) => {
    saveTutorial(values.tutorial || null);
  };

  if (!open) return null;

  const tutorialMarkdownSource = tutorialStoredContentToMarkdownSource(
    tutorialValue ?? data?.tutorial ?? "",
  );

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-bg-primary/75"
        aria-hidden
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="problem-tutorial-form-title"
        className="fixed inset-x-3 top-1/2 z-50 max-h-[88vh] -translate-y-1/2 overflow-y-auto rounded-xl border border-border-default bg-bg-surface p-4 shadow-xl sm:left-1/2 sm:w-full sm:max-w-2xl sm:-translate-x-1/2 sm:p-5"
      >
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2
            id="problem-tutorial-form-title"
            className="text-lg font-semibold text-text-primary"
          >
            {mode === "edit" ? "Chỉnh sửa tutorial" : "Xem tutorial"}: {problem?.name ?? "—"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-text-muted transition-colors duration-200 hover:bg-bg-tertiary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            aria-label="Đóng"
          >
            <svg
              className="size-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4">
          <div className="flex flex-col gap-1 text-sm text-text-secondary">
            <span>Nội dung tutorial</span>
            {isLoading ? (
              <div className="min-h-[180px] rounded-md border border-border-default bg-bg-secondary animate-pulse" />
            ) : isError ? (
              <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
                Không tải được tutorial hiện tại. Vui lòng thử lại sau.
              </div>
            ) : mode === "edit" ? (
              <NotesSubjectRichEditor
                value={tutorialValue}
                onChange={(html) =>
                  setValue("tutorial", html, { shouldDirty: true })
                }
                minHeight="min-h-[200px]"
              />
            ) : (
              <div className="prose prose-sm max-w-none min-h-[200px] rounded-md border border-border-default bg-bg-secondary/40 px-3 py-3 text-sm text-text-primary [&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_.katex-display]:my-3">
                {tutorialMarkdownSource ? (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[[rehypeKatex, { strict: "ignore" }]]}
                  >
                    {tutorialMarkdownSource}
                  </ReactMarkdown>
                ) : (
                  <p className="text-text-muted">Chưa có tutorial cho bài này.</p>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border-default pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border-default bg-bg-surface px-4 py-2 text-sm font-medium text-text-primary transition-colors duration-200 hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            >
              {mode === "edit" ? "Hủy" : "Đóng"}
            </button>
            {mode === "edit" && (
              <button
                type="submit"
                disabled={isSaving || isLoading || isError}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-text-inverse transition-colors duration-200 hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:opacity-60"
              >
                {isSaving ? "Đang lưu…" : "Lưu"}
              </button>
            )}
          </div>
        </form>
      </div>
    </>
  );
}
