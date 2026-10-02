"use client";

import {
  useEffect,
  useRef,
  useState,
  useMemo,
  useCallback,
  useId,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  Volume1,
  VolumeX,
  Maximize,
  Minimize,
  Loader2,
  Check,
  Settings,
  Gauge,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDevToolsDetector, nukeProtectedMedia } from "@/lib/useDevToolsDetector";
import { extractYouTubeVideoId } from "@/lib/youtube";

export { extractYouTubeVideoId } from "@/lib/youtube";

export type YouTubeEmbedProps = {
  url: string;
  protected?: boolean;
  className?: string;
  title?: string;
};

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const s = Math.floor(seconds);
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;

  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

// Global script loader for YouTube IFrame API
let ytApiPromise: Promise<void> | null = null;

function loadYouTubeIframeApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject();
  if ((window as unknown as { YT?: { Player?: unknown } }).YT?.Player) {
    return Promise.resolve();
  }

  if (!ytApiPromise) {
    ytApiPromise = new Promise<void>((resolve) => {
      const existing = document.getElementById("youtube-iframe-api");
      if (!existing) {
        const tag = document.createElement("script");
        tag.id = "youtube-iframe-api";
        tag.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(tag);
      }

      const prevReady = (window as unknown as { onYouTubeIframeAPIReady?: () => void }).onYouTubeIframeAPIReady;
      (window as unknown as { onYouTubeIframeAPIReady?: () => void }).onYouTubeIframeAPIReady = () => {
        if (typeof prevReady === "function") {
          prevReady();
        }
        resolve();
      };

      const checkInterval = setInterval(() => {
        if ((window as unknown as { YT?: { Player?: unknown } }).YT?.Player) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
    });
  }

  return ytApiPromise;
}

interface YTPlayerInstance {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getVideoLoadedFraction: () => number;
  getVolume: () => number;
  setVolume: (volume: number) => void;
  mute: () => void;
  unMute: () => void;
  isMuted: () => boolean;
  setPlaybackRate: (rate: number) => void;
  getPlaybackRate: () => number;
  destroy: () => void;
}

/** `new YT.Player()` returns a stub; methods exist only after `onReady`. */
function getReadyPlayer(player: YTPlayerInstance | null): YTPlayerInstance | null {
  if (!player || typeof player.playVideo !== "function") return null;
  return player;
}

interface FullscreenDocument extends Document {
  webkitFullscreenElement?: Element;
  mozFullScreenElement?: Element;
  msFullscreenElement?: Element;
  webkitExitFullscreen?: () => Promise<void>;
  mozCancelFullScreen?: () => Promise<void>;
  msExitFullscreen?: () => Promise<void>;
}

interface FullscreenElement extends HTMLDivElement {
  webkitRequestFullscreen?: () => Promise<void>;
  mozRequestFullScreen?: () => Promise<void>;
  msRequestFullscreen?: () => Promise<void>;
}

function getFullscreenElement(): Element | null {
  if (typeof document === "undefined") return null;
  const doc = document as FullscreenDocument;
  return (
    doc.fullscreenElement ||
    doc.webkitFullscreenElement ||
    doc.mozFullScreenElement ||
    doc.msFullscreenElement ||
    null
  );
}

const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

export default function YouTubeEmbed({
  url,
  protected: isProtected = true,
  className = "w-full aspect-video",
  title = "Video tiết học",
}: YouTubeEmbedProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayerInstance | null>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const settingsMenuRef = useRef<HTMLDivElement>(null);

  const videoId = useMemo(() => extractYouTubeVideoId(url), [url]);
  const rawId = useId();
  const playerId = useMemo(
    () => `yt-player-${rawId.replace(/[^a-zA-Z0-9_-]/g, "") || "player"}`,
    [rawId],
  );

  const [isApiReady, setIsApiReady] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [thumbnailError, setThumbnailError] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loadedFraction, setLoadedFraction] = useState(0);
  const [volume, setVolume] = useState(100);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isHoveringProgressBar, setIsHoveringProgressBar] = useState(false);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPosition, setHoverPosition] = useState<number>(0);
  const isDevToolsOpen = useDevToolsDetector({ enabled: isProtected });
  const [hasError, setHasError] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const posterUrl = useMemo(() => {
    if (!videoId) return "";
    return thumbnailError
      ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
      : `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
  }, [videoId, thumbnailError]);

  // Adjust state during render when DevTools is opened
  const [prevDevToolsOpen, setPrevDevToolsOpen] = useState(false);
  if (isProtected && isDevToolsOpen && !prevDevToolsOpen) {
    setPrevDevToolsOpen(true);
    setHasStarted(false);
    setIsPlaying(false);
    setIsApiReady(false);
  }

  // Completely destroy player and wipe iframe from DOM when DevTools is opened
  useEffect(() => {
    if (isProtected && isDevToolsOpen) {
      nukeProtectedMedia();
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {
          // ignore
        }
        playerRef.current = null;
      }
    }
  }, [isProtected, isDevToolsOpen]);

  // Fullscreen change listener across browsers
  useEffect(() => {
    const handleFullscreenChange = () => {
      const activeFullscreen = Boolean(getFullscreenElement());
      if (!activeFullscreen) {
        setIsFullscreen(false);
      }
    };

    const events = [
      "fullscreenchange",
      "webkitfullscreenchange",
      "mozfullscreenchange",
      "MSFullscreenChange",
    ];

    events.forEach((event) => {
      document.addEventListener(event, handleFullscreenChange);
    });

    return () => {
      events.forEach((event) => {
        document.removeEventListener(event, handleFullscreenChange);
      });
    };
  }, []);

  // Close settings menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (settingsMenuRef.current && !settingsMenuRef.current.contains(e.target as Node)) {
        setIsSettingsOpen(false);
      }
    };

    if (isSettingsOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isSettingsOpen]);

  // Adjust state when videoId changes
  const [prevVideoId, setPrevVideoId] = useState(videoId);
  if (prevVideoId !== videoId) {
    setPrevVideoId(videoId);
    setHasStarted(false);
    setIsPlaying(false);
    setCurrentTime(0);
    setThumbnailError(false);
    setIsApiReady(false);
  }

  // Initialize YouTube Iframe Player
  useEffect(() => {
    if (!videoId || !hasStarted || (isProtected && isDevToolsOpen)) return;

    let isMounted = true;

    loadYouTubeIframeApi().then(() => {
      if (!isMounted) return;

      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {
          // ignore
        }
        playerRef.current = null;
      }

      const YT = (window as unknown as {
        YT: {
          Player: new (
            element: HTMLElement | string,
            config: {
              host?: string;
              videoId: string;
              playerVars: Record<string, unknown>;
              events: {
                onReady?: (event: { target: YTPlayerInstance }) => void;
                onStateChange?: (event: { data: number; target: YTPlayerInstance }) => void;
                onPlaybackRateChange?: (event: { data: number; target: YTPlayerInstance }) => void;
                onError?: (event: unknown) => void;
              };
            },
          ) => YTPlayerInstance;
        };
      }).YT;

      const targetEl = document.getElementById(playerId);
      if (!targetEl) return;

      playerRef.current = new YT.Player(targetEl, {
        host: "https://www.youtube-nocookie.com",
        videoId,
        playerVars: {
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          enablejsapi: 1,
          fs: 0,
          iv_load_policy: 3,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
          origin: typeof window !== "undefined" ? window.location.origin : undefined,
          widget_referrer: typeof window !== "undefined" ? window.location.origin : undefined,
        },
        events: {
          onReady: (event) => {
            if (!isMounted) return;
            setIsApiReady(true);
            setDuration(event.target.getDuration() || 0);
            setVolume(event.target.getVolume() || 100);
            setIsMuted(event.target.isMuted() || false);
            event.target.playVideo();
          },
          onStateChange: (event) => {
            if (!isMounted) return;
            const state = event.data;
            // 1: PLAYING, 2: PAUSED, 3: BUFFERING, 0: ENDED
            setIsPlaying(state === 1);
            setIsBuffering(state === 3);
            if (state === 0) {
              setIsPlaying(false);
              setHasStarted(false);
            }
            if (playerRef.current) {
              const player = getReadyPlayer(playerRef.current);
              if (player) setDuration(player.getDuration() || 0);
            }
          },
          onPlaybackRateChange: (event: { data: number; target: YTPlayerInstance }) => {
            if (!isMounted) return;
            if (typeof event.data === "number") {
              setPlaybackSpeed(event.data);
            }
          },
          onError: () => {
            if (!isMounted) return;
            setHasError(true);
          },
        },
      });
    });

    return () => {
      isMounted = false;
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {
          // ignore
        }
        playerRef.current = null;
      }
    };
  }, [videoId, playerId, hasStarted, isProtected, isDevToolsOpen]);

  // Poll video progress when playing
  useEffect(() => {
    if (!isPlaying || !playerRef.current) return;

    const interval = setInterval(() => {
      if (playerRef.current && typeof playerRef.current.getCurrentTime === "function") {
        setCurrentTime(playerRef.current.getCurrentTime() || 0);
        if (typeof playerRef.current.getVideoLoadedFraction === "function") {
          setLoadedFraction(playerRef.current.getVideoLoadedFraction() || 0);
        }
      }
    }, 250);

    return () => clearInterval(interval);
  }, [isPlaying]);

  // Auto hide controls when idle during playback
  const resetControlsTimeout = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    if (isPlaying && !isSettingsOpen) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3500);
    }
  }, [isPlaying, isSettingsOpen]);

  const handleUserActivity = useCallback(() => {
    resetControlsTimeout();
  }, [resetControlsTimeout]);

  const togglePlayPause = useCallback(() => {
    if (!hasStarted) {
      setHasStarted(true);
      return;
    }
    const player = getReadyPlayer(playerRef.current);
    if (!player) return;
    if (isPlaying) {
      player.pauseVideo();
    } else {
      player.playVideo();
    }
    resetControlsTimeout();
  }, [hasStarted, isPlaying, resetControlsTimeout]);

  const handleSeek = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      if (!hasStarted) {
        setHasStarted(true);
      }
      const player = getReadyPlayer(playerRef.current);
      if (!progressBarRef.current || !player || duration <= 0) return;
      const rect = progressBarRef.current.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const fraction = Math.max(0, Math.min(1, clickX / rect.width));
      const targetTime = fraction * duration;
      player.seekTo(targetTime, true);
      setCurrentTime(targetTime);
      resetControlsTimeout();
    },
    [duration, hasStarted, resetControlsTimeout],
  );

  const handleProgressBarMouseMove = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      if (!progressBarRef.current || duration <= 0) return;
      const rect = progressBarRef.current.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const fraction = Math.max(0, Math.min(1, clickX / rect.width));
      setHoverPosition(clickX);
      setHoverTime(fraction * duration);
    },
    [duration],
  );

  const skipSeconds = useCallback(
    (seconds: number) => {
      const player = getReadyPlayer(playerRef.current);
      if (!player || duration <= 0) return;
      const target = Math.max(0, Math.min(duration, currentTime + seconds));
      player.seekTo(target, true);
      setCurrentTime(target);
      resetControlsTimeout();
    },
    [currentTime, duration, resetControlsTimeout],
  );

  const handleVolumeChange = useCallback((newVolume: number) => {
    const player = getReadyPlayer(playerRef.current);
    if (!player) return;
    player.setVolume(newVolume);
    setVolume(newVolume);
    if (newVolume > 0 && isMuted) {
      player.unMute();
      setIsMuted(false);
    }
  }, [isMuted]);

  const toggleMute = useCallback(() => {
    const player = getReadyPlayer(playerRef.current);
    if (!player) return;
    if (isMuted) {
      player.unMute();
      setIsMuted(false);
    } else {
      player.mute();
      setIsMuted(true);
    }
  }, [isMuted]);

  const changePlaybackSpeed = useCallback((speed: number) => {
    const player = getReadyPlayer(playerRef.current);
    if (!player) return;
    player.setPlaybackRate(speed);
    setPlaybackSpeed(speed);
    setIsSettingsOpen(false);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current as FullscreenElement | null;
    if (!container) return;

    if (!isFullscreen) {
      setIsFullscreen(true);
      // Attempt native fullscreen if supported by platform (macOS, iPad, Android, PC)
      const requestFn =
        container.requestFullscreen ||
        container.webkitRequestFullscreen ||
        container.mozRequestFullScreen ||
        container.msRequestFullscreen;

      if (typeof requestFn === "function") {
        try {
          const promise = requestFn.call(container);
          if (promise && typeof (promise as unknown as Promise<void>).catch === "function") {
            (promise as unknown as Promise<void>).catch(() => {
              // ignore error, CSS fullscreen handles it
            });
          }
        } catch {
          // ignore error, CSS fullscreen handles it
        }
      }

      // Try orientation lock on mobile devices when supported
      try {
        const orientation = screen.orientation as ScreenOrientation & {
          lock?: (orientation: string) => Promise<void>;
        };
        if (typeof orientation?.lock === "function") {
          orientation.lock("landscape").catch(() => {});
        }
      } catch {
        // unsupported on iOS Safari / ignored
      }
    } else {
      setIsFullscreen(false);
      // Attempt native exit if in native fullscreen
      const currentFs = getFullscreenElement();
      if (currentFs) {
        const doc = document as FullscreenDocument;
        const exitFn =
          doc.exitFullscreen ||
          doc.webkitExitFullscreen ||
          doc.mozCancelFullScreen ||
          doc.msExitFullscreen;

        if (typeof exitFn === "function") {
          try {
            const promise = exitFn.call(doc);
            if (promise && typeof (promise as unknown as Promise<void>).catch === "function") {
              (promise as unknown as Promise<void>).catch(() => {});
            }
          } catch {
            // ignore
          }
        }
      }

      // Try orientation unlock on mobile devices
      try {
        if (typeof screen.orientation?.unlock === "function") {
          screen.orientation.unlock();
        }
      } catch {
        // unsupported / ignored
      }
    }
  }, [isFullscreen]);

  // Lock body scroll, prevent touch gesture leaks, and handle Escape key when in Fullscreen mode
  useEffect(() => {
    if (!isFullscreen) return;

    const originalOverflow = document.body.style.overflow;
    const originalTouchAction = document.body.style.touchAction;
    const originalOverscrollBehavior = document.body.style.overscrollBehavior;

    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";
    document.body.style.overscrollBehavior = "none";

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Esc") {
        setIsFullscreen(false);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      // Prevent rubber-banding and background scrolling on iOS Safari
      const target = e.target as HTMLElement | null;
      if (!target?.closest("input[type=range], .group\\/bar")) {
        if (e.cancelable) {
          e.preventDefault();
        }
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    window.addEventListener("touchmove", handleTouchMove, { passive: false });

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.touchAction = originalTouchAction;
      document.body.style.overscrollBehavior = originalOverscrollBehavior;
      window.removeEventListener("keydown", handleGlobalKeyDown);
      window.removeEventListener("touchmove", handleTouchMove);
    };
  }, [isFullscreen]);

  const handlePreventContextMenu = useCallback((e: ReactMouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.target instanceof HTMLInputElement) return;

      switch (e.key.toLowerCase()) {
        case " ":
        case "k":
          e.preventDefault();
          togglePlayPause();
          break;
        case "arrowleft":
        case "j":
          e.preventDefault();
          skipSeconds(-10);
          break;
        case "arrowright":
        case "l":
          e.preventDefault();
          skipSeconds(10);
          break;
        case "m":
          e.preventDefault();
          toggleMute();
          break;
        case "f":
          e.preventDefault();
          toggleFullscreen();
          break;
        case "escape":
          if (isFullscreen) {
            e.preventDefault();
            setIsFullscreen(false);
          }
          break;
        case "arrowup":
          e.preventDefault();
          handleVolumeChange(Math.min(100, volume + 5));
          break;
        case "arrowdown":
          e.preventDefault();
          handleVolumeChange(Math.max(0, volume - 5));
          break;
      }
    },
    [togglePlayPause, skipSeconds, toggleMute, toggleFullscreen, handleVolumeChange, volume, isFullscreen],
  );

  if (!videoId || hasError) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center rounded-xl border border-dashed border-border-default bg-bg-secondary/40 text-xs text-text-muted p-6 text-center aspect-video",
          className,
        )}
      >
        <svg className="size-8 text-text-muted/60 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
        <span>{hasError ? "Không thể tải video tiết học." : "Link video không hợp lệ hoặc chưa được cập nhật."}</span>
      </div>
    );
  }

  // If DevTools is open on a protected video, completely remove player from DOM
  if (isProtected && isDevToolsOpen) {
    return (
      <div
        className={cn(
          "relative overflow-hidden rounded-xl bg-black aspect-video flex flex-col items-center justify-center p-6 text-center select-none shadow-md",
          className,
        )}
      >
        <div className="size-12 rounded-full bg-warning/10 text-warning flex items-center justify-center mb-3">
          <svg className="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <p className="text-sm font-semibold text-white">
          Nội dung video được bảo vệ bản quyền
        </p>
        <p className="mt-1 text-xs text-white/70 max-w-sm">
          Vui lòng đóng công cụ kiểm tra (Developer Tools) và tải lại trang để tiếp tục xem video tiết học.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-3.5 inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-white/15 hover:bg-white/25 rounded-lg transition-colors cursor-pointer border border-white/20 active:scale-95"
        >
          <RotateCw className="size-3.5" />
          Tải lại trang
        </button>
      </div>
    );
  }

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const loadedPercent = loadedFraction * 100;

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onMouseMove={handleUserActivity}
      onTouchStart={handleUserActivity}
      onMouseLeave={() => isPlaying && setShowControls(false)}
      onContextMenu={handlePreventContextMenu}
      className={cn(
        "group relative overflow-hidden bg-black select-none outline-none transition-all flex items-center justify-center touch-manipulation",
        isFullscreen
          ? "!fixed !inset-0 !z-[99999999] !h-[100dvh] !h-[-webkit-fill-available] !w-screen !max-w-none !max-h-none !rounded-none !m-0 !p-0 !overscroll-none !touch-none"
          : cn("rounded-xl shadow-md", className),
        !showControls && isPlaying ? "cursor-none" : "cursor-default",
      )}
      style={{ userSelect: "none", WebkitUserSelect: "none" }}
      aria-label={title}
    >
      {/* Video Canvas */}
      <div
        className={cn(
          "relative flex items-center justify-center overflow-hidden w-full h-full",
          !isFullscreen && "aspect-video",
        )}
      >
        {/* Underlying YouTube iframe target */}
        <div
          className={cn(
            "yt-protected-media w-full h-full pointer-events-none [&_iframe]:!w-full [&_iframe]:!h-full [&_iframe]:!border-0 [&_iframe]:!pointer-events-none [&_iframe]:!block flex items-center justify-center",
            isFullscreen && "aspect-video max-w-[100vw] max-h-[100dvh] max-h-[-webkit-fill-available] mx-auto",
          )}
        >
          <div id={playerId} className="w-full h-full pointer-events-none" />
        </div>

        {/* Custom Poster Cover */}
        {!hasStarted && (
          <div
            role="button"
            tabIndex={0}
            aria-label="Phát video"
            onClick={togglePlayPause}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                togglePlayPause();
              }
            }}
            className="absolute inset-0 z-12 flex items-center justify-center bg-black cursor-pointer"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={posterUrl}
              alt={title}
              onError={() => setThumbnailError(true)}
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-black/30 transition-opacity hover:bg-black/15" />
            <div className="relative z-10 flex size-16 sm:size-20 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-md shadow-2xl transition-transform hover:scale-110 active:scale-95 border border-white/25">
              <Play className="size-8 sm:size-10 fill-white translate-x-0.5" />
            </div>
          </div>
        )}

        {/* Transparent Click Shield covering the full video canvas */}
        <div
          className="absolute inset-0 z-10 bg-transparent cursor-pointer"
          onClick={togglePlayPause}
          onDoubleClick={toggleFullscreen}
          onContextMenu={handlePreventContextMenu}
          title=""
          aria-hidden="true"
        />

        {/* Center Buffering Spinner */}
        {isBuffering && (
          <div className="pointer-events-none absolute inset-0 z-15 flex items-center justify-center bg-black/20 backdrop-blur-[2px]">
            <Loader2 className="size-12 text-primary animate-spin" />
          </div>
        )}

        {/* Center Play Button when paused */}
        {hasStarted && !isPlaying && isApiReady && !isBuffering && (
          <div
            role="button"
            tabIndex={0}
            aria-label="Tiếp tục phát"
            onClick={togglePlayPause}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                togglePlayPause();
              }
            }}
            className="absolute inset-0 z-15 flex items-center justify-center cursor-pointer"
          >
            <div className="flex size-16 sm:size-20 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-md shadow-2xl transition-transform hover:scale-110 active:scale-95 border border-white/20">
              <Play className="size-8 sm:size-10 fill-white translate-x-0.5" />
            </div>
          </div>
        )}
      </div>

      {/* Top Gradient Overlay */}
      <div
        className={cn(
          "pointer-events-none absolute top-0 left-0 right-0 z-30 transition-opacity duration-300 flex items-start justify-between bg-gradient-to-b from-black/80 via-black/40 to-transparent",
          isFullscreen
            ? "p-4 pt-[max(1rem,env(safe-area-inset-top))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]"
            : "p-3 sm:p-4",
          showControls || !isPlaying ? "opacity-100" : "opacity-0",
        )}
      >
        <p className="text-xs sm:text-sm font-medium text-white/90 truncate drop-shadow-md pr-12">
          {title}
        </p>

        {/* Floating Quick Fullscreen Toggle (Visible on mobile/tablets or during fullscreen) */}
        <button
          type="button"
          onClick={toggleFullscreen}
          className="pointer-events-auto flex size-8 items-center justify-center rounded-lg bg-black/60 text-white backdrop-blur-md transition-[background-color,transform] hover:bg-black/80 hover:scale-105 active:scale-95 border border-white/20 shadow-md"
          title={isFullscreen ? "Thoát toàn màn hình" : "Toàn màn hình"}
          aria-label={isFullscreen ? "Thoát toàn màn hình" : "Toàn màn hình"}
        >
          {isFullscreen ? (
            <Minimize className="size-4" />
          ) : (
            <Maximize className="size-4" />
          )}
        </button>
      </div>

      {/* Bottom Control Bar Overlay */}
      <div
        className={cn(
          "absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent z-30 transition-opacity duration-300",
          isFullscreen
            ? "p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]"
            : "p-3 sm:p-4",
          showControls || !isPlaying
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none",
        )}
      >
        {/* Progress Scrubber Bar */}
        <div
          ref={progressBarRef}
          role="slider"
          tabIndex={0}
          aria-label="Thanh tua video"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration) || 0}
          aria-valuenow={Math.round(currentTime) || 0}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight") {
              event.preventDefault();
              skipSeconds(5);
            } else if (event.key === "ArrowLeft") {
              event.preventDefault();
              skipSeconds(-5);
            }
          }}
          onClick={handleSeek}
          onMouseMove={handleProgressBarMouseMove}
          onMouseEnter={() => setIsHoveringProgressBar(true)}
          onMouseLeave={() => setIsHoveringProgressBar(false)}
          className="group/bar relative mb-3 h-2 sm:h-2.5 w-full cursor-pointer rounded-full bg-white/25 transition-[height] hover:h-3"
        >
          {/* Hover Time Tooltip */}
          {isHoveringProgressBar && hoverTime !== null && (
            <div
              className="absolute -top-7 -translate-x-1/2 rounded bg-black/80 px-2 py-0.5 text-[10px] font-semibold text-white pointer-events-none backdrop-blur-xs border border-white/10"
              style={{ left: `${hoverPosition}px` }}
            >
              {formatTime(hoverTime)}
            </div>
          )}

          {/* Buffer Bar */}
          <div
            className="absolute left-0 top-0 h-full rounded-full bg-white/30"
            style={{ width: `${Math.min(100, Math.max(0, loadedPercent))}%` }}
          />

          {/* Played Bar */}
          <div
            className="absolute left-0 top-0 h-full rounded-full bg-primary transition-[width] duration-75"
            style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
          >
            {/* Scrubber Knob */}
            <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 size-3 sm:size-3.5 rounded-full bg-white shadow-md scale-0 group-hover/bar:scale-100 transition-transform" />
          </div>
        </div>

        {/* Controls Rows */}
        <div className="flex items-center justify-between gap-2 text-white">
          {/* Left Controls: Play, Skips, Volume, Timer */}
          <div className="flex items-center gap-1.5 sm:gap-3">
            <button
              type="button"
              onClick={togglePlayPause}
              className="rounded-lg p-1.5 hover:bg-white/15 transition-colors focus:outline-none"
              title={isPlaying ? "Tạm dừng (k/space)" : "Phát (k/space)"}
              aria-label={isPlaying ? "Tạm dừng" : "Phát"}
            >
              {isPlaying ? (
                <Pause className="size-5 fill-white" />
              ) : (
                <Play className="size-5 fill-white translate-x-0.5" />
              )}
            </button>

            <button
              type="button"
              onClick={() => skipSeconds(-10)}
              className="hidden sm:flex rounded-lg p-1.5 hover:bg-white/15 transition-colors focus:outline-none"
              title="Lùi 10 giây (j/←)"
              aria-label="Lùi 10 giây"
            >
              <RotateCcw className="size-4" />
            </button>

            <button
              type="button"
              onClick={() => skipSeconds(10)}
              className="hidden sm:flex rounded-lg p-1.5 hover:bg-white/15 transition-colors focus:outline-none"
              title="Tua 10 giây (l/→)"
              aria-label="Tua 10 giây"
            >
              <RotateCw className="size-4" />
            </button>

            {/* Volume Control */}
            <div className="group/vol flex items-center gap-1">
              <button
                type="button"
                onClick={toggleMute}
                className="rounded-lg p-1.5 hover:bg-white/15 transition-colors focus:outline-none"
                title={isMuted || volume === 0 ? "Bật âm thanh (m)" : "Tắt âm thanh (m)"}
                aria-label={isMuted || volume === 0 ? "Bật âm thanh" : "Tắt âm thanh"}
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="size-5 text-white/80" />
                ) : volume < 50 ? (
                  <Volume1 className="size-5" />
                ) : (
                  <Volume2 className="size-5" />
                )}
              </button>

              <input
                type="range"
                min={0}
                max={100}
                value={isMuted ? 0 : volume}
                onChange={(e) => handleVolumeChange(Number(e.target.value))}
                className="w-0 sm:w-16 h-1.5 cursor-pointer accent-primary bg-white/30 rounded-lg appearance-none transition-[width] group-hover/vol:w-16 focus:w-16 focus:outline-none"
                aria-label="Âm lượng"
              />
            </div>

            {/* Current / Duration Timer */}
            <div className="ml-1 text-[11px] sm:text-xs font-medium text-white/90 tabular-nums select-none">
              <span>{formatTime(currentTime)}</span>
              <span className="mx-1 text-white/50">/</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Right Controls: Speed Settings, Fullscreen */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Speed Settings Popover */}
            <div className="relative" ref={settingsMenuRef}>
              <button
                type="button"
                onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                className={cn(
                  "rounded-lg p-1.5 transition-colors focus:outline-none flex items-center gap-1 text-xs font-semibold px-2",
                  isSettingsOpen || playbackSpeed !== 1
                    ? "bg-primary text-white"
                    : "hover:bg-white/15 text-white/90",
                )}
                title="Tốc độ phát"
                aria-label="Tốc độ phát"
              >
                <Gauge className="size-4" />
                <span className="tabular-nums text-[11px]">{playbackSpeed}x</span>
              </button>

              {isSettingsOpen && (
                <div className="absolute bottom-full right-0 mb-2 w-36 rounded-xl bg-black/90 p-1.5 shadow-2xl backdrop-blur-md border border-white/15 text-xs text-white z-50 animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-2 py-1 font-bold text-white/60 text-[10px] uppercase tracking-wider border-b border-white/10 mb-1 flex items-center gap-1">
                    <Settings className="size-3" />
                    Tốc độ phát
                  </div>
                  <div className="space-y-0.5">
                    {PLAYBACK_SPEEDS.map((speed) => (
                      <button
                        key={speed}
                        type="button"
                        onClick={() => changePlaybackSpeed(speed)}
                        className={cn(
                          "w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition-colors font-medium",
                          playbackSpeed === speed
                            ? "bg-primary text-white font-semibold"
                            : "hover:bg-white/15 text-white/80",
                        )}
                      >
                        <span>{speed === 1 ? "1.0x (Chuẩn)" : `${speed}x`}</span>
                        {playbackSpeed === speed && <Check className="size-3.5" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Fullscreen Toggle Button */}
            <button
              type="button"
              onClick={toggleFullscreen}
              className="rounded-lg p-1.5 hover:bg-white/15 transition-colors focus:outline-none"
              title={isFullscreen ? "Thoát toàn màn hình (f/Esc)" : "Toàn màn hình (f)"}
              aria-label={isFullscreen ? "Thoát toàn màn hình" : "Toàn màn hình"}
            >
              {isFullscreen ? (
                <Minimize className="size-5" />
              ) : (
                <Maximize className="size-5" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
