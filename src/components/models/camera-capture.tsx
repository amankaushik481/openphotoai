"use client";

import * as React from "react";
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  CameraIcon,
  CameraOffIcon,
  CheckIcon,
  LoaderCircleIcon,
  RotateCcwIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ApiClientError } from "@/lib/api-client";
import { LIVENESS_PROMPTS, type LivenessStep } from "@/lib/liveness";
import { cn } from "@/lib/utils";

type Phase = "idle" | "starting" | "live" | "countdown" | "step" | "review" | "submitting" | "error";

/**
 * Arrow shown for each head-pose step. The preview is mirrored, so the user's own left is the
 * screen's left: the arrow points the way the face should move on screen.
 */
const STEP_ICONS: Record<LivenessStep, typeof ArrowLeftIcon> = {
  turn_left: ArrowLeftIcon,
  turn_right: ArrowRightIcon,
  look_up: ArrowUpIcon,
  look_down: ArrowDownIcon,
};
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
  /**
   * Called when the countdown starts (e.g. to fetch a capture token). May return head-pose `steps`
   * (active liveness): after the frontal shot, the user is guided through each step and one frame
   * is captured per step. Throwing cancels the capture.
   */
  onCountdownStart?: () => Promise<{ steps?: readonly LivenessStep[] } | void>;
  /**
   * Receives the frontal JPEG (+ one frame per liveness step, in order) once the user confirms it.
   * Throw to show the error and offer a retake.
   */
  onConfirm: (photo: Blob, livenessFrames: Blob[]) => Promise<void>;
  /** Seconds of countdown before the shot (default 3). */
  countdownFrom?: number;
  /** Seconds the user gets to follow each head-pose step before its frame is captured (default 3). */
  stepCountdownFrom?: number;
  /** Longest side of the captured photo in pixels (default 1600). */
  maxSide?: number;
  confirmLabel?: string;
  className?: string;
}

/**
 * Live front-camera capture with a face-centering oval, a 3-2-1 countdown and retake. With liveness
 * steps (from `onCountdownStart`), the frontal shot is followed by a guided head-movement check: one
 * prompt + countdown per step, one frame captured per step. There is deliberately no file-upload
 * fallback and nothing is simulated here: the consent selfie must be taken live.
 */
export function CameraCapture({
  onCountdownStart,
  onConfirm,
  countdownFrom = 3,
  stepCountdownFrom = 3,
  maxSide = 1600,
  confirmLabel = "Use this selfie",
  className,
}: CameraCaptureProps) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Liveness steps of the current capture, and the frames captured for them so far. */
  const stepsRef = React.useRef<readonly LivenessStep[]>([]);
  const framesRef = React.useRef<Blob[]>([]);
  const frontalRef = React.useRef<Blob | null>(null);
  const [stepIndex, setStepIndex] = React.useState(0);
  const [steps, setSteps] = React.useState<readonly LivenessStep[]>([]);
  const maskId = React.useId();
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [cameraError, setCameraError] = React.useState<CameraErrorKind | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [count, setCount] = React.useState(countdownFrom);
  const [photo, setPhoto] = React.useState<{ blob: Blob; url: string } | null>(null);
  const [announcement, setAnnouncement] = React.useState("");
  const controlsRef = React.useRef<HTMLDivElement>(null);
  const primaryRef = React.useRef<HTMLButtonElement>(null);

  // Each phase swaps the buttons (Open camera → Take selfie → Retake / Use selfie). Once the user has
  // used them, keep keyboard and switch users on the current primary action instead of <body>.
  const interacted = React.useRef(false);
  React.useEffect(() => {
    if (!interacted.current) return;
    const active = document.activeElement;
    const lost = !active || active === document.body || Boolean(controlsRef.current?.contains(active));
    if (lost && primaryRef.current && !primaryRef.current.disabled) primaryRef.current.focus();
  }, [phase]);

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

  const failCapture = React.useCallback(() => {
    setError("We couldn't take the photo. Please try again.");
    setPhase("live");
  }, []);

  /** All frames captured: show the frontal selfie for review. */
  const finishCapture = React.useCallback(() => {
    const frontal = frontalRef.current;
    if (!frontal) return failCapture();
    stopCamera();
    setPhoto({ blob: frontal, url: URL.createObjectURL(frontal) });
    setPhase("review");
    setAnnouncement("Selfie taken. Check it, then use it or retake.");
  }, [failCapture, stopCamera]);

  /** Count down `from` seconds (announcing each second), then run `done`. */
  const countDown = React.useCallback((from: number, done: () => void, prefix = "") => {
    const tick = (n: number) => {
      if (n <= 0) return done();
      setCount(n);
      setAnnouncement(n === from && prefix ? `${prefix}. ${n}` : String(n));
      timerRef.current = setTimeout(() => tick(n - 1), 1000);
    };
    tick(from);
  }, []);

  /** Guide the user through liveness step `index`, then capture its frame. */
  const runStep = React.useCallback(
    (index: number) => {
      const step = stepsRef.current[index];
      if (!step) return finishCapture();
      setStepIndex(index);
      setPhase("step");
      setCount(stepCountdownFrom);
      countDown(
        stepCountdownFrom,
        () => {
          void grabFrame().then((blob) => {
            if (!blob) return failCapture();
            framesRef.current = [...framesRef.current, blob];
            runStep(index + 1);
          });
        },
        LIVENESS_PROMPTS[step],
      );
    },
    [countDown, failCapture, finishCapture, grabFrame, stepCountdownFrom],
  );

  const shoot = React.useCallback(async () => {
    const blob = await grabFrame();
    if (!blob) return failCapture();
    frontalRef.current = blob;
    runStep(0);
  }, [failCapture, grabFrame, runStep]);

  const startCountdown = React.useCallback(async () => {
    setError(null);
    setPhase("countdown");
    setCount(countdownFrom);
    frontalRef.current = null;
    framesRef.current = [];
    stepsRef.current = [];
    try {
      const started = await onCountdownStart?.();
      stepsRef.current = started?.steps ?? [];
      setSteps(stepsRef.current);
    } catch (err) {
      setError(message(err, "Something went wrong. Please try again."));
      setPhase("live");
      return;
    }
    countDown(countdownFrom, () => void shoot(), stepsRef.current.length > 0 ? "Look straight at the camera" : "");
  }, [countDown, countdownFrom, onCountdownStart, shoot]);

  const retake = () => {
    setPhoto(null);
    frontalRef.current = null;
    framesRef.current = [];
    void startCamera();
  };

  const confirm = async () => {
    if (!photo) return;
    setPhase("submitting");
    setError(null);
    setAnnouncement("Checking your selfie…");
    try {
      await onConfirm(photo.blob, framesRef.current);
      setAnnouncement("Selfie verified.");
    } catch (err) {
      setError(message(err, "We couldn't check your selfie. Please retake it."));
      setPhase("review");
    }
  };

  const cameraVisible = phase === "starting" || phase === "live" || phase === "countdown" || phase === "step";
  const currentStep = phase === "step" ? steps[stepIndex] : undefined;
  const StepIcon = currentStep ? STEP_ICONS[currentStep] : null;

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
        {currentStep && StepIcon && (
          <div
            data-liveness-step={currentStep}
            data-liveness-step-index={stepIndex}
            className="absolute inset-0 flex flex-col items-center justify-between p-4 text-center text-white"
          >
            <p className="rounded-full bg-black/60 px-3 py-1 text-xs font-medium">
              Head movement check · step {stepIndex + 1} of {steps.length}
            </p>
            <span key={count} className="font-display text-7xl drop-shadow-lg motion-safe:animate-in motion-safe:fade-in">
              {count}
            </span>
            <p className="flex items-center gap-2 rounded-xl bg-black/65 px-4 py-2 text-base font-semibold">
              <StepIcon aria-hidden="true" className="size-5 shrink-0" />
              {LIVENESS_PROMPTS[currentStep]}
            </p>
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

      <div
        ref={controlsRef}
        onClickCapture={() => {
          interacted.current = true;
        }}
        className="flex w-full max-w-sm flex-col gap-2 sm:flex-row sm:justify-center"
      >
        {(phase === "idle" || phase === "error") && (
          <Button
            ref={primaryRef}
            type="button"
            variant="brand"
            size="lg"
            className="w-full sm:w-auto"
            onClick={() => void startCamera()}
          >
            <CameraIcon />
            {phase === "error" ? "Try again" : "Open camera"}
          </Button>
        )}
        {(phase === "live" || phase === "starting" || phase === "countdown" || phase === "step") && (
          // aria-disabled (not `disabled`) while counting down, so focus stays on the button.
          <Button
            ref={primaryRef}
            type="button"
            variant="brand"
            size="lg"
            className="w-full aria-disabled:opacity-50 sm:w-auto"
            aria-disabled={phase !== "live" || undefined}
            onClick={() => {
              if (phase === "live") void startCountdown();
            }}
          >
            <CameraIcon />
            {phase === "countdown" ? "Hold still…" : phase === "step" ? "Follow the prompt…" : "Take selfie"}
          </Button>
        )}
        {(phase === "review" || phase === "submitting") && (
          <>
            <Button type="button" variant="outline" size="lg" className="w-full sm:w-auto" disabled={phase === "submitting"} onClick={retake}>
              <RotateCcwIcon />
              Retake
            </Button>
            <Button
              ref={primaryRef}
              type="button"
              variant="brand"
              size="lg"
              className="w-full aria-disabled:opacity-50 sm:w-auto"
              aria-disabled={phase === "submitting" || undefined}
              aria-busy={phase === "submitting"}
              onClick={() => {
                if (phase === "review") void confirm();
              }}
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
