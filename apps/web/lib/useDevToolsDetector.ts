"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { DevtoolsDetector, checkers } from "devtools-detector";

interface UseDevToolsDetectorOptions {
  enabled?: boolean;
  pollingInterval?: number;
}

/**
 * Accurately detects mobile and tablet devices (iOS, Android, iPadOS).
 * Mobile/tablet devices do not have native on-screen dockable developer tools.
 */
export function isMobileOrTabletDevice(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }
  const ua = navigator.userAgent || "";

  // iOS (iPhone, iPad, iPod, or iPadOS where navigator.platform is MacIntel with touch)
  const isIOS =
    /iPhone|iPad|iPod/i.test(ua) ||
    (navigator.platform === "MacIntel" && (navigator.maxTouchPoints || 0) > 1);

  // Android phone or tablet
  const isAndroid = /Android/i.test(ua);

  // Other mobile user agents
  const isOtherMobile = /webOS|BlackBerry|IEMobile|Opera Mini|Mobile|Tablet/i.test(ua);

  return isIOS || isAndroid || isOtherMobile;
}

/**
 * Synchronously blanks out and completely wipes all video iframes from the DOM.
 * Sets src="about:blank", removes attributes, detaches iframe elements, and empties container targets.
 */
export function nukeProtectedMedia(): void {
  if (typeof document === "undefined") return;
  try {
    const iframes = document.querySelectorAll<HTMLIFrameElement>("iframe");
    iframes.forEach((iframe) => {
      try {
        if (
          iframe.src &&
          (iframe.src.includes("youtube") ||
            iframe.src.includes("youtu.be") ||
            !iframe.src.includes("about:blank"))
        ) {
          iframe.src = "about:blank";
          iframe.removeAttribute("src");
          iframe.style.display = "none";
          iframe.style.visibility = "hidden";
          iframe.remove();
        }
      } catch {
        // ignore
      }
    });

    const protectedContainers =
      document.querySelectorAll<HTMLElement>(".yt-protected-media");
    protectedContainers.forEach((container) => {
      try {
        container.innerHTML = "";
        container.style.display = "none";
      } catch {
        // ignore
      }
    });
  } catch {
    // ignore
  }
}

/**
 * Creates an inline Web Worker that performs periodic anti-debugging checks in a background thread.
 * When DevTools is opened (docked or undocked), the worker thread pauses at `debugger;`,
 * while the MAIN THREAD continues running and instantly wipes the video iframe from the DOM!
 */
function createDevToolsWorker(): Worker | null {
  if (
    typeof window === "undefined" ||
    typeof Worker === "undefined" ||
    typeof Blob === "undefined"
  ) {
    return null;
  }
  try {
    const workerScript = `
      self.onmessage = function(e) {
        if (!e.data) return;
        if (e.data.type === "init") {
          self.postMessage({ type: "ready" });
          return;
        }
        if (e.data.type === "ping") {
          var t0 = performance.now();
          try {
            (function(){}).constructor("debugger")();
          } catch (err) {}
          var duration = performance.now() - t0;
          self.postMessage({
            type: "pong",
            id: e.data.id,
            duration: duration,
          });
        }
      };
    `;
    const blob = new Blob([workerScript], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);
    URL.revokeObjectURL(url);
    return worker;
  } catch {
    return null;
  }
}

/**
 * Desktop Window Geometry Check (catches docked DevTools on right/bottom/left).
 */
function checkDesktopGeometry(): boolean {
  if (isMobileOrTabletDevice()) return false;

  if (
    window.visualViewport &&
    Math.abs(window.visualViewport.scale - 1) > 0.05
  ) {
    return false;
  }

  const widthDiff = window.outerWidth - window.innerWidth;
  const heightDiff = window.outerHeight - window.innerHeight;

  // Docked DevTools panels are typically >= 160px in width/height
  return widthDiff > 160 || heightDiff > 160;
}

export function useDevToolsDetector(options: UseDevToolsDetectorOptions = {}) {
  const { enabled = true, pollingInterval = 250 } = options;
  const [isOpen, setIsOpen] = useState(false);
  const isOpenRef = useRef(false);
  const workerRef = useRef<Worker | null>(null);

  const lockBlocked = useCallback(() => {
    if (isOpenRef.current) return;
    isOpenRef.current = true;
    // Synchronously wipe iframe and clean up DOM immediately
    nukeProtectedMedia();
    setIsOpen(true);
    if (workerRef.current) {
      try {
        workerRef.current.terminate();
      } catch {
        // ignore
      }
      workerRef.current = null;
    }
  }, []);

  useEffect(() => {
    // Disable DevTools detection on mobile & tablet devices to prevent false positives
    if (!enabled || typeof window === "undefined" || isMobileOrTabletDevice()) {
      return;
    }

    // If already locked as blocked, keep it blocked and wipe DOM
    if (isOpenRef.current) {
      nukeProtectedMedia();
      return;
    }

    // 1. Standard DevtoolsDetector instance (using non-blocking checkers on the main thread)
    const detector = new DevtoolsDetector({
      checkers: [
        checkers.elementIdChecker,
        checkers.devtoolsFormatterChecker,
        checkers.erudaChecker,
      ],
    });

    // 2. Web Worker for background anti-debugging
    // The worker hits `debugger;` in background thread while the main thread stays 100% active to nuke the DOM!
    const worker = createDevToolsWorker();
    workerRef.current = worker;
    let isWorkerReady = false;
    let checkSeq = 0;
    let workerTimeout: NodeJS.Timeout | null = null;

    if (worker) {
      worker.onmessage = (event: MessageEvent) => {
        if (isOpenRef.current) return;
        const data = event.data;
        if (!data) return;

        if (data.type === "ready") {
          isWorkerReady = true;
          return;
        }

        if (data.type === "pong") {
          if (workerTimeout) {
            clearTimeout(workerTimeout);
            workerTimeout = null;
          }

          // If worker duration was delayed (> 50ms), DevTools was open -> lock immediately!
          if (typeof data.duration === "number" && data.duration > 50) {
            lockBlocked();
            detector.stop();
          }
        }
      };

      // Send initial warmup to confirm worker is ready before enabling detection
      worker.postMessage({ type: "init" });
    }

    const pingWorker = () => {
      if (
        isOpenRef.current ||
        !workerRef.current ||
        !isWorkerReady ||
        isMobileOrTabletDevice()
      ) {
        return;
      }

      checkSeq += 1;
      const currentId = checkSeq;

      if (workerTimeout) {
        clearTimeout(workerTimeout);
      }

      // If worker is paused at `debugger;` in Undocked DevTools, it cannot reply.
      // The main thread (active and running) will fire this timeout in 120ms
      // and immediately wipe out the video iframe from the DOM and permanently lock!
      workerTimeout = setTimeout(() => {
        if (checkSeq === currentId && !isOpenRef.current) {
          lockBlocked();
          detector.stop();
        }
      }, 120);

      try {
        workerRef.current.postMessage({ type: "ping", id: currentId });
      } catch {
        // ignore
      }
    };

    // 3. Comprehensive check combining geometry (docked), detector, and worker heartbeat
    const checkStatus = () => {
      if (isOpenRef.current || isMobileOrTabletDevice()) return;

      const isDocked = checkDesktopGeometry();
      if (isDocked || detector.isOpen) {
        lockBlocked();
        detector.stop();
      } else {
        pingWorker();
      }
    };

    // 4. DevtoolsDetector listener (triggers when DevTools is detected)
    const handleDetectorChange = (status: boolean) => {
      if (isOpenRef.current) return;
      if (status) {
        lockBlocked();
        detector.stop();
      } else {
        checkStatus();
      }
    };

    // 5. Keyboard shortcut trap (catches F12, Ctrl/Cmd+Shift+I, etc. instantly on desktop)
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isOpenRef.current) return;
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;
      const isShift = e.shiftKey;
      const isAlt = e.altKey;
      const key = e.key.toLowerCase();

      if (
        e.key === "F12" ||
        e.keyCode === 123 ||
        (isCmdOrCtrl && isShift && ["i", "j", "c"].includes(key)) ||
        (isCmdOrCtrl && isAlt && ["i", "j", "c", "u"].includes(key)) ||
        (isCmdOrCtrl && ["u", "s"].includes(key))
      ) {
        e.preventDefault();
        e.stopPropagation();
        lockBlocked();
        detector.stop();
      }
    };

    // 6. Window blur / focus (when user switches to undocked DevTools window)
    const handleWindowBlur = () => {
      if (!isOpenRef.current) {
        checkStatus();
      }
    };

    detector.setDetectDelay(pollingInterval);
    detector.addListener(handleDetectorChange);
    detector.launch();

    window.addEventListener("resize", checkStatus);
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    window.addEventListener("blur", handleWindowBlur);

    const interval = setInterval(checkStatus, pollingInterval);
    checkStatus();

    return () => {
      detector.removeListener(handleDetectorChange);
      detector.stop();
      window.removeEventListener("resize", checkStatus);
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
      window.removeEventListener("blur", handleWindowBlur);
      clearInterval(interval);
      if (workerTimeout) {
        clearTimeout(workerTimeout);
      }
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, [enabled, pollingInterval, lockBlocked]);

  return isOpen;
}
