import clsx from "clsx";
import {
  AlertTriangle,
  Camera,
  CameraOff,
  CheckCircle2,
  Loader2,
  MapPin,
  Radio,
  Square,
  UploadCloud,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Button, Card, CardHeader, Field, PageHeader, ProgressBar } from "../components/ui";
import { useToast } from "../context/ToastContext";
import { api, uploadFile } from "../services/api";
import type { Job, Video } from "../types";

// MP4 first: Android Chrome and iOS Safari both record it, and it carries a proper
// index/duration. WebM (older Chrome) still works but is a streaming container with
// no frame index, so the backend reports its frame count as unknown.
const MIME_CANDIDATES = [
  "video/mp4;codecs=avc1.42E01E",
  "video/mp4",
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
];

const START_OPTIONS = {
  threshold: 0.92,
  temporal_gap: 10,
  conf_threshold: 0.25,
  max_layercam: 6,
  frame_stride: 2,
  image_size: 960,
};

type ItemState = "uploading" | "processing" | "done" | "failed";

interface CaptureItem {
  key: number;
  filename: string;
  state: ItemState;
  progress: number;
  jobId?: number;
  detections?: number;
  message?: string;
}

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function extensionFor(mime: string): string {
  return mime.includes("mp4") ? "mp4" : "webm";
}

function stamp(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(
    now.getMinutes(),
  )}${pad(now.getSeconds())}`;
}

export default function CapturePage() {
  const { notify } = useToast();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const continuousRef = useRef(false);
  const clipSecondsRef = useRef(30);
  const stopTimerRef = useRef<number | null>(null);
  const coordsRef = useRef<{ lat: number; lon: number } | null>(null);

  const [streaming, setStreaming] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [continuous, setContinuous] = useState(false);
  const [clipSeconds, setClipSeconds] = useState(30);
  const [label, setLabel] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lon: number; accuracy: number } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [items, setItems] = useState<CaptureItem[]>([]);

  useEffect(() => {
    continuousRef.current = continuous;
  }, [continuous]);

  useEffect(() => {
    clipSecondsRef.current = clipSeconds;
  }, [clipSeconds]);

  useEffect(() => {
    coordsRef.current = coords ? { lat: coords.lat, lon: coords.lon } : null;
  }, [coords]);

  const updateItem = useCallback((key: number, patch: Partial<CaptureItem>) => {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }, []);

  const pollJob = useCallback(
    async (key: number, jobId: number) => {
      for (let attempt = 0; attempt < 120; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        try {
          const job = await api.get<Job>(`/processing/${jobId}/status`);
          if (job.status === "completed") {
            updateItem(key, { state: "done", detections: job.detections_count });
            notify("success", `Clip processed — ${job.detections_count} detection(s)`);
            return;
          }
          if (job.status === "failed") {
            updateItem(key, { state: "failed", message: job.error_message ?? "Processing failed" });
            return;
          }
        } catch {
          /* keep polling through a short network drop */
        }
      }
      updateItem(key, { state: "failed", message: "Processing status timed out" });
    },
    [notify, updateItem],
  );

  const queueClip = useCallback(
    async (blob: Blob, mime: string) => {
      const key = Date.now();
      const filename = `field_capture_${stamp()}.${extensionFor(mime)}`;
      const file = new File([blob], filename, { type: mime || "video/webm" });
      setItems((current) => [
        { key, filename, state: "uploading", progress: 0 },
        ...current,
      ]);

      try {
        const fields: Record<string, string> = { location_label: label };
        const fix = coordsRef.current;
        if (fix) {
          fields.latitude = String(fix.lat);
          fields.longitude = String(fix.lon);
        }
        const video = await uploadFile<Video>("/videos/upload", file, fields, (progress) =>
          updateItem(key, { progress }),
        );
        updateItem(key, { state: "processing", progress: 100 });
        const job = await api.post<Job>(`/processing/start/${video.id}`, START_OPTIONS);
        updateItem(key, { jobId: job.id });
        void pollJob(key, job.id);
      } catch (err) {
        updateItem(key, {
          state: "failed",
          message: err instanceof Error ? err.message : "Upload failed",
        });
        notify("error", err instanceof Error ? err.message : "Upload failed");
      }
    },
    [label, notify, pollJob, updateItem],
  );

  const startRecording = useCallback(() => {
    const stream = streamRef.current;
    if (!stream || recorderRef.current) return;
    const mime = pickMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : "This browser cannot record video");
      return;
    }

    chunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const type = recorder.mimeType || mime || "video/webm";
      const blob = new Blob(chunksRef.current, { type });
      chunksRef.current = [];
      recorderRef.current = null;
      setRecording(false);
      setElapsed(0);
      if (stopTimerRef.current) {
        window.clearTimeout(stopTimerRef.current);
        stopTimerRef.current = null;
      }
      if (blob.size > 0) void queueClip(blob, type);
      if (continuousRef.current && streamRef.current) {
        window.setTimeout(() => startRecording(), 500);
      }
    };

    recorder.start(1000);
    recorderRef.current = recorder;
    setRecording(true);
    setElapsed(0);
    stopTimerRef.current = window.setTimeout(
      () => recorderRef.current?.stop(),
      clipSecondsRef.current * 1000,
    );
  }, [queueClip]);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        "This page needs a secure context (HTTPS or localhost) to open the camera. Serve the app over HTTPS to use it on a phone.",
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setStreaming(true);
    } catch (err) {
      setCameraError(
        err instanceof Error
          ? `${err.message}. Allow camera access for this site and make sure no other app is using the camera.`
          : "Could not open the camera",
      );
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (recorderRef.current) {
      continuousRef.current = false;
      setContinuous(false);
      recorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStreaming(false);
  }, []);

  const useMyLocation = useCallback(() => {
    setGpsError(null);
    if (!navigator.geolocation) {
      setGpsError("This browser has no geolocation support.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        setCoords({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          accuracy: position.coords.accuracy,
        }),
      (error) => setGpsError(error.message || "Location unavailable"),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }, []);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [recording]);

  useEffect(() => {
    return () => {
      if (stopTimerRef.current) window.clearTimeout(stopTimerRef.current);
      continuousRef.current = false;
      if (recorderRef.current) recorderRef.current.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Field capture"
        title="Phone camera capture"
        subtitle="Record road footage directly from the phone camera and send it straight into the AI pipeline — no laptop or copy step."
        actions={
          <Link to="/upload" className="text-xs font-semibold text-accent-600 hover:text-accent-700">
            Upload a file instead →
          </Link>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <Card className="overflow-hidden">
          <CardHeader
            title="1. Camera"
            subtitle="Rear camera, 720p preview · recording happens on the phone"
            action={
              streaming ? (
                <Badge tone="success">
                  <Radio size={11} /> live
                </Badge>
              ) : (
                <Badge tone="neutral">idle</Badge>
              )
            }
          />
          <div className="p-5">
            <div className="relative overflow-hidden rounded-2xl bg-navy-950">
              <video
                ref={videoRef}
                playsInline
                muted
                className={clsx("aspect-video w-full object-cover", !streaming && "opacity-40")}
              />
              {!streaming && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-300">
                  <Camera size={30} />
                  <p className="text-xs font-medium">Camera preview appears here</p>
                </div>
              )}
              {recording && (
                <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-red-600/90 px-3 py-1 text-[11px] font-semibold text-white">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
                  REC {elapsed}s / {clipSeconds}s
                </div>
              )}
            </div>

            {cameraError && (
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-xs text-red-700">
                <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                <span>{cameraError}</span>
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              {streaming ? (
                <Button variant="secondary" onClick={stopCamera} icon={<CameraOff size={15} />}>
                  Stop camera
                </Button>
              ) : (
                <Button onClick={startCamera} icon={<Camera size={15} />}>
                  Start camera
                </Button>
              )}
              {recording ? (
                <Button
                  variant="danger"
                  onClick={() => {
                    continuousRef.current = false;
                    setContinuous(false);
                    recorderRef.current?.stop();
                  }}
                  icon={<Square size={14} />}
                >
                  Stop &amp; upload
                </Button>
              ) : (
                <Button
                  onClick={startRecording}
                  disabled={!streaming}
                  icon={<UploadCloud size={15} />}
                >
                  Record {clipSeconds}s clip
                </Button>
              )}
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label="Clip length" hint="Shorter clips give a finer location per defect">
                <select
                  className="uv-input"
                  value={clipSeconds}
                  onChange={(event) => setClipSeconds(Number(event.target.value))}
                  disabled={recording}
                >
                  <option value={10}>10 seconds</option>
                  <option value={15}>15 seconds</option>
                  <option value={30}>30 seconds</option>
                  <option value={60}>60 seconds</option>
                </select>
              </Field>
              <Field label="Continuous recording" hint="Record back-to-back clips until you press stop">
                <button
                  type="button"
                  onClick={() => {
                    const next = !continuous;
                    setContinuous(next);
                    continuousRef.current = next;
                    if (next && !recording && streamRef.current) startRecording();
                  }}
                  className={clsx(
                    "flex w-full items-center justify-between rounded-lg border px-3 py-2 text-xs font-semibold transition",
                    continuous
                      ? "border-accent-300 bg-accent-50 text-accent-700"
                      : "border-slate-200 bg-white text-slate-600",
                  )}
                >
                  <span>{continuous ? "Recording continuously" : "Off — single clips"}</span>
                  <span
                    className={clsx(
                      "h-4 w-8 rounded-full p-0.5 transition",
                      continuous ? "bg-accent-500" : "bg-slate-300",
                    )}
                  >
                    <span
                      className={clsx(
                        "block h-3 w-3 rounded-full bg-white transition",
                        continuous && "translate-x-4",
                      )}
                    />
                  </span>
                </button>
              </Field>
            </div>

            <div className="mt-5 space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
              <Field label="Location label" hint="Recorded with every clip from this phone">
                <input
                  className="uv-input"
                  placeholder="e.g. Avinashi Road, Coimbatore — inspector A. Kumar"
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                />
              </Field>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" size="sm" onClick={useMyLocation} icon={<MapPin size={14} />}>
                  Use my location
                </Button>
                {coords ? (
                  <span className="text-[11px] font-medium text-emerald-700">
                    {coords.lat.toFixed(6)}, {coords.lon.toFixed(6)} · ±{Math.round(coords.accuracy)} m
                  </span>
                ) : (
                  <span className="text-[11px] text-slate-400">No coordinate yet — clips upload without GPS</span>
                )}
              </div>
              {gpsError && <p className="text-[11px] text-amber-700">{gpsError}</p>}
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="2. Queue"
            subtitle="Each clip uploads, then processing starts automatically"
            action={
              items.length ? (
                <Badge tone="accent">{items.filter((item) => item.state === "done").length}/{items.length} done</Badge>
              ) : null
            }
          />
          {items.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-sm font-semibold text-navy-900">No clips captured yet</p>
              <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-slate-500">
                Start the camera, press record, and the clip is uploaded to the backend and processed while you walk
                the road.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {items.map((item) => (
                <li key={item.key} className="px-5 py-3">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                      {item.state === "uploading" && <Loader2 size={14} className="animate-spin" />}
                      {item.state === "processing" && <Loader2 size={14} className="animate-spin" />}
                      {item.state === "done" && <CheckCircle2 size={14} className="text-emerald-600" />}
                      {item.state === "failed" && <XCircle size={14} className="text-red-600" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-navy-900">{item.filename}</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {item.state === "uploading" && `Uploading ${item.progress}%`}
                        {item.state === "processing" && `Processing job #${item.jobId ?? "…"}`}
                        {item.state === "done" && `${item.detections ?? 0} detection(s)`}
                        {item.state === "failed" && (item.message ?? "Failed")}
                      </p>
                      {item.state === "done" && item.jobId && (
                        <Link
                          to={`/detection?job=${item.jobId}`}
                          className="mt-1 inline-block text-[11px] font-medium text-accent-600 hover:text-accent-700"
                        >
                          View detections →
                        </Link>
                      )}
                    </div>
                  </div>
                  {item.state === "uploading" && (
                    <div className="mt-2 pl-10">
                      <ProgressBar value={item.progress} height="h-1.5" />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-slate-100 px-5 py-4 text-[11px] leading-relaxed text-slate-500">
            Clips are stored as WEBM (Android/Chrome) or MP4 (iOS/Safari) and processed with 960 px inference and a
            frame stride of 2. Results land in Keyframes, Detection and Defect Management like any other upload.
          </div>
        </Card>
      </div>
    </div>
  );
}
