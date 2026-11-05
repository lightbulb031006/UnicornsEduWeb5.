"use client";

import { useRef, type ChangeEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import QuestionAudio from "@/components/student/QuestionAudio";
import { Switch } from "@/components/ui/switch";
import UpgradedSelect from "@/components/ui/UpgradedSelect";
import {
  AUDIO_ACCEPT,
  AUDIO_MAX_PLAYS_OPTIONS,
  type AudioRef,
  type UpdateAudioLimitsPayload,
} from "@/dtos/audio-asset.dto";
import { updateAudioLimits, uploadAudio } from "@/lib/apis/audio-asset.api";
import { audioFileError } from "@/lib/audio-file";
import { getMutationErrorMessage } from "@/lib/mutation-feedback";

const UNLIMITED = "unlimited";
const PLAYS_OPTIONS = [
  { value: UNLIMITED, label: "Không giới hạn" },
  ...AUDIO_MAX_PLAYS_OPTIONS.map((n) => ({
    value: String(n),
    label: `${n} lần`,
  })),
];

/**
 * Chọn audio cho câu / tư liệu dùng chung (JP). Tải lên ngay khi chọn file;
 * giá trị form chỉ là tham chiếu — lưu câu/tư liệu mới gắn audio vào.
 * Giới hạn nghe nằm trên audio, đổi là lưu ngay (không chờ lưu câu); thay
 * audio thì audio mới giữ giới hạn cũ.
 */
export default function AudioUploadField({
  courseId,
  value,
  onChange,
  label = "Audio",
  hint,
}: {
  courseId: string;
  value: AudioRef | null;
  onChange: (next: AudioRef | null) => void;
  label?: string;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const limitsOf = (audio: AudioRef | null): UpdateAudioLimitsPayload => ({
    maxPlays: audio?.maxPlays ?? null,
    allowSeek: audio?.allowSeek ?? true,
  });
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const uploaded = await uploadAudio(courseId, file);
      const limits = limitsOf(value);
      const isDefault = limits.maxPlays === null && limits.allowSeek;
      return isDefault
        ? uploaded
        : {
            ...(await updateAudioLimits(uploaded.id, limits)),
            url: uploaded.url,
          };
    },
    onSuccess: (audio) => {
      onChange(audio);
      toast.success("Đã tải audio lên.");
    },
    onError: (error) =>
      toast.error(getMutationErrorMessage(error, "Không thể tải audio lên.")),
  });

  const limits = useMutation({
    mutationFn: ({
      current,
      payload,
    }: {
      current: AudioRef;
      payload: UpdateAudioLimitsPayload;
    }) =>
      updateAudioLimits(current.id, payload).then((audio) => ({
        ...current,
        ...audio,
        url: current.url,
      })),
    onSuccess: (audio) => {
      onChange(audio);
      toast.success("Đã lưu giới hạn nghe.");
    },
    onError: (error) =>
      toast.error(
        getMutationErrorMessage(error, "Không lưu được giới hạn nghe."),
      ),
  });
  const saveLimits = (patch: Partial<UpdateAudioLimitsPayload>) => {
    if (value) {
      limits.mutate({
        current: value,
        payload: { ...limitsOf(value), ...patch },
      });
    }
  };

  const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const error = audioFileError(file);
    if (error) {
      toast.error(error);
      return;
    }
    upload.mutate(file);
  };

  return (
    <div className="space-y-2">
      <span className="block text-xs font-medium text-text-muted">{label}</span>
      {value ? (
        <div className="space-y-1.5 rounded-lg border border-border-default p-2">
          {value.url !== undefined ? (
            <QuestionAudio url={value.url} label={value.originalName} />
          ) : null}
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-xs text-text-secondary">
              {value.originalName}
            </span>
            <button
              type="button"
              onClick={() => onChange(null)}
              disabled={upload.isPending}
              className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-sm text-text-muted hover:bg-error/10 hover:text-error disabled:opacity-50 sm:min-h-9"
            >
              <X className="size-4" aria-hidden />
              Gỡ audio
            </button>
          </div>
          <div className="grid gap-2 border-t border-border-default pt-2 sm:grid-cols-2 sm:items-center">
            <div className="space-y-1 text-xs text-text-muted">
              <span>Số lần nghe khi làm bài</span>
              <UpgradedSelect
                value={
                  value.maxPlays == null ? UNLIMITED : String(value.maxPlays)
                }
                onValueChange={(v) =>
                  saveLimits({ maxPlays: v === UNLIMITED ? null : Number(v) })
                }
                options={PLAYS_OPTIONS}
                disabled={limits.isPending || upload.isPending}
                ariaLabel="Số lần nghe khi làm bài"
              />
            </div>
            <label className="flex min-h-11 items-center justify-between gap-2 text-sm text-text-secondary sm:justify-start">
              <span>Cho tua khi làm bài</span>
              <Switch
                checked={value.allowSeek ?? true}
                onCheckedChange={(allowSeek) => saveLimits({ allowSeek })}
                disabled={limits.isPending || upload.isPending}
                aria-label="Cho tua khi làm bài"
              />
            </label>
            <p className="text-xs text-text-muted sm:col-span-2">
              Xem lại sau khi nộp và ôn nhẹ luôn nghe tự do.
            </p>
          </div>
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={!courseId || upload.isPending}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-border-default px-3 text-sm text-primary hover:border-primary/50 disabled:opacity-50 sm:min-h-10"
      >
        {upload.isPending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Upload className="size-4" aria-hidden />
        )}
        {upload.isPending
          ? "Đang tải lên..."
          : value
            ? "Thay audio"
            : "Tải audio lên"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={AUDIO_ACCEPT}
        onChange={handleFile}
        className="hidden"
        aria-label={label}
      />
      <p className="text-xs text-text-muted">
        {hint ?? "MP3, M4A/AAC hoặc WAV, tối đa 20MB."}
      </p>
    </div>
  );
}
