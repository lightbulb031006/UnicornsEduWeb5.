"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as questionApi from "@/lib/apis/question.api";
import * as sharedMaterialApi from "@/lib/apis/shared-material.api";
import { questionKeys, sharedMaterialKeys } from "@/lib/query-keys";
import { appendInlineText } from "@/lib/fill-blank";
import { materialGapIds, materialGapMarker } from "@/lib/material-gaps";
import UpgradedSelect from "@/components/ui/UpgradedSelect";
import {
  ResponsiveActionFooter,
  ResponsiveDialog,
  ResponsiveDialogBody,
} from "@/components/ui/ResponsiveDialog";
import {
  confirmUnsavedClose,
  useConfirmDialog,
} from "@/components/ui/ConfirmDialog";
import MathRichTextEditor from "@/components/ui/MathRichTextEditor";
import { useQuestionImageUpload } from "@/lib/hooks/useQuestionImageUpload";
import AudioUploadField from "@/components/admin/question/AudioUploadField";
import { useAppConfig } from "@/lib/hooks/useAppConfig";
import { invalidateQuestionScopedQueries } from "@/lib/query-invalidation";
import { getMutationErrorMessage } from "@/lib/mutation-feedback";
import { DeleteQuestionSetButton } from "./DeleteQuestionSetButton";
import SetQuestionList from "./SetQuestionList";
import { formatLessonUsage } from "./lesson-usage";
import { questionExcerpt } from "@/lib/question-excerpt";
import { useCourseModules } from "@/lib/hooks/useCourseModules";
import type { AudioRef } from "@/dtos/audio-asset.dto";
import {
  SHARED_MATERIAL_TITLE_MAX,
  type SharedMaterial,
} from "@/dtos/shared-material.dto";

type SetHeaderForm = {
  moduleId: string;
  title: string;
  content: string;
  audio: AudioRef | null;
};

const headerFormOf = (material: SharedMaterial | null): SetHeaderForm => ({
  moduleId: material?.moduleId ?? "",
  title: material?.title ?? "",
  content: material?.content ?? "",
  audio: material?.audio ?? null,
});

/** Phần đầu bộ cần ít nhất một trong: văn bản, ảnh, audio (khớp luật API). */
function hasSetHeader(form: SetHeaderForm): boolean {
  const text = form.content
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .trim();
  return Boolean(text) || /<img\b/i.test(form.content) || Boolean(form.audio);
}

/**
 * Soạn / sửa một Bộ câu hỏi trong một form: phần đầu bộ (văn bản, ảnh, audio
 * upload mới, vị trí trống), chuyên đề của bộ và các câu trong bộ. Tạo xong
 * form ở lại để thêm câu.
 */
export default function SharedMaterialFormDialog({
  courseId,
  material,
  onClose,
}: {
  courseId: string;
  material: SharedMaterial | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: appConfig } = useAppConfig();
  const audioEnabled = appConfig?.questionAudio ?? false;
  const uploadImage = useQuestionImageUpload(courseId);
  const { data: modules = [] } = useCourseModules(courseId);
  // Bộ đang sửa: bộ truyền vào, hoặc bộ vừa tạo trong form này.
  const [saved, setSaved] = useState(material);
  const [initial, setInitial] = useState(() => headerFormOf(material));
  const [form, setForm] = useState(initial);
  const [gapQuestionId, setGapQuestionId] = useState("");

  // Câu của bộ theo thứ tự bộ — danh sách câu + nối vị trí trống.
  const attachedFilter = { courseId, sharedMaterialId: saved?.id };
  const { data: attached = [], isPending: attachedPending } = useQuery({
    queryKey: questionKeys.list(attachedFilter),
    queryFn: () => questionApi.getQuestions(attachedFilter, 0, 200),
    enabled: Boolean(saved),
  });
  const { data: usage } = useQuery({
    queryKey: sharedMaterialKeys.usage(saved?.id ?? ""),
    queryFn: () => sharedMaterialApi.getSharedMaterialUsage(saved!.id),
    enabled: Boolean(saved),
  });
  const usageText = usage ? formatLessonUsage(usage) : null;
  const attachedById = new Map(attached.map((q) => [q.id, q]));
  const gapIds = materialGapIds(form.content);

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        moduleId: form.moduleId,
        title: form.title,
        content: form.content,
        ...(audioEnabled && { audioId: form.audio?.id ?? null }),
      };
      return saved
        ? sharedMaterialApi.updateSharedMaterial(saved.id, payload)
        : sharedMaterialApi.createSharedMaterial({ courseId, ...payload });
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({
        queryKey: sharedMaterialKeys.course(courseId),
      });
      if (saved) {
        toast.success("Đã cập nhật bộ câu hỏi.");
        if (result.moduleId !== saved.moduleId) {
          await invalidateQuestionScopedQueries(queryClient, courseId);
        }
        onClose();
        return;
      }
      toast.success("Đã tạo bộ — thêm câu vào bộ.");
      setSaved(result);
      const next = headerFormOf(result);
      setInitial(next);
      setForm(next);
    },
    onError: (error) =>
      toast.error(getMutationErrorMessage(error, "Không thể lưu bộ câu hỏi.")),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.moduleId) {
      toast.error("Chọn chuyên đề của bộ.");
      return;
    }
    if (!form.title.trim()) {
      toast.error("Nhập tên bộ.");
      return;
    }
    if (!hasSetHeader(form)) {
      toast.error("Phần đầu bộ cần có văn bản, ảnh hoặc audio.");
      return;
    }
    saveMutation.mutate();
  };

  const { confirm, dialog } = useConfirmDialog();
  const isDirty = JSON.stringify(form) !== JSON.stringify(initial);
  const requestClose = async () => {
    if (await confirmUnsavedClose(confirm, isDirty)) onClose();
  };

  return (
    <>
      <ResponsiveDialog
        size="3xl"
        labelledBy="shared-material-form-title"
        onBackdropClick={() => void requestClose()}
      >
        <div className="border-b border-border-default px-4 py-3 md:px-6">
          <h2
            id="shared-material-form-title"
            className="text-lg font-bold text-text-primary"
          >
            {saved ? "Sửa bộ câu hỏi" : "Thêm bộ câu hỏi"}
          </h2>
        </div>
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <ResponsiveDialogBody className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-text-muted">
                Tên (chỉ người soạn thấy)
              </span>
              <input
                value={form.title}
                maxLength={SHARED_MATERIAL_TITLE_MAX}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, title: e.target.value }))
                }
                placeholder="Vd: Bài đọc お花見"
                className="min-h-11 w-full rounded-md border border-border-default bg-bg-surface px-3 py-2 text-base text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus sm:text-sm"
              />
            </label>
            <div>
              <span className="mb-1 block text-xs font-medium text-text-muted">
                Chuyên đề
              </span>
              <UpgradedSelect
                value={form.moduleId}
                onValueChange={(moduleId) =>
                  setForm((prev) => ({ ...prev, moduleId }))
                }
                options={modules.map((m) => ({ value: m.id, label: m.title }))}
                placeholder="Chọn chuyên đề"
                ariaLabel="Chuyên đề của bộ"
              />
              {saved && form.moduleId !== saved.moduleId ? (
                <p className="mt-1 text-xs text-warning">
                  Mọi câu trong bộ chuyển sang chuyên đề mới.
                </p>
              ) : null}
            </div>
            <div>
              <span className="mb-1 block text-xs font-medium text-text-muted">
                Phần đầu bộ (đoạn văn, ảnh) — cần ít nhất văn bản, ảnh hoặc audio
              </span>
              <MathRichTextEditor
                value={form.content}
                onChange={(next) =>
                  setForm((prev) => ({ ...prev, content: next }))
                }
                ariaLabel="Phần đầu bộ"
                onUploadImage={uploadImage}
                placeholder="Dán đoạn văn hoặc chèn ảnh..."
                minHeight="min-h-[200px]"
              />
            </div>
            {audioEnabled ? (
              <AudioUploadField
                courseId={courseId}
                value={form.audio}
                onChange={(audio) => setForm((prev) => ({ ...prev, audio }))}
                label="Audio của bộ (bài nghe cho cả bộ)"
              />
            ) : null}
            <div className="space-y-2 rounded-lg border border-border-default p-3">
              <span className="block text-xs font-medium text-text-muted">
                Vị trí trống (đoạn văn điền số câu)
              </span>
              {saved && attached.length > 0 ? (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="min-w-0 flex-1">
                    <UpgradedSelect
                      searchable
                      value={gapQuestionId}
                      onValueChange={setGapQuestionId}
                      options={attached.map((q) => ({
                        value: q.id,
                        label: questionExcerpt(q.content),
                      }))}
                      placeholder="Chọn câu nối tới vị trí trống"
                      ariaLabel="Câu nối tới vị trí trống"
                      noResultsLabel="Không tìm thấy câu."
                    />
                  </div>
                  <button
                    type="button"
                    disabled={!gapQuestionId}
                    onClick={() => {
                      setForm((prev) => ({
                        ...prev,
                        content: appendInlineText(
                          prev.content,
                          materialGapMarker(gapQuestionId),
                        ),
                      }));
                      setGapQuestionId("");
                    }}
                    className="inline-flex min-h-11 items-center justify-center rounded-md border border-border-default px-3 text-sm text-primary hover:border-primary/50 disabled:opacity-50 sm:min-h-10"
                  >
                    Chèn vị trí trống
                  </button>
                </div>
              ) : (
                <p className="text-xs text-text-muted">
                  Thêm câu vào bộ trước rồi chèn vị trí trống.
                </p>
              )}
              <p className="text-xs text-text-muted">
                Dấu <code>[[#…]]</code> chèn vào cuối nội dung — cắt/dán tới đúng
                chỗ. Học sinh thấy số câu trong lượt làm, vd （27）.
              </p>
              {gapIds.length > 0 && !(saved && attachedPending) ? (
                <ol className="space-y-1 text-xs">
                  {gapIds.map((id) => {
                    const q = attachedById.get(id);
                    return (
                      <li
                        key={id}
                        className={q ? "text-text-secondary" : "text-warning"}
                      >
                        {q
                          ? `Nối tới: ${questionExcerpt(q.content)}`
                          : "Nối tới câu không còn trong bộ — học sinh thấy ô không số. Xoá dấu hoặc thêm lại câu."}
                      </li>
                    );
                  })}
                </ol>
              ) : null}
            </div>
            {usageText ? (
              <p
                role="note"
                className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-text-primary"
              >
                Bộ đang ở {usageText}. Thêm / xoá câu đổi đề của các tiết này
                cho lượt làm bắt đầu sau.
              </p>
            ) : null}
            {saved ? (
              <SetQuestionList
                courseId={courseId}
                set={saved}
                questions={attached}
                loading={attachedPending}
              />
            ) : (
              <p className="text-xs text-text-muted">
                Lưu phần đầu bộ rồi thêm câu vào bộ ngay trong form này.
              </p>
            )}
            {saved ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-text-muted">
                  Bài làm đã bắt đầu giữ nội dung cũ của bộ.
                </p>
                <DeleteQuestionSetButton
                  courseId={courseId}
                  set={saved}
                  onDeleted={onClose}
                />
              </div>
            ) : null}
          </ResponsiveDialogBody>
          <ResponsiveActionFooter>
            <button
              type="button"
              onClick={() => void requestClose()}
              className="rounded-md border border-border-default px-4 py-2 text-sm text-text-secondary hover:bg-bg-secondary/40"
            >
              {saved && !isDirty ? "Đóng" : "Huỷ"}
            </button>
            <button
              type="submit"
              disabled={saveMutation.isPending}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-text-inverse hover:bg-primary/90 disabled:opacity-50"
            >
              {saveMutation.isPending
                ? "Đang lưu..."
                : saved
                  ? "Lưu"
                  : "Tạo bộ"}
            </button>
          </ResponsiveActionFooter>
        </form>
      </ResponsiveDialog>
      {dialog}
    </>
  );
}
