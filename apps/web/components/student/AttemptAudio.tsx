"use client";

import {
  createContext,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useMutation } from "@tanstack/react-query";
import { Headphones, Loader2, Pause, Play } from "lucide-react";
import { toast } from "sonner";
import type { AttemptAudioPlayDto, AttemptAudioView } from "@/dtos/attempt.dto";
import { audioPlaysLeft, formatAudioTime } from "@/lib/attempt-audio";
import { getMutationErrorMessage } from "@/lib/mutation-feedback";

type PlayAudio = (audioId: string) => Promise<AttemptAudioPlayDto>;

const PlayAudioContext = createContext<PlayAudio | null>(null);

/** Trang làm bài cấp hàm "bấm phát" (gọi API, trừ lượt) cho mọi audio bên trong. */
export function AttemptAudioProvider({
  play,
  children,
}: {
  play: PlayAudio;
  children: ReactNode;
}) {
  return (
    <PlayAudioContext.Provider value={play}>
      {children}
    </PlayAudioContext.Provider>
  );
}

/**
 * Trình phát audio duy nhất (làm bài, ôn nhẹ, xem lại, soạn đề). Không giới
 * hạn lượt → URL có sẵn, tải metadata để hiện thời lượng. Có giới hạn → mỗi
 * lần nghe từ đầu xin URL mới (server trừ lượt); tạm dừng rồi nghe tiếp không
 * tốn lượt. Không cho tua thì chỉ hiện thanh tiến độ.
 */
export default function AttemptAudio({
  audio,
  label = "Audio",
}: {
  audio: AttemptAudioView;
  label?: string;
}) {
  const play = useContext(PlayAudioContext);
  // Có giới hạn lượt mà không có hàm phát (ngoài trang làm bài) thì không xin
  // được URL — phát như audio thường bằng URL đang có.
  const view =
    audio.maxPlays !== null && !play
      ? { ...audio, maxPlays: null, playsUsed: 0 }
      : audio;
  if (view.maxPlays === null && !view.url) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-warning">
        <Headphones className="size-4 shrink-0" aria-hidden />
        Không tải được audio — tải lại trang để thử lại.
      </p>
    );
  }
  // Đổi file (soạn đề tải audio khác) → dựng lại trình phát với URL mới.
  return (
    <AudioPlayer
      key={view.url ?? view.id}
      audio={view}
      label={label}
      play={play}
    />
  );
}

function AudioPlayer({
  audio,
  label,
  play,
}: {
  audio: AttemptAudioView;
  label: string;
  play: PlayAudio | null;
}) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playsUsed, setPlaysUsed] = useState(audio.playsUsed);
  const unlimited = audio.maxPlays === null;
  /**
   * URL đang gắn vào trình phát. Không giới hạn: luôn là URL có sẵn. Có giới
   * hạn: URL của lần nghe đang dở (null = chưa nghe / đã nghe hết lần trước).
   */
  const [src, setSrc] = useState<string | null>(unlimited ? audio.url : null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState({ current: 0, duration: 0 });

  const left = audioPlaysLeft({ ...audio, playsUsed });

  const start = useMutation({
    // Chỉ chạy khi có giới hạn lượt — wrapper bảo đảm lúc đó có `play`.
    mutationFn: async (): Promise<AttemptAudioPlayDto> => {
      if (!play) throw new Error("Không phát được audio.");
      return play(audio.id);
    },
    onSuccess: (result) => {
      setPlaysUsed(result.playsUsed);
      if (!result.url) {
        toast.error("Không tải được audio — tải lại trang để thử lại.");
        return;
      }
      setSrc(result.url);
      // iOS có thể chặn play() sau await mạng: lượt đã trừ, URL giữ lại —
      // học sinh bấm lần nữa thì phát ngay, không tốn thêm lượt.
      requestAnimationFrame(() => {
        ref.current?.play().catch(() => setPlaying(false));
      });
    },
    onError: (error) =>
      toast.error(getMutationErrorMessage(error, "Không phát được audio.")),
  });

  const toggle = () => {
    const el = ref.current;
    if (!el) return;
    if (src) {
      if (el.paused) void el.play().catch(() => setPlaying(false));
      else el.pause();
      return;
    }
    if (left === null || left > 0) start.mutate();
  };

  const exhausted = !src && left === 0;
  const showTime = unlimited || Boolean(src);
  const progress = time.duration ? (time.current / time.duration) * 100 : 0;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border-default bg-bg-surface p-2">
      <button
        type="button"
        onClick={toggle}
        disabled={exhausted || start.isPending}
        aria-label={playing ? `Tạm dừng ${label}` : `Nghe ${label}`}
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-text-inverse disabled:bg-bg-secondary disabled:text-text-muted"
      >
        {start.isPending ? (
          <Loader2 className="size-5 animate-spin" aria-hidden />
        ) : playing ? (
          <Pause className="size-5" aria-hidden />
        ) : (
          <Play className="size-5" aria-hidden />
        )}
      </button>
      <div className="min-w-0 flex-1 space-y-1">
        {audio.allowSeek && src ? (
          <input
            type="range"
            min={0}
            max={time.duration || 0}
            step={0.1}
            value={time.current}
            onChange={(e) => {
              if (ref.current) ref.current.currentTime = Number(e.target.value);
            }}
            aria-label={`Tua ${label}`}
            className="h-2 w-full accent-primary"
          />
        ) : (
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-bg-secondary"
            role="progressbar"
            aria-valuenow={Math.round(progress)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Tiến độ ${label}`}
          >
            <div
              className="h-full bg-primary transition-[width]"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
        <p className="flex items-center gap-1 text-xs tabular-nums text-text-muted">
          <Headphones className="size-3.5 shrink-0" aria-hidden />
          {exhausted
            ? "Đã hết lượt nghe"
            : [
                showTime
                  ? `${formatAudioTime(time.current)} / ${formatAudioTime(time.duration)}`
                  : null,
                left === null
                  ? null
                  : `Còn ${left}/${audio.maxPlays} lượt nghe`,
                audio.allowSeek ? null : "không tua được",
              ]
                .filter(Boolean)
                .join(" · ")}
        </p>
      </div>
      <audio
        ref={ref}
        src={src ?? undefined}
        // Không giới hạn: chỉ tải metadata (thời lượng), chưa tải cả bài
        // trên 4G. Có giới hạn: URL chỉ có khi bấm nghe → tải luôn.
        preload={unlimited ? "metadata" : "auto"}
        playsInline
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={(e) => {
          setPlaying(false);
          if (unlimited) {
            // Giữ URL để nghe lại / tua; về đầu bài.
            e.currentTarget.currentTime = 0;
            return;
          }
          setSrc(null);
          setTime({ current: 0, duration: 0 });
        }}
        onLoadedMetadata={(e) =>
          setTime({ current: 0, duration: e.currentTarget.duration || 0 })
        }
        onTimeUpdate={(e) =>
          setTime({
            current: e.currentTarget.currentTime,
            duration: e.currentTarget.duration || 0,
          })
        }
        className="hidden"
      />
    </div>
  );
}
