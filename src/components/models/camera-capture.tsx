"use client";

import * as React from "react";
import { CameraIcon, CameraOffIcon, CheckIcon, LoaderCircleIcon, RotateCcwIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ApiClientError } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type Phase = "idle" | "starting" | "live" | "countdown" | "review" | "submitting" | "error";
type CameraErrorKind = "denied" | "not_found" | "busy" | "unsupported" | "unknown";

const CAMERA_ERRORS: Record<CameraErrorKind, string> = {
  denied:
    "Camera access is blocked. Allow the camera for this site in your browser settings (often the camera icon in the address bar), then try again.",
  not_found: "We couldn't find a camera on this device. Open this page on your phone or on a computer with a webcam.",
  busy: "Your camera is being used by another app. Close that app and try again.",
  unsupported:
    "This browser can't open the camera here. Use an up-to-date browser on a secure (https) page, or open this page on your phone.",
  unknown: "We couldn't start the camera. Please try again.",
};

function cameraErrorKind(err: unknown): CameraErrorKind {
  const name = err instanceof DOMException || err instanceof Error ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") return "denied";
  if (name === "NotFoundError" || name === "OverconstrainedError" || name === "DevicesNotFoundError") return "not_found";
  if (name === "NotReadableError" || name === "AbortError" || name === "TrackStartError") return "busy";
  return "unknown";
}

function message(err: unknown, fallback: string): string {
  if (err instanceof ApiClientError || err instanceof Error) return err.message || fallback;
  return fallback;
}

/** Frame aspect ratio (width / height) of the viewfinder and the captured photo. */
const ASPECT = 3 / 4;

export interface CameraCaptureProps {
  /** Called when the countdown starts (e.g. to fetch a capture token). Throwing cancels the capture. */
  onCountdownStart?: () => Promise<void>;
  /** Receives the captured JPEG once the user confirms it. Throw to show the error and offer a retake. */
  onConfirm: (photo: Blob) => Promise<void>;
  /** Seconds of countdown before the shot (default 3). */
  countdownFrom?: number;
  /** Longest side of the captured photo in pixels (default 1600). */
  maxSide?: number;
  confirmLabel?: string;
  className?: string;
}

/**
 * Live front-camera capture with a face-centering oval, a 3-2-1 countdown and retake. There is
 * deliberately no file-upload fallback: the consent selfie must be taken live.
 */
export function CameraCapture({
  onCountdownStart,
  onConfirm,
  countdownFrom = 3,
  maxSide = 1600,
  confirmLabel = "Use this selfie",
  className,
}: CameraCaptureProps) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const maskId = React.useId();
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [cameraError, setCameraError] = React.useState<CameraErrorKind | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [count, setCount] = React.useState(countdownFrom);
  const [photo, setPhoto] = React.useState<{ blob: Blob; url: string } | null>(null);
  const [announcement, setAnnouncement] = React.useState("");

  const stopCamera = React.useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  // Release the camera and timers when the component goes away.
  React.useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      stopCamera();
    },
    [stopCamera],
  );
  React.useEffect(() => {
    if (!photo) return;
    return () => URL.revokeObjectURL(photo.url);
  }, [photo]);

  const startCamera = React.useCallback(async () => {
    setError(null);
    setCameraError(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setCameraError("unsupported");
      setPhase("error");
      return;
    }
    setPhase("starting");
    setAnnouncement("Starting the camera…");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 1280 } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => undefined);
      }
      setPhase("live");
      setAnnouncement("Camera is on. Center your face in the oval.");
    } catch (err) {
      stopCamera();
      setCameraError(cameraErrorKind(err));
      setPhase("error");
    }
  }, [stopCamera]);

  const grabFrame = React.useCallback(async (): Promise<Blob | null> => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return null;
    // Same 3:4 center crop the viewfinder shows (object-cover), in true (un-mirrored) orientation.
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const cropW = vw / vh > ASPECT ? vh * ASPECT : vw;
    const cropH = vw / vh > ASPECT ? vh : vw / ASPECT;
    const scale = Math.min(1, maxSide / Math.max(cropW, cropH));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(cropW * scale);
    canvas.height = Math.round(cropH * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, (vw - cropW) / 2, (vh - cropH) / 2, cropW, cropH, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92));
  }, [maxSide]);

  const shoot = React.useCallback(async () => {
    const blob = await grabFrame();
    if (!blob) {
      setError("We couldn't take the photo. Please try again.");
      setPhase("live");
      return;
    }
    stopCamera();
    setPhoto({ blob, url: URL.createObjectURL(blob) });
    setPhase("review");
    setAnnouncement("Selfie taken. Check it, then use it or retake.");
  }, [grabFrame, stopCamera]);

  const startCountdown = React.useCallback(async () => {
    setError(null);
    setPhase("countdown");
    setCount(countdownFrom);
    try {
      await onCountdownStart?.();
    } catch (err) {
      setError(message(err, "Something went wrong. Please try again."));
      setPhase("live");
      return;
    }
    const tick = (n: number) => {
      if (n <= 0) {
        void shoot();
        return;
      }
      setCount(n);
      setAnnouncement(String(n));
      timerRef.current = setTimeout(() => tick(n - 1), 1000);
    };
    tick(countdownFrom);
  }, [countdownFrom, onCountdownStart, shoot]);

  const retake = () => {
    setPhoto(null);
    void startCamera();
  };

  const confirm = async () => {
    if (!photo) return;
    setPhase("submitting");
    setError(null);
    setAnnouncement("Checking your selfie…");
    try {
      await onConfirm(photo.blob);
      setAnnouncement("Selfie verified.");
    } catch (err) {
      setError(message(err, "We couldn't check your selfie. Please retake it."));
      setPhase("review");
    }
  };

  const cameraVisible = phase === "starting" || phase === "live" || phase === "countdown";

  return (
    <div className={cn("flex flex-col items-center gap-4", className)}>
      <div className="relative aspect-[3/4] w-full max-w-sm overflow-hidden rounded-2xl border bg-muted shadow-sm">
        <video
          ref={videoRef}
          playsInline
          muted
          aria-label="Camera preview"
          className={cn("size-full -scale-x-100 object-cover", !cameraVisible && "hidden")}
        />
        {photo && (phase === "review" || phase === "submitting") && (
          // eslint-disable-next-line @next/next/no-img-element -- local object URL preview of the capture
          <img src={photo.url} alt="Your captured selfie" className="size-full object-cover" />
        )}

        {(cameraVisible || phase === "review" || phase === "submitting") && (
          <svg aria-hidden="true" viewBox="0 0 300 400" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 size-full">
            <defs>
              <mask id={maskId}>
                <rect width="300" height="400" fill="white" />
                <ellipse cx="150" cy="185" rx="96" ry="128" fill="black" />
              </mask>
            </defs>
            <rect width="300" height="400" fill="black" fillOpacity={phase === "review" || phase === "submitting" ? 0.25 : 0.45} mask={`url(#${maskId})`} />
            <ellipse
              cx="150"
              cy="185"
              rx="96"
              ry="128"
              fill="none"
              stroke="white"
              strokeWidth="2.5"
              strokeDasharray={phase === "live" ? "10 8" : undefined}
              className={cn(phase === "live" && "motion-safe:animate-pulse")}
            />
          </svg>
        )}

        {phase === "idle" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <span aria-hidden="true" className="flex size-14 items-center justify-center rounded-full bg-brand-soft text-brand-soft-foreground">
              <CameraIcon className="size-7" />
            </span>
            <p className="text-sm text-muted-foreground">Your browser will ask to use the camera.</p>
          </div>
        )}
        {phase === "starting" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <LoaderCircleIcon aria-hidden="true" className="size-8 animate-spin text-white drop-shadow" />
          </div>
        )}
        {phase === "live" && (
          <p className="absolute inset-x-0 bottom-3 mx-auto w-fit rounded-full bg-black/55 px-3 py-1 text-xs font-medium text-white">
            Center your face in the oval
          </p>
        )}
        {phase === "countdown" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span
              key={count}
              className="font-display text-8xl text-white drop-shadow-lg motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:fade-in"
            >
              {count}
            </span>
          </div>
        )}
        {phase === "submitting" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/35 text-white">
            <LoaderCircleIcon aria-hidden="true" className="size-8 animate-spin" />
            <span className="text-sm font-medium">Checking your selfie…</span>
          </div>
        )}
        {phase === "error" && cameraError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <span aria-hidden="true" className="flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <CameraOffIcon className="size-7" />
            </span>
            <p className="text-sm">{CAMERA_ERRORS[cameraError]}</p>
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="max-w-sm text-center text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex w-full max-w-sm flex-col gap-2 sm:flex-row sm:justify-center">
        {(phase === "idle" || phase === "error") && (
          <Button type="button" variant="brand" size="lg" className="w-full sm:w-auto" onClick={() => void startCamera()}>
            <CameraIcon />
            {phase === "error" ? "Try again" : "Open camera"}
          </Button>
        )}
        {(phase === "live" || phase === "starting" || phase === "countdown") && (
          <Button
            type="button"
            variant="brand"
            size="lg"
            className="w-full sm:w-auto"
            disabled={phase !== "live"}
            onClick={() => void startCountdown()}
          >
            <CameraIcon />
            {phase === "countdown" ? "Hold still…" : "Take selfie"}
          </Button>
        )}
        {(phase === "review" || phase === "submitting") && (
          <>
            <Button type="button" variant="outline" size="lg" className="w-full sm:w-auto" disabled={phase === "submitting"} onClick={retake}>
              <RotateCcwIcon />
              Retake
            </Button>
            <Button
              type="button"
              variant="brand"
              size="lg"
              className="w-full sm:w-auto"
              disabled={phase === "submitting"}
              aria-busy={phase === "submitting"}
              onClick={() => void confirm()}
            >
              {phase === "submitting" ? <LoaderCircleIcon className="animate-spin" /> : <CheckIcon />}
              {confirmLabel}
            </Button>
          </>
        )}
      </div>

      <p className="sr-only" aria-live="assertive" role="status">
        {announcement}
      </p>
    </div>
  );
}
